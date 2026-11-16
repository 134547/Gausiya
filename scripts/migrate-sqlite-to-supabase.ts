/**
 * Safe, Idempotent SQLite -> Supabase Migration Script
 *
 * - Opens ./data/madrasa.db in READ-ONLY mode (never deletes or overwrites SQLite data).
 * - Writes a full JSON backup snapshot to ./data/sqlite-export-backup.json.
 * - Migrates users into Supabase Auth (auth.users) + public.profiles.
 * - Maps legacy integer IDs to deterministic UUIDs so re-running does NOT create duplicates.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-sqlite-to-supabase.ts
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const dbPath = path.resolve(process.cwd(), 'data', 'madrasa.db');
if (!fs.existsSync(dbPath)) {
  console.error(`SQLite database not found at ${dbPath}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(dbPath, { readOnly: true });
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function deterministicUuid(namespace: string, legacyId: number | string): string {
  const hash = crypto.createHash('sha256').update(`madrasa-ghausia-razvia:${namespace}:${legacyId}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

function safeJsonParse(raw: any, fallback: any) {
  if (typeof raw !== 'string') return raw ?? fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function main() {
  console.log('1. Exporting SQLite snapshot to data/sqlite-export-backup.json...');
  const tableNames = (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((t) => t.name);

  const snapshot: Record<string, any[]> = {};
  for (const name of tableNames) {
    snapshot[name] = sqlite.prepare(`SELECT * FROM "${name}"`).all();
  }
  const backupPath = path.resolve(process.cwd(), 'data', 'sqlite-export-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(`   Backup saved (${Object.keys(snapshot).length} tables).`);

  // Fetch roles from Supabase
  const { data: rolesData, error: rolesErr } = await supabase.from('roles').select('id, slug');
  if (rolesErr || !rolesData?.length) {
    throw new Error('Roles table is empty or unreachable. Run supabase/seed.sql first!');
  }
  const roleSlugByLegacyId = new Map<number, string>();
  for (const r of snapshot.roles || []) roleSlugByLegacyId.set(r.id, r.slug);
  const roleUuidBySlug = new Map<string, string>();
  for (const r of rolesData) roleUuidBySlug.set(r.slug, r.id);

  // 2. Academic Sessions
  console.log('2. Migrating academic_sessions...');
  const sessionMap = new Map<number, string>();
  for (const s of snapshot.academic_sessions || []) {
    const id = deterministicUuid('academic_sessions', s.id);
    sessionMap.set(s.id, id);
    await supabase.from('academic_sessions').upsert(
      {
        id,
        name: s.name,
        start_date: s.start_date,
        end_date: s.end_date,
        is_active: Boolean(s.is_active),
      },
      { onConflict: 'name' }
    );
  }

  // 3. Migrate Users -> Supabase Auth + Profiles
  console.log('3. Migrating users into auth.users + public.profiles...');
  const userMap = new Map<number, string>();
  const legacyProfileByUserId = new Map<number, any>();
  for (const p of snapshot.profiles || []) legacyProfileByUserId.set(p.user_id, p);

  const { data: existingAuthUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authByEmail = new Map<string, string>();
  for (const au of existingAuthUsers?.users || []) {
    if (au.email) authByEmail.set(au.email.toLowerCase(), au.id);
  }

  const defaultPassByRole: Record<string, string> = {
    super_admin: 'Admin@123',
    teacher: 'Teacher@123',
    parent: 'Parent@123',
    student: 'Student@123',
    committee_member: 'Committee@123',
  };

  for (const u of snapshot.users || []) {
    const slug = roleSlugByLegacyId.get(u.role_id) || 'student';
    const email = (u.email || `${u.username}@madrasa.local`).toLowerCase();
    let authUserId = authByEmail.get(email);

    if (!authUserId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: defaultPassByRole[slug] || 'Madrasa@123',
        email_confirm: true,
        user_metadata: { full_name: u.full_name, username: u.username },
      });
      if (createErr || !created.user) {
        console.warn(`   Warning creating auth user ${email}:`, createErr?.message);
        continue;
      }
      authUserId = created.user.id;
      authByEmail.set(email, authUserId);
    }

    userMap.set(u.id, authUserId);
    const lp = legacyProfileByUserId.get(u.id) || {};
    await supabase.from('profiles').upsert(
      {
        id: authUserId,
        user_code: u.user_code,
        username: u.username,
        email,
        mobile: u.mobile || '',
        full_name: u.full_name,
        role_id: roleUuidBySlug.get(slug) || null,
        status: u.status || 'active',
        linked_type: u.linked_type || null,
        father_name: lp.father_name || '',
        dob: lp.dob || '',
        gender: lp.gender || 'Male',
        address: lp.address || '',
        village: lp.village || '',
        district: lp.district || 'Ramgarh',
        state: lp.state || 'Jharkhand',
        pin_code: lp.pin_code || '',
        photo_url: lp.photo_url || '',
        bio: lp.bio || '',
        last_login: u.last_login || null,
        deleted_at: u.deleted_at || null,
      },
      { onConflict: 'id' }
    );
  }

  // 4. Teachers
  console.log('4. Migrating teachers...');
  const teacherMap = new Map<number, string>();
  for (const t of snapshot.teachers || []) {
    const id = deterministicUuid('teachers', t.id);
    teacherMap.set(t.id, id);
    await supabase.from('teachers').upsert(
      {
        id,
        teacher_code: t.teacher_code,
        user_id: t.user_id ? userMap.get(t.user_id) || null : null,
        full_name: t.full_name,
        father_name: t.father_name || '',
        dob: t.dob || '',
        gender: t.gender || 'Male',
        mobile: t.mobile,
        email: t.email || '',
        address: t.address || '',
        qualification: t.qualification || '',
        joining_date: t.joining_date || new Date().toISOString().slice(0, 10),
        photo_url: t.photo_url || '',
        employment_status: t.employment_status || 'active',
        remarks: t.remarks || '',
        deleted_at: t.deleted_at || null,
      },
      { onConflict: 'teacher_code' }
    );
  }

  // 5. Classes & Subjects
  console.log('5. Migrating classes & subjects...');
  const classMap = new Map<number, string>();
  for (const c of snapshot.classes || []) {
    const id = deterministicUuid('classes', c.id);
    classMap.set(c.id, id);
    await supabase.from('classes').upsert(
      {
        id,
        name: c.name,
        code: c.code,
        academic_session_id: c.academic_session_id ? sessionMap.get(c.academic_session_id) || null : null,
        class_teacher_id: c.class_teacher_id ? teacherMap.get(c.class_teacher_id) || null : null,
        room_no: c.room_no || '',
        status: c.status || 'active',
        deleted_at: c.deleted_at || null,
      },
      { onConflict: 'code' }
    );
  }

  const subjectMap = new Map<number, string>();
  for (const s of snapshot.subjects || []) {
    const id = deterministicUuid('subjects', s.id);
    subjectMap.set(s.id, id);
    await supabase.from('subjects').upsert(
      {
        id,
        name: s.name,
        code: s.code,
        total_marks: s.total_marks || 100,
        passing_marks: s.passing_marks || 33,
        description: s.description || '',
        deleted_at: s.deleted_at || null,
      },
      { onConflict: 'code' }
    );
  }

  for (const cs of snapshot.class_subjects || []) {
    const cid = classMap.get(cs.class_id);
    const sid = subjectMap.get(cs.subject_id);
    if (!cid || !sid) continue;
    await supabase.from('class_subjects').upsert(
      {
        id: deterministicUuid('class_subjects', cs.id),
        class_id: cid,
        subject_id: sid,
        teacher_id: cs.teacher_id ? teacherMap.get(cs.teacher_id) || null : null,
        total_marks: cs.total_marks || 100,
        passing_marks: cs.passing_marks || 33,
      },
      { onConflict: 'class_id,subject_id' }
    );
  }

  for (const ta of snapshot.teacher_assignments || []) {
    const tid = teacherMap.get(ta.teacher_id);
    const cid = classMap.get(ta.class_id);
    if (!tid || !cid) continue;
    await supabase.from('teacher_assignments').upsert(
      {
        id: deterministicUuid('teacher_assignments', ta.id),
        teacher_id: tid,
        class_id: cid,
        subject_id: ta.subject_id ? subjectMap.get(ta.subject_id) || null : null,
        academic_session_id: ta.academic_session_id ? sessionMap.get(ta.academic_session_id) || null : null,
        is_class_teacher: Boolean(ta.is_class_teacher),
      },
      { onConflict: 'teacher_id,class_id,subject_id' }
    );
  }

  // 6. Parents & Students
  console.log('6. Migrating parents & students...');
  const parentMap = new Map<number, string>();
  for (const p of snapshot.parents || []) {
    const id = deterministicUuid('parents', p.id);
    parentMap.set(p.id, id);
    await supabase.from('parents').upsert(
      {
        id,
        parent_code: p.parent_code,
        user_id: p.user_id ? userMap.get(p.user_id) || null : null,
        full_name: p.full_name,
        mobile: p.mobile,
        email: p.email || '',
        address: p.address || '',
        relationship: p.relationship || 'Father',
        occupation: p.occupation || '',
        status: p.status || 'active',
        deleted_at: p.deleted_at || null,
      },
      { onConflict: 'parent_code' }
    );
  }

  const studentMap = new Map<number, string>();
  for (const st of snapshot.students || []) {
    const id = deterministicUuid('students', st.id);
    studentMap.set(st.id, id);
    await supabase.from('students').upsert(
      {
        id,
        student_code: st.student_code,
        admission_no: st.admission_no || null,
        user_id: st.user_id ? userMap.get(st.user_id) || null : null,
        full_name: st.full_name,
        father_name: st.father_name,
        mother_name: st.mother_name || '',
        dob: st.dob || '',
        gender: st.gender || 'Male',
        religion: st.religion || 'Islam',
        address: st.address || '',
        village: st.village || '',
        district: st.district || 'Ramgarh',
        state: st.state || 'Jharkhand',
        pin_code: st.pin_code || '',
        mobile: st.mobile || '',
        class_id: st.class_id ? classMap.get(st.class_id) || null : null,
        academic_session_id: st.academic_session_id ? sessionMap.get(st.academic_session_id) || null : null,
        admission_date: st.admission_date || new Date().toISOString().slice(0, 10),
        photo_url: st.photo_url || '',
        status: st.status || 'active',
        previous_school: st.previous_school || '',
        previous_class: st.previous_class || '',
        remarks: st.remarks || '',
        deleted_at: st.deleted_at || null,
      },
      { onConflict: 'student_code' }
    );
  }

  // Sync profiles.linked_id now that teachers/parents/students have UUIDs
  for (const u of snapshot.users || []) {
    const authId = userMap.get(u.id);
    if (!authId || !u.linked_id) continue;
    let linkedUuid: string | null = null;
    if (u.linked_type === 'teacher') linkedUuid = teacherMap.get(u.linked_id) || null;
    if (u.linked_type === 'parent') linkedUuid = parentMap.get(u.linked_id) || null;
    if (u.linked_type === 'student') linkedUuid = studentMap.get(u.linked_id) || null;
    if (linkedUuid) {
      await supabase.from('profiles').update({ linked_id: linkedUuid }).eq('id', authId);
    }
  }

  for (const sg of snapshot.student_guardians || []) {
    const stId = studentMap.get(sg.student_id);
    const pId = parentMap.get(sg.parent_id);
    if (!stId || !pId) continue;
    await supabase.from('student_guardians').upsert(
      {
        id: deterministicUuid('student_guardians', sg.id),
        student_id: stId,
        parent_id: pId,
        relationship: sg.relationship || 'Father',
        is_primary: Boolean(sg.is_primary),
      },
      { onConflict: 'student_id,parent_id' }
    );
  }

  // 7. Admissions & Attendance
  console.log('7. Migrating admissions & attendance...');
  for (const a of snapshot.admissions || []) {
    await supabase.from('admissions').upsert(
      {
        id: deterministicUuid('admissions', a.id),
        admission_no: a.admission_no,
        student_name: a.student_name,
        father_name: a.father_name,
        mother_name: a.mother_name || '',
        dob: a.dob || '',
        gender: a.gender || 'Male',
        religion: a.religion || 'Islam',
        address: a.address || '',
        village: a.village || '',
        district: a.district || 'Ramgarh',
        state: a.state || 'Jharkhand',
        pin_code: a.pin_code || '',
        student_mobile: a.student_mobile || '',
        guardian_name: a.guardian_name,
        guardian_relationship: a.guardian_relationship || 'Father',
        guardian_mobile: a.guardian_mobile,
        previous_school: a.previous_school || '',
        previous_class: a.previous_class || '',
        admission_date: a.admission_date || new Date().toISOString().slice(0, 10),
        admission_class_id: a.admission_class_id ? classMap.get(a.admission_class_id) || null : null,
        photo_url: a.photo_url || '',
        documents_json: safeJsonParse(a.documents_json, []),
        remarks: a.remarks || '',
        status: a.status || 'pending',
        student_id: a.student_id ? studentMap.get(a.student_id) || null : null,
        reviewed_by: a.reviewed_by ? userMap.get(a.reviewed_by) || null : null,
        reviewed_at: a.reviewed_at || null,
        deleted_at: a.deleted_at || null,
      },
      { onConflict: 'admission_no' }
    );
  }

  for (const att of snapshot.attendance || []) {
    const cid = classMap.get(att.class_id);
    const sid = studentMap.get(att.student_id);
    if (!cid || !sid) continue;
    await supabase.from('attendance').upsert(
      {
        id: deterministicUuid('attendance', att.id),
        academic_session_id: att.academic_session_id ? sessionMap.get(att.academic_session_id) || null : null,
        class_id: cid,
        student_id: sid,
        attendance_date: att.attendance_date,
        status: att.status,
        remark: att.remark || '',
        marked_by: att.marked_by ? userMap.get(att.marked_by) || null : null,
      },
      { onConflict: 'student_id,class_id,attendance_date' }
    );
  }

  // 8. Examinations, Marks, Results
  console.log('8. Migrating examinations, marks & results...');
  const examMap = new Map<number, string>();
  for (const ex of snapshot.examinations || []) {
    const id = deterministicUuid('examinations', ex.id);
    const cid = classMap.get(ex.class_id);
    if (!cid) continue;
    examMap.set(ex.id, id);
    await supabase.from('examinations').upsert(
      {
        id,
        name: ex.name,
        exam_type: ex.exam_type || 'Term Exam',
        academic_session_id: ex.academic_session_id ? sessionMap.get(ex.academic_session_id) || null : null,
        class_id: cid,
        start_date: ex.start_date,
        end_date: ex.end_date || null,
        instructions: ex.instructions || '',
        status: ex.status || 'scheduled',
        results_published: Boolean(ex.results_published),
        published_by: ex.published_by ? userMap.get(ex.published_by) || null : null,
        published_at: ex.published_at || null,
        deleted_at: ex.deleted_at || null,
      },
      { onConflict: 'id' }
    );
  }

  for (const es of snapshot.examination_subjects || []) {
    const eid = examMap.get(es.examination_id);
    const sid = subjectMap.get(es.subject_id);
    if (!eid || !sid) continue;
    await supabase.from('examination_subjects').upsert(
      {
        id: deterministicUuid('examination_subjects', es.id),
        examination_id: eid,
        subject_id: sid,
        exam_date: es.exam_date,
        start_time: es.start_time || '09:00',
        end_time: es.end_time || '12:00',
        total_marks: es.total_marks || 100,
        passing_marks: es.passing_marks || 33,
        room_no: es.room_no || '',
      },
      { onConflict: 'examination_id,subject_id' }
    );
  }

  for (const m of snapshot.marks || []) {
    const eid = examMap.get(m.examination_id);
    const stid = studentMap.get(m.student_id);
    const subid = subjectMap.get(m.subject_id);
    if (!eid || !stid || !subid) continue;
    await supabase.from('marks').upsert(
      {
        id: deterministicUuid('marks', m.id),
        examination_id: eid,
        student_id: stid,
        subject_id: subid,
        obtained_marks: m.obtained_marks ?? 0,
        total_marks: m.total_marks ?? 100,
        is_absent: Boolean(m.is_absent),
        remarks: m.remarks || '',
        entered_by: m.entered_by ? userMap.get(m.entered_by) || null : null,
      },
      { onConflict: 'examination_id,student_id,subject_id' }
    );
  }

  for (const r of snapshot.results || []) {
    const eid = examMap.get(r.examination_id);
    const stid = studentMap.get(r.student_id);
    const cid = classMap.get(r.class_id);
    if (!eid || !stid || !cid) continue;
    await supabase.from('results').upsert(
      {
        id: deterministicUuid('results', r.id),
        examination_id: eid,
        student_id: stid,
        class_id: cid,
        total_marks: r.total_marks ?? 0,
        obtained_marks: r.obtained_marks ?? 0,
        percentage: r.percentage ?? 0,
        grade: r.grade || 'F',
        status: r.status || 'fail',
        position: r.position ?? 0,
        teacher_remarks: r.teacher_remarks || '',
        is_published: Boolean(r.is_published),
        approved_by: r.approved_by ? userMap.get(r.approved_by) || null : null,
        approved_at: r.approved_at || null,
      },
      { onConflict: 'examination_id,student_id' }
    );
  }

  // 9. Committee, Notices, Programs, Feed, Homework, Online Classes, Chats
  console.log('9. Migrating committee, notices, programs, feed, homework, online classes & chats...');
  for (const cm of snapshot.committee_members || []) {
    await supabase.from('committee_members').upsert(
      {
        id: deterministicUuid('committee_members', cm.id),
        full_name: cm.full_name,
        designation: cm.designation,
        mobile: cm.mobile,
        email: cm.email || '',
        address: cm.address || '',
        joining_date: cm.joining_date || new Date().toISOString().slice(0, 10),
        description: cm.description || '',
        photo_url: cm.photo_url || '',
        display_order: cm.display_order || 0,
        status: cm.status || 'active',
        user_id: cm.user_id ? userMap.get(cm.user_id) || null : null,
        deleted_at: cm.deleted_at || null,
      },
      { onConflict: 'id' }
    );
  }

  for (const n of snapshot.notices || []) {
    await supabase.from('notices').upsert(
      {
        id: deterministicUuid('notices', n.id),
        title: n.title,
        description: n.description,
        category: n.category || 'General',
        publish_date: n.publish_date || new Date().toISOString().slice(0, 10),
        expiry_date: n.expiry_date || '',
        attachment_url: n.attachment_url || '',
        attachment_name: n.attachment_name || '',
        target_audience: n.target_audience || 'all',
        target_class_id: n.target_class_id ? classMap.get(n.target_class_id) || null : null,
        created_by: n.created_by ? userMap.get(n.created_by) || null : null,
        deleted_at: n.deleted_at || null,
      },
      { onConflict: 'id' }
    );
  }

  for (const p of snapshot.programs || []) {
    await supabase.from('programs').upsert(
      {
        id: deterministicUuid('programs', p.id),
        title: p.title,
        description: p.description || '',
        program_date: p.program_date,
        start_time: p.start_time || '',
        venue: p.venue || 'Madrasa Campus, Islamnagar',
        category: p.category || 'Religious Gathering',
        featured_photo: p.featured_photo || '',
        gallery_json: safeJsonParse(p.gallery_json, []),
        status: p.status || 'upcoming',
        created_by: p.created_by ? userMap.get(p.created_by) || null : null,
        deleted_at: p.deleted_at || null,
      },
      { onConflict: 'id' }
    );
  }

  for (const fp of snapshot.feed_posts || []) {
    const authorId = userMap.get(fp.author_id);
    if (!authorId) continue;
    await supabase.from('feed_posts').upsert(
      {
        id: deterministicUuid('feed_posts', fp.id),
        author_id: authorId,
        title: fp.title || '',
        content: fp.content,
        images_json: safeJsonParse(fp.images_json, []),
        likes_count: fp.likes_count || 0,
        deleted_at: fp.deleted_at || null,
      },
      { onConflict: 'id' }
    );
  }

  const hwMap = new Map<number, string>();
  for (const hw of snapshot.homework || []) {
    const cid = classMap.get(hw.class_id);
    const sid = subjectMap.get(hw.subject_id);
    const tid = teacherMap.get(hw.teacher_id);
    if (!cid || !sid || !tid) continue;
    const id = deterministicUuid('homework', hw.id);
    hwMap.set(hw.id, id);
    await supabase.from('homework').upsert(
      {
        id,
        class_id: cid,
        subject_id: sid,
        teacher_id: tid,
        title: hw.title,
        description: hw.description || '',
        attachment_url: hw.attachment_url || '',
        attachment_name: hw.attachment_name || '',
        assigned_date: hw.assigned_date || new Date().toISOString().slice(0, 10),
        submission_deadline: hw.submission_deadline,
        allow_submission: Boolean(hw.allow_submission),
        deleted_at: hw.deleted_at || null,
      },
      { onConflict: 'id' }
    );
  }

  for (const hs of snapshot.homework_submissions || []) {
    const hwid = hwMap.get(hs.homework_id);
    const stid = studentMap.get(hs.student_id);
    if (!hwid || !stid) continue;
    await supabase.from('homework_submissions').upsert(
      {
        id: deterministicUuid('homework_submissions', hs.id),
        homework_id: hwid,
        student_id: stid,
        submission_text: hs.submission_text || '',
        attachment_url: hs.attachment_url || '',
        attachment_name: hs.attachment_name || '',
        feedback: hs.feedback || '',
        grade: hs.grade || '',
        reviewed_by: hs.reviewed_by ? userMap.get(hs.reviewed_by) || null : null,
        reviewed_at: hs.reviewed_at || null,
        status: hs.status || 'submitted',
      },
      { onConflict: 'homework_id,student_id' }
    );
  }

  for (const oc of snapshot.online_classes || []) {
    const cid = classMap.get(oc.class_id);
    const tid = teacherMap.get(oc.teacher_id);
    if (!cid || !tid) continue;
    await supabase.from('online_classes').upsert(
      {
        id: deterministicUuid('online_classes', oc.id),
        title: oc.title,
        class_id: cid,
        subject_id: oc.subject_id ? subjectMap.get(oc.subject_id) || null : null,
        teacher_id: tid,
        meeting_date: oc.meeting_date,
        start_time: oc.start_time,
        end_time: oc.end_time,
        platform: oc.platform || 'Google Meet',
        meeting_url: oc.meeting_url,
        instructions: oc.instructions || '',
        status: oc.status || 'scheduled',
        deleted_at: oc.deleted_at || null,
      },
      { onConflict: 'id' }
    );
  }

  const convMap = new Map<number, string>();
  for (const c of snapshot.conversations || []) {
    const creator = userMap.get(c.created_by);
    if (!creator) continue;
    const id = deterministicUuid('conversations', c.id);
    convMap.set(c.id, id);
    await supabase.from('conversations').upsert(
      { id, title: c.title || '', type: c.type || 'private', created_by: creator },
      { onConflict: 'id' }
    );
  }

  for (const cp of snapshot.conversation_participants || []) {
    const cid = convMap.get(cp.conversation_id);
    const uid = userMap.get(cp.user_id);
    if (!cid || !uid) continue;
    await supabase.from('conversation_participants').upsert(
      { id: deterministicUuid('conversation_participants', cp.id), conversation_id: cid, user_id: uid },
      { onConflict: 'conversation_id,user_id' }
    );
  }

  for (const msg of snapshot.messages || []) {
    const cid = convMap.get(msg.conversation_id);
    const sid = userMap.get(msg.sender_id);
    if (!cid || !sid) continue;
    await supabase.from('messages').upsert(
      {
        id: deterministicUuid('messages', msg.id),
        conversation_id: cid,
        sender_id: sid,
        content: msg.content || '',
        attachment_url: msg.attachment_url || '',
        attachment_name: msg.attachment_name || '',
        is_read: Boolean(msg.is_read),
      },
      { onConflict: 'id' }
    );
  }

  // 10. Sync madrasa_settings active_session_id
  const ms = (snapshot.madrasa_settings || [])[0];
  if (ms?.active_session_id && sessionMap.has(ms.active_session_id)) {
    await supabase
      .from('madrasa_settings')
      .update({ active_session_id: sessionMap.get(ms.active_session_id) })
      .eq('id', 1);
  }

  console.log('Migration completed cleanly without modifying data/madrasa.db!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
