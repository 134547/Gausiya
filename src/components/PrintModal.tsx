import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Maximize2, Minimize2, Printer, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from './MadrasaLogo.tsx';
import { A4_CANVAS_WIDTH_PX, ScaledA4Viewport } from './ScaledA4Viewport.tsx';

interface PrintModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  settings: MadrasaSettings | null;
  onClose: () => void;
  children: React.ReactNode;
  extraPages?: React.ReactNode;
  standalone?: boolean;
  headerActions?: React.ReactNode;
}

async function resolveExternalImagesForCapture(rootEl: HTMLElement): Promise<() => void> {
  const imgs = Array.from(rootEl.querySelectorAll('img'));
  const restores: Array<{ img: HTMLImageElement; originalSrc: string }> = [];

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;

      let absoluteUrl = src;
      try {
        absoluteUrl = new URL(src, window.location.origin).toString();
      } catch {
        return;
      }

      const isSameOrigin = absoluteUrl.startsWith(window.location.origin);
      try {
        let dataUrl = '';
        if (isSameOrigin) {
          const resp = await fetch(absoluteUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result || ''));
              reader.readAsDataURL(blob);
            });
          }
        } else {
          const resp = await fetch(
            `/api/public/image-data?url=${encodeURIComponent(absoluteUrl)}`
          );
          if (resp.ok) {
            const json = await resp.json().catch(() => null);
            dataUrl = json?.dataUrl || '';
          }
        }

        if (dataUrl) {
          restores.push({ img, originalSrc: src });
          img.setAttribute('src', dataUrl);
          await img.decode().catch(() => {});
        }
      } catch {
        // leave original src if fetch fails
      }
    })
  );

  return () => {
    for (const item of restores) {
      item.img.setAttribute('src', item.originalSrc);
    }
  };
}

async function addElementPagesToPdf(pdf: jsPDF, el: HTMLElement, isFirstDocPage: boolean) {
  const restoreImages = await resolveExternalImagesForCapture(el);
  try {
    const captureWidth = Math.max(el.offsetWidth || A4_CANVAS_WIDTH_PX, A4_CANVAS_WIDTH_PX);
    const captureHeight = el.scrollHeight || el.offsetHeight;
    const captureOpts = {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      width: captureWidth,
      height: captureHeight,
      style: {
        transform: 'none',
        margin: '0',
        width: `${captureWidth}px`,
        maxWidth: `${captureWidth}px`,
      },
    };

    let dataUrl: string;
    try {
      dataUrl = await toPng(el, {
        ...captureOpts,
        cacheBust: true,
      });
    } catch {
      // Retry without font embedding if an external stylesheet blocks CSS rule inspection
      dataUrl = await toPng(el, {
        ...captureOpts,
        skipFonts: true,
      });
    }

    const imgProps = pdf.getImageProperties(dataUrl);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const totalRenderedHeight = (imgProps.height * usableWidth) / imgProps.width;

    if (!isFirstDocPage) {
      pdf.addPage();
    }

    // If single-page document (e.g., Grade Card, Admission Form, ID Card) fits cleanly or is within 10%
    // of a single A4 height, scale proportionally onto 1 crisp A4 page instead of spilling a footer strip onto Page 2.
    if (totalRenderedHeight <= usableHeight) {
      pdf.addImage(dataUrl, 'PNG', margin, margin, usableWidth, totalRenderedHeight, undefined, 'FAST');
      return;
    }

    if (totalRenderedHeight <= usableHeight * 1.12) {
      const fitScale = usableHeight / totalRenderedHeight;
      const fittedWidth = usableWidth * fitScale;
      const fittedHeight = usableHeight;
      const xOffset = margin + (usableWidth - fittedWidth) / 2;
      pdf.addImage(dataUrl, 'PNG', xOffset, margin, fittedWidth, fittedHeight, undefined, 'FAST');
      return;
    }

    // Multi-page document pagination
    let heightLeft = totalRenderedHeight;
    let yPosition = margin;

    pdf.addImage(dataUrl, 'PNG', margin, yPosition, usableWidth, totalRenderedHeight, undefined, 'FAST');
    heightLeft -= usableHeight;

    while (heightLeft > 2) {
      yPosition = margin - (totalRenderedHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(dataUrl, 'PNG', margin, yPosition, usableWidth, totalRenderedHeight, undefined, 'FAST');
      heightLeft -= usableHeight;
    }
  } finally {
    restoreImages();
  }
}

export const PrintModal: React.FC<PrintModalProps> = ({
  open,
  title,
  subtitle,
  settings,
  onClose,
  children,
  extraPages,
  standalone = false,
  headerActions,
}) => {
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual'>('fit');
  const [pdfDownloadLink, setPdfDownloadLink] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setStatusNotice('');
      setErrorNotice('');
      setZoomMode('fit');
      setPdfDownloadLink((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return null;
      });
      return;
    }
    document.body.classList.add('printing-modal');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('printing-modal');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const getCleanFileName = () => {
    const cleanBase = [title, subtitle]
      .filter(Boolean)
      .join(' - ')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, '_')
      .trim();
    return cleanBase || 'Madrasa_Document';
  };

  const handleDownloadPdf = async (triggeredFromBlockedPrint = false) => {
    if (!page1Ref.current || generatingPdf) return;
    setGeneratingPdf(true);
    setErrorNotice('');
    if (!triggeredFromBlockedPrint) {
      setStatusNotice('');
    }
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 600)),
        ]);
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      await addElementPagesToPdf(pdf, page1Ref.current, true);
      if (page2Ref.current) {
        await addElementPagesToPdf(pdf, page2Ref.current, false);
      }

      const fileName = `${getCleanFileName()}.pdf`;
      const blob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      setPdfDownloadLink((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url: blobUrl, name: fileName };
      });
      pdf.save(fileName);

      setStatusNotice(
        triggeredFromBlockedPrint
          ? `Direct print popup is blocked in this preview window, so "${fileName}" was generated as A4 PDF.`
          : `Saved "${fileName}" in crisp A4 format.`
      );
    } catch (err: any) {
      setErrorNotice(err?.message || 'Could not generate PDF. Please try again.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrint = async () => {
    setErrorNotice('');
    setStatusNotice('');
    const previousTitle = document.title;
    const cleanTitle = getCleanFileName().replace(/_/g, ' ');
    document.title = cleanTitle;

    let beforePrintFired = false;
    const onBeforePrint = () => {
      beforePrintFired = true;
    };
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', restoreTitle);

    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 600)),
        ]);
      }
    } catch {
      // ignore font wait errors
    }

    try {
      window.print();
    } catch {
      // ignore thrown print error in strict sandboxes
    }

    // In sandboxed iframes (without allow-modals), window.print() silently does nothing
    // and never fires beforeprint. Detect that within 450ms and automatically download PDF.
    setTimeout(() => {
      if (!beforePrintFired) {
        restoreTitle();
        handleDownloadPdf(true);
      } else {
        setTimeout(restoreTitle, 3000);
      }
    }, 450);
  };

  const modalContent = (
    <div className="print-modal-portal fixed inset-0 z-50 bg-black/65 overflow-y-auto p-0 sm:p-5">
      <div className="mx-auto max-w-[880px] min-h-full sm:min-h-0 bg-neutral-100 sm:rounded-2xl shadow-2xl border-0 sm:border border-neutral-200 overflow-hidden print-sheet flex flex-col">
        {/* Sticky Mobile-Friendly App Toolbar */}
        <div className="sticky top-0 z-20 px-3 sm:px-5 py-3 bg-white border-b border-neutral-200 no-print space-y-2.5 shadow-xs">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base font-bold text-[#171717] truncate">{title}</h3>
              {subtitle && <p className="text-[11px] sm:text-xs text-[#737373] truncate">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-neutral-100 transition-colors cursor-pointer shrink-0"
              aria-label="Close print preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              disabled={generatingPdf}
              onClick={() => handleDownloadPdf(false)}
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[#141E30] text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60 flex-1 sm:flex-none"
            >
              {generatingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{generatingPdf ? 'Preparing PDF...' : 'Download A4 PDF'}</span>
            </button>
            <button
              type="button"
              disabled={generatingPdf}
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs sm:text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-60 flex-1 sm:flex-none"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            {headerActions}

            {/* Mobile/Tablet A4 Fit vs 100% Zoom Toggle */}
            <button
              type="button"
              onClick={() => setZoomMode((m) => (m === 'fit' ? 'actual' : 'fit'))}
              className="lg:hidden inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              title="Toggle Fit to Phone Screen vs 100% Zoom"
            >
              {zoomMode === 'fit' ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>100%</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Fit</span>
                </>
              )}
            </button>
          </div>

          {statusNotice && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex flex-wrap items-center justify-between gap-2">
              <span>{statusNotice}</span>
              {pdfDownloadLink && (
                <a
                  href={pdfDownloadLink.url}
                  download={pdfDownloadLink.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-700 text-white font-semibold hover:bg-emerald-800 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" /> Save PDF File
                </a>
              )}
            </div>
          )}
          {errorNotice && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
              {errorNotice}
            </div>
          )}
        </div>

        {/* Native Paper Viewer Desk Backdrop */}
        <div className="flex-1 p-2.5 sm:p-6 space-y-5 bg-[#E5E7EB] print:p-0 print:bg-white print:space-y-0">
          <ScaledA4Viewport
            sheetRef={page1Ref}
            sheetWidth={A4_CANVAS_WIDTH_PX}
            showZoomToggle={false}
            zoomMode={zoomMode}
            onZoomModeChange={setZoomMode}
            sheetClassName={`${
              standalone ? 'p-4' : 'p-5'
            } shadow-md rounded-sm border border-neutral-200 print:shadow-none print:border-0 print:rounded-none print:p-0`}
          >
            {standalone ? (
              children
            ) : (
              <div className="flex flex-col">
                {/* Formal Double-Bordered Institutional Document Frame (Everything inside Margin) */}
                <div className="border-[1.5px] border-[#1E293B] p-[3px] bg-white">
                  <div className="border border-[#CBD5E1] px-6 py-5 bg-white min-h-[930px] flex flex-col justify-between">
                    <div>
                      {/* Executive Dual-Tone Accent Rule */}
                      <div className="h-[3.5px] w-full flex overflow-hidden rounded-xs mb-4">
                        <div className="w-[72%] bg-[#141E30]" />
                        <div className="w-[28%] bg-[#DC1726]" />
                      </div>

                      {/* Official Institutional Letterhead (Clean — Contact Info sits outside bottom margin) */}
                      <div className="flex flex-row items-center justify-between gap-4 pb-4 border-b border-[#CBD5E1]">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <MadrasaLogo logoUrl={settings?.logo_url} size={62} />
                          <div className="min-w-0">
                            <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#DC1726]">
                              Official Institutional Record
                            </div>
                            <h1 className="text-[19px] font-extrabold uppercase tracking-[0.02em] text-[#0F172A] leading-tight mt-0.5">
                              {settings?.name || 'Madrasa Gausiya Razvia'}
                            </h1>
                            <p className="text-[10.5px] text-[#475569] mt-0.5 leading-snug max-w-[390px]">
                              {settings?.address ||
                                'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="urdu-text text-[20px] font-bold text-[#DC1726] leading-snug" dir="rtl">
                            {settings?.name_urdu || 'مدرسہ غوثیہ رضویہ'}
                          </p>
                          <p className="urdu-text text-[11.5px] text-[#475569] leading-snug" dir="rtl">
                            {settings?.address_urdu || 'اسلام نگر، رام گڑھ، پلاموں، جھارکھنڈ، انڈیا'}
                          </p>
                          <p className="text-[10.5px] font-semibold text-[#1E293B] mt-1.5 font-mono-num">
                            Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      {/* Executive Report Title Banner */}
                      <div className="my-4 py-2.5 px-4 bg-[#F8FAFC] border-y border-[#1E293B]/25 text-center">
                        <h2 className="text-[13.5px] font-extrabold uppercase tracking-[0.06em] text-[#0F172A]">
                          {title}
                        </h2>
                        {subtitle && (
                          <p className="text-[10.5px] font-medium text-[#475569] mt-0.5">
                            {subtitle}
                          </p>
                        )}
                      </div>

                      {/* Main Report Body */}
                      <div className="mt-2">{children}</div>
                    </div>

                    {/* Official Authorization & Signature Block (Inside Bottom of Margin Frame) */}
                    <div className="mt-8 pt-4 border-t border-[#E2E8F0]">
                      <div className="grid grid-cols-3 gap-8 text-center text-[11px] text-[#475569]">
                        <div>
                          <div className="h-10" />
                          <div className="border-t border-[#64748B] pt-1.5 font-bold text-[#0F172A]">
                            Prepared By / Clerk
                          </div>
                          <div className="text-[9.5px] text-[#64748B] mt-0.5">Records Department</div>
                        </div>
                        <div>
                          <div className="h-10 flex items-center justify-center">
                            <span className="text-[9px] uppercase tracking-widest text-[#94A3B8] border border-dashed border-[#CBD5E1] px-2.5 py-1 rounded">
                              Official Seal
                            </span>
                          </div>
                          <div className="border-t border-[#64748B] pt-1.5 font-bold text-[#0F172A]">
                            Nazim-e-Talimat
                          </div>
                          <div className="text-[9.5px] text-[#64748B] mt-0.5">Academic Affairs</div>
                        </div>
                        <div>
                          <div className="h-10" />
                          <div className="border-t border-[#64748B] pt-1.5 font-bold text-[#0F172A]">
                            Principal / Sadr-e-Madrasa
                          </div>
                          <div className="text-[9.5px] text-[#64748B] mt-0.5">Authorized Signatory</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* OUTSIDE THE BOTTOM MARGIN BORDER: Phone Number & Official Website Link */}
                <div className="mt-2 px-1 flex items-center justify-between gap-4 text-[10px] text-[#334155]">
                  <span className="font-mono-num">
                    <strong className="font-bold text-[#0F172A]">Phone:</strong>{' '}
                    {settings?.phone || '+91 62027 36648'}
                  </span>
                  <span className="font-mono-num text-center">
                    <strong className="font-bold text-[#0F172A]">Website:</strong>{' '}
                    {settings?.website || 'https://gausiya-madarsa.vercel.app'}
                  </span>
                  <span className="text-right text-[#64748B]">
                    {settings?.email ? settings.email : 'Official ERP Document'}
                  </span>
                </div>
              </div>
            )}
          </ScaledA4Viewport>

          {extraPages && (
            <div className="print:break-before-page">
              <ScaledA4Viewport
                sheetRef={page2Ref}
                sheetWidth={A4_CANVAS_WIDTH_PX}
                showZoomToggle={false}
                zoomMode={zoomMode}
                onZoomModeChange={setZoomMode}
                sheetClassName="p-6 shadow-md rounded-sm border border-neutral-200 print:shadow-none print:border-0 print:rounded-none print:p-0"
              >
                {extraPages}
              </ScaledA4Viewport>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
