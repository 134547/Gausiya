import { Router } from 'express';
import multer from 'multer';
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  createSupabaseAuthClient,
  isSupabaseServerConfigured,
  requireSupabaseAdmin,
  resolveStorageUrl,
  resolveStorageUrlsInRows,
  supabaseAdmin,
} from '../supabase.ts';
import { saveUploadedAsset } from '../imgbb.ts';
import { logActivity, notifyRoles } from '../auth.ts';
import {
  TOO_MANY_ATTEMPTS_MESSAGE,
  checkIpRateLimit,
  clearFailedLoginAttempts,
  precheckLoginAttempt,
  recordFailedLoginAttempt,
} from '../bruteForce.ts';
import {
  STUDENT_PENDING_LOGIN_MESSAGE,
  STUDENT_REJECTED_LOGIN_MESSAGE,
  getStudentApprovalState,
  provisionStudentAdmissionAccount,
} from '../studentProvisioning.ts';

const router = Router();

router.get('/config', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    supabaseClientConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    supabaseServerConfigured: isSupabaseServerConfigured,
  });
});

const publicUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isImageExt = /\.(png|jpe?g|gif|webp|bmp|avif|jfif)$/i.test(file.originalname || '');
    if (file.mimetype.startsWith('image/') || isImageExt) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

export function normalizeStorageRef(url: string | null | undefined): string {
  if (!url) return '';
  const signMatch = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/);
  if (signMatch) {
    return `supabase://${signMatch[1]}/${decodeURIComponent(signMatch[2])}`;
  }
  return url;
}

export function sanitizeOrTerm(val: string | null | undefined): string {
  return String(val || '')
    .replace(/[,()"'\\%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ADMISSION_SETTING_ENTITY_ID = '00000000-0000-0000-0000-000000000001';
const ADMISSION_SETTING_TITLE = 'ADMISSIONS_PORTAL_STATUS';

export async function getAdmissionsOpen(admin: NonNullable<typeof supabaseAdmin>): Promise<boolean> {
  const { data: colRow, error: colErr } = await admin
    .from('madrasa_settings')
    .select('admissions_open')
    .eq('id', 1)
    .maybeSingle();

  if (!colErr && typeof (colRow as any)?.admissions_open === 'boolean') {
    return (colRow as any).admissions_open;
  }

  const { data: docRow } = await admin
    .from('documents')
    .select('file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', ADMISSION_SETTING_ENTITY_ID)
    .eq('title', ADMISSION_SETTING_TITLE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docRow?.file_url === 'closed') return false;
  return true;
}

export async function setAdmissionsOpen(admin: NonNullable<typeof supabaseAdmin>, open: boolean): Promise<boolean> {
  const { error: colErr } = await admin
    .from('madrasa_settings')
    .update({ admissions_open: open })
    .eq('id', 1);

  if (!colErr) {
    return open;
  }

  await admin
    .from('documents')
    .delete()
    .eq('entity_type', 'general')
    .eq('entity_id', ADMISSION_SETTING_ENTITY_ID)
    .eq('title', ADMISSION_SETTING_TITLE);

  const { error: insErr } = await admin.from('documents').insert({
    entity_type: 'general',
    entity_id: ADMISSION_SETTING_ENTITY_ID,
    title: ADMISSION_SETTING_TITLE,
    file_url: open ? 'open' : 'closed',
    file_type: 'system_setting',
  });

  if (insErr) {
    throw new Error(insErr.message);
  }
  return open;
}

const RESULT_SETTING_ENTITY_ID = '00000000-0000-0000-0000-000000000002';
const RESULT_SETTING_TITLE = 'RESULTS_PORTAL_STATUS';

export async function getResultsOpen(admin: NonNullable<typeof supabaseAdmin>): Promise<boolean> {
  const { data: colRow, error: colErr } = await admin
    .from('madrasa_settings')
    .select('results_open')
    .eq('id', 1)
    .maybeSingle();

  if (!colErr && typeof (colRow as any)?.results_open === 'boolean') {
    return (colRow as any).results_open;
  }

  const { data: docRow } = await admin
    .from('documents')
    .select('file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', RESULT_SETTING_ENTITY_ID)
    .eq('title', RESULT_SETTING_TITLE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docRow?.file_url === 'closed') return false;
  return true;
}

export async function setResultsOpen(admin: NonNullable<typeof supabaseAdmin>, open: boolean): Promise<boolean> {
  const { error: colErr } = await admin
    .from('madrasa_settings')
    .update({ results_open: open })
    .eq('id', 1);

  if (!colErr) {
    return open;
  }

  await admin
    .from('documents')
    .delete()
    .eq('entity_type', 'general')
    .eq('entity_id', RESULT_SETTING_ENTITY_ID)
    .eq('title', RESULT_SETTING_TITLE);

  const { error: insErr } = await admin.from('documents').insert({
    entity_type: 'general',
    entity_id: RESULT_SETTING_ENTITY_ID,
    title: RESULT_SETTING_TITLE,
    file_url: open ? 'open' : 'closed',
    file_type: 'system_setting',
  });

  if (insErr) {
    throw new Error(insErr.message);
  }
  return open;
}

const CHAT_SETTING_ENTITY_ID = '00000000-0000-0000-0000-000000000003';
const CHAT_SETTING_TITLE = 'CHATS_PORTAL_STATUS';

export async function getChatsOpen(admin: NonNullable<typeof supabaseAdmin>): Promise<boolean> {
  const { data: colRow, error: colErr } = await admin
    .from('madrasa_settings')
    .select('chats_open')
    .eq('id', 1)
    .maybeSingle();

  if (!colErr && typeof (colRow as any)?.chats_open === 'boolean') {
    return (colRow as any).chats_open;
  }

  const { data: docRow } = await admin
    .from('documents')
    .select('file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', CHAT_SETTING_ENTITY_ID)
    .eq('title', CHAT_SETTING_TITLE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docRow?.file_url === 'closed') return false;
  return true;
}

export async function setChatsOpen(admin: NonNullable<typeof supabaseAdmin>, open: boolean): Promise<boolean> {
  const { error: colErr } = await admin
    .from('madrasa_settings')
    .update({ chats_open: open })
    .eq('id', 1);

  if (!colErr) {
    return open;
  }

  await admin
    .from('documents')
    .delete()
    .eq('entity_type', 'general')
    .eq('entity_id', CHAT_SETTING_ENTITY_ID)
    .eq('title', CHAT_SETTING_TITLE);

  const { error: insErr } = await admin.from('documents').insert({
    entity_type: 'general',
    entity_id: CHAT_SETTING_ENTITY_ID,
    title: CHAT_SETTING_TITLE,
    file_url: open ? 'open' : 'closed',
    file_type: 'system_setting',
  });

  if (insErr) {
    throw new Error(insErr.message);
  }
  return open;
}

router.get('/home', async (_req, res) => {
  try {
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.json({
        supabaseConfigured: false,
        settings: null,
        classes: [],
        notices: [],
        exams: [],
        feedPosts: [],
        committee: [],
        publicResults: false,
      });
    }

    const [
      { data: settings },
      { data: classes },
      { data: notices },
      { data: examsRaw },
      { data: feedRaw },
      { data: committeeRaw },
      { count: publishedCount },
      admissionsOpenFlag,
      resultsOpenFlag,
    ] = await Promise.all([
      supabaseAdmin
        .from('madrasa_settings')
        .select('name, name_urdu, address, address_urdu, phone, email, website, logo_url')
        .eq('id', 1)
        .maybeSingle(),
      supabaseAdmin
        .from('classes')
        .select('id, name, code, room_no')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('code', { ascending: true }),
      supabaseAdmin
        .from('notices')
        .select('id, title, description, category, publish_date, attachment_url, attachment_name')
        .is('deleted_at', null)
        .eq('target_audience', 'all')
        .order('created_at', { ascending: false })
        .limit(6),
      supabaseAdmin
        .from('examinations')
        .select('id, name, exam_type, start_date, end_date, status, classes(name)')
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(6),
      supabaseAdmin
        .from('feed_posts')
        .select('id, title, content, images_json, likes_count, created_at, profiles(full_name, roles(name))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(4),
      supabaseAdmin
        .from('committee_members')
        .select('id, full_name, designation, mobile, photo_url, description')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('display_order', { ascending: true }),
      supabaseAdmin
        .from('results')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true),
      getAdmissionsOpen(supabaseAdmin),
      getResultsOpen(supabaseAdmin),
    ]);

    if (settings?.logo_url) {
      settings.logo_url = await resolveStorageUrl(settings.logo_url);
    }

    const exams = (examsRaw || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      exam_type: e.exam_type,
      start_date: e.start_date,
      end_date: e.end_date,
      status: e.status,
      class_name: e.classes?.name || '',
    }));

    const resolvedNotices = await resolveStorageUrlsInRows(notices || [], ['attachment_url']);

    const feedPosts = await Promise.all(
      (feedRaw || []).map(async (fp: any) => {
        let imgs: string[] = [];
        try {
          imgs = typeof fp.images_json === 'string' ? JSON.parse(fp.images_json || '[]') : Array.isArray(fp.images_json) ? fp.images_json : [];
        } catch {
          imgs = [];
        }
        const resolvedImgs = await Promise.all(imgs.map((u) => resolveStorageUrl(u)));
        return {
          id: fp.id,
          title: fp.title,
          content: fp.content,
          images_json: JSON.stringify(resolvedImgs),
          likes_count: fp.likes_count,
          created_at: fp.created_at,
          author_name: fp.profiles?.full_name || 'Administration',
          author_role: fp.profiles?.roles?.name || 'Admin',
        };
      })
    );

    const committee = await resolveStorageUrlsInRows(committeeRaw || [], ['photo_url']);

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    return res.json({
      supabaseConfigured: true,
      settings: settings ? { ...settings, admissions_open: admissionsOpenFlag, results_open: resultsOpenFlag } : null,
      admissionsOpen: admissionsOpenFlag,
      resultsOpen: resultsOpenFlag,
      classes: classes || [],
      notices: resolvedNotices,
      exams,
      feedPosts,
      committee,
      publicResults: (publishedCount || 0) > 0,
    });
  } catch (err) {
    console.error('Public home error:', err);
    return res.status(500).json({ error: 'Failed to load public portal data' });
  }
});

router.post('/upload', publicUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const uploaded = await saveUploadedAsset({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      bucket: 'admission-documents',
      folder: 'public-applicants',
    });

    return res.json({
      url: uploaded.url,
      storedRef: uploaded.storedRef,
      provider: uploaded.provider,
      name: req.file.originalname,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    return res.status(status).json({ error: err?.message || 'Upload failed' });
  }
});

router.post('/admission', async (req, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;

    const admissionsOpen = await getAdmissionsOpen(admin);
    if (!admissionsOpen) {
      return res.status(403).json({
        error: 'Online admissions are currently closed by Madrasa administration.',
      });
    }

    const {
      student_name,
      father_name,
      mother_name,
      dob,
      gender,
      address,
      village,
      district,
      state,
      pin_code,
      student_mobile,
      guardian_name,
      guardian_relationship,
      guardian_mobile,
      previous_school,
      previous_class,
      admission_class_id,
      photo_url,
      remarks,
    } = req.body as Record<string, any>;

    if (!student_name?.trim() || !father_name?.trim() || !guardian_mobile?.trim()) {
      return res.status(400).json({ error: 'Student name, father name, and guardian mobile number are required.' });
    }

    const result = await provisionStudentAdmissionAccount(admin, {
      student_name,
      father_name,
      mother_name,
      dob,
      gender,
      address,
      village,
      district,
      state,
      pin_code,
      student_mobile,
      guardian_name,
      guardian_relationship,
      guardian_mobile,
      previous_school,
      previous_class,
      admission_class_id: admission_class_id || null,
      photo_ref: normalizeStorageRef(photo_url),
      remarks: remarks || 'Submitted via Online Home Page',
    });

    await notifyRoles(
      ['super_admin'],
      'admission',
      'New Student Admission Pending Approval',
      `${result.student_name} (Ref: ${result.reference_no}, Username: @${result.username}) applied online${result.class_name !== 'To be assigned' ? ` for ${result.class_name}` : ''}.`,
      'admissions',
      result.id
    );
    await logActivity(
      { id: null, username: 'public_applicant', role_name: 'Public' },
      'PUBLIC_ADMISSION_SUBMITTED',
      'admissions',
      result.id ?? undefined,
      `Online admission Ref ${result.reference_no} created pending student @${result.username}`,
      req.ip
    );

    return res.status(201).json(result);
  } catch (err: any) {
    console.error('Public admission error:', err);
    const statusCode = typeof err?.status === 'number' ? err.status : 400;
    return res.status(statusCode).json({ error: err?.message || 'Failed to submit admission application' });
  }
});

router.post('/admission-status', async (req, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;

    const admissionsOpen = await getAdmissionsOpen(admin);
    if (!admissionsOpen) {
      return res.status(403).json({
        error: 'Online admissions and status checking are currently turned off by Madrasa administration.',
      });
    }

    const { reference_no, mobile } = req.body as { reference_no?: string; mobile?: string };
    const cleanRef = sanitizeOrTerm(reference_no);
    const cleanMobileDigits = String(mobile || '').replace(/\D/g, '').slice(-10);

    if (!cleanRef || cleanMobileDigits.length < 6) {
      return res.status(400).json({
        error: 'Please enter a valid Reference Number and registered Mobile Number.',
      });
    }

    let { data: adm } = await admin
      .from('admissions')
      .select('*, classes(name)')
      .ilike('admission_no', cleanRef)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let linkedStudent: any = null;
    if (!adm) {
      const { data: st } = await admin
        .from('students')
        .select('id, student_code, admission_no, classes(name)')
        .or(`admission_no.ilike.${cleanRef},student_code.ilike.${cleanRef}`)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (st?.id) {
        linkedStudent = st;
        const { data: linkedAdm } = await admin
          .from('admissions')
          .select('*, classes(name)')
          .eq('student_id', st.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        adm = linkedAdm;
      }
    } else if (adm.student_id) {
      const { data: st } = await admin
        .from('students')
        .select('id, student_code, admission_no, classes(name)')
        .eq('id', adm.student_id)
        .is('deleted_at', null)
        .maybeSingle();
      linkedStudent = st;
    }

    if (!adm) {
      return res.status(404).json({
        error: 'No admission application found for this Reference Number and Mobile Number.',
      });
    }

    const norm = (val: string | null | undefined) => String(val || '').replace(/\D/g, '').slice(-10);
    const gDigits = norm(adm.guardian_mobile);
    const sDigits = norm(adm.student_mobile);
    const matchesMobile =
      (gDigits.length >= 6 && gDigits === cleanMobileDigits) ||
      (sDigits.length >= 6 && sDigits === cleanMobileDigits);

    if (!matchesMobile) {
      return res.status(404).json({
        error: 'No admission application found for this Reference Number and Mobile Number.',
      });
    }

    const resolvedPhoto = adm.photo_url ? await resolveStorageUrl(adm.photo_url) : '';
    const className = linkedStudent?.classes?.name || (adm as any).classes?.name || 'To be assigned';
    const rejectionReason =
      adm.rejection_reason ||
      (adm.status === 'rejected' ? adm.remarks || '' : '');

    return res.json({
      id: adm.id,
      reference_no: adm.admission_no,
      admission_no: adm.admission_no,
      official_admission_no: linkedStudent?.admission_no || adm.admission_number || '',
      student_code: linkedStudent?.student_code || '',
      status: adm.status || 'pending',
      approval_status: adm.approval_status || adm.status || 'pending',
      rejection_reason: rejectionReason,
      student_name: adm.student_name,
      father_name: adm.father_name,
      mother_name: adm.mother_name || '',
      dob: adm.dob || '',
      gender: adm.gender || 'Male',
      religion: adm.religion || 'Islam',
      guardian_name: adm.guardian_name || adm.father_name,
      guardian_relationship: adm.guardian_relationship || 'Father',
      guardian_mobile: adm.guardian_mobile || '',
      student_mobile: adm.student_mobile || '',
      previous_school: adm.previous_school || '',
      previous_class: adm.previous_class || '',
      address: adm.address || '',
      village: adm.village || '',
      district: adm.district || 'Palamu',
      state: adm.state || 'Jharkhand',
      pin_code: adm.pin_code || '',
      class_name: className,
      admission_date: adm.admission_date || '',
      reviewed_at: adm.reviewed_at || adm.rejected_at || adm.approved_at || '',
      remarks: adm.remarks || '',
      photo_url: resolvedPhoto,
    });
  } catch (err: any) {
    console.error('Admission status check error:', err);
    return res.status(500).json({ error: 'Failed to check admission status' });
  }
});

router.post('/check-result', async (req, res) => {
  try {
    if (!checkIpRateLimit(req, res, 'result_login', 15)) return;

    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (!(await getResultsOpen(admin))) {
      return res.status(403).json({
        error: 'Online result checking is currently turned off by Madrasa administration.',
      });
    }
    const authClient = createSupabaseAuthClient();
    if (!authClient) return res.status(503).json({ error: 'Supabase auth client unavailable' });

    const { username, password, captchaToken, captchaAnswer } = req.body as {
      username?: string;
      password?: string;
      captchaToken?: string;
      captchaAnswer?: string;
    };
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Student username (or ID/email) and password are required.' });
    }

    const clean = username.trim();
    const precheck = await precheckLoginAttempt(req, 'result_login', clean, captchaToken, captchaAnswer);
    if (!precheck.allowed) {
      if (precheck.retryAfterSeconds) {
        res.setHeader('Retry-After', String(precheck.retryAfterSeconds));
      }
      return res.status(precheck.statusCode || 429).json(precheck.body);
    }

    const handleFailure = async () => {
      const fail = await recordFailedLoginAttempt(req, 'result_login', clean);
      if (fail.locked) {
        if (fail.retryAfterSeconds) {
          res.setHeader('Retry-After', String(fail.retryAfterSeconds));
        }
        return res.status(429).json({
          error: TOO_MANY_ATTEMPTS_MESSAGE,
          code: 'TOO_MANY_ATTEMPTS',
          lockedUntil: fail.lockedUntil,
          retryAfterSeconds: fail.retryAfterSeconds,
          attemptsRemaining: 0,
          captchaRequired: false,
        });
      }
      return res.status(401).json({
        error: 'Invalid student username or password.',
        code: 'INVALID_CREDENTIALS',
        attemptsRemaining: fail.attemptsRemaining,
        captchaRequired: fail.captchaRequired,
        captcha: fail.captcha,
      });
    };

    let profileRow: { id: string; email: string; status?: string; linked_type: string | null; linked_id: string | null } | null = null;

    if (clean.includes('@')) {
      const { data } = await admin
        .from('profiles')
        .select('id, email, status, linked_type, linked_id')
        .eq('email', clean)
        .is('deleted_at', null)
        .maybeSingle();
      profileRow = data;
    } else {
      const safeClean = sanitizeOrTerm(clean);
      if (safeClean) {
        const { data } = await admin
          .from('profiles')
          .select('id, email, status, linked_type, linked_id')
          .or(`username.eq.${safeClean},username.eq.${safeClean.toLowerCase()},user_code.eq.${safeClean.toUpperCase()}`)
          .is('deleted_at', null)
          .maybeSingle();
        profileRow = data;
      }

      if (!profileRow) {
        const { data: stByCode } = await admin
          .from('students')
          .select('id, user_id')
          .eq('student_code', clean)
          .is('deleted_at', null)
          .maybeSingle();
        if (stByCode?.user_id) {
          const { data: p } = await admin
            .from('profiles')
            .select('id, email, status, linked_type, linked_id')
            .eq('id', stByCode.user_id)
            .is('deleted_at', null)
            .maybeSingle();
          profileRow = p;
        }
      }
    }

    if (!profileRow?.email) {
      return handleFailure();
    }

    // Verify password strictly via Supabase Auth
    const { error: signInErr } = await authClient.auth.signInWithPassword({
      email: profileRow.email,
      password,
    });
    if (signInErr) {
      return handleFailure();
    }

    await clearFailedLoginAttempts(req, 'result_login', clean);

    const approvalState = await getStudentApprovalState(admin, profileRow, 'student');
    if (approvalState === 'pending') {
      return res.status(403).json({ error: STUDENT_PENDING_LOGIN_MESSAGE, code: 'ADMISSION_PENDING' });
    }
    if (approvalState === 'rejected') {
      return res.status(403).json({ error: STUDENT_REJECTED_LOGIN_MESSAGE, code: 'ADMISSION_REJECTED' });
    }

    let studentId: string | null = profileRow.linked_type === 'student' ? profileRow.linked_id : null;
    if (!studentId) {
      const { data: st } = await admin
        .from('students')
        .select('id')
        .eq('user_id', profileRow.id)
        .is('deleted_at', null)
        .maybeSingle();
      studentId = st?.id || null;
    }

    if (!studentId) {
      return res.status(404).json({ error: 'No student academic record linked to this account.' });
    }

    const { data: studentRaw } = await admin
      .from('students')
      .select('*, classes(name)')
      .eq('id', studentId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!studentRaw) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const student = {
      ...studentRaw,
      photo_url: await resolveStorageUrl(studentRaw.photo_url),
      class_name: (studentRaw as any).classes?.name || 'Unassigned',
    };

    const { data: resultsRaw } = await admin
      .from('results')
      .select('*, examinations!inner(name, exam_type, start_date, deleted_at)')
      .eq('student_id', studentId)
      .eq('is_published', true)
      .is('examinations.deleted_at', null)
      .order('created_at', { ascending: false });

    const { data: marksRaw } = await admin
      .from('marks')
      .select('*, subjects(name, passing_marks)')
      .eq('student_id', studentId);

    const results = (resultsRaw || []).map((r: any) => ({
      ...r,
      exam_name: r.examinations?.name || '',
      exam_type: r.examinations?.exam_type || '',
      start_date: r.examinations?.start_date || '',
      subject_marks: (marksRaw || [])
        .filter((m: any) => m.examination_id === r.examination_id)
        .map((m: any) => ({
          ...m,
          subject_name: m.subjects?.name || '',
          passing_marks: m.subjects?.passing_marks ?? 33,
        }))
        .sort((a: any, b: any) => a.subject_name.localeCompare(b.subject_name)),
    }));

    const { data: attRows } = await admin
      .from('attendance')
      .select('status')
      .eq('student_id', studentId);

    const attendanceSummary = {
      total: (attRows || []).length,
      present: (attRows || []).filter((a) => a.status === 'present').length,
      absent: (attRows || []).filter((a) => a.status === 'absent').length,
      late: (attRows || []).filter((a) => a.status === 'late').length,
      on_leave: (attRows || []).filter((a) => a.status === 'leave').length,
    };

    return res.json({ student, results, attendanceSummary });
  } catch (err) {
    console.error('Public result check error:', err);
    return res.status(500).json({ error: 'Failed to retrieve result' });
  }
});

router.get('/image-data', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'Missing url parameter' });

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'Unsupported protocol' });
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.endsWith('.local') ||
      host === '::1' ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return res.status(403).json({ error: 'Blocked host' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(parsed.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(404).json({ error: 'Image unavailable' });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'Not an image resource' });
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large' });
    }
    const dataUrl = `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`;
    return res.json({ dataUrl });
  } catch {
    return res.status(500).json({ error: 'Failed to load image' });
  }
});

export default router;
