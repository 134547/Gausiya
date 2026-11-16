import React, { useEffect, useState } from 'react';
import { Download, FileBarChart, Printer, Search } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { MadrasaSettings } from '../types.ts';
import { exportToExcel } from '../utils/exportUtils.ts';
import { PrintModal } from '../components/PrintModal.tsx';

interface ReportsPageProps {
  settings: MadrasaSettings | null;
}

const REPORT_TYPES = [
  { id: 'total_students', label: 'Total Student Report' },
  { id: 'class_students', label: 'Class-wise Student Report' },
  { id: 'admissions', label: 'Admission Report' },
  { id: 'teachers', label: 'Teacher Report' },
  { id: 'parents', label: 'Parent Report' },
  { id: 'daily_attendance', label: 'Daily Attendance Report' },
  { id: 'monthly_attendance', label: 'Monthly Attendance Report' },
  { id: 'student_attendance', label: 'Student Attendance Report' },
  { id: 'examinations', label: 'Examination Report' },
  { id: 'student_results', label: 'Student Result Report' },
  { id: 'class_results', label: 'Class Result Report' },
  { id: 'homework', label: 'Homework Report' },
  { id: 'user_activity', label: 'User Activity Report' },
];

export const ReportsPage: React.FC<ReportsPageProps> = ({ settings }) => {
  const [reportType, setReportType] = useState('total_students');
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      apiRequest<{ classes: any[] }>('/api/classes').catch(() => ({ classes: [] })),
      apiRequest<{ students: any[] }>('/api/students').catch(() => ({ students: [] })),
    ]).then(([cRes, sRes]) => {
      setClasses(cRes.classes || []);
      setStudents(sRes.students || []);
    });
  }, []);

  const loadReport = async () => {
    setLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams({ type: reportType });
      if (classId) qs.set('classId', classId);
      if (studentId) qs.set('studentId', studentId);
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      if (search) qs.set('search', search);
      const res = await apiRequest<{ rows: Record<string, any>[] }>(`/api/reports?${qs.toString()}`);
      setRows(res.rows || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [reportType, classId, studentId, dateFrom, dateTo]);

  const activeLabel = REPORT_TYPES.find((r) => r.id === reportType)?.label || 'Institutional Report';
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-5">
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-4 h-4 text-[#DC1726]" />
            <h2 className="text-sm font-bold text-[#171717]">Live Institutional Reports (13 Modules)</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportToExcel(rows, `madrasa-${reportType}-${new Date().toISOString().slice(0, 10)}`, activeLabel.slice(0, 30))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-[#10B981]" /> Export Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-medium text-[#737373] mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white font-medium"
            >
              {REPORT_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#737373] mb-1">Class Filter</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
            >
              <option value="">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#737373] mb-1">Student Filter</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
            >
              <option value="">All Students</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#737373] mb-1">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#737373] mb-1">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
            />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadReport();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search keyword in report..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-neutral-200 text-xs"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-[#171717] text-white text-xs font-medium">Apply Filter</button>
          <span className="text-xs text-[#737373] font-mono-num ms-auto">{rows.length} record(s)</span>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373] uppercase text-[11px]">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-4 py-3 text-start whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr><td colSpan={Math.max(1, columns.length)} className="px-4 py-10 text-center text-[#737373]">Generating live database report...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={Math.max(1, columns.length)} className="px-4 py-10 text-center text-[#737373]">No data available for the selected filters.</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50/70">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 text-[#171717] font-mono-num whitespace-nowrap">
                        {String(row[col] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PrintModal open={printOpen} title={activeLabel} subtitle={`Generated records: ${rows.length}`} settings={settings} onClose={() => setPrintOpen(false)}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse border border-neutral-300">
            <thead>
              <tr className="bg-neutral-100">
                {columns.map((col) => (
                  <th key={col} className="border border-neutral-300 px-2.5 py-1.5 text-start">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((col) => (
                    <td key={col} className="border border-neutral-300 px-2.5 py-1.5 font-mono-num">{String(row[col] ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PrintModal>
    </div>
  );
};
