import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  FileText,
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
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
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

  const loadResults = async (eid?: string) => {
    try {
      const qs = eid ? `?examId=${eid}` : '';
      const res = await apiRequest<{ results: any[] }>(`/api/results${qs}`);
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
    loadExaminations().then((list) => {
      if (list[0]) {
        setSelectedExamId(String(list[0].id));
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
    if (tab === 'marks' && selectedExamId) loadMarksSheet(selectedExamId);
    if (tab === 'results') loadResults(selectedExamId || undefined);
  }, [tab, selectedExamId]);

  const handleSaveMarks = async () => {
    if (!sheet) return;
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
        body: JSON.stringify({ examId: selectedExamId, entries, teacherRemarks: remarksMap }),
      });
      setMsg('Marks saved and totals, percentages, grades, and class ranks calculated automatically.');
      await loadExaminations();
      loadResults(selectedExamId);
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
          ? 'All students’ results verified, ranks finalized by highest marks, and results uploaded to students & parents.'
          : 'Results moved back to Draft.'
      );
      await loadExaminations();
      await loadResults(selectedExamId || undefined);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploadingExamId(null);
    }
  };

  const handleCardSaved = async (_savedId: string, savedExamId: string) => {
    const wasEditing = Boolean(editingResult);
    setEditingResult(null);
    setPreselectStudentId('');
    setPreselectExamId('');
    await loadExaminations();
    setSelectedExamId(savedExamId || '');
    await loadResults(savedExamId || undefined);
    setTab('results');
    setMsg(
      wasEditing
        ? 'Result updated and class ranks & percentages recalculated.'
        : 'Result card saved to Draft. Class ranks & percentages updated automatically.'
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
      await loadResults(selectedExamId || undefined);
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

  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);

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

          {tab !== 'create' && (
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
            >
              <option value="">All Examinations</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} — {ex.class_name} ({ex.results_published ? 'Uploaded' : `${ex.created_results_count ?? 0}/${ex.total_students ?? 0} Draft`})
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#16a34a] hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Result</span>
            </button>
          )}
          {canEnterMarks && selectedExam && tab !== 'create' && (
            selectedExam.results_published ? (
              isAdmin && (
                <button
                  type="button"
                  disabled={uploadingExamId === String(selectedExam.id)}
                  onClick={() => handlePublish(selectedExam.id, false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-[#171717] hover:bg-neutral-800 cursor-pointer disabled:opacity-60"
                >
                  <Clock className="w-4 h-4" />
                  <span>{uploadingExamId === String(selectedExam.id) ? 'Updating...' : 'Move to Draft (Unpublish)'}</span>
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={!selectedExam.all_results_created || uploadingExamId === String(selectedExam.id)}
                onClick={() => handlePublish(selectedExam.id, true)}
                title={
                  selectedExam.all_results_created
                    ? 'All students created — Upload & Publish Results now'
                    : `Create remaining ${selectedExam.pending_students?.length || 0} student results first`
                }
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${
                  selectedExam.all_results_created
                    ? 'bg-[#10B981] hover:bg-emerald-600 cursor-pointer shadow-xs'
                    : 'bg-neutral-300 text-neutral-600 cursor-not-allowed'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>
                  {uploadingExamId === String(selectedExam.id)
                    ? 'Uploading Results...'
                    : selectedExam.all_results_created
                      ? 'Upload Result'
                      : `Upload Result (${selectedExam.created_results_count ?? 0}/${selectedExam.total_students ?? 0})`}
                </span>
              </button>
            )
          )}
          {results.length > 0 && tab === 'results' && (
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

      {canEnterMarks && tab === 'results' && selectedExam && (
        <div
          className={`rounded-xl border p-4 shadow-xs space-y-3 ${
            selectedExam.results_published
              ? 'bg-emerald-50/70 border-emerald-200'
              : selectedExam.all_results_created
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-amber-50/70 border-amber-200'
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
                    {selectedExam.name} — {selectedExam.class_name}
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
                      ? 'Uploaded'
                      : selectedExam.all_results_created
                        ? 'Ready to Upload'
                        : 'Draft (Pending All Students)'}
                  </span>
                </div>
                <p className="text-[11px] text-[#525252] mt-0.5">
                  {selectedExam.results_published
                    ? `All ${selectedExam.created_results_count ?? selectedExam.total_saved_results ?? 0} students' results are uploaded. Ranks are ordered by highest marks & percentage.`
                    : selectedExam.all_results_created
                      ? `All ${selectedExam.total_students || selectedExam.created_results_count} students' results are created! Click "Upload Result" to finalize ranks by highest marks and publish.`
                      : `${selectedExam.created_results_count ?? 0} of ${selectedExam.total_students ?? 0} active students created. Complete the remaining ${selectedExam.pending_students?.length ?? 0} student(s) before uploading results.`}
                </p>
              </div>
            </div>

            {!selectedExam.results_published && (
              <div className="flex items-center gap-2">
                {selectedExam.pending_students?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCreateForStudent(selectedExam.pending_students[0].id, String(selectedExam.id))}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#16a34a] text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Create Next ({selectedExam.pending_students[0].full_name})</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={!selectedExam.all_results_created || uploadingExamId === String(selectedExam.id)}
                  onClick={() => handlePublish(selectedExam.id, true)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors ${
                    selectedExam.all_results_created
                      ? 'bg-[#10B981] hover:bg-emerald-600 cursor-pointer shadow-xs'
                      : 'bg-neutral-300 text-neutral-600 cursor-not-allowed'
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{uploadingExamId === String(selectedExam.id) ? 'Uploading...' : 'Upload Result'}</span>
                </button>
              </div>
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
                      Math.round(((selectedExam.created_results_count || 0) / Math.max(1, selectedExam.total_students)) * 100)
                    )}%`,
                  }}
                />
              </div>
              {selectedExam.pending_students?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-amber-800">Remaining students:</span>
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
      )}

      {tab === 'results' && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
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
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[#737373]">
                      No saved results available for this selection.
                    </td>
                  </tr>
                ) : (
                  results.map((r) => (
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
                          {r.is_published ? 'Uploaded' : 'Draft (Not Uploaded)'}
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
        results.length > 0 && (
          <div className="space-y-5">
            {results.map((r) => {
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
                  <div className="p-2 sm:p-5 bg-white overflow-x-auto">
                    <div className="min-w-[680px]">
                      <ResultGradeCard
                        data={inlineCardData}
                        cardRef={(el) => {
                          inlineCardRefs.current[String(r.id)] = el;
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
      <PrintModal open={printClassSheet} title="Official Class Result Sheet" subtitle={selectedExam?.name || 'All Examinations'} settings={settings} onClose={() => setPrintClassSheet(false)}>
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
            {results.map((r) => (
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

