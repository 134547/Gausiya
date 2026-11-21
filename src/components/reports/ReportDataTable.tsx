import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Printer,
  Search,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MadrasaSettings } from '../../types.ts';
import { PrintModal } from '../PrintModal.tsx';
import {
  ReportSummaryCard,
  exportReportToCSV,
  exportReportToExcel,
  exportStructuredReportToPdf,
} from '../../utils/reportExportUtils.ts';

export interface ReportDatasetResponse {
  reportId: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  sessionName: string;
  startDate: string;
  endDate: string;
  notice?: string;
  summaryCards: ReportSummaryCard[];
  columns: string[];
  rows: Record<string, any>[];
  chartData?: any[];
  monthComparison?: {
    currentLabel: string;
    previousLabel: string;
    metrics: { label: string; current: number; previous: number; suffix?: string }[];
  } | null;
  generatedAt: string;
}

interface ReportDataTableProps {
  dataset: ReportDatasetResponse | null;
  loading: boolean;
  error: string;
  settings: MadrasaSettings | null;
}

function parseSortableValue(val: unknown): number | string {
  if (typeof val === 'number') return val;
  const s = String(val ?? '').trim();
  if (!s || s === '—' || s === 'N/A') return -Infinity;
  const cleaned = s.replace(/[%₹,]|Rs\.\s*/gi, '').trim();
  const num = Number(cleaned);
  if (cleaned !== '' && Number.isFinite(num)) return num;
  return s.toLowerCase();
}

export const ReportDataTable: React.FC<ReportDataTableProps> = ({
  dataset,
  loading,
  error,
  settings,
}) => {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [printOpen, setPrintOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const rows = dataset?.rows || [];
  const columns = dataset?.columns || [];

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? rows.filter((r) =>
          columns.some((c) => String(r[c] ?? '').toLowerCase().includes(q))
        )
      : rows;

    if (sortCol && columns.includes(sortCol)) {
      list = [...list].sort((a, b) => {
        const va = parseSortableValue(a[sortCol]);
        const vb = parseSortableValue(b[sortCol]);
        let cmp = 0;
        if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
        else cmp = String(va).localeCompare(String(vb));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, columns, search, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, safePage, pageSize]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleDownloadPdf = async () => {
    if (!dataset || pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportStructuredReportToPdf({
        title: dataset.title,
        subtitle: dataset.subtitle,
        academicYear: dataset.sessionName,
        dateRange:
          dataset.startDate || dataset.endDate
            ? `${dataset.startDate || 'Start'} to ${dataset.endDate || 'Present'}`
            : dataset.periodLabel,
        settings,
        summaryCards: dataset.summaryCards,
        columns,
        rows: filteredAndSorted,
        notice: dataset.notice,
        fileName: `${dataset.title}_${dataset.sessionName}_${new Date().toISOString().slice(0, 10)}`,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const chartNumericKeys = useMemo(() => {
    const cd = dataset?.chartData || [];
    if (!cd.length) return [];
    return Object.keys(cd[0]).filter((k) => k !== 'label' && typeof cd[0][k] === 'number').slice(0, 2);
  }, [dataset?.chartData]);

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + Export Toolbar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#171717] truncate">
              {dataset?.title || 'Loading Report...'}
            </h3>
            <p className="text-xs text-[#737373] mt-0.5">
              {dataset?.periodLabel || '—'} ·{' '}
              <span className="font-mono-num">{filteredAndSorted.length} record(s)</span>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              disabled={loading || !dataset}
              onClick={() => setPrintOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#DC1726]" /> Print Preview
            </button>
            <button
              type="button"
              disabled={loading || !dataset || pdfBusy}
              onClick={handleDownloadPdf}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {pdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span>{pdfBusy ? 'Generating...' : 'Download PDF'}</span>
            </button>
            <button
              type="button"
              disabled={loading || !dataset}
              onClick={() =>
                dataset &&
                exportReportToExcel(
                  filteredAndSorted,
                  `${dataset.title}_${new Date().toISOString().slice(0, 10)}`,
                  dataset.title.slice(0, 30)
                )
              }
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
            </button>
            <button
              type="button"
              disabled={loading || !dataset}
              onClick={() =>
                dataset &&
                exportReportToCSV(
                  filteredAndSorted,
                  `${dataset.title}_${new Date().toISOString().slice(0, 10)}`
                )
              }
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        {dataset && dataset.summaryCards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
            {dataset.summaryCards.map((card, i) => (
              <div
                key={i}
                className="rounded-lg border border-neutral-200 bg-neutral-50/70 px-3 py-2.5"
              >
                <div className="text-[11px] font-medium text-[#737373] truncate">{card.label}</div>
                <div
                  className={`text-base font-bold font-mono-num mt-0.5 ${
                    card.tone === 'emerald'
                      ? 'text-emerald-700'
                      : card.tone === 'red'
                      ? 'text-[#DC1726]'
                      : card.tone === 'amber'
                      ? 'text-amber-700'
                      : 'text-[#171717]'
                  }`}
                >
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notice banner (e.g., when tuition fee ledger is not configured) */}
        {dataset?.notice && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <p className="leading-relaxed">{dataset.notice}</p>
          </div>
        )}

        {/* Previous Month vs Current Month comparison strip */}
        {dataset?.monthComparison && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 space-y-2">
            <div className="text-xs font-bold text-[#171717]">
              Month Comparison: {dataset.monthComparison.previousLabel} vs{' '}
              <span className="text-[#DC1726]">{dataset.monthComparison.currentLabel}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              {dataset.monthComparison.metrics.map((m) => {
                const diff = Math.round((m.current - m.previous) * 10) / 10;
                return (
                  <div key={m.label} className="bg-white rounded-lg border border-neutral-200 p-2.5">
                    <div className="text-[11px] text-[#737373]">{m.label}</div>
                    <div className="flex items-baseline justify-between gap-2 mt-1">
                      <span className="font-bold font-mono-num text-[#171717]">
                        {m.current}
                        {m.suffix || ''}
                      </span>
                      <span
                        className={`text-[11px] font-mono-num font-semibold ${
                          diff > 0
                            ? 'text-emerald-700'
                            : diff < 0
                            ? 'text-[#DC1726]'
                            : 'text-[#737373]'
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                        {m.suffix || ''} vs {m.previous}
                        {m.suffix || ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Optional Embedded Chart when dataset supplies series */}
      {dataset?.chartData && dataset.chartData.length > 0 && chartNumericKeys.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <div className="text-xs font-bold text-[#171717] mb-3">Visual Trend Breakdown</div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataset.chartData} margin={{ top: 6, right: 12, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey={chartNumericKeys[0]} fill="#DC1726" radius={[4, 4, 0, 0]} />
                {chartNumericKeys[1] && (
                  <Bar dataKey={chartNumericKeys[1]} fill="#0F766E" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search + Page Size Bar + Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-2.5 bg-neutral-50/50">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search inside table..."
              className="w-full ps-8 pe-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-[#737373]">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-lg border border-neutral-200 bg-white text-xs font-mono-num text-[#171717]"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Phone-Friendly Card List (< md) */}
        <div className="md:hidden divide-y divide-neutral-100">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-3.5 space-y-2">
                <div className="h-4 bg-neutral-100 rounded animate-pulse w-2/3" />
                <div className="h-3 bg-neutral-100 rounded animate-pulse w-full" />
              </div>
            ))
          ) : paginatedRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-[#737373]">
              <div className="font-semibold text-[#171717] mb-1 text-sm">No Records Found</div>
              <p className="text-xs">
                No database records match the selected academic year, date range, or filters.
              </p>
            </div>
          ) : (
            paginatedRows.map((row, idx) => {
              const primaryCol = columns[0];
              const secondaryCol = columns[1];
              const restCols = columns.slice(2);
              const primaryVal = primaryCol ? String(row[primaryCol] ?? '—') : `Record ${idx + 1}`;
              const secondaryVal = secondaryCol ? String(row[secondaryCol] ?? '') : '';
              return (
                <div key={idx} className="p-3.5 bg-white space-y-2.5">
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-neutral-100">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        {primaryCol}
                      </div>
                      <div className="text-sm font-bold text-[#171717] break-words">
                        {primaryVal}
                      </div>
                    </div>
                    {secondaryCol && secondaryVal && (
                      <div className="text-right shrink-0 max-w-[45%]">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          {secondaryCol}
                        </div>
                        <div className="text-xs font-semibold text-[#DC1726] font-mono-num truncate">
                          {secondaryVal}
                        </div>
                      </div>
                    )}
                  </div>
                  {restCols.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {restCols.map((col) => {
                        const val = String(row[col] ?? '—');
                        const isPass =
                          val === 'PASS' ||
                          val === 'APPROVED' ||
                          val === 'ACTIVE' ||
                          val === 'PUBLISHED';
                        const isFail =
                          val === 'FAIL' || val === 'REJECTED' || val === 'ABSENT';
                        return (
                          <div key={col} className="min-w-0">
                            <div className="text-[10px] text-neutral-500 truncate">{col}</div>
                            <div
                              className={`text-xs font-mono-num break-words ${
                                isPass
                                  ? 'text-emerald-700 font-bold'
                                  : isFail
                                  ? 'text-[#DC1726] font-bold'
                                  : 'text-[#171717] font-medium'
                              }`}
                            >
                              {val}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Tablet & Desktop Full Interactive Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-[#525252] text-[11px] font-semibold">
              <tr>
                {columns.length === 0 ? (
                  <th className="px-4 py-3 text-start">Report Data</th>
                ) : (
                  columns.map((col) => (
                    <th key={col} className="px-3.5 py-3 text-start whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        className="inline-flex items-center gap-1 hover:text-[#171717] cursor-pointer"
                      >
                        <span>{col}</span>
                        {sortCol === col ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-[#DC1726]" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-[#DC1726]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={Math.max(1, columns.length)} className="px-4 py-3">
                      <div className="h-4 bg-neutral-100 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(1, columns.length)}
                    className="px-4 py-12 text-center text-[#737373]"
                  >
                    <div className="font-semibold text-[#171717] mb-1">No Records Found</div>
                    <p className="text-xs">
                      No database records match the selected academic year, date range, or filters.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50/80 transition-colors">
                    {columns.map((col) => {
                      const val = String(row[col] ?? '—');
                      const isPass = val === 'PASS' || val === 'APPROVED' || val === 'ACTIVE' || val === 'PUBLISHED';
                      const isFail = val === 'FAIL' || val === 'REJECTED' || val === 'ABSENT';
                      return (
                        <td
                          key={col}
                          className={`px-3.5 py-2.5 whitespace-nowrap font-mono-num ${
                            isPass
                              ? 'text-emerald-700 font-semibold'
                              : isFail
                              ? 'text-[#DC1726] font-semibold'
                              : 'text-[#171717]'
                          }`}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!loading && filteredAndSorted.length > 0 && (
          <div className="px-4 py-2.5 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs text-[#737373] bg-neutral-50/40">
            <span className="font-mono-num">
              Showing {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, filteredAndSorted.length)} of {filteredAndSorted.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-neutral-200 bg-white disabled:opacity-40 hover:bg-neutral-50 cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono-num font-semibold text-[#171717]">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-neutral-200 bg-white disabled:opacity-40 hover:bg-neutral-50 cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Print Preview Modal */}
      {dataset && (
        <PrintModal
          open={printOpen}
          title={dataset.title}
          subtitle={`${dataset.periodLabel} · ${filteredAndSorted.length} record(s)`}
          settings={settings}
          onClose={() => setPrintOpen(false)}
        >
          <div className="space-y-4">
            {dataset.summaryCards.length > 0 && (
              <div className="grid grid-cols-4 gap-2 text-xs">
                {dataset.summaryCards.map((c, idx) => (
                  <div key={idx} className="border border-neutral-300 rounded p-2">
                    <div className="text-[10px] text-[#737373]">{c.label}</div>
                    <div className="font-bold font-mono-num text-sm text-[#171717]">{c.value}</div>
                  </div>
                ))}
              </div>
            )}
            <table
              className={`w-full border-collapse border border-neutral-300 table-fixed ${
                columns.length > 7 ? 'text-[9.5px]' : 'text-[10.5px]'
              }`}
            >
              <thead className="bg-neutral-100">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="border border-neutral-300 px-1.5 py-1.5 text-start font-semibold break-words"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, columns.length)} className="border border-neutral-300 px-3 py-6 text-center text-[#737373]">
                      No Records Found
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((row, idx) => (
                    <tr key={idx}>
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="border border-neutral-300 px-1.5 py-1 font-mono-num break-words"
                        >
                          {String(row[col] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PrintModal>
      )}
    </div>
  );
};
