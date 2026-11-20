import { Router } from 'express';
import {
  AuthRequest,
  getTeacherAssignedClassIds,
  getTeacherIdForUser,
  requireAuth,
  requireRole,
} from '../auth.ts';
import { requireSupabaseAdmin, resolveStorageUrl } from '../supabase.ts';

const router = Router();

const REPORT_ROLES = ['super_admin', 'committee_member', 'teacher'] as const;

interface SessionRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface PeriodWindow {
  startDate: string;
  endDate: string;
  sessionId: string | null;
  sessionName: string;
  label: string;
  months: { key: string; label: string }[];
}

interface ScopeContext {
  isTeacher: boolean;
  teacherId: string | null;
  allowedClassIds: string[] | null; // null = unrestricted (super_admin / committee_member)
  canViewAdminLogs: boolean;
  canViewFinance: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function round1(val: number): number {
  return Number.isFinite(val) ? Math.round(val * 10) / 10 : 0;
}

function pct(num: number, den: number): number {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function dateOnly(val?: string | null): string {
  if (!val) return '';
  return String(val).slice(0, 10);
}

function monthKey(val?: string | null): string {
  const d = dateOnly(val);
  return d.length >= 7 ? d.slice(0, 7) : '';
}

function formatMonthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_SHORT[(m - 1) % 12]} ${y}`;
}

function buildMonthsRange(startDate: string, endDate: string): { key: string; label: string }[] {
  const s = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const e = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) {
    const y = new Date().getUTCFullYear();
    return Array.from({ length: 12 }, (_, idx) => {
      const m = String(idx + 1).padStart(2, '0');
      return { key: `${y}-${m}`, label: `${MONTH_SHORT[idx]} ${y}` };
    });
  }
  const out: { key: string; label: string }[] = [];
  const cur = new Date(s.getTime());
  let guard = 0;
  while (cur <= e && guard < 24) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    out.push({ key, label: `${MONTH_SHORT[m]} ${y}` });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
    guard += 1;
  }
  return out;
}

function getPreviousMonthKey(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return '';
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function inDateRange(d: string | null | undefined, start?: string, end?: string): boolean {
  const clean = dateOnly(d);
  if (!clean) return false;
  if (start && clean < start) return false;
  if (end && clean > end) return false;
  return true;
}

async function resolveScope(req: AuthRequest): Promise<ScopeContext> {
  const role = req.user!.role_slug;
  if (role === 'teacher') {
    const teacherId = await getTeacherIdForUser(req.user!);
    const allowedClassIds = teacherId ? await getTeacherAssignedClassIds(teacherId) : [];
    return {
      isTeacher: true,
      teacherId,
      allowedClassIds,
      canViewAdminLogs: false,
      canViewFinance: false,
    };
  }
  return {
    isTeacher: false,
    teacherId: null,
    allowedClassIds: null,
    canViewAdminLogs: role === 'super_admin' || role === 'committee_member',
    canViewFinance: role === 'super_admin' || role === 'committee_member',
  };
}

function resolvePeriodWindow(
  sessions: SessionRow[],
  params: Record<string, string | undefined>
): PeriodWindow {
  const { sessionId, calendarYear, month, date, weekStart, dateFrom, dateTo } = params;

  const activeSession = sessions.find((s) => s.is_active) || sessions[0] || null;
  let chosenSession: SessionRow | null = null;
  if (sessionId && sessionId !== 'all') {
    chosenSession = sessions.find((s) => s.id === sessionId) || null;
  } else if (!sessionId && !calendarYear && !month && !date && !weekStart && !dateFrom && !dateTo) {
    chosenSession = activeSession;
  }

  let startDate = chosenSession?.start_date || `${new Date().getFullYear()}-01-01`;
  let endDate = chosenSession?.end_date || `${new Date().getFullYear()}-12-31`;
  let label = chosenSession ? `Academic Year ${chosenSession.name}` : 'All Records';

  if (sessionId === 'all' && !calendarYear && !month && !date && !weekStart && !dateFrom && !dateTo) {
    startDate = '';
    endDate = '';
    label = 'All Academic Years';
  }

  if (calendarYear && /^\d{4}$/.test(calendarYear)) {
    startDate = `${calendarYear}-01-01`;
    endDate = `${calendarYear}-12-31`;
    label = `Calendar Year ${calendarYear}`;
    chosenSession = null;
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const b = getMonthBounds(month);
    startDate = b.start;
    endDate = b.end;
    label = formatMonthLabel(month);
  }

  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    const startDt = new Date(`${weekStart}T00:00:00Z`);
    if (!Number.isNaN(startDt.getTime())) {
      const endDt = new Date(startDt.getTime() + 6 * 86400000);
      startDate = weekStart;
      endDate = endDt.toISOString().slice(0, 10);
      label = `Week ${startDate} to ${endDate}`;
    }
  }

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    startDate = date;
    endDate = date;
    label = `Date ${date}`;
  }

  if (dateFrom || dateTo) {
    startDate = dateFrom || startDate;
    endDate = dateTo || endDate;
    label = `${startDate || 'Start'} to ${endDate || 'Present'}`;
  }

  const monthsStart = startDate || `${new Date().getFullYear()}-01-01`;
  const monthsEnd = endDate || `${new Date().getFullYear()}-12-31`;

  return {
    startDate,
    endDate,
    sessionId: chosenSession?.id || null,
    sessionName: chosenSession?.name || (calendarYear ? calendarYear : 'All Sessions'),
    label,
    months: buildMonthsRange(monthsStart, monthsEnd),
  };
}

function getPreviousSession(sessions: SessionRow[], currentSessionId: string | null): SessionRow | null {
  if (!sessions.length) return null;
  const sorted = [...sessions].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  if (!currentSessionId) return sorted[1] || null;
  const idx = sorted.findIndex((s) => s.id === currentSessionId);
  if (idx >= 0 && idx + 1 < sorted.length) return sorted[idx + 1];
  return null;
}

interface CoreDatabaseSnapshot {
  sessions: SessionRow[];
  classes: any[];
  subjects: any[];
  classSubjects: any[];
  teachers: any[];
  teacherAssignments: any[];
  teacherAttendance: any[];
  students: any[];
  admissions: any[];
  promotions: any[];
  attendance: any[];
  examinations: any[];
  examSubjects: any[];
  marks: any[];
  results: any[];
  homework: any[];
  homeworkSubmissions: any[];
  notices: any[];
  programs: any[];
  programPayments: any[];
  feedPosts: any[];
  activityLogs: any[];
}

async function fetchCoreSnapshot(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  scope: ScopeContext
): Promise<CoreDatabaseSnapshot> {
  const [
    sessionsRes,
    classesRes,
    subjectsRes,
    classSubjectsRes,
    teachersRes,
    teacherAssignmentsRes,
    teacherAttendanceRes,
    studentsRes,
    admissionsRes,
    promotionsRes,
    attendanceRes,
    examinationsRes,
    examSubjectsRes,
    marksRes,
    resultsRes,
    homeworkRes,
    homeworkSubsRes,
    noticesRes,
    programsRes,
    regDocsRes,
    feedRes,
    logsRes,
  ] = await Promise.all([
    admin.from('academic_sessions').select('id, name, start_date, end_date, is_active').order('start_date', { ascending: false }),
    admin.from('classes').select('id, name, code, academic_session_id, class_teacher_id, room_no, status').is('deleted_at', null).order('name', { ascending: true }),
    admin.from('subjects').select('id, name, code, total_marks, passing_marks').is('deleted_at', null).order('name', { ascending: true }),
    admin.from('class_subjects').select('id, class_id, subject_id, teacher_id, total_marks, passing_marks'),
    admin.from('teachers').select('id, teacher_code, user_id, full_name, father_name, dob, gender, mobile, email, address, qualification, joining_date, employment_status, remarks, created_at').is('deleted_at', null).order('full_name', { ascending: true }),
    admin.from('teacher_assignments').select('id, teacher_id, class_id, subject_id, academic_session_id, is_class_teacher'),
    admin.from('teacher_attendance').select('id, teacher_id, attendance_date, status, remark'),
    admin.from('students').select('id, student_code, admission_no, admission_number, full_name, father_name, mother_name, dob, gender, religion, address, village, district, state, pin_code, mobile, class_id, academic_session_id, admission_date, photo_url, status, approval_status, previous_school, previous_class, remarks, created_at').is('deleted_at', null).order('full_name', { ascending: true }),
    admin.from('admissions').select('id, admission_no, admission_number, student_name, father_name, mother_name, dob, gender, village, district, state, student_mobile, guardian_name, guardian_relationship, guardian_mobile, previous_school, previous_class, admission_date, admission_class_id, status, approval_status, student_id, created_at').is('deleted_at', null).order('admission_date', { ascending: false }),
    admin.from('student_promotions').select('id, student_id, from_class_id, to_class_id, from_session_id, to_session_id, action_type, remarks, created_at').order('created_at', { ascending: false }),
    admin.from('attendance').select('id, academic_session_id, class_id, student_id, attendance_date, status, remark'),
    admin.from('examinations').select('id, name, exam_type, academic_session_id, class_id, start_date, end_date, status, results_published, published_at, created_at').is('deleted_at', null).order('start_date', { ascending: false }),
    admin.from('examination_subjects').select('id, examination_id, subject_id, exam_date, total_marks, passing_marks'),
    admin.from('marks').select('id, examination_id, student_id, subject_id, obtained_marks, total_marks, is_absent, remarks'),
    admin.from('results').select('id, examination_id, student_id, class_id, total_marks, obtained_marks, percentage, grade, status, position, teacher_remarks, is_published, created_at'),
    admin.from('homework').select('id, class_id, subject_id, teacher_id, title, assigned_date, submission_deadline, created_at').is('deleted_at', null),
    admin.from('homework_submissions').select('id, homework_id, student_id, status, grade, submitted_at'),
    admin.from('notices').select('id, title, category, publish_date, target_audience, target_class_id, created_at').is('deleted_at', null).order('publish_date', { ascending: false }),
    admin.from('programs').select('id, title, program_date, end_date, venue, category, payment_required, payment_amount, status, created_at').is('deleted_at', null).order('program_date', { ascending: false }),
    scope.canViewFinance
      ? admin.from('documents').select('id, entity_id, file_url, created_at').eq('file_type', 'program_registration').order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    admin.from('feed_posts').select('id, title, likes_count, created_at').is('deleted_at', null).order('created_at', { ascending: false }),
    scope.canViewAdminLogs
      ? admin.from('activity_logs').select('id, username, role_name, action, module, record_id, details, created_at').order('created_at', { ascending: false }).limit(500)
      : Promise.resolve({ data: [] }),
  ]);

  const allowedSet = scope.allowedClassIds ? new Set(scope.allowedClassIds) : null;
  const allowClass = (cid?: string | null) => !allowedSet || (Boolean(cid) && allowedSet.has(String(cid)));

  const classes = (classesRes.data || []).filter((c: any) => allowClass(c.id));
  const students = (studentsRes.data || []).filter((s: any) => allowClass(s.class_id));
  const allowedStudentIds = new Set(students.map((s: any) => s.id));

  const teachers = scope.isTeacher && scope.teacherId
    ? (teachersRes.data || []).filter((t: any) => t.id === scope.teacherId)
    : teachersRes.data || [];

  const teacherAttendance = scope.isTeacher && scope.teacherId
    ? (teacherAttendanceRes.data || []).filter((a: any) => a.teacher_id === scope.teacherId)
    : teacherAttendanceRes.data || [];

  const examinations = (examinationsRes.data || []).filter((e: any) => allowClass(e.class_id));
  const allowedExamIds = new Set(examinations.map((e: any) => e.id));

  const programsMap = new Map<string, any>();
  for (const p of programsRes.data || []) programsMap.set(p.id, p);

  const programPayments: any[] = [];
  for (const doc of (regDocsRes.data || []) as any[]) {
    try {
      const parsed = JSON.parse(doc.file_url || '{}');
      const amount = Number(parsed.payment_amount || 0);
      if (parsed.payment_required || amount > 0) {
        const prog = programsMap.get(doc.entity_id);
        programPayments.push({
          id: doc.id,
          program_id: doc.entity_id,
          program_title: prog?.title || 'Madrasa Program',
          participant_name: parsed.full_name || parsed.participant_name || 'Participant',
          father_name: parsed.father_name || '',
          contact: parsed.whatsapp_number || '',
          class_or_address: parsed.address_or_class || '',
          amount,
          date: dateOnly(parsed.created_at || doc.created_at),
          status: amount > 0 ? 'Paid' : 'Free',
        });
      }
    } catch {
      // skip non-JSON docs
    }
  }

  return {
    sessions: (sessionsRes.data || []) as SessionRow[],
    classes,
    subjects: subjectsRes.data || [],
    classSubjects: (classSubjectsRes.data || []).filter((cs: any) => allowClass(cs.class_id)),
    teachers,
    teacherAssignments: (teacherAssignmentsRes.data || []).filter((ta: any) => allowClass(ta.class_id)),
    teacherAttendance,
    students,
    admissions: (admissionsRes.data || []).filter((a: any) => !allowedSet || allowClass(a.admission_class_id)),
    promotions: (promotionsRes.data || []).filter((p: any) => !allowedSet || allowedStudentIds.has(p.student_id)),
    attendance: (attendanceRes.data || []).filter((a: any) => allowClass(a.class_id)),
    examinations,
    examSubjects: (examSubjectsRes.data || []).filter((es: any) => allowedExamIds.has(es.examination_id)),
    marks: (marksRes.data || []).filter((m: any) => allowedExamIds.has(m.examination_id) && (!allowedSet || allowedStudentIds.has(m.student_id))),
    results: (resultsRes.data || []).filter((r: any) => allowClass(r.class_id) && allowedExamIds.has(r.examination_id)),
    homework: (homeworkRes.data || []).filter((h: any) => allowClass(h.class_id)),
    homeworkSubmissions: (homeworkSubsRes.data || []).filter((hs: any) => !allowedSet || allowedStudentIds.has(hs.student_id)),
    notices: noticesRes.data || [],
    programs: programsRes.data || [],
    programPayments,
    feedPosts: feedRes.data || [],
    activityLogs: logsRes.data || [],
  };
}

function buildLookupMaps(snap: CoreDatabaseSnapshot) {
  const classMap = new Map<string, any>();
  for (const c of snap.classes) classMap.set(c.id, c);
  const subjectMap = new Map<string, any>();
  for (const s of snap.subjects) subjectMap.set(s.id, s);
  const teacherMap = new Map<string, any>();
  for (const t of snap.teachers) teacherMap.set(t.id, t);
  const studentMap = new Map<string, any>();
  for (const st of snap.students) studentMap.set(st.id, st);
  const examMap = new Map<string, any>();
  for (const e of snap.examinations) examMap.set(e.id, e);
  const sessionMap = new Map<string, SessionRow>();
  for (const s of snap.sessions) sessionMap.set(s.id, s);
  return { classMap, subjectMap, teacherMap, studentMap, examMap, sessionMap };
}

function filterByWindow(snap: CoreDatabaseSnapshot, win: PeriodWindow, strictHistorical = false) {
  const hasRange = Boolean(win.startDate || win.endDate);
  const matchSessionOrDate = (itemSessionId: string | null | undefined, itemDate: string | null | undefined) => {
    if (win.sessionId) {
      if (itemSessionId) return itemSessionId === win.sessionId;
      if (strictHistorical) return hasRange ? inDateRange(itemDate, win.startDate, win.endDate) : false;
      return hasRange ? inDateRange(itemDate, win.startDate, win.endDate) : true;
    }
    if (hasRange) return inDateRange(itemDate, win.startDate, win.endDate);
    return true;
  };

  const students = snap.students.filter((st) => {
    if (!win.sessionId && !hasRange) return true;
    if (strictHistorical) {
      if (win.sessionId && st.academic_session_id) return st.academic_session_id === win.sessionId;
      return inDateRange(st.admission_date || st.created_at, win.startDate, win.endDate);
    }
    // For active/current reporting, include students in that session OR admitted on/before endDate
    if (win.sessionId && st.academic_session_id) return st.academic_session_id === win.sessionId;
    if (win.endDate && dateOnly(st.admission_date || st.created_at) > win.endDate) return false;
    return true;
  });

  const admissions = snap.admissions.filter((a) =>
    !hasRange ? true : inDateRange(a.admission_date || a.created_at, win.startDate, win.endDate)
  );
  const attendance = snap.attendance.filter((a) => matchSessionOrDate(a.academic_session_id, a.attendance_date));
  const teacherAttendance = snap.teacherAttendance.filter((a) =>
    !hasRange ? true : inDateRange(a.attendance_date, win.startDate, win.endDate)
  );
  const examinations = snap.examinations.filter((e) => matchSessionOrDate(e.academic_session_id, e.start_date || e.created_at));
  const examIdSet = new Set(examinations.map((e) => e.id));
  const results = snap.results.filter((r) => examIdSet.has(r.examination_id));
  const marks = snap.marks.filter((m) => examIdSet.has(m.examination_id));
  const promotions = snap.promotions.filter((p) => {
    if (win.sessionId && (p.from_session_id === win.sessionId || p.to_session_id === win.sessionId)) return true;
    return !hasRange ? true : inDateRange(p.created_at, win.startDate, win.endDate);
  });
  const homework = snap.homework.filter((h) => !hasRange ? true : inDateRange(h.assigned_date || h.created_at, win.startDate, win.endDate));
  const notices = snap.notices.filter((n) => !hasRange ? true : inDateRange(n.publish_date || n.created_at, win.startDate, win.endDate));
  const programs = snap.programs.filter((p) => !hasRange ? true : inDateRange(p.program_date || p.created_at, win.startDate, win.endDate));
  const programPayments = snap.programPayments.filter((p) => !hasRange ? true : inDateRange(p.date, win.startDate, win.endDate));
  const activityLogs = snap.activityLogs.filter((l) => !hasRange ? true : inDateRange(l.created_at, win.startDate, win.endDate));

  return {
    students,
    admissions,
    attendance,
    teacherAttendance,
    examinations,
    results,
    marks,
    promotions,
    homework,
    notices,
    programs,
    programPayments,
    activityLogs,
  };
}

function getAdmissionCode(st: any): string {
  return st?.admission_number || st?.admission_no || st?.student_code || '';
}

function computeSummaryForSubset(sub: ReturnType<typeof filterByWindow>, teachers: any[], classes: any[]) {
  const totalStudents = sub.students.length;
  const activeStudents = sub.students.filter((s) => s.status === 'active').length;
  const inactiveStudents = totalStudents - activeStudents;
  const totalTeachers = teachers.length;
  const activeTeachers = teachers.filter((t) => t.employment_status === 'active').length;
  const totalClasses = classes.length;
  const totalAdmissions = sub.admissions.length;

  const presentRecords = sub.attendance.filter((a) => a.status === 'present').length;
  const lateRecords = sub.attendance.filter((a) => a.status === 'late').length;
  const absentRecords = sub.attendance.filter((a) => a.status === 'absent').length;
  const leaveRecords = sub.attendance.filter((a) => a.status === 'leave').length;
  const totalAttRecords = sub.attendance.length;
  const attendancePct = pct(presentRecords + lateRecords, totalAttRecords);

  const totalExaminations = sub.examinations.length;
  const totalResults = sub.results.length;
  const passedResults = sub.results.filter((r) => r.status === 'pass').length;
  const failedResults = sub.results.filter((r) => r.status === 'fail').length;
  const passPercentage = pct(passedResults, totalResults);
  const avgPercentage =
    totalResults > 0
      ? round1(sub.results.reduce((acc, r) => acc + Number(r.percentage || 0), 0) / totalResults)
      : 0;

  const programFeesCollected = sub.programPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return {
    totalStudents,
    activeStudents,
    inactiveStudents,
    totalTeachers,
    activeTeachers,
    totalClasses,
    totalAdmissions,
    presentRecords,
    lateRecords,
    absentRecords,
    leaveRecords,
    totalAttRecords,
    attendancePct,
    totalExaminations,
    totalResults,
    passedResults,
    failedResults,
    passPercentage,
    avgPercentage,
    programFeesCollected,
  };
}

// ============================================================================
// 1. META ENDPOINT (Filters, Dropdowns, Available Sessions & Permissions)
// ============================================================================
router.get('/reports-erp/meta', requireAuth, requireRole(...REPORT_ROLES), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const scope = await resolveScope(req);
    const snap = await fetchCoreSnapshot(admin, scope);

    const yearSet = new Set<string>();
    yearSet.add(String(new Date().getFullYear()));
    for (const s of snap.sessions) {
      if (s.start_date) yearSet.add(s.start_date.slice(0, 4));
      if (s.end_date) yearSet.add(s.end_date.slice(0, 4));
    }
    for (const a of snap.admissions) if (a.admission_date) yearSet.add(dateOnly(a.admission_date).slice(0, 4));
    for (const att of snap.attendance) if (att.attendance_date) yearSet.add(dateOnly(att.attendance_date).slice(0, 4));
    for (const ex of snap.examinations) if (ex.start_date) yearSet.add(dateOnly(ex.start_date).slice(0, 4));

    const calendarYears = Array.from(yearSet)
      .filter((y) => /^\d{4}$/.test(y))
      .sort((a, b) => b.localeCompare(a));

    const activeSession = snap.sessions.find((s) => s.is_active) || snap.sessions[0] || null;

    return res.json({
      sessions: snap.sessions,
      activeSessionId: activeSession?.id || 'all',
      calendarYears,
      classes: snap.classes.map((c) => ({ id: c.id, name: c.name, code: c.code, room_no: c.room_no })),
      subjects: snap.subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
      teachers: snap.teachers.map((t) => ({ id: t.id, teacher_code: t.teacher_code, full_name: t.full_name })),
      examinations: snap.examinations.map((e) => ({
        id: e.id,
        name: e.name,
        exam_type: e.exam_type,
        class_id: e.class_id,
        start_date: e.start_date,
        academic_session_id: e.academic_session_id,
      })),
      students: snap.students.map((st) => ({
        id: st.id,
        student_code: st.student_code,
        admission_no: getAdmissionCode(st),
        full_name: st.full_name,
        father_name: st.father_name,
        class_id: st.class_id,
        status: st.status,
      })),
      capabilities: {
        tuitionFeeModuleEnabled: false,
        programPaymentsCount: snap.programPayments.length,
        canViewAdminLogs: scope.canViewAdminLogs,
        canViewFinance: scope.canViewFinance,
        isTeacherScoped: scope.isTeacher,
      },
    });
  } catch (err: any) {
    console.error('[Reports ERP Meta]', err);
    return res.status(500).json({ error: err?.message || 'Failed to load reporting metadata' });
  }
});

// ============================================================================
// 2. MAIN REPORT DASHBOARD (Part 1 KPIs + Monthly / Quarterly / Yearly Charts)
// ============================================================================
router.get('/reports-erp/dashboard', requireAuth, requireRole(...REPORT_ROLES), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const scope = await resolveScope(req);
    const snap = await fetchCoreSnapshot(admin, scope);
    const q = req.query as Record<string, string | undefined>;
    const win = resolvePeriodWindow(snap.sessions, q);
    const sub = filterByWindow(snap, win);

    // Optional class filter on dashboard
    const classId = q.classId || '';
    const filteredSub = classId
      ? {
          ...sub,
          students: sub.students.filter((s) => s.class_id === classId),
          admissions: sub.admissions.filter((a) => a.admission_class_id === classId),
          attendance: sub.attendance.filter((a) => a.class_id === classId),
          examinations: sub.examinations.filter((e) => e.class_id === classId),
          results: sub.results.filter((r) => r.class_id === classId),
        }
      : sub;

    const filteredClasses = classId ? snap.classes.filter((c) => c.id === classId) : snap.classes;
    const kpis = computeSummaryForSubset(filteredSub, snap.teachers, filteredClasses);

    // Distinct students who have at least one present/absent record in period
    const presentStudentIds = new Set(
      filteredSub.attendance.filter((a) => a.status === 'present' || a.status === 'late').map((a) => a.student_id)
    );
    const absentStudentIds = new Set(
      filteredSub.attendance.filter((a) => a.status === 'absent').map((a) => a.student_id)
    );

    // 12-Month Series
    const examMap = new Map(filteredSub.examinations.map((e) => [e.id, e]));
    const monthlySeries = win.months.map(({ key, label }) => {
      const mAdm = filteredSub.admissions.filter((a) => monthKey(a.admission_date || a.created_at) === key).length;
      const mAtt = filteredSub.attendance.filter((a) => monthKey(a.attendance_date) === key);
      const mPres = mAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
      const mAbs = mAtt.filter((a) => a.status === 'absent').length;
      const mExams = filteredSub.examinations.filter((e) => monthKey(e.start_date || e.created_at) === key);
      const mResults = filteredSub.results.filter((r) => {
        const ex = examMap.get(r.examination_id);
        return monthKey(ex?.start_date || r.created_at) === key;
      });
      const mPass = mResults.filter((r) => r.status === 'pass').length;
      const mFees = filteredSub.programPayments
        .filter((p) => monthKey(p.date) === key)
        .reduce((acc, p) => acc + Number(p.amount || 0), 0);

      return {
        monthKey: key,
        label,
        admissions: mAdm,
        present: mPres,
        absent: mAbs,
        attendancePct: pct(mPres, mAtt.length),
        examinations: mExams.length,
        resultsCount: mResults.length,
        passed: mPass,
        passPct: pct(mPass, mResults.length),
        programFees: mFees,
      };
    });

    // Quarterly Series (group monthlySeries into up to 4 quarters)
    const quarterlySeries = [0, 1, 2, 3].map((qIdx) => {
      const slice = monthlySeries.slice(qIdx * 3, qIdx * 3 + 3);
      const qAdm = slice.reduce((a, m) => a + m.admissions, 0);
      const qPres = slice.reduce((a, m) => a + m.present, 0);
      const qAbs = slice.reduce((a, m) => a + m.absent, 0);
      const qRes = slice.reduce((a, m) => a + m.resultsCount, 0);
      const qPass = slice.reduce((a, m) => a + m.passed, 0);
      const qExams = slice.reduce((a, m) => a + m.examinations, 0);
      const qFees = slice.reduce((a, m) => a + m.programFees, 0);
      const rangeLabel = slice.length ? `${slice[0].label.split(' ')[0]}–${slice[slice.length - 1].label.split(' ')[0]}` : '';
      return {
        quarter: `Q${qIdx + 1}${rangeLabel ? ` (${rangeLabel})` : ''}`,
        admissions: qAdm,
        attendancePct: pct(qPres, qPres + qAbs),
        examinations: qExams,
        passPct: pct(qPass, qRes),
        programFees: qFees,
      };
    });

    // Yearly Series across all Academic Sessions in DB
    const yearlySeries = [...snap.sessions]
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
      .map((sess) => {
        const sWin: PeriodWindow = {
          startDate: sess.start_date,
          endDate: sess.end_date,
          sessionId: sess.id,
          sessionName: sess.name,
          label: sess.name,
          months: [],
        };
        const sSub = filterByWindow(snap, sWin, true);
        const sStats = computeSummaryForSubset(sSub, snap.teachers, snap.classes);
        return {
          year: sess.name,
          students: sStats.totalStudents,
          admissions: sStats.totalAdmissions,
          attendancePct: sStats.attendancePct,
          examinations: sStats.totalExaminations,
          passPct: sStats.passPercentage,
          programFees: sStats.programFeesCollected,
        };
      });

    // Class-wise Strength & Pass Rate for Dashboard Chart
    const classBreakdown = filteredClasses.map((cls) => {
      const cStudents = filteredSub.students.filter((s) => s.class_id === cls.id);
      const cAtt = filteredSub.attendance.filter((a) => a.class_id === cls.id);
      const cPres = cAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
      const cRes = filteredSub.results.filter((r) => r.class_id === cls.id);
      const cPass = cRes.filter((r) => r.status === 'pass').length;
      return {
        classId: cls.id,
        className: cls.name,
        students: cStudents.length,
        activeStudents: cStudents.filter((s) => s.status === 'active').length,
        attendancePct: pct(cPres, cAtt.length),
        passPct: pct(cPass, cRes.length),
      };
    });

    // Student Status Distribution
    const statusCounts: Record<string, number> = {};
    for (const st of filteredSub.students) {
      const key = String(st.status || 'active');
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
    const statusDistribution = Object.entries(statusCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));

    return res.json({
      period: {
        label: win.label,
        sessionName: win.sessionName,
        startDate: win.startDate,
        endDate: win.endDate,
      },
      kpis: {
        ...kpis,
        presentStudentsDistinct: presentStudentIds.size,
        absentStudentsDistinct: absentStudentIds.size,
        tuitionFeeModuleEnabled: false,
      },
      monthlySeries,
      quarterlySeries,
      yearlySeries,
      classBreakdown,
      statusDistribution,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Reports ERP Dashboard]', err);
    return res.status(500).json({ error: err?.message || 'Failed to compute dashboard analytics' });
  }
});

// ============================================================================
// 3. INDIVIDUAL STUDENT COMPLETE REPORT (Part 2 — Student Dossier)
// ============================================================================
router.get('/reports-erp/student-dossier', requireAuth, requireRole(...REPORT_ROLES), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const scope = await resolveScope(req);
    const snap = await fetchCoreSnapshot(admin, scope);
    const maps = buildLookupMaps(snap);

    const studentId = String(req.query.studentId || '').trim();
    const admissionNo = String(req.query.admissionNo || '').trim().toLowerCase();

    let student: any = null;
    if (studentId) {
      student = snap.students.find((s) => s.id === studentId) || null;
    } else if (admissionNo) {
      student =
        snap.students.find(
          (s) =>
            String(s.admission_number || '').toLowerCase() === admissionNo ||
            String(s.admission_no || '').toLowerCase() === admissionNo ||
            String(s.student_code || '').toLowerCase() === admissionNo ||
            String(s.full_name || '').toLowerCase().includes(admissionNo)
        ) || null;
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found with the provided Admission Number or selection.' });
    }

    const cls = maps.classMap.get(student.class_id);
    const sess = maps.sessionMap.get(student.academic_session_id);
    const photoUrl = student.photo_url ? await resolveStorageUrl(student.photo_url) : '';

    // Attendance history & monthly breakdown
    const stAtt = snap.attendance
      .filter((a) => a.student_id === student.id)
      .sort((a, b) => String(b.attendance_date).localeCompare(String(a.attendance_date)));

    const presentDays = stAtt.filter((a) => a.status === 'present').length;
    const lateDays = stAtt.filter((a) => a.status === 'late').length;
    const absentDays = stAtt.filter((a) => a.status === 'absent').length;
    const leaveDays = stAtt.filter((a) => a.status === 'leave').length;
    const totalDays = stAtt.length;
    const attendancePercentage = pct(presentDays + lateDays, totalDays);

    const monthlyAttMap = new Map<string, { month: string; present: number; absent: number; late: number; leave: number; total: number }>();
    for (const a of stAtt) {
      const mk = monthKey(a.attendance_date);
      if (!mk) continue;
      const cur = monthlyAttMap.get(mk) || { month: formatMonthLabel(mk), present: 0, absent: 0, late: 0, leave: 0, total: 0 };
      if (a.status === 'present') cur.present += 1;
      else if (a.status === 'absent') cur.absent += 1;
      else if (a.status === 'late') cur.late += 1;
      else if (a.status === 'leave') cur.leave += 1;
      cur.total += 1;
      monthlyAttMap.set(mk, cur);
    }
    const monthlyAttendance = Array.from(monthlyAttMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => ({
        ...v,
        percentage: pct(v.present + v.late, v.total),
      }));

    // Examination & Result history + Subject-wise marks
    const stResults = snap.results
      .filter((r) => r.student_id === student.id)
      .map((r) => {
        const ex = maps.examMap.get(r.examination_id);
        const rCls = maps.classMap.get(r.class_id);
        const rSess = ex?.academic_session_id ? maps.sessionMap.get(ex.academic_session_id) : null;
        const examMarks = snap.marks
          .filter((m) => m.examination_id === r.examination_id && m.student_id === student.id)
          .map((m) => {
            const subj = maps.subjectMap.get(m.subject_id);
            const total = Number(m.total_marks || subj?.total_marks || 100);
            const obtained = Number(m.obtained_marks || 0);
            const passMark = Number(subj?.passing_marks ?? 33);
            return {
              subjectName: subj?.name || 'Subject',
              subjectCode: subj?.code || '',
              obtainedMarks: m.is_absent ? 0 : obtained,
              totalMarks: total,
              percentage: pct(m.is_absent ? 0 : obtained, total),
              isAbsent: Boolean(m.is_absent),
              status: m.is_absent ? 'Absent' : obtained >= passMark ? 'Pass' : 'Fail',
              remarks: m.remarks || '',
            };
          });

        return {
          resultId: r.id,
          examinationId: r.examination_id,
          examinationName: ex?.name || 'Examination',
          examType: ex?.exam_type || '',
          examDate: ex?.start_date || dateOnly(r.created_at),
          academicYear: rSess?.name || '—',
          className: rCls?.name || cls?.name || '—',
          obtainedMarks: Number(r.obtained_marks || 0),
          totalMarks: Number(r.total_marks || 0),
          percentage: Number(r.percentage || 0),
          grade: r.grade || '—',
          status: String(r.status || 'fail').toUpperCase(),
          rank: Number(r.position || 0),
          isPublished: Boolean(r.is_published),
          teacherRemarks: r.teacher_remarks || '',
          subjectMarks: examMarks,
        };
      })
      .sort((a, b) => String(b.examDate).localeCompare(String(a.examDate)));

    // Subject-wise cumulative average across all exams
    const subjectAgg = new Map<string, { subject: string; exams: number; obtained: number; total: number }>();
    for (const r of stResults) {
      for (const sm of r.subjectMarks) {
        const cur = subjectAgg.get(sm.subjectName) || { subject: sm.subjectName, exams: 0, obtained: 0, total: 0 };
        cur.exams += 1;
        cur.obtained += sm.obtainedMarks;
        cur.total += sm.totalMarks;
        subjectAgg.set(sm.subjectName, cur);
      }
    }
    const subjectSummary = Array.from(subjectAgg.values()).map((s) => ({
      subject: s.subject,
      exams: s.exams,
      obtained: round1(s.obtained),
      total: round1(s.total),
      averagePct: pct(s.obtained, s.total),
    }));

    // Promotion history
    const promotions = snap.promotions
      .filter((p) => p.student_id === student.id)
      .map((p) => ({
        id: p.id,
        date: dateOnly(p.created_at),
        actionType: p.action_type,
        fromClass: maps.classMap.get(p.from_class_id)?.name || '—',
        toClass: maps.classMap.get(p.to_class_id)?.name || '—',
        fromSession: maps.sessionMap.get(p.from_session_id)?.name || '—',
        toSession: maps.sessionMap.get(p.to_session_id)?.name || '—',
        remarks: p.remarks || '',
      }));

    // Linked admission application record if available
    const admissionRecord =
      snap.admissions.find(
        (a) =>
          a.student_id === student.id ||
          (a.admission_no && (a.admission_no === student.admission_no || a.admission_no === student.admission_number))
      ) || null;

    const latestResult = stResults[0] || null;
    const passedExamsCount = stResults.filter((r) => r.status === 'PASS').length;

    return res.json({
      student: {
        id: student.id,
        fullName: student.full_name,
        studentCode: student.student_code,
        admissionNumber: getAdmissionCode(student),
        fatherName: student.father_name || '—',
        motherName: student.mother_name || '—',
        dob: student.dob || '—',
        gender: student.gender || '—',
        religion: student.religion || 'Islam',
        mobile: student.mobile || admissionRecord?.guardian_mobile || '—',
        village: student.village || '—',
        district: student.district || '—',
        state: student.state || '—',
        pinCode: student.pin_code || '—',
        address: student.address || '—',
        className: cls?.name || 'Unassigned',
        classCode: cls?.code || '',
        academicYear: sess?.name || '—',
        admissionDate: dateOnly(student.admission_date || student.created_at),
        status: student.status,
        approvalStatus: student.approval_status,
        previousSchool: student.previous_school || admissionRecord?.previous_school || '—',
        previousClass: student.previous_class || admissionRecord?.previous_class || '—',
        remarks: student.remarks || '',
        photoUrl,
      },
      attendanceSummary: {
        totalDays,
        presentDays,
        lateDays,
        absentDays,
        leaveDays,
        attendancePercentage,
      },
      monthlyAttendance,
      recentAttendance: stAtt.slice(0, 60).map((a) => ({
        date: a.attendance_date,
        className: maps.classMap.get(a.class_id)?.name || cls?.name || '—',
        status: a.status,
        remark: a.remark || '',
      })),
      academicSummary: {
        totalExamsTaken: stResults.length,
        passedExams: passedExamsCount,
        failedExams: stResults.length - passedExamsCount,
        averagePercentage:
          stResults.length > 0
            ? round1(stResults.reduce((acc, r) => acc + r.percentage, 0) / stResults.length)
            : 0,
        latestGrade: latestResult?.grade || '—',
        latestRank: latestResult?.rank || 0,
        latestStatus: latestResult?.status || '—',
      },
      examinationHistory: stResults,
      subjectSummary,
      promotions,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Reports ERP Student Dossier]', err);
    return res.status(500).json({ error: err?.message || 'Failed to load individual student report' });
  }
});

// ============================================================================
// 4. COMPLETE UNIFIED REPORT DATASET ENGINE (Parts 2, 3, 4, 5, 7, 8, 9, 10, 11)
// ============================================================================
router.get('/reports-erp/dataset', requireAuth, requireRole(...REPORT_ROLES), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const scope = await resolveScope(req);
    const snap = await fetchCoreSnapshot(admin, scope);
    const maps = buildLookupMaps(snap);

    const q = req.query as Record<string, string | undefined>;
    const reportId = String(q.reportId || 'complete_student_list');
    const isHistorical = reportId.startsWith('hist_');
    const win = resolvePeriodWindow(snap.sessions, q);
    const baseSub = filterByWindow(snap, win, isHistorical);

    // Extra granular filters (Part 13)
    const classId = q.classId || '';
    const studentId = q.studentId || '';
    const admissionNo = String(q.admissionNo || '').trim().toLowerCase();
    const examId = q.examId || '';
    const subjectId = q.subjectId || '';
    const teacherId = q.teacherId || '';
    const studentStatus = q.studentStatus || '';
    const resultStatus = q.resultStatus || '';
    const lowThreshold = Math.max(10, Math.min(99, Number(q.lowAttendanceThreshold || 75)));

    // Apply filters consistently across sub-collections
    let students = [...baseSub.students];
    if (classId) students = students.filter((s) => s.class_id === classId);
    if (studentId) students = students.filter((s) => s.id === studentId);
    if (admissionNo) {
      students = students.filter(
        (s) =>
          getAdmissionCode(s).toLowerCase().includes(admissionNo) ||
          String(s.student_code || '').toLowerCase().includes(admissionNo)
      );
    }
    if (studentStatus) students = students.filter((s) => s.status === studentStatus);

    const filteredStudentIds = new Set(students.map((s) => s.id));
    const hasStudentNarrow = Boolean(classId || studentId || admissionNo || studentStatus);

    let admissions = [...baseSub.admissions];
    if (classId) admissions = admissions.filter((a) => a.admission_class_id === classId);
    if (admissionNo) {
      admissions = admissions.filter(
        (a) =>
          String(a.admission_no || '').toLowerCase().includes(admissionNo) ||
          String(a.admission_number || '').toLowerCase().includes(admissionNo)
      );
    }

    let attendance = [...baseSub.attendance];
    if (classId) attendance = attendance.filter((a) => a.class_id === classId);
    if (hasStudentNarrow) attendance = attendance.filter((a) => filteredStudentIds.has(a.student_id));

    let examinations = [...baseSub.examinations];
    if (classId) examinations = examinations.filter((e) => e.class_id === classId);
    if (examId) examinations = examinations.filter((e) => e.id === examId);

    let results = [...baseSub.results];
    if (classId) results = results.filter((r) => r.class_id === classId);
    if (examId) results = results.filter((r) => r.examination_id === examId);
    if (hasStudentNarrow) results = results.filter((r) => filteredStudentIds.has(r.student_id));
    if (resultStatus) results = results.filter((r) => r.status === resultStatus);

    let marks = [...baseSub.marks];
    if (examId) marks = marks.filter((m) => m.examination_id === examId);
    if (subjectId) marks = marks.filter((m) => m.subject_id === subjectId);
    if (hasStudentNarrow) marks = marks.filter((m) => filteredStudentIds.has(m.student_id));

    let teachers = [...snap.teachers];
    if (teacherId) teachers = teachers.filter((t) => t.id === teacherId);

    let teacherAttendance = [...baseSub.teacherAttendance];
    if (teacherId) teacherAttendance = teacherAttendance.filter((ta) => ta.teacher_id === teacherId);

    let promotions = [...baseSub.promotions];
    if (hasStudentNarrow) promotions = promotions.filter((p) => filteredStudentIds.has(p.student_id));
    if (classId) promotions = promotions.filter((p) => p.from_class_id === classId || p.to_class_id === classId);

    const targetClasses = classId ? snap.classes.filter((c) => c.id === classId) : snap.classes;

    let title = 'Institutional Report';
    let subtitle = win.label;
    let notice = '';
    let summaryCards: { label: string; value: string | number; tone?: string }[] = [];
    let rows: Record<string, any>[] = [];
    let chartData: any[] = [];

    const mapStudentRow = (st: any) => ({
      'Admission No': getAdmissionCode(st),
      'Student ID': st.student_code,
      'Student Name': st.full_name,
      'Father Name': st.father_name || '—',
      Class: maps.classMap.get(st.class_id)?.name || 'Unassigned',
      'Admission Date': dateOnly(st.admission_date),
      Mobile: st.mobile || '—',
      Village: st.village || '—',
      Status: String(st.status || '').toUpperCase(),
    });

    const buildAttendanceByStudent = (stList: any[], attList: any[]) =>
      stList.map((st) => {
        const list = attList.filter((a) => a.student_id === st.id);
        const pres = list.filter((a) => a.status === 'present').length;
        const late = list.filter((a) => a.status === 'late').length;
        const abs = list.filter((a) => a.status === 'absent').length;
        const lv = list.filter((a) => a.status === 'leave').length;
        const total = list.length;
        return {
          'Admission No': getAdmissionCode(st),
          'Student Name': st.full_name,
          Class: maps.classMap.get(st.class_id)?.name || 'Unassigned',
          'Working Days': total,
          Present: pres,
          Late: late,
          Absent: abs,
          Leave: lv,
          'Attendance %': total > 0 ? `${pct(pres + late, total)}%` : 'N/A',
          _pctNum: total > 0 ? pct(pres + late, total) : -1,
        };
      });

    const buildClassSummaryRows = (clsList: any[]) =>
      clsList.map((cls) => {
        const cSt = students.filter((s) => s.class_id === cls.id);
        const cAct = cSt.filter((s) => s.status === 'active').length;
        const cAtt = attendance.filter((a) => a.class_id === cls.id);
        const cPres = cAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
        const cExams = examinations.filter((e) => e.class_id === cls.id).length;
        const cRes = results.filter((r) => r.class_id === cls.id);
        const cPass = cRes.filter((r) => r.status === 'pass').length;
        const cFail = cRes.filter((r) => r.status === 'fail').length;
        const avgPct = cRes.length > 0 ? round1(cRes.reduce((s, r) => s + Number(r.percentage || 0), 0) / cRes.length) : 0;
        const teacher = maps.teacherMap.get(cls.class_teacher_id);
        return {
          Class: cls.name,
          Code: cls.code,
          'Class Teacher': teacher?.full_name || 'Unassigned',
          'Total Students': cSt.length,
          Active: cAct,
          Inactive: cSt.length - cAct,
          'Attendance %': cAtt.length > 0 ? `${pct(cPres, cAtt.length)}%` : 'N/A',
          Examinations: cExams,
          Passed: cPass,
          Failed: cFail,
          'Pass %': cRes.length > 0 ? `${pct(cPass, cRes.length)}%` : 'N/A',
          'Avg Score %': cRes.length > 0 ? `${avgPct}%` : 'N/A',
        };
      });

    switch (reportId) {
      // ==================== PART 2: STUDENT REPORTS ====================
      case 'complete_student_list':
      case 'class_wise_students':
      case 'admission_wise_students':
      case 'hist_students':
      case 'annual_students':
      case 'monthly_students': {
        title =
          reportId === 'class_wise_students'
            ? 'Class-wise Student Report'
            : reportId === 'admission_wise_students'
            ? 'Admission-wise Student Register'
            : reportId === 'hist_students'
            ? 'Historical Student Records'
            : reportId === 'annual_students'
            ? 'Annual Student Report'
            : reportId === 'monthly_students'
            ? 'Monthly Student Report'
            : 'Complete Student List';
        const sorted = [...students].sort((a, b) => {
          if (reportId === 'admission_wise_students') return dateOnly(b.admission_date).localeCompare(dateOnly(a.admission_date));
          if (reportId === 'class_wise_students') {
            const ca = maps.classMap.get(a.class_id)?.name || 'ZZZ';
            const cb = maps.classMap.get(b.class_id)?.name || 'ZZZ';
            return ca.localeCompare(cb) || a.full_name.localeCompare(b.full_name);
          }
          return a.full_name.localeCompare(b.full_name);
        });
        rows = sorted.map(mapStudentRow);
        const activeCount = sorted.filter((s) => s.status === 'active').length;
        summaryCards = [
          { label: 'Total Students', value: sorted.length },
          { label: 'Active', value: activeCount, tone: 'emerald' },
          { label: 'Inactive / Other', value: sorted.length - activeCount, tone: 'amber' },
          { label: 'Classes Covered', value: new Set(sorted.map((s) => s.class_id).filter(Boolean)).size },
        ];
        break;
      }

      case 'active_students': {
        title = 'Active Students Report';
        const list = students.filter((s) => s.status === 'active');
        rows = list.map(mapStudentRow);
        summaryCards = [
          { label: 'Active Students', value: list.length, tone: 'emerald' },
          { label: 'Classes Represented', value: new Set(list.map((s) => s.class_id).filter(Boolean)).size },
        ];
        break;
      }

      case 'inactive_students':
      case 'student_leaving': {
        title = reportId === 'student_leaving' ? 'Student Leaving / Transfer / Graduated Report' : 'Inactive Students Report';
        const list = students.filter((s) =>
          reportId === 'student_leaving'
            ? ['transferred', 'graduated', 'inactive', 'disabled'].includes(s.status)
            : s.status !== 'active'
        );
        rows = list.map((st) => ({
          ...mapStudentRow(st),
          Remarks: st.remarks || '—',
        }));
        summaryCards = [
          { label: 'Total Records', value: list.length, tone: 'amber' },
          { label: 'Transferred', value: list.filter((s) => s.status === 'transferred').length },
          { label: 'Graduated', value: list.filter((s) => s.status === 'graduated').length },
          { label: 'Inactive / Disabled', value: list.filter((s) => s.status === 'inactive' || s.status === 'disabled').length },
        ];
        break;
      }

      case 'new_admissions':
      case 'daily_admissions':
      case 'weekly_admissions':
      case 'monthly_admissions':
      case 'yearly_admissions':
      case 'annual_admissions':
      case 'hist_admissions': {
        title =
          reportId === 'daily_admissions'
            ? 'Daily Student Admissions Report'
            : reportId === 'weekly_admissions'
            ? 'Weekly Admissions Report'
            : reportId === 'monthly_admissions'
            ? 'Monthly Admissions Report'
            : reportId === 'yearly_admissions' || reportId === 'annual_admissions'
            ? 'Annual Admission Report'
            : reportId === 'hist_admissions'
            ? 'Historical Admissions Report'
            : 'New Admissions Report';

        if (reportId === 'monthly_admissions' && !q.month) {
          // Group by month across selected window
          const mMap = new Map<string, { total: number; approved: number; pending: number; rejected: number }>();
          for (const a of admissions) {
            const mk = monthKey(a.admission_date || a.created_at);
            if (!mk) continue;
            const cur = mMap.get(mk) || { total: 0, approved: 0, pending: 0, rejected: 0 };
            cur.total += 1;
            if (a.status === 'approved') cur.approved += 1;
            else if (a.status === 'rejected') cur.rejected += 1;
            else cur.pending += 1;
            mMap.set(mk, cur);
          }
          rows = Array.from(mMap.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([mk, v]) => ({
              Month: formatMonthLabel(mk),
              'Total Applications': v.total,
              Approved: v.approved,
              Pending: v.pending,
              Rejected: v.rejected,
              'Approval %': `${pct(v.approved, v.total)}%`,
            }));
          chartData = Array.from(mMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([mk, v]) => ({ label: formatMonthLabel(mk), total: v.total, approved: v.approved }));
        } else {
          rows = admissions.map((a) => ({
            'Admission No': a.admission_number || a.admission_no,
            'Student Name': a.student_name,
            'Father Name': a.father_name,
            Class: maps.classMap.get(a.admission_class_id)?.name || 'Unassigned',
            'Guardian Mobile': a.guardian_mobile || '—',
            Village: a.village || '—',
            'Admission Date': dateOnly(a.admission_date),
            Status: String(a.status || 'pending').toUpperCase(),
          }));
        }
        summaryCards = [
          { label: 'Total Admissions', value: admissions.length },
          { label: 'Approved', value: admissions.filter((a) => a.status === 'approved').length, tone: 'emerald' },
          { label: 'Pending', value: admissions.filter((a) => a.status === 'pending').length, tone: 'amber' },
          { label: 'Rejected', value: admissions.filter((a) => a.status === 'rejected').length, tone: 'red' },
        ];
        break;
      }

      case 'student_attendance':
      case 'student_attendance_percentage':
      case 'att_student_wise':
      case 'att_percentage':
      case 'att_low_attendance': {
        title =
          reportId === 'att_low_attendance'
            ? `Low Attendance Students (< ${lowThreshold}%)`
            : 'Student-wise Attendance & Percentage Report';
        const computed = buildAttendanceByStudent(students, attendance);
        const filtered =
          reportId === 'att_low_attendance'
            ? computed.filter((r) => r._pctNum >= 0 && r._pctNum < lowThreshold).sort((a, b) => a._pctNum - b._pctNum)
            : computed;
        rows = filtered.map(({ _pctNum, ...rest }) => rest);
        const withRecords = computed.filter((r) => r._pctNum >= 0);
        const avgAtt =
          withRecords.length > 0
            ? round1(withRecords.reduce((s, r) => s + r._pctNum, 0) / withRecords.length)
            : 0;
        summaryCards = [
          { label: 'Students Listed', value: rows.length },
          { label: 'Average Attendance', value: withRecords.length > 0 ? `${avgAtt}%` : 'N/A', tone: 'emerald' },
          {
            label: `Below ${lowThreshold}%`,
            value: withRecords.filter((r) => r._pctNum < lowThreshold).length,
            tone: 'red',
          },
          { label: 'Records Evaluated', value: attendance.length },
        ];
        break;
      }

      case 'student_performance':
      case 'student_exam_history':
      case 'student_result_history':
      case 'student_pass_fail':
      case 'student_rank_merit':
      case 'exam_student_marks':
      case 'exam_pass_students':
      case 'exam_fail_students':
      case 'exam_toppers':
      case 'exam_merit_list':
      case 'class_topper':
      case 'class_merit_list':
      case 'class_results':
      case 'class_pass_fail':
      case 'annual_results':
      case 'annual_pass_fail':
      case 'annual_merit_list':
      case 'annual_toppers':
      case 'monthly_results':
      case 'monthly_pass_fail':
      case 'hist_results': {
        const titleMap: Record<string, string> = {
          student_performance: 'Student Academic Performance Report',
          student_exam_history: 'Student Examination History Report',
          student_result_history: 'Student Result History Report',
          student_pass_fail: 'Student Pass / Fail Report',
          student_rank_merit: 'Student Rank & Merit List',
          exam_student_marks: 'Student-wise Marks Report',
          exam_pass_students: 'Passed Students Report',
          exam_fail_students: 'Failed Students Report',
          exam_toppers: 'Examination Topper List',
          exam_merit_list: 'Examination Merit List',
          class_topper: 'Class Topper Report',
          class_merit_list: 'Class Merit List',
          class_results: 'Class Result Report',
          class_pass_fail: 'Class Pass / Fail Report',
          annual_results: 'Annual Result Report',
          annual_pass_fail: 'Annual Pass / Fail Report',
          annual_merit_list: 'Annual Merit List',
          annual_toppers: 'Annual Topper Report',
          monthly_results: 'Monthly Result Report',
          monthly_pass_fail: 'Monthly Pass / Fail Report',
          hist_results: 'Historical Examination Results',
        };
        title = titleMap[reportId] || 'Result Report';

        let list = [...results];
        if (reportId === 'exam_pass_students') list = list.filter((r) => r.status === 'pass');
        if (reportId === 'exam_fail_students') list = list.filter((r) => r.status === 'fail');

        if (
          ['student_rank_merit', 'exam_merit_list', 'class_merit_list', 'annual_merit_list'].includes(reportId)
        ) {
          list = list
            .filter((r) => r.status === 'pass')
            .sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0));
        } else if (['exam_toppers', 'class_topper', 'annual_toppers'].includes(reportId)) {
          // Top 3 per class/exam sorted by highest percentage
          const topByGroup = new Map<string, any[]>();
          for (const r of list.filter((x) => x.status === 'pass')) {
            const gKey = `${r.class_id}_${r.examination_id}`;
            const arr = topByGroup.get(gKey) || [];
            arr.push(r);
            topByGroup.set(gKey, arr);
          }
          const toppers: any[] = [];
          for (const arr of topByGroup.values()) {
            arr.sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0));
            toppers.push(...arr.slice(0, 3));
          }
          list = toppers.sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0));
        } else {
          list.sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0));
        }

        rows = list.map((r, idx) => {
          const st = maps.studentMap.get(r.student_id);
          const ex = maps.examMap.get(r.examination_id);
          const cls = maps.classMap.get(r.class_id);
          return {
            'Merit #': idx + 1,
            'Admission No': getAdmissionCode(st),
            'Student Name': st?.full_name || 'Student',
            Class: cls?.name || '—',
            Examination: ex?.name || '—',
            'Exam Date': ex?.start_date || dateOnly(r.created_at),
            Obtained: Number(r.obtained_marks || 0),
            Total: Number(r.total_marks || 0),
            'Percentage %': `${Number(r.percentage || 0)}%`,
            Grade: r.grade || '—',
            Result: String(r.status || 'fail').toUpperCase(),
            'Class Rank': r.position || '—',
          };
        });

        const passCnt = list.filter((r) => r.status === 'pass').length;
        const failCnt = list.filter((r) => r.status === 'fail').length;
        const high = list.length ? Math.max(...list.map((r) => Number(r.percentage || 0))) : 0;
        summaryCards = [
          { label: 'Total Results', value: list.length },
          { label: 'Passed', value: passCnt, tone: 'emerald' },
          { label: 'Failed', value: failCnt, tone: 'red' },
          { label: 'Pass Percentage', value: list.length ? `${pct(passCnt, list.length)}%` : 'N/A', tone: 'emerald' },
          { label: 'Highest %', value: list.length ? `${high}%` : 'N/A' },
        ];
        break;
      }

      case 'student_promotion':
      case 'class_promotion':
      case 'annual_promotions': {
        title =
          reportId === 'class_promotion'
            ? 'Class Promotion Report'
            : reportId === 'annual_promotions'
            ? 'Annual Promotion Report'
            : 'Student Promotion & Transfer Report';
        rows = promotions.map((p) => {
          const st = maps.studentMap.get(p.student_id);
          return {
            Date: dateOnly(p.created_at),
            'Admission No': getAdmissionCode(st),
            'Student Name': st?.full_name || 'Student',
            Action: String(p.action_type || 'promote').toUpperCase(),
            'From Class': maps.classMap.get(p.from_class_id)?.name || '—',
            'To Class': maps.classMap.get(p.to_class_id)?.name || '—',
            'From Session': maps.sessionMap.get(p.from_session_id)?.name || '—',
            'To Session': maps.sessionMap.get(p.to_session_id)?.name || '—',
            Remarks: p.remarks || '—',
          };
        });
        summaryCards = [
          { label: 'Total Records', value: promotions.length },
          { label: 'Promoted', value: promotions.filter((p) => p.action_type === 'promote').length, tone: 'emerald' },
          { label: 'Transferred', value: promotions.filter((p) => p.action_type === 'transfer').length, tone: 'amber' },
          { label: 'Demoted', value: promotions.filter((p) => p.action_type === 'demote').length },
        ];
        break;
      }

      case 'student_academic_history':
      case 'hist_student_academic_history': {
        title = 'Student Academic History Overview';
        rows = students.map((st) => {
          const stRes = results.filter((r) => r.student_id === st.id);
          const stProm = promotions.filter((p) => p.student_id === st.id);
          const stAtt = attendance.filter((a) => a.student_id === st.id);
          const pres = stAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
          const avg = stRes.length ? round1(stRes.reduce((s, r) => s + Number(r.percentage || 0), 0) / stRes.length) : 0;
          return {
            'Admission No': getAdmissionCode(st),
            'Student Name': st.full_name,
            'Current Class': maps.classMap.get(st.class_id)?.name || 'Unassigned',
            'Admission Date': dateOnly(st.admission_date),
            'Exams Taken': stRes.length,
            'Passed Exams': stRes.filter((r) => r.status === 'pass').length,
            'Avg Marks %': stRes.length ? `${avg}%` : 'N/A',
            'Attendance %': stAtt.length ? `${pct(pres, stAtt.length)}%` : 'N/A',
            Promotions: stProm.length,
            Status: String(st.status || '').toUpperCase(),
          };
        });
        summaryCards = [
          { label: 'Students Tracked', value: rows.length },
          { label: 'With Exam History', value: students.filter((s) => results.some((r) => r.student_id === s.id)).length },
          { label: 'Total Promotions', value: promotions.length },
        ];
        break;
      }

      case 'student_subject_performance':
      case 'class_subject_wise':
      case 'exam_subject_wise':
      case 'exam_subject_pass_pct':
      case 'annual_subject_performance': {
        title =
          reportId === 'student_subject_performance'
            ? 'Student-wise Subject Performance'
            : reportId === 'exam_subject_pass_pct'
            ? 'Subject-wise Pass Percentage Report'
            : reportId === 'annual_subject_performance'
            ? 'Annual Subject Performance Report'
            : 'Subject-wise Academic Performance Report';

        if (reportId === 'student_subject_performance') {
          rows = marks.map((m) => {
            const st = maps.studentMap.get(m.student_id);
            const subj = maps.subjectMap.get(m.subject_id);
            const ex = maps.examMap.get(m.examination_id);
            const tot = Number(m.total_marks || subj?.total_marks || 100);
            const obt = m.is_absent ? 0 : Number(m.obtained_marks || 0);
            const passMark = Number(subj?.passing_marks ?? 33);
            return {
              'Admission No': getAdmissionCode(st),
              'Student Name': st?.full_name || 'Student',
              Class: maps.classMap.get(st?.class_id)?.name || '—',
              Examination: ex?.name || '—',
              Subject: subj?.name || 'Subject',
              Obtained: m.is_absent ? 'AB' : obt,
              Total: tot,
              'Percentage %': `${pct(obt, tot)}%`,
              Status: m.is_absent ? 'ABSENT' : obt >= passMark ? 'PASS' : 'FAIL',
            };
          });
        } else {
          const sMap = new Map<string, { name: string; code: string; entries: number; passed: number; failed: number; absent: number; obt: number; tot: number; highest: number; lowest: number }>();
          for (const m of marks) {
            const subj = maps.subjectMap.get(m.subject_id);
            if (!subj) continue;
            const tot = Number(m.total_marks || subj.total_marks || 100);
            const obt = m.is_absent ? 0 : Number(m.obtained_marks || 0);
            const passMark = Number(subj.passing_marks ?? 33);
            const cur = sMap.get(subj.id) || {
              name: subj.name,
              code: subj.code,
              entries: 0,
              passed: 0,
              failed: 0,
              absent: 0,
              obt: 0,
              tot: 0,
              highest: -1,
              lowest: Infinity,
            };
            cur.entries += 1;
            if (m.is_absent) cur.absent += 1;
            else if (obt >= passMark) cur.passed += 1;
            else cur.failed += 1;
            cur.obt += obt;
            cur.tot += tot;
            if (!m.is_absent) {
              cur.highest = Math.max(cur.highest, obt);
              cur.lowest = Math.min(cur.lowest, obt);
            }
            sMap.set(subj.id, cur);
          }
          rows = Array.from(sMap.values()).map((v) => ({
            Subject: v.name,
            Code: v.code,
            'Total Entries': v.entries,
            Passed: v.passed,
            Failed: v.failed,
            Absent: v.absent,
            'Pass %': `${pct(v.passed, v.entries)}%`,
            'Avg Score %': `${pct(v.obt, v.tot)}%`,
            Highest: v.highest >= 0 ? v.highest : '—',
            Lowest: Number.isFinite(v.lowest) ? v.lowest : '—',
          }));
          chartData = Array.from(sMap.values()).map((v) => ({
            label: v.name,
            passPct: pct(v.passed, v.entries),
            avgPct: pct(v.obt, v.tot),
          }));
        }
        summaryCards = [
          { label: 'Subjects Evaluated', value: new Set(marks.map((m) => m.subject_id)).size },
          { label: 'Marks Entries', value: marks.length },
        ];
        break;
      }

      // ==================== PART 3: CLASS REPORTS ====================
      case 'class_complete':
      case 'class_strength':
      case 'class_daily':
      case 'class_weekly':
      case 'class_monthly':
      case 'class_yearly':
      case 'class_comparison':
      case 'daily_class':
      case 'weekly_class_performance':
      case 'monthly_class':
      case 'annual_classes':
      case 'exam_class_pass_pct':
      case 'hist_classes':
      case 'hist_class_history': {
        title =
          reportId === 'class_strength'
            ? 'Class Strength Report'
            : reportId === 'class_comparison'
            ? 'Class Performance Comparison'
            : reportId === 'exam_class_pass_pct'
            ? 'Class-wise Pass Percentage Report'
            : reportId === 'hist_classes' || reportId === 'hist_class_history'
            ? 'Historical Class Performance Report'
            : reportId === 'annual_classes'
            ? 'Annual Class Report'
            : 'Complete Class Report';
        rows = buildClassSummaryRows(targetClasses);
        chartData = targetClasses.map((cls) => {
          const cRes = results.filter((r) => r.class_id === cls.id);
          const cAtt = attendance.filter((a) => a.class_id === cls.id);
          return {
            label: cls.name,
            students: students.filter((s) => s.class_id === cls.id).length,
            attendancePct: pct(cAtt.filter((a) => a.status === 'present' || a.status === 'late').length, cAtt.length),
            passPct: pct(cRes.filter((r) => r.status === 'pass').length, cRes.length),
          };
        });
        summaryCards = [
          { label: 'Total Classes', value: targetClasses.length },
          { label: 'Total Students', value: students.length },
          { label: 'Overall Pass %', value: results.length ? `${pct(results.filter((r) => r.status === 'pass').length, results.length)}%` : 'N/A', tone: 'emerald' },
        ];
        break;
      }

      case 'class_student_list': {
        title = classId ? `Student List — ${maps.classMap.get(classId)?.name || 'Selected Class'}` : 'Class-wise Student List';
        rows = students.map(mapStudentRow);
        summaryCards = [
          { label: 'Total Students', value: rows.length },
          { label: 'Active', value: students.filter((s) => s.status === 'active').length, tone: 'emerald' },
        ];
        break;
      }

      // ==================== PART 4 & 8: ATTENDANCE & PERIODIC REPORTS ====================
      case 'daily_attendance':
      case 'weekly_attendance':
      case 'monthly_attendance':
      case 'annual_attendance':
      case 'class_attendance':
      case 'att_daily':
      case 'att_weekly':
      case 'att_monthly':
      case 'att_annual':
      case 'att_class_wise':
      case 'hist_attendance':
      case 'weekly_attendance_comparison':
      case 'att_monthly_comparison':
      case 'att_annual_comparison': {
        const isMonthlyGroup = ['monthly_attendance', 'att_monthly', 'att_monthly_comparison', 'annual_attendance', 'att_annual'].includes(reportId);
        const isAnnualGroup = reportId === 'att_annual_comparison';
        title =
          reportId === 'daily_attendance' || reportId === 'att_daily'
            ? 'Daily Attendance Report'
            : reportId === 'weekly_attendance' || reportId === 'att_weekly' || reportId === 'weekly_attendance_comparison'
            ? 'Weekly Attendance Report'
            : reportId === 'monthly_attendance' || reportId === 'att_monthly' || reportId === 'att_monthly_comparison'
            ? 'Monthly Attendance Report'
            : reportId === 'att_annual_comparison'
            ? 'Annual Attendance Comparison'
            : reportId === 'hist_attendance'
            ? 'Historical Attendance Report'
            : 'Class-wise Attendance Report';

        if (isAnnualGroup) {
          rows = snap.sessions.map((sess) => {
            const sAtt = snap.attendance.filter((a) =>
              a.academic_session_id ? a.academic_session_id === sess.id : inDateRange(a.attendance_date, sess.start_date, sess.end_date)
            );
            const pres = sAtt.filter((a) => a.status === 'present').length;
            const late = sAtt.filter((a) => a.status === 'late').length;
            const abs = sAtt.filter((a) => a.status === 'absent').length;
            const lv = sAtt.filter((a) => a.status === 'leave').length;
            return {
              'Academic Year': sess.name,
              'Total Entries': sAtt.length,
              Present: pres,
              Late: late,
              Absent: abs,
              Leave: lv,
              'Attendance %': sAtt.length ? `${pct(pres + late, sAtt.length)}%` : 'N/A',
            };
          });
          chartData = rows.map((r) => ({
            label: r['Academic Year'],
            attendancePct: parseFloat(String(r['Attendance %'])) || 0,
          }));
        } else {
          const gMap = new Map<string, { period: string; className: string; present: number; absent: number; late: number; leave: number; total: number }>();
          for (const a of attendance) {
            const pKey = isMonthlyGroup ? monthKey(a.attendance_date) : a.attendance_date;
            const key = reportId === 'att_monthly_comparison' ? pKey : `${pKey}_${a.class_id}`;
            const cur = gMap.get(key) || {
              period: isMonthlyGroup ? formatMonthLabel(pKey) : pKey,
              className: reportId === 'att_monthly_comparison' ? 'All Classes' : maps.classMap.get(a.class_id)?.name || 'Unassigned',
              present: 0,
              absent: 0,
              late: 0,
              leave: 0,
              total: 0,
            };
            if (a.status === 'present') cur.present += 1;
            else if (a.status === 'absent') cur.absent += 1;
            else if (a.status === 'late') cur.late += 1;
            else if (a.status === 'leave') cur.leave += 1;
            cur.total += 1;
            gMap.set(key, cur);
          }
          rows = Array.from(gMap.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([, v]) => ({
              Period: v.period,
              Class: v.className,
              Present: v.present,
              Late: v.late,
              Absent: v.absent,
              Leave: v.leave,
              'Total Marked': v.total,
              'Attendance %': `${pct(v.present + v.late, v.total)}%`,
            }));
          chartData = Array.from(gMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-14)
            .map(([, v]) => ({
              label: v.period,
              present: v.present + v.late,
              absent: v.absent,
              attendancePct: pct(v.present + v.late, v.total),
            }));
        }

        const totalP = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
        const totalA = attendance.filter((a) => a.status === 'absent').length;
        summaryCards = [
          { label: 'Total Marked', value: attendance.length },
          { label: 'Present / Late', value: totalP, tone: 'emerald' },
          { label: 'Absent', value: totalA, tone: 'red' },
          { label: 'Attendance %', value: attendance.length ? `${pct(totalP, attendance.length)}%` : 'N/A', tone: 'emerald' },
        ];
        break;
      }

      case 'att_present':
      case 'att_absent': {
        const targetStatus = reportId === 'att_present' ? 'present' : 'absent';
        title = targetStatus === 'present' ? 'Present Students Attendance Register' : 'Absent Students Attendance Register';
        const list = attendance
          .filter((a) => (targetStatus === 'present' ? a.status === 'present' || a.status === 'late' : a.status === 'absent'))
          .sort((a, b) => String(b.attendance_date).localeCompare(String(a.attendance_date)));
        rows = list.map((a) => {
          const st = maps.studentMap.get(a.student_id);
          return {
            Date: a.attendance_date,
            'Admission No': getAdmissionCode(st),
            'Student Name': st?.full_name || 'Student',
            Class: maps.classMap.get(a.class_id)?.name || '—',
            Status: String(a.status).toUpperCase(),
            Remark: a.remark || '—',
          };
        });
        summaryCards = [
          { label: `${targetStatus === 'present' ? 'Present' : 'Absent'} Records`, value: rows.length, tone: targetStatus === 'present' ? 'emerald' : 'red' },
          { label: 'Unique Students', value: new Set(list.map((a) => a.student_id)).size },
        ];
        break;
      }

      // ==================== PART 7: EXAMINATIONS & RESULTS ====================
      case 'exam_complete_list':
      case 'exam_wise':
      case 'class_examinations':
      case 'exam_class_wise':
      case 'monthly_examinations':
      case 'annual_examinations': {
        title =
          reportId === 'annual_examinations'
            ? 'Annual Examination Report'
            : reportId === 'monthly_examinations'
            ? 'Monthly Examination Report'
            : 'Complete Examination Report';
        rows = examinations.map((e) => {
          const eRes = results.filter((r) => r.examination_id === e.id);
          const ePass = eRes.filter((r) => r.status === 'pass').length;
          const eFail = eRes.filter((r) => r.status === 'fail').length;
          const avg = eRes.length ? round1(eRes.reduce((s, r) => s + Number(r.percentage || 0), 0) / eRes.length) : 0;
          return {
            Examination: e.name,
            Type: e.exam_type,
            Class: maps.classMap.get(e.class_id)?.name || '—',
            'Start Date': e.start_date,
            'End Date': e.end_date || '—',
            Status: String(e.status || '').toUpperCase(),
            Published: e.results_published ? 'Published' : 'Unpublished',
            Appeared: eRes.length,
            Passed: ePass,
            Failed: eFail,
            'Pass %': eRes.length ? `${pct(ePass, eRes.length)}%` : 'N/A',
            'Avg %': eRes.length ? `${avg}%` : 'N/A',
          };
        });
        summaryCards = [
          { label: 'Total Examinations', value: examinations.length },
          { label: 'Published', value: examinations.filter((e) => e.results_published).length, tone: 'emerald' },
          { label: 'Total Results', value: results.length },
        ];
        break;
      }

      case 'exam_highest_marks':
      case 'exam_lowest_marks': {
        const isHigh = reportId === 'exam_highest_marks';
        title = isHigh ? 'Highest Marks by Examination & Class' : 'Lowest Marks by Examination & Class';
        const groups = new Map<string, any[]>();
        for (const r of results) {
          const key = `${r.examination_id}_${r.class_id}`;
          const arr = groups.get(key) || [];
          arr.push(r);
          groups.set(key, arr);
        }
        rows = Array.from(groups.values()).map((arr) => {
          arr.sort((a, b) =>
            isHigh
              ? Number(b.percentage || 0) - Number(a.percentage || 0)
              : Number(a.percentage || 0) - Number(b.percentage || 0)
          );
          const pick = arr[0];
          const st = maps.studentMap.get(pick.student_id);
          const ex = maps.examMap.get(pick.examination_id);
          return {
            Examination: ex?.name || '—',
            Class: maps.classMap.get(pick.class_id)?.name || '—',
            'Admission No': getAdmissionCode(st),
            'Student Name': st?.full_name || '—',
            Obtained: Number(pick.obtained_marks || 0),
            Total: Number(pick.total_marks || 0),
            'Percentage %': `${Number(pick.percentage || 0)}%`,
            Grade: pick.grade || '—',
            Result: String(pick.status || '').toUpperCase(),
          };
        });
        summaryCards = [{ label: 'Exam Groups Analyzed', value: rows.length }];
        break;
      }

      case 'exam_grade_wise': {
        title = 'Grade-wise Student Distribution Report';
        const gMap = new Map<string, { count: number; passed: number; failed: number; totalPct: number }>();
        for (const r of results) {
          const g = r.grade || 'N/A';
          const cur = gMap.get(g) || { count: 0, passed: 0, failed: 0, totalPct: 0 };
          cur.count += 1;
          if (r.status === 'pass') cur.passed += 1;
          else cur.failed += 1;
          cur.totalPct += Number(r.percentage || 0);
          gMap.set(g, cur);
        }
        rows = Array.from(gMap.entries())
          .sort((a, b) => b[1].totalPct / Math.max(1, b[1].count) - a[1].totalPct / Math.max(1, a[1].count))
          .map(([grade, v]) => ({
            Grade: grade,
            'Student Count': v.count,
            'Share %': `${pct(v.count, results.length)}%`,
            Passed: v.passed,
            Failed: v.failed,
            'Avg Score %': `${round1(v.totalPct / Math.max(1, v.count))}%`,
          }));
        chartData = rows.map((r) => ({ label: r.Grade, count: r['Student Count'] }));
        summaryCards = [
          { label: 'Total Results', value: results.length },
          { label: 'Distinct Grades', value: rows.length },
        ];
        break;
      }

      case 'exam_overall_result':
      case 'exam_comparison':
      case 'exam_year_comparison':
      case 'annual_academic_performance': {
        title =
          reportId === 'exam_year_comparison'
            ? 'Year-wise Examination Result Comparison'
            : reportId === 'exam_comparison'
            ? 'Examination-to-Examination Comparison'
            : 'Overall Examination Result Analysis';
        if (reportId === 'exam_year_comparison') {
          rows = snap.sessions.map((sess) => {
            const sExams = snap.examinations.filter((e) =>
              e.academic_session_id ? e.academic_session_id === sess.id : inDateRange(e.start_date, sess.start_date, sess.end_date)
            );
            const idSet = new Set(sExams.map((e) => e.id));
            const sRes = snap.results.filter((r) => idSet.has(r.examination_id));
            const pass = sRes.filter((r) => r.status === 'pass').length;
            const avg = sRes.length ? round1(sRes.reduce((s, r) => s + Number(r.percentage || 0), 0) / sRes.length) : 0;
            return {
              'Academic Year': sess.name,
              Examinations: sExams.length,
              'Total Appeared': sRes.length,
              Passed: pass,
              Failed: sRes.length - pass,
              'Pass %': sRes.length ? `${pct(pass, sRes.length)}%` : 'N/A',
              'Avg Score %': sRes.length ? `${avg}%` : 'N/A',
            };
          });
          chartData = rows.map((r) => ({ label: r['Academic Year'], passPct: parseFloat(String(r['Pass %'])) || 0 }));
        } else {
          rows = examinations.map((e) => {
            const eRes = results.filter((r) => r.examination_id === e.id);
            const pass = eRes.filter((r) => r.status === 'pass').length;
            const high = eRes.length ? Math.max(...eRes.map((r) => Number(r.percentage || 0))) : 0;
            const low = eRes.length ? Math.min(...eRes.map((r) => Number(r.percentage || 0))) : 0;
            const avg = eRes.length ? round1(eRes.reduce((s, r) => s + Number(r.percentage || 0), 0) / eRes.length) : 0;
            return {
              Examination: e.name,
              Class: maps.classMap.get(e.class_id)?.name || '—',
              Date: e.start_date,
              Appeared: eRes.length,
              Passed: pass,
              Failed: eRes.length - pass,
              'Pass %': eRes.length ? `${pct(pass, eRes.length)}%` : 'N/A',
              'Avg %': eRes.length ? `${avg}%` : 'N/A',
              'Highest %': eRes.length ? `${high}%` : 'N/A',
              'Lowest %': eRes.length ? `${low}%` : 'N/A',
            };
          });
          chartData = rows.map((r) => ({ label: `${r.Examination} (${r.Class})`, passPct: parseFloat(String(r['Pass %'])) || 0 }));
        }
        const totalPass = results.filter((r) => r.status === 'pass').length;
        summaryCards = [
          { label: 'Examinations', value: examinations.length },
          { label: 'Total Results', value: results.length },
          { label: 'Overall Pass %', value: results.length ? `${pct(totalPass, results.length)}%` : 'N/A', tone: 'emerald' },
        ];
        break;
      }

      // ==================== PART 9: TEACHER REPORTS ====================
      case 'teacher_complete':
      case 'teacher_details':
      case 'teacher_assignments':
      case 'teacher_monthly':
      case 'teacher_annual':
      case 'teacher_performance':
      case 'teacher_student_strength':
      case 'monthly_teachers':
      case 'annual_teachers':
      case 'hist_teachers': {
        title =
          reportId === 'teacher_assignments'
            ? 'Teacher-wise Class & Subject Assignment Report'
            : reportId === 'teacher_performance'
            ? 'Teacher Academic Activity & Class Result Report'
            : reportId === 'teacher_student_strength'
            ? 'Teacher-wise Student Strength Report'
            : reportId === 'annual_teachers' || reportId === 'teacher_annual'
            ? 'Annual Teacher Report'
            : reportId === 'hist_teachers'
            ? 'Historical Teacher Records'
            : 'Complete Teacher Report';

        rows = teachers.map((t) => {
          const assignedClassIds = new Set<string>();
          for (const c of snap.classes) if (c.class_teacher_id === t.id) assignedClassIds.add(c.id);
          for (const ta of snap.teacherAssignments) if (ta.teacher_id === t.id) assignedClassIds.add(ta.class_id);
          for (const cs of snap.classSubjects) if (cs.teacher_id === t.id) assignedClassIds.add(cs.class_id);

          const classNames = Array.from(assignedClassIds)
            .map((cid) => maps.classMap.get(cid)?.name)
            .filter(Boolean)
            .join(', ');

          const subjNames = Array.from(
            new Set([
              ...snap.teacherAssignments.filter((ta) => ta.teacher_id === t.id && ta.subject_id).map((ta) => maps.subjectMap.get(ta.subject_id)?.name),
              ...snap.classSubjects.filter((cs) => cs.teacher_id === t.id && cs.subject_id).map((cs) => maps.subjectMap.get(cs.subject_id)?.name),
            ].filter(Boolean))
          ).join(', ');

          const tAtt = teacherAttendance.filter((a) => a.teacher_id === t.id);
          const tPres = tAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
          const tStudents = students.filter((s) => assignedClassIds.has(s.class_id));
          const tHw = baseSub.homework.filter((h) => h.teacher_id === t.id).length;
          const tRes = results.filter((r) => assignedClassIds.has(r.class_id));
          const tPassPct = tRes.length ? `${pct(tRes.filter((r) => r.status === 'pass').length, tRes.length)}%` : 'N/A';

          if (reportId === 'teacher_assignments') {
            return {
              'Teacher ID': t.teacher_code,
              'Teacher Name': t.full_name,
              'Assigned Classes': classNames || 'None',
              'Assigned Subjects': subjNames || 'None',
              'Class Count': assignedClassIds.size,
              Status: String(t.employment_status || '').toUpperCase(),
            };
          }
          if (reportId === 'teacher_student_strength') {
            return {
              'Teacher ID': t.teacher_code,
              'Teacher Name': t.full_name,
              'Assigned Classes': classNames || 'None',
              'Total Students': tStudents.length,
              'Active Students': tStudents.filter((s) => s.status === 'active').length,
            };
          }
          if (reportId === 'teacher_performance') {
            return {
              'Teacher ID': t.teacher_code,
              'Teacher Name': t.full_name,
              Classes: classNames || 'None',
              'Students Taught': tStudents.length,
              'Homework Assigned': tHw,
              'Attendance %': tAtt.length ? `${pct(tPres, tAtt.length)}%` : 'N/A',
              'Assigned Class Pass %': tPassPct,
            };
          }
          return {
            'Teacher ID': t.teacher_code,
            'Teacher Name': t.full_name,
            Qualification: t.qualification || '—',
            Mobile: t.mobile || '—',
            Email: t.email || '—',
            'Joining Date': dateOnly(t.joining_date),
            'Assigned Classes': classNames || '—',
            'Attendance %': tAtt.length ? `${pct(tPres, tAtt.length)}%` : 'N/A',
            Status: String(t.employment_status || '').toUpperCase(),
          };
        });
        summaryCards = [
          { label: 'Total Teachers', value: teachers.length },
          { label: 'Active', value: teachers.filter((t) => t.employment_status === 'active').length, tone: 'emerald' },
          { label: 'On Leave / Inactive', value: teachers.filter((t) => t.employment_status !== 'active').length, tone: 'amber' },
        ];
        break;
      }

      case 'daily_teacher_attendance':
      case 'teacher_attendance':
      case 'att_teacher': {
        title = 'Teacher Attendance Report';
        const list = [...teacherAttendance].sort((a, b) => String(b.attendance_date).localeCompare(String(a.attendance_date)));
        rows = list.map((a) => {
          const t = maps.teacherMap.get(a.teacher_id);
          return {
            Date: a.attendance_date,
            'Teacher ID': t?.teacher_code || '—',
            'Teacher Name': t?.full_name || 'Teacher',
            Status: String(a.status).toUpperCase(),
            Remark: a.remark || '—',
          };
        });
        const pres = list.filter((a) => a.status === 'present' || a.status === 'late').length;
        summaryCards = [
          { label: 'Total Records', value: list.length },
          { label: 'Present / Late', value: pres, tone: 'emerald' },
          { label: 'Absent', value: list.filter((a) => a.status === 'absent').length, tone: 'red' },
          { label: 'Attendance %', value: list.length ? `${pct(pres, list.length)}%` : 'N/A' },
        ];
        break;
      }

      // ==================== PART 10: FEES & FINANCIAL REPORTS ====================
      case 'daily_fees':
      case 'monthly_fees':
      case 'annual_fees':
      case 'fin_daily':
      case 'fin_weekly':
      case 'fin_monthly':
      case 'fin_annual':
      case 'fin_class_wise':
      case 'fin_student_wise':
      case 'fin_paid':
      case 'fin_pending':
      case 'fin_summary':
      case 'fin_monthly_comparison':
      case 'fin_annual_comparison':
      case 'hist_financial': {
        title = 'Fees & Financial Transactions Report';
        notice =
          'Note: A dedicated Student Tuition Fee ledger table is not yet configured in this Madrasa database (student enrollments are currently Madrasa-sponsored). Only actual recorded Program Registration payments from the database are shown below — zero simulated or estimated fee numbers are generated.';

        if (!scope.canViewFinance) {
          notice = 'Financial transaction logs are restricted to Super Admin and Committee Members.';
          rows = [];
        } else if (reportId === 'fin_pending') {
          rows = [];
          summaryCards = [
            { label: 'Pending Tuition Dues', value: 'Not Configured', tone: 'amber' },
            { label: 'Recorded Program Payments', value: baseSub.programPayments.length },
          ];
        } else if (reportId === 'fin_monthly_comparison') {
          const mMap = new Map<string, { count: number; total: number }>();
          for (const p of baseSub.programPayments) {
            const mk = monthKey(p.date);
            if (!mk) continue;
            const cur = mMap.get(mk) || { count: 0, total: 0 };
            cur.count += 1;
            cur.total += Number(p.amount || 0);
            mMap.set(mk, cur);
          }
          rows = Array.from(mMap.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([mk, v]) => ({
              Month: formatMonthLabel(mk),
              Transactions: v.count,
              'Collected (INR)': v.total,
            }));
        } else {
          rows = baseSub.programPayments.map((p) => ({
            Date: p.date,
            Program: p.program_title,
            Participant: p.participant_name,
            'Father Name': p.father_name || '—',
            'Class / Address': p.class_or_address || '—',
            Contact: p.contact || '—',
            'Amount (INR)': p.amount,
            Status: p.status,
          }));
        }
        const totalCollected = baseSub.programPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
        if (!summaryCards.length) {
          summaryCards = [
            { label: 'Program Collections (Actual)', value: `Rs. ${totalCollected.toLocaleString('en-IN')}`, tone: 'emerald' },
            { label: 'Transactions', value: baseSub.programPayments.length },
            { label: 'Tuition Fee Ledger', value: 'Not Enabled', tone: 'amber' },
          ];
        }
        break;
      }

      // ==================== PART 4 & 5: OVERVIEW, ACTIVITIES, GROWTH & ADMIN ====================
      case 'daily_overview':
      case 'weekly_overview':
      case 'monthly_complete':
      case 'annual_madarsa':
      case 'annual_growth':
      case 'annual_administrative':
      case 'hist_year_to_year': {
        title =
          reportId === 'daily_overview'
            ? 'Daily Madarsa Overview'
            : reportId === 'weekly_overview'
            ? 'Weekly Madarsa Overview'
            : reportId === 'monthly_complete'
            ? 'Monthly Complete Madarsa Report'
            : reportId === 'annual_growth'
            ? 'Annual Growth & 12-Month Trend Report'
            : reportId === 'annual_administrative'
            ? 'Annual Administrative Report'
            : reportId === 'hist_year_to_year'
            ? 'Year-to-Year Historical Comparison'
            : 'Annual Madarsa Summary Report';

        if (reportId === 'hist_year_to_year') {
          rows = snap.sessions.map((sess) => {
            const sSub = filterByWindow(
              snap,
              { startDate: sess.start_date, endDate: sess.end_date, sessionId: sess.id, sessionName: sess.name, label: sess.name, months: [] },
              true
            );
            const st = computeSummaryForSubset(sSub, snap.teachers, snap.classes);
            return {
              'Academic Year': sess.name,
              'Period': `${sess.start_date} to ${sess.end_date}`,
              Students: st.totalStudents,
              Admissions: st.totalAdmissions,
              'Attendance %': st.totalAttRecords ? `${st.attendancePct}%` : 'N/A',
              Examinations: st.totalExaminations,
              'Results': st.totalResults,
              'Pass %': st.totalResults ? `${st.passPercentage}%` : 'N/A',
              'Program Fees (INR)': st.programFeesCollected,
            };
          });
          chartData = rows.map((r) => ({
            label: r['Academic Year'],
            students: r.Students,
            admissions: r.Admissions,
            passPct: parseFloat(String(r['Pass %'])) || 0,
          }));
        } else if (reportId === 'annual_growth' || reportId === 'annual_madarsa') {
          const examLookup = new Map(examinations.map((e) => [e.id, e]));
          rows = win.months.map(({ key, label }) => {
            const mAdm = admissions.filter((a) => monthKey(a.admission_date || a.created_at) === key).length;
            const mAtt = attendance.filter((a) => monthKey(a.attendance_date) === key);
            const mPres = mAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
            const mEx = examinations.filter((e) => monthKey(e.start_date) === key).length;
            const mRes = results.filter((r) => monthKey(examLookup.get(r.examination_id)?.start_date || r.created_at) === key);
            const mPass = mRes.filter((r) => r.status === 'pass').length;
            const mFee = baseSub.programPayments.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + Number(p.amount || 0), 0);
            return {
              Month: label,
              'New Admissions': mAdm,
              'Attendance Records': mAtt.length,
              'Attendance %': mAtt.length ? `${pct(mPres, mAtt.length)}%` : 'N/A',
              Examinations: mEx,
              'Results Count': mRes.length,
              'Pass %': mRes.length ? `${pct(mPass, mRes.length)}%` : 'N/A',
              'Program Fees (INR)': mFee,
            };
          });
          chartData = rows.map((r) => ({
            label: r.Month,
            admissions: r['New Admissions'],
            attendancePct: parseFloat(String(r['Attendance %'])) || 0,
            passPct: parseFloat(String(r['Pass %'])) || 0,
          }));
        } else {
          const stats = computeSummaryForSubset(
            { ...baseSub, students, admissions, attendance, examinations, results },
            teachers,
            targetClasses
          );
          rows = [
            { Metric: 'Total Students', Value: stats.totalStudents, Details: `${stats.activeStudents} Active · ${stats.inactiveStudents} Inactive` },
            { Metric: 'Total Teachers', Value: stats.totalTeachers, Details: `${stats.activeTeachers} Active` },
            { Metric: 'Total Classes', Value: stats.totalClasses, Details: 'Active Academic Classes' },
            { Metric: 'New Admissions (Period)', Value: stats.totalAdmissions, Details: win.label },
            { Metric: 'Student Attendance Marked', Value: stats.totalAttRecords, Details: `${stats.presentRecords} Present · ${stats.absentRecords} Absent · ${stats.attendancePct}%` },
            { Metric: 'Examinations Conducted', Value: stats.totalExaminations, Details: `${stats.totalResults} Result Records` },
            { Metric: 'Examination Pass Rate', Value: stats.totalResults ? `${stats.passPercentage}%` : 'N/A', Details: `${stats.passedResults} Passed · ${stats.failedResults} Failed` },
            { Metric: 'Homework Assigned', Value: baseSub.homework.length, Details: 'Period Homework Tasks' },
            { Metric: 'Notices Published', Value: baseSub.notices.length, Details: 'Official Announcements' },
            { Metric: 'Programs / Events', Value: baseSub.programs.length, Details: 'Madrasa Events' },
            { Metric: 'Program Collections (Actual)', Value: `Rs. ${stats.programFeesCollected.toLocaleString('en-IN')}`, Details: `${baseSub.programPayments.length} Paid Registrations` },
          ];
        }

        const stSum = computeSummaryForSubset(
          { ...baseSub, students, admissions, attendance, examinations, results },
          teachers,
          targetClasses
        );
        summaryCards = [
          { label: 'Students', value: stSum.totalStudents },
          { label: 'Admissions', value: stSum.totalAdmissions },
          { label: 'Attendance %', value: stSum.totalAttRecords ? `${stSum.attendancePct}%` : 'N/A', tone: 'emerald' },
          { label: 'Pass %', value: stSum.totalResults ? `${stSum.passPercentage}%` : 'N/A', tone: 'emerald' },
        ];
        break;
      }

      case 'daily_activities':
      case 'weekly_activities':
      case 'monthly_activities':
      case 'annual_activities': {
        title =
          reportId === 'daily_activities'
            ? 'Daily Activities & Operations Log'
            : reportId === 'weekly_activities'
            ? 'Weekly Activities & Operations Log'
            : reportId === 'monthly_activities'
            ? 'Monthly Activities & Programs Report'
            : 'Annual Activities, Events & Administrative Logs';

        const combined: Record<string, any>[] = [];
        for (const p of baseSub.programs) {
          combined.push({
            Date: dateOnly(p.program_date),
            Category: 'Program / Event',
            Title: p.title,
            Details: `${p.category} · ${p.venue} (${p.status})`,
            Actor: 'Administration',
          });
        }
        for (const n of baseSub.notices) {
          combined.push({
            Date: dateOnly(n.publish_date),
            Category: 'Notice',
            Title: n.title,
            Details: `${n.category} · Audience: ${n.target_audience}`,
            Actor: 'Administration',
          });
        }
        if (scope.canViewAdminLogs) {
          for (const l of baseSub.activityLogs.slice(0, 150)) {
            combined.push({
              Date: dateOnly(l.created_at),
              Category: `System (${l.module})`,
              Title: l.action,
              Details: l.details || '—',
              Actor: `${l.username} (${l.role_name})`,
            });
          }
        }
        rows = combined.sort((a, b) => String(b.Date).localeCompare(String(a.Date)));
        summaryCards = [
          { label: 'Total Activities', value: rows.length },
          { label: 'Programs', value: baseSub.programs.length },
          { label: 'Notices', value: baseSub.notices.length },
          { label: 'Admin Audit Logs', value: baseSub.activityLogs.length },
        ];
        break;
      }

      default: {
        title = 'Complete Student List';
        rows = students.map(mapStudentRow);
        summaryCards = [{ label: 'Total Records', value: rows.length }];
      }
    }

    // Monthly comparison helper when a specific month is selected
    let monthComparison: any = null;
    if (q.month && /^\d{4}-\d{2}$/.test(q.month)) {
      const prevMonth = getPreviousMonthKey(q.month);
      if (prevMonth) {
        const prevBounds = getMonthBounds(prevMonth);
        const prevSub = filterByWindow(snap, {
          startDate: prevBounds.start,
          endDate: prevBounds.end,
          sessionId: null,
          sessionName: formatMonthLabel(prevMonth),
          label: formatMonthLabel(prevMonth),
          months: [],
        });
        const curStats = computeSummaryForSubset(baseSub, teachers, targetClasses);
        const prevStats = computeSummaryForSubset(prevSub, teachers, targetClasses);
        monthComparison = {
          currentLabel: formatMonthLabel(q.month),
          previousLabel: formatMonthLabel(prevMonth),
          metrics: [
            { label: 'Admissions', current: curStats.totalAdmissions, previous: prevStats.totalAdmissions },
            { label: 'Attendance %', current: curStats.attendancePct, previous: prevStats.attendancePct, suffix: '%' },
            { label: 'Examinations', current: curStats.totalExaminations, previous: prevStats.totalExaminations },
            { label: 'Pass Rate %', current: curStats.passPercentage, previous: prevStats.passPercentage, suffix: '%' },
          ],
        };
      }
    }

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return res.json({
      reportId,
      title,
      subtitle,
      periodLabel: win.label,
      sessionName: win.sessionName,
      startDate: win.startDate,
      endDate: win.endDate,
      notice,
      summaryCards,
      columns,
      rows,
      chartData,
      monthComparison,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Reports ERP Dataset]', err);
    return res.status(500).json({ error: err?.message || 'Failed to generate report dataset' });
  }
});

// ============================================================================
// 5. ONE-CLICK COMPLETE MADARSA ANNUAL REPORT — ALL 21 SECTIONS (Part 6)
// ============================================================================
router.get('/reports-erp/annual-complete', requireAuth, requireRole(...REPORT_ROLES), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const scope = await resolveScope(req);
    const snap = await fetchCoreSnapshot(admin, scope);
    const maps = buildLookupMaps(snap);

    const q = req.query as Record<string, string | undefined>;
    const win = resolvePeriodWindow(snap.sessions, q);
    const curSub = filterByWindow(snap, win);
    const curStats = computeSummaryForSubset(curSub, snap.teachers, snap.classes);

    // Previous Academic Year Comparison
    const prevSession = getPreviousSession(snap.sessions, win.sessionId);
    const prevSub = prevSession
      ? filterByWindow(
          snap,
          {
            startDate: prevSession.start_date,
            endDate: prevSession.end_date,
            sessionId: prevSession.id,
            sessionName: prevSession.name,
            label: prevSession.name,
            months: [],
          },
          true
        )
      : null;
    const prevStats = prevSub ? computeSummaryForSubset(prevSub, snap.teachers, snap.classes) : null;

    // 12-Month Breakdown
    const examLookup = new Map(curSub.examinations.map((e) => [e.id, e]));
    const monthlyBreakdown = win.months.map(({ key, label }) => {
      const mAdm = curSub.admissions.filter((a) => monthKey(a.admission_date || a.created_at) === key).length;
      const mAtt = curSub.attendance.filter((a) => monthKey(a.attendance_date) === key);
      const mPres = mAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
      const mAbs = mAtt.filter((a) => a.status === 'absent').length;
      const mEx = curSub.examinations.filter((e) => monthKey(e.start_date) === key).length;
      const mRes = curSub.results.filter((r) => monthKey(examLookup.get(r.examination_id)?.start_date || r.created_at) === key);
      const mPass = mRes.filter((r) => r.status === 'pass').length;
      const mFee = curSub.programPayments.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + Number(p.amount || 0), 0);
      return {
        Month: label,
        'New Admissions': mAdm,
        Present: mPres,
        Absent: mAbs,
        'Attendance %': mAtt.length ? `${pct(mPres, mAtt.length)}%` : 'N/A',
        Examinations: mEx,
        'Results': mRes.length,
        'Pass %': mRes.length ? `${pct(mPass, mRes.length)}%` : 'N/A',
        'Program Fees (INR)': mFee,
      };
    });

    // Class-wise Strength & Results
    const classStrengthRows = snap.classes.map((cls) => {
      const cSt = curSub.students.filter((s) => s.class_id === cls.id);
      const cAct = cSt.filter((s) => s.status === 'active').length;
      const teacher = maps.teacherMap.get(cls.class_teacher_id);
      return {
        Class: cls.name,
        Code: cls.code,
        'Class Teacher': teacher?.full_name || 'Unassigned',
        'Room No': cls.room_no || '—',
        'Total Students': cSt.length,
        Active: cAct,
        Inactive: cSt.length - cAct,
      };
    });

    const classResultRows = snap.classes.map((cls) => {
      const cEx = curSub.examinations.filter((e) => e.class_id === cls.id).length;
      const cRes = curSub.results.filter((r) => r.class_id === cls.id);
      const pass = cRes.filter((r) => r.status === 'pass').length;
      const fail = cRes.filter((r) => r.status === 'fail').length;
      const avg = cRes.length ? round1(cRes.reduce((s, r) => s + Number(r.percentage || 0), 0) / cRes.length) : 0;
      const high = cRes.length ? Math.max(...cRes.map((r) => Number(r.percentage || 0))) : 0;
      return {
        Class: cls.name,
        Examinations: cEx,
        Appeared: cRes.length,
        Passed: pass,
        Failed: fail,
        'Pass %': cRes.length ? `${pct(pass, cRes.length)}%` : 'N/A',
        'Avg %': cRes.length ? `${avg}%` : 'N/A',
        'Highest %': cRes.length ? `${high}%` : 'N/A',
      };
    });

    // Subject-wise performance
    const subjMap = new Map<string, { name: string; code: string; entries: number; passed: number; obt: number; tot: number }>();
    for (const m of curSub.marks) {
      const subj = maps.subjectMap.get(m.subject_id);
      if (!subj) continue;
      const tot = Number(m.total_marks || subj.total_marks || 100);
      const obt = m.is_absent ? 0 : Number(m.obtained_marks || 0);
      const passMark = Number(subj.passing_marks ?? 33);
      const cur = subjMap.get(subj.id) || { name: subj.name, code: subj.code, entries: 0, passed: 0, obt: 0, tot: 0 };
      cur.entries += 1;
      if (!m.is_absent && obt >= passMark) cur.passed += 1;
      cur.obt += obt;
      cur.tot += tot;
      subjMap.set(subj.id, cur);
    }
    const subjectPerfRows = Array.from(subjMap.values()).map((v) => ({
      Subject: v.name,
      Code: v.code,
      'Total Evaluated': v.entries,
      Passed: v.passed,
      'Pass %': `${pct(v.passed, v.entries)}%`,
      'Avg Score %': `${pct(v.obt, v.tot)}%`,
    }));

    // Toppers & Merit List
    const passedSorted = [...curSub.results]
      .filter((r) => r.status === 'pass')
      .sort((a, b) => Number(b.percentage || 0) - Number(a.percentage || 0));

    const topperRows = passedSorted.slice(0, 15).map((r, i) => {
      const st = maps.studentMap.get(r.student_id);
      const ex = maps.examMap.get(r.examination_id);
      return {
        Rank: i + 1,
        'Admission No': getAdmissionCode(st),
        'Student Name': st?.full_name || '—',
        Class: maps.classMap.get(r.class_id)?.name || '—',
        Examination: ex?.name || '—',
        Obtained: Number(r.obtained_marks || 0),
        Total: Number(r.total_marks || 0),
        'Percentage %': `${Number(r.percentage || 0)}%`,
        Grade: r.grade || '—',
      };
    });

    const meritRows = passedSorted.slice(0, 50).map((r, i) => {
      const st = maps.studentMap.get(r.student_id);
      const ex = maps.examMap.get(r.examination_id);
      return {
        'Merit #': i + 1,
        'Admission No': getAdmissionCode(st),
        'Student Name': st?.full_name || '—',
        Class: maps.classMap.get(r.class_id)?.name || '—',
        Examination: ex?.name || '—',
        'Percentage %': `${Number(r.percentage || 0)}%`,
        Grade: r.grade || '—',
      };
    });

    // Status distribution rows
    const statusMap = new Map<string, number>();
    for (const s of curSub.students) statusMap.set(s.status || 'active', (statusMap.get(s.status || 'active') || 0) + 1);
    const studentStatusRows = Array.from(statusMap.entries()).map(([status, count]) => ({
      Status: status.toUpperCase(),
      'Student Count': count,
      'Share %': `${pct(count, curSub.students.length)}%`,
    }));

    const sections = [
      {
        id: 'sec_01_intro',
        number: 1,
        title: 'Madarsa Introduction',
        summary: `Official Annual Institutional Report for ${win.label}. All statistics, attendance logs, examination results, and administrative figures below are dynamically compiled directly from verified Madrasa database records.`,
        rows: [
          { Field: 'Institution Name', Value: 'Madrasa Gausiya Razvia (مدرسہ غوثیہ رضویہ)' },
          { Field: 'Location', Value: 'Islamnagar, Ramgarh, Palamu, Jharkhand, India - 822110' },
          { Field: 'Reporting Period', Value: win.label },
          { Field: 'Academic Session', Value: win.sessionName },
          { Field: 'Date Range', Value: `${win.startDate || 'All'} to ${win.endDate || 'Present'}` },
          { Field: 'Report Generated On', Value: new Date().toLocaleDateString('en-IN') },
        ],
      },
      {
        id: 'sec_02_overview',
        number: 2,
        title: 'Annual Overview',
        summary: 'Executive summary of key Madrasa metrics across academics, staffing, attendance, and examinations.',
        rows: [
          { Indicator: 'Total Enrolled Students', Count: curStats.totalStudents },
          { Indicator: 'Active Students', Count: curStats.activeStudents },
          { Indicator: 'Total Faculty / Teachers', Count: curStats.totalTeachers },
          { Indicator: 'Total Academic Classes', Count: curStats.totalClasses },
          { Indicator: 'New Admissions (Period)', Count: curStats.totalAdmissions },
          { Indicator: 'Overall Attendance Percentage', Count: curStats.totalAttRecords ? `${curStats.attendancePct}%` : 'N/A' },
          { Indicator: 'Examinations Conducted', Count: curStats.totalExaminations },
          { Indicator: 'Overall Examination Pass Rate', Count: curStats.totalResults ? `${curStats.passPercentage}%` : 'N/A' },
        ],
      },
      {
        id: 'sec_03_student_stats',
        number: 3,
        title: 'Total Student Statistics',
        summary: `Breakdown of all ${curStats.totalStudents} students by gender and enrollment activity.`,
        rows: [
          { Category: 'Total Students', Count: curStats.totalStudents },
          { Category: 'Active Students', Count: curStats.activeStudents },
          { Category: 'Inactive / Other Status', Count: curStats.inactiveStudents },
          { Category: 'Male Students', Count: curSub.students.filter((s) => String(s.gender).toLowerCase() === 'male').length },
          { Category: 'Female Students', Count: curSub.students.filter((s) => String(s.gender).toLowerCase() === 'female').length },
        ],
      },
      {
        id: 'sec_04_class_strength',
        number: 4,
        title: 'Class-wise Student Strength',
        summary: 'Student strength and class teacher allocation across every class.',
        rows: classStrengthRows,
      },
      {
        id: 'sec_05_admissions',
        number: 5,
        title: 'New Admissions',
        summary: `${curSub.admissions.length} admission applications recorded during ${win.label}.`,
        rows: curSub.admissions.slice(0, 100).map((a) => ({
          'Admission No': a.admission_number || a.admission_no,
          'Student Name': a.student_name,
          'Father Name': a.father_name,
          Class: maps.classMap.get(a.admission_class_id)?.name || '—',
          'Admission Date': dateOnly(a.admission_date),
          Status: String(a.status).toUpperCase(),
        })),
      },
      {
        id: 'sec_06_student_status',
        number: 6,
        title: 'Student Status Distribution',
        summary: 'Current enrollment status distribution across active, inactive, transferred, and graduated records.',
        rows: studentStatusRows,
      },
      {
        id: 'sec_07_teachers',
        number: 7,
        title: 'Teacher Statistics',
        summary: `${snap.teachers.length} faculty members recorded (${curStats.activeTeachers} active).`,
        rows: snap.teachers.map((t) => ({
          'Teacher ID': t.teacher_code,
          Name: t.full_name,
          Qualification: t.qualification || '—',
          Mobile: t.mobile || '—',
          'Joining Date': dateOnly(t.joining_date),
          Status: String(t.employment_status).toUpperCase(),
        })),
      },
      {
        id: 'sec_08_monthly_att',
        number: 8,
        title: 'Monthly Attendance Statistics',
        summary: 'Month-by-month student attendance tracking across the academic year.',
        rows: monthlyBreakdown.map((m) => ({
          Month: m.Month,
          Present: m.Present,
          Absent: m.Absent,
          'Attendance %': m['Attendance %'],
        })),
      },
      {
        id: 'sec_09_annual_att',
        number: 9,
        title: 'Annual Attendance Percentage',
        summary: 'Class-wise annual student attendance summary calculated strictly from actual marked attendance records.',
        rows: snap.classes.map((cls) => {
          const cAtt = curSub.attendance.filter((a) => a.class_id === cls.id);
          const pres = cAtt.filter((a) => a.status === 'present').length;
          const late = cAtt.filter((a) => a.status === 'late').length;
          const abs = cAtt.filter((a) => a.status === 'absent').length;
          const lv = cAtt.filter((a) => a.status === 'leave').length;
          return {
            Class: cls.name,
            'Records Marked': cAtt.length,
            Present: pres,
            Late: late,
            Absent: abs,
            Leave: lv,
            'Attendance %': cAtt.length ? `${pct(pres + late, cAtt.length)}%` : 'N/A',
          };
        }),
      },
      {
        id: 'sec_10_exams',
        number: 10,
        title: 'Examination Details',
        summary: `${curSub.examinations.length} examinations scheduled/conducted during ${win.label}.`,
        rows: curSub.examinations.map((e) => ({
          Examination: e.name,
          Type: e.exam_type,
          Class: maps.classMap.get(e.class_id)?.name || '—',
          'Start Date': e.start_date,
          'End Date': e.end_date || '—',
          Status: String(e.status).toUpperCase(),
          Results: e.results_published ? 'Published' : 'Unpublished',
        })),
      },
      {
        id: 'sec_11_class_results',
        number: 11,
        title: 'Class-wise Examination Results',
        summary: 'Pass/fail breakdown, average percentage, and highest score per class.',
        rows: classResultRows,
      },
      {
        id: 'sec_12_subject_perf',
        number: 12,
        title: 'Subject-wise Performance',
        summary: 'Subject-level pass percentage and average score across evaluated marks.',
        rows: subjectPerfRows,
      },
      {
        id: 'sec_13_pass_fail',
        number: 13,
        title: 'Pass / Fail Statistics',
        summary: 'Overall examination pass/fail performance using official Madrasa grading rules.',
        rows: [
          { Metric: 'Total Result Records', Value: curStats.totalResults },
          { Metric: 'Total Passed', Value: curStats.passedResults },
          { Metric: 'Total Failed', Value: curStats.failedResults },
          { Metric: 'Overall Pass Percentage', Value: curStats.totalResults ? `${curStats.passPercentage}%` : 'N/A' },
          { Metric: 'Overall Average Score', Value: curStats.totalResults ? `${curStats.avgPercentage}%` : 'N/A' },
        ],
      },
      {
        id: 'sec_14_toppers',
        number: 14,
        title: 'Annual Topper List',
        summary: 'Top-performing students ranked by highest percentage.',
        rows: topperRows,
      },
      {
        id: 'sec_15_merit',
        number: 15,
        title: 'Annual Merit List',
        summary: 'Complete merit order of top passing students.',
        rows: meritRows,
      },
      {
        id: 'sec_16_promotions',
        number: 16,
        title: 'Student Promotion Statistics',
        summary: `${curSub.promotions.length} student promotion/transfer entries recorded.`,
        rows: curSub.promotions.map((p) => ({
          Date: dateOnly(p.created_at),
          Student: maps.studentMap.get(p.student_id)?.full_name || '—',
          Action: String(p.action_type).toUpperCase(),
          'From Class': maps.classMap.get(p.from_class_id)?.name || '—',
          'To Class': maps.classMap.get(p.to_class_id)?.name || '—',
          Remarks: p.remarks || '—',
        })),
      },
      {
        id: 'sec_17_monthly_growth',
        number: 17,
        title: '12-Month Growth Analysis',
        summary: 'Month-by-month comparison of admissions, attendance, examinations, results, and collections.',
        rows: monthlyBreakdown,
      },
      {
        id: 'sec_18_financial',
        number: 18,
        title: 'Financial Summary (Actual Records Only)',
        summary:
          'Student tuition fee ledger is not configured in this Madrasa database; only verified Program Registration payment receipts are included below.',
        rows: curSub.programPayments.map((p) => ({
          Date: p.date,
          Program: p.program_title,
          Participant: p.participant_name,
          'Amount (INR)': p.amount,
          Status: p.status,
        })),
      },
      {
        id: 'sec_19_activities',
        number: 19,
        title: 'Annual Activities & Events',
        summary: `${curSub.programs.length} Madrasa programs and ${curSub.notices.length} official notices recorded.`,
        rows: [
          ...curSub.programs.map((p) => ({
            Date: dateOnly(p.program_date),
            Type: 'Program',
            Title: p.title,
            Details: `${p.category} · ${p.venue}`,
            Status: String(p.status).toUpperCase(),
          })),
          ...curSub.notices.slice(0, 40).map((n) => ({
            Date: dateOnly(n.publish_date),
            Type: 'Notice',
            Title: n.title,
            Details: `${n.category} (${n.target_audience})`,
            Status: 'PUBLISHED',
          })),
        ],
      },
      {
        id: 'sec_20_prev_year',
        number: 20,
        title: 'Previous Year Comparison',
        summary: prevSession
          ? `Direct comparison between ${win.sessionName} and previous Academic Year ${prevSession.name}.`
          : 'No prior Academic Session found in database for previous-year comparison.',
        rows: prevStats
          ? [
              { Metric: 'Total Students', [win.sessionName]: curStats.totalStudents, [prevSession!.name]: prevStats.totalStudents, Difference: curStats.totalStudents - prevStats.totalStudents },
              { Metric: 'New Admissions', [win.sessionName]: curStats.totalAdmissions, [prevSession!.name]: prevStats.totalAdmissions, Difference: curStats.totalAdmissions - prevStats.totalAdmissions },
              { Metric: 'Attendance %', [win.sessionName]: `${curStats.attendancePct}%`, [prevSession!.name]: `${prevStats.attendancePct}%`, Difference: `${round1(curStats.attendancePct - prevStats.attendancePct)}%` },
              { Metric: 'Examinations', [win.sessionName]: curStats.totalExaminations, [prevSession!.name]: prevStats.totalExaminations, Difference: curStats.totalExaminations - prevStats.totalExaminations },
              { Metric: 'Pass Percentage', [win.sessionName]: `${curStats.passPercentage}%`, [prevSession!.name]: `${prevStats.passPercentage}%`, Difference: `${round1(curStats.passPercentage - prevStats.passPercentage)}%` },
              { Metric: 'Program Collections (INR)', [win.sessionName]: curStats.programFeesCollected, [prevSession!.name]: prevStats.programFeesCollected, Difference: curStats.programFeesCollected - prevStats.programFeesCollected },
            ]
          : [],
      },
      {
        id: 'sec_21_final_summary',
        number: 21,
        title: 'Final Annual Summary',
        summary: `During ${win.label}, Madrasa Gausiya Razvia managed ${curStats.totalStudents} students across ${curStats.totalClasses} classes with ${curStats.totalTeachers} faculty members, recording ${curStats.totalAdmissions} admissions, ${curStats.totalAttRecords ? `${curStats.attendancePct}%` : 'no recorded'} attendance, and ${curStats.totalResults ? `${curStats.passPercentage}%` : 'no recorded'} overall examination pass performance.`,
        rows: [
          { Area: 'Enrollment', Summary: `${curStats.totalStudents} Total (${curStats.activeStudents} Active)` },
          { Area: 'Admissions', Summary: `${curStats.totalAdmissions} Applications Recorded` },
          { Area: 'Attendance', Summary: curStats.totalAttRecords ? `${curStats.attendancePct}% across ${curStats.totalAttRecords} entries` : 'No Attendance Marked' },
          { Area: 'Examinations & Results', Summary: `${curStats.totalExaminations} Exams · ${curStats.passedResults}/${curStats.totalResults} Passed (${curStats.passPercentage}%)` },
          { Area: 'Faculty', Summary: `${curStats.totalTeachers} Teachers (${curStats.activeTeachers} Active)` },
          { Area: 'Events & Notices', Summary: `${curSub.programs.length} Programs · ${curSub.notices.length} Official Notices` },
        ],
      },
    ];

    return res.json({
      academicYear: win.sessionName,
      periodLabel: win.label,
      startDate: win.startDate,
      endDate: win.endDate,
      generatedAt: new Date().toISOString(),
      stats: curStats,
      previousSessionName: prevSession?.name || null,
      sections,
    });
  } catch (err: any) {
    console.error('[Reports ERP Annual Complete]', err);
    return res.status(500).json({ error: err?.message || 'Failed to generate complete annual report' });
  }
});

// ============================================================================
// 6. ADVANCED COMPARISON & ANALYTICS ENGINE (Part 12)
// ============================================================================
router.get('/reports-erp/compare', requireAuth, requireRole(...REPORT_ROLES), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const scope = await resolveScope(req);
    const snap = await fetchCoreSnapshot(admin, scope);
    const maps = buildLookupMaps(snap);

    const mode = String(req.query.mode || 'month_vs_month');
    const leftVal = String(req.query.left || '');
    const rightVal = String(req.query.right || '');

    const calcMetrics = (
      label: string,
      stList: any[],
      admList: any[],
      attList: any[],
      resList: any[],
      payList: any[]
    ) => {
      const pres = attList.filter((a) => a.status === 'present' || a.status === 'late').length;
      const pass = resList.filter((r) => r.status === 'pass').length;
      const avgScore = resList.length
        ? round1(resList.reduce((s, r) => s + Number(r.percentage || 0), 0) / resList.length)
        : 0;
      const fees = payList.reduce((s, p) => s + Number(p.amount || 0), 0);
      return {
        label,
        studentStrength: stList.length,
        admissions: admList.length,
        attendancePct: pct(pres, attList.length),
        attendanceRecords: attList.length,
        passPct: pct(pass, resList.length),
        avgScorePct: avgScore,
        resultsCount: resList.length,
        programFees: fees,
      };
    };

    const getQuarterBounds = (qy: string) => {
      // format: "2026-Q1"
      const m = qy.match(/^(\d{4})-Q([1-4])$/);
      const y = m ? Number(m[1]) : new Date().getFullYear();
      const qNum = m ? Number(m[2]) : 1;
      const startMonth = (qNum - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
      return {
        label: `Q${qNum} ${y}`,
        start: `${y}-${String(startMonth).padStart(2, '0')}-01`,
        end: `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    };

    let leftData: ReturnType<typeof calcMetrics>;
    let rightData: ReturnType<typeof calcMetrics>;

    if (mode === 'class_vs_class') {
      const cA = snap.classes.find((c) => c.id === leftVal) || snap.classes[0];
      const cB = snap.classes.find((c) => c.id === rightVal) || snap.classes[1] || snap.classes[0];
      const buildClassMetrics = (cls: any) =>
        cls
          ? calcMetrics(
              cls.name,
              snap.students.filter((s) => s.class_id === cls.id),
              snap.admissions.filter((a) => a.admission_class_id === cls.id),
              snap.attendance.filter((a) => a.class_id === cls.id),
              snap.results.filter((r) => r.class_id === cls.id),
              []
            )
          : calcMetrics('N/A', [], [], [], [], []);
      leftData = buildClassMetrics(cA);
      rightData = buildClassMetrics(cB);
    } else if (mode === 'exam_vs_exam') {
      const eA = snap.examinations.find((e) => e.id === leftVal) || snap.examinations[0];
      const eB = snap.examinations.find((e) => e.id === rightVal) || snap.examinations[1] || snap.examinations[0];
      const buildExamMetrics = (ex: any) => {
        if (!ex) return calcMetrics('N/A', [], [], [], [], []);
        const eRes = snap.results.filter((r) => r.examination_id === ex.id);
        const clsName = maps.classMap.get(ex.class_id)?.name || '';
        return calcMetrics(
          `${ex.name}${clsName ? ` (${clsName})` : ''}`,
          snap.students.filter((s) => s.class_id === ex.class_id),
          [],
          snap.attendance.filter((a) => a.class_id === ex.class_id),
          eRes,
          []
        );
      };
      leftData = buildExamMetrics(eA);
      rightData = buildExamMetrics(eB);
    } else if (mode === 'year_vs_year') {
      const resolveYear = (val: string, fallbackIdx: number) => {
        const sess = snap.sessions.find((s) => s.id === val || s.name === val);
        if (sess) {
          const sub = filterByWindow(
            snap,
            { startDate: sess.start_date, endDate: sess.end_date, sessionId: sess.id, sessionName: sess.name, label: sess.name, months: [] },
            true
          );
          return calcMetrics(sess.name, sub.students, sub.admissions, sub.attendance, sub.results, sub.programPayments);
        }
        if (/^\d{4}$/.test(val)) {
          const sub = filterByWindow(
            snap,
            { startDate: `${val}-01-01`, endDate: `${val}-12-31`, sessionId: null, sessionName: val, label: val, months: [] },
            true
          );
          return calcMetrics(val, sub.students, sub.admissions, sub.attendance, sub.results, sub.programPayments);
        }
        const fallbackSess = snap.sessions[fallbackIdx] || snap.sessions[0];
        if (fallbackSess) {
          const sub = filterByWindow(
            snap,
            { startDate: fallbackSess.start_date, endDate: fallbackSess.end_date, sessionId: fallbackSess.id, sessionName: fallbackSess.name, label: fallbackSess.name, months: [] },
            true
          );
          return calcMetrics(fallbackSess.name, sub.students, sub.admissions, sub.attendance, sub.results, sub.programPayments);
        }
        return calcMetrics('N/A', [], [], [], [], []);
      };
      leftData = resolveYear(leftVal, 1);
      rightData = resolveYear(rightVal, 0);
    } else if (mode === 'quarter_vs_quarter') {
      const yNow = new Date().getFullYear();
      const qA = getQuarterBounds(leftVal || `${yNow}-Q1`);
      const qB = getQuarterBounds(rightVal || `${yNow}-Q2`);
      const subA = filterByWindow(snap, { startDate: qA.start, endDate: qA.end, sessionId: null, sessionName: qA.label, label: qA.label, months: [] }, true);
      const subB = filterByWindow(snap, { startDate: qB.start, endDate: qB.end, sessionId: null, sessionName: qB.label, label: qB.label, months: [] }, true);
      leftData = calcMetrics(qA.label, subA.students, subA.admissions, subA.attendance, subA.results, subA.programPayments);
      rightData = calcMetrics(qB.label, subB.students, subB.admissions, subB.attendance, subB.results, subB.programPayments);
    } else {
      // month_vs_month
      const nowYm = new Date().toISOString().slice(0, 7);
      const ymRight = /^\d{4}-\d{2}$/.test(rightVal) ? rightVal : nowYm;
      const ymLeft = /^\d{4}-\d{2}$/.test(leftVal) ? leftVal : getPreviousMonthKey(ymRight);
      const bA = getMonthBounds(ymLeft);
      const bB = getMonthBounds(ymRight);
      const subA = filterByWindow(snap, { startDate: bA.start, endDate: bA.end, sessionId: null, sessionName: formatMonthLabel(ymLeft), label: formatMonthLabel(ymLeft), months: [] }, true);
      const subB = filterByWindow(snap, { startDate: bB.start, endDate: bB.end, sessionId: null, sessionName: formatMonthLabel(ymRight), label: formatMonthLabel(ymRight), months: [] }, true);
      leftData = calcMetrics(formatMonthLabel(ymLeft), subA.students, subA.admissions, subA.attendance, subA.results, subA.programPayments);
      rightData = calcMetrics(formatMonthLabel(ymRight), subB.students, subB.admissions, subB.attendance, subB.results, subB.programPayments);
    }

    const comparisonRows = [
      { Metric: 'Student Strength', [leftData.label]: leftData.studentStrength, [rightData.label]: rightData.studentStrength, Change: rightData.studentStrength - leftData.studentStrength },
      { Metric: 'New Admissions', [leftData.label]: leftData.admissions, [rightData.label]: rightData.admissions, Change: rightData.admissions - leftData.admissions },
      { Metric: 'Attendance %', [leftData.label]: `${leftData.attendancePct}%`, [rightData.label]: `${rightData.attendancePct}%`, Change: `${round1(rightData.attendancePct - leftData.attendancePct)}%` },
      { Metric: 'Pass Percentage', [leftData.label]: `${leftData.passPct}%`, [rightData.label]: `${rightData.passPct}%`, Change: `${round1(rightData.passPct - leftData.passPct)}%` },
      { Metric: 'Average Score %', [leftData.label]: `${leftData.avgScorePct}%`, [rightData.label]: `${rightData.avgScorePct}%`, Change: `${round1(rightData.avgScorePct - leftData.avgScorePct)}%` },
      { Metric: 'Results Recorded', [leftData.label]: leftData.resultsCount, [rightData.label]: rightData.resultsCount, Change: rightData.resultsCount - leftData.resultsCount },
      { Metric: 'Program Collections (INR)', [leftData.label]: leftData.programFees, [rightData.label]: rightData.programFees, Change: rightData.programFees - leftData.programFees },
    ];

    const chartComparison = [
      { metric: 'Students', left: leftData.studentStrength, right: rightData.studentStrength },
      { metric: 'Admissions', left: leftData.admissions, right: rightData.admissions },
      { metric: 'Attendance %', left: leftData.attendancePct, right: rightData.attendancePct },
      { metric: 'Pass %', left: leftData.passPct, right: rightData.passPct },
      { metric: 'Avg Score %', left: leftData.avgScorePct, right: rightData.avgScorePct },
    ];

    return res.json({
      mode,
      left: leftData,
      right: rightData,
      comparisonRows,
      chartComparison,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Reports ERP Compare]', err);
    return res.status(500).json({ error: err?.message || 'Failed to compute comparison analytics' });
  }
});

export default router;
