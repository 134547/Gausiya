import { Router } from 'express';
import { requireSupabaseAdmin, resolveStorageUrlsInRows } from '../supabase.ts';
import {
  AuthRequest,
  getParentIdForUser,
  getParentStudentIds,
  getStudentIdForUser,
  getTeacherAssignedClassIds,
  getTeacherIdForUser,
  requireAuth,
} from '../auth.ts';

const router = Router();

function getIsoWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000);
  const week = String(Math.floor((diffDays + startOfYear.getUTCDay()) / 7)).padStart(2, '0');
  return `${d.getUTCFullYear()}-W${week}`;
}

function buildAttendanceBuckets(rows: { attendance_date: string; status: string }[], daysBack: number, groupBy: 'day' | 'week' | 'month') {
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
  const map = new Map<string, { label: string; present: number; absent: number; late: number; on_leave: number }>();

  for (const r of rows) {
    if (r.attendance_date < cutoff) continue;
    const label =
      groupBy === 'day'
        ? r.attendance_date
        : groupBy === 'week'
          ? getIsoWeekLabel(r.attendance_date)
          : r.attendance_date.slice(0, 7);

    const entry = map.get(label) || { label, present: 0, absent: 0, late: 0, on_leave: 0 };
    if (r.status === 'present') entry.present += 1;
    else if (r.status === 'absent') entry.absent += 1;
    else if (r.status === 'late') entry.late += 1;
    else if (r.status === 'leave') entry.on_leave += 1;
    map.set(label, entry);
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;

    const user = req.user!;
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: committeeRaw }, { data: activeSession }] = await Promise.all([
      admin
        .from('committee_members')
        .select('id, full_name, designation, mobile, email, photo_url, status')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('display_order', { ascending: true })
        .limit(6),
      admin
        .from('academic_sessions')
        .select('id, name')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
    ]);
    const committeeMembers = await resolveStorageUrlsInRows(committeeRaw || [], ['photo_url']);

    if (user.role_slug === 'super_admin' || user.role_slug === 'committee_member') {
      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86400000).toISOString();
      const oneEightyDaysAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      const [
        { count: totalStudents },
        { count: totalTeachers },
        { count: totalParents },
        { count: totalClasses },
        { count: totalCommittee },
        { count: pendingAdmissions },
        { count: lastMonthStudents },
        { data: attAll },
        { data: examsRaw },
        { data: classesRaw },
        { data: activeStudentsRaw },
        { data: recentAdmissionsRaw },
        { data: recentActivities },
      ] = await Promise.all([
        admin.from('students').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'active'),
        admin.from('teachers').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('employment_status', 'active'),
        admin.from('parents').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'active'),
        admin.from('classes').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'active'),
        admin.from('committee_members').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'active'),
        admin.from('admissions').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'pending'),
        admin.from('students').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'active').lt('created_at', thirtyDaysAgoIso),
        admin.from('attendance').select('attendance_date, status').gte('attendance_date', oneEightyDaysAgo),
        admin
          .from('examinations')
          .select('id, name, start_date, classes(name), examination_subjects(subjects(name))')
          .is('deleted_at', null)
          .in('status', ['scheduled', 'ongoing'])
          .gte('start_date', yesterday)
          .order('start_date', { ascending: true })
          .limit(5),
        admin.from('classes').select('id, name, code').is('deleted_at', null).eq('status', 'active').order('code', { ascending: true }),
        admin.from('students').select('class_id').is('deleted_at', null).eq('status', 'active'),
        admin
          .from('admissions')
          .select('id, admission_no, student_name, admission_date, status, classes(name)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5),
        admin
          .from('activity_logs')
          .select('id, username, role_name, action, module, details, created_at')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      const attMap: Record<string, number> = { present: 0, absent: 0, late: 0, leave: 0 };
      for (const r of attAll || []) {
        if (r.attendance_date === today && attMap[r.status] !== undefined) {
          attMap[r.status] += 1;
        }
      }
      const totalMarked = attMap.present + attMap.absent + attMap.late + attMap.leave;
      const attendancePercentage = totalMarked > 0 ? Math.round(((attMap.present + attMap.late) / totalMarked) * 100) : 0;

      const upcomingExams = (examsRaw || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        start_date: e.start_date,
        class_name: e.classes?.name || '',
        subjects: (e.examination_subjects || []).map((es: any) => es.subjects?.name).filter(Boolean).join(', '),
      }));

      const classCounts = new Map<string, number>();
      for (const st of activeStudentsRaw || []) {
        if (st.class_id) classCounts.set(st.class_id, (classCounts.get(st.class_id) || 0) + 1);
      }
      const studentsPerClass = (classesRaw || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        count: classCounts.get(c.id) || 0,
      }));

      const recentAdmissions = (recentAdmissionsRaw || []).map((a: any) => ({
        id: a.id,
        admission_no: a.admission_no,
        student_name: a.student_name,
        admission_date: a.admission_date,
        status: a.status,
        class_name: a.classes?.name || 'Unassigned',
      }));

      const stTotal = totalStudents || 0;
      const stPrev = lastMonthStudents || 0;
      const totalStaff = (totalTeachers || 0) + (totalCommittee || 0);

      return res.json({
        role: user.role_slug,
        activeSession: activeSession?.name || '2026-2027',
        stats: {
          totalStudents: stTotal,
          totalTeachers: totalTeachers || 0,
          totalParents: totalParents || 0,
          totalClasses: totalClasses || 0,
          totalStaff,
          presentToday: attMap.present,
          absentToday: attMap.absent,
          pendingAdmissions: pendingAdmissions || 0,
          studentsGrowthPct: stPrev > 0 ? Math.round(((stTotal - stPrev) / stPrev) * 100) : stTotal > 0 ? 100 : 0,
        },
        todayAttendance: {
          ...attMap,
          totalMarked,
          percentage: attendancePercentage,
        },
        upcomingExams,
        studentsPerClass,
        attendanceAnalytics: {
          daily: buildAttendanceBuckets(attAll || [], 6, 'day'),
          weekly: buildAttendanceBuckets(attAll || [], 28, 'week'),
          monthly: buildAttendanceBuckets(attAll || [], 180, 'month'),
        },
        recentAdmissions,
        committeeMembers,
        recentActivities: recentActivities || [],
      });
    }

    if (user.role_slug === 'teacher') {
      const tid = await getTeacherIdForUser(user);
      const classIds = tid ? await getTeacherAssignedClassIds(tid) : [];

      const [assignedClassesRes, studentsRes, attRes, examsRes, hwRes, noticesRes] = await Promise.all([
        classIds.length
          ? admin.from('classes').select('id, name, code').in('id', classIds).is('deleted_at', null)
          : Promise.resolve({ data: [] }),
        classIds.length
          ? admin.from('students').select('id, class_id').in('class_id', classIds).is('deleted_at', null).eq('status', 'active')
          : Promise.resolve({ data: [] }),
        classIds.length
          ? admin.from('attendance').select('status').eq('attendance_date', today).in('class_id', classIds)
          : Promise.resolve({ data: [] }),
        classIds.length
          ? admin
              .from('examinations')
              .select('id, name, start_date, classes(name)')
              .in('class_id', classIds)
              .is('deleted_at', null)
              .in('status', ['scheduled', 'ongoing'])
              .order('start_date', { ascending: true })
              .limit(5)
          : Promise.resolve({ data: [] }),
        tid
          ? admin
              .from('homework')
              .select('id, title, submission_deadline, classes(name), subjects(name), homework_submissions(status)')
              .eq('teacher_id', tid)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),
        admin
          .from('notices')
          .select('id, title, category, publish_date')
          .is('deleted_at', null)
          .in('target_audience', ['all', 'teachers'])
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const classCounts = new Map<string, number>();
      for (const st of studentsRes.data || []) {
        if (st.class_id) classCounts.set(st.class_id, (classCounts.get(st.class_id) || 0) + 1);
      }
      const assignedClasses = (assignedClassesRes.data || []).map((c: any) => ({
        ...c,
        count: classCounts.get(c.id) || 0,
      }));

      const attMap: Record<string, number> = { present: 0, absent: 0, late: 0, leave: 0 };
      for (const r of attRes.data || []) {
        if (attMap[r.status] !== undefined) attMap[r.status] += 1;
      }
      const totalMarked = attMap.present + attMap.absent + attMap.late + attMap.leave;

      const upcomingExams = (examsRes.data || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        start_date: e.start_date,
        class_name: e.classes?.name || '',
      }));

      const pendingHomework = (hwRes.data || []).map((h: any) => ({
        id: h.id,
        title: h.title,
        submission_deadline: h.submission_deadline,
        class_name: h.classes?.name || '',
        subject_name: h.subjects?.name || '',
        pending_reviews: (h.homework_submissions || []).filter((s: any) => s.status === 'submitted').length,
      }));

      return res.json({
        role: 'teacher',
        activeSession: activeSession?.name || '2026-2027',
        stats: {
          assignedClasses: assignedClasses.length,
          totalStudents: (studentsRes.data || []).length,
          presentToday: attMap.present,
          absentToday: attMap.absent,
        },
        todayAttendance: {
          ...attMap,
          totalMarked,
          percentage: totalMarked > 0 ? Math.round(((attMap.present + attMap.late) / totalMarked) * 100) : 0,
        },
        studentsPerClass: assignedClasses,
        upcomingExams,
        pendingHomework,
        notices: noticesRes.data || [],
        committeeMembers,
      });
    }

    if (user.role_slug === 'parent') {
      const pid = await getParentIdForUser(user);
      const studentIds = pid ? await getParentStudentIds(pid) : [];

      const [childrenRes, attRes, resultsRes, noticesRes] = await Promise.all([
        studentIds.length
          ? admin.from('students').select('id, student_code, full_name, photo_url, class_id, classes(name)').in('id', studentIds).is('deleted_at', null)
          : Promise.resolve({ data: [] }),
        studentIds.length
          ? admin.from('attendance').select('student_id, status').in('student_id', studentIds)
          : Promise.resolve({ data: [] }),
        studentIds.length
          ? admin
              .from('results')
              .select('*, examinations(name), students(full_name)')
              .in('student_id', studentIds)
              .eq('is_published', true)
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),
        admin
          .from('notices')
          .select('id, title, category, publish_date')
          .is('deleted_at', null)
          .in('target_audience', ['all', 'parents'])
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const childrenResolved = await resolveStorageUrlsInRows(childrenRes.data || [], ['photo_url']);
      const children = childrenResolved.map((st: any) => {
        const stAtt = (attRes.data || []).filter((a: any) => a.student_id === st.id);
        return {
          id: st.id,
          student_code: st.student_code,
          full_name: st.full_name,
          photo_url: st.photo_url,
          class_id: st.class_id,
          class_name: st.classes?.name || 'Unassigned',
          present_days: stAtt.filter((a: any) => a.status === 'present' || a.status === 'late').length,
          total_days: stAtt.length,
        };
      });

      const recentResults = (resultsRes.data || []).map((r: any) => ({
        ...r,
        exam_name: r.examinations?.name || '',
        student_name: r.students?.full_name || '',
      }));

      return res.json({
        role: 'parent',
        activeSession: activeSession?.name || '2026-2027',
        children,
        recentResults,
        notices: noticesRes.data || [],
        committeeMembers,
      });
    }

    if (user.role_slug === 'public') {
      const [{ data: noticesData }, { data: programsData }, { count: feedCount }] = await Promise.all([
        admin
          .from('notices')
          .select('id, title, category, publish_date')
          .is('deleted_at', null)
          .eq('target_audience', 'all')
          .order('created_at', { ascending: false })
          .limit(6),
        admin
          .from('programs')
          .select('id, title, program_date, venue')
          .is('deleted_at', null)
          .order('program_date', { ascending: true })
          .limit(6),
        admin.from('feed_posts').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      ]);

      return res.json({
        role: 'public',
        activeSession: activeSession?.name || '2026-2027',
        notices: noticesData || [],
        programs: programsData || [],
        feedCount: feedCount || 0,
        committeeMembers,
      });
    }

    // Student Dashboard
    const stId = await getStudentIdForUser(user);
    const { data: studentRaw } = stId
      ? await admin.from('students').select('*, classes(name)').eq('id', stId).is('deleted_at', null).maybeSingle()
      : { data: null };

    const student = studentRaw
      ? { ...(await resolveStorageUrlsInRows([studentRaw], ['photo_url']))[0], class_name: (studentRaw as any).classes?.name || 'Unassigned' }
      : undefined;

    const [attRes, hwRes, resultsRes, noticesRes] = await Promise.all([
      stId ? admin.from('attendance').select('status').eq('student_id', stId) : Promise.resolve({ data: [] }),
      student?.class_id
        ? admin
            .from('homework')
            .select('id, title, submission_deadline, subjects(name)')
            .eq('class_id', student.class_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
      stId
        ? admin
            .from('results')
            .select('*, examinations(name)')
            .eq('student_id', stId)
            .eq('is_published', true)
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
      admin
        .from('notices')
        .select('id, title, category, publish_date, target_audience, target_class_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const attList = attRes.data || [];
    const attStats = {
      total: attList.length,
      present: attList.filter((a) => a.status === 'present').length,
      absent: attList.filter((a) => a.status === 'absent').length,
      late: attList.filter((a) => a.status === 'late').length,
      on_leave: attList.filter((a) => a.status === 'leave').length,
    };

    const notices = (noticesRes.data || [])
      .filter((n: any) => n.target_audience === 'all' || n.target_audience === 'students' || (n.target_audience === 'class' && n.target_class_id === student?.class_id))
      .slice(0, 5);

    const recentHomework = (hwRes.data || []).map((h: any) => ({
      id: h.id,
      title: h.title,
      submission_deadline: h.submission_deadline,
      subject_name: h.subjects?.name || '',
    }));

    const recentResults = (resultsRes.data || []).map((r: any) => ({
      ...r,
      exam_name: r.examinations?.name || '',
    }));

    return res.json({
      role: 'student',
      activeSession: activeSession?.name || '2026-2027',
      student,
      attendanceSummary: {
        ...attStats,
        percentage: attStats.total > 0 ? Math.round(((attStats.present + attStats.late) / attStats.total) * 100) : 0,
      },
      recentHomework,
      recentResults,
      notices,
      committeeMembers,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard statistics' });
  }
});

export default router;
