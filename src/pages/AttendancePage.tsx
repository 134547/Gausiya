import React, { useEffect, useRef, useState } from 'react';
import { CheckCheck, Download, Lock, Pencil, Printer, Save, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { exportToExcel } from '../utils/exportUtils.ts';
import { PrintModal } from '../components/PrintModal.tsx';

interface AttendancePageProps {
  user: User;
  settings: MadrasaSettings | null;
}

export const AttendancePage: React.FC<AttendancePageProps> = ({ user, settings }) => {
  const canMark = user.role_slug === 'super_admin' || user.role_slug === 'teacher';
  const isStudent = user.role_slug === 'student';
  const [tab, setTab] = useState<'mark' | 'reports'>(canMark ? 'mark' : 'reports');
  const [sessions, setSessions] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [records, setRecords] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [personalStudent, setPersonalStudent] = useState<{
    id: string;
    full_name: string;
    student_code: string;
    class_name: string;
  } | null>(null);
  const [personalSummary, setPersonalSummary] = useState<{
    total: number;
    present: number;
    absent: number;
    late: number;
    on_leave: number;
    percentage: number;
  }>({ total: 0, present: 0, absent: 0, late: 0, on_leave: 0, percentage: 0 });
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>('');
  const [dailySummary, setDailySummary] = useState<any[]>([]);
  const [studentWise, setStudentWise] = useState<any[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [isSavedLocked, setIsSavedLocked] = useState(false);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<any[]>([]);
  const pendingEditRef = useRef<{ classId: string; date: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!canMark) return;
    Promise.all([
      apiRequest<{ sessions: any[] }>('/api/settings'),
      apiRequest<{ classes: any[] }>('/api/classes'),
    ])
      .then(([sRes, cRes]) => {
        setSessions(sRes.sessions);
        const active = sRes.sessions.find((s: any) => s.is_active) || sRes.sessions[0];
        if (active) setSessionId(String(active.id));
        setClasses(cRes.classes);
        if (cRes.classes[0]) setClassId(String(cRes.classes[0].id));
      })
      .catch((e: any) => setErr(e.message || 'Failed to load attendance configuration'));
  }, [canMark]);

  const loadSheet = async () => {
    if (!canMark || !classId) return;
    setErr('');
    try {
      const qs = new URLSearchParams({ classId, date });
      if (sessionId) qs.set('sessionId', sessionId);
      const res = await apiRequest<{ records: any[]; isLocked?: boolean }>(`/api/attendance?${qs.toString()}`);
      const locked = Boolean(res.isLocked);
      const shouldUnlockImmediately =
        locked &&
        pendingEditRef.current?.classId === classId &&
        pendingEditRef.current?.date === date;
      pendingEditRef.current = null;

      const mapped = res.records.map((r) => ({
        ...r,
        status: r.status === 'unmarked' ? (locked && !shouldUnlockImmediately ? 'unmarked' : 'present') : r.status,
      }));
      setRecords(mapped);
      setSavedSnapshot(mapped.map((r) => ({ ...r })));
      setIsSavedLocked(locked);
      setIsEditingMode(shouldUnlockImmediately);
    } catch (e: any) {
      setRecords([]);
      setSavedSnapshot([]);
      setIsSavedLocked(false);
      setIsEditingMode(false);
      setErr(e.message);
    }
  };

  const loadReports = async () => {
    setErr('');
    try {
      if (!canMark) {
        setLoadingPersonal(true);
        const res = await apiRequest<{
          history: any[];
          student?: { id: string; full_name: string; student_code: string; class_name: string } | null;
          summary?: { total: number; present: number; absent: number; late: number; on_leave: number; percentage: number };
        }>('/api/attendance');
        const list = res.history || [];
        setHistory(list);
        setPersonalStudent(res.student || null);
        if (res.summary) {
          setPersonalSummary(res.summary);
        } else {
          const total = list.length;
          const present = list.filter((h: any) => h.status === 'present').length;
          const absent = list.filter((h: any) => h.status === 'absent').length;
          const late = list.filter((h: any) => h.status === 'late').length;
          const on_leave = list.filter((h: any) => h.status === 'leave').length;
          setPersonalSummary({
            total,
            present,
            absent,
            late,
            on_leave,
            percentage: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
          });
        }
      } else {
        const qs = new URLSearchParams({ mode: 'summary' });
        if (classId) qs.set('classId', classId);
        const res = await apiRequest<{ daily: any[]; studentWise: any[] }>(`/api/attendance?${qs.toString()}`);
        setDailySummary(res.daily || []);
        setStudentWise(res.studentWise || []);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingPersonal(false);
    }
  };

  useEffect(() => {
    if (canMark && tab === 'mark' && classId) loadSheet();
    if (!canMark || tab === 'reports') loadReports();
  }, [canMark, tab, classId, date, sessionId]);

  const isSheetLocked = isSavedLocked && !isEditingMode;

  const markAllPresent = () => {
    if (isSheetLocked) return;
    setRecords((prev) => prev.map((r) => ({ ...r, status: 'present' })));
  };

  const startEditMode = () => {
    setErr('');
    setMsg('');
    setRecords((prev) =>
      prev.map((r) => ({
        ...r,
        status: r.status === 'unmarked' ? 'present' : r.status,
      }))
    );
    setIsEditingMode(true);
  };

  const cancelEditMode = () => {
    setErr('');
    setRecords(savedSnapshot.map((r) => ({ ...r })));
    setIsEditingMode(false);
  };

  const handleSave = async () => {
    if (isSheetLocked) return;
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const payloadRecords = records.map((r) => ({
        student_id: r.student_id,
        status: r.status === 'unmarked' ? 'present' : r.status,
        remark: r.remark || '',
      }));
      const res = await apiRequest<{ summary: any; isLocked?: boolean }>('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: sessionId || undefined,
          classId,
          date,
          allowEdit: isSavedLocked && isEditingMode,
          records: payloadRecords,
        }),
      });
      const updatedRecords = records.map((r) => ({
        ...r,
        status: r.status === 'unmarked' ? 'present' : r.status,
      }));
      setRecords(updatedRecords);
      setSavedSnapshot(updatedRecords.map((r) => ({ ...r })));
      setIsSavedLocked(res.isLocked ?? true);
      setIsEditingMode(false);
      setMsg(
        `${isSavedLocked ? 'Attendance updated and locked' : 'Attendance saved and locked'} for ${date}: ${res.summary.present} Present, ${res.summary.absent} Absent, ${res.summary.late} Late, ${res.summary.leave} Leave.`
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredHistory = history.filter((h) => {
    if (historyStatusFilter !== 'all' && h.status !== historyStatusFilter) return false;
    if (historyMonthFilter && !String(h.attendance_date || '').startsWith(historyMonthFilter)) return false;
    return true;
  });

  const selectedClassName = classes.find((c) => String(c.id) === classId)?.name || 'All Classes';
  const printSubtitle = canMark
    ? `${selectedClassName} · ${date}`
    : isStudent
      ? `${personalStudent?.full_name || user.full_name}${personalStudent?.student_code ? ` (${personalStudent.student_code})` : ''}${personalStudent?.class_name ? ` · ${personalStudent.class_name}` : ''}`
      : 'Student Attendance History';

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {canMark ? (
          <div className="inline-flex items-center gap-1 p-1 bg-neutral-200/70 rounded-lg">
            <button type="button" onClick={() => setTab('mark')} className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'mark' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'}`}>
              Mark Daily Attendance
            </button>
            <button type="button" onClick={() => setTab('reports')} className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'reports' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'}`}>
              Attendance Analytics &amp; Reports
            </button>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-bold text-[#171717]">
              {isStudent ? 'My Attendance' : 'Attendance History'}
            </h2>
            {isStudent && (
              <p className="text-xs text-[#737373]">
                {personalStudent?.full_name || user.full_name}
                {personalStudent?.student_code ? ` · ${personalStudent.student_code}` : ''}
                {personalStudent?.class_name ? ` · Class ${personalStudent.class_name}` : ''}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50"
          >
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
          <button
            type="button"
            onClick={() => {
              const rows = tab === 'mark' && canMark
                ? records.map((r) => ({ ID: r.student_code, Student: r.full_name, Father: r.father_name, Date: date, Class: selectedClassName, Status: r.status, Remark: r.remark }))
                : canMark
                  ? studentWise.map((s) => ({ ID: s.student_code, Student: s.full_name, Class: s.class_name, Present: s.present, Absent: s.absent, Late: s.late, Leave: s.on_leave, Total: s.total_days }))
                  : filteredHistory.map((h) => ({ Date: h.attendance_date, Student: h.student_name, Class: h.class_name, Status: h.status, Remark: h.remark }));
              exportToExcel(rows, `attendance-${date}`, 'Attendance');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {canMark && tab === 'mark' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">Academic Session</label>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white">
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white">
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Attendance Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 font-mono-num" />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={markAllPresent}
                disabled={isSheetLocked || records.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCheck className="w-3.5 h-3.5 text-[#10B981]" /> Mark All Present
              </button>
              {isSheetLocked ? (
                <button
                  type="button"
                  disabled
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-200 text-neutral-600 text-xs font-semibold cursor-not-allowed"
                >
                  <Lock className="w-3.5 h-3.5" /> Locked
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || records.length === 0}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : isEditingMode ? 'Update Attendance' : 'Save'}
                </button>
              )}
            </div>
          </div>

          {isSavedLocked && !isEditingMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
              <div className="flex items-center gap-2.5 text-xs">
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-emerald-900">Attendance Saved &amp; Locked for {date}</div>
                  <div className="text-[11px] text-emerald-700">Attendance cannot be changed directly once saved. Use the separate Edit Attendance option to make changes.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={startEditMode}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 shadow-xs transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Attendance
              </button>
            </div>
          )}

          {isSavedLocked && isEditingMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2.5 text-xs">
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-amber-900">Edit Mode Active</div>
                  <div className="text-[11px] text-amber-700">Modify student statuses or remarks and click Update Attendance. The sheet will lock again after saving.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelEditMode}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Cancel Edit
              </button>
            </div>
          )}

          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                <tr>
                  <th className="px-4 py-2.5 text-start">Student ID</th>
                  <th className="px-4 py-2.5 text-start">Student Name</th>
                  <th className="px-4 py-2.5 text-start">Status</th>
                  <th className="px-4 py-2.5 text-start">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {records.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-[#737373]">No active students enrolled in {selectedClassName}.</td></tr>
                ) : (
                  records.map((r, idx) => (
                    <tr key={r.student_id} className={isSheetLocked ? 'bg-neutral-50/40' : 'hover:bg-neutral-50'}>
                      <td className="px-4 py-2.5 font-mono-num font-semibold">{r.student_code}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-[#171717]">{r.full_name}</div>
                        <div className="text-[11px] text-[#737373]">S/o {r.father_name}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {([
                            ['present', 'bg-[#10B981] text-white border-[#10B981]'],
                            ['absent', 'bg-[#DC1726] text-white border-[#DC1726]'],
                            ['late', 'bg-[#F59E0B] text-white border-[#F59E0B]'],
                            ['leave', 'bg-[#0EA5E9] text-white border-[#0EA5E9]'],
                          ] as const).map(([st, activeCls]) => {
                            const isSelected = r.status === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={isSheetLocked}
                                onClick={() => {
                                  if (isSheetLocked) return;
                                  const next = [...records];
                                  next[idx].status = st;
                                  setRecords(next);
                                }}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize border transition-colors ${
                                  isSelected
                                    ? activeCls
                                    : isSheetLocked
                                      ? 'bg-neutral-100 text-neutral-400 border-neutral-200 opacity-50'
                                      : 'bg-white text-[#737373] border-neutral-200 hover:bg-neutral-50'
                                } ${isSheetLocked ? 'cursor-not-allowed' : ''}`}
                              >
                                {st}
                              </button>
                            );
                          })}
                          {isSheetLocked && r.status === 'unmarked' && (
                            <span className="text-[11px] font-medium text-neutral-400 ml-1">Not Marked</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={r.remark || ''}
                          disabled={isSheetLocked}
                          readOnly={isSheetLocked}
                          onChange={(e) => {
                            if (isSheetLocked) return;
                            const next = [...records];
                            next[idx].remark = e.target.value;
                            setRecords(next);
                          }}
                          placeholder={isSheetLocked ? '-' : 'Optional remark...'}
                          className={`w-full px-2.5 py-1.5 rounded border border-neutral-200 ${
                            isSheetLocked ? 'bg-neutral-100/70 text-neutral-600 cursor-not-allowed' : 'bg-white'
                          }`}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'reports' && canMark && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[#171717] mb-3">Student-Wise Attendance Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                  <tr>
                    <th className="px-4 py-2.5 text-start">Student ID</th>
                    <th className="px-4 py-2.5 text-start">Name</th>
                    <th className="px-4 py-2.5 text-start">Class</th>
                    <th className="px-4 py-2.5 text-end">Present</th>
                    <th className="px-4 py-2.5 text-end">Absent</th>
                    <th className="px-4 py-2.5 text-end">Late</th>
                    <th className="px-4 py-2.5 text-end">Leave</th>
                    <th className="px-4 py-2.5 text-end">Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {studentWise.map((s) => {
                    const pct = s.total_days > 0 ? Math.round(((s.present + s.late) / s.total_days) * 100) : 0;
                    return (
                      <tr key={s.student_id}>
                        <td className="px-4 py-2.5 font-mono-num">{s.student_code}</td>
                        <td className="px-4 py-2.5 font-semibold">{s.full_name}</td>
                        <td className="px-4 py-2.5">{s.class_name}</td>
                        <td className="px-4 py-2.5 text-end font-mono-num text-[#10B981] font-semibold">{s.present}</td>
                        <td className="px-4 py-2.5 text-end font-mono-num text-[#DC1726] font-semibold">{s.absent}</td>
                        <td className="px-4 py-2.5 text-end font-mono-num text-[#F59E0B]">{s.late}</td>
                        <td className="px-4 py-2.5 text-end font-mono-num text-[#0EA5E9]">{s.on_leave}</td>
                        <td className="px-4 py-2.5 text-end font-mono-num font-bold">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[#171717] mb-3">Daily Class-Wise Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                  <tr>
                    <th className="px-4 py-2.5 text-start">Date</th>
                    <th className="px-4 py-2.5 text-start">Class</th>
                    <th className="px-4 py-2.5 text-end">Present</th>
                    <th className="px-4 py-2.5 text-end">Absent</th>
                    <th className="px-4 py-2.5 text-end">Late</th>
                    <th className="px-4 py-2.5 text-end">Leave</th>
                    <th className="px-4 py-2.5 text-end">Total</th>
                    <th className="px-4 py-2.5 text-end">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {dailySummary.map((d, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-mono-num">{d.attendance_date}</td>
                      <td className="px-4 py-2.5 font-medium">{d.class_name}</td>
                      <td className="px-4 py-2.5 text-end font-mono-num text-[#10B981]">{d.present}</td>
                      <td className="px-4 py-2.5 text-end font-mono-num text-[#DC1726]">{d.absent}</td>
                      <td className="px-4 py-2.5 text-end font-mono-num text-[#F59E0B]">{d.late}</td>
                      <td className="px-4 py-2.5 text-end font-mono-num text-[#0EA5E9]">{d.on_leave}</td>
                      <td className="px-4 py-2.5 text-end font-mono-num font-semibold">{d.total}</td>
                      <td className="px-4 py-2.5 text-end">
                        {d.class_id && (
                          <button
                            type="button"
                            onClick={() => {
                              pendingEditRef.current = { classId: String(d.class_id), date: d.attendance_date };
                              setClassId(String(d.class_id));
                              setDate(d.attendance_date);
                              setTab('mark');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 text-[11px] font-semibold"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!canMark && (
        <div className="space-y-5">
          {/* Personal Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
              <div className="text-[11px] text-[#737373] font-medium">Attendance Rate</div>
              <div className="text-xl font-bold font-mono-num text-[#10B981] mt-1">{personalSummary.percentage}%</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
              <div className="text-[11px] text-[#737373] font-medium">Total Marked</div>
              <div className="text-xl font-bold font-mono-num text-[#171717] mt-1">{personalSummary.total}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
              <div className="text-[11px] text-[#737373] font-medium">Present</div>
              <div className="text-xl font-bold font-mono-num text-[#10B981] mt-1">{personalSummary.present}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
              <div className="text-[11px] text-[#737373] font-medium">Absent</div>
              <div className="text-xl font-bold font-mono-num text-[#DC1726] mt-1">{personalSummary.absent}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
              <div className="text-[11px] text-[#737373] font-medium">Late</div>
              <div className="text-xl font-bold font-mono-num text-[#F59E0B] mt-1">{personalSummary.late}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
              <div className="text-[11px] text-[#737373] font-medium">On Leave</div>
              <div className="text-xl font-bold font-mono-num text-[#0EA5E9] mt-1">{personalSummary.on_leave}</div>
            </div>
          </div>

          {/* Month & Status Filters */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1">Filter Month</label>
              <input
                type="month"
                value={historyMonthFilter}
                onChange={(e) => setHistoryMonthFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 font-mono-num"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#737373] mb-1">Status</label>
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 bg-white"
              >
                <option value="all">All Status</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="leave">Leave</option>
              </select>
            </div>
            {(historyMonthFilter || historyStatusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setHistoryMonthFilter('');
                  setHistoryStatusFilter('all');
                }}
                className="self-end px-3 py-1.5 text-xs font-medium text-[#DC1726] hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                  <tr>
                    <th className="px-4 py-3 text-start">Date</th>
                    {!isStudent && <th className="px-4 py-3 text-start">Student</th>}
                    <th className="px-4 py-3 text-start">Class</th>
                    <th className="px-4 py-3 text-start">Status</th>
                    <th className="px-4 py-3 text-start">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingPersonal ? (
                    <tr>
                      <td colSpan={isStudent ? 4 : 5} className="p-6 text-center text-[#737373]">
                        Loading your attendance...
                      </td>
                    </tr>
                  ) : filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={isStudent ? 4 : 5} className="p-6 text-center text-[#737373]">
                        No attendance records found.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((h) => {
                      const badgeCls =
                        h.status === 'present'
                          ? 'bg-emerald-50 border-emerald-200 text-[#10B981]'
                          : h.status === 'absent'
                            ? 'bg-red-50 border-red-200 text-[#DC1726]'
                            : h.status === 'late'
                              ? 'bg-amber-50 border-amber-200 text-[#F59E0B]'
                              : 'bg-sky-50 border-sky-200 text-[#0EA5E9]';
                      return (
                        <tr key={h.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 font-mono-num">{h.attendance_date}</td>
                          {!isStudent && <td className="px-4 py-3 font-medium">{h.student_name}</td>}
                          <td className="px-4 py-3">{h.class_name}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded border text-[11px] font-bold uppercase ${badgeCls}`}>
                              {h.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#737373]">{h.remark || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <PrintModal open={printOpen} title="Official Attendance Sheet" subtitle={printSubtitle} settings={settings} onClose={() => setPrintOpen(false)}>
        <table className="w-full text-xs border-collapse border border-neutral-300">
          <thead>
            <tr className="bg-neutral-100">
              {canMark ? (
                <>
                  <th className="border border-neutral-300 px-3 py-2 text-start">Student ID</th>
                  <th className="border border-neutral-300 px-3 py-2 text-start">Student Name</th>
                </>
              ) : (
                <>
                  <th className="border border-neutral-300 px-3 py-2 text-start">Date</th>
                  <th className="border border-neutral-300 px-3 py-2 text-start">Student</th>
                  <th className="border border-neutral-300 px-3 py-2 text-start">Class</th>
                </>
              )}
              <th className="border border-neutral-300 px-3 py-2 text-start">Status</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Remark</th>
            </tr>
          </thead>
          <tbody>
            {(canMark ? records : filteredHistory).map((r, i) => (
              <tr key={i}>
                {canMark ? (
                  <>
                    <td className="border border-neutral-300 px-3 py-2 font-mono-num">{r.student_code}</td>
                    <td className="border border-neutral-300 px-3 py-2">{r.full_name}</td>
                  </>
                ) : (
                  <>
                    <td className="border border-neutral-300 px-3 py-2 font-mono-num">{r.attendance_date}</td>
                    <td className="border border-neutral-300 px-3 py-2">{r.student_name}</td>
                    <td className="border border-neutral-300 px-3 py-2">{r.class_name}</td>
                  </>
                )}
                <td className="border border-neutral-300 px-3 py-2 uppercase font-semibold">{r.status}</td>
                <td className="border border-neutral-300 px-3 py-2">{r.remark || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintModal>
    </div>
  );
};
