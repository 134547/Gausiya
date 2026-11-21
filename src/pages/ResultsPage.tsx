import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Layers,
  PlusCircle,
  Power,
  Printer,
  Save,
  Trash2,
  Trophy,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { PrintModal } from '../components/PrintModal.tsx';
import { ScaledA4Viewport } from '../components/ScaledA4Viewport.tsx';
import { CreateResultBuilder } from '../components/CreateResultBuilder.tsx';
import {
  ResultGradeCard,
  buildCardDataFromSavedResult,
  exportResultCardPdf,
  exportResultCardPng,
} from '../components/ResultGradeCard.tsx';

interface ResultsPageProps {
  user: User;
  settings: MadrasaSettings | null;
  onSettingsUpdated?: (s: MadrasaSettings) => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({ user, settings, onSettingsUpdated }) => {
  const canEnterMarks = user.role_slug === 'super_admin' || user.role_slug === 'teacher';
  const isAdmin = user.role_slug === 'super_admin';
  const [resultsOpen, setResultsOpen] = useState<boolean>(settings?.results_open !== false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [tab, setTab] = useState<'results' | 'create' | 'marks'>('results');
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedExamKey, setSelectedExamKey] = useState<string>('all');
  const [marksExamId, setMarksExamId] = useState<string>('');
  const [results, setResults] = useState<any[]>([]);

  // Marks sheet state
  const [sheet, setSheet] = useState<any>(null);
  const [marksGrid, setMarksGrid] = useState<Record<string, number>>({});
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});

  // View / Edit / Delete Grade Card state
  const [viewResult, setViewResult] = useState<any>(null);
  const [editingResult, setEditingResult] = useState<any>(null);
  const [preselectStudentId, setPreselectStudentId] = useState('');
  const [preselectExamId, setPreselectExamId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadingExamId, setUploadingExamId] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState<'publish' | 'unpublish' | null>(null);
  const [downloadingViewPng, setDownloadingViewPng] = useState(false);
  const [downloadingViewPdf, setDownloadingViewPdf] = useState(false);
  const viewCardRef = useRef<HTMLDivElement>(null);
  const inlineCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [inlineExportKey, setInlineExportKey] = useState<string | null>(null);

  const [printClassSheet, setPrintClassSheet] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadExaminations = async () => {
    try {
      const res = await apiRequest<{ examinations: any[] }>('/api/examinations');
      setExams(res.examinations || []);
      return res.examinations || [];
    } catch (e: any) {
      setErr(e.message || 'Failed to load examinations');
      return [];
    }
  };

  const loadClasses = async () => {
    try {
      const res = await apiRequest<{ classes: any[] }>('/api/classes');
      setClasses((res.classes || []).map((c: any) => ({ id: String(c.id), name: String(c.name) })));
    } catch {
      // fall back to classes derived from examinations
    }
  };

  const loadResults = async () => {
    try {
      const res = await apiRequest<{ results: any[] }>('/api/results');
      setResults(res.results || []);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    if (typeof settings?.results_open === 'boolean') {
      setResultsOpen(settings.results_open);
    }
  }, [settings?.results_open]);

  useEffect(() => {
    loadClasses();
    loadExaminations().then((list) => {
      if (list[0]) {
        setMarksExamId(String(list[0].id));
      }
    });
    apiRequest<{ resultsOpen: boolean }>('/api/results/portal-status')
      .then((res) => {
        if (typeof res?.resultsOpen === 'boolean') setResultsOpen(res.resultsOpen);
      })
      .catch(() => {});
    loadResults();
  }, []);

  const handleToggleResultsPortal = async (open: boolean) => {
    if (!isAdmin || togglingStatus || open === resultsOpen) return;
    setTogglingStatus(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ resultsOpen: boolean }>('/api/results/portal-status', {
        method: 'PUT',
        body: JSON.stringify({ open }),
      });
      setResultsOpen(res.resultsOpen);
      if (settings && onSettingsUpdated) {
        onSettingsUpdated({ ...settings, results_open: res.resultsOpen });
      }
      setMsg(
        res.resultsOpen
          ? 'Public Result turned ON. Check Result button is now visible on homepage.'
          : 'Public Result turned OFF. Check Result button is now hidden on homepage.'
      );
    } catch (e: any) {
      setErr(e.message || 'Failed to update public result status');
    } finally {
      setTogglingStatus(false);
    }
  };

  const loadMarksSheet = async (eid: string) => {
    if (!eid || !canEnterMarks) return;
    setErr('');
    try {
      const res = await apiRequest(`/api/results/marks-sheet?examId=${eid}`);
      setSheet(res);
      const grid: Record<string, number> = {};
      for (const m of res.marks || []) {
        grid[`${m.student_id}_${m.subject_id}`] = m.obtained_marks;
      }
      setMarksGrid(grid);
      const rem: Record<string, string> = {};
      for (const r of res.existingResults || []) {
        rem[r.student_id] = r.teacher_remarks || '';
      }
      setRemarksMap(rem);
    } catch (e: any) {
      setSheet(null);
      setErr(e.message);
    }
  };

  useEffect(() => {
    if (tab === 'marks' && marksExamId) loadMarksSheet(marksExamId);
    if (tab === 'results') loadResults();
  }, [tab, marksExamId]);

  const handleSaveMarks = async () => {
    if (!sheet || !marksExamId) return;
    setErr('');
    setMsg('');
    const entries: any[] = [];
    for (const st of sheet.students) {
      for (const sub of sheet.subjects) {
        entries.push({
          student_id: st.id,
          subject_id: sub.subject_id,
          obtained_marks: Number(marksGrid[`${st.id}_${sub.subject_id}`] || 0),
          total_marks: sub.total_marks,
        });
      }
    }
    try {
      await apiRequest('/api/results/marks', {
        method: 'POST',
        body: JSON.stringify({ examId: marksExamId, entries, teacherRemarks: remarksMap }),
      });
      setMsg('Marks saved and totals, percentages, grades, and class ranks calculated automatically.');
      await loadExaminations();
      await loadResults();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handlePublish = async (examId: string, publish: boolean) => {
    setErr('');
    setMsg('');
    setUploadingExamId(examId);
    try {
      await apiRequest(`/api/results/publish/${examId}`, {
        method: 'POST',
        body: JSON.stringify({ publish }),
      });
      setMsg(
        publish
          ? 'Results published successfully. Class ranks finalized and now visible to students & parents.'
          : 'Results unpublished successfully. Hidden from students & parents.'
      );
      await loadExaminations();
      await loadResults();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploadingExamId(null);
    }
  };

  const handleBulkPublish = async (examIds: string[], publish: boolean) => {
    if (!examIds.length || bulkProcessing) return;
    setErr('');
    setMsg('');
    setBulkProcessing(publish ? 'publish' : 'unpublish');
    try {
      const res = await apiRequest<{
        updatedCount: number;
        skipped?: Array<{ className: string; reason: string }>;
      }>('/api/results/publish-bulk', {
        method: 'POST',
        body: JSON.stringify({ examIds, publish }),
      });
      const skippedCount = res.skipped?.length || 0;
      const baseText = publish
        ? `Published results for ${res.updatedCount} class exam${res.updatedCount === 1 ? '' : 's'}. Class ranks finalized and now visible to students & parents.`
        : `Unpublished results for ${res.updatedCount} class exam${res.updatedCount === 1 ? '' : 's'}. Now hidden from students & parents.`;
      setMsg(
        skippedCount > 0
          ? `${baseText} (${skippedCount} skipped because student results are still pending.)`
          : baseText
      );
      await loadExaminations();
      await loadResults();
    } catch (e: any) {
      setErr(e.message || `Failed to ${publish ? 'publish' : 'unpublish'} selected examinations.`);
    } finally {
      setBulkProcessing(null);
    }
  };

  const handleCardSaved = async (_savedId: string, savedExamId: string) => {
    const wasEditing = Boolean(editingResult);
    setEditingResult(null);
    setPreselectStudentId('');
    setPreselectExamId('');
    const updatedExams = await loadExaminations();
    const savedExam = updatedExams.find((e: any) => String(e.id) === String(savedExamId));
    if (savedExam) {
      setSelectedClassId(String(savedExam.class_id));
      setSelectedExamKey(String(savedExam.id));
      setMarksExamId(String(savedExam.id));
    }
    await loadResults();
    setTab('results');
    setMsg(
      wasEditing
        ? 'Result updated and class ranks & percentages recalculated.'
        : 'Result card saved (Unpublished). Class ranks & percentages updated automatically.'
    );
  };

  const handleEditResult = (r: any) => {
    setViewResult(null);
    setPreselectStudentId('');
    setPreselectExamId('');
    setEditingResult(r);
    setTab('create');
    setErr('');
    setMsg('');
  };

  const handleCreateForStudent = (studentId: string, examId: string) => {
    setEditingResult(null);
    setPreselectStudentId(studentId);
    setPreselectExamId(examId);
    setTab('create');
    setErr('');
    setMsg('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setErr('');
    setMsg('');
    try {
      await apiRequest(`/api/results/${deleteTarget.id}`, { method: 'DELETE' });
      setMsg(`Result for ${deleteTarget.student_name} deleted and class ranks recalculated.`);
      setDeleteTarget(null);
      await loadExaminations();
      await loadResults();
    } catch (e: any) {
      setErr(e.message || 'Failed to delete result.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadViewPng = async () => {
    if (!viewCardRef.current || !viewResult || downloadingViewPng) return;
    setDownloadingViewPng(true);
    try {
      await exportResultCardPng(
        viewCardRef.current,
        `Result_Grade_Card_-_${viewResult.student_name || 'Student'}_-_${viewResult.exam_name || 'Examination'}`
      );
    } catch (e: any) {
      setErr(e?.message || 'Failed to download PNG.');
    } finally {
      setDownloadingViewPng(false);
    }
  };

  const handleDownloadViewPdf = async () => {
    if (!viewCardRef.current || !viewResult || downloadingViewPdf) return;
    setDownloadingViewPdf(true);
    try {
      await exportResultCardPdf(
        viewCardRef.current,
        `Result_Grade_Card_-_${viewResult.student_name || 'Student'}_-_${viewResult.exam_name || 'Examination'}`
      );
    } catch (e: any) {
      setErr(e?.message || 'Failed to download PDF.');
    } finally {
      setDownloadingViewPdf(false);
    }
  };

  const handleInlineDownload = async (r: any, type: 'pdf' | 'png') => {
    const el = inlineCardRefs.current[String(r.id)];
    const key = `${type}-${r.id}`;
    if (!el || inlineExportKey) return;
    setInlineExportKey(key);
    setErr('');
    try {
      const baseName = `Result_Grade_Card_-_${r.student_name || 'Student'}_-_${r.exam_name || 'Examination'}`;
      if (type === 'pdf') {
        await exportResultCardPdf(el, baseName);
      } else {
        await exportResultCardPng(el, baseName);
      }
    } catch (e: any) {
      setErr(e?.message || `Failed to download ${type.toUpperCase()}.`);
    } finally {
      setInlineExportKey(null);
    }
  };

  // Combine classes from /api/classes + any class referenced in exams
  const classOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; examCount: number }>();
    for (const c of classes) {
      map.set(String(c.id), { id: String(c.id), name: c.name, examCount: 0 });
    }
    for (const ex of exams) {
      const cid = String(ex.class_id || '');
      if (!cid) continue;
      const existing = map.get(cid);
      if (existing) {
        existing.examCount += 1;
      } else {
        map.set(cid, { id: cid, name: ex.class_name || 'Class', examCount: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, exams]);

  // Unique exam names across all classes (when "All Classes" is selected)
  const uniqueExamNames = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; publishedCount: number }>();
    for (const ex of exams) {
      const cleanName = String(ex.name || '').trim();
      if (!cleanName) continue;
      const key = cleanName.toLowerCase();
      const prev = counts.get(key);
      if (prev) {
        prev.count += 1;
        if (ex.results_published) prev.publishedCount += 1;
      } else {
        counts.set(key, {
          name: cleanName,
          count: 1,
          publishedCount: ex.results_published ? 1 : 0,
        });
      }
    }
    return Array.from(counts.values());
  }, [exams]);

  // Exams belonging to the selected class (when a specific class is selected)
  const examsForSelectedClass = useMemo(() => {
    if (selectedClassId === 'all') return exams;
    return exams.filter((ex) => String(ex.class_id) === selectedClassId);
  }, [exams, selectedClassId]);

  // All examinations matching BOTH the Class and Exam selectors
  const matchedExams = useMemo(() => {
    if (selectedClassId === 'all') {
      if (selectedExamKey === 'all') return exams;
      const needle = selectedExamKey.trim().toLowerCase();
      return exams.filter((ex) => String(ex.name || '').trim().toLowerCase() === needle);
    }
    if (selectedExamKey === 'all') return examsForSelectedClass;
    return examsForSelectedClass.filter((ex) => String(ex.id) === selectedExamKey);
  }, [exams, examsForSelectedClass, selectedClassId, selectedExamKey]);

  const publishedMatchedExams = useMemo(
    () => matchedExams.filter((ex) => Boolean(ex.results_published)),
    [matchedExams]
  );
  const readyToPublishExams = useMemo(
    () => matchedExams.filter((ex) => !ex.results_published && Boolean(ex.all_results_created)),
    [matchedExams]
  );
  const pendingMatchedExams = useMemo(
    () => matchedExams.filter((ex) => !ex.results_published && !ex.all_results_created),
    [matchedExams]
  );

  const selectedExam = matchedExams.length === 1 ? matchedExams[0] : null;

  // Keep Marks Entry tab exam synced when user narrows to a single exam
  useEffect(() => {
    if (selectedExam) {
      setMarksExamId(String(selectedExam.id));
    } else if (!marksExamId && matchedExams[0]) {
      setMarksExamId(String(matchedExams[0].id));
    }
  }, [selectedExam, matchedExams, marksExamId]);

  // Results filtered cleanly by selected Class + Exam
  const visibleResults = useMemo(() => {
    if (selectedClassId === 'all' && selectedExamKey === 'all') {
      return results;
    }
    const allowedExamIds = new Set(matchedExams.map((ex) => String(ex.id)));
    return results.filter((r) => {
      if (allowedExamIds.size > 0) {
        return allowedExamIds.has(String(r.examination_id));
      }
      if (selectedClassId !== 'all' && String(r.class_id) !== selectedClassId) {
        return false;
      }
      return false;
    });
  }, [results, matchedExams, selectedClassId, selectedExamKey]);

  const activeSelectionSubtitle = useMemo(() => {
    const classLabel =
      selectedClassId === 'all'
        ? 'All Classes'
        : classOptions.find((c) => c.id === selectedClassId)?.name || 'Selected Class';
    if (selectedExamKey === 'all') return `${classLabel} — All Examinations`;
    if (selectedClassId === 'all') return `${classLabel} — ${selectedExamKey}`;
    const ex = exams.find((e) => String(e.id) === selectedExamKey);
    return `${classLabel} — ${ex?.name || 'Examination'}`;
  }, [selectedClassId, selectedExamKey, classOptions, exams]);

  const viewCardData = viewResult
    ? {
        ...buildCardDataFromSavedResult(viewResult, settings),
        totalStudents:
          viewResult.total_students ||
          results.filter((x) => String(x.examination_id) === String(viewResult.examination_id))
            .length ||
          undefined,
      }
    : null;

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      {isAdmin && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                resultsOpen ? 'bg-emerald-50 text-[#10B981]' : 'bg-red-50 text-[#DC1726]'
              }`}
            >
              <Power className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#171717]">
                Public Result Portal:{' '}
                <span className={resultsOpen ? 'text-[#10B981]' : 'text-[#DC1726]'}>
                  {resultsOpen ? 'ON (Visible)' : 'OFF (Hidden)'}
                </span>
              </div>
              <p className="text-xs text-[#737373] mt-0.5">
                {resultsOpen
                  ? 'The Check Result button is visible on the public website for students and parents.'
                  : 'The Check Result button is completely hidden on the public website.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg shrink-0 self-start sm:self-center">
            <button
              type="button"
              disabled={togglingStatus}
              aria-pressed={resultsOpen}
              onClick={() => handleToggleResultsPortal(true)}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                resultsOpen ? 'bg-[#10B981] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Result ON
            </button>
            <button
              type="button"
              disabled={togglingStatus}
              aria-pressed={!resultsOpen}
              onClick={() => handleToggleResultsPortal(false)}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                !resultsOpen ? 'bg-[#DC1726] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Result OFF
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {canEnterMarks && (
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-neutral-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setEditingResult(null);
                  setTab('results');
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  tab === 'results' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'
                }`}
              >
                Results &amp; Marksheets
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingResult(null);
                  setPreselectStudentId('');
                  setPreselectExamId('');
                  setTab('create');
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  tab === 'create'
                    ? 'bg-[#16a34a] text-white shadow-xs'
                    : 'text-[#16a34a] hover:bg-white/70'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{editingResult ? 'Edit Result' : 'Create Result'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingResult(null);
                  setTab('marks');
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  tab === 'marks' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'
                }`}
              >
                Enter Marks
              </button>
            </div>
          )}

          {!canEnterMarks && tab === 'results' && exams.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {classOptions.length > 1 && (
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setSelectedExamKey('all');
                  }}
                  className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white font-medium"
                >
                  <option value="all">All Classes</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={selectedExamKey}
                onChange={(e) => setSelectedExamKey(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white font-medium"
              >
                <option value="all">All Examinations</option>
                {selectedClassId === 'all'
                  ? uniqueExamNames.map((ex) => (
                      <option key={ex.name} value={ex.name}>
                        {ex.name}
                      </option>
                    ))
                  : examsForSelectedClass.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
              </select>
            </div>
          )}

          {canEnterMarks && tab === 'marks' && (
            <select
              value={marksExamId}
              onChange={(e) => setMarksExamId(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white font-medium"
            >
              {exams.length === 0 && <option value="">No Examinations</option>}
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.class_name} — {ex.name} ({ex.results_published ? 'Published' : 'Unpublished'})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEnterMarks && tab === 'results' && (
            <button
              type="button"
              onClick={() => {
                setEditingResult(null);
                setPreselectStudentId('');
                setPreselectExamId('');
                setTab('create');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#16a34a] hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Result</span>
            </button>
          )}
          {visibleResults.length > 0 && tab === 'results' && (
            <button
              type="button"
              onClick={() => setPrintClassSheet(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Class Result Sheet
            </button>
          )}
        </div>
      </div>

      {/* Result Publish & Class/Exam Selector Control Center */}
      {canEnterMarks && tab === 'results' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
          {/* Header Strip */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-[#064E3B] via-[#065F46] to-[#047857] text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5 text-emerald-100" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold tracking-tight">
                  Result Publish Control
                </h3>
                <p className="text-[11px] text-emerald-100/90">
                  Select All Classes or a specific Class &amp; Exam to Publish or Unpublish results
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
              <span className="px-2.5 py-1 rounded-lg bg-white/15 text-white">
                {matchedExams.length} {matchedExams.length === 1 ? 'Exam' : 'Class Exams'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-400/25 text-emerald-100 border border-emerald-300/30">
                {publishedMatchedExams.length} Published
              </span>
              {readyToPublishExams.length > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-sky-400/25 text-sky-100 border border-sky-300/30">
                  {readyToPublishExams.length} Ready
                </span>
              )}
              {pendingMatchedExams.length > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-400/25 text-amber-100 border border-amber-300/30">
                  {pendingMatchedExams.length} Pending
                </span>
              )}
            </div>
          </div>

          {/* Class Selector + Exam Selector + Publish / Unpublish Action Bar */}
          <div className="p-4 sm:p-5 bg-neutral-50/70 border-b border-neutral-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* 1. Class Selector */}
            <div className="md:col-span-4 space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#525252]">
                <GraduationCap className="w-3.5 h-3.5 text-[#065F46]" />
                Select Class
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setSelectedExamKey('all');
                }}
                className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-neutral-300 bg-white text-[#171717] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
              >
                <option value="all">
                  All Classes ({classOptions.length})
                </option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.examCount} {c.examCount === 1 ? 'Exam' : 'Exams'})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Exam Selector */}
            <div className="md:col-span-4 space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#525252]">
                <BookOpen className="w-3.5 h-3.5 text-[#065F46]" />
                Select Examination
              </label>
              <select
                value={selectedExamKey}
                onChange={(e) => setSelectedExamKey(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-neutral-300 bg-white text-[#171717] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
              >
                <option value="all">
                  {selectedClassId === 'all'
                    ? `All Examinations (${exams.length})`
                    : `All Exams in Class (${examsForSelectedClass.length})`}
                </option>
                {selectedClassId === 'all'
                  ? uniqueExamNames.map((ex) => (
                      <option key={ex.name} value={ex.name}>
                        {ex.name} — {ex.count} {ex.count === 1 ? 'Class' : 'Classes'} ({ex.publishedCount}/{ex.count} Published)
                      </option>
                    ))
                  : examsForSelectedClass.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name} — {ex.results_published ? 'Published' : ex.all_results_created ? 'Ready to Publish' : `${ex.created_results_count ?? 0}/${ex.total_students ?? 0} Pending`}
                      </option>
                    ))}
              </select>
            </div>

            {/* 3. Direct Publish & Unpublish Action Buttons */}
            <div className="md:col-span-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={
                  readyToPublishExams.length === 0 ||
                  bulkProcessing !== null ||
                  uploadingExamId !== null
                }
                onClick={() => {
                  if (readyToPublishExams.length === 1) {
                    handlePublish(String(readyToPublishExams[0].id), true);
                  } else {
                    handleBulkPublish(
                      readyToPublishExams.map((e) => String(e.id)),
                      true
                    );
                  }
                }}
                title={
                  readyToPublishExams.length > 0
                    ? `Publish results for ${readyToPublishExams.length} ready class exam(s)`
                    : publishedMatchedExams.length === matchedExams.length && matchedExams.length > 0
                      ? 'All selected exams are already published'
                      : 'Complete all students’ results in a class first to publish'
                }
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  readyToPublishExams.length > 0
                    ? 'bg-[#10B981] hover:bg-emerald-600 text-white shadow-xs cursor-pointer'
                    : 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                }`}
              >
                <UploadCloud className="w-4 h-4 shrink-0" />
                <span>
                  {bulkProcessing === 'publish'
                    ? 'Publishing...'
                    : matchedExams.length > 1
                      ? `Publish Ready (${readyToPublishExams.length})`
                      : publishedMatchedExams.length === 1
                        ? 'Published'
                        : 'Publish'}
                </span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  disabled={
                    publishedMatchedExams.length === 0 ||
                    bulkProcessing !== null ||
                    uploadingExamId !== null
                  }
                  onClick={() => {
                    if (publishedMatchedExams.length === 1) {
                      handlePublish(String(publishedMatchedExams[0].id), false);
                    } else {
                      handleBulkPublish(
                        publishedMatchedExams.map((e) => String(e.id)),
                        false
                      );
                    }
                  }}
                  title={
                    publishedMatchedExams.length > 0
                      ? `Unpublish results for ${publishedMatchedExams.length} published class exam(s)`
                      : 'No published exams in current selection'
                  }
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    publishedMatchedExams.length > 0
                      ? 'bg-[#DC1726] hover:bg-red-700 text-white shadow-xs cursor-pointer'
                      : 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                  }`}
                >
                  <EyeOff className="w-4 h-4 shrink-0" />
                  <span>
                    {bulkProcessing === 'unpublish'
                      ? 'Unpublishing...'
                      : matchedExams.length > 1
                        ? `Unpublish (${publishedMatchedExams.length})`
                        : 'Unpublish'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive Class-Wise Status Area */}
          <div className="p-4 sm:p-5">
            {matchedExams.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#737373]">
                No examinations found for this Class &amp; Exam selection.
              </div>
            ) : selectedExam ? (
              /* Single Class + Exam Detailed Progress Panel */
              <div
                className={`rounded-xl border p-4 space-y-3 ${
                  selectedExam.results_published
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : selectedExam.all_results_created
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-amber-50/60 border-amber-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        selectedExam.results_published || selectedExam.all_results_created
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {selectedExam.results_published ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : selectedExam.all_results_created ? (
                        <UploadCloud className="w-5 h-5" />
                      ) : (
                        <Users className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#171717] flex flex-wrap items-center gap-2">
                        <span>
                          {selectedExam.class_name} — {selectedExam.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            selectedExam.results_published
                              ? 'bg-emerald-600 text-white'
                              : selectedExam.all_results_created
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {selectedExam.results_published
                            ? 'Published'
                            : selectedExam.all_results_created
                              ? 'Ready to Publish'
                              : 'Unpublished (Pending Students)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#525252] mt-0.5">
                        {selectedExam.results_published
                          ? `All ${selectedExam.created_results_count ?? selectedExam.total_saved_results ?? 0} students' results are published. Ranks are ordered by highest marks & percentage.`
                          : selectedExam.all_results_created
                            ? `All ${selectedExam.total_students || selectedExam.created_results_count} students' results are ready! Click "Publish" to make them visible to students & parents.`
                            : `${selectedExam.created_results_count ?? 0} of ${selectedExam.total_students ?? 0} active students created. Complete the remaining ${selectedExam.pending_students?.length ?? 0} student(s) before publishing.`}
                      </p>
                    </div>
                  </div>

                  {!selectedExam.results_published && selectedExam.pending_students?.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCreateForStudent(
                          selectedExam.pending_students[0].id,
                          String(selectedExam.id)
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#16a34a] text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Create Next ({selectedExam.pending_students[0].full_name})</span>
                    </button>
                  )}
                </div>

                {(selectedExam.total_students ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <div className="w-full h-2 rounded-full bg-white/80 overflow-hidden border border-black/5">
                      <div
                        className={`h-full transition-all duration-300 ${
                          selectedExam.all_results_created ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((selectedExam.created_results_count || 0) /
                                Math.max(1, selectedExam.total_students)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    {selectedExam.pending_students?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-amber-800">
                          Remaining students:
                        </span>
                        {selectedExam.pending_students.slice(0, 8).map((st: any) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => handleCreateForStudent(st.id, String(selectedExam.id))}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-amber-300 text-[11px] font-medium text-amber-900 hover:bg-amber-100 cursor-pointer"
                          >
                            + {st.full_name}
                          </button>
                        ))}
                        {selectedExam.pending_students.length > 8 && (
                          <span className="text-[11px] text-amber-800 font-medium">
                            +{selectedExam.pending_students.length - 8} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Multi-Class / All Classes Status Cards Grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {matchedExams.map((ex) => {
                  const total = Number(ex.total_students || 0);
                  const created = Number(ex.created_results_count || 0);
                  const pct = total > 0 ? Math.min(100, Math.round((created / total) * 100)) : created > 0 ? 100 : 0;
                  const isBusy = uploadingExamId === String(ex.id) || bulkProcessing !== null;
                  return (
                    <div
                      key={ex.id}
                      className={`rounded-xl border p-3.5 transition-all flex flex-col justify-between gap-3 ${
                        ex.results_published
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : ex.all_results_created
                            ? 'bg-white border-emerald-200/80 shadow-[0_1px_2px_rgba(16,185,129,0.08)]'
                            : 'bg-white border-neutral-200'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClassId(String(ex.class_id));
                              setSelectedExamKey(String(ex.id));
                            }}
                            className="text-start min-w-0 group cursor-pointer"
                            title="Filter to this class & exam"
                          >
                            <div className="text-xs font-extrabold text-[#171717] group-hover:text-[#065F46] truncate">
                              {ex.class_name}
                            </div>
                            <div className="text-[11px] text-[#525252] truncate">{ex.name}</div>
                          </button>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase shrink-0 ${
                              ex.results_published
                                ? 'bg-emerald-600 text-white'
                                : ex.all_results_created
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ex.results_published
                              ? 'Published'
                              : ex.all_results_created
                                ? 'Ready'
                                : 'Pending'}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-[#737373]">
                            <span>Students Result</span>
                            <span className="font-mono-num font-bold text-[#171717]">
                              {created}/{total || created} ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-neutral-200/80 overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                ex.results_published || ex.all_results_created
                                  ? 'bg-emerald-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClassId(String(ex.class_id));
                            setSelectedExamKey(String(ex.id));
                          }}
                          className="text-[11px] font-semibold text-[#525252] hover:text-[#171717] cursor-pointer"
                        >
                          View Class →
                        </button>

                        {ex.results_published ? (
                          isAdmin ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handlePublish(String(ex.id), false)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-[#DC1726] text-[#DC1726] hover:text-white border border-red-200 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <EyeOff className="w-3 h-3" />
                              <span>{uploadingExamId === String(ex.id) ? '...' : 'Unpublish'}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Live
                            </span>
                          )
                        ) : ex.all_results_created ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handlePublish(String(ex.id), true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <UploadCloud className="w-3 h-3" />
                            <span>{uploadingExamId === String(ex.id) ? '...' : 'Publish'}</span>
                          </button>
                        ) : ex.pending_students?.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateForStudent(ex.pending_students[0].id, String(ex.id))
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold cursor-pointer"
                          >
                            <PlusCircle className="w-3 h-3" />
                            <span>+{ex.pending_students.length} Left</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#737373]">No students</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'results' && (canEnterMarks || user.role_slug === 'committee_member') && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[#171717]">{activeSelectionSubtitle}</span>
            <span className="text-[#737373] font-mono-num">
              {visibleResults.length} {visibleResults.length === 1 ? 'result' : 'results'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">Rank</th>
                  <th className="px-4 py-3 text-start font-semibold">Student</th>
                  <th className="px-4 py-3 text-start font-semibold">Examination</th>
                  <th className="px-4 py-3 text-end font-semibold">Marks</th>
                  <th className="px-4 py-3 text-end font-semibold">Percentage</th>
                  <th className="px-4 py-3 text-start font-semibold">Grade</th>
                  <th className="px-4 py-3 text-start font-semibold">Result</th>
                  <th className="px-4 py-3 text-end font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibleResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[#737373]">
                      No saved results available for this selection.
                    </td>
                  </tr>
                ) : (
                  visibleResults.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 font-mono-num font-bold">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
                            r.position === 1
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : r.position === 2
                                ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                : r.position === 3
                                  ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                  : 'text-[#171717]'
                          }`}
                        >
                          {r.position <= 3 && <Trophy className="w-3 h-3" />}
                          #{r.position}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#171717]">{r.student_name}</div>
                        <div className="text-[11px] text-[#737373] font-mono-num">
                          {r.admission_no || r.student_code} · {r.class_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#737373]">
                        <div className="font-medium text-[#171717]">{r.exam_name}</div>
                        <span
                          className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            r.is_published
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {r.is_published ? 'Published' : 'Unpublished'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end font-mono-num font-semibold">
                        {r.obtained_marks} / {r.total_marks}
                      </td>
                      <td className="px-4 py-3 text-end font-mono-num font-bold">{r.percentage}%</td>
                      <td className="px-4 py-3 font-bold text-[#0EA5E9]">{r.grade}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-bold uppercase ${
                            r.status === 'pass' ? 'text-[#10B981]' : 'text-[#DC1726]'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewResult(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-200 bg-white hover:bg-neutral-100 text-[11px] font-semibold text-[#171717] cursor-pointer"
                            title="View, Print, Download PDF/PNG"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#2563eb]" /> View
                          </button>
                          {canEnterMarks && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditResult(r)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-200 bg-white hover:bg-amber-50 text-[11px] font-semibold text-[#171717] cursor-pointer"
                                title="Edit Result Card"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-600" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(r)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-red-200 bg-red-50/60 hover:bg-red-100 text-[11px] font-semibold text-[#DC1726] cursor-pointer"
                                title="Delete Result"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'results' &&
        (user.role_slug === 'student' || user.role_slug === 'parent') &&
        (visibleResults.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center text-xs text-[#737373]">
            No published examination results available yet.
          </div>
        ) : (
          <div className="space-y-5">
            {visibleResults.map((r) => {
              const inlineCardData = {
                ...buildCardDataFromSavedResult(r, settings),
                totalStudents:
                  r.total_students ||
                  results.filter((x) => String(x.examination_id) === String(r.examination_id)).length ||
                  undefined,
              };
              return (
                <div
                  key={`inline-${r.id}`}
                  className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden"
                >
                  <div className="px-4 sm:px-5 py-3 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#171717]">
                        {r.student_name} — {r.exam_name}
                      </h3>
                      <p className="text-[11px] text-[#737373] font-mono-num">
                        Marks: {r.obtained_marks}/{r.total_marks} · {Number(r.percentage).toFixed(2)}% · Grade {r.grade} · Rank #{r.position}
                        {r.total_students ? ` / ${r.total_students}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={inlineExportKey !== null}
                        onClick={() => handleInlineDownload(r, 'pdf')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{inlineExportKey === `pdf-${r.id}` ? 'Saving PDF...' : 'Download PDF'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={inlineExportKey !== null}
                        onClick={() => handleInlineDownload(r, 'png')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ea580c] text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-60 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{inlineExportKey === `png-${r.id}` ? 'Saving PNG...' : 'Download PNG'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewResult(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>
                  <div className="p-2.5 sm:p-5 bg-neutral-100/80">
                    <ScaledA4Viewport>
                      <ResultGradeCard
                        data={inlineCardData}
                        cardRef={(el) => {
                          inlineCardRefs.current[String(r.id)] = el;
                        }}
                      />
                    </ScaledA4Viewport>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {tab === 'create' && canEnterMarks && (
        <CreateResultBuilder
          user={user}
          settings={settings}
          exams={exams}
          existingResults={results}
          editingResult={editingResult}
          initialStudentId={preselectStudentId}
          initialExamId={preselectExamId}
          onCancelEdit={() => {
            setEditingResult(null);
            setPreselectStudentId('');
            setPreselectExamId('');
            setTab('results');
          }}
          onSaved={handleCardSaved}
        />
      )}

      {tab === 'marks' && sheet && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#171717]">Marks Entry — {sheet.exam.name}</h3>
              <p className="text-xs text-[#737373]">Enter obtained marks per subject; totals, percentage, grade, pass/fail, and rank calculate automatically.</p>
            </div>
            <button type="button" onClick={handleSaveMarks} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700">
              <Save className="w-4 h-4" /> Save &amp; Calculate Results
            </button>
          </div>

          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                <tr>
                  <th className="px-3 py-2.5 text-start">Student</th>
                  {(sheet.subjects || []).map((sub: any) => (
                    <th key={sub.subject_id} className="px-3 py-2.5 text-center">
                      {sub.subject_name} <span className="font-mono-num">(/ {sub.total_marks})</span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-start">Teacher Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(sheet.students || []).map((st: any) => (
                  <tr key={st.id}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">{st.full_name}</div>
                      <div className="font-mono-num text-[11px] text-[#737373]">{st.student_code}</div>
                    </td>
                    {(sheet.subjects || []).map((sub: any) => (
                      <td key={sub.subject_id} className="px-3 py-2.5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={sub.total_marks}
                          value={marksGrid[`${st.id}_${sub.subject_id}`] ?? ''}
                          onChange={(e) => setMarksGrid({ ...marksGrid, [`${st.id}_${sub.subject_id}`]: Number(e.target.value) })}
                          className="w-20 px-2 py-1 text-center rounded border border-neutral-200 font-mono-num"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={remarksMap[st.id] || ''}
                        onChange={(e) => setRemarksMap({ ...remarksMap, [st.id]: e.target.value })}
                        placeholder="Remarks..."
                        className="w-full px-2.5 py-1 rounded border border-neutral-200"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheet.subjects?.length === 0 && (
            <div className="p-4 text-center text-xs text-[#F59E0B] flex items-center justify-center gap-2">
              <Edit3 className="w-4 h-4" /> Add subjects to this examination in the Examinations module before entering marks.
            </div>
          )}
        </div>
      )}

      {/* View Full Result Grade Card Modal (Print, PDF, PNG, Edit) */}
      <PrintModal
        open={Boolean(viewResult)}
        standalone={true}
        title="Result Grade Card"
        subtitle={`${viewResult?.student_name || ''} — ${viewResult?.exam_name || ''}`}
        settings={settings}
        onClose={() => setViewResult(null)}
        headerActions={
          viewResult && (
            <>
              <button
                type="button"
                disabled={downloadingViewPdf}
                onClick={handleDownloadViewPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-60"
              >
                <FileText className="w-4 h-4" />
                <span>{downloadingViewPdf ? 'Saving PDF...' : 'Download PDF'}</span>
              </button>
              <button
                type="button"
                disabled={downloadingViewPng}
                onClick={handleDownloadViewPng}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#ea580c] text-white text-sm font-medium hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingViewPng ? 'Saving PNG...' : 'Download PNG'}</span>
              </button>
              {canEnterMarks && (
                <button
                  type="button"
                  onClick={() => handleEditResult(viewResult)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit</span>
                </button>
              )}
            </>
          )
        }
      >
        {viewCardData && <ResultGradeCard data={viewCardData} cardRef={viewCardRef} />}
      </PrintModal>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#171717]">Delete Saved Result?</h3>
                <p className="text-xs text-[#737373] mt-1">
                  This will permanently remove the saved result and subject marks for{' '}
                  <strong className="text-[#171717]">{deleteTarget.student_name}</strong> (
                  {deleteTarget.exam_name}) and recalculate class ranks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1.5 rounded-lg text-[#737373] hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-neutral-200 text-xs font-semibold text-[#171717] hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Deleting...' : 'Yes, Delete Result'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Class Result Sheet */}
      <PrintModal open={printClassSheet} title="Official Class Result Sheet" subtitle={activeSelectionSubtitle} settings={settings} onClose={() => setPrintClassSheet(false)}>
        <table className="w-full text-xs border-collapse border border-neutral-300">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-neutral-300 px-3 py-2 text-start">Rank</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Student ID</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Student Name</th>
              <th className="border border-neutral-300 px-3 py-2 text-end">Marks</th>
              <th className="border border-neutral-300 px-3 py-2 text-end">%</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Grade</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Result</th>
            </tr>
          </thead>
          <tbody>
            {visibleResults.map((r) => (
              <tr key={r.id}>
                <td className="border border-neutral-300 px-3 py-2 font-mono-num font-bold">#{r.position}</td>
                <td className="border border-neutral-300 px-3 py-2 font-mono-num">{r.student_code}</td>
                <td className="border border-neutral-300 px-3 py-2 font-medium">{r.student_name}</td>
                <td className="border border-neutral-300 px-3 py-2 text-end font-mono-num">{r.obtained_marks}/{r.total_marks}</td>
                <td className="border border-neutral-300 px-3 py-2 text-end font-mono-num">{r.percentage}%</td>
                <td className="border border-neutral-300 px-3 py-2">{r.grade}</td>
                <td className="border border-neutral-300 px-3 py-2 uppercase font-bold">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintModal>
    </div>
  );
};

