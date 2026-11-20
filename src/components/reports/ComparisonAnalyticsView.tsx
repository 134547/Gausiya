import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../../lib/api.ts';
import { MadrasaSettings } from '../../types.ts';
import { PrintModal } from '../PrintModal.tsx';
import {
  exportReportToCSV,
  exportReportToExcel,
  exportStructuredReportToPdf,
} from '../../utils/reportExportUtils.ts';
import { ReportMetaData } from './reportCatalog.ts';

interface ComparisonAnalyticsViewProps {
  meta: ReportMetaData | null;
  settings: MadrasaSettings | null;
}

type CompareMode = 'month_vs_month' | 'quarter_vs_quarter' | 'year_vs_year' | 'class_vs_class' | 'exam_vs_exam';

export const ComparisonAnalyticsView: React.FC<ComparisonAnalyticsViewProps> = ({
  meta,
  settings,
}) => {
  const nowYm = new Date().toISOString().slice(0, 7);
  const nowYear = new Date().getFullYear();
  const prevMonthDate = new Date();
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevYm = prevMonthDate.toISOString().slice(0, 7);

  const [mode, setMode] = useState<CompareMode>('month_vs_month');
  const [leftVal, setLeftVal] = useState(prevYm);
  const [rightVal, setRightVal] = useState(nowYm);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const switchMode = (nextMode: CompareMode) => {
    setMode(nextMode);
    if (nextMode === 'month_vs_month') {
      setLeftVal(prevYm);
      setRightVal(nowYm);
    } else if (nextMode === 'quarter_vs_quarter') {
      setLeftVal(`${nowYear}-Q1`);
      setRightVal(`${nowYear}-Q2`);
    } else if (nextMode === 'year_vs_year') {
      const sessions = meta?.sessions || [];
      setLeftVal(sessions[1]?.id || sessions[0]?.id || String(nowYear - 1));
      setRightVal(sessions[0]?.id || String(nowYear));
    } else if (nextMode === 'class_vs_class') {
      const cls = meta?.classes || [];
      setLeftVal(cls[0]?.id || '');
      setRightVal(cls[1]?.id || cls[0]?.id || '');
    } else if (nextMode === 'exam_vs_exam') {
      const exs = meta?.examinations || [];
      setLeftVal(exs[1]?.id || exs[0]?.id || '');
      setRightVal(exs[0]?.id || '');
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErr('');
      try {
        const qs = new URLSearchParams({ mode, left: leftVal, right: rightVal });
        const data = await apiRequest<any>(`/api/reports-erp/compare?${qs.toString()}`);
        if (active) setResult(data);
      } catch (e: any) {
        if (active) setErr(e?.message || 'Comparison failed');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [mode, leftVal, rightVal]);

  const handleDownloadPdf = async () => {
    if (!result || pdfBusy) return;
    setPdfBusy(true);
    try {
      const rows = result.comparisonRows || [];
      const cols = rows.length ? Object.keys(rows[0]) : ['Metric'];
      await exportStructuredReportToPdf({
        title: `Comparison Report: ${result.left.label} vs ${result.right.label}`,
        subtitle: `Mode: ${mode.replace(/_/g, ' ').toUpperCase()}`,
        settings,
        columns: cols,
        rows,
        fileName: `Comparison_${result.left.label}_vs_${result.right.label}`,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const quarterOptions = [nowYear - 1, nowYear, nowYear + 1].flatMap((y) => [
    { value: `${y}-Q1`, label: `Q1 ${y} (Jan–Mar)` },
    { value: `${y}-Q2`, label: `Q2 ${y} (Apr–Jun)` },
    { value: `${y}-Q3`, label: `Q3 ${y} (Jul–Sep)` },
    { value: `${y}-Q4`, label: `Q4 ${y} (Oct–Dec)` },
  ]);

  const pieData = result
    ? [
        { name: result.left.label, value: Math.max(0, result.left.studentStrength + result.left.admissions) },
        { name: result.right.label, value: Math.max(0, result.right.studentStrength + result.right.admissions) },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#171717] inline-flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[#DC1726]" />
              <span>Advanced Period &amp; Entity Comparison</span>
            </h3>
            <p className="text-xs text-[#737373]">
              Compare any two months, quarters, academic years, classes, or examinations side-by-side.
            </p>
          </div>
          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPrintOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold hover:bg-neutral-50 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#DC1726]" /> Print
              </button>
              <button
                type="button"
                disabled={pdfBusy}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
              >
                {pdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} PDF
              </button>
              <button
                type="button"
                onClick={() =>
                  exportReportToExcel(
                    result.comparisonRows || [],
                    `Comparison_${result.left.label}_vs_${result.right.label}`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
              <button
                type="button"
                onClick={() =>
                  exportReportToCSV(
                    result.comparisonRows || [],
                    `Comparison_${result.left.label}_vs_${result.right.label}`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold hover:bg-neutral-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          )}
        </div>

        {/* Comparison Mode Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-neutral-100 rounded-lg">
          {(
            [
              { id: 'month_vs_month', label: 'Month vs Month' },
              { id: 'quarter_vs_quarter', label: 'Quarter vs Quarter' },
              { id: 'year_vs_year', label: 'Year vs Year' },
              { id: 'class_vs_class', label: 'Class vs Class' },
              { id: 'exam_vs_exam', label: 'Exam vs Exam' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchMode(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                mode === tab.id ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Left & Right Period Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-[#737373] mb-1">Period / Group A (Baseline)</label>
            {mode === 'month_vs_month' ? (
              <input type="month" value={leftVal} onChange={(e) => setLeftVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
            ) : mode === 'quarter_vs_quarter' ? (
              <select value={leftVal} onChange={(e) => setLeftVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                {quarterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : mode === 'year_vs_year' ? (
              <select value={leftVal} onChange={(e) => setLeftVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                {(meta?.sessions || []).map((s) => <option key={s.id} value={s.id}>Academic Year {s.name}</option>)}
                {(meta?.calendarYears || []).map((y) => <option key={y} value={y}>Calendar Year {y}</option>)}
              </select>
            ) : mode === 'class_vs_class' ? (
              <select value={leftVal} onChange={(e) => setLeftVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                {(meta?.classes || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <select value={leftVal} onChange={(e) => setLeftVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                {(meta?.examinations || []).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.start_date})</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#737373] mb-1">Period / Group B (Comparison)</label>
            {mode === 'month_vs_month' ? (
              <input type="month" value={rightVal} onChange={(e) => setRightVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
            ) : mode === 'quarter_vs_quarter' ? (
              <select value={rightVal} onChange={(e) => setRightVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                {quarterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : mode === 'year_vs_year' ? (
              <select value={rightVal} onChange={(e) => setRightVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                {(meta?.sessions || []).map((s) => <option key={s.id} value={s.id}>Academic Year {s.name}</option>)}
                {(meta?.calendarYears || []).map((y) => <option key={y} value={y}>Calendar Year {y}</option>)}
              </select>
            ) : mode === 'class_vs_class' ? (
              <select value={rightVal} onChange={(e) => setRightVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                {(meta?.classes || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <select value={rightVal} onChange={(e) => setRightVal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                {(meta?.examinations || []).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.start_date})</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {err && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC1726]">{err}</div>}

      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-10 text-center text-xs text-[#737373]">
          <Loader2 className="w-5 h-5 animate-spin text-[#DC1726] mx-auto mb-2" />
          Running real database comparison...
        </div>
      ) : (
        result && (
          <>
            {/* Bar + Line + Pie Chart Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <div className="text-xs font-bold text-[#171717] mb-3">Bar Chart Comparison</div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.chartComparison} margin={{ top: 6, right: 8, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="metric" tick={{ fontSize: 10, fill: '#737373' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#737373' }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="left" name={result.left.label} fill="#171717" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="right" name={result.right.label} fill="#DC1726" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <div className="text-xs font-bold text-[#171717] mb-3">Line Trend Comparison</div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.chartComparison} margin={{ top: 6, right: 8, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="metric" tick={{ fontSize: 10, fill: '#737373' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#737373' }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="left" name={result.left.label} stroke="#171717" strokeWidth={2} />
                      <Line type="monotone" dataKey="right" name={result.right.label} stroke="#059669" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <div className="text-xs font-bold text-[#171717] mb-3">Relative Volume Share</div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={3}>
                        <Cell fill="#171717" />
                        <Cell fill="#DC1726" />
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Side-by-Side Comparison Table */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-[#525252]">
                    <tr>
                      {Object.keys(result.comparisonRows[0] || {}).map((col) => (
                        <th key={col} className="px-4 py-3 text-start font-semibold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {(result.comparisonRows || []).map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-neutral-50/70">
                        {Object.entries(row).map(([k, v]) => {
                          const str = String(v ?? '—');
                          const isChange = k === 'Change';
                          const num = parseFloat(str);
                          return (
                            <td
                              key={k}
                              className={`px-4 py-2.5 font-mono-num whitespace-nowrap ${
                                isChange && Number.isFinite(num)
                                  ? num > 0
                                    ? 'text-emerald-700 font-bold'
                                    : num < 0
                                    ? 'text-[#DC1726] font-bold'
                                    : 'text-[#737373]'
                                  : 'text-[#171717]'
                              }`}
                            >
                              {isChange && Number.isFinite(num) && num > 0 ? `+${str}` : str}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <PrintModal
              open={printOpen}
              title={`Comparison Report: ${result.left.label} vs ${result.right.label}`}
              subtitle={mode.replace(/_/g, ' ').toUpperCase()}
              settings={settings}
              onClose={() => setPrintOpen(false)}
            >
              <table className="w-full text-xs border-collapse border border-neutral-300">
                <thead className="bg-neutral-100">
                  <tr>
                    {Object.keys(result.comparisonRows[0] || {}).map((col) => (
                      <th key={col} className="border border-neutral-300 px-3 py-2 text-start font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.comparisonRows || []).map((row: any, idx: number) => (
                    <tr key={idx}>
                      {Object.values(row).map((v: any, i: number) => (
                        <td key={i} className="border border-neutral-300 px-3 py-2 font-mono-num">
                          {String(v ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </PrintModal>
          </>
        )
      )}
    </div>
  );
};
