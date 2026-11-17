import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Printer, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from './MadrasaLogo.tsx';

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
    let dataUrl: string;
    try {
      dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    } catch {
      // Retry without font embedding if an external stylesheet blocks CSS rule inspection
      dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
      });
    }

    const imgProps = pdf.getImageProperties(dataUrl);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const totalRenderedHeight = (imgProps.height * usableWidth) / imgProps.width;

    if (!isFirstDocPage) {
      pdf.addPage();
    }

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
  const [pdfDownloadLink, setPdfDownloadLink] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setStatusNotice('');
      setErrorNotice('');
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
          ? `Direct print popup is blocked in this preview window, so "${fileName}" was generated as PDF.`
          : `Saved "${fileName}" to your downloads.`
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
    <div className="print-modal-portal fixed inset-0 z-50 bg-black/60 overflow-y-auto p-3 sm:p-6">
      <div className="mx-auto max-w-5xl bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden print-sheet">
        <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200 no-print space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#171717]">{title}</h3>
              {subtitle && <p className="text-xs text-[#737373]">{subtitle}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {headerActions}
              <button
                type="button"
                disabled={generatingPdf}
                onClick={() => handleDownloadPdf(false)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#141E30] text-white text-sm font-medium hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
              >
                {generatingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{generatingPdf ? 'Preparing PDF...' : 'Download PDF'}</span>
              </button>
              <button
                type="button"
                disabled={generatingPdf}
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-neutral-200 transition-colors cursor-pointer"
                aria-label="Close print preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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

        <div ref={page1Ref} className="p-6 sm:p-8 bg-white text-[#171717] print:p-0">
          {standalone ? (
            children
          ) : (
            <>
              {/* Official Institutional Header */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-5 mb-6 border-b-2 border-[#171717]">
                <div className="flex items-center gap-4">
                  <MadrasaLogo logoUrl={settings?.logo_url} size={64} />
                  <div>
                    <h1 className="text-xl font-bold text-[#171717]">
                      {settings?.name || 'Madrasa Gausiya Razvia'}
                    </h1>
                    <p className="text-xs text-[#737373] mt-0.5">
                      {settings?.address ||
                        'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110'}
                    </p>
                    <p className="text-xs text-[#737373] font-mono-num mt-0.5">
                      {settings?.phone || '+91 62027 36648'} ·{' '}
                      {settings?.website || 'https://gausiya.zite.so'}
                    </p>
                  </div>
                </div>
                <div className="text-center sm:text-right">
                  <p className="urdu-text text-lg font-bold text-[#DC1726]">
                    {settings?.name_urdu || 'مدرسہ غوثیہ رضویہ'}
                  </p>
                  <p className="urdu-text text-xs text-[#737373]">
                    {settings?.address_urdu || 'اسلام نگر، رام گڑھ، پلاموں، جھارکھنڈ، انڈیا'}
                  </p>
                  <p className="text-xs font-medium text-[#171717] mt-1 font-mono-num">
                    Issued: {new Date().toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>

              <div className="mb-5 text-center">
                <span className="inline-block px-4 py-1 border border-neutral-300 rounded-md text-sm font-semibold tracking-wide text-[#171717] bg-neutral-50">
                  {title}
                </span>
              </div>

              {children}

              {/* Official Signature Footer */}
              <div className="mt-10 pt-6 border-t border-neutral-200 grid grid-cols-3 gap-6 text-center text-xs text-[#737373]">
                <div>
                  <div className="h-10" />
                  <div className="border-t border-neutral-400 pt-1.5 font-medium text-[#171717]">
                    Class Teacher / Clerk
                  </div>
                </div>
                <div>
                  <div className="h-10" />
                  <div className="border-t border-neutral-400 pt-1.5 font-medium text-[#171717]">
                    Nazim-e-Talimat
                  </div>
                </div>
                <div>
                  <div className="h-10" />
                  <div className="border-t border-neutral-400 pt-1.5 font-medium text-[#171717]">
                    Principal / Sadr-e-Madrasa
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {extraPages && (
          <div
            ref={page2Ref}
            className="p-6 sm:p-8 bg-white text-[#171717] border-t-4 border-dashed border-neutral-200 print:border-t-0 print:p-0 print:break-before-page"
          >
            {extraPages}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
