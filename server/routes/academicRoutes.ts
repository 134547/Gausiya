import { Router } from 'express';
import {
  requireSupabaseAdmin,
  resolveStorageUrl,
  resolveStorageUrlsInRows,
  supabaseAdmin,
} from '../supabase.ts';
import {
  AuthRequest,
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
import { getResultsOpen, normalizeStorageRef, setResultsOpen } from './publicRoutes.ts';

const router = Router();

// ==================== ATTENDANCE ====================
router.get('/attendance', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;
  const { sessionId, classId, date, studentId, mode } = req.query as Record<string, string>;
  const targetDate = date || new Date().toISOString().slice(0, 10);

  if (mode === 'summary') {
    let q = admin.from('attendance').select('attendance_date, class_id, student_id, status, classes(name)').order('attendance_date', { ascending: false }).limit(2000);
    if (classId) q = q.eq('class_id', classId);

    let stSummaryQ = admin
      .from('students')
      .select('id, student_code, full_name, class_id, classes(name)')
      .is('deleted_at', null)
      .eq('status', 'active')
      .order('full_name', { ascending: true });
    if (classId) stSummaryQ = stSummaryQ.eq('class_id', classId);

    if (user.role_slug === 'teacher') {
      const tid = await getTeacherIdForUser(user);
      const classIds = tid ? await getTeacherAssignedClassIds(tid) : [];
      if (!classIds.length) return res.json({ daily: [], studentWise: [] });
      q = q.in('class_id', classIds);
      stSummaryQ = stSummaryQ.in('class_id', classIds);
    } else if (user.role_slug === 'student') {
      const stId = await getStudentIdForUser(user);
      if (!stId) return res.json({ daily: [], studentWise: [] });
      q = q.eq('student_id', stId);
      stSummaryQ = stSummaryQ.eq('id', stId);
    } else if (user.role_slug === 'parent') {
      const pid = await getParentIdForUser(user);
      const childIds = pid ? await getParentStudentIds(pid) : [];
      if (!childIds.length) return res.json({ daily: [], studentWise: [] });
      q = q.in('student_id', childIds);
      stSummaryQ = stSummaryQ.in('id', childIds);
    }

    const [{ data: attRows }, { data: studentsRaw }] = await Promise.all([q, stSummaryQ]);

    const dailyMap = new Map<string, { attendance_date: string; class_id: string; class_name: string; present: number; absent: number; late: number; on_leave: number; total: number }>();
    for (const a of attRows || []) {
      const key = `${a.attendance_date}_${a.class_id}`;
      const entry = dailyMap.get(key) || {
        attendance_date: a.attendance_date,
        class_id: a.class_id,
        class_name: (a as any).classes?.name || '',
        present: 0,
        absent: 0,
        late: 0,
        on_leave: 0,
        total: 0,
      };
      if (a.status === 'present') entry.present += 1;
      else if (a.status === 'absent') entry.absent += 1;
      else if (a.status === 'late') entry.late += 1;
      else if (a.status === 'leave') entry.on_leave += 1;
      entry.total += 1;
      dailyMap.set(key, entry);
    }
    const daily = Array.from(dailyMap.values()).slice(0, 40);

    const studentWise = (studentsRaw || []).map((st: any) => {
      const rows = (attRows || []).filter((a: any) => a.student_id === st.id);
      return {
        student_id: st.id,
        student_code: st.student_code,
        full_name: st.full_name,
        class_name: st.classes?.name || '',
        total_days: rows.length,
        present: rows.filter((a: any) => a.status === 'present').length,
        absent: rows.filter((a: any) => a.status === 'absent').length,
        late: rows.filter((a: any) => a.status === 'late').length,
        on_leave: rows.filter((a: any) => a.status === 'leave').length,
      };
    });

    return res.json({ daily, studentWise });
  }

  // Student or Parent viewing personal attendance history
  if (user.role_slug === 'student' || user.role_slug === 'parent' || studentId) {
    let targetIds: string[] = [];
    let studentInfo: { id: string; full_name: string; student_code: string; class_name: string } | null = null;
    if (user.role_slug === 'student') {
      const stId = await getStudentIdForUser(user);
      if (stId) {
        targetIds = [stId];
        const { data: stRow } = await admin
          .from('students')
          .select('id, full_name, student_code, classes(name)')
          .eq('id', stId)
          .is('deleted_at', null)
          .maybeSingle();
        if (stRow) {
          studentInfo = {
            id: stRow.id,
            full_name: stRow.full_name,
            student_code: stRow.student_code,
            class_name: (stRow as any).classes?.name || 'Unassigned',
          };
        }
      }
    } else if (user.role_slug === 'parent') {
      const pid = await getParentIdForUser(user);
      targetIds = pid ? await getParentStudentIds(pid) : [];
    } else if (studentId) {
      targetIds = [studentId];
    }

    if (!targetIds.length) {
      return res.json({
        history: [],
        student: studentInfo,
        summary: { total: 0, present: 0, absent: 0, late: 0, on_leave: 0, percentage: 0 },
      });
    }

    const { data: histRaw } = await admin
      .from('attendance')
      .select('*, students(full_name, student_code), classes(name)')
      .in('student_id', targetIds)
      .order('attendance_date', { ascending: false })
      .limit(200);

    const history = (histRaw || []).map((h: any) => ({
      ...h,
      student_name: h.students?.full_name || '',
      student_code: h.students?.student_code || '',
      class_name: h.classes?.name || '',
    }));

    const total = history.length;
    const present = history.filter((h: any) => h.status === 'present').length;
    const absent = history.filter((h: any) => h.status === 'absent').length;
    const late = history.filter((h: any) => h.status === 'late').length;
    const on_leave = history.filter((h: any) => h.status === 'leave').length;
    const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return res.json({
      history,
      student: studentInfo,
      summary: { total, present, absent, late, on_leave, percentage },
    });
  }

  if (!classId) {
    return res.json({ records: [], date: targetDate, isLocked: false, markedCount: 0 });
  }

  if (user.role_slug === 'teacher') {
    const tid = await getTeacherIdForUser(user);
    const allowed = tid ? await getTeacherAssignedClassIds(tid) : [];
    if (!allowed.includes(classId)) {
      return res.status(403).json({ error: 'You are not assigned to this class for attendance.' });
    }
  }

  let stQuery = admin
    .from('students')
    .select('id, student_code, full_name, father_name, photo_url, academic_session_id')
    .eq('class_id', classId)
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('full_name', { ascending: true });

  const [{ data: studentsRaw }, { data: attRows }] = await Promise.all([
    stQuery,
    admin.from('attendance').select('id, student_id, status, remark').eq('class_id', classId).eq('attendance_date', targetDate),
  ]);

  const filteredStudents = sessionId
    ? (studentsRaw || []).filter((s) => !s.academic_session_id || s.academic_session_id === sessionId)
    : studentsRaw || [];

  const resolvedStudents = await resolveStorageUrlsInRows(filteredStudents, ['photo_url']);
  const attMap = new Map((attRows || []).map((a) => [a.student_id, a]));
  const isLocked = (attRows || []).length > 0;
  const records = resolvedStudents.map((st: any) => {
    const a = attMap.get(st.id);
    return {
      student_id: st.id,
      student_code: st.student_code,
      full_name: st.full_name,
      father_name: st.father_name,
      photo_url: st.photo_url,
      attendance_id: a?.id || null,
      status: a?.status || 'unmarked',
      remark: a?.remark || '',
    };
  });

  return res.json({ records, date: targetDate, classId, isLocked, markedCount: (attRows || []).length });
});

router.post('/attendance', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const user = req.user!;
    const { sessionId, classId, date, records, allowEdit } = req.body as {
      sessionId?: string;
      classId: string;
      date: string;
      allowEdit?: boolean;
      records: { student_id: string; status: 'present' | 'absent' | 'late' | 'leave'; remark?: string }[];
    };
    if (!classId || !date || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Class, date, and attendance records are required.' });
    }

    if (user.role_slug === 'teacher') {
      const tid = await getTeacherIdForUser(user);
      const allowed = tid ? await getTeacherAssignedClassIds(tid) : [];
      if (!allowed.includes(classId)) {
        return res.status(403).json({ error: 'Permission denied: you are not assigned to this class.' });
      }
    }

    const { data: existingRows, error: existingErr } = await admin
      .from('attendance')
      .select('id')
      .eq('class_id', classId)
      .eq('attendance_date', date)
      .limit(1);
    if (existingErr) return res.status(400).json({ error: existingErr.message });

    const alreadySaved = (existingRows || []).length > 0;
    if (alreadySaved && allowEdit !== true) {
      return res.status(409).json({
        error: 'Attendance for this class and date is already saved and locked. Click the separate "Edit Attendance" option to make changes.',
        locked: true,
      });
    }

    const { data: activeSession } = await admin.from('academic_sessions').select('id').eq('is_active', true).limit(1).maybeSingle();
    const sessId = sessionId || activeSession?.id || null;

    const validRecords = records.filter((r) => ['present', 'absent', 'late', 'leave'].includes(r.status));
    if (validRecords.length > 0) {
      const rows = validRecords.map((r) => ({
        academic_session_id: sessId,
        class_id: classId,
        student_id: r.student_id,
        attendance_date: date,
        status: r.status,
        remark: r.remark || '',
        marked_by: user.id,
      }));
      const { error } = await admin.from('attendance').upsert(rows, { onConflict: 'student_id,class_id,attendance_date' });
      if (error) return res.status(400).json({ error: error.message });
    }

    const summary = {
      present: validRecords.filter((r) => r.status === 'present').length,
      absent: validRecords.filter((r) => r.status === 'absent').length,
      late: validRecords.filter((r) => r.status === 'late').length,
      leave: validRecords.filter((r) => r.status === 'leave').length,
      total: validRecords.length,
    };

    const actionWord = alreadySaved ? 'Edited' : 'Marked';
    await notifyRoles(['super_admin'], 'attendance', `Attendance ${actionWord}`, `Attendance ${actionWord.toLowerCase()} for class on ${date} (${summary.present}/${summary.total} present).`, 'attendance', classId);
    await logActivity(user, alreadySaved ? 'ATTENDANCE_EDITED' : 'ATTENDANCE_UPDATED', 'attendance', `${classId}-${date}`, `${actionWord} attendance for Class ${classId} on ${date}: ${summary.present} present, ${summary.absent} absent`, req.ip);

    return res.json({ success: true, summary, isLocked: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save attendance' });
  }
});

// ==================== EXAMINATIONS ====================
router.get('/examinations', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;

  let q = admin
    .from('examinations')
    .select('*, classes(name), academic_sessions(name)')
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (user.role_slug === 'student') {
    const stId = await getStudentIdForUser(user);
    const { data: st } = stId ? await admin.from('students').select('class_id').eq('id', stId).maybeSingle() : { data: null };
    if (!st?.class_id) return res.json({ examinations: [] });
    q = q.eq('class_id', st.class_id);
  } else if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    const cids = pid ? await getParentStudentIds(pid) : [];
    if (!cids.length) return res.json({ examinations: [] });
    const { data: sts } = await admin.from('students').select('class_id').in('id', cids);
    const classIds = Array.from(new Set((sts || []).map((s) => s.class_id).filter(Boolean) as string[]));
    if (!classIds.length) return res.json({ examinations: [] });
    q = q.in('class_id', classIds);
  } else if (user.role_slug === 'teacher') {
    const tid = await getTeacherIdForUser(user);
    const classIds = tid ? await getTeacherAssignedClassIds(tid) : [];
    if (!classIds.length) return res.json({ examinations: [] });
    q = q.in('class_id', classIds);
  }

  const [{ data: examsRaw }, { data: esRaw }, { data: activeStudentsRaw }, { data: savedResultsRaw }] = await Promise.all([
    q,
    admin.from('examination_subjects').select('*, subjects(name, code)').order('exam_date', { ascending: true }),
    admin.from('students').select('id, class_id, full_name, student_code').is('deleted_at', null).eq('status', 'active').order('full_name', { ascending: true }),
    admin.from('results').select('id, examination_id, student_id'),
  ]);

  const examSubjects = (esRaw || []).map((es: any) => ({
    ...es,
    subject_name: es.subjects?.name || '',
    subject_code: es.subjects?.code || '',
  }));

  const examinations = (examsRaw || []).map((ex: any) => {
    const classStudents = (activeStudentsRaw || []).filter((s: any) => String(s.class_id) === String(ex.class_id));
    const examResultRows = (savedResultsRaw || []).filter((r: any) => String(r.examination_id) === String(ex.id));
    const savedStudentIds = new Set(examResultRows.map((r: any) => String(r.student_id)));
    const pendingStudents = classStudents
      .filter((s: any) => !savedStudentIds.has(String(s.id)))
      .map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        student_code: s.student_code,
      }));
    const totalStudents = classStudents.length;
    const createdResultsCount = classStudents.filter((s: any) => savedStudentIds.has(String(s.id))).length;
    const allResultsCreated = totalStudents > 0 ? pendingStudents.length === 0 : examResultRows.length > 0;

    return {
      ...ex,
      class_name: ex.classes?.name || '',
      session_name: ex.academic_sessions?.name || '',
      subjects: examSubjects.filter((es) => es.examination_id === ex.id),
      total_students: totalStudents,
      created_results_count: createdResultsCount,
      total_saved_results: examResultRows.length,
      pending_students: pendingStudents,
      all_results_created: allResultsCreated,
    };
  });

  return res.json({ examinations });
});

router.post('/examinations', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { name, exam_type, academic_session_id, class_id, start_date, end_date, instructions, status, subjects } = req.body;
    if (!name || !class_id || !start_date) {
      return res.status(400).json({ error: 'Examination name, class, and start date are required.' });
    }
    const { data: activeSession } = await admin.from('academic_sessions').select('id').eq('is_active', true).limit(1).maybeSingle();

    const { data: created, error } = await admin
      .from('examinations')
      .insert({
        name: name.trim(),
        exam_type: exam_type || 'Term Exam',
        academic_session_id: academic_session_id || activeSession?.id || null,
        class_id,
        start_date,
        end_date: end_date || start_date,
        instructions: instructions || '',
        status: status || 'scheduled',
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to create examination' });

    if (Array.isArray(subjects) && subjects.length > 0) {
      await admin.from('examination_subjects').insert(
        subjects.map((s: any) => ({
          examination_id: created.id,
          subject_id: s.subject_id,
          exam_date: s.exam_date || start_date,
          start_time: s.start_time || '09:00',
          end_time: s.end_time || '12:00',
          total_marks: Number(s.total_marks || 100),
          passing_marks: Number(s.passing_marks || 33),
          room_no: s.room_no || '',
        }))
      );
    }

    await notifyRoles(['super_admin', 'teacher', 'student', 'parent'], 'exam', 'Examination Scheduled', `${name} scheduled starting ${start_date}.`, 'examinations', created.id);
    await logActivity(req.user!, 'EXAMINATION_CREATED', 'examinations', created.id, `Created examination ${name}`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create examination' });
  }
});

router.put('/examinations/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { name, exam_type, class_id, start_date, end_date, instructions, status, subjects } = req.body;
  const payload: Record<string, any> = {};
  if (name !== undefined) payload.name = name;
  if (exam_type !== undefined) payload.exam_type = exam_type;
  if (class_id !== undefined) payload.class_id = class_id;
  if (start_date !== undefined) payload.start_date = start_date;
  if (end_date !== undefined) payload.end_date = end_date;
  if (instructions !== undefined) payload.instructions = instructions;
  if (status !== undefined) payload.status = status;

  const { error } = await admin.from('examinations').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });

  if (Array.isArray(subjects)) {
    const { error: delSubErr } = await admin.from('examination_subjects').delete().eq('examination_id', id);
    if (delSubErr) return res.status(400).json({ error: delSubErr.message });
    if (subjects.length > 0) {
      const { error: insSubErr } = await admin.from('examination_subjects').insert(
        subjects.map((s: any) => ({
          examination_id: id,
          subject_id: s.subject_id,
          exam_date: s.exam_date || start_date,
          start_time: s.start_time || '09:00',
          end_time: s.end_time || '12:00',
          total_marks: Number(s.total_marks || 100),
          passing_marks: Number(s.passing_marks || 33),
          room_no: s.room_no || '',
        }))
      );
      if (insSubErr) return res.status(400).json({ error: insSubErr.message });
    }
  }
  await logActivity(req.user!, 'EXAMINATION_UPDATED', 'examinations', id, `Updated examination ${id}`, req.ip);
  return res.json({ success: true });
});

router.delete('/examinations/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('examinations').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'EXAMINATION_DELETED', 'examinations', id, `Deleted examination ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== MARKS & RESULTS ====================
async function computeGrade(percentage: number): Promise<string> {
  const admin = supabaseAdmin;
  let rules: { grade: string; minPercent: number }[] = [
    { grade: 'A+', minPercent: 90 },
    { grade: 'A', minPercent: 80 },
    { grade: 'B', minPercent: 70 },
    { grade: 'C', minPercent: 60 },
    { grade: 'D', minPercent: 45 },
    { grade: 'E', minPercent: 33 },
    { grade: 'F', minPercent: 0 },
  ];
  if (admin) {
    const { data: settings } = await admin.from('madrasa_settings').select('grading_rules_json').eq('id', 1).maybeSingle();
    if (settings?.grading_rules_json) {
      try {
        rules = typeof settings.grading_rules_json === 'string'
          ? JSON.parse(settings.grading_rules_json)
          : settings.grading_rules_json;
      } catch {
        // default
      }
    }
  }
  const sorted = [...rules].sort((a, b) => b.minPercent - a.minPercent);
  for (const r of sorted) {
    if (percentage >= r.minPercent) return r.grade;
  }
  return 'F';
}

router.get('/results/portal-status', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  try {
    const resultsOpen = await getResultsOpen(admin);
    return res.json({ resultsOpen });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to read result portal status' });
  }
});

router.put('/results/portal-status', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  try {
    const open = Boolean((req.body as { open?: boolean })?.open);
    const updated = await setResultsOpen(admin, open);
    await logActivity(
      req.user!,
      updated ? 'RESULTS_PORTAL_OPENED' : 'RESULTS_PORTAL_CLOSED',
      'results',
      '1',
      `Super Admin turned public Result checking ${updated ? 'ON' : 'OFF'}`,
      req.ip
    );
    return res.json({ resultsOpen: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update result portal status' });
  }
});

router.get('/results', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;
  const { examId, classId, studentId } = req.query as Record<string, string>;

  let q = admin
    .from('results')
    .select('*, students!inner(full_name, student_code, admission_no, father_name, photo_url, deleted_at), classes(name, teachers(full_name)), examinations!inner(name, start_date, results_published, academic_session_id, deleted_at, academic_sessions(name))')
    .is('students.deleted_at', null)
    .is('examinations.deleted_at', null)
    .order('position', { ascending: true })
    .order('obtained_marks', { ascending: false })
    .order('percentage', { ascending: false });

  if (user.role_slug === 'student') {
    const stId = await getStudentIdForUser(user);
    if (!stId) return res.json({ results: [] });
    q = q.eq('student_id', stId).eq('is_published', true);
  } else if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    const cids = pid ? await getParentStudentIds(pid) : [];
    if (!cids.length) return res.json({ results: [] });
    q = q.in('student_id', cids).eq('is_published', true);
  } else if (user.role_slug === 'teacher') {
    const tid = await getTeacherIdForUser(user);
    const classIds = tid ? await getTeacherAssignedClassIds(tid) : [];
    if (!classIds.length) return res.json({ results: [] });
    q = q.in('class_id', classIds);
  } else if (user.role_slug === 'committee_member') {
    q = q.eq('is_published', true);
  }

  if (examId) q = q.eq('examination_id', examId);
  if (classId) q = q.eq('class_id', classId);
  if (studentId) q = q.eq('student_id', studentId);

  const { data: resultsRaw } = await q;
  if (!resultsRaw || resultsRaw.length === 0) {
    return res.json({ results: [] });
  }

  const resultIds = resultsRaw.map((r: any) => r.id).filter(Boolean);
  const examIds = Array.from(new Set(resultsRaw.map((r: any) => r.examination_id).filter(Boolean)));
  const studentIds = Array.from(new Set(resultsRaw.map((r: any) => r.student_id).filter(Boolean)));

  const [{ data: marksRaw }, { data: esRaw }, { data: metaDocs }, { data: examCountsRaw }] = await Promise.all([
    examIds.length && studentIds.length
      ? admin
          .from('marks')
          .select('*, subjects(name, code, passing_marks)')
          .in('examination_id', examIds)
          .in('student_id', studentIds)
      : Promise.resolve({ data: [] as any[] }),
    examIds.length
      ? admin
          .from('examination_subjects')
          .select('examination_id, subject_id, passing_marks')
          .in('examination_id', examIds)
      : Promise.resolve({ data: [] as any[] }),
    resultIds.length
      ? admin
          .from('documents')
          .select('entity_id, file_url, created_at')
          .eq('entity_type', 'general')
          .eq('title', 'RESULT_CARD_META')
          .in('entity_id', resultIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    examIds.length
      ? admin
          .from('results')
          .select('examination_id')
          .in('examination_id', examIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const totalByExam = new Map<string, number>();
  for (const row of examCountsRaw || []) {
    const key = String(row.examination_id);
    totalByExam.set(key, (totalByExam.get(key) || 0) + 1);
  }

  const metaMap = new Map<string, any>();
  for (const doc of metaDocs || []) {
    if (metaMap.has(doc.entity_id)) continue;
    try {
      const parsed = JSON.parse(doc.file_url || '{}');
      if (parsed?.photo) {
        parsed.photo = await resolveStorageUrl(parsed.photo);
      }
      metaMap.set(doc.entity_id, parsed);
    } catch {
      // ignore invalid metadata JSON
    }
  }

  const esPassMap = new Map((esRaw || []).map((es) => [`${es.examination_id}_${es.subject_id}`, es.passing_marks]));
  const marks = (marksRaw || []).map((m: any) => ({
    ...m,
    subject_name: m.subjects?.name || '',
    subject_code: m.subjects?.code || '',
    passing_marks: esPassMap.get(`${m.examination_id}_${m.subject_id}`) ?? m.subjects?.passing_marks ?? 33,
  }));

  const results = await Promise.all(
    resultsRaw.map(async (r: any) => {
      const cardMeta = metaMap.get(r.id) || null;
      const totalStudents = totalByExam.get(String(r.examination_id)) || undefined;
      return {
        ...r,
        student_name: r.students?.full_name || '',
        student_code: r.students?.student_code || '',
        admission_no: r.students?.admission_no || '',
        father_name: r.students?.father_name || '',
        photo_url: await resolveStorageUrl(r.students?.photo_url),
        class_name: r.classes?.name || '',
        class_teacher_name: r.classes?.teachers?.full_name || '',
        exam_name: r.examinations?.name || '',
        exam_date: r.examinations?.start_date || '',
        session_name: r.examinations?.academic_sessions?.name || '',
        results_published: r.examinations?.results_published ? 1 : 0,
        total_students: totalStudents,
        subjects: marks.filter((m) => m.examination_id === r.examination_id && m.student_id === r.student_id),
        card_meta: cardMeta,
      };
    })
  );

  return res.json({ results });
});

router.get('/results/marks-sheet', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { examId } = req.query as { examId?: string };
  if (!examId) return res.status(400).json({ error: 'examId is required' });

  const { data: exam } = await admin.from('examinations').select('*').eq('id', examId).is('deleted_at', null).maybeSingle();
  if (!exam) return res.status(404).json({ error: 'Examination not found' });

  if (req.user!.role_slug === 'teacher') {
    const tid = await getTeacherIdForUser(req.user!);
    const allowed = tid ? await getTeacherAssignedClassIds(tid) : [];
    if (!allowed.includes(exam.class_id)) {
      return res.status(403).json({ error: 'You are not assigned to this class.' });
    }
  }

  const [{ data: esRaw }, { data: students }, { data: marks }, { data: existingResults }] = await Promise.all([
    admin.from('examination_subjects').select('*, subjects(name, code)').eq('examination_id', examId),
    admin.from('students').select('id, student_code, full_name, father_name').eq('class_id', exam.class_id).is('deleted_at', null).eq('status', 'active').order('full_name', { ascending: true }),
    admin.from('marks').select('*').eq('examination_id', examId),
    admin.from('results').select('student_id, teacher_remarks').eq('examination_id', examId),
  ]);

  const subjects = (esRaw || []).map((es: any) => ({
    ...es,
    subject_name: es.subjects?.name || '',
    subject_code: es.subjects?.code || '',
  }));

  return res.json({
    exam,
    subjects,
    students: students || [],
    marks: marks || [],
    existingResults: existingResults || [],
  });
});

router.post('/results/marks', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { examId, entries, teacherRemarks } = req.body as {
      examId: string;
      entries: { student_id: string; subject_id: string; obtained_marks: number; total_marks: number; is_absent?: boolean }[];
      teacherRemarks?: Record<string, string>;
    };

    const { data: exam } = await admin.from('examinations').select('*').eq('id', examId).is('deleted_at', null).maybeSingle();
    if (!exam) return res.status(404).json({ error: 'Examination not found' });

    if (req.user!.role_slug === 'teacher') {
      const tid = await getTeacherIdForUser(req.user!);
      const allowed = tid ? await getTeacherAssignedClassIds(tid) : [];
      if (!allowed.includes(exam.class_id)) {
        return res.status(403).json({ error: 'Permission denied for this class.' });
      }
    }

    if (Array.isArray(entries) && entries.length > 0) {
      const rows = entries.map((e) => ({
        examination_id: examId,
        student_id: e.student_id,
        subject_id: e.subject_id,
        obtained_marks: Number(e.obtained_marks || 0),
        total_marks: Number(e.total_marks || 100),
        is_absent: Boolean(e.is_absent),
        entered_by: req.user!.id,
      }));
      const { error } = await admin.from('marks').upsert(rows, { onConflict: 'examination_id,student_id,subject_id' });
      if (error) return res.status(400).json({ error: error.message });
    }

    const [{ data: examSubs }, { data: allMarks }, { data: prevResults }] = await Promise.all([
      admin.from('examination_subjects').select('subject_id, total_marks, passing_marks').eq('examination_id', examId),
      admin.from('marks').select('*').eq('examination_id', examId),
      admin.from('results').select('student_id, teacher_remarks').eq('examination_id', examId),
    ]);

    const passMap = new Map((examSubs || []).map((s) => [s.subject_id, s.passing_marks]));
    const prevRemMap = new Map((prevResults || []).map((r) => [r.student_id, r.teacher_remarks]));
    const studentIds = Array.from(new Set((allMarks || []).map((m) => m.student_id)));

    const computed: { student_id: string; total_marks: number; obtained_marks: number; percentage: number; grade: string; status: 'pass' | 'fail' }[] = [];
    for (const student_id of studentIds) {
      const stMarks = (allMarks || []).filter((m) => m.student_id === student_id);
      let total = 0;
      let obtained = 0;
      let passedAll = true;
      for (const m of stMarks) {
        total += Number(m.total_marks);
        obtained += Number(m.obtained_marks);
        const minPass = passMap.get(m.subject_id) ?? 33;
        if (m.is_absent || Number(m.obtained_marks) < minPass) passedAll = false;
      }
      const pct = total > 0 ? Math.round((obtained / total) * 10000) / 100 : 0;
      const grade = passedAll ? await computeGrade(pct) : 'F';
      const status: 'pass' | 'fail' = passedAll && pct >= 33 ? 'pass' : 'fail';
      computed.push({ student_id, total_marks: total, obtained_marks: obtained, percentage: pct, grade, status });
    }

    computed.sort((a, b) => b.obtained_marks - a.obtained_marks || b.percentage - a.percentage);
    if (computed.length > 0) {
      const resultRows = computed.map((c, idx) => ({
        examination_id: examId,
        student_id: c.student_id,
        class_id: exam.class_id,
        total_marks: c.total_marks,
        obtained_marks: c.obtained_marks,
        percentage: c.percentage,
        grade: c.grade,
        status: c.status,
        position: idx + 1,
        teacher_remarks: teacherRemarks?.[c.student_id] || prevRemMap.get(c.student_id) || '',
        is_published: Boolean(exam.results_published),
      }));
      const { error: resErr } = await admin.from('results').upsert(resultRows, { onConflict: 'examination_id,student_id' });
      if (resErr) return res.status(400).json({ error: resErr.message });
      await recalculateExamPositions(admin, examId);
    }

    await logActivity(req.user!, 'MARKS_ENTERED', 'results', examId, `Saved marks and calculated results for exam ${examId}`, req.ip);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save marks' });
  }
});

router.post('/results/publish/:examId', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;
  const eid = req.params.examId;
  const { publish } = req.body as { publish?: boolean };
  const flag = publish === undefined ? true : Boolean(publish);

  const { data: exam } = await admin
    .from('examinations')
    .select('id, name, class_id')
    .eq('id', eid)
    .is('deleted_at', null)
    .maybeSingle();
  if (!exam) return res.status(404).json({ error: 'Examination not found' });

  if (user.role_slug === 'teacher') {
    if (!flag) {
      return res.status(403).json({ error: 'Only Super Admin can unpublish results.' });
    }
    const tid = await getTeacherIdForUser(user);
    const allowed = tid ? await getTeacherAssignedClassIds(tid) : [];
    if (!allowed.includes(exam.class_id)) {
      return res.status(403).json({ error: 'Permission denied: you are not assigned to this class.' });
    }
  }

  if (flag) {
    const [{ data: activeStudents }, { data: examResults }] = await Promise.all([
      admin.from('students').select('id, full_name').eq('class_id', exam.class_id).is('deleted_at', null).eq('status', 'active'),
      admin.from('results').select('id, student_id').eq('examination_id', eid),
    ]);

    const savedRows = examResults || [];
    if (savedRows.length === 0) {
      return res.status(400).json({ error: 'No student results have been created for this exam yet.' });
    }

    const savedSet = new Set(savedRows.map((r: any) => String(r.student_id)));
    const pendingStudents = (activeStudents || []).filter((s: any) => !savedSet.has(String(s.id)));
    if (pendingStudents.length > 0) {
      const sampleNames = pendingStudents.slice(0, 3).map((s: any) => s.full_name).join(', ');
      return res.status(400).json({
        error: `Cannot upload results yet: ${pendingStudents.length} of ${activeStudents?.length || 0} students still need results created (${sampleNames}${pendingStudents.length > 3 ? '...' : ''}).`,
        pendingCount: pendingStudents.length,
        totalStudents: activeStudents?.length || 0,
      });
    }

    // Finalize all ranks (by highest obtained marks) and percentages across the entire class before uploading
    await recalculateExamPositions(admin, eid);
  }

  const now = flag ? new Date().toISOString() : null;
  const [examRes, resRes] = await Promise.all([
    admin.from('examinations').update({ results_published: flag, published_by: flag ? user.id : null, published_at: now }).eq('id', eid),
    admin.from('results').update({ is_published: flag, approved_by: flag ? user.id : null, approved_at: now }).eq('examination_id', eid),
  ]);
  if (examRes.error) return res.status(400).json({ error: examRes.error.message });
  if (resRes.error) return res.status(400).json({ error: resRes.error.message });

  if (flag) {
    await notifyRoles(['student', 'parent', 'teacher'], 'result', 'Examination Results Uploaded', `${exam.name} results have been finalized and uploaded with class ranks.`, 'results', eid);
  }
  await logActivity(user, flag ? 'RESULTS_PUBLISHED' : 'RESULTS_UNPUBLISHED', 'results', eid, `${flag ? 'Uploaded & published' : 'Unpublished'} results for exam ${eid}`, req.ip);
  return res.json({ success: true, published: flag });
});

function percentageToCardGrade(p: number): string {
  if (p >= 90) return 'A+';
  if (p >= 80) return 'A';
  if (p >= 70) return 'B';
  if (p >= 60) return 'C+';
  if (p >= 50) return 'C';
  if (p >= 40) return 'D';
  return 'F';
}

async function recalculateExamPositions(admin: NonNullable<typeof supabaseAdmin>, examinationId: string) {
  const [{ data: examResults, error: resQueryErr }, { data: examMarks, error: marksQueryErr }] = await Promise.all([
    admin
      .from('results')
      .select('id, student_id, total_marks, obtained_marks, percentage, position')
      .eq('examination_id', examinationId),
    admin
      .from('marks')
      .select('student_id, obtained_marks, total_marks')
      .eq('examination_id', examinationId),
  ]);

  if (resQueryErr) throw Object.assign(new Error(resQueryErr.message), { status: 503 });
  if (marksQueryErr) throw Object.assign(new Error(marksQueryErr.message), { status: 503 });
  if (!examResults || examResults.length === 0) return;

  const marksByStudent = new Map<string, { obtained: number; total: number }>();
  for (const m of examMarks || []) {
    const cur = marksByStudent.get(String(m.student_id)) || { obtained: 0, total: 0 };
    cur.obtained += Number(m.obtained_marks || 0);
    cur.total += Number(m.total_marks || 0);
    marksByStudent.set(String(m.student_id), cur);
  }

  const normalized = examResults.map((row: any) => {
    const mSum = marksByStudent.get(String(row.student_id));
    const total = mSum && mSum.total > 0 ? mSum.total : Number(row.total_marks || 0);
    const obtained = mSum && mSum.total > 0 ? mSum.obtained : Number(row.obtained_marks || 0);
    const percentage = total > 0 ? Math.round((obtained / total) * 10000) / 100 : 0;
    return {
      id: row.id,
      obtained_marks: obtained,
      total_marks: total,
      percentage,
      prevObtained: Number(row.obtained_marks || 0),
      prevTotal: Number(row.total_marks || 0),
      prevPct: Number(row.percentage || 0),
      prevPosition: Number(row.position || 0),
    };
  });

  // Highest marks gets top rank; tie-break by percentage; equal marks & percentage share rank
  normalized.sort((a, b) => b.obtained_marks - a.obtained_marks || b.percentage - a.percentage);

  let currentRank = 0;
  let prevObtained: number | null = null;
  let prevPct: number | null = null;

  const pendingUpdates: Array<{
    id: string;
    obtained_marks: number;
    total_marks: number;
    percentage: number;
    position: number;
  }> = [];

  for (let idx = 0; idx < normalized.length; idx += 1) {
    const row = normalized[idx];
    if (prevObtained === null || row.obtained_marks !== prevObtained || row.percentage !== prevPct) {
      currentRank = idx + 1;
      prevObtained = row.obtained_marks;
      prevPct = row.percentage;
    }
    if (
      row.prevPosition !== currentRank ||
      row.prevObtained !== row.obtained_marks ||
      row.prevTotal !== row.total_marks ||
      row.prevPct !== row.percentage
    ) {
      pendingUpdates.push({
        id: row.id,
        obtained_marks: row.obtained_marks,
        total_marks: row.total_marks,
        percentage: row.percentage,
        position: currentRank,
      });
    }
  }

  // Update changed rows in small chunks to avoid socket exhaustion
  for (let i = 0; i < pendingUpdates.length; i += 5) {
    const chunk = pendingUpdates.slice(i, i + 5);
    await Promise.all(
      chunk.map((u) =>
        admin
          .from('results')
          .update({
            obtained_marks: u.obtained_marks,
            total_marks: u.total_marks,
            percentage: u.percentage,
            position: u.position,
          })
          .eq('id', u.id)
      )
    );
  }
}

interface CardSubjectInput {
  subject_id: string;
  obtained_marks: number;
  total_marks: number;
}

interface CardSavePayload {
  class_id: string;
  student_id: string;
  examination_id?: string | null;
  subjects: CardSubjectInput[];
  is_published?: boolean;
  card_meta?: Record<string, any>;
}

async function saveOrUpdateResultCard(
  admin: NonNullable<typeof supabaseAdmin>,
  user: NonNullable<AuthRequest['user']>,
  body: CardSavePayload,
  existingResultId?: string
) {
  const { class_id, student_id, examination_id, subjects, is_published, card_meta } = body;

  if (!class_id || !student_id) {
    throw Object.assign(new Error('Class and Student selection are required.'), { status: 400 });
  }
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw Object.assign(new Error('At least one database subject with marks is required.'), { status: 400 });
  }

  const cleanSubjects: CardSubjectInput[] = [];
  const seenSubjectIds = new Set<string>();
  for (const s of subjects) {
    if (!s?.subject_id) {
      throw Object.assign(new Error('Please select a valid subject from the database for each row.'), { status: 400 });
    }
    if (seenSubjectIds.has(s.subject_id)) {
      throw Object.assign(new Error('Duplicate subject selected. Each subject can only appear once.'), { status: 400 });
    }
    seenSubjectIds.add(s.subject_id);
    const maxMarks = Number(s.total_marks || 50);
    const scored = Number(s.obtained_marks || 0);
    if (Number.isNaN(maxMarks) || maxMarks <= 0) {
      throw Object.assign(new Error('Subject full marks must be greater than 0.'), { status: 400 });
    }
    if (Number.isNaN(scored) || scored < 0 || scored > maxMarks) {
      throw Object.assign(new Error(`Obtained marks (${scored}) must be between 0 and ${maxMarks}.`), { status: 400 });
    }
    cleanSubjects.push({
      subject_id: s.subject_id,
      obtained_marks: scored,
      total_marks: maxMarks,
    });
  }

  if (user.role_slug === 'teacher') {
    const tid = await getTeacherIdForUser(user);
    const allowed = tid ? await getTeacherAssignedClassIds(tid) : [];
    if (!allowed.includes(class_id)) {
      throw Object.assign(new Error('Permission denied for this class.'), { status: 403 });
    }
  }

  // Validate real DB student and subjects exist
  const [{ data: studentRow, error: studentErr }, { data: validSubRows, error: subErr }] = await Promise.all([
    admin.from('students').select('id, class_id, full_name').eq('id', student_id).is('deleted_at', null).maybeSingle(),
    admin.from('subjects').select('id, name, code').in('id', Array.from(seenSubjectIds)).is('deleted_at', null),
  ]);

  if (studentErr) {
    throw Object.assign(new Error(studentErr.message || 'Database connection failed while checking student.'), { status: 503 });
  }
  if (subErr) {
    throw Object.assign(new Error(subErr.message || 'Database connection failed while checking subjects.'), { status: 503 });
  }
  if (!studentRow) {
    throw Object.assign(new Error('Selected student was not found in the database.'), { status: 404 });
  }
  if (!validSubRows || validSubRows.length !== seenSubjectIds.size) {
    throw Object.assign(new Error('One or more selected subjects do not exist in the database.'), { status: 400 });
  }

  let existingRow: any = null;
  if (existingResultId) {
    const { data: exRes } = await admin.from('results').select('*').eq('id', existingResultId).maybeSingle();
    if (!exRes) {
      throw Object.assign(new Error('Result record not found.'), { status: 404 });
    }
    if (user.role_slug === 'teacher') {
      const tid = await getTeacherIdForUser(user);
      const allowed = tid ? await getTeacherAssignedClassIds(tid) : [];
      if (!allowed.includes(exRes.class_id)) {
        throw Object.assign(new Error('Permission denied for this result record.'), { status: 403 });
      }
    }
    existingRow = exRes;
  }

  // Resolve target examination
  const examNameInput = String(card_meta?.examSession || 'Annual Examination 2026').trim() || 'Annual Examination 2026';
  const issueDateInput = String(card_meta?.issueDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  let targetExamId: string | null = null;
  let targetExamPublished = false;

  if (examination_id) {
    const { data: pickedExam } = await admin
      .from('examinations')
      .select('id, class_id, name, results_published')
      .eq('id', examination_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (pickedExam && pickedExam.class_id === class_id && pickedExam.name.trim().toLowerCase() === examNameInput.toLowerCase()) {
      targetExamId = pickedExam.id;
      targetExamPublished = Boolean(pickedExam.results_published);
    }
  }

  if (!targetExamId) {
    const { data: sameClassExams } = await admin
      .from('examinations')
      .select('id, name, results_published')
      .eq('class_id', class_id)
      .is('deleted_at', null)
      .ilike('name', examNameInput)
      .limit(1);

    if (sameClassExams && sameClassExams[0]) {
      targetExamId = sameClassExams[0].id;
      targetExamPublished = Boolean(sameClassExams[0].results_published);
    } else {
      const requestedYear = String(card_meta?.academicYear || '').trim();
      let resolvedSessionId: string | null = null;
      if (requestedYear) {
        const { data: matchedSession } = await admin
          .from('academic_sessions')
          .select('id')
          .ilike('name', requestedYear)
          .limit(1)
          .maybeSingle();
        if (matchedSession?.id) resolvedSessionId = matchedSession.id;
      }
      if (!resolvedSessionId) {
        const { data: activeSession } = await admin
          .from('academic_sessions')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        resolvedSessionId = activeSession?.id || null;
      }

      // Always start newly created examination in Draft mode until all students' results are created and uploaded
      const publishFlag = false;
      const { data: newExam, error: newExamErr } = await admin
        .from('examinations')
        .insert({
          name: examNameInput,
          exam_type: 'Term Exam',
          academic_session_id: resolvedSessionId,
          class_id,
          start_date: issueDateInput,
          end_date: issueDateInput,
          status: 'completed',
          results_published: publishFlag,
          published_by: null,
          published_at: null,
        })
        .select('id, results_published')
        .single();

      if (newExamErr || !newExam) {
        throw Object.assign(new Error(newExamErr?.message || 'Failed to create examination session for result card.'), { status: 400 });
      }
      targetExamId = newExam.id;
      targetExamPublished = Boolean(newExam.results_published);
    }
  }

  // If editing and either student_id or examination_id changed, clear old marks & old result row cleanly
  if (existingRow && (existingRow.student_id !== student_id || existingRow.examination_id !== targetExamId)) {
    await admin
      .from('marks')
      .delete()
      .eq('examination_id', existingRow.examination_id)
      .eq('student_id', existingRow.student_id);
    await admin
      .from('documents')
      .delete()
      .eq('entity_type', 'general')
      .eq('title', 'RESULT_CARD_META')
      .eq('entity_id', existingRow.id);
    await admin.from('results').delete().eq('id', existingRow.id);
    await recalculateExamPositions(admin, existingRow.examination_id);
  }

  // Batch upsert examination_subjects so each DB subject has valid passing/total metadata
  const examSubjectRows = cleanSubjects.map((sub) => ({
    examination_id: targetExamId,
    subject_id: sub.subject_id,
    exam_date: issueDateInput,
    total_marks: sub.total_marks,
    passing_marks: Math.round(sub.total_marks * 0.4),
  }));
  const { error: exSubErr } = await admin
    .from('examination_subjects')
    .upsert(examSubjectRows, { onConflict: 'examination_id,subject_id' });
  if (exSubErr) {
    throw Object.assign(new Error(exSubErr.message || 'Failed to sync examination subjects.'), { status: 400 });
  }

  // Replace marks for (targetExamId, student_id)
  await admin.from('marks').delete().eq('examination_id', targetExamId).eq('student_id', student_id);
  const { error: insMarksErr } = await admin.from('marks').insert(
    cleanSubjects.map((s) => ({
      examination_id: targetExamId,
      student_id,
      subject_id: s.subject_id,
      obtained_marks: s.obtained_marks,
      total_marks: s.total_marks,
      is_absent: false,
      entered_by: user.id,
    }))
  );
  if (insMarksErr) {
    throw Object.assign(new Error(insMarksErr.message), { status: 400 });
  }

  let totalMarks = 0;
  let obtainedMarks = 0;
  let failedSubjects = 0;
  for (const s of cleanSubjects) {
    totalMarks += s.total_marks;
    obtainedMarks += s.obtained_marks;
    if (s.obtained_marks < s.total_marks * 0.4) {
      failedSubjects += 1;
    }
  }

  const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 10000) / 100 : 0;
  const grade = percentageToCardGrade(percentage);
  const status: 'pass' | 'fail' = failedSubjects === 0 && percentage >= 40 ? 'pass' : 'fail';

  const shouldPublish = existingRow ? Boolean(existingRow.is_published) : targetExamPublished;

  const remarksText = String(card_meta?.remarks || '').trim();

  const { data: savedResult, error: resErr } = await admin
    .from('results')
    .upsert(
      {
        examination_id: targetExamId,
        student_id,
        class_id,
        total_marks: totalMarks,
        obtained_marks: obtainedMarks,
        percentage,
        grade,
        status,
        position: existingRow?.position || 1,
        teacher_remarks: remarksText,
        is_published: shouldPublish,
        approved_by: shouldPublish ? user.id : existingRow?.approved_by || null,
        approved_at: shouldPublish ? new Date().toISOString() : existingRow?.approved_at || null,
      },
      { onConflict: 'examination_id,student_id' }
    )
    .select('id')
    .single();

  if (resErr || !savedResult) {
    throw Object.assign(new Error(resErr?.message || 'Failed to save result record.'), { status: 400 });
  }

  if (!targetExamId) {
    throw Object.assign(new Error('Target examination could not be resolved.'), { status: 400 });
  }
  await recalculateExamPositions(admin, targetExamId);

  // Store clean card metadata for View & Edit restoration
  if (card_meta) {
    const cleanMeta = {
      schoolName: String(card_meta.schoolName || ''),
      schoolAddress: String(card_meta.schoolAddress || ''),
      admNo: String(card_meta.admNo || ''),
      studentName: String(card_meta.studentName || studentRow.full_name || ''),
      division: String(card_meta.division || 'A'),
      teacher: String(card_meta.teacher || 'Class Teacher'),
      academicYear: String(card_meta.academicYear || ''),
      examSession: examNameInput,
      issueDate: issueDateInput,
      issueTime: String(card_meta.issueTime || ''),
      photo: card_meta.photo ? normalizeStorageRef(String(card_meta.photo)) : '',
      remarks: remarksText,
    };

    await admin
      .from('documents')
      .delete()
      .eq('entity_type', 'general')
      .eq('title', 'RESULT_CARD_META')
      .eq('entity_id', savedResult.id);

    await admin.from('documents').insert({
      entity_type: 'general',
      entity_id: savedResult.id,
      title: 'RESULT_CARD_META',
      file_url: JSON.stringify(cleanMeta),
      file_type: 'result_card_meta',
      uploaded_by: user.id,
    });
  }

  return {
    id: savedResult.id,
    examination_id: targetExamId,
    student_name: studentRow.full_name,
  };
}

router.post('/results/card', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const result = await saveOrUpdateResultCard(admin, req.user!, req.body as CardSavePayload);
    await logActivity(
      req.user!,
      'RESULT_CARD_CREATED',
      'results',
      result.id,
      `Saved result card for ${result.student_name}`,
      req.ip
    );
    return res.status(201).json({ success: true, id: result.id, examination_id: result.examination_id });
  } catch (err: any) {
    console.error('Create result card error:', err);
    const rawMsg = String(err?.message || 'Failed to save result card');
    const isNetwork = rawMsg.toLowerCase().includes('fetch failed');
    return res.status(isNetwork ? 503 : typeof err?.status === 'number' ? err.status : 500).json({
      error: isNetwork
        ? 'Database connection was temporarily interrupted. Please try saving again.'
        : rawMsg,
    });
  }
});

router.put('/results/:id/card', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const result = await saveOrUpdateResultCard(admin, req.user!, req.body as CardSavePayload, req.params.id);
    await logActivity(
      req.user!,
      'RESULT_CARD_UPDATED',
      'results',
      result.id,
      `Updated result card for ${result.student_name}`,
      req.ip
    );
    return res.json({ success: true, id: result.id, examination_id: result.examination_id });
  } catch (err: any) {
    console.error('Update result card error:', err);
    const rawMsg = String(err?.message || 'Failed to update result card');
    const isNetwork = rawMsg.toLowerCase().includes('fetch failed');
    return res.status(isNetwork ? 503 : typeof err?.status === 'number' ? err.status : 500).json({
      error: isNetwork
        ? 'Database connection was temporarily interrupted. Please try updating again.'
        : rawMsg,
    });
  }
});

router.delete('/results/:id', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;

    const { data: existing } = await admin.from('results').select('*').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Result record not found' });

    if (req.user!.role_slug === 'teacher') {
      const tid = await getTeacherIdForUser(req.user!);
      const allowed = tid ? await getTeacherAssignedClassIds(tid) : [];
      if (!allowed.includes(existing.class_id)) {
        return res.status(403).json({ error: 'Permission denied to delete this result.' });
      }
    }

    await Promise.all([
      admin.from('marks').delete().eq('examination_id', existing.examination_id).eq('student_id', existing.student_id),
      admin.from('documents').delete().eq('entity_type', 'general').eq('title', 'RESULT_CARD_META').eq('entity_id', id),
    ]);

    const { error: delErr } = await admin.from('results').delete().eq('id', id);
    if (delErr) return res.status(400).json({ error: delErr.message });

    await recalculateExamPositions(admin, existing.examination_id);
    await logActivity(req.user!, 'RESULT_DELETED', 'results', id, `Deleted result ${id}`, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Delete result error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to delete result' });
  }
});

// ==================== HOMEWORK ====================
router.get('/homework', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;
  const { classId } = req.query as { classId?: string };

  let q = admin
    .from('homework')
    .select('*, classes(name), subjects(name), teachers(full_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (user.role_slug === 'student') {
    const stId = await getStudentIdForUser(user);
    const { data: st } = stId ? await admin.from('students').select('class_id').eq('id', stId).maybeSingle() : { data: null };
    if (!st?.class_id) return res.json({ homework: [] });
    q = q.eq('class_id', st.class_id);
  } else if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    const cids = pid ? await getParentStudentIds(pid) : [];
    if (!cids.length) return res.json({ homework: [] });
    const { data: sts } = await admin.from('students').select('class_id').in('id', cids);
    const classIds = Array.from(new Set((sts || []).map((s) => s.class_id).filter(Boolean) as string[]));
    if (!classIds.length) return res.json({ homework: [] });
    q = q.in('class_id', classIds);
  } else if (user.role_slug === 'teacher') {
    const tid = await getTeacherIdForUser(user);
    const classIds = tid ? await getTeacherAssignedClassIds(tid) : [];
    if (!classIds.length) return res.json({ homework: [] });
    q = q.in('class_id', classIds);
  }

  if (classId) q = q.eq('class_id', classId);

  const [{ data: hwRaw }, { data: subsRaw }] = await Promise.all([
    q,
    admin.from('homework_submissions').select('*, students(full_name, student_code)'),
  ]);

  const myStudentId = user.role_slug === 'student' ? await getStudentIdForUser(user) : null;
  const parentId = user.role_slug === 'parent' ? await getParentIdForUser(user) : null;
  const myParentChildren = parentId ? await getParentStudentIds(parentId) : [];

  const resolvedHw = await resolveStorageUrlsInRows(hwRaw || [], ['attachment_url']);
  const resolvedSubs = await resolveStorageUrlsInRows(subsRaw || [], ['attachment_url']);

  const homework = resolvedHw.map((hw: any) => ({
    ...hw,
    class_name: hw.classes?.name || '',
    subject_name: hw.subjects?.name || '',
    teacher_name: hw.teachers?.full_name || '',
    submissions: resolvedSubs
      .filter((sub: any) => {
        if (sub.homework_id !== hw.id) return false;
        if (user.role_slug === 'student') return sub.student_id === myStudentId;
        if (user.role_slug === 'parent') return myParentChildren.includes(sub.student_id);
        return true;
      })
      .map((sub: any) => ({
        ...sub,
        student_name: sub.students?.full_name || '',
        student_code: sub.students?.student_code || '',
      })),
  }));

  return res.json({ homework });
});

router.post('/homework', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { class_id, subject_id, teacher_id, title, description, attachment_url, attachment_name, assigned_date, submission_deadline, allow_submission } = req.body;
    if (!class_id || !subject_id || !title || !submission_deadline) {
      return res.status(400).json({ error: 'Class, subject, title, and submission deadline are required.' });
    }
    let resolvedTeacherId = teacher_id || (await getTeacherIdForUser(req.user!));
    if (!resolvedTeacherId) {
      const { data: firstTeacher } = await admin.from('teachers').select('id').is('deleted_at', null).limit(1).maybeSingle();
      resolvedTeacherId = firstTeacher?.id;
    }
    if (!resolvedTeacherId) return res.status(400).json({ error: 'A teacher record is required before assigning homework.' });

    const { data: created, error } = await admin
      .from('homework')
      .insert({
        class_id,
        subject_id,
        teacher_id: resolvedTeacherId,
        title: title.trim(),
        description: description || '',
        attachment_url: normalizeStorageRef(attachment_url),
        attachment_name: attachment_name || '',
        assigned_date: assigned_date || new Date().toISOString().slice(0, 10),
        submission_deadline,
        allow_submission: allow_submission !== false,
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to create homework' });
    await notifyRoles(['student', 'parent'], 'homework', 'New Homework Assigned', `${title} — Due ${submission_deadline}`, 'homework', created.id);
    await logActivity(req.user!, 'HOMEWORK_CREATED', 'homework', created.id, `Assigned homework: ${title}`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create homework' });
  }
});

router.post('/homework/:id/submit', requireAuth, requireRole('student', 'parent'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const hwId = req.params.id;
  const { student_id, submission_text, attachment_url, attachment_name } = req.body;
  const resolvedStudentId = req.user!.role_slug === 'student' ? await getStudentIdForUser(req.user!) : student_id;
  if (!resolvedStudentId) return res.status(400).json({ error: 'Student profile required for submission.' });

  const { error } = await admin.from('homework_submissions').upsert(
    {
      homework_id: hwId,
      student_id: resolvedStudentId,
      submission_text: submission_text || '',
      attachment_url: normalizeStorageRef(attachment_url),
      attachment_name: attachment_name || '',
      submitted_at: new Date().toISOString(),
      status: 'submitted',
    },
    { onConflict: 'homework_id,student_id' }
  );
  if (error) return res.status(400).json({ error: error.message });

  await logActivity(req.user!, 'HOMEWORK_SUBMITTED', 'homework', hwId, `Student ${resolvedStudentId} submitted homework ${hwId}`, req.ip);
  return res.json({ success: true });
});

router.post('/homework/submissions/:subId/review', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const subId = req.params.subId;
  const { feedback, grade, status } = req.body;
  const { error } = await admin
    .from('homework_submissions')
    .update({
      feedback: feedback || '',
      grade: grade || '',
      status: status || 'reviewed',
      reviewed_by: req.user!.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', subId);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'HOMEWORK_REVIEWED', 'homework', subId, `Reviewed submission ${subId}`, req.ip);
  return res.json({ success: true });
});

router.delete('/homework/:id', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('homework').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'HOMEWORK_DELETED', 'homework', id, `Deleted homework ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== ONLINE CLASSES ====================
router.get('/online-classes', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;

  let q = admin
    .from('online_classes')
    .select('*, classes(name), subjects(name), teachers(full_name)')
    .is('deleted_at', null)
    .order('meeting_date', { ascending: false })
    .order('start_time', { ascending: true });

  if (user.role_slug === 'student') {
    const stId = await getStudentIdForUser(user);
    const { data: st } = stId ? await admin.from('students').select('class_id').eq('id', stId).maybeSingle() : { data: null };
    if (!st?.class_id) return res.json({ onlineClasses: [] });
    q = q.eq('class_id', st.class_id);
  } else if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    const cids = pid ? await getParentStudentIds(pid) : [];
    if (!cids.length) return res.json({ onlineClasses: [] });
    const { data: sts } = await admin.from('students').select('class_id').in('id', cids);
    const classIds = Array.from(new Set((sts || []).map((s) => s.class_id).filter(Boolean) as string[]));
    if (!classIds.length) return res.json({ onlineClasses: [] });
    q = q.in('class_id', classIds);
  }

  const { data } = await q;
  const onlineClasses = (data || []).map((oc: any) => ({
    ...oc,
    class_name: oc.classes?.name || '',
    subject_name: oc.subjects?.name || '',
    teacher_name: oc.teachers?.full_name || '',
  }));
  return res.json({ onlineClasses });
});

router.post('/online-classes', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { title, class_id, subject_id, teacher_id, meeting_date, start_time, end_time, platform, meeting_url, instructions, status } = req.body;
    if (!title || !class_id || !meeting_date || !start_time || !end_time || !meeting_url) {
      return res.status(400).json({ error: 'Title, class, date, timings, and meeting URL are required.' });
    }
    let resolvedTeacherId = teacher_id || (await getTeacherIdForUser(req.user!));
    if (!resolvedTeacherId) {
      const { data: firstTeacher } = await admin.from('teachers').select('id').is('deleted_at', null).limit(1).maybeSingle();
      resolvedTeacherId = firstTeacher?.id;
    }
    if (!resolvedTeacherId) return res.status(400).json({ error: 'A teacher record is required.' });

    const { data: created, error } = await admin
      .from('online_classes')
      .insert({
        title: title.trim(),
        class_id,
        subject_id: subject_id || null,
        teacher_id: resolvedTeacherId,
        meeting_date,
        start_time,
        end_time,
        platform: platform || 'Google Meet',
        meeting_url: meeting_url.trim(),
        instructions: instructions || '',
        status: status || 'scheduled',
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to schedule online class' });
    await notifyRoles(['student', 'parent'], 'online_class', 'Online Class Scheduled', `${title} on ${meeting_date} at ${start_time}.`, 'online_classes', created.id);
    await logActivity(req.user!, 'ONLINE_CLASS_CREATED', 'online_classes', created.id, `Scheduled online class: ${title}`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to schedule online class' });
  }
});

router.put('/online-classes/:id', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { title, class_id, subject_id, teacher_id, meeting_date, start_time, end_time, platform, meeting_url, instructions, status } = req.body;
  const payload: Record<string, any> = {};
  if (title !== undefined) payload.title = title;
  if (class_id !== undefined) payload.class_id = class_id;
  if (subject_id !== undefined) payload.subject_id = subject_id || null;
  if (teacher_id !== undefined) payload.teacher_id = teacher_id;
  if (meeting_date !== undefined) payload.meeting_date = meeting_date;
  if (start_time !== undefined) payload.start_time = start_time;
  if (end_time !== undefined) payload.end_time = end_time;
  if (platform !== undefined) payload.platform = platform;
  if (meeting_url !== undefined) payload.meeting_url = meeting_url;
  if (instructions !== undefined) payload.instructions = instructions;
  if (status !== undefined) payload.status = status;

  const { error } = await admin.from('online_classes').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'ONLINE_CLASS_UPDATED', 'online_classes', id, `Updated online class ${id}`, req.ip);
  return res.json({ success: true });
});

router.delete('/online-classes/:id', requireAuth, requireRole('super_admin', 'teacher'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('online_classes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'ONLINE_CLASS_DELETED', 'online_classes', id, `Deleted online class ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== SYLLABUS & BOOKS ====================
const SYLLABUS_GLOBAL_ENTITY_ID = '00000000-0000-0000-0000-000000000001';

router.get('/syllabus', requireAuth, async (req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;

  const { classId, subject, search } = req.query as Record<string, string>;

  const [{ data: docs, error }, { data: classesRaw }, { data: taRaw }] = await Promise.all([
    admin
      .from('documents')
      .select('id, entity_id, file_url, uploaded_by, created_at')
      .eq('entity_type', 'general')
      .eq('title', 'SYLLABUS_ITEM')
      .order('created_at', { ascending: false }),
    admin.from('classes').select('id, name, code, teachers(full_name)').is('deleted_at', null),
    admin.from('teacher_assignments').select('class_id, is_class_teacher, teachers(full_name, deleted_at)'),
  ]);

  if (error) return res.status(500).json({ error: error.message });

  const assignedTeacherByClass = new Map<string, string>();
  for (const ta of taRaw || []) {
    const tName = (ta as any).teachers?.full_name;
    const tDeleted = (ta as any).teachers?.deleted_at;
    if (!ta.class_id || !tName || tDeleted) continue;
    if (ta.is_class_teacher || !assignedTeacherByClass.has(ta.class_id)) {
      assignedTeacherByClass.set(ta.class_id, tName);
    }
  }

  const classMap = new Map<string, { name: string; code: string; class_teacher_name: string }>();
  for (const c of classesRaw || []) {
    classMap.set(c.id, {
      name: c.name,
      code: c.code,
      class_teacher_name: (c as any).teachers?.full_name || assignedTeacherByClass.get(c.id) || 'Unassigned',
    });
  }

  const parsedItems = await Promise.all(
    (docs || []).map(async (doc: any) => {
      let data: Record<string, any> = {};
      try {
        data = JSON.parse(doc.file_url || '{}');
      } catch {
        data = {};
      }
      const clsId = String(data.class_id || (doc.entity_id !== SYLLABUS_GLOBAL_ENTITY_ID ? doc.entity_id : '') || '');
      const clsInfo = clsId ? classMap.get(clsId) : null;

      const [coverPageUrl, bookPdfUrl, syllabusPdfUrl] = await Promise.all([
        resolveStorageUrl(data.cover_page_url),
        resolveStorageUrl(data.book_pdf_url),
        resolveStorageUrl(data.syllabus_pdf_url),
      ]);

      const resolvedBookName = String(data.book_name || data.syllabus_title || '');
      const itemType =
        data.item_type === 'syllabus_pdf' || (!String(data.book_name || '').trim() && Boolean(syllabusPdfUrl))
          ? 'syllabus_pdf'
          : 'book';

      return {
        id: doc.id,
        item_type: itemType,
        class_id: clsId,
        class_name: clsInfo?.name || data.class_name || 'All Classes',
        class_code: clsInfo?.code || '',
        class_teacher_name: clsInfo?.class_teacher_name || '',
        subject_id: String(data.subject_id || ''),
        subject_name: String(data.subject_name || (itemType === 'syllabus_pdf' ? 'All Subjects' : '')),
        book_name: resolvedBookName,
        syllabus_title: String(data.syllabus_title || resolvedBookName),
        syllabus_type: String(data.syllabus_type || (itemType === 'syllabus_pdf' ? 'Syllabus PDF' : '')),
        author_name: String(data.author_name || ''),
        academic_year: String(data.academic_year || ''),
        cover_page_url: coverPageUrl,
        book_pdf_url: bookPdfUrl,
        book_pdf_name: String(data.book_pdf_name || ''),
        syllabus_pdf_url: syllabusPdfUrl,
        syllabus_pdf_name: String(data.syllabus_pdf_name || ''),
        weekly_plan: String(data.weekly_plan || ''),
        created_at: doc.created_at,
      };
    })
  );

  const q = (search || '').trim().toLowerCase();
  const subFilter = (subject || '').trim().toLowerCase();
  const items = parsedItems.filter((item) => {
    if (classId && item.class_id !== classId) return false;
    if (subFilter && subFilter !== 'all' && item.subject_name.toLowerCase() !== subFilter) return false;
    if (!q) return true;
    return (
      item.book_name.toLowerCase().includes(q) ||
      item.subject_name.toLowerCase().includes(q) ||
      item.class_name.toLowerCase().includes(q) ||
      item.author_name.toLowerCase().includes(q) ||
      item.weekly_plan.toLowerCase().includes(q)
    );
  });

  return res.json({ items });
});

router.post('/syllabus', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const b = req.body as Record<string, any>;
    const itemType = b.item_type === 'syllabus_pdf' ? 'syllabus_pdf' : 'book';
    const syllabusTitle = String(b.syllabus_title || '').trim();
    const syllabusPdfUrl = normalizeStorageRef(String(b.syllabus_pdf_url || ''));
    const syllabusPdfName = String(b.syllabus_pdf_name || '').trim();
    const subjectName = String(b.subject_name || '').trim() || (itemType === 'syllabus_pdf' ? 'All Subjects' : '');
    const rawBookName = String(b.book_name || '').trim();
    const bookName = rawBookName || syllabusTitle || (itemType === 'syllabus_pdf' ? syllabusPdfName.replace(/\.pdf$/i, '') : '');

    if (itemType === 'syllabus_pdf') {
      if (!syllabusPdfUrl) {
        return res.status(400).json({ error: 'Please upload a Syllabus PDF file.' });
      }
      if (!bookName) {
        return res.status(400).json({ error: 'Syllabus Title is required.' });
      }
    } else if (!subjectName || !bookName) {
      return res.status(400).json({ error: 'Subject / Language (e.g. English, Urdu) and Book Name are required.' });
    }

    const classId = String(b.class_id || '').trim();
    const payload = {
      item_type: itemType,
      class_id: classId,
      class_name: String(b.class_name || '').trim(),
      subject_id: String(b.subject_id || '').trim(),
      subject_name: subjectName,
      book_name: bookName,
      syllabus_title: syllabusTitle || bookName,
      syllabus_type: String(b.syllabus_type || (itemType === 'syllabus_pdf' ? 'Syllabus PDF' : '')).trim(),
      author_name: String(b.author_name || '').trim(),
      academic_year: String(b.academic_year || '').trim(),
      cover_page_url: normalizeStorageRef(String(b.cover_page_url || '')),
      book_pdf_url: normalizeStorageRef(String(b.book_pdf_url || '')),
      book_pdf_name: String(b.book_pdf_name || '').trim(),
      syllabus_pdf_url: syllabusPdfUrl,
      syllabus_pdf_name: syllabusPdfName,
      weekly_plan: String(b.weekly_plan || '').trim(),
    };

    const { data: created, error } = await admin
      .from('documents')
      .insert({
        entity_type: 'general',
        entity_id: classId || SYLLABUS_GLOBAL_ENTITY_ID,
        title: 'SYLLABUS_ITEM',
        file_url: JSON.stringify(payload),
        file_type: 'syllabus_item',
        uploaded_by: req.user!.id,
      })
      .select('id')
      .single();

    if (error || !created) {
      return res.status(400).json({ error: error?.message || 'Failed to add syllabus item' });
    }

    await notifyRoles(
      ['teacher', 'student', 'parent'],
      'notice',
      'Syllabus & Book Updated',
      `New syllabus added for ${subjectName}: ${bookName}.`,
      'syllabus',
      created.id
    );
    await logActivity(
      req.user!,
      'SYLLABUS_ADDED',
      'syllabus',
      created.id,
      `Added syllabus & book "${bookName}" (${subjectName})`,
      req.ip
    );

    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to add syllabus item' });
  }
});

router.put('/syllabus/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const { data: existing, error: findErr } = await admin
      .from('documents')
      .select('id, file_url')
      .eq('id', id)
      .eq('title', 'SYLLABUS_ITEM')
      .maybeSingle();

    if (findErr || !existing) {
      return res.status(404).json({ error: 'Syllabus item not found' });
    }

    let prevData: Record<string, any> = {};
    try {
      prevData = JSON.parse(existing.file_url || '{}');
    } catch {
      prevData = {};
    }

    const b = req.body as Record<string, any>;
    const itemType =
      b.item_type === 'syllabus_pdf' || prevData.item_type === 'syllabus_pdf' ? 'syllabus_pdf' : 'book';
    const syllabusTitle = String(b.syllabus_title ?? prevData.syllabus_title ?? '').trim();
    const syllabusPdfUrl = normalizeStorageRef(String(b.syllabus_pdf_url ?? prevData.syllabus_pdf_url ?? ''));
    const syllabusPdfName = String(b.syllabus_pdf_name ?? prevData.syllabus_pdf_name ?? '').trim();
    const subjectName =
      String(b.subject_name ?? prevData.subject_name ?? '').trim() ||
      (itemType === 'syllabus_pdf' ? 'All Subjects' : '');
    const rawBookName = String(b.book_name ?? prevData.book_name ?? '').trim();
    const bookName = rawBookName || syllabusTitle;

    if (itemType === 'syllabus_pdf') {
      if (!syllabusPdfUrl) {
        return res.status(400).json({ error: 'Syllabus PDF file is required.' });
      }
      if (!bookName) {
        return res.status(400).json({ error: 'Syllabus Title is required.' });
      }
    } else if (!subjectName || !bookName) {
      return res.status(400).json({ error: 'Subject / Language and Book Name are required.' });
    }

    const classId = String(b.class_id ?? prevData.class_id ?? '').trim();
    const updatedPayload = {
      item_type: itemType,
      class_id: classId,
      class_name: String(b.class_name ?? prevData.class_name ?? '').trim(),
      subject_id: String(b.subject_id ?? prevData.subject_id ?? '').trim(),
      subject_name: subjectName,
      book_name: bookName,
      syllabus_title: syllabusTitle || bookName,
      syllabus_type: String(b.syllabus_type ?? prevData.syllabus_type ?? '').trim(),
      author_name: String(b.author_name ?? prevData.author_name ?? '').trim(),
      academic_year: String(b.academic_year ?? prevData.academic_year ?? '').trim(),
      cover_page_url: normalizeStorageRef(String(b.cover_page_url ?? prevData.cover_page_url ?? '')),
      book_pdf_url: normalizeStorageRef(String(b.book_pdf_url ?? prevData.book_pdf_url ?? '')),
      book_pdf_name: String(b.book_pdf_name ?? prevData.book_pdf_name ?? '').trim(),
      syllabus_pdf_url: syllabusPdfUrl,
      syllabus_pdf_name: syllabusPdfName,
      weekly_plan: String(b.weekly_plan ?? prevData.weekly_plan ?? '').trim(),
    };

    const { error } = await admin
      .from('documents')
      .update({
        entity_id: classId || SYLLABUS_GLOBAL_ENTITY_ID,
        file_url: JSON.stringify(updatedPayload),
      })
      .eq('id', id)
      .eq('title', 'SYLLABUS_ITEM');

    if (error) return res.status(400).json({ error: error.message });

    await logActivity(
      req.user!,
      'SYLLABUS_UPDATED',
      'syllabus',
      id,
      `Updated syllabus & book "${bookName}" (${subjectName})`,
      req.ip
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update syllabus item' });
  }
});

router.delete('/syllabus/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('documents').delete().eq('id', id).eq('title', 'SYLLABUS_ITEM');
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'SYLLABUS_DELETED', 'syllabus', id, `Deleted syllabus item ${id}`, req.ip);
  return res.json({ success: true });
});

export default router;
