import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import {
  FIXED_RESULT_SCHOOL_ADDRESS,
  FIXED_RESULT_SCHOOL_NAME,
  ResultCardData,
  ResultCardSubjectItem,
  ResultGradeCard,
  computeCardStats,
  exportResultCardPdf,
  exportResultCardPng,
} from './ResultGradeCard.tsx';
import { OFFICIAL_LOGO_URL } from './MadrasaLogo.tsx';
import { PrintModal } from './PrintModal.tsx';

interface SubjectRowState {
  uid: string;
  subject_id: string;
  score: string;
  max: number;
}

interface CreateResultBuilderProps {
  user: User;
  settings: MadrasaSettings | null;
  exams: any[];
  existingResults: any[];
  editingResult?: any | null;
  initialStudentId?: string;
  initialExamId?: string;
  onCancelEdit?: () => void;
  onSaved: (savedId: string, examId: string) => void;
}

function makeUid() {
  return Math.random().toString(36).slice(2, 10);
}

export const CreateResultBuilder: React.FC<CreateResultBuilderProps> = ({
  user,
  settings,
  exams,
  existingResults,
  editingResult,
  initialStudentId,
  initialExamId,
  onCancelEdit,
  onSaved,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [dbSessions, setDbSessions] = useState<{ id: string; name: string; is_active?: boolean }[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const schoolName = FIXED_RESULT_SCHOOL_NAME;
  const schoolAddress = FIXED_RESULT_SCHOOL_ADDRESS;

  const [selectedClassId, setSelectedClassId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');

  const [admNo, setAdmNo] = useState('');
  const [roll, setRoll] = useState('1');
  const [studentName, setStudentName] = useState('');
  const [division, setDivision] = useState('A');
  const [teacher, setTeacher] = useState('Class Teacher');
  const [academicYear, setAcademicYear] = useState('');
  const [examSession, setExamSession] = useState('Annual Examination 2026');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [issueTime, setIssueTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [photo, setPhoto] = useState('');
  const [customRemarks, setCustomRemarks] = useState('');

  const [subjectRows, setSubjectRows] = useState<SubjectRowState[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [allDbResults, setAllDbResults] = useState<any[]>(existingResults || []);

  // Track last populated class+editing id to avoid overwriting user edits
  const hydratedEditIdRef = useRef<string | null>(null);

  useEffect(() => {
    setAllDbResults((prev) => {
      if (!existingResults || existingResults.length === 0) return prev;
      const byId = new Map(prev.map((r) => [String(r.id), r]));
      for (const r of existingResults) byId.set(String(r.id), r);
      return Array.from(byId.values());
    });
  }, [existingResults]);

  useEffect(() => {
    let active = true;
    setLoadingData(true);
    Promise.all([
      apiRequest<{ classes: any[] }>('/api/classes'),
      apiRequest<{ students: any[] }>('/api/students'),
      apiRequest<{ subjects: any[]; classSubjects: any[] }>('/api/subjects'),
      apiRequest<{ sessions: { id: string; name: string; is_active?: boolean }[] }>('/api/settings'),
      apiRequest<{ results: any[] }>('/api/results').catch(() => ({ results: [] })),
    ])
      .then(([clsRes, stRes, subRes, settingsRes, allRes]) => {
        if (!active) return;
        const activeStudents = (stRes.students || []).filter(
          (s: any) => s.status !== 'pending' && s.status !== 'disabled'
        );
        const teacherClassIds = new Set(activeStudents.map((s: any) => String(s.class_id || '')).filter(Boolean));
        const availableClasses =
          user.role_slug === 'teacher' && teacherClassIds.size > 0
            ? (clsRes.classes || []).filter((c: any) => teacherClassIds.has(String(c.id)))
            : clsRes.classes || [];

        const sessionsList = settingsRes?.sessions || [];
        const activeSessionObj = sessionsList.find((s) => s.is_active) || sessionsList[0];

        setClasses(availableClasses);
        setStudents(activeStudents);
        setAllSubjects(subRes.subjects || []);
        setClassSubjects(subRes.classSubjects || []);
        setDbSessions(sessionsList);
        if (allRes?.results?.length) {
          setAllDbResults(allRes.results);
        }

        if (!editingResult) {
          if (activeSessionObj?.name) {
            setAcademicYear((prev) => prev || activeSessionObj.name);
          }
          if (availableClasses[0]) {
            setSelectedClassId((prev) => prev || String(availableClasses[0].id));
          }
        }
      })
      .catch((e: any) => {
        if (active) setErr(e?.message || 'Failed to load database classes, students, and subjects.');
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    return () => {
      active = false;
    };
  }, [user.role_slug]);

  const classStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .filter((s) => {
        if (selectedClassId && String(s.class_id || '') !== String(selectedClassId)) return false;
        if (!q) return true;
        return (
          String(s.full_name || '').toLowerCase().includes(q) ||
          String(s.student_code || '').toLowerCase().includes(q) ||
          String(s.admission_no || '').toLowerCase().includes(q) ||
          String(s.admission_number || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
  }, [students, selectedClassId, studentSearch]);

  const selectedClassObj = useMemo(
    () => classes.find((c) => String(c.id) === String(selectedClassId)) || null,
    [classes, selectedClassId]
  );

  // Real subjects assigned to selected class from DB
  const assignedSubjectsForClass = useMemo<{ id: string; name: string; code: string; total_marks: number }[]>(() => {
    if (!selectedClassId) return [];
    const mapped = classSubjects.filter((cs) => String(cs.class_id) === String(selectedClassId));
    if (mapped.length > 0) {
      return mapped.map((cs) => ({
        id: String(cs.subject_id),
        name: String(cs.subject_name || ''),
        code: String(cs.subject_code || ''),
        total_marks: Number(cs.total_marks || 50),
      }));
    }
    if (Array.isArray(selectedClassObj?.subjects) && selectedClassObj.subjects.length > 0) {
      return selectedClassObj.subjects.map((cs: any) => ({
        id: String(cs.subject_id),
        name: String(cs.subject_name || ''),
        code: String(cs.subject_code || ''),
        total_marks: Number(cs.total_marks || 50),
      }));
    }
    return [];
  }, [selectedClassId, classSubjects, selectedClassObj]);

  const otherDbSubjects = useMemo(() => {
    const assignedIds = new Set(assignedSubjectsForClass.map((s) => s.id));
    return allSubjects
      .filter((s) => !assignedIds.has(String(s.id)))
      .map((s) => ({
        id: String(s.id),
        name: s.name,
        code: s.code,
        total_marks: Number(s.total_marks || 50),
      }));
  }, [allSubjects, assignedSubjectsForClass]);

  const classExams = useMemo(
    () => exams.filter((e) => !selectedClassId || String(e.class_id) === String(selectedClassId)),
    [exams, selectedClassId]
  );

  // Hydrate when editing an existing saved result
  useEffect(() => {
    if (!editingResult || loadingData) return;
    if (hydratedEditIdRef.current === String(editingResult.id)) return;
    hydratedEditIdRef.current = String(editingResult.id);

    const meta = editingResult.card_meta || {};
    const activeDbSessionName = (dbSessions.find((s) => s.is_active) || dbSessions[0])?.name || '';
    setSelectedClassId(String(editingResult.class_id || ''));
    setSelectedStudentId(String(editingResult.student_id || ''));
    setSelectedExamId(String(editingResult.examination_id || ''));
    setStudentSearch('');
    setAdmNo(meta.admNo || editingResult.admission_no || editingResult.student_code || '');
    setRoll(String(meta.roll ?? editingResult.position ?? 1));
    setStudentName(meta.studentName || editingResult.student_name || '');
    setDivision(meta.division || 'A');
    setTeacher(meta.teacher || 'Class Teacher');
    setAcademicYear(meta.academicYear || editingResult.session_name || activeDbSessionName);
    setExamSession(meta.examSession || editingResult.exam_name || 'Annual Examination 2026');
    setIssueDate(meta.issueDate || editingResult.exam_date || new Date().toISOString().slice(0, 10));
    setIssueTime(meta.issueTime || '');
    setPhoto(meta.photo || editingResult.photo_url || '');
    setCustomRemarks(meta.remarks || editingResult.teacher_remarks || '');

    const savedSubs: SubjectRowState[] = (editingResult.subjects || []).map((s: any) => ({
      uid: makeUid(),
      subject_id: String(s.subject_id || ''),
      score: String(s.obtained_marks ?? ''),
      max: Number(s.total_marks || 50),
    }));
    setSubjectRows(savedSubs);
  }, [editingResult, loadingData, dbSessions]);

  // Apply defaults when class changes (in Create mode)
  const applyClassSubjects = (clsId: string, preserveScores = false, examObj?: any) => {
    const cls = classes.find((c) => String(c.id) === String(clsId));
    if (cls) {
      setTeacher(
        cls.class_teacher_name && cls.class_teacher_name !== 'Unassigned'
          ? cls.class_teacher_name
          : 'Class Teacher'
      );
      if (cls.session_name) {
        setAcademicYear(cls.session_name);
      }
    }

    const examSubs: { id: string; total_marks: number }[] =
      Array.isArray(examObj?.subjects) && examObj.subjects.length > 0
        ? examObj.subjects.map((es: any) => ({
            id: String(es.subject_id),
            total_marks: Number(es.total_marks || 50),
          }))
        : [];

    const mapped = classSubjects.filter((cs) => String(cs.class_id) === String(clsId));
    const source: { id: string; total_marks: number }[] =
      examSubs.length > 0
        ? examSubs
        : mapped.length > 0
          ? mapped.map((cs) => ({
              id: String(cs.subject_id),
              total_marks: Number(cs.total_marks || 50),
            }))
          : allSubjects.slice(0, 4).map((s) => ({
              id: String(s.id),
              total_marks: Number(s.total_marks || 50),
            }));

    if (!preserveScores) {
      setSubjectRows(
        source.map((s) => ({
          uid: makeUid(),
          subject_id: s.id,
          score: '',
          max: [25, 50, 75, 100].includes(s.total_marks) ? s.total_marks : 50,
        }))
      );
    }
  };

  const applyStudentSelection = (stId: string, list?: any[], overrideExamId?: string) => {
    const pool = list && list.length > 0 ? list : students;
    const st = pool.find((s) => String(s.id) === String(stId)) || students.find((s) => String(s.id) === String(stId));
    if (!st) return;

    const targetClassId = String(st.class_id || selectedClassId || '');
    const classChanged = Boolean(targetClassId && targetClassId !== String(selectedClassId));
    if (classChanged) {
      setSelectedClassId(targetClassId);
    }

    const cls = classes.find((c) => String(c.id) === targetClassId) || null;
    const matchingClassExams = exams.filter((e) => !targetClassId || String(e.class_id) === targetClassId);
    const studentSavedResults = allDbResults.filter((r) => String(r.student_id) === String(st.id));
    const classSavedResults = allDbResults.filter((r) => targetClassId && String(r.class_id) === targetClassId);

    // Resolve existing exam for this student/class from DB
    const requestedExamId = overrideExamId !== undefined ? overrideExamId : selectedExamId;
    let pickedExam =
      (requestedExamId
        ? matchingClassExams.find((e) => String(e.id) === String(requestedExamId))
        : null) || null;

    if (!pickedExam && matchingClassExams.length > 0) {
      // Prefer exam matching student's academic session, or latest saved result exam, or first class exam
      const savedExamIds = new Set(studentSavedResults.map((r) => String(r.examination_id)));
      pickedExam =
        matchingClassExams.find((e) => st.academic_session_id && String(e.academic_session_id) === String(st.academic_session_id)) ||
        matchingClassExams.find((e) => savedExamIds.has(String(e.id))) ||
        matchingClassExams[0];
    }

    const resolvedExamId = pickedExam ? String(pickedExam.id) : '';
    const savedForExam =
      studentSavedResults.find((r) => resolvedExamId && String(r.examination_id) === resolvedExamId) ||
      studentSavedResults[0] ||
      null;

    // Update subjects when class changes or when marks are still untouched and exam has subjects
    const hasEnteredMarks = subjectRows.some((r) => r.score !== '');
    if (classChanged) {
      applyClassSubjects(targetClassId, false, pickedExam);
    } else if (!editingResult && !hasEnteredMarks && pickedExam?.subjects?.length) {
      applyClassSubjects(targetClassId, false, pickedExam);
    }

    setSelectedStudentId(String(st.id));
    setAdmNo(st.admission_number || st.admission_no || st.student_code || savedForExam?.card_meta?.admNo || '');
    setStudentName(st.full_name || '');
    setPhoto(st.photo_url || savedForExam?.card_meta?.photo || '');

    // Compute deterministic Roll No within the student's class
    const classRoster = students
      .filter((x) => !targetClassId || String(x.class_id || '') === targetClassId)
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
    const stIdx = classRoster.findIndex((x) => String(x.id) === String(st.id));
    const dbRoll =
      st.roll_no ||
      savedForExam?.card_meta?.roll ||
      (stIdx >= 0 ? stIdx + 1 : 1);
    setRoll(String(dbRoll));

    // Resolve Class Teacher from DB (student join -> class record -> saved result -> default)
    const dbTeacher =
      (cls?.class_teacher_name && cls.class_teacher_name !== 'Unassigned' ? cls.class_teacher_name : '') ||
      (st.class_teacher_name && st.class_teacher_name !== 'Unassigned' ? st.class_teacher_name : '') ||
      savedForExam?.card_meta?.teacher ||
      'Class Teacher';
    setTeacher(dbTeacher);

    // Resolve Division / Section from DB
    const dbDivision =
      st.division ||
      st.section ||
      savedForExam?.card_meta?.division ||
      classSavedResults.find((r) => r.card_meta?.division)?.card_meta?.division ||
      cls?.division ||
      cls?.section ||
      'A';
    setDivision(String(dbDivision));

    // Resolve Existing Exam & Exam Session
    setSelectedExamId(resolvedExamId);
    if (pickedExam?.name) {
      setExamSession(pickedExam.name);
    } else if (savedForExam?.card_meta?.examSession || savedForExam?.exam_name) {
      setExamSession(savedForExam.card_meta?.examSession || savedForExam.exam_name);
    } else {
      setExamSession(`Annual Examination ${new Date().getFullYear()}`);
    }

    // Resolve Academic Year strictly from DB sessions
    const activeDbSessionName = (dbSessions.find((s) => s.is_active) || dbSessions[0])?.name || '';
    const sessionFromStudentId = dbSessions.find(
      (s) => st.academic_session_id && String(s.id) === String(st.academic_session_id)
    )?.name;
    const resolvedAcademicYear =
      st.session_name ||
      sessionFromStudentId ||
      pickedExam?.session_name ||
      cls?.session_name ||
      activeDbSessionName;
    if (resolvedAcademicYear) {
      setAcademicYear(resolvedAcademicYear);
    }
  };

  // Initialize first class subjects + student (or pre-selected pending student/exam) once data finishes loading
  useEffect(() => {
    if (loadingData || editingResult) return;

    if (initialStudentId) {
      const targetSt = students.find((s) => String(s.id) === String(initialStudentId));
      if (targetSt) {
        const clsId = String(targetSt.class_id || selectedClassId || '');
        const pickedExam = initialExamId
          ? exams.find((e) => String(e.id) === String(initialExamId))
          : exams.find((e) => String(e.class_id) === clsId);
        if (clsId) setSelectedClassId(clsId);
        applyClassSubjects(clsId, false, pickedExam);
        applyStudentSelection(String(targetSt.id), students, pickedExam ? String(pickedExam.id) : initialExamId);
        return;
      }
    }

    if (!selectedClassId) return;
    if (subjectRows.length === 0) {
      applyClassSubjects(selectedClassId);
    }
    if (!selectedStudentId) {
      const firstSt = students
        .filter((s) => String(s.class_id || '') === String(selectedClassId))
        .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))[0];
      if (firstSt) {
        applyStudentSelection(String(firstSt.id), students);
      }
    }
  }, [loadingData, selectedClassId, editingResult, initialStudentId, initialExamId]);

  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    if (!newClassId) {
      setSelectedExamId('');
      setSelectedStudentId('');
      setAdmNo('');
      setStudentName('');
      setPhoto('');
      setDivision('A');
      setRoll('1');
      setTeacher('Class Teacher');
      return;
    }
    const matchingExams = exams.filter((e) => String(e.class_id) === String(newClassId));
    const defaultExam = matchingExams[0] || null;
    setSelectedExamId(defaultExam ? String(defaultExam.id) : '');
    if (defaultExam?.name) {
      setExamSession(defaultExam.name);
    }
    applyClassSubjects(newClassId, false, defaultExam);
    const matching = students
      .filter((s) => String(s.class_id || '') === String(newClassId))
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
    if (matching[0]) {
      applyStudentSelection(String(matching[0].id), matching, defaultExam ? String(defaultExam.id) : '');
    } else {
      setSelectedStudentId('');
      setAdmNo('');
      setStudentName('');
      setPhoto('');
      setDivision('A');
      setRoll('1');
    }
  };

  const handleReset = () => {
    hydratedEditIdRef.current = null;
    if (onCancelEdit) onCancelEdit();
    setErr('');
    setMsg('');
    setCustomRemarks('');
    setSelectedExamId('');
    setIssueDate(new Date().toISOString().slice(0, 10));
    setIssueTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    if (selectedClassId) {
      const matchingExams = exams.filter((e) => String(e.class_id) === String(selectedClassId));
      const defaultExam = matchingExams[0] || null;
      applyClassSubjects(selectedClassId, false, defaultExam);
      if (classStudents[0]) {
        applyStudentSelection(String(classStudents[0].id), classStudents, defaultExam ? String(defaultExam.id) : '');
      }
    }
  };

  const handleAddSubjectRow = () => {
    const usedIds = new Set(subjectRows.map((r) => r.subject_id));
    const pool = [...assignedSubjectsForClass, ...otherDbSubjects];
    const next = pool.find((s) => !usedIds.has(s.id)) || pool[0];
    if (!next) {
      setErr('No subjects found in database. Add subjects in the Subjects module first.');
      return;
    }
    const maxOpt = [25, 50, 75, 100].includes(next.total_marks) ? next.total_marks : 50;
    setSubjectRows((prev) => [
      ...prev,
      { uid: makeUid(), subject_id: next.id, score: '', max: maxOpt },
    ]);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadFile(file, 'student-photos');
      setPhoto(uploaded.url);
    } catch (uploadErr: any) {
      // Fallback to compressed local DataURL only if image is reasonably small (< 1.5MB)
      if (file.size <= 1.5 * 1024 * 1024 && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (typeof ev.target?.result === 'string') {
            setPhoto(ev.target.result);
          }
        };
        reader.readAsDataURL(file);
      } else {
        setErr(uploadErr?.message || 'Could not upload photo. Please select a smaller JPG or PNG photo.');
      }
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // Resolve real subject names & codes from DB for live card
  const subjectLookup = useMemo(() => {
    const map = new Map<string, { name: string; code: string; total_marks: number }>();
    for (const s of allSubjects) {
      map.set(String(s.id), {
        name: s.name,
        code: s.code,
        total_marks: Number(s.total_marks || 50),
      });
    }
    for (const cs of classSubjects) {
      map.set(String(cs.subject_id), {
        name: cs.subject_name,
        code: cs.subject_code,
        total_marks: Number(cs.total_marks || 50),
      });
    }
    return map;
  }, [allSubjects, classSubjects]);

  const cardSubjects: ResultCardSubjectItem[] = useMemo(() => {
    return subjectRows
      .filter((r) => Boolean(r.subject_id))
      .map((r) => {
        const meta = subjectLookup.get(r.subject_id);
        return {
          subject_id: r.subject_id,
          subject_code: meta?.code || '',
          name: meta?.name || 'Database Subject',
          score: Number(r.score || 0),
          max: Number(r.max || 50),
        };
      });
  }, [subjectRows, subjectLookup]);

  const stats = useMemo(() => computeCardStats(cardSubjects), [cardSubjects]);

  const savedStudentIdsForCurrentExam = useMemo(() => {
    const targetExamName = examSession.trim().toLowerCase();
    const set = new Set<string>();
    for (const r of allDbResults) {
      if (String(r.class_id) !== String(selectedClassId)) continue;
      const matchesExam = selectedExamId
        ? String(r.examination_id) === String(selectedExamId)
        : String(r.exam_name || '').trim().toLowerCase() === targetExamName;
      if (matchesExam) set.add(String(r.student_id));
    }
    return set;
  }, [allDbResults, selectedClassId, selectedExamId, examSession]);

  const currentExamObj = useMemo(
    () => exams.find((e) => String(e.id) === String(selectedExamId)) || null,
    [exams, selectedExamId]
  );

  // Compute live dynamic rank among classmates saved in the same exam (highest marks first, tie-aware)
  const liveRankInfo = useMemo(() => {
    const targetExamName = examSession.trim().toLowerCase();
    const peers = allDbResults.filter(
      (r) =>
        String(r.class_id) === String(selectedClassId) &&
        (selectedExamId
          ? String(r.examination_id) === String(selectedExamId)
          : String(r.exam_name || '').trim().toLowerCase() === targetExamName) &&
        String(r.student_id) !== String(selectedStudentId)
    );

    const roundedPct = Math.round(stats.overallPercent * 100) / 100;
    const combined = [
      ...peers.map((p) => ({
        student_id: String(p.student_id),
        total: Number(p.obtained_marks || 0),
        pct: Math.round(Number(p.percentage || 0) * 100) / 100,
      })),
      {
        student_id: String(selectedStudentId || 'current'),
        total: stats.total,
        pct: roundedPct,
      },
    ].sort((a, b) => b.total - a.total || b.pct - a.pct);

    let rank = 1;
    let prevTotal: number | null = null;
    let prevPct: number | null = null;
    for (let i = 0; i < combined.length; i += 1) {
      const item = combined[i];
      if (prevTotal === null || item.total !== prevTotal || item.pct !== prevPct) {
        rank = i + 1;
        prevTotal = item.total;
        prevPct = item.pct;
      }
      if (item.student_id === String(selectedStudentId || 'current')) {
        return { rank, totalStudents: combined.length };
      }
    }
    return {
      rank: 1,
      totalStudents: combined.length,
    };
  }, [allDbResults, selectedClassId, selectedExamId, examSession, selectedStudentId, stats]);

  const liveCardData: ResultCardData = useMemo(
    () => ({
      schoolName,
      schoolAddress,
      logoUrl: settings?.logo_url || OFFICIAL_LOGO_URL,
      academicYear,
      examSession,
      issueDate,
      issueTime,
      className: selectedClassObj?.name || 'Class',
      admNo: admNo || '-',
      studentName: studentName || 'Select Student',
      division: division || 'A',
      roll: roll || 1,
      teacher: teacher || 'Class Teacher',
      photo,
      remarks: customRemarks,
      rank: liveRankInfo.rank,
      totalStudents: liveRankInfo.totalStudents,
      subjects: cardSubjects,
    }),
    [
      schoolName,
      schoolAddress,
      settings?.logo_url,
      academicYear,
      examSession,
      issueDate,
      issueTime,
      selectedClassObj,
      admNo,
      studentName,
      division,
      roll,
      teacher,
      photo,
      customRemarks,
      liveRankInfo,
      cardSubjects,
    ]
  );

  const handleSaveToDatabase = async () => {
    setErr('');
    setMsg('');

    if (!selectedClassId) {
      setErr('Please select a class from the database.');
      return;
    }
    if (!selectedStudentId) {
      setErr('Please select a student from the database.');
      return;
    }
    const validRows = subjectRows.filter((r) => Boolean(r.subject_id));
    if (validRows.length === 0) {
      setErr('Please add at least one real database subject.');
      return;
    }

    const seen = new Set<string>();
    for (const r of validRows) {
      if (seen.has(r.subject_id)) {
        const subName = subjectLookup.get(r.subject_id)?.name || 'Subject';
        setErr(`Duplicate subject "${subName}" selected. Remove duplicates before saving.`);
        return;
      }
      seen.add(r.subject_id);
      const val = Number(r.score || 0);
      if (Number.isNaN(val) || val < 0 || val > r.max) {
        const subName = subjectLookup.get(r.subject_id)?.name || 'Subject';
        setErr(`Marks for "${subName}" must be between 0 and ${r.max}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        class_id: selectedClassId,
        student_id: selectedStudentId,
        examination_id: selectedExamId || null,
        subjects: validRows.map((r) => ({
          subject_id: r.subject_id,
          obtained_marks: Number(r.score || 0),
          total_marks: Number(r.max || 50),
        })),
        card_meta: {
          schoolName,
          schoolAddress,
          admNo,
          roll: Number(roll || 1),
          studentName,
          division,
          teacher,
          academicYear,
          examSession: examSession.trim() || 'Annual Examination 2026',
          issueDate,
          issueTime,
          photo,
          remarks: customRemarks.trim(),
        },
      };

      const res = editingResult?.id
        ? await apiRequest<{ success: boolean; id: string; examination_id: string }>(
            `/api/results/${editingResult.id}/card`,
            {
              method: 'PUT',
              body: JSON.stringify(payload),
            }
          )
        : await apiRequest<{ success: boolean; id: string; examination_id: string }>(
            '/api/results/card',
            {
              method: 'POST',
              body: JSON.stringify(payload),
            }
          );

      setMsg(editingResult ? 'Result updated in database!' : 'Result saved to Result Section!');
      hydratedEditIdRef.current = null;
      onSaved(res.id, res.examination_id);
    } catch (e: any) {
      setErr(e?.message || 'Failed to save result to database.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!cardRef.current || exporting) return;
    setExporting('pdf');
    setErr('');
    try {
      await exportResultCardPdf(
        cardRef.current,
        `${studentName || 'result-card'}-${admNo || 'madrasa'}`
      );
    } catch (e: any) {
      setErr(e?.message || 'Failed to download PDF.');
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadPng = async () => {
    if (!cardRef.current || exporting) return;
    setExporting('png');
    setErr('');
    try {
      await exportResultCardPng(
        cardRef.current,
        `${studentName || 'result-card'}-${admNo || 'madrasa'}`
      );
    } catch (e: any) {
      setErr(e?.message || 'Failed to download PNG.');
    } finally {
      setExporting(null);
    }
  };

  if (loadingData) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center text-xs text-[#737373] flex flex-col items-center gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-[#16a34a]" />
        <span>Loading real database classes, students, and subjects...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
          {err}
        </div>
      )}

      <div
        className="rounded-3xl p-4 sm:p-5 grid grid-cols-1 xl:grid-cols-[410px_1fr] gap-5 items-start text-[#e5e7eb]"
        style={{
          background:
            'radial-gradient(circle at top left, rgba(34,197,94,0.16), transparent 28%), radial-gradient(circle at top right, rgba(37,99,235,0.18), transparent 28%), linear-gradient(135deg, #0f172a, #111827, #1e293b)',
        }}
      >
        {/* Left Editable Builder Panel */}
        <aside className="rounded-2xl border border-white/15 bg-white/[0.08] backdrop-blur-md p-4 sm:p-5 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-36px)] xl:overflow-y-auto sidebar-scroll">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                {editingResult ? 'Edit Result Card' : 'Create Result Card'}
              </h2>
              <p className="text-xs text-[#94a3b8] mt-0.5">
                Live Grade Card connected to real Madrasa database classes, students &amp; subjects.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[11px] font-bold shrink-0">
              {editingResult ? 'Editing' : 'DB Live'}
            </span>
          </div>

          {/* 1. School Details (Fixed Institutional Header — Read-only) */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                School Details
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-slate-300">
                Official Fixed Header
              </span>
            </div>
            <div className="p-3 rounded-xl border border-white/10 bg-white/[0.05] space-y-1">
              <div className="text-xs font-extrabold text-white">{schoolName}</div>
              <div className="text-[11px] text-slate-300 leading-relaxed">{schoolAddress}</div>
            </div>
          </div>

          {/* 2. Class & Student Selection (From Database) */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
              Class &amp; Student Selection (Database)
            </h3>

            <div>
              <label className="block text-[11px] font-bold text-slate-200 mb-1">
                Select Class *
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              >
                <option value="" className="text-black">
                  -- All Classes ({students.length} Students) --
                </option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id} className="text-black">
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-200 mb-1">
                Search Student
              </label>
              <input
                type="text"
                placeholder="Type student name or ID..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[11px] font-bold text-slate-200">
                  Select Student * ({classStudents.length})
                </label>
                {selectedClassId && (
                  <span className="text-[10px] font-semibold text-emerald-300">
                    {savedStudentIdsForCurrentExam.size} / {classStudents.length} Created
                  </span>
                )}
              </div>
              <select
                value={selectedStudentId}
                onChange={(e) => applyStudentSelection(e.target.value, classStudents)}
                className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              >
                <option value="" className="text-black">
                  {classStudents.length === 0
                    ? 'No students in this class'
                    : '-- Select Database Student --'}
                </option>
                {classStudents.map((s) => {
                  const hasSaved = savedStudentIdsForCurrentExam.has(String(s.id));
                  return (
                    <option key={s.id} value={s.id} className="text-black">
                      {hasSaved ? '✓ ' : '○ '}
                      {s.full_name} ({s.admission_no || s.student_code})
                      {hasSaved ? ' [Saved]' : ' [Pending]'}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* 3. Student Data Entry */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
              Student Data Entry
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">Adm No</label>
                <input
                  type="text"
                  value={admNo}
                  onChange={(e) => setAdmNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">Roll No</label>
                <input
                  type="text"
                  value={roll}
                  onChange={(e) => setRoll(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-200 mb-1">Student Name</label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">Division</label>
                <input
                  type="text"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">
                  Class Teacher
                </label>
                <input
                  type="text"
                  value={teacher}
                  onChange={(e) => setTeacher(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">
                  Academic Year (Database)
                </label>
                <select
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
                >
                  {dbSessions.length === 0 && !academicYear && (
                    <option value="" className="text-black">
                      No session in database
                    </option>
                  )}
                  {academicYear && !dbSessions.some((s) => s.name === academicYear) && (
                    <option value={academicYear} className="text-black">
                      {academicYear}
                    </option>
                  )}
                  {dbSessions.map((sess) => (
                    <option key={sess.id} value={sess.name} className="text-black">
                      {sess.name}{sess.is_active ? ' (Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">
                  Existing Exam (Optional)
                </label>
                <select
                  value={selectedExamId}
                  onChange={(e) => {
                    const eid = e.target.value;
                    setSelectedExamId(eid);
                    const found = classExams.find((x) => String(x.id) === eid);
                    if (found?.name) setExamSession(found.name);
                    if (found?.session_name) setAcademicYear(found.session_name);
                    if (found && !editingResult && !subjectRows.some((r) => r.score !== '') && found.subjects?.length) {
                      applyClassSubjects(selectedClassId || String(found.class_id || ''), false, found);
                    }
                    const savedForThisExam = allDbResults.find(
                      (r) => String(r.student_id) === String(selectedStudentId) && String(r.examination_id) === eid
                    );
                    if (savedForThisExam?.card_meta) {
                      if (savedForThisExam.card_meta.roll) setRoll(String(savedForThisExam.card_meta.roll));
                      if (savedForThisExam.card_meta.division) setDivision(String(savedForThisExam.card_meta.division));
                      if (savedForThisExam.card_meta.teacher) setTeacher(String(savedForThisExam.card_meta.teacher));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
                >
                  <option value="" className="text-black">
                    -- New / Custom Session --
                  </option>
                  {classExams.map((ex) => (
                    <option key={ex.id} value={ex.id} className="text-black">
                      {ex.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-200 mb-1">Exam Session</label>
              <input
                type="text"
                value={examSession}
                onChange={(e) => setExamSession(e.target.value)}
                placeholder="e.g. Annual Examination 2026"
                className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">Issue Date</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">Issue Time</label>
                <input
                  type="text"
                  value={issueTime}
                  onChange={(e) => setIssueTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-200 mb-1">
                Upload Student Photo
              </label>
              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-white/25 bg-white/[0.06] text-xs text-slate-200 cursor-pointer hover:bg-white/10">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingPhoto ? 'Uploading photo...' : 'Choose Photo (or keep Student DB Photo)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-200 mb-1">
                Teacher Remarks (Leave blank for automatic remark)
              </label>
              <input
                type="text"
                value={customRemarks}
                onChange={(e) => setCustomRemarks(e.target.value)}
                placeholder="Auto-generated based on percentage..."
                className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white placeholder:text-slate-400"
              />
            </div>

            <div className="p-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-[11px] leading-relaxed text-slate-300">
              {currentExamObj?.results_published ? (
                <span className="text-emerald-300">
                  <strong>Uploaded Exam:</strong> Saving updates this student and recalculates all class ranks &amp; percentages automatically.
                </span>
              ) : (
                <span>
                  <strong className="text-amber-300">Draft Mode:</strong> Results stay in Draft until all students&apos; results are created. Once all students are ready, click <strong>Upload Result</strong> on the Results tab.
                </span>
              )}
            </div>
          </div>

          {/* 4. Subjects & Marks (Strictly Real Database Subjects) */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                Subjects &amp; Marks (Real DB)
              </h3>
              <span className="text-[10px] text-emerald-300 font-semibold">
                {assignedSubjectsForClass.length > 0
                  ? `${assignedSubjectsForClass.length} class subjects`
                  : `${allSubjects.length} DB subjects`}
              </span>
            </div>

            <div className="space-y-2">
              {subjectRows.map((row) => (
                <div
                  key={row.uid}
                  className="grid grid-cols-[1.5fr_0.75fr_0.7fr_auto] gap-2 items-center"
                >
                  <select
                    value={row.subject_id}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const meta = subjectLookup.get(nextId);
                      const nextMax =
                        meta && [25, 50, 75, 100].includes(meta.total_marks)
                          ? meta.total_marks
                          : row.max;
                      setSubjectRows((prev) =>
                        prev.map((item) =>
                          item.uid === row.uid
                            ? { ...item, subject_id: nextId, max: nextMax }
                            : item
                        )
                      );
                    }}
                    className="w-full px-2.5 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white"
                  >
                    <option value="" className="text-black">
                      Select Subject
                    </option>
                    {assignedSubjectsForClass.length > 0 && (
                      <optgroup label="Assigned to Selected Class" className="text-black">
                        {assignedSubjectsForClass.map((s) => (
                          <option key={s.id} value={s.id} className="text-black">
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otherDbSubjects.length > 0 && (
                      <optgroup label="Other Database Subjects" className="text-black">
                        {otherDbSubjects.map((s) => (
                          <option key={s.id} value={s.id} className="text-black">
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  <input
                    type="number"
                    min={0}
                    max={row.max}
                    placeholder="Marks"
                    value={row.score}
                    onChange={(e) =>
                      setSubjectRows((prev) =>
                        prev.map((item) =>
                          item.uid === row.uid ? { ...item, score: e.target.value } : item
                        )
                      )
                    }
                    className="w-full px-2.5 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white font-mono-num"
                  />

                  <select
                    value={row.max}
                    onChange={(e) =>
                      setSubjectRows((prev) =>
                        prev.map((item) =>
                          item.uid === row.uid
                            ? { ...item, max: Number(e.target.value || 50) }
                            : item
                        )
                      )
                    }
                    className="w-full px-2 py-2 rounded-xl border border-white/15 bg-white/10 text-xs text-white font-mono-num"
                  >
                    <option value={25} className="text-black">
                      25
                    </option>
                    <option value={50} className="text-black">
                      50
                    </option>
                    <option value={75} className="text-black">
                      75
                    </option>
                    <option value={100} className="text-black">
                      100
                    </option>
                  </select>

                  <button
                    type="button"
                    onClick={() =>
                      setSubjectRows((prev) => prev.filter((item) => item.uid !== row.uid))
                    }
                    className="p-2 rounded-xl bg-white/10 hover:bg-red-500/30 text-white"
                    title="Remove subject"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddSubjectRow}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white"
            >
              <Plus className="w-3.5 h-3.5" /> Add Subject
            </button>
            <p className="text-[11px] text-[#94a3b8]">
              Only subjects saved in the Madrasa Subjects database appear here. Full marks options: 25, 50, 75, 100.
            </p>
          </div>

          {/* 5. Actions */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveToDatabase}
                className="col-span-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] text-white text-xs font-extrabold shadow-lg hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>
                  {saving
                    ? 'Saving to Database...'
                    : editingResult
                      ? 'Update Saved Result'
                      : 'Save Result to Result Section'}
                </span>
              </button>

              <button
                type="button"
                disabled={exporting !== null}
                onClick={handleDownloadPdf}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#3b82f6] text-white text-xs font-bold hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{exporting === 'pdf' ? 'Saving PDF...' : 'Download PDF'}</span>
              </button>

              <button
                type="button"
                disabled={exporting !== null}
                onClick={handleDownloadPng}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white text-xs font-bold hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exporting === 'png' ? 'Saving PNG...' : 'Download PNG'}</span>
              </button>

              <button
                type="button"
                onClick={() => setPrintPreviewOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold cursor-pointer"
              >
                {editingResult ? <X className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>{editingResult ? 'Cancel Edit' : 'Reset Form'}</span>
              </button>
            </div>
          </div>

          {/* 6. Performance Summary */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
              Performance Summary
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                <div className="text-[11px] font-bold text-[#94a3b8]">Total</div>
                <div className="text-xl font-extrabold text-white font-mono-num mt-0.5">
                  {stats.total}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                <div className="text-[11px] font-bold text-[#94a3b8]">Percentage</div>
                <div className="text-xl font-extrabold text-white font-mono-num mt-0.5">
                  {stats.overallPercent.toFixed(2)}%
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                <div className="text-[11px] font-bold text-[#94a3b8]">Grade</div>
                <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
                  {stats.overallGrade}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                <div className="text-[11px] font-bold text-[#94a3b8]">Rank</div>
                <div className="text-xl font-extrabold text-white font-mono-num mt-0.5">
                  {liveRankInfo.rank}/{liveRankInfo.totalStudents}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Live Printable Result Card Preview */}
        <main className="rounded-2xl border border-white/15 bg-white/[0.08] p-3 sm:p-5 overflow-x-auto">
          <div className="min-w-[680px]">
            <ResultGradeCard data={liveCardData} cardRef={cardRef} />
          </div>
        </main>
      </div>

      {/* Print Modal Preview (Clean standalone A4 Print/PDF) */}
      <PrintModal
        open={printPreviewOpen}
        standalone={true}
        title="Grade Card"
        subtitle={`${liveCardData.studentName} (${liveCardData.admNo})`}
        settings={settings}
        onClose={() => setPrintPreviewOpen(false)}
        headerActions={
          <button
            type="button"
            disabled={exporting !== null}
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#ea580c] text-white text-sm font-medium hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span>Download PNG</span>
          </button>
        }
      >
        <ResultGradeCard data={liveCardData} />
      </PrintModal>
    </div>
  );
};
