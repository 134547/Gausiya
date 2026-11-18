import { Router } from 'express';
import { requireSupabaseAdmin, resolveStorageUrl, resolveStorageUrlsInRows } from '../supabase.ts';
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

      const [parentRes, childrenRes, attRes, resultsRes, noticesRes, pendingOtpRes] = await Promise.all([
        pid
          ? admin.from('parents').select('id, parent_code, full_name, mobile, relationship').eq('id', pid).maybeSingle()
          : Promise.resolve({ data: null }),
        studentIds.length
          ? admin.from('students').select('id, student_code, admission_no, full_name, photo_url, class_id, classes(name)').in('id', studentIds).is('deleted_at', null)
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
        admin
          .from('documents')
          .select('id, file_url')
          .eq('entity_type', 'student')
          .eq('title', 'PARENT_LINK_OTP')
          .eq('file_type', 'pending')
          .eq('uploaded_by', user.id),
      ]);

      const nowMs = Date.now();
      const pendingRequestsCount = (pendingOtpRes.data || []).filter((doc: any) => {
        try {
          const parsed = JSON.parse(doc.file_url || '{}');
          return parsed.expires_at && new Date(parsed.expires_at).getTime() > nowMs;
        } catch {
          return false;
        }
      }).length;

      const childrenResolved = await resolveStorageUrlsInRows(childrenRes.data || [], ['photo_url']);
      const children = childrenResolved.map((st: any) => {
        const stAtt = (attRes.data || []).filter((a: any) => a.student_id === st.id);
        return {
          id: st.id,
          student_code: st.student_code,
          admission_no: st.admission_no || '',
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
        parentProfile: parentRes.data || null,
        pendingRequestsCount,
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
      ? await admin
          .from('students')
          .select('*, classes(name, code, teachers(full_name, mobile))')
          .eq('id', stId)
          .is('deleted_at', null)
          .maybeSingle()
      : { data: null };

    const student = studentRaw
      ? {
          ...(await resolveStorageUrlsInRows([studentRaw], ['photo_url']))[0],
          class_name: (studentRaw as any).classes?.name || 'Unassigned',
          class_code: (studentRaw as any).classes?.code || '',
          username: (studentRaw as any).username || user.username,
        }
      : undefined;

    const [
      attRes,
      hwRes,
      hwSubsRes,
      resultsRes,
      noticesRes,
      admRes,
      ocRes,
      examsRes,
      subjectsRes,
      syllabusDocsRes,
      programsRes,
      classTeacherRes,
      parentOtpRes,
    ] = await Promise.all([
      stId
        ? admin
            .from('attendance')
            .select('attendance_date, status, remark')
            .eq('student_id', stId)
            .order('attendance_date', { ascending: false })
        : Promise.resolve({ data: [] }),
      student?.class_id
        ? admin
            .from('homework')
            .select('id, title, submission_deadline, assigned_date, subjects(name), teachers(full_name)')
            .eq('class_id', student.class_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [] }),
      stId
        ? admin
            .from('homework_submissions')
            .select('homework_id, status, grade, submitted_at')
            .eq('student_id', stId)
        : Promise.resolve({ data: [] }),
      stId
        ? admin
            .from('results')
            .select('*, examinations(name, start_date)')
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
      stId
        ? admin
            .from('admissions')
            .select('id, admission_no, admission_date, status, reviewed_at, remarks, created_at')
            .eq('student_id', stId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      student?.class_id
        ? admin
            .from('online_classes')
            .select('id, title, meeting_date, start_time, end_time, platform, meeting_url, status, subjects(name), teachers(full_name)')
            .eq('class_id', student.class_id)
            .is('deleted_at', null)
            .order('meeting_date', { ascending: false })
            .order('start_time', { ascending: true })
            .limit(5)
        : Promise.resolve({ data: [] }),
      student?.class_id
        ? admin
            .from('examinations')
            .select('id, name, exam_type, start_date, end_date, status, examination_subjects(subjects(name))')
            .eq('class_id', student.class_id)
            .is('deleted_at', null)
            .in('status', ['scheduled', 'ongoing'])
            .order('start_date', { ascending: true })
            .limit(5)
        : Promise.resolve({ data: [] }),
      student?.class_id
        ? admin
            .from('class_subjects')
            .select('id, subjects!inner(name, code, deleted_at), teachers(full_name)')
            .eq('class_id', student.class_id)
            .is('subjects.deleted_at', null)
        : Promise.resolve({ data: [] }),
      admin
        .from('documents')
        .select('id, entity_id, file_url, created_at')
        .eq('entity_type', 'general')
        .eq('title', 'SYLLABUS_ITEM')
        .order('created_at', { ascending: false })
        .limit(30),
      admin
        .from('programs')
        .select('id, title, program_date, start_time, venue, status')
        .is('deleted_at', null)
        .order('program_date', { ascending: false })
        .limit(4),
      student?.class_id
        ? admin
            .from('teacher_assignments')
            .select('is_class_teacher, teachers(full_name, mobile, deleted_at)')
            .eq('class_id', student.class_id)
        : Promise.resolve({ data: [] }),
      admin
        .from('notifications')
        .select('id, title, message, reference_id, created_at, is_read')
        .eq('user_id', user.id)
        .eq('type', 'parent_link_otp')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    let classTeacher: { full_name: string; mobile?: string } | null = null;
    const directTeacher = (studentRaw as any)?.classes?.teachers;
    if (directTeacher?.full_name) {
      classTeacher = { full_name: directTeacher.full_name, mobile: directTeacher.mobile || '' };
    } else {
      for (const ta of (classTeacherRes as any)?.data || []) {
        const t = ta.teachers;
        if (!t?.full_name || t.deleted_at) continue;
        if (ta.is_class_teacher || !classTeacher) {
          classTeacher = { full_name: t.full_name, mobile: t.mobile || '' };
          if (ta.is_class_teacher) break;
        }
      }
    }

    const attList = attRes.data || [];
    const attStats = {
      total: attList.length,
      present: attList.filter((a: any) => a.status === 'present').length,
      absent: attList.filter((a: any) => a.status === 'absent').length,
      late: attList.filter((a: any) => a.status === 'late').length,
      on_leave: attList.filter((a: any) => a.status === 'leave').length,
    };
    const recentAttendance = attList.slice(0, 6);

    const hwSubMap = new Map<string, any>();
    for (const sub of hwSubsRes.data || []) {
      if (sub.homework_id) hwSubMap.set(sub.homework_id, sub);
    }

    const notices = (noticesRes.data || [])
      .filter((n: any) => n.target_audience === 'all' || n.target_audience === 'students' || (n.target_audience === 'class' && n.target_class_id === student?.class_id))
      .slice(0, 5);

    const recentHomework = (hwRes.data || []).map((h: any) => {
      const sub = hwSubMap.get(h.id);
      return {
        id: h.id,
        title: h.title,
        submission_deadline: h.submission_deadline,
        assigned_date: h.assigned_date || '',
        subject_name: h.subjects?.name || '',
        teacher_name: h.teachers?.full_name || '',
        submission_status: sub?.status || 'pending',
        grade: sub?.grade || '',
      };
    });
    const homeworkPendingCount = recentHomework.filter((h: any) => h.submission_status === 'pending').length;

    const recentResults = (resultsRes.data || []).map((r: any) => ({
      ...r,
      exam_name: r.examinations?.name || '',
      exam_date: r.examinations?.start_date || '',
    }));

    const onlineClasses = (ocRes.data || []).map((oc: any) => ({
      id: oc.id,
      title: oc.title,
      meeting_date: oc.meeting_date || '',
      start_time: oc.start_time || '',
      end_time: oc.end_time || '',
      platform: oc.platform || 'Online',
      scheduled_at: oc.meeting_date || '',
      status: oc.status || 'scheduled',
      meeting_link: oc.meeting_url || '',
      meeting_url: oc.meeting_url || '',
      subject_name: oc.subjects?.name || '',
      teacher_name: oc.teachers?.full_name || '',
    }));

    const upcomingExams = (examsRes.data || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      exam_type: e.exam_type || '',
      start_date: e.start_date,
      end_date: e.end_date || '',
      status: e.status,
      subjects: (e.examination_subjects || []).map((es: any) => es.subjects?.name).filter(Boolean).join(', '),
    }));

    const subjects = (subjectsRes.data || []).map((cs: any) => ({
      id: cs.id,
      name: cs.subjects?.name || '',
      code: cs.subjects?.code || '',
      teacher_name: cs.teachers?.full_name || '',
    }));

    const rawSyllabusDocs = (syllabusDocsRes.data || [])
      .map((doc: any) => {
        let parsed: Record<string, any> = {};
        try {
          parsed = JSON.parse(doc.file_url || '{}');
        } catch {
          parsed = {};
        }
        const clsId = String(parsed.class_id || (doc.entity_id !== '00000000-0000-0000-0000-000000000001' ? doc.entity_id : '') || '');
        return { doc, parsed, clsId };
      })
      .filter(({ clsId }) => !clsId || !student?.class_id || clsId === student.class_id)
      .slice(0, 6);

    const syllabusItems = await Promise.all(
      rawSyllabusDocs.map(async ({ doc, parsed, clsId }) => {
        const [coverPageUrl, bookPdfUrl, syllabusPdfUrl] = await Promise.all([
          resolveStorageUrl(parsed.cover_page_url),
          resolveStorageUrl(parsed.book_pdf_url),
          resolveStorageUrl(parsed.syllabus_pdf_url),
        ]);
        return {
          id: doc.id,
          class_id: clsId,
          class_name: parsed.class_name || student?.class_name || 'All Classes',
          subject_name: String(parsed.subject_name || ''),
          book_name: String(parsed.book_name || ''),
          author_name: String(parsed.author_name || ''),
          cover_page_url: coverPageUrl,
          book_pdf_url: bookPdfUrl,
          book_pdf_name: String(parsed.book_pdf_name || ''),
          syllabus_pdf_url: syllabusPdfUrl,
          syllabus_pdf_name: String(parsed.syllabus_pdf_name || ''),
          weekly_plan: String(parsed.weekly_plan || ''),
        };
      })
    );

    const upcomingPrograms = (programsRes.data || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      program_date: p.program_date,
      start_time: p.start_time || '',
      venue: p.venue || '',
      status: p.status || 'upcoming',
    }));

    const admissionRow: any = (admRes as any)?.data || null;
    const admissionDetails = admissionRow
      ? {
          id: admissionRow.id,
          reference_no: admissionRow.admission_no,
          official_admission_no: student?.admission_no || '',
          admission_date: admissionRow.admission_date || student?.admission_date || '',
          status: admissionRow.status || 'approved',
          approved_at: admissionRow.reviewed_at || '',
          remarks: admissionRow.remarks || '',
        }
      : {
          reference_no: '',
          official_admission_no: student?.admission_no || '',
          admission_date: student?.admission_date || '',
          status: student?.status === 'active' ? 'approved' : student?.status || 'approved',
          approved_at: '',
          remarks: '',
        };

    const parentOtpNotifications = (parentOtpRes?.data || [])
      .filter((n: any) => {
        const ageMs = Date.now() - new Date(n.created_at).getTime();
        return !Number.isNaN(ageMs) && ageMs <= 15 * 60 * 1000;
      })
      .map((n: any) => {
        const match =
          String(n.title || '').match(/(\d{6})/) ||
          String(n.message || '').match(/(\d{6})/);
        return {
          ...n,
          otp_code: match ? match[1] : '',
        };
      });

    return res.json({
      role: 'student',
      activeSession: activeSession?.name || '2026-2027',
      student,
      classTeacher,
      admissionDetails,
      feeStatus: {
        status: 'Madrasa Sponsored / Active Enrollment',
        note: 'No pending dues recorded. Contact Madrasa Office for scholarship or receipt inquiries.',
      },
      attendanceSummary: {
        ...attStats,
        percentage: attStats.total > 0 ? Math.round(((attStats.present + attStats.late) / attStats.total) * 100) : 0,
      },
      recentAttendance,
      recentHomework,
      homeworkPendingCount,
      recentResults,
      onlineClasses,
      upcomingExams,
      subjects,
      syllabusItems,
      upcomingPrograms,
      notices,
      parentOtpNotifications,
      committeeMembers,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard statistics' });
  }
});

export default router;
