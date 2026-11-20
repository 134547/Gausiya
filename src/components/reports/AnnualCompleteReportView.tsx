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
      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC1726]">
              <BookOpen className="w-4 h-4" />
              <span>One-Click Complete Madarsa Annual Report (21 Official Sections)</span>
            </div>
            <h2 className="text-lg font-extrabold text-[#171717]">
              Annual Institutional Report — {annual?.academicYear || 'Loading...'}
            </h2>
            <p className="text-xs text-[#737373]">
              Compiled directly from verified Madrasa database records ({annual?.startDate || 'All'} to{' '}
              {annual?.endDate || 'Present'}). Download the complete combined multi-page A4 PDF, a
              21-sheet Excel workbook, or any individual section separately.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold hover:bg-neutral-50 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              disabled={loading || !annual}
              onClick={() => setPrintOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold hover:bg-neutral-50 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-[#DC1726]" /> Print Full Book
            </button>
            <button
              type="button"
              disabled={loading || !annual}
              onClick={handleDownloadAllExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> All 21 Sheets (.xlsx)
            </button>
            <button
              type="button"
              disabled={loading || !annual || downloadingAllPdf}
              onClick={handleDownloadCombinedPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#DC1726] text-white text-xs font-bold hover:bg-red-700 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {downloadingAllPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>
                {downloadingAllPdf ? 'Building Multi-Page PDF...' : 'GENERATE COMPLETE ANNUAL PDF'}
              </span>
            </button>
          </div>
        </div>

        {/* Quick Section Index */}
        {annual && (
          <div className="pt-3 border-t border-neutral-100">
            <div className="text-[11px] font-semibold text-[#737373] mb-2">
              Jump to Section (21 Sections):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {annual.sections.map((sec) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  className="px-2.5 py-1 rounded-md border border-neutral-200 bg-neutral-50 hover:bg-red-50 hover:border-red-200 hover:text-[#DC1726] text-[11px] font-medium text-[#171717] transition-colors"
                >
                  {sec.number}. {sec.title}
                </a>
              ))}
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
                  <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
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

                  <div className="overflow-x-auto">
                    {sec.rows.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-[#737373]">
                        No Records Found for this section in {annual.academicYear}.
                      </div>
                    ) : (
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
                    )}
                  </div>
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
                    <table className="w-full text-[10px] border-collapse border border-neutral-300">
                      <thead className="bg-neutral-100">
                        <tr>
                          {cols.map((c) => (
                            <th key={c} className="border border-neutral-300 px-2 py-1 text-start font-semibold">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sec.rows.map((r, idx) => (
                          <tr key={idx}>
                            {cols.map((c) => (
                              <td key={c} className="border border-neutral-300 px-2 py-1 font-mono-num">
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
