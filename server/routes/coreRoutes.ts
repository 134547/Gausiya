import { Router } from 'express';
import {
  requireSupabaseAdmin,
  resolveStorageUrl,
  resolveStorageUrlsInRows,
} from '../supabase.ts';
import {
  AuthRequest,
  canAccessStudent,
  getParentIdForUser,
  getParentStudentIds,
  getStudentIdForUser,
  getTeacherAssignedClassIds,
  getTeacherIdForUser,
  logActivity,
  notifyRoles,
  requireAuth,
  requireRole,
} from '../auth.ts';
import { getAdmissionsOpen, getChatsOpen, getResultsOpen, normalizeStorageRef, sanitizeOrTerm, setAdmissionsOpen, setChatsOpen, setResultsOpen } from './publicRoutes.ts';
import {
  ensureStudentRole,
  generateNextStudentCodes,
  safeStudentInsert,
  safeTableUpdate,
} from '../studentProvisioning.ts';

const router = Router();

// ==================== SETTINGS & ACADEMIC SESSIONS ====================
router.get('/settings', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const [{ data: settings }, { data: sessions }, admissionsOpen, resultsOpen, chatsOpen] = await Promise.all([
    admin.from('madrasa_settings').select('*').eq('id', 1).maybeSingle(),
    admin.from('academic_sessions').select('*').order('start_date', { ascending: false }),
    getAdmissionsOpen(admin),
    getResultsOpen(admin),
    getChatsOpen(admin),
  ]);
  if (settings) {
    settings.logo_url = await resolveStorageUrl(settings.logo_url);
    if (typeof settings.grading_rules_json !== 'string') {
      settings.grading_rules_json = JSON.stringify(settings.grading_rules_json || []);
    }
    settings.admissions_open = admissionsOpen;
    settings.results_open = resultsOpen;
    settings.chats_open = chatsOpen;
  }
  return res.json({ settings, sessions: sessions || [] });
});

router.put('/settings', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const {
      name,
      name_urdu,
      address,
      address_urdu,
      phone,
      email,
      website,
      logo_url,
      grading_rules_json,
      active_session_id,
      admissions_open,
      results_open,
      chats_open,
    } = req.body;

    let parsedGrading = grading_rules_json;
    if (typeof grading_rules_json === 'string') {
      try {
        parsedGrading = JSON.parse(grading_rules_json);
      } catch {
        parsedGrading = undefined;
      }
    }

    const payload: Record<string, any> = {};
    if (name !== undefined) payload.name = name;
    if (name_urdu !== undefined) payload.name_urdu = name_urdu;
    if (address !== undefined) payload.address = address;
    if (address_urdu !== undefined) payload.address_urdu = address_urdu;
    if (phone !== undefined) payload.phone = phone;
    if (email !== undefined) payload.email = email;
    if (website !== undefined) payload.website = website;
    if (logo_url !== undefined) payload.logo_url = normalizeStorageRef(logo_url);
    if (parsedGrading !== undefined) payload.grading_rules_json = parsedGrading;
    if (active_session_id !== undefined) payload.active_session_id = active_session_id || null;

    if (Object.keys(payload).length > 0) {
      const { error } = await admin.from('madrasa_settings').update(payload).eq('id', 1);
      if (error) return res.status(400).json({ error: error.message });
    }

    if (admissions_open !== undefined) {
      await setAdmissionsOpen(admin, Boolean(admissions_open));
    }
    if (results_open !== undefined) {
      await setResultsOpen(admin, Boolean(results_open));
    }
    if (chats_open !== undefined) {
      await setChatsOpen(admin, Boolean(chats_open));
    }

    if (active_session_id) {
      await admin.from('academic_sessions').update({ is_active: false }).neq('id', active_session_id);
      await admin.from('academic_sessions').update({ is_active: true }).eq('id', active_session_id);
    }

    await logActivity(req.user!, 'SETTINGS_UPDATED', 'super_admin', '1', 'Updated institutional settings and grading rules', req.ip);
    const [{ data: settings }, latestAdmissionsOpen, latestResultsOpen, latestChatsOpen] = await Promise.all([
      admin.from('madrasa_settings').select('*').eq('id', 1).maybeSingle(),
      getAdmissionsOpen(admin),
      getResultsOpen(admin),
      getChatsOpen(admin),
    ]);
    if (settings) {
      settings.logo_url = await resolveStorageUrl(settings.logo_url);
      if (typeof settings.grading_rules_json !== 'string') {
        settings.grading_rules_json = JSON.stringify(settings.grading_rules_json || []);
      }
      settings.admissions_open = latestAdmissionsOpen;
      settings.results_open = latestResultsOpen;
      settings.chats_open = latestChatsOpen;
    }
    return res.json({ settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.post('/sessions', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { name, start_date, end_date, is_active } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Session name, start date, and end date required' });
    }
    if (is_active) {
      await admin.from('academic_sessions').update({ is_active: false }).neq('name', '');
    }
    const { data: created, error } = await admin
      .from('academic_sessions')
      .insert({ name: name.trim(), start_date, end_date, is_active: Boolean(is_active) })
      .select('id')
      .single();
    if (error || !created) return res.status(400).json({ error: error?.message || 'Could not create session' });

    if (is_active) {
      await admin.from('madrasa_settings').update({ active_session_id: created.id }).eq('id', 1);
    }
    await logActivity(req.user!, 'SESSION_CREATED', 'super_admin', created.id, `Created academic session ${name}`, req.ip);
    return res.json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Could not create session' });
  }
});

// ==================== LOGIN DETAILS & USER MANAGEMENT ====================
router.get('/users', requireAuth, requireRole('super_admin'), async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;

  const [{ data: profiles }, { data: rolesRaw }, { data: permissions }, { data: rolePermissions }] = await Promise.all([
    admin
      .from('profiles')
      .select(
        'id, user_code, username, email, mobile, full_name, role_id, status, linked_type, linked_id, father_name, dob, gender, address, village, district, state, pin_code, photo_url, last_login, created_at, roles(name, slug)'
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    admin.from('roles').select('*').order('name', { ascending: true }),
    admin.from('permissions').select('*').order('module', { ascending: true }),
    admin.from('role_permissions').select('role_id, permission_id'),
  ]);

  let roles = rolesRaw || [];
  if (!roles.some((r: any) => r.slug === 'public')) {
    const { data: pubRole } = await admin
      .from('roles')
      .upsert(
        {
          name: 'Public',
          slug: 'public',
          description: 'Public account access to feed, notices, programs, committee, and contact information',
        },
        { onConflict: 'slug' }
      )
      .select('*')
      .maybeSingle();
    if (pubRole) roles = [...roles, pubRole];
  }

  const resolvedProfiles = await resolveStorageUrlsInRows(profiles || [], ['photo_url']);

  const users = resolvedProfiles.map((p: any) => ({
    id: p.id,
    user_code: p.user_code,
    username: p.username,
    email: p.email || '',
    mobile: p.mobile || '',
    full_name: p.full_name,
    role_id: p.role_id || '',
    role_name: p.roles?.name || 'Pending Role',
    role_slug: p.roles?.slug || null,
    status: p.status,
    linked_type: p.linked_type,
    linked_id: p.linked_id,
    father_name: p.father_name || '',
    dob: p.dob || '',
    gender: p.gender || '',
    address: p.address || '',
    village: p.village || '',
    district: p.district || '',
    state: p.state || '',
    pin_code: p.pin_code || '',
    photo_url: p.photo_url || '',
    last_login: p.last_login,
    created_at: p.created_at,
  }));

  return res.json({
    users,
    roles: roles || [],
    permissions: permissions || [],
    rolePermissions: rolePermissions || [],
  });
});

router.post('/users', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { full_name, username, email, mobile, password, role_id, linked_type, linked_id, father_name, address, village, district } = req.body;
    if (!full_name || !username || !password || !role_id) {
      return res.status(400).json({ error: 'Full name, username, password, and role are required.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) return res.status(409).json({ error: 'Username already exists.' });

    const authEmail = (email?.trim() || `${cleanUsername}@madrasa.local`).toLowerCase();
    const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim(), username: cleanUsername },
    });
    if (authErr || !createdAuth.user) {
      return res.status(400).json({ error: authErr?.message || 'Failed to provision Supabase Auth user' });
    }

    const uid = createdAuth.user.id;
    const userCode = `USR-${String(Date.now()).slice(-6)}`;
    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: uid,
        user_code: userCode,
        username: cleanUsername,
        email: authEmail,
        mobile: mobile || '',
        full_name: full_name.trim(),
        father_name: father_name || '',
        address: address || '',
        village: village || '',
        district: district || 'Palamu',
        state: 'Jharkhand',
        role_id,
        status: 'active',
        linked_type: linked_type || null,
        linked_id: linked_id || null,
      },
      { onConflict: 'id' }
    );
    if (profErr) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      return res.status(400).json({ error: profErr.message });
    }

    if (linked_type === 'student' && linked_id) await admin.from('students').update({ user_id: uid }).eq('id', linked_id);
    if (linked_type === 'teacher' && linked_id) await admin.from('teachers').update({ user_id: uid }).eq('id', linked_id);
    if (linked_type === 'parent' && linked_id) await admin.from('parents').update({ user_id: uid }).eq('id', linked_id);

    await logActivity(req.user!, 'ACCOUNT_CREATED', 'login_details', uid, `Created user account ${cleanUsername}`, req.ip);
    return res.status(201).json({ id: uid });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create user account' });
  }
});

router.put('/users/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const { full_name, email, mobile, role_id, status, linked_type, linked_id, father_name, gender, address, village, district, state, pin_code } = req.body;

    const { data: currentProfile } = await admin
      .from('profiles')
      .select('id, username, role_id, status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!currentProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const payload: Record<string, any> = {};
    if (full_name !== undefined) payload.full_name = full_name;
    if (email !== undefined) payload.email = email;
    if (mobile !== undefined) payload.mobile = mobile;
    if (role_id !== undefined) payload.role_id = role_id || null;
    if (status !== undefined) payload.status = status;
    else if (role_id && currentProfile.status === 'pending') payload.status = 'active';
    if (linked_type !== undefined) payload.linked_type = linked_type || null;
    if (linked_id !== undefined) payload.linked_id = linked_id || null;
    if (father_name !== undefined) payload.father_name = father_name;
    if (gender !== undefined) payload.gender = gender;
    if (address !== undefined) payload.address = address;
    if (village !== undefined) payload.village = village;
    if (district !== undefined) payload.district = district;
    if (state !== undefined) payload.state = state;
    if (pin_code !== undefined) payload.pin_code = pin_code;

    if (email) {
      const { error: authUpdErr } = await admin.auth.admin.updateUserById(id, { email });
      if (authUpdErr) return res.status(400).json({ error: authUpdErr.message });
    }

    const { error } = await admin.from('profiles').update(payload).eq('id', id).is('deleted_at', null);
    if (error) return res.status(400).json({ error: error.message });

    if (role_id && role_id !== currentProfile.role_id) {
      const { data: newRole } = await admin.from('roles').select('name').eq('id', role_id).maybeSingle();
      await logActivity(
        req.user!,
        'ROLE_CHANGED',
        'super_admin',
        id,
        `Changed role for @${currentProfile.username} to ${newRole?.name || role_id}`,
        req.ip
      );
    } else {
      await logActivity(req.user!, 'ACCOUNT_UPDATED', 'login_details', id, `Updated user account @${currentProfile.username}`, req.ip);
    }
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to update user account' });
  }
});

router.post('/users/:id/reset-password', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const { error } = await admin.auth.admin.updateUserById(id, { password: newPassword });
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.user!, 'PASSWORD_RESET_BY_ADMIN', 'login_details', id, `Super Admin reset password for user ${id}`, req.ip);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.put('/roles/:roleId/permissions', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const roleId = req.params.roleId;
    const { permissionIds } = req.body as { permissionIds: string[] };

    await admin.from('role_permissions').delete().eq('role_id', roleId);
    if (Array.isArray(permissionIds) && permissionIds.length > 0) {
      const rows = permissionIds.map((pid) => ({ role_id: roleId, permission_id: pid }));
      const { error } = await admin.from('role_permissions').insert(rows);
      if (error) return res.status(400).json({ error: error.message });
    }
    await logActivity(req.user!, 'PERMISSIONS_UPDATED', 'login_details', roleId, `Updated permissions for role ${roleId}`, req.ip);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to update role permissions' });
  }
});

// ==================== ADMISSIONS ====================
router.get('/admissions/status', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  try {
    const admissionsOpen = await getAdmissionsOpen(admin);
    return res.json({ admissionsOpen });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to read admission status' });
  }
});

router.put('/admissions/status', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  try {
    const open = Boolean((req.body as { open?: boolean })?.open);
    const updated = await setAdmissionsOpen(admin, open);
    await logActivity(
      req.user!,
      updated ? 'ADMISSIONS_OPENED' : 'ADMISSIONS_CLOSED',
      'admissions',
      '1',
      `Super Admin turned online admissions ${updated ? 'ON' : 'OFF'}`,
      req.ip
    );
    return res.json({ admissionsOpen: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update admission status' });
  }
});

router.get('/admissions', requireAuth, requireRole('super_admin', 'committee_member'), async (req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { search, classId, status, dateFrom, dateTo } = req.query as Record<string, string>;

  let q = admin
    .from('admissions')
    .select('*, classes(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (classId) q = q.eq('admission_class_id', classId);
  if (status) q = q.eq('status', status);
  if (dateFrom) q = q.gte('admission_date', dateFrom);
  if (dateTo) q = q.lte('admission_date', dateTo);
  if (search) {
    const s = sanitizeOrTerm(search);
    if (s) q = q.or(`student_name.ilike.%${s}%,admission_no.ilike.%${s}%,father_name.ilike.%${s}%,guardian_mobile.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const resolved = await resolveStorageUrlsInRows(data || [], ['photo_url']);

  // Enrich with linked student and profile (username) without exposing passwords
  const studentIds = Array.from(new Set(resolved.map((a: any) => a.student_id).filter(Boolean)));
  const authIds = Array.from(new Set(resolved.map((a: any) => a.auth_user_id).filter(Boolean)));

  const studentMap = new Map<string, any>();
  const profileMap = new Map<string, any>();

  if (studentIds.length > 0) {
    const { data: sts } = await admin
      .from('students')
      .select('id, student_code, admission_no, status, full_name, father_name, mobile, class_id, user_id')
      .in('id', studentIds)
      .is('deleted_at', null);
    for (const s of sts || []) {
      studentMap.set(s.id, s);
      if (s.user_id && !authIds.includes(s.user_id)) authIds.push(s.user_id);
    }
  }

  if (authIds.length > 0) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, username, user_code, status')
      .in('id', authIds)
      .is('deleted_at', null);
    for (const p of profs || []) {
      profileMap.set(p.id, p);
    }
  }

  const admissions = resolved.map((a: any) => {
    const linkedStudent = a.student_id ? studentMap.get(a.student_id) : null;
    const uid = a.auth_user_id || linkedStudent?.user_id || null;
    const linkedProfile = uid ? profileMap.get(uid) : null;
    const username = a.username || linkedProfile?.username || '';
    const officialAdmissionNo = linkedStudent?.admission_no || a.admission_number || '';
    const rejectionReason =
      a.rejection_reason || (a.status === 'rejected' ? a.remarks || '' : '');

    return {
      ...a,
      class_name: a.classes?.name || 'Unassigned',
      documents_json: typeof a.documents_json === 'string' ? a.documents_json : JSON.stringify(a.documents_json || []),
      username,
      official_admission_no: officialAdmissionNo,
      student_code: linkedStudent?.student_code || '',
      student_status: linkedStudent?.status || '',
      account_status: linkedProfile?.status || '',
      approval_status: a.approval_status || a.status || 'pending',
      rejection_reason: rejectionReason,
      registration_date: a.created_at || a.admission_date || '',
    };
  });
  return res.json({ admissions });
});

router.get('/admissions/:id/details', requireAuth, requireRole('super_admin', 'committee_member'), async (req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;

  const { data: adm, error } = await admin
    .from('admissions')
    .select('*, classes(name)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !adm) return res.status(404).json({ error: 'Admission record not found' });

  let linkedStudent: any = null;
  if (adm.student_id) {
    const { data: st } = await admin
      .from('students')
      .select('*, classes(name), academic_sessions(name)')
      .eq('id', adm.student_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (st) {
      linkedStudent = {
        ...st,
        photo_url: await resolveStorageUrl(st.photo_url),
        class_name: (st as any).classes?.name || 'Unassigned',
        session_name: (st as any).academic_sessions?.name || '',
      };
    }
  }

  let linkedProfile: any = null;
  const uid = (adm as any).auth_user_id || linkedStudent?.user_id || null;
  if (uid) {
    const { data: prof } = await admin
      .from('profiles')
      .select('id, user_code, username, status, full_name, mobile, created_at, last_login, roles(name, slug)')
      .eq('id', uid)
      .is('deleted_at', null)
      .maybeSingle();
    if (prof) {
      linkedProfile = {
        id: prof.id,
        user_code: prof.user_code,
        username: prof.username,
        status: prof.status,
        role_name: (prof as any).roles?.name || 'Student',
        created_at: prof.created_at,
        last_login: prof.last_login,
      };
    }
  }

  return res.json({
    admission: {
      ...adm,
      photo_url: await resolveStorageUrl(adm.photo_url),
      class_name: (adm as any).classes?.name || 'Unassigned',
      username: (adm as any).username || linkedProfile?.username || '',
      official_admission_no: linkedStudent?.admission_no || (adm as any).admission_number || '',
      approval_status: (adm as any).approval_status || adm.status || 'pending',
      rejection_reason: (adm as any).rejection_reason || (adm.status === 'rejected' ? adm.remarks || '' : ''),
    },
    student: linkedStudent,
    account: linkedProfile,
  });
});

router.post('/admissions', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const b = req.body;
    if (!b.student_name || !b.father_name || !b.guardian_name || !b.guardian_mobile) {
      return res.status(400).json({ error: 'Student name, father name, guardian name, and guardian mobile are required.' });
    }
    const { count } = await admin.from('admissions').select('id', { count: 'exact', head: true });
    let referenceNo = (b.reference_no || b.admission_no || '').trim();
    if (!referenceNo) {
      referenceNo = `REF-${new Date().getFullYear()}-${String(1000 + (count || 0) + 1)}`;
      const { data: dupCheck } = await admin
        .from('admissions')
        .select('id')
        .eq('admission_no', referenceNo)
        .maybeSingle();
      if (dupCheck) {
        referenceNo = `REF-${new Date().getFullYear()}-${1000 + (count || 0) + 1}${String(Date.now()).slice(-3)}`;
      }
    }

    const { data: inserted, error } = await admin
      .from('admissions')
      .insert({
        admission_no: referenceNo,
        student_name: b.student_name.trim(),
        father_name: b.father_name.trim(),
        mother_name: b.mother_name || '',
        dob: b.dob || '',
        gender: b.gender || 'Male',
        religion: b.religion || 'Islam',
        address: b.address || '',
        village: b.village || '',
        district: b.district || 'Palamu',
        state: b.state || 'Jharkhand',
        pin_code: b.pin_code || '',
        student_mobile: b.student_mobile || '',
        guardian_name: b.guardian_name.trim(),
        guardian_relationship: b.guardian_relationship || 'Father',
        guardian_mobile: b.guardian_mobile.trim(),
        previous_school: b.previous_school || '',
        previous_class: b.previous_class || '',
        admission_date: b.admission_date || new Date().toISOString().slice(0, 10),
        admission_class_id: b.admission_class_id || null,
        photo_url: normalizeStorageRef(b.photo_url),
        documents_json: Array.isArray(b.documents) ? b.documents : [],
        remarks: b.remarks || '',
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !inserted) return res.status(400).json({ error: error?.message || 'Failed to save admission' });
    await notifyRoles(['super_admin'], 'admission', 'New Admission Application', `${b.student_name} (Ref: ${referenceNo}) submitted for admission.`, 'admissions', inserted.id);
    await logActivity(req.user!, 'ADMISSION_CREATED', 'admissions', inserted.id, `Created admission reference ${referenceNo} for ${b.student_name}`, req.ip);
    return res.status(201).json({ id: inserted.id, reference_no: referenceNo, admission_no: referenceNo });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to save admission' });
  }
});

router.put('/admissions/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const b = req.body;
    const payload: Record<string, any> = {};
    const copyKeys = [
      'student_name', 'father_name', 'mother_name', 'dob', 'gender', 'religion',
      'address', 'village', 'district', 'state', 'pin_code', 'student_mobile',
      'guardian_name', 'guardian_relationship', 'guardian_mobile',
      'previous_school', 'previous_class', 'admission_date', 'remarks',
    ];
    for (const k of copyKeys) if (b[k] !== undefined) payload[k] = b[k];
    if (b.admission_class_id !== undefined) payload.admission_class_id = b.admission_class_id || null;
    if (b.photo_url !== undefined) payload.photo_url = normalizeStorageRef(b.photo_url);
    if (b.documents !== undefined) payload.documents_json = b.documents;

    const { error } = await admin.from('admissions').update(payload).eq('id', id).is('deleted_at', null);
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.user!, 'ADMISSION_UPDATED', 'admissions', id, `Updated admission ${id}`, req.ip);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to update admission' });
  }
});

router.post('/admissions/:id/approve', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;

    const { data: adm } = await admin
      .from('admissions')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!adm) return res.status(404).json({ error: 'Admission record not found' });

    // 1. Verify the application is pending
    if (adm.status !== 'pending') {
      return res.status(400).json({
        error: `This admission application is already ${adm.status}. Only pending applications can be approved.`,
      });
    }

    const nowIso = new Date().toISOString();
    const studentRole = await ensureStudentRole(admin);

    // 2. Find existing linked student account (do NOT create duplicate!)
    let studentId: string | null = adm.student_id || null;
    let existingStudent: any = null;

    if (studentId) {
      const { data: st } = await admin
        .from('students')
        .select('*')
        .eq('id', studentId)
        .maybeSingle();
      existingStudent = st;
    }

    if (!existingStudent && (adm as any).auth_user_id) {
      const { data: st } = await admin
        .from('students')
        .select('*')
        .eq('user_id', (adm as any).auth_user_id)
        .maybeSingle();
      if (st) {
        existingStudent = st;
        studentId = st.id;
      }
    }

    if (!existingStudent && (adm as any).username) {
      const { data: st } = await admin
        .from('students')
        .select('*')
        .eq('username', (adm as any).username)
        .maybeSingle();
      if (st) {
        existingStudent = st;
        studentId = st.id;
      }
    }

    let assignedAdmissionNo = '';

    if (existingStudent) {
      // 3 & 4 & 7: Activate existing student record and assign official Admission Number if not yet assigned
      assignedAdmissionNo = String(existingStudent.admission_no || '').trim();
      if (!assignedAdmissionNo || assignedAdmissionNo.startsWith('REF-')) {
        const codes = await generateNextStudentCodes(admin);
        assignedAdmissionNo = codes.officialAdmissionNo;
      }

      await safeTableUpdate(admin, 'students', existingStudent.id, {
        status: 'active',
        approval_status: 'approved',
        admission_no: assignedAdmissionNo,
        admission_number: assignedAdmissionNo,
        deleted_at: null,
        approved_by: req.user!.id,
        approved_at: nowIso,
      });
      studentId = existingStudent.id;
    } else {
      // Legacy fallback only if an admission row was inserted without a student record
      const [{ data: activeSession }, codes] = await Promise.all([
        admin.from('academic_sessions').select('id').eq('is_active', true).limit(1).maybeSingle(),
        generateNextStudentCodes(admin),
      ]);
      assignedAdmissionNo = String(adm.admission_no || '').startsWith('REF-')
        ? codes.officialAdmissionNo
        : adm.admission_no;

      if (assignedAdmissionNo) {
        const { data: dupAdmNo } = await admin
          .from('students')
          .select('id')
          .eq('admission_no', assignedAdmissionNo)
          .limit(1)
          .maybeSingle();
        if (dupAdmNo) {
          assignedAdmissionNo = codes.officialAdmissionNo;
        }
      }

      const createdStudent = await safeStudentInsert(admin, {
        student_code: codes.studentCode,
        admission_no: assignedAdmissionNo,
        admission_number: assignedAdmissionNo,
        username: (adm as any).username || null,
        full_name: adm.student_name,
        father_name: adm.father_name,
        mother_name: adm.mother_name || '',
        dob: adm.dob || '',
        gender: adm.gender || 'Male',
        religion: adm.religion || 'Islam',
        address: adm.address || '',
        village: adm.village || '',
        district: adm.district || 'Palamu',
        state: adm.state || 'Jharkhand',
        pin_code: adm.pin_code || '',
        mobile: adm.student_mobile || adm.guardian_mobile || '',
        class_id: adm.admission_class_id || null,
        academic_session_id: activeSession?.id || null,
        admission_date: adm.admission_date || nowIso.slice(0, 10),
        photo_url: adm.photo_url || '',
        status: 'active',
        approval_status: 'approved',
        approved_by: req.user!.id,
        approved_at: nowIso,
        previous_school: adm.previous_school || '',
        previous_class: adm.previous_class || '',
        remarks: adm.remarks || '',
        user_id: (adm as any).auth_user_id || null,
        auth_user_id: (adm as any).auth_user_id || null,
      });
      studentId = createdStudent.id;

      const { data: existingParent } = await admin
        .from('parents')
        .select('id')
        .eq('mobile', adm.guardian_mobile)
        .is('deleted_at', null)
        .maybeSingle();

      let parentId = existingParent?.id;
      if (!parentId) {
        const { count: pCount } = await admin.from('parents').select('id', { count: 'exact', head: true });
        const pCode = `PAR-${200 + (pCount || 0) + 1}`;
        const { data: newParent } = await admin
          .from('parents')
          .insert({
            parent_code: pCode,
            full_name: adm.guardian_name,
            mobile: adm.guardian_mobile,
            address: adm.address || '',
            relationship: adm.guardian_relationship || 'Father',
            status: 'active',
          })
          .select('id')
          .single();
        parentId = newParent?.id;
      }
      if (parentId) {
        await admin.from('student_guardians').upsert(
          {
            student_id: studentId,
            parent_id: parentId,
            relationship: adm.guardian_relationship || 'Father',
            is_primary: true,
          },
          { onConflict: 'student_id,parent_id' }
        );
      }
    }

    // 5 & 10 & 11: Activate existing Supabase profile WITHOUT changing username or password
    const authUserId: string | null = existingStudent?.user_id || (adm as any).auth_user_id || null;
    let studentUsername = (adm as any).username || existingStudent?.username || '';

    if (authUserId) {
      const { data: prof } = await admin
        .from('profiles')
        .select('id, username')
        .eq('id', authUserId)
        .is('deleted_at', null)
        .maybeSingle();
      if (prof?.username) studentUsername = prof.username;

      await safeTableUpdate(admin, 'profiles', authUserId, {
        status: 'active',
        approval_status: 'approved',
        role_id: studentRole.id,
        linked_type: 'student',
        linked_id: studentId,
        approved_by: req.user!.id,
        approved_at: nowIso,
      });

      await admin.from('notifications').insert({
        user_id: authUserId,
        type: 'admission',
        title: 'Admission Approved!',
        message: `Congratulations ${adm.student_name}! Your admission has been approved. Official Admission No: ${assignedAdmissionNo}. Your Student Dashboard is now unlocked.`,
        link_module: 'dashboard',
        reference_id: studentId,
      });
    }

    // 6, 8, 9: Mark admission approved with Super Admin ID and timestamp
    await safeTableUpdate(admin, 'admissions', id, {
      status: 'approved',
      approval_status: 'approved',
      student_id: studentId,
      admission_number: assignedAdmissionNo,
      reviewed_by: req.user!.id,
      reviewed_at: nowIso,
      approved_by: req.user!.id,
      approved_at: nowIso,
    });

    await notifyRoles(
      ['super_admin'],
      'student',
      'Admission Approved',
      `Student account activated for ${adm.student_name}${studentUsername ? ` (@${studentUsername})` : ''} (Ref: ${adm.admission_no}, Admission No: ${assignedAdmissionNo}).`,
      'students',
      studentId
    );
    await logActivity(
      req.user!,
      'ADMISSION_APPROVED',
      'admissions',
      id,
      `Approved Ref ${adm.admission_no} -> Student ${studentId} (Admission No ${assignedAdmissionNo})`,
      req.ip
    );
    return res.json({
      success: true,
      studentId,
      reference_no: adm.admission_no,
      admission_no: assignedAdmissionNo,
      username: studentUsername,
      student_name: adm.student_name,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to approve admission' });
  }
});

router.post('/admissions/:id/reject', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const body = req.body as { rejection_reason?: string; remarks?: string };
    const reason = String(body.rejection_reason || body.remarks || '').trim();

    if (!reason) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    const { data: adm } = await admin
      .from('admissions')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!adm) return res.status(404).json({ error: 'Admission record not found' });
    if (adm.status !== 'pending') {
      return res.status(400).json({
        error: `This admission application is already ${adm.status}. Only pending applications can be rejected.`,
      });
    }

    const nowIso = new Date().toISOString();

    // Disable linked student record if present
    let studentId: string | null = adm.student_id || null;
    let authUserId: string | null = (adm as any).auth_user_id || null;

    if (studentId) {
      const { data: st } = await admin
        .from('students')
        .select('id, user_id')
        .eq('id', studentId)
        .is('deleted_at', null)
        .maybeSingle();
      if (st?.user_id && !authUserId) authUserId = st.user_id;

      await safeTableUpdate(admin, 'students', studentId, {
        status: 'disabled',
        approval_status: 'rejected',
        rejected_by: req.user!.id,
        rejected_at: nowIso,
        rejection_reason: reason,
      });
    }

    // Disable linked Supabase login profile so login remains blocked
    if (authUserId) {
      await safeTableUpdate(admin, 'profiles', authUserId, {
        status: 'disabled',
        approval_status: 'rejected',
        rejected_by: req.user!.id,
        rejected_at: nowIso,
        rejection_reason: reason,
      });
    }

    await safeTableUpdate(admin, 'admissions', id, {
      status: 'rejected',
      approval_status: 'rejected',
      rejection_reason: reason,
      remarks: reason,
      reviewed_by: req.user!.id,
      reviewed_at: nowIso,
      rejected_by: req.user!.id,
      rejected_at: nowIso,
    });

    await logActivity(
      req.user!,
      'ADMISSION_REJECTED',
      'admissions',
      id,
      `Rejected Ref ${adm.admission_no} for ${adm.student_name}. Reason: ${reason}`,
      req.ip
    );
    return res.json({ success: true, rejection_reason: reason });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to reject admission' });
  }
});

router.delete('/admissions/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('admissions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'ADMISSION_DELETED', 'admissions', id, `Deleted admission ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== STUDENTS ====================
router.get('/students', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;
  const { search, classId, status } = req.query as Record<string, string>;

  let q = admin
    .from('students')
    .select('*, classes(name, code, room_no, class_teacher_id, teachers(full_name)), academic_sessions(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (user.role_slug === 'student') {
    const stId = await getStudentIdForUser(user);
    if (!stId) return res.json({ students: [] });
    q = q.eq('id', stId);
  } else if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    const childIds = pid ? await getParentStudentIds(pid) : [];
    if (!childIds.length) return res.json({ students: [] });
    q = q.in('id', childIds);
  } else if (user.role_slug === 'teacher') {
    const tid = await getTeacherIdForUser(user);
    const classIds = tid ? await getTeacherAssignedClassIds(tid) : [];
    if (!classIds.length) return res.json({ students: [] });
    q = q.in('class_id', classIds);
  }

  if (classId) q = q.eq('class_id', classId);
  if (status) q = q.eq('status', status);
  if (search) {
    const s = sanitizeOrTerm(search);
    if (s) q = q.or(`full_name.ilike.%${s}%,student_code.ilike.%${s}%,father_name.ilike.%${s}%,mobile.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const resolved = await resolveStorageUrlsInRows(data || [], ['photo_url']);
  const students = resolved.map((st: any) => ({
    ...st,
    class_name: st.classes?.name || 'Unassigned',
    class_code: st.classes?.code || '',
    class_teacher_name: st.classes?.teachers?.full_name || '',
    session_name: st.academic_sessions?.name || '',
  }));
  return res.json({ students });
});

router.get('/students/:id', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  if (!(await canAccessStudent(req.user!, id))) {
    return res.status(403).json({ error: 'Access denied to this student profile' });
  }

  const { data: studentRaw } = await admin
    .from('students')
    .select('*, classes(name), academic_sessions(name)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!studentRaw) return res.status(404).json({ error: 'Student not found' });

  const student = {
    ...studentRaw,
    photo_url: await resolveStorageUrl(studentRaw.photo_url),
    class_name: (studentRaw as any).classes?.name || 'Unassigned',
    session_name: (studentRaw as any).academic_sessions?.name || '',
  };

  let resultsQuery = admin
    .from('results')
    .select('*, examinations(name, start_date)')
    .eq('student_id', id)
    .order('created_at', { ascending: false });
  if (req.user!.role_slug !== 'super_admin' && req.user!.role_slug !== 'teacher') {
    resultsQuery = resultsQuery.eq('is_published', true);
  }

  const [guardiansRes, promotionsRes, attendanceRes, resultsRes, homeworkRes, noticesRes, documentsRes] = await Promise.all([
    admin.from('student_guardians').select('relationship, is_primary, parents(*)').eq('student_id', id),
    admin
      .from('student_promotions')
      .select('*, from_cls:classes!student_promotions_from_class_id_fkey(name), to_cls:classes!student_promotions_to_class_id_fkey(name), from_sess:academic_sessions!student_promotions_from_session_id_fkey(name), to_sess:academic_sessions!student_promotions_to_session_id_fkey(name)')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
    admin.from('attendance').select('*, classes(name)').eq('student_id', id).order('attendance_date', { ascending: false }).limit(60),
    resultsQuery,
    student.class_id
      ? admin
          .from('homework')
          .select('*, subjects(name), teachers(full_name), homework_submissions(student_id, status, feedback, grade, submitted_at)')
          .eq('class_id', student.class_id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    admin.from('notices').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(30),
    admin.from('documents').select('*').eq('entity_type', 'student').eq('entity_id', id).order('created_at', { ascending: false }),
  ]);

  const guardians = (guardiansRes.data || [])
    .filter((g: any) => g.parents && !g.parents.deleted_at)
    .map((g: any) => ({ ...g.parents, link_relationship: g.relationship, is_primary: g.is_primary }));

  const promotions = (promotionsRes.data || []).map((p: any) => ({
    ...p,
    from_class_name: p.from_cls?.name || '',
    to_class_name: p.to_cls?.name || '',
    from_session: p.from_sess?.name || '',
    to_session: p.to_sess?.name || '',
  }));

  const attendance = (attendanceRes.data || []).map((a: any) => ({
    ...a,
    class_name: a.classes?.name || '',
  }));

  const results = (resultsRes.data || []).map((r: any) => ({
    ...r,
    exam_name: r.examinations?.name || '',
    start_date: r.examinations?.start_date || '',
  }));

  const homework = (homeworkRes.data || []).map((h: any) => {
    const sub = (h.homework_submissions || []).find((s: any) => s.student_id === id);
    return {
      ...h,
      subject_name: h.subjects?.name || '',
      teacher_name: h.teachers?.full_name || '',
      submission_status: sub?.status || null,
      feedback: sub?.feedback || '',
      grade: sub?.grade || '',
      submitted_at: sub?.submitted_at || null,
    };
  });

  const notices = (noticesRes.data || [])
    .filter((n: any) => n.target_audience === 'all' || n.target_audience === 'students' || (n.target_audience === 'class' && n.target_class_id === student.class_id))
    .slice(0, 15);

  const documents = await resolveStorageUrlsInRows(documentsRes.data || [], ['file_url']);

  return res.json({ student, guardians, promotions, attendance, results, homework, notices, documents });
});

router.post('/students', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const b = req.body;
    if (!b.full_name || !b.father_name) {
      return res.status(400).json({ error: 'Student full name and father name are required.' });
    }
    const [{ data: activeSession }, { count }] = await Promise.all([
      admin.from('academic_sessions').select('id').eq('is_active', true).limit(1).maybeSingle(),
      admin.from('students').select('id', { count: 'exact', head: true }),
    ]);
    const studentCode = `MGR-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`;

    const { data: created, error } = await admin
      .from('students')
      .insert({
        student_code: studentCode,
        admission_no: b.admission_no || null,
        full_name: b.full_name.trim(),
        father_name: b.father_name.trim(),
        mother_name: b.mother_name || '',
        dob: b.dob || '',
        gender: b.gender || 'Male',
        religion: b.religion || 'Islam',
        address: b.address || '',
        village: b.village || '',
        district: b.district || 'Palamu',
        state: b.state || 'Jharkhand',
        pin_code: b.pin_code || '',
        mobile: b.mobile || '',
        class_id: b.class_id || null,
        academic_session_id: b.academic_session_id || activeSession?.id || null,
        admission_date: b.admission_date || new Date().toISOString().slice(0, 10),
        photo_url: normalizeStorageRef(b.photo_url),
        status: b.status || 'active',
        previous_school: b.previous_school || '',
        previous_class: b.previous_class || '',
        remarks: b.remarks || '',
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to add student' });

    if (b.parent_id) {
      await admin.from('student_guardians').upsert(
        {
          student_id: created.id,
          parent_id: b.parent_id,
          relationship: b.guardian_relationship || 'Father',
          is_primary: true,
        },
        { onConflict: 'student_id,parent_id' }
      );
    }

    await notifyRoles(['super_admin'], 'student', 'New Student Enrolled', `${b.full_name} (${studentCode}) added to student directory.`, 'students', created.id);
    await logActivity(req.user!, 'STUDENT_ADDED', 'students', created.id, `Added student ${b.full_name} (${studentCode})`, req.ip);
    return res.status(201).json({ id: created.id, student_code: studentCode });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to add student' });
  }
});

router.put('/students/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const b = req.body;
    const payload: Record<string, any> = {};
    const fields = [
      'full_name', 'father_name', 'mother_name', 'dob', 'gender', 'religion',
      'address', 'village', 'district', 'state', 'pin_code', 'mobile',
      'status', 'previous_school', 'previous_class', 'remarks',
    ];
    for (const f of fields) if (b[f] !== undefined) payload[f] = b[f];
    if (b.class_id !== undefined) payload.class_id = b.class_id || null;
    if (b.academic_session_id !== undefined) payload.academic_session_id = b.academic_session_id || null;
    if (b.photo_url !== undefined) payload.photo_url = normalizeStorageRef(b.photo_url);

    const { error } = await admin.from('students').update(payload).eq('id', id).is('deleted_at', null);
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.user!, 'STUDENT_UPDATED', 'students', id, `Updated student ${id}`, req.ip);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to update student' });
  }
});

router.post('/students/:id/promote', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const { to_class_id, to_session_id, action_type, remarks } = req.body;
    if (!to_class_id) return res.status(400).json({ error: 'Target class is required.' });

    const { data: st } = await admin
      .from('students')
      .select('class_id, academic_session_id, full_name')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!st) return res.status(404).json({ error: 'Student not found' });

    const { error: promErr } = await admin.from('student_promotions').insert({
      student_id: id,
      from_class_id: st.class_id,
      to_class_id,
      from_session_id: st.academic_session_id,
      to_session_id: to_session_id || st.academic_session_id,
      action_type: action_type || 'promote',
      remarks: remarks || '',
      promoted_by: req.user!.id,
    });
    if (promErr) return res.status(400).json({ error: promErr.message });

    const { error: stUpdErr } = await admin
      .from('students')
      .update({
        class_id: to_class_id,
        academic_session_id: to_session_id || st.academic_session_id,
      })
      .eq('id', id);
    if (stUpdErr) return res.status(400).json({ error: stUpdErr.message });

    await logActivity(req.user!, 'STUDENT_PROMOTED', 'students', id, `${action_type || 'promote'} student ${id} to class ${to_class_id}`, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to promote/transfer student' });
  }
});

router.post('/students/:id/documents', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { title, file_url, file_type } = req.body;
  if (!title || !file_url) return res.status(400).json({ error: 'Document title and file URL required' });
  const { data: created, error } = await admin
    .from('documents')
    .insert({
      entity_type: 'student',
      entity_id: id,
      title,
      file_url: normalizeStorageRef(file_url),
      file_type: file_type || 'file',
      uploaded_by: req.user!.id,
    })
    .select('id')
    .single();
  if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to attach document' });
  return res.status(201).json({ id: created.id });
});

router.delete('/students/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('students').update({ deleted_at: new Date().toISOString(), status: 'inactive' }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'STUDENT_DELETED', 'students', id, `Soft deleted student ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== TEACHERS ====================
router.get('/teachers', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;

  const [{ data: teachersRaw }, { data: assignmentsRaw }] = await Promise.all([
    admin.from('teachers').select('*, profiles(username, status)').is('deleted_at', null).order('created_at', { ascending: false }),
    admin.from('teacher_assignments').select('*, classes(name), subjects(name)'),
  ]);

  const assignments = (assignmentsRaw || []).map((ta: any) => ({
    ...ta,
    class_name: ta.classes?.name || '',
    subject_name: ta.subjects?.name || '',
  }));

  const resolvedTeachers = await resolveStorageUrlsInRows(teachersRaw || [], ['photo_url']);
  const teachers = resolvedTeachers.map((t: any) => {
    const tAssigns = assignments.filter((a: any) => a.teacher_id === t.id);
    return {
      ...t,
      login_username: t.profiles?.username || null,
      account_status: t.profiles?.status || null,
      assigned_classes: Array.from(new Set(tAssigns.map((a: any) => a.class_name).filter(Boolean))).join(', '),
      assigned_subjects: Array.from(new Set(tAssigns.map((a: any) => a.subject_name).filter(Boolean))).join(', '),
    };
  });

  return res.json({ teachers, assignments });
});

router.post('/teachers', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const b = req.body;
    if (!b.full_name || !b.mobile) return res.status(400).json({ error: 'Full name and mobile are required.' });
    const { count } = await admin.from('teachers').select('id', { count: 'exact', head: true });
    const teacherCode = `TCH-${100 + (count || 0) + 1}`;
    const { data: created, error } = await admin
      .from('teachers')
      .insert({
        teacher_code: teacherCode,
        full_name: b.full_name.trim(),
        father_name: b.father_name || '',
        dob: b.dob || '',
        gender: b.gender || 'Male',
        mobile: b.mobile.trim(),
        email: b.email || '',
        address: b.address || '',
        qualification: b.qualification || '',
        joining_date: b.joining_date || new Date().toISOString().slice(0, 10),
        photo_url: normalizeStorageRef(b.photo_url),
        employment_status: b.employment_status || 'active',
        remarks: b.remarks || '',
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to add teacher' });
    await logActivity(req.user!, 'TEACHER_ADDED', 'teachers', created.id, `Added teacher ${b.full_name} (${teacherCode})`, req.ip);
    return res.status(201).json({ id: created.id, teacher_code: teacherCode });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to add teacher' });
  }
});

router.put('/teachers/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const b = req.body;
  const payload: Record<string, any> = {};
  for (const k of ['full_name', 'father_name', 'dob', 'gender', 'mobile', 'email', 'address', 'qualification', 'joining_date', 'employment_status', 'remarks']) {
    if (b[k] !== undefined) payload[k] = b[k];
  }
  if (b.photo_url !== undefined) payload.photo_url = normalizeStorageRef(b.photo_url);

  const { error } = await admin.from('teachers').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'TEACHER_UPDATED', 'teachers', id, `Updated teacher ${id}`, req.ip);
  return res.json({ success: true });
});

router.post('/teachers/:id/assignments', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const teacherId = req.params.id;
    const { assignments } = req.body as { assignments: { class_id: string; subject_id: string | null; is_class_teacher?: boolean }[] };
    const { data: activeSession } = await admin.from('academic_sessions').select('id').eq('is_active', true).limit(1).maybeSingle();

    const { error: delErr } = await admin.from('teacher_assignments').delete().eq('teacher_id', teacherId);
    if (delErr) return res.status(400).json({ error: delErr.message });
    if (Array.isArray(assignments) && assignments.length > 0) {
      const rows = assignments.map((a) => ({
        teacher_id: teacherId,
        class_id: a.class_id,
        subject_id: a.subject_id || null,
        academic_session_id: activeSession?.id || null,
        is_class_teacher: Boolean(a.is_class_teacher),
      }));
      const { error: insErr } = await admin.from('teacher_assignments').insert(rows);
      if (insErr) return res.status(400).json({ error: insErr.message });
    }
    await logActivity(req.user!, 'TEACHER_ASSIGNMENTS_UPDATED', 'teachers', teacherId, `Updated class/subject assignments for teacher ${teacherId}`, req.ip);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to assign classes/subjects' });
  }
});

router.post('/teachers/:id/create-login', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const teacherId = req.params.id;
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ error: 'Username and password (min 6 chars) required' });
    }
    const { data: teacher } = await admin.from('teachers').select('*').eq('id', teacherId).is('deleted_at', null).maybeSingle();
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    if (teacher.user_id) return res.status(409).json({ error: 'Login account already exists for this teacher.' });

    const cleanUsername = username.trim().toLowerCase();
    const { data: existingUser } = await admin
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingUser) return res.status(409).json({ error: 'Username already exists.' });

    const { data: role } = await admin.from('roles').select('id').eq('slug', 'teacher').maybeSingle();
    if (!role) return res.status(400).json({ error: 'Teacher role is not configured.' });

    const authEmail = (teacher.email?.trim() || `${cleanUsername}@madrasa.local`).toLowerCase();

    const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: teacher.full_name, username: cleanUsername },
    });
    if (authErr || !createdAuth.user) return res.status(400).json({ error: authErr?.message || 'Failed to create auth user' });

    const uid = createdAuth.user.id;
    const userCode = `USR-${String(Date.now()).slice(-6)}`;
    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: uid,
        user_code: userCode,
        username: cleanUsername,
        email: authEmail,
        mobile: teacher.mobile,
        full_name: teacher.full_name,
        role_id: role.id,
        status: 'active',
        linked_type: 'teacher',
        linked_id: teacherId,
        photo_url: teacher.photo_url || '',
      },
      { onConflict: 'id' }
    );
    if (profErr) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      return res.status(400).json({ error: profErr.message });
    }
    const { error: linkErr } = await admin.from('teachers').update({ user_id: uid }).eq('id', teacherId);
    if (linkErr) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      return res.status(400).json({ error: linkErr.message });
    }

    await logActivity(req.user!, 'TEACHER_LOGIN_CREATED', 'teachers', teacherId, `Created login ${cleanUsername} for teacher ${teacherId}`, req.ip);
    return res.status(201).json({ user_id: uid });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create teacher login' });
  }
});

router.get('/teacher-attendance', requireAuth, requireRole('super_admin'), async (req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  const [{ data: teachers }, { data: attRows }] = await Promise.all([
    admin.from('teachers').select('id, teacher_code, full_name, qualification, mobile').is('deleted_at', null).eq('employment_status', 'active').order('full_name', { ascending: true }),
    admin.from('teacher_attendance').select('teacher_id, status, remark').eq('attendance_date', date),
  ]);

  const attByTeacher = new Map((attRows || []).map((r) => [r.teacher_id, r]));
  const records = (teachers || []).map((t) => {
    const a = attByTeacher.get(t.id);
    return {
      teacher_id: t.id,
      teacher_code: t.teacher_code,
      full_name: t.full_name,
      qualification: t.qualification,
      mobile: t.mobile,
      status: a?.status || 'unmarked',
      remark: a?.remark || '',
    };
  });
  return res.json({ date, records });
});

router.post('/teacher-attendance', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { date, records } = req.body as { date: string; records: { teacher_id: string; status: string; remark?: string }[] };
  const rows = (records || []).map((r) => ({
    teacher_id: r.teacher_id,
    attendance_date: date,
    status: r.status,
    remark: r.remark || '',
    marked_by: req.user!.id,
  }));
  if (rows.length) {
    const { error } = await admin.from('teacher_attendance').upsert(rows, { onConflict: 'teacher_id,attendance_date' });
    if (error) return res.status(400).json({ error: error.message });
  }
  await logActivity(req.user!, 'TEACHER_ATTENDANCE_SAVED', 'teachers', date, `Saved teacher attendance for ${date}`, req.ip);
  return res.json({ success: true });
});

router.delete('/teachers/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('teachers').update({ deleted_at: new Date().toISOString(), employment_status: 'inactive' }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'TEACHER_DELETED', 'teachers', id, `Soft deleted teacher ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== PARENTS ====================
router.get('/parents', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;

  let q = admin.from('parents').select('*, profiles(username, status)').is('deleted_at', null).order('created_at', { ascending: false });
  if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    if (!pid) return res.json({ parents: [] });
    q = q.eq('id', pid);
  }

  const [{ data: parentsRaw }, { data: linksRaw }] = await Promise.all([
    q,
    admin.from('student_guardians').select('parent_id, student_id, relationship, students!inner(full_name, student_code, deleted_at, classes(name))').is('students.deleted_at', null),
  ]);

  const links = (linksRaw || []).map((l: any) => ({
    parent_id: l.parent_id,
    student_id: l.student_id,
    relationship: l.relationship,
    student_name: l.students?.full_name || '',
    student_code: l.students?.student_code || '',
    class_name: l.students?.classes?.name || '',
  }));

  const parents = (parentsRaw || []).map((p: any) => ({
    ...p,
    login_username: p.profiles?.username || null,
    account_status: p.profiles?.status || null,
    children: links.filter((l) => l.parent_id === p.id),
  }));

  return res.json({ parents });
});

router.post('/parents', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const b = req.body;
    if (!b.full_name || !b.mobile) return res.status(400).json({ error: 'Parent name and mobile are required.' });
    const { count } = await admin.from('parents').select('id', { count: 'exact', head: true });
    const parentCode = `PAR-${200 + (count || 0) + 1}`;
    const { data: created, error } = await admin
      .from('parents')
      .insert({
        parent_code: parentCode,
        full_name: b.full_name.trim(),
        mobile: b.mobile.trim(),
        email: b.email || '',
        address: b.address || '',
        relationship: b.relationship || 'Father',
        occupation: b.occupation || '',
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to add parent' });
    if (Array.isArray(b.student_ids) && b.student_ids.length > 0) {
      const rows = b.student_ids.map((sid: string) => ({
        student_id: sid,
        parent_id: created.id,
        relationship: b.relationship || 'Father',
        is_primary: true,
      }));
      await admin.from('student_guardians').upsert(rows, { onConflict: 'student_id,parent_id' });
    }
    await logActivity(req.user!, 'PARENT_ADDED', 'parents', created.id, `Added parent ${b.full_name}`, req.ip);
    return res.status(201).json({ id: created.id, parent_code: parentCode });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to add parent' });
  }
});

router.put('/parents/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const b = req.body;
  const payload: Record<string, any> = {};
  for (const k of ['full_name', 'mobile', 'email', 'address', 'relationship', 'occupation', 'status']) {
    if (b[k] !== undefined) payload[k] = b[k];
  }
  const { error: updErr } = await admin.from('parents').update(payload).eq('id', id).is('deleted_at', null);
  if (updErr) return res.status(400).json({ error: updErr.message });

  if (Array.isArray(b.student_ids)) {
    const { error: delLinkErr } = await admin.from('student_guardians').delete().eq('parent_id', id);
    if (delLinkErr) return res.status(400).json({ error: delLinkErr.message });
    if (b.student_ids.length > 0) {
      const { error: linkErr } = await admin.from('student_guardians').upsert(
        b.student_ids.map((sid: string) => ({
          student_id: sid,
          parent_id: id,
          relationship: b.relationship || 'Father',
          is_primary: true,
        })),
        { onConflict: 'student_id,parent_id' }
      );
      if (linkErr) return res.status(400).json({ error: linkErr.message });
    }
  }
  await logActivity(req.user!, 'PARENT_UPDATED', 'parents', id, `Updated parent ${id}`, req.ip);
  return res.json({ success: true });
});

router.post('/parents/:id/create-login', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const parentId = req.params.id;
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ error: 'Username and password (min 6 chars) required' });
    }
    const { data: parent } = await admin.from('parents').select('*').eq('id', parentId).is('deleted_at', null).maybeSingle();
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    if (parent.user_id) return res.status(409).json({ error: 'Login account already exists for this parent.' });

    const cleanUsername = username.trim().toLowerCase();
    const { data: existingUser } = await admin
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingUser) return res.status(409).json({ error: 'Username already exists.' });

    const { data: role } = await admin.from('roles').select('id').eq('slug', 'parent').maybeSingle();
    if (!role) return res.status(400).json({ error: 'Parent role is not configured.' });

    const authEmail = (parent.email?.trim() || `${cleanUsername}@madrasa.local`).toLowerCase();

    const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: parent.full_name, username: cleanUsername },
    });
    if (authErr || !createdAuth.user) return res.status(400).json({ error: authErr?.message || 'Failed to create auth user' });

    const uid = createdAuth.user.id;
    const userCode = `USR-${String(Date.now()).slice(-6)}`;
    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: uid,
        user_code: userCode,
        username: cleanUsername,
        email: authEmail,
        mobile: parent.mobile,
        full_name: parent.full_name,
        role_id: role.id,
        status: 'active',
        linked_type: 'parent',
        linked_id: parentId,
      },
      { onConflict: 'id' }
    );
    if (profErr) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      return res.status(400).json({ error: profErr.message });
    }
    const { error: linkErr } = await admin.from('parents').update({ user_id: uid }).eq('id', parentId);
    if (linkErr) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      return res.status(400).json({ error: linkErr.message });
    }

    await logActivity(req.user!, 'PARENT_LOGIN_CREATED', 'parents', parentId, `Created parent login ${cleanUsername}`, req.ip);
    return res.status(201).json({ user_id: uid });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create parent login' });
  }
});

router.delete('/parents/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('parents').update({ deleted_at: new Date().toISOString(), status: 'inactive' }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'PARENT_DELETED', 'parents', id, `Deleted parent ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== CLASSES ====================
router.get('/classes', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;

  const [{ data: classesRaw }, { data: studentsRaw }, { data: csRaw }, { data: taRaw }] = await Promise.all([
    admin.from('classes').select('*, teachers(full_name), academic_sessions(name)').is('deleted_at', null).order('code', { ascending: true }),
    admin.from('students').select('class_id').is('deleted_at', null).eq('status', 'active'),
    admin.from('class_subjects').select('*, subjects!inner(name, code, deleted_at), teachers(full_name)').is('subjects.deleted_at', null),
    admin.from('teacher_assignments').select('class_id, is_class_teacher, teachers(full_name, deleted_at)'),
  ]);

  const counts = new Map<string, number>();
  for (const s of studentsRaw || []) {
    if (s.class_id) counts.set(s.class_id, (counts.get(s.class_id) || 0) + 1);
  }

  const assignedTeacherByClass = new Map<string, string>();
  for (const ta of taRaw || []) {
    const tName = (ta as any).teachers?.full_name;
    const tDeleted = (ta as any).teachers?.deleted_at;
    if (!ta.class_id || !tName || tDeleted) continue;
    if (ta.is_class_teacher || !assignedTeacherByClass.has(ta.class_id)) {
      assignedTeacherByClass.set(ta.class_id, tName);
    }
  }

  const classSubjects = (csRaw || []).map((cs: any) => ({
    ...cs,
    subject_name: cs.subjects?.name || '',
    subject_code: cs.subjects?.code || '',
    teacher_name: cs.teachers?.full_name || 'Unassigned',
  }));

  const classes = (classesRaw || []).map((c: any) => ({
    ...c,
    class_teacher_name: c.teachers?.full_name || assignedTeacherByClass.get(c.id) || 'Unassigned',
    session_name: c.academic_sessions?.name || '',
    student_count: counts.get(c.id) || 0,
    subjects: classSubjects.filter((cs) => cs.class_id === c.id),
  }));

  return res.json({ classes });
});

router.post('/classes', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { name, code, academic_session_id, class_teacher_id, room_no, status } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Class name and code are required.' });
    const { data: activeSession } = await admin.from('academic_sessions').select('id').eq('is_active', true).limit(1).maybeSingle();
    const { data: created, error } = await admin
      .from('classes')
      .insert({
        name: name.trim(),
        code: code.trim(),
        academic_session_id: academic_session_id || activeSession?.id || null,
        class_teacher_id: class_teacher_id || null,
        room_no: room_no || '',
        status: status || 'active',
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to create class' });
    await logActivity(req.user!, 'CLASS_CREATED', 'classes', created.id, `Created class ${name} (${code})`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create class' });
  }
});

router.put('/classes/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { name, code, academic_session_id, class_teacher_id, room_no, status } = req.body;
  const payload: Record<string, any> = {};
  if (name !== undefined) payload.name = name;
  if (code !== undefined) payload.code = code;
  if (academic_session_id !== undefined) payload.academic_session_id = academic_session_id || null;
  if (class_teacher_id !== undefined) payload.class_teacher_id = class_teacher_id || null;
  if (room_no !== undefined) payload.room_no = room_no;
  if (status !== undefined) payload.status = status;

  const { error } = await admin.from('classes').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'CLASS_UPDATED', 'classes', id, `Updated class ${id}`, req.ip);
  return res.json({ success: true });
});

router.post('/classes/:id/transfer-students', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const fromClassId = req.params.id;
    const { to_class_id, student_ids } = req.body as { to_class_id: string; student_ids?: string[] };
    if (!to_class_id || fromClassId === to_class_id) {
      return res.status(400).json({ error: 'Select a different destination class.' });
    }

    let q = admin.from('students').select('id, academic_session_id').eq('class_id', fromClassId).is('deleted_at', null);
    if (student_ids?.length) {
      q = q.in('id', student_ids);
    } else {
      q = q.eq('status', 'active');
    }
    const { data: targetRows } = await q;
    const list = targetRows || [];

    if (list.length) {
      await admin.from('student_promotions').insert(
        list.map((st) => ({
          student_id: st.id,
          from_class_id: fromClassId,
          to_class_id,
          from_session_id: st.academic_session_id,
          to_session_id: st.academic_session_id,
          action_type: 'transfer',
          remarks: 'Bulk class transfer',
          promoted_by: req.user!.id,
        }))
      );
      await admin.from('students').update({ class_id: to_class_id }).in('id', list.map((s) => s.id));
    }

    await logActivity(req.user!, 'CLASS_STUDENTS_TRANSFERRED', 'classes', fromClassId, `Transferred ${list.length} students to class ${to_class_id}`, req.ip);
    return res.json({ transferred: list.length });
  } catch {
    return res.status(500).json({ error: 'Failed to transfer students' });
  }
});

router.delete('/classes/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { count } = await admin.from('students').select('id', { count: 'exact', head: true }).eq('class_id', id).is('deleted_at', null).eq('status', 'active');
  if ((count || 0) > 0) {
    return res.status(409).json({
      error: `Cannot delete class because it contains ${count} active student(s). Transfer them to another class first.`,
    });
  }
  const { error } = await admin.from('classes').update({ deleted_at: new Date().toISOString(), status: 'inactive' }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'CLASS_DELETED', 'classes', id, `Deleted class ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== SUBJECTS ====================
router.get('/subjects', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;

  const [{ data: subjectsRaw }, { data: csRaw }] = await Promise.all([
    admin.from('subjects').select('*').is('deleted_at', null).order('code', { ascending: true }),
    admin.from('class_subjects').select('*, classes!inner(name, deleted_at), subjects!inner(name, code, deleted_at), teachers(full_name)').is('classes.deleted_at', null).is('subjects.deleted_at', null),
  ]);

  const classSubjects = (csRaw || []).map((cs: any) => ({
    ...cs,
    class_name: cs.classes?.name || '',
    subject_name: cs.subjects?.name || '',
    subject_code: cs.subjects?.code || '',
    teacher_name: cs.teachers?.full_name || 'Unassigned',
  }));

  const subjects = (subjectsRaw || []).map((s: any) => ({
    ...s,
    assigned_classes: Array.from(new Set(classSubjects.filter((cs) => cs.subject_id === s.id).map((cs) => cs.class_name))).join(', '),
  }));

  return res.json({ subjects, classSubjects });
});

router.post('/subjects', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { name, code, total_marks, passing_marks, description, class_id, teacher_id } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Subject name and code are required.' });
    const { data: created, error } = await admin
      .from('subjects')
      .insert({
        name: name.trim(),
        code: code.trim(),
        total_marks: Number(total_marks || 100),
        passing_marks: Number(passing_marks || 33),
        description: description || '',
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to add subject' });

    if (class_id) {
      await admin.from('class_subjects').upsert(
        {
          class_id,
          subject_id: created.id,
          teacher_id: teacher_id || null,
          total_marks: Number(total_marks || 100),
          passing_marks: Number(passing_marks || 33),
        },
        { onConflict: 'class_id,subject_id' }
      );
      if (teacher_id) {
        await admin.from('teacher_assignments').upsert(
          { teacher_id, class_id, subject_id: created.id },
          { onConflict: 'teacher_id,class_id,subject_id' }
        );
      }
    }
    await logActivity(req.user!, 'SUBJECT_CREATED', 'subjects', created.id, `Created subject ${name} (${code})`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to add subject' });
  }
});

router.put('/subjects/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { name, code, total_marks, passing_marks, description } = req.body;
  const payload: Record<string, any> = {};
  if (name !== undefined) payload.name = name;
  if (code !== undefined) payload.code = code;
  if (total_marks !== undefined) payload.total_marks = Number(total_marks);
  if (passing_marks !== undefined) payload.passing_marks = Number(passing_marks);
  if (description !== undefined) payload.description = description;

  const { error } = await admin.from('subjects').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'SUBJECT_UPDATED', 'subjects', id, `Updated subject ${id}`, req.ip);
  return res.json({ success: true });
});

router.post('/subjects/assign', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { class_id, subject_id, teacher_id, total_marks, passing_marks } = req.body;
  if (!class_id || !subject_id) return res.status(400).json({ error: 'Class and Subject are required.' });

  const { error: csErr } = await admin.from('class_subjects').upsert(
    {
      class_id,
      subject_id,
      teacher_id: teacher_id || null,
      total_marks: Number(total_marks || 100),
      passing_marks: Number(passing_marks || 33),
    },
    { onConflict: 'class_id,subject_id' }
  );
  if (csErr) return res.status(400).json({ error: csErr.message });
  if (teacher_id) {
    const { error: taErr } = await admin.from('teacher_assignments').upsert(
      { teacher_id, class_id, subject_id },
      { onConflict: 'teacher_id,class_id,subject_id' }
    );
    if (taErr) return res.status(400).json({ error: taErr.message });
  }
  await logActivity(req.user!, 'SUBJECT_ASSIGNED', 'subjects', `${class_id}-${subject_id}`, `Assigned subject ${subject_id} to class ${class_id}`, req.ip);
  return res.json({ success: true });
});

router.delete('/subjects/assign/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { error } = await admin.from('class_subjects').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ success: true });
});

router.delete('/subjects/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('subjects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'SUBJECT_DELETED', 'subjects', id, `Deleted subject ${id}`, req.ip);
  return res.json({ success: true });
});

export default router;
