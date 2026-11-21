import React, { useState } from 'react';
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { MadrasaSettings } from '../../types.ts';
import { PrintModal } from '../PrintModal.tsx';
import {
  AnnualCompletePayload,
  exportAnnualBookToPdf,
  exportMultiSheetExcel,
  exportReportToCSV,
  exportReportToExcel,
} from '../../utils/reportExportUtils.ts';

interface AnnualCompleteReportViewProps {
  annual: AnnualCompletePayload | null;
  loading: boolean;
  error: string;
  settings: MadrasaSettings | null;
  onRegenerate: () => void;
}

export const AnnualCompleteReportView: React.FC<AnnualCompleteReportViewProps> = ({
  annual,
  loading,
  error,
  settings,
  onRegenerate,
}) => {
  const [downloadingAllPdf, setDownloadingAllPdf] = useState(false);
  const [downloadingSecId, setDownloadingSecId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const handleDownloadCombinedPdf = async () => {
    if (!annual || downloadingAllPdf) return;
    setDownloadingAllPdf(true);
    try {
      await exportAnnualBookToPdf(annual, settings);
    } finally {
      setDownloadingAllPdf(false);
    }
  };

  const handleDownloadSectionPdf = async (sectionId: string) => {
    if (!annual || downloadingSecId) return;
    setDownloadingSecId(sectionId);
    try {
      await exportAnnualBookToPdf(annual, settings, sectionId);
    } finally {
      setDownloadingSecId(null);
    }
  };

  const handleDownloadAllExcel = () => {
    if (!annual) return;
    exportMultiSheetExcel(
      annual.sections.map((sec) => ({
        name: `${sec.number}_${sec.title}`,
        rows: sec.rows,
      })),
      `Madrasa_Complete_Annual_Report_${annual.academicYear}`
    );
  };

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero Banner / One-Click Annual Generator */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC1726]">
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>One-Click Complete Madarsa Annual Report (21 Official Sections)</span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#171717]">
              Annual Institutional Report — {annual?.academicYear || 'Loading...'}
            </h2>
            <p className="text-xs text-[#737373]">
              Compiled directly from verified Madrasa database records ({annual?.startDate || 'All'} to{' '}
              {annual?.endDate || 'Present'}). Download the complete combined multi-page A4 PDF, a
              21-sheet Excel workbook, or any individual section separately.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold hover:bg-neutral-50 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              disabled={loading || !annual}
              onClick={() => setPrintOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold hover:bg-neutral-50 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-[#DC1726]" /> Print Book
            </button>
            <button
              type="button"
              disabled={loading || !annual}
              onClick={handleDownloadAllExcel}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> 21 Sheets (.xlsx)
            </button>
            <button
              type="button"
              disabled={loading || !annual || downloadingAllPdf}
              onClick={handleDownloadCombinedPdf}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#DC1726] text-white text-xs font-bold hover:bg-red-700 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {downloadingAllPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>
                {downloadingAllPdf ? 'Building PDF...' : 'GENERATE COMPLETE ANNUAL PDF'}
              </span>
            </button>
          </div>
        </div>

        {/* Quick Section Index (Clean Select on Phone, Single-Row Scroll Strip on Desktop) */}
        {annual && (
          <div className="pt-3 border-t border-neutral-100">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-[11px] font-semibold text-[#737373] shrink-0">
                Jump to Section (21):
              </span>
              <select
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const el = document.getElementById(id);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                aria-label="Jump to Annual Report Section"
                className="sm:hidden w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-semibold text-[#171717]"
              >
                <option value="">Select any section (1–21)...</option>
                {annual.sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.number}. {sec.title}
                  </option>
                ))}
              </select>
              <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 flex-1">
                {annual.sections.map((sec) => (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    className="px-2.5 py-1 rounded-md border border-neutral-200 bg-neutral-50 hover:bg-red-50 hover:border-red-200 hover:text-[#DC1726] text-[11px] font-medium text-[#171717] transition-colors whitespace-nowrap shrink-0"
                  >
                    {sec.number}. {sec.title}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && !annual ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center text-xs text-[#737373]">
          <Loader2 className="w-6 h-6 animate-spin text-[#DC1726] mx-auto mb-2" />
          Compiling all 21 Annual Madarsa Report sections from live database...
        </div>
      ) : (
        annual && (
          <div className="space-y-4">
            {annual.sections.map((sec) => {
              const cols = sec.rows.length > 0 ? Object.keys(sec.rows[0]) : [];
              return (
                <section
                  key={sec.id}
                  id={sec.id}
                  className="bg-white rounded-xl border border-neutral-200 overflow-hidden scroll-mt-24"
                >
                  <div className="px-3.5 sm:px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#171717]">
                        {sec.number}. {sec.title}
                      </h3>
                      <p className="text-xs text-[#737373] mt-0.5">{sec.summary}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={downloadingSecId === sec.id}
                        onClick={() => handleDownloadSectionPdf(sec.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-[11px] font-semibold text-[#171717] hover:bg-neutral-50 cursor-pointer disabled:opacity-50"
                      >
                        {downloadingSecId === sec.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <FileText className="w-3 h-3 text-[#DC1726]" />
                        )}
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          exportReportToExcel(
                            sec.rows,
                            `Annual_${annual.academicYear}_Sec${sec.number}_${sec.title}`,
                            sec.title.slice(0, 30)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3 h-3" /> Excel
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          exportReportToCSV(
                            sec.rows,
                            `Annual_${annual.academicYear}_Sec${sec.number}_${sec.title}`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-[11px] font-semibold text-[#171717] hover:bg-neutral-50 cursor-pointer"
                      >
                        <Download className="w-3 h-3" /> CSV
                      </button>
                    </div>
                  </div>

                  {sec.rows.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-[#737373]">
                      No Records Found for this section in {annual.academicYear}.
                    </div>
                  ) : (
                    <>
                      {/* Phone App Card List (< md) */}
                      <div className="md:hidden divide-y divide-neutral-100">
                        {sec.rows.map((r, idx) => {
                          const primaryCol = cols[0];
                          const restCols = cols.slice(1);
                          return (
                            <div key={`m-sec-${sec.id}-${idx}`} className="p-3 space-y-1.5">
                              {primaryCol && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                    {primaryCol}
                                  </span>
                                  <span className="text-xs font-bold text-[#171717] text-end">
                                    {String(r[primaryCol] ?? '—')}
                                  </span>
                                </div>
                              )}
                              {restCols.length > 0 && (
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 border-t border-neutral-100 text-[11px]">
                                  {restCols.map((c) => (
                                    <div key={c} className="min-w-0">
                                      <div className="text-[10px] text-neutral-500 truncate">{c}</div>
                                      <div className="font-mono-num font-semibold text-[#171717] truncate">
                                        {String(r[c] ?? '—')}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Tablet & Desktop Table (md+) */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white border-b border-neutral-200 text-[#525252] text-[11px]">
                            <tr>
                              {cols.map((c) => (
                                <th key={c} className="px-3.5 py-2.5 text-start font-semibold whitespace-nowrap">
                                  {c}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {sec.rows.map((r, idx) => (
                              <tr key={idx} className="hover:bg-neutral-50/60">
                                {cols.map((c) => (
                                  <td key={c} className="px-3.5 py-2 font-mono-num whitespace-nowrap text-[#171717]">
                                    {String(r[c] ?? '—')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )
      )}

      {/* Full Print Preview Modal */}
      {annual && (
        <PrintModal
          open={printOpen}
          title={`Complete Annual Madarsa Report — ${annual.academicYear}`}
          subtitle={`21 Official Sections · ${annual.startDate || 'All'} to ${annual.endDate || 'Present'}`}
          settings={settings}
          onClose={() => setPrintOpen(false)}
        >
          <div className="space-y-6">
            {annual.sections.map((sec) => {
              const cols = sec.rows.length > 0 ? Object.keys(sec.rows[0]) : [];
              return (
                <div key={sec.id} className="space-y-1.5 break-inside-avoid-page">
                  <h4 className="text-xs font-bold text-[#DC1726] border-b border-neutral-300 pb-1">
                    {sec.number}. {sec.title}
                  </h4>
                  <p className="text-[11px] text-[#525252]">{sec.summary}</p>
                  {sec.rows.length === 0 ? (
                    <div className="text-[11px] italic text-[#737373] py-1">No Records Found</div>
                  ) : (
                    <table
                      className={`w-full border-collapse border border-neutral-300 table-fixed ${
                        cols.length > 7 ? 'text-[9px]' : 'text-[10px]'
                      }`}
                    >
                      <thead className="bg-neutral-100">
                        <tr>
                          {cols.map((c) => (
                            <th
                              key={c}
                              className="border border-neutral-300 px-1.5 py-1 text-start font-semibold break-words"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sec.rows.map((r, idx) => (
                          <tr key={idx}>
                            {cols.map((c) => (
                              <td
                                key={c}
                                className="border border-neutral-300 px-1.5 py-1 font-mono-num break-words"
                              >
                                {String(r[c] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </PrintModal>
      )}
    </div>
  );
};
