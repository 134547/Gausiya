import React, { useEffect, useState } from 'react';
import { CheckCircle2, Edit3, Power, Printer, Save } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { PrintModal } from '../components/PrintModal.tsx';

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
  const [tab, setTab] = useState<'results' | 'marks'>('results');
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [results, setResults] = useState<any[]>([]);

  // Marks sheet state
  const [sheet, setSheet] = useState<any>(null);
  const [marksGrid, setMarksGrid] = useState<Record<string, number>>({});
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});

  const [printStudentResult, setPrintStudentResult] = useState<any>(null);
  const [printClassSheet, setPrintClassSheet] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadResults = async (eid?: string) => {
    try {
      const qs = eid ? `?examId=${eid}` : '';
      const res = await apiRequest<{ results: any[] }>(`/api/results${qs}`);
      setResults(res.results);
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
    apiRequest<{ examinations: any[] }>('/api/examinations')
      .then((res) => {
        setExams(res.examinations);
        if (res.examinations[0]) {
          setSelectedExamId(String(res.examinations[0].id));
        }
      })
      .catch((e: any) => setErr(e.message || 'Failed to load examinations'));
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
      setMsg('Marks saved and totals, percentages, grades, and class positions calculated automatically.');
      loadResults(selectedExamId);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handlePublish = async (examId: string, publish: boolean) => {
    try {
      await apiRequest(`/api/results/publish/${examId}`, {
        method: 'POST',
        body: JSON.stringify({ publish }),
      });
      setMsg(publish ? 'Results approved and published to students & parents.' : 'Results unpublished.');
      const eRes = await apiRequest<{ examinations: any[] }>('/api/examinations');
      setExams(eRes.examinations);
      loadResults(selectedExamId);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);

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
            <div className="inline-flex items-center gap-1 p-1 bg-neutral-200/70 rounded-lg">
              <button type="button" onClick={() => setTab('results')} className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'results' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'}`}>
                Results &amp; Marksheets
              </button>
              <button type="button" onClick={() => setTab('marks')} className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'marks' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'}`}>
                Enter Marks
              </button>
            </div>
          )}

          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
          >
            <option value="">All Examinations</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name} — {ex.class_name} ({ex.results_published ? 'Published' : 'Draft'})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && selectedExam && (
            <button
              type="button"
              onClick={() => handlePublish(selectedExam.id, !selectedExam.results_published)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white ${
                selectedExam.results_published ? 'bg-[#171717] hover:bg-neutral-800' : 'bg-[#10B981] hover:bg-emerald-600'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{selectedExam.results_published ? 'Unpublish Results' : 'Approve & Publish Results'}</span>
            </button>
          )}
          {results.length > 0 && (
            <button
              type="button"
              onClick={() => setPrintClassSheet(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50"
            >
              <Printer className="w-4 h-4" /> Class Result Sheet
            </button>
          )}
        </div>
      </div>

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
                  <th className="px-4 py-3 text-end font-semibold">Marksheet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {results.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-[#737373]">No published results available for this selection.</td></tr>
                ) : (
                  results.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 font-mono-num font-bold text-[#171717]">#{r.position}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#171717]">{r.student_name}</div>
                        <div className="text-[11px] text-[#737373] font-mono-num">{r.student_code} · {r.class_name}</div>
                      </td>
                      <td className="px-4 py-3 text-[#737373]">{r.exam_name}</td>
                      <td className="px-4 py-3 text-end font-mono-num font-semibold">{r.obtained_marks} / {r.total_marks}</td>
                      <td className="px-4 py-3 text-end font-mono-num font-bold">{r.percentage}%</td>
                      <td className="px-4 py-3 font-bold text-[#0EA5E9]">{r.grade}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold uppercase ${r.status === 'pass' ? 'text-[#10B981]' : 'text-[#DC1726]'}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <button
                          type="button"
                          onClick={() => setPrintStudentResult(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-200 hover:bg-neutral-100 text-[11px] font-medium"
                        >
                          <Printer className="w-3.5 h-3.5" /> Print Marksheet
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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

      {/* Printable Student Marksheet */}
      <PrintModal open={Boolean(printStudentResult)} title="Official Statement of Marks (Marksheet)" subtitle={printStudentResult?.exam_name} settings={settings} onClose={() => setPrintStudentResult(null)}>
        {printStudentResult && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <div><span className="text-[#737373]">Student Name:</span> <strong>{printStudentResult.student_name}</strong></div>
              <div><span className="text-[#737373]">Student ID:</span> <strong className="font-mono-num">{printStudentResult.student_code}</strong></div>
              <div><span className="text-[#737373]">Class:</span> <strong>{printStudentResult.class_name}</strong></div>
              <div><span className="text-[#737373]">Father&apos;s Name:</span> <strong>{printStudentResult.father_name}</strong></div>
              <div><span className="text-[#737373]">Examination:</span> <strong>{printStudentResult.exam_name}</strong></div>
              <div><span className="text-[#737373]">Class Position:</span> <strong className="font-mono-num">Rank #{printStudentResult.position}</strong></div>
            </div>

            <table className="w-full border-collapse border border-neutral-300">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="border border-neutral-300 px-3 py-2 text-start">Subject</th>
                  <th className="border border-neutral-300 px-3 py-2 text-end">Total Marks</th>
                  <th className="border border-neutral-300 px-3 py-2 text-end">Passing Marks</th>
                  <th className="border border-neutral-300 px-3 py-2 text-end">Obtained Marks</th>
                </tr>
              </thead>
              <tbody>
                {(printStudentResult.subjects || []).map((s: any) => (
                  <tr key={s.id}>
                    <td className="border border-neutral-300 px-3 py-2 font-medium">{s.subject_name}</td>
                    <td className="border border-neutral-300 px-3 py-2 text-end font-mono-num">{s.total_marks}</td>
                    <td className="border border-neutral-300 px-3 py-2 text-end font-mono-num">{s.passing_marks}</td>
                    <td className="border border-neutral-300 px-3 py-2 text-end font-mono-num font-bold">{s.is_absent ? 'ABS' : s.obtained_marks}</td>
                  </tr>
                ))}
                <tr className="bg-neutral-50 font-bold">
                  <td className="border border-neutral-300 px-3 py-2">Grand Total</td>
                  <td className="border border-neutral-300 px-3 py-2 text-end font-mono-num">{printStudentResult.total_marks}</td>
                  <td className="border border-neutral-300 px-3 py-2 text-end">—</td>
                  <td className="border border-neutral-300 px-3 py-2 text-end font-mono-num">{printStudentResult.obtained_marks}</td>
                </tr>
              </tbody>
            </table>

            <div className="grid grid-cols-3 gap-3 p-3 border border-neutral-300 rounded-lg font-semibold">
              <div>Percentage: <span className="font-mono-num">{printStudentResult.percentage}%</span></div>
              <div>Grade: <span>{printStudentResult.grade}</span></div>
              <div>Final Result: <span className="uppercase">{printStudentResult.status}</span></div>
            </div>
            {printStudentResult.teacher_remarks && (
              <div className="text-[#737373]"><strong>Teacher Remarks:</strong> {printStudentResult.teacher_remarks}</div>
            )}
          </div>
        )}
      </PrintModal>

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
