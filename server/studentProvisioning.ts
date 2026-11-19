import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStorageUrl } from './supabase.ts';

export const STUDENT_PENDING_LOGIN_MESSAGE =
  'Your admission application is currently pending approval from the Super Admin. You will be able to access your Student Dashboard once your admission is approved.';

export const STUDENT_REJECTED_LOGIN_MESSAGE =
  'Your admission application has been rejected. Please contact the Madrasa Administration for further information.';

const OPTIONAL_SCHEMA_COLUMNS = [
  'auth_user_id',
  'approval_status',
  'approved_by',
  'approved_at',
  'rejected_by',
  'rejected_at',
  'rejection_reason',
  'admission_number',
  'username',
] as const;

export function buildStudentInternalEmail(username: string): string {
  return `${username.toLowerCase()}@student.madrasa.local`;
}

export function generateSecureTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*';
  const all = upper + lower + digits + symbols;

  const chars: string[] = [
    upper[crypto.randomInt(upper.length)],
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];
  for (let i = chars.length; i < 10; i += 1) {
    chars.push(all[crypto.randomInt(all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

export async function ensureStudentRole(admin: SupabaseClient): Promise<{ id: string; name: string; slug: string }> {
  const { data: existing } = await admin.from('roles').select('id, name, slug').eq('slug', 'student').maybeSingle();
  if (existing?.id) return existing;

  const { data: created, error } = await admin
    .from('roles')
    .upsert(
      {
        name: 'Student',
        slug: 'student',
        description: 'View own profile, attendance, marks, homework, and notices',
      },
      { onConflict: 'slug' }
    )
    .select('id, name, slug')
    .single();
  if (error || !created) {
    throw new Error(error?.message || 'Student role not configured in database.');
  }
  return created;
}

export async function generateUniqueStudentUsername(admin: SupabaseClient, fullName: string): Promise<string> {
  const tokens = String(fullName || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const first = (tokens[0] || 'student').slice(0, 8);
  const second = (tokens[1] || '').slice(0, 6);
  const stem = second ? `${first}.${second}` : first;
  const yr = String(new Date().getFullYear()).slice(-2);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const num = crypto.randomInt(100, 9999);
    const candidate = `${stem}${yr}${num}`.replace(/[^a-z0-9.]/g, '').slice(0, 24);
    const { data: existingProf } = await admin
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();
    if (existingProf?.id) continue;

    return candidate;
  }

  return `std${Date.now().toString().slice(-8)}${crypto.randomInt(10, 99)}`;
}

function stripMissingColumnsFromPayload(
  payload: Record<string, any>,
  errorMessage: string
): { nextPayload: Record<string, any>; changed: boolean } {
  const next = { ...payload };
  let changed = false;
  const lowerMsg = (errorMessage || '').toLowerCase();

  for (const col of OPTIONAL_SCHEMA_COLUMNS) {
    if (col in next && lowerMsg.includes(col.toLowerCase())) {
      delete next[col];
      changed = true;
    }
  }
  if (!changed && (lowerMsg.includes('schema cache') || lowerMsg.includes('does not exist'))) {
    for (const col of OPTIONAL_SCHEMA_COLUMNS) {
      if (col in next) {
        delete next[col];
        changed = true;
      }
    }
  }
  return { nextPayload: next, changed };
}

export async function safeStudentInsert(
  admin: SupabaseClient,
  payload: Record<string, any>
): Promise<{ id: string }> {
  let current = { ...payload };
  let lastErrorMessage = '';
  const maxAttempts = OPTIONAL_SCHEMA_COLUMNS.length + 6;

  for (let i = 0; i < maxAttempts; i += 1) {
    const { data, error } = await admin.from('students').insert(current).select('id').single();
    if (!error && data?.id) return { id: data.id };

    const msg = error?.message || '';
    if (msg) lastErrorMessage = msg;

    if (msg.includes('students_status_check') && (current.status === 'pending' || current.status === 'disabled')) {
      current = { ...current, status: 'inactive' };
      continue;
    }

    if (msg.toLowerCase().includes('student_code') && msg.toLowerCase().includes('duplicate')) {
      const year = new Date().getFullYear();
      current = { ...current, student_code: `MGR-${year}-${Date.now().toString().slice(-4)}${crypto.randomInt(10, 99)}` };
      continue;
    }

    if (msg.toLowerCase().includes('admission_no') && msg.toLowerCase().includes('duplicate')) {
      const year = new Date().getFullYear();
      current = { ...current, admission_no: `ADM-${year}-${Date.now().toString().slice(-4)}${crypto.randomInt(10, 99)}` };
      continue;
    }

    if (msg.toLowerCase().includes('username') && msg.toLowerCase().includes('duplicate')) {
      current = { ...current, username: null };
      continue;
    }

    const stripped = stripMissingColumnsFromPayload(current, msg);
    if (stripped.changed) {
      current = stripped.nextPayload;
      continue;
    }

    throw new Error(msg || 'Failed to create student record');
  }
  throw new Error(lastErrorMessage || 'Failed to create student record');
}

export async function safeTableUpdate(
  admin: SupabaseClient,
  table: 'profiles' | 'students' | 'admissions',
  id: string,
  payload: Record<string, any>
): Promise<void> {
  let current = { ...payload };
  let lastErrorMessage = '';
  const maxAttempts = OPTIONAL_SCHEMA_COLUMNS.length + 6;

  for (let i = 0; i < maxAttempts; i += 1) {
    if (Object.keys(current).length === 0) return;
    const { error } = await admin.from(table).update(current).eq('id', id);
    if (!error) return;

    const msg = error.message || '';
    if (msg) lastErrorMessage = msg;

    if (
      table === 'students' &&
      msg.includes('students_status_check') &&
      (current.status === 'pending' || current.status === 'disabled')
    ) {
      current = { ...current, status: 'inactive' };
      continue;
    }
    const stripped = stripMissingColumnsFromPayload(current, msg);
    if (stripped.changed) {
      current = stripped.nextPayload;
      continue;
    }
    throw new Error(msg);
  }
  if (lastErrorMessage) throw new Error(lastErrorMessage);
}

export async function safeTableUpsert(
  admin: SupabaseClient,
  table: 'profiles' | 'admissions',
  payload: Record<string, any>,
  onConflict?: string
): Promise<any> {
  let current = { ...payload };
  let lastErrorMessage = '';
  const maxAttempts = OPTIONAL_SCHEMA_COLUMNS.length + 6;

  for (let i = 0; i < maxAttempts; i += 1) {
    const query = onConflict
      ? admin.from(table).upsert(current, { onConflict }).select('*').single()
      : admin.from(table).insert(current).select('*').single();
    const { data, error } = await query;
    if (!error && data) return data;

    const msg = error?.message || '';
    if (msg) lastErrorMessage = msg;

    const stripped = stripMissingColumnsFromPayload(current, msg);
    if (stripped.changed) {
      current = stripped.nextPayload;
      continue;
    }
    throw new Error(msg || `Failed to save ${table} record`);
  }
  throw new Error(lastErrorMessage || `Failed to save ${table} record`);
}

export async function generateNextStudentCodes(admin: SupabaseClient): Promise<{
  studentCode: string;
  officialAdmissionNo: string;
}> {
  const year = new Date().getFullYear();
  const [{ count: studentCount }, { count: admCount }] = await Promise.all([
    admin.from('students').select('id', { count: 'exact', head: true }),
    admin.from('admissions').select('id', { count: 'exact', head: true }),
  ]);

  let seq = Math.max(studentCount || 0, admCount || 0) + 1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidateStudentCode = `MGR-${year}-${String(seq + attempt).padStart(3, '0')}`;
    const candidateAdmissionNo = `ADM-${year}-${String(seq + attempt).padStart(3, '0')}`;

    const [{ data: dupStudent }, { data: dupAdmission }] = await Promise.all([
      admin
        .from('students')
        .select('id')
        .or(`student_code.eq.${candidateStudentCode},admission_no.eq.${candidateAdmissionNo}`)
        .limit(1)
        .maybeSingle(),
      admin
        .from('admissions')
        .select('id')
        .eq('admission_no', candidateAdmissionNo)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!dupStudent && !dupAdmission) {
      return {
        studentCode: candidateStudentCode,
        officialAdmissionNo: candidateAdmissionNo,
      };
    }
  }

  const suffix = `${Date.now().toString().slice(-4)}${crypto.randomInt(10, 99)}`;
  return {
    studentCode: `MGR-${year}-${suffix}`,
    officialAdmissionNo: `ADM-${year}-${suffix}`,
  };
}

export interface StudentAdmissionInput {
  student_name: string;
  father_name: string;
  mother_name?: string;
  dob?: string;
  gender?: string;
  religion?: string;
  address?: string;
  village?: string;
  district?: string;
  state?: string;
  pin_code?: string;
  student_mobile?: string;
  guardian_name?: string;
  guardian_relationship?: string;
  guardian_mobile: string;
  previous_school?: string;
  previous_class?: string;
  admission_class_id?: string | null;
  admission_date?: string;
  photo_ref?: string;
  documents?: { name: string; url: string }[];
  remarks?: string;
  reference_no?: string;
}

export async function provisionStudentAdmissionAccount(
  admin: SupabaseClient,
  input: StudentAdmissionInput
) {
  const cleanStudentName = input.student_name.trim();
  const cleanFatherName = input.father_name.trim();
  const cleanGuardianName = (input.guardian_name || cleanFatherName).trim();
  const cleanGuardianMobile = input.guardian_mobile.trim();
  const cleanStudentMobile = (input.student_mobile || cleanGuardianMobile).trim();
  const guardianDigits = cleanGuardianMobile.replace(/\D/g, '').slice(-10);

  // Prevent duplicate active/pending applications for the same student + father + guardian mobile
  if (guardianDigits.length >= 6) {
    const { data: candidates } = await admin
      .from('admissions')
      .select('id, admission_no, student_name, father_name, guardian_mobile, status')
      .is('deleted_at', null)
      .in('status', ['pending', 'approved'])
      .ilike('student_name', cleanStudentName)
      .ilike('father_name', cleanFatherName)
      .limit(10);

    const dup = (candidates || []).find(
      (c: any) => String(c.guardian_mobile || '').replace(/\D/g, '').slice(-10) === guardianDigits
    );
    if (dup) {
      const err: any = new Error(
        `An admission application (Ref: ${dup.admission_no}, Status: ${dup.status}) already exists for ${cleanStudentName}. Please use Check Admission Status.`
      );
      err.status = 409;
      throw err;
    }
  }

  const studentRole = await ensureStudentRole(admin);
  const { data: activeSession } = await admin
    .from('academic_sessions')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const today = input.admission_date || new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();

  const { count: admCount } = await admin.from('admissions').select('id', { count: 'exact', head: true });
  let referenceNo = (input.reference_no || '').trim();
  if (!referenceNo) {
    const seq = 1000 + (admCount || 0) + 1;
    referenceNo = `REF-${year}-${seq}`;
    const { data: dupRef } = await admin
      .from('admissions')
      .select('id')
      .eq('admission_no', referenceNo)
      .maybeSingle();
    if (dupRef) {
      referenceNo = `REF-${year}-${seq}${crypto.randomInt(100, 999)}`;
    }
  }

  const username = await generateUniqueStudentUsername(admin, cleanStudentName);
  const temporaryPassword = generateSecureTempPassword();
  const internalEmail = buildStudentInternalEmail(username);
  const { studentCode } = await generateNextStudentCodes(admin);

  let createdAuthId: string | null = null;
  let createdStudentId: string | null = null;
  let createdAdmissionId: string | null = null;

  try {
    // 1. Create Supabase Auth account immediately (login blocked on backend until Super Admin approval)
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: internalEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: cleanStudentName,
        username,
        account_type: 'student',
      },
    });
    if (authErr || !authData?.user) {
      throw new Error(authErr?.message || 'Failed to create student authentication account.');
    }
    createdAuthId = authData.user.id;

    // 2. Create pending profile linked to student role
    const userCode = `STU-${String(Date.now()).slice(-6)}`;
    await safeTableUpsert(
      admin,
      'profiles',
      {
        id: createdAuthId,
        user_code: userCode,
        username,
        email: internalEmail,
        mobile: cleanStudentMobile,
        full_name: cleanStudentName,
        father_name: cleanFatherName,
        dob: input.dob || '',
        gender: input.gender || 'Male',
        address: input.address || '',
        village: input.village || '',
        district: input.district || 'Palamu',
        state: input.state || 'Jharkhand',
        pin_code: input.pin_code || '',
        photo_url: input.photo_ref || '',
        role_id: studentRole.id,
        status: 'pending',
        approval_status: 'pending',
        linked_type: 'student',
        auth_user_id: createdAuthId,
        deleted_at: null,
      },
      'id'
    );

    // 3. Create student dashboard record immediately (pending approval, no official ADM number yet)
    const stRow = await safeStudentInsert(admin, {
      student_code: studentCode,
      admission_no: null,
      admission_number: null,
      username,
      full_name: cleanStudentName,
      father_name: cleanFatherName,
      mother_name: input.mother_name || '',
      dob: input.dob || '',
      gender: input.gender || 'Male',
      religion: input.religion || 'Islam',
      address: input.address || '',
      village: input.village || '',
      district: input.district || 'Palamu',
      state: input.state || 'Jharkhand',
      pin_code: input.pin_code || '',
      mobile: cleanStudentMobile,
      class_id: input.admission_class_id || null,
      academic_session_id: activeSession?.id || null,
      admission_date: today,
      photo_url: input.photo_ref || '',
      status: 'pending',
      approval_status: 'pending',
      previous_school: input.previous_school || '',
      previous_class: input.previous_class || '',
      remarks: input.remarks || 'Submitted via Online Admission Form',
      user_id: createdAuthId,
      auth_user_id: createdAuthId,
    });
    createdStudentId = stRow.id;

    // 4. Link profile -> student
    await safeTableUpdate(admin, 'profiles', createdAuthId, {
      linked_id: createdStudentId,
      linked_type: 'student',
    });

    // 5. Link guardian/parent record
    let parentId: string | null = null;
    const { data: existingParent } = await admin
      .from('parents')
      .select('id')
      .eq('mobile', cleanGuardianMobile)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingParent?.id) {
      parentId = existingParent.id;
    } else {
      const { count: pCount } = await admin.from('parents').select('id', { count: 'exact', head: true });
      const pCode = `PAR-${200 + (pCount || 0) + 1}`;
      const { data: newParent } = await admin
        .from('parents')
        .insert({
          parent_code: pCode,
          full_name: cleanGuardianName,
          mobile: cleanGuardianMobile,
          address: input.address || '',
          relationship: input.guardian_relationship || 'Father',
          status: 'active',
        })
        .select('id')
        .single();
      parentId = newParent?.id || null;
    }
    if (parentId) {
      await admin.from('student_guardians').upsert(
        {
          student_id: createdStudentId,
          parent_id: parentId,
          relationship: input.guardian_relationship || 'Father',
          is_primary: true,
        },
        { onConflict: 'student_id,parent_id' }
      );
    }

    // 6. Create pending admission application linked to student and auth account
    const insertedAdm = await safeTableUpsert(admin, 'admissions', {
      admission_no: referenceNo,
      admission_number: null,
      username,
      auth_user_id: createdAuthId,
      student_id: createdStudentId,
      student_name: cleanStudentName,
      father_name: cleanFatherName,
      mother_name: input.mother_name || '',
      dob: input.dob || '',
      gender: input.gender || 'Male',
      religion: input.religion || 'Islam',
      address: input.address || '',
      village: input.village || '',
      district: input.district || 'Palamu',
      state: input.state || 'Jharkhand',
      pin_code: input.pin_code || '',
      student_mobile: cleanStudentMobile,
      guardian_name: cleanGuardianName,
      guardian_relationship: input.guardian_relationship || 'Father',
      guardian_mobile: cleanGuardianMobile,
      previous_school: input.previous_school || '',
      previous_class: input.previous_class || '',
      admission_date: today,
      admission_class_id: input.admission_class_id || null,
      photo_url: input.photo_ref || '',
      documents_json: Array.isArray(input.documents) ? input.documents : [],
      remarks: input.remarks || 'Submitted via Online Home Page',
      status: 'pending',
      approval_status: 'pending',
    });
    createdAdmissionId = insertedAdm.id;

    let className = 'To be assigned';
    if (input.admission_class_id) {
      const { data: cls } = await admin
        .from('classes')
        .select('name')
        .eq('id', input.admission_class_id)
        .maybeSingle();
      if (cls?.name) className = cls.name;
    }

    const resolvedPhotoUrl = input.photo_ref ? await resolveStorageUrl(input.photo_ref) : '';

    return {
      id: createdAdmissionId,
      student_id: createdStudentId,
      reference_no: referenceNo,
      admission_no: referenceNo,
      official_admission_no: '',
      student_code: studentCode,
      username,
      temporary_password: temporaryPassword,
      account_status: 'pending',
      student_name: cleanStudentName,
      father_name: cleanFatherName,
      mother_name: input.mother_name || '',
      dob: input.dob || '',
      gender: input.gender || 'Male',
      religion: input.religion || 'Islam',
      address: input.address || '',
      village: input.village || '',
      district: input.district || 'Palamu',
      state: input.state || 'Jharkhand',
      pin_code: input.pin_code || '',
      student_mobile: cleanStudentMobile,
      guardian_name: cleanGuardianName,
      guardian_relationship: input.guardian_relationship || 'Father',
      guardian_mobile: cleanGuardianMobile,
      previous_school: input.previous_school || '',
      previous_class: input.previous_class || '',
      class_name: className,
      admission_date: today,
      photo_url: resolvedPhotoUrl,
      remarks: input.remarks || 'Submitted via Online Home Page',
      status: 'pending',
    };
  } catch (err) {
    // Safe rollback if any step fails so we never leave orphan auth/student records
    if (createdAdmissionId) {
      try { await admin.from('admissions').delete().eq('id', createdAdmissionId); } catch {}
    }
    if (createdStudentId) {
      try { await admin.from('student_guardians').delete().eq('student_id', createdStudentId); } catch {}
      try { await admin.from('students').delete().eq('id', createdStudentId); } catch {}
    }
    if (createdAuthId) {
      try { await admin.from('profiles').delete().eq('id', createdAuthId); } catch {}
      try { await admin.auth.admin.deleteUser(createdAuthId); } catch {}
    }
    throw err;
  }
}

export async function getStudentApprovalState(
  admin: SupabaseClient,
  profile: {
    id: string;
    status?: string | null;
    linked_type?: string | null;
    linked_id?: string | null;
    approval_status?: string | null;
  },
  roleSlug?: string | null
): Promise<'approved' | 'pending' | 'rejected'> {
  const isStudentAccount = roleSlug === 'student' || profile.linked_type === 'student';
  if (!isStudentAccount) {
    if (profile.status === 'pending') return 'pending';
    if (profile.status !== 'active') return 'rejected';
    return 'approved';
  }

  if (profile.approval_status === 'rejected') return 'rejected';
  if (profile.approval_status === 'pending' || profile.status === 'pending') return 'pending';

  // Fetch linked student
  let studentRow: any = null;
  if (profile.linked_id) {
    const { data } = await admin
      .from('students')
      .select('*')
      .eq('id', profile.linked_id)
      .is('deleted_at', null)
      .maybeSingle();
    studentRow = data;
  }
  if (!studentRow) {
    const { data } = await admin
      .from('students')
      .select('*')
      .eq('user_id', profile.id)
      .is('deleted_at', null)
      .maybeSingle();
    studentRow = data;
  }

  // Fetch linked admission
  let admRow: any = null;
  if (studentRow?.id) {
    const { data } = await admin
      .from('admissions')
      .select('id, status, remarks, created_at')
      .eq('student_id', studentRow.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    admRow = data;
  }
  if (!admRow) {
    // Check optional auth_user_id match gracefully
    const { data, error } = await admin
      .from('admissions')
      .select('id, status, remarks, created_at')
      .eq('auth_user_id', profile.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) admRow = data;
  }

  const admStatus = admRow?.status || null;
  const stApproval = studentRow?.approval_status || null;
  const stStatus = studentRow?.status || null;

  if (admStatus === 'rejected' || stApproval === 'rejected' || stStatus === 'disabled') {
    return 'rejected';
  }
  if (admStatus === 'pending' || stApproval === 'pending' || stStatus === 'pending') {
    return 'pending';
  }
  if (profile.status === 'disabled') {
    return 'rejected';
  }
  if (stStatus === 'inactive' && !admStatus) {
    return 'pending';
  }
  if (profile.status === 'active' && (!studentRow || stStatus === 'active')) {
    return 'approved';
  }
  return 'pending';
}
