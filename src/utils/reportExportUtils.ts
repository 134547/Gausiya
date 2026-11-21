import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { MadrasaSettings } from '../types.ts';

export interface ReportSummaryCard {
  label: string;
  value: string | number;
  tone?: string;
}

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  academicYear?: string;
  dateRange?: string;
  settings: MadrasaSettings | null;
  summaryCards?: ReportSummaryCard[];
  columns: string[];
  rows: Record<string, any>[];
  notice?: string;
  fileName: string;
}

export interface AnnualSectionPayload {
  id: string;
  number: number;
  title: string;
  summary: string;
  rows: Record<string, any>[];
}

export interface AnnualCompletePayload {
  academicYear: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  stats: Record<string, any>;
  previousSessionName: string | null;
  sections: AnnualSectionPayload[];
}

function sanitizeFileName(raw: string): string {
  return (
    raw
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, '_')
      .trim()
      .slice(0, 90) || 'Madrasa_Report'
  );
}

async function loadLogoDataUrl(logoUrl?: string): Promise<string | null> {
  const candidates = [logoUrl, '/favicon.png'].filter((u): u is string => Boolean(u && u.trim()));
  for (const src of candidates) {
    try {
      let absoluteUrl = src;
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        absoluteUrl = new URL(src, window.location.origin).toString();
      } else {
        return src;
      }
      if (absoluteUrl.startsWith(window.location.origin)) {
        const resp = await fetch(absoluteUrl);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(blob);
        });
        if (dataUrl) return dataUrl;
      } else {
        const resp = await fetch(`/api/public/image-data?url=${encodeURIComponent(absoluteUrl)}`);
        if (!resp.ok) continue;
        const json = await resp.json().catch(() => null);
        if (json?.dataUrl) return json.dataUrl;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function exportReportToCSV(rows: Record<string, any>[], filename: string) {
  const cleanName = `${sanitizeFileName(filename)}.csv`;
  if (!rows || rows.length === 0) {
    const blob = new Blob(['\uFEFFMessage\n"No Records Found"'], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, cleanName);
    return;
  }
  const columns = Object.keys(rows[0]);
  const escapeCell = (val: unknown) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    columns.map(escapeCell).join(','),
    ...rows.map((r) => columns.map((c) => escapeCell(r[c])).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, cleanName);
}

export function exportReportToExcel(rows: Record<string, any>[], filename: string, sheetName = 'Report') {
  const safeSheet = sheetName.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Report';
  const wb = XLSX.utils.book_new();
  const ws =
    rows && rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.json_to_sheet([{ Message: 'No Records Found' }]);
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);
  XLSX.writeFile(wb, `${sanitizeFileName(filename)}.xlsx`);
}

export function exportMultiSheetExcel(
  sheets: Array<{ name: string; rows: Record<string, any>[] }>,
  filename: string
) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const s of sheets) {
    let clean = s.name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet';
    let suffix = 1;
    while (usedNames.has(clean.toLowerCase())) {
      clean = `${clean.slice(0, 25)}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(clean.toLowerCase());
    const ws =
      s.rows && s.rows.length > 0
        ? XLSX.utils.json_to_sheet(s.rows)
        : XLSX.utils.json_to_sheet([{ Message: 'No Records Found' }]);
    XLSX.utils.book_append_sheet(wb, ws, clean);
  }
  XLSX.writeFile(wb, `${sanitizeFileName(filename)}.xlsx`);
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const FRAME_MARGIN = 9;
const FRAME_BOTTOM_OFFSET = 13.5;
const CONTENT_INSET = 14.5;

function drawInstitutionalHeader(
  pdf: jsPDF,
  settings: MadrasaSettings | null,
  logoDataUrl: string | null,
  title: string,
  metaLine: string,
  pageWidth: number,
  contentMargin: number
): number {
  const usableWidth = pageWidth - contentMargin * 2;
  let y = contentMargin;

  // Dual-tone executive accent bar at the very top inside the margin frame
  pdf.setFillColor(20, 30, 48); // Deep institutional navy
  pdf.rect(contentMargin, y, usableWidth * 0.72, 1.4, 'F');
  pdf.setFillColor(220, 23, 38); // Official crimson accent
  pdf.rect(contentMargin + usableWidth * 0.72, y, usableWidth * 0.28, 1.4, 'F');
  y += 4.2;

  if (logoDataUrl) {
    try {
      const fmt =
        logoDataUrl.includes('image/jpeg') || logoDataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
      pdf.addImage(logoDataUrl, fmt, contentMargin, y, 16, 16);
    } catch {
      // skip logo if unsupported
    }
  }

  const textX = logoDataUrl ? contentMargin + 19.5 : contentMargin;
  const rightColX = pageWidth - contentMargin;

  // Left: Kicker + Institution Name + Official Address (NO phone/website clutter here)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(220, 23, 38);
  pdf.text('OFFICIAL INSTITUTIONAL RECORD', textX, y + 3);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text((settings?.name || 'Madrasa Gausiya Razvia').toUpperCase(), textX, y + 8.6);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.6);
  pdf.setTextColor(71, 85, 105);
  const addr =
    settings?.address ||
    'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110';
  const addrLines = pdf.splitTextToSize(addr, usableWidth - 62).slice(0, 2);
  pdf.text(addrLines, textX, y + 12.8);

  // Right: Issue Date & Document Verification Stamp
  const formattedDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(30, 41, 59);
  pdf.text('MADRASA MANAGEMENT ERP', rightColX, y + 4.2, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Issued: ${formattedDate}`, rightColX, y + 8.8, { align: 'right' });

  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text('Verified Live Database Report', rightColX, y + 13, { align: 'right' });

  y += 18.5;

  // Clean hairline rule separating letterhead from title block
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.35);
  pdf.line(contentMargin, y, pageWidth - contentMargin, y);
  y += 3.5;

  // Executive Centered Title Banner
  const titleLines = pdf.splitTextToSize(title.toUpperCase(), usableWidth - 10).slice(0, 2);
  const metaLines = metaLine
    ? pdf.splitTextToSize(metaLine, usableWidth - 10).slice(0, 2)
    : [];
  const bannerHeight = 4 + titleLines.length * 4.5 + (metaLines.length ? metaLines.length * 3.6 + 1.5 : 0);

  pdf.setFillColor(248, 250, 252);
  pdf.rect(contentMargin, y, usableWidth, bannerHeight, 'F');
  pdf.setDrawColor(30, 41, 59);
  pdf.setLineWidth(0.35);
  pdf.line(contentMargin, y, pageWidth - contentMargin, y);
  pdf.line(contentMargin, y + bannerHeight, pageWidth - contentMargin, y + bannerHeight);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(titleLines, pageWidth / 2, y + 5, { align: 'center' });

  if (metaLines.length > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.6);
    pdf.setTextColor(71, 85, 105);
    pdf.text(metaLines, pageWidth / 2, y + 5 + titleLines.length * 4.4, { align: 'center' });
  }

  return y + bannerHeight + 4.5;
}

function drawTableBlock(
  pdf: jsPDF,
  columns: string[],
  rows: Record<string, any>[],
  startY: number,
  margin: number,
  pageWidth: number,
  pageHeight: number,
  onNewPageHeader?: () => number
): number {
  const usableWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - FRAME_BOTTOM_OFFSET - 5;
  let y = startY;

  if (!columns.length || !rows.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.2);
    pdf.setTextColor(120, 120, 120);
    pdf.text('No Records Found for the selected criteria.', margin, y + 4);
    return y + 10;
  }

  const colCount = columns.length;
  const colWidth = usableWidth / colCount;
  const headerFontSize = colCount > 8 ? 6.4 : 7.3;
  const bodyFontSize = colCount > 8 ? 6.4 : 7.2;
  const lineH = colCount > 8 ? 3.1 : 3.5;

  const drawHeaderRow = () => {
    pdf.setFillColor(20, 30, 48);
    pdf.rect(margin, y, usableWidth, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(headerFontSize);
    pdf.setTextColor(255, 255, 255);
    columns.forEach((col, i) => {
      const label = pdf.splitTextToSize(String(col), colWidth - 2.4)[0] || String(col);
      pdf.text(label, margin + i * colWidth + 1.4, y + 4.7);
    });
    y += 7;
  };

  if (y + 14 > bottomLimit) {
    pdf.addPage();
    y = onNewPageHeader ? onNewPageHeader() : margin;
  }
  drawHeaderRow();

  rows.forEach((row, rIdx) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(bodyFontSize);
    const wrappedCells = columns.map((col) => {
      const text = String(row[col] ?? '—');
      return pdf.splitTextToSize(text, colWidth - 2.4).slice(0, 3);
    });
    const maxLines = Math.max(1, ...wrappedCells.map((c) => c.length));
    const rowHeight = maxLines * lineH + 2.6;

    if (y + rowHeight > bottomLimit) {
      pdf.addPage();
      y = onNewPageHeader ? onNewPageHeader() : margin;
      drawHeaderRow();
    }

    if (rIdx % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, usableWidth, rowHeight, 'F');
    }

    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.rect(margin, y, usableWidth, rowHeight);

    pdf.setTextColor(15, 23, 42);
    wrappedCells.forEach((lines, i) => {
      lines.forEach((ln: string, li: number) => {
        pdf.text(ln, margin + i * colWidth + 1.4, y + 3.4 + li * lineH);
      });
    });

    y += rowHeight;
  });

  return y + 4;
}

function drawSignatureBlock(
  pdf: jsPDF,
  startY: number,
  margin: number,
  pageWidth: number,
  pageHeight: number
) {
  let y = startY + 7;
  const maxContentBottom = pageHeight - FRAME_BOTTOM_OFFSET - 4;
  if (y + 24 > maxContentBottom) {
    pdf.addPage();
    y = margin + 10;
  }

  const usable = pageWidth - margin * 2;
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 4;

  const colW = usable / 3;
  const signatories = [
    { title: 'Prepared By / Clerk', sub: 'Records Department' },
    { title: 'Nazim-e-Talimat', sub: 'Academic Affairs' },
    { title: 'Principal / Sadr-e-Madrasa', sub: 'Authorized Signatory' },
  ];

  signatories.forEach((sig, idx) => {
    const cx = margin + colW * idx + colW / 2;
    pdf.setDrawColor(100, 116, 139);
    pdf.setLineWidth(0.3);
    pdf.line(cx - 22, y + 11, cx + 22, y + 11);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.8);
    pdf.setTextColor(15, 23, 42);
    pdf.text(sig.title, cx, y + 15.2, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.6);
    pdf.setTextColor(100, 116, 139);
    pdf.text(sig.sub, cx, y + 18.6, { align: 'center' });
  });
}

function stampFramesAndOuterFooter(pdf: jsPDF, settings: MadrasaSettings | null) {
  const totalPages = pdf.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const frameW = pageWidth - FRAME_MARGIN * 2;
  const frameH = pageHeight - FRAME_MARGIN - FRAME_BOTTOM_OFFSET;

  const phoneText = `Phone: ${settings?.phone || '+91 62027 36648'}`;
  const webText = `Website: ${settings?.website || 'https://gausiya-madarsa.vercel.app'}`;

  for (let p = 1; p <= totalPages; p += 1) {
    pdf.setPage(p);

    // 1. Formal Double-Line Page Margin Border Frame
    pdf.setDrawColor(30, 41, 59);
    pdf.setLineWidth(0.5);
    pdf.rect(FRAME_MARGIN, FRAME_MARGIN, frameW, frameH);

    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.2);
    pdf.rect(FRAME_MARGIN + 1.1, FRAME_MARGIN + 1.1, frameW - 2.2, frameH - 2.2);

    // 2. OUTSIDE THE BOTTOM MARGIN BORDER: Phone Number, Official Website Link & Page Number
    const footerY = pageHeight - 6.8;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.4);
    pdf.setTextColor(30, 41, 59);
    pdf.text(phoneText, FRAME_MARGIN, footerY);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.4);
    pdf.setTextColor(20, 30, 48);
    pdf.text(webText, pageWidth / 2, footerY, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.2);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Page ${p} of ${totalPages}`, pageWidth - FRAME_MARGIN, footerY, { align: 'right' });
  }
}

export async function exportStructuredReportToPdf(opts: PdfReportOptions) {
  const landscape = opts.columns.length > 7;
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const margin = CONTENT_INSET;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl(opts.settings?.logo_url);

  const metaParts = [
    opts.academicYear ? `Academic Year: ${opts.academicYear}` : '',
    opts.dateRange ? `Period: ${opts.dateRange}` : '',
    opts.subtitle && opts.subtitle !== opts.dateRange ? opts.subtitle : '',
    `Total Records: ${opts.rows.length}`,
  ].filter(Boolean);

  let y = drawInstitutionalHeader(
    pdf,
    opts.settings,
    logoDataUrl,
    opts.title,
    metaParts.join('  |  '),
    pageWidth,
    margin
  );

  // Summary strip
  if (opts.summaryCards && opts.summaryCards.length > 0) {
    const cards = opts.summaryCards.slice(0, 5);
    const gap = 2.8;
    const usable = pageWidth - margin * 2;
    const cardW = (usable - gap * (cards.length - 1)) / cards.length;
    cards.forEach((c, idx) => {
      const cx = margin + idx * (cardW + gap);
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(cx, y, cardW, 13, 1.2, 1.2, 'FD');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.6);
      pdf.setTextColor(100, 116, 139);
      pdf.text(String(c.label).slice(0, 26), cx + 2.5, y + 4.4);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.2);
      pdf.setTextColor(15, 23, 42);
      pdf.text(String(c.value), cx + 2.5, y + 10.3);
    });
    y += 16.5;
  }

  if (opts.notice) {
    pdf.setFillColor(255, 251, 235);
    pdf.setDrawColor(253, 230, 138);
    const lines = pdf.splitTextToSize(opts.notice, pageWidth - margin * 2 - 6);
    const boxH = lines.length * 3.8 + 4;
    pdf.roundedRect(margin, y, pageWidth - margin * 2, boxH, 1.2, 1.2, 'FD');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.4);
    pdf.setTextColor(146, 64, 14);
    pdf.text(lines, margin + 3, y + 4.4);
    y += boxH + 4;
  }

  y = drawTableBlock(pdf, opts.columns, opts.rows, y, margin, pageWidth, pageHeight, () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(30, 41, 59);
    pdf.text(`${opts.title} (Continued)`, margin, margin + 2.5);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.line(margin, margin + 4.2, pageWidth - margin, margin + 4.2);
    return margin + 7;
  });

  drawSignatureBlock(pdf, y, margin, pageWidth, pageHeight);
  stampFramesAndOuterFooter(pdf, opts.settings);
  pdf.save(`${sanitizeFileName(opts.fileName)}.pdf`);
}

export async function exportAnnualBookToPdf(
  annual: AnnualCompletePayload,
  settings: MadrasaSettings | null,
  onlySectionId?: string
) {
  const targetSections = onlySectionId
    ? annual.sections.filter((s) => s.id === onlySectionId)
    : annual.sections;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const margin = CONTENT_INSET;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl(settings?.logo_url);

  const docTitle =
    onlySectionId && targetSections[0]
      ? `Annual Report — Section ${targetSections[0].number}: ${targetSections[0].title}`
      : `Complete Annual Madarsa Report — ${annual.academicYear}`;

  let y = drawInstitutionalHeader(
    pdf,
    settings,
    logoDataUrl,
    docTitle,
    `Academic Year: ${annual.academicYear}  |  Period: ${annual.startDate || 'All'} to ${annual.endDate || 'Present'}  |  Sections: ${targetSections.length}`,
    pageWidth,
    margin
  );

  for (const sec of targetSections) {
    if (y + 26 > pageHeight - FRAME_BOTTOM_OFFSET - 5) {
      pdf.addPage();
      y = margin + 2;
    }

    // Section Title Banner
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 7.6, 1, 1, 'FD');
    pdf.setFillColor(220, 23, 38);
    pdf.rect(margin, y, 2, 7.6, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.2);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`${sec.number}. ${sec.title}`, margin + 4.5, y + 5.1);
    y += 9.8;

    if (sec.summary) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(71, 85, 105);
      const sumLines = pdf.splitTextToSize(sec.summary, pageWidth - margin * 2);
      pdf.text(sumLines, margin, y);
      y += sumLines.length * 3.7 + 2.2;
    }

    const cols = sec.rows.length > 0 ? Object.keys(sec.rows[0]) : [];
    y = drawTableBlock(pdf, cols, sec.rows, y, margin, pageWidth, pageHeight, () => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.2);
      pdf.setTextColor(30, 41, 59);
      pdf.text(`${sec.number}. ${sec.title} (Continued)`, margin, margin + 2.5);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.25);
      pdf.line(margin, margin + 4.2, pageWidth - margin, margin + 4.2);
      return margin + 7;
    });
    y += 3;
  }

  drawSignatureBlock(pdf, y, margin, pageWidth, pageHeight);
  stampFramesAndOuterFooter(pdf, settings);

  const fileName =
    onlySectionId && targetSections[0]
      ? `Madrasa_Annual_${annual.academicYear}_Sec${targetSections[0].number}_${targetSections[0].title}`
      : `Madrasa_Gausiya_Razvia_Complete_Annual_Report_${annual.academicYear}`;
  pdf.save(`${sanitizeFileName(fileName)}.pdf`);
}
