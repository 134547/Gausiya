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

function drawInstitutionalHeader(
  pdf: jsPDF,
  settings: MadrasaSettings | null,
  logoDataUrl: string | null,
  title: string,
  metaLine: string,
  pageWidth: number,
  margin: number
): number {
  let y = margin;
  if (logoDataUrl) {
    try {
      const fmt = logoDataUrl.includes('image/jpeg') || logoDataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
      pdf.addImage(logoDataUrl, fmt, margin, y, 16, 16);
    } catch {
      // skip logo if unsupported
    }
  }
  const textX = logoDataUrl ? margin + 20 : margin;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(23, 23, 23);
  pdf.text(settings?.name || 'Madrasa Gausiya Razvia', textX, y + 5.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(95, 95, 95);
  const addr =
    settings?.address || 'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110';
  pdf.text(addr, textX, y + 10.5, { maxWidth: pageWidth - textX - margin });
  pdf.text(
    `Phone: ${settings?.phone || '+91 62027 36648'}  |  Generated: ${new Date().toLocaleDateString('en-IN')}`,
    textX,
    y + 15
  );

  y += 19;
  pdf.setDrawColor(220, 23, 38);
  pdf.setLineWidth(0.7);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 6;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11.5);
  pdf.setTextColor(23, 23, 23);
  pdf.text(title, margin, y);
  y += 4.5;

  if (metaLine) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.2);
    pdf.setTextColor(100, 100, 100);
    pdf.text(metaLine, margin, y, { maxWidth: pageWidth - margin * 2 });
    y += 5;
  }

  return y;
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
  const bottomLimit = pageHeight - 20;
  let y = startY;

  if (!columns.length || !rows.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text('No Records Found for the selected criteria.', margin, y + 4);
    return y + 10;
  }

  const colCount = columns.length;
  const colWidth = usableWidth / colCount;
  const headerFontSize = colCount > 8 ? 6.5 : 7.5;
  const bodyFontSize = colCount > 8 ? 6.5 : 7.3;
  const lineH = colCount > 8 ? 3.2 : 3.6;

  const drawHeaderRow = () => {
    pdf.setFillColor(23, 23, 23);
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
      pdf.setFillColor(249, 250, 251);
      pdf.rect(margin, y, usableWidth, rowHeight, 'F');
    }

    pdf.setDrawColor(232, 232, 232);
    pdf.setLineWidth(0.2);
    pdf.rect(margin, y, usableWidth, rowHeight);

    pdf.setTextColor(28, 28, 28);
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
  let y = startY + 8;
  if (y + 24 > pageHeight - 16) {
    pdf.addPage();
    y = margin + 10;
  }
  const usable = pageWidth - margin * 2;
  const colW = usable / 3;
  const labels = ['Class Teacher / Clerk', 'Nazim-e-Talimat', 'Principal / Sadr-e-Madrasa'];
  pdf.setDrawColor(140, 140, 140);
  pdf.setLineWidth(0.3);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(40, 40, 40);

  labels.forEach((lbl, idx) => {
    const cx = margin + colW * idx + colW / 2;
    pdf.line(cx - 22, y + 12, cx + 22, y + 12);
    pdf.text(lbl, cx, y + 17, { align: 'center' });
  });
}

function stampPageNumbers(pdf: jsPDF, settings: MadrasaSettings | null, margin: number) {
  const totalPages = pdf.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let p = 1; p <= totalPages; p += 1) {
    pdf.setPage(p);
    pdf.setDrawColor(225, 225, 225);
    pdf.setLineWidth(0.25);
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(115, 115, 115);
    pdf.text(
      `${settings?.name || 'Madrasa Gausiya Razvia'} — Official ERP Report`,
      margin,
      pageHeight - 7.5
    );
    pdf.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 7.5, { align: 'right' });
  }
}

export async function exportStructuredReportToPdf(opts: PdfReportOptions) {
  const landscape = opts.columns.length > 7;
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const margin = 12;
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
    const gap = 3;
    const usable = pageWidth - margin * 2;
    const cardW = (usable - gap * (cards.length - 1)) / cards.length;
    cards.forEach((c, idx) => {
      const cx = margin + idx * (cardW + gap);
      pdf.setFillColor(248, 249, 250);
      pdf.setDrawColor(228, 228, 231);
      pdf.roundedRect(cx, y, cardW, 13, 1.5, 1.5, 'FD');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8);
      pdf.setTextColor(115, 115, 115);
      pdf.text(String(c.label).slice(0, 26), cx + 2.5, y + 4.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(23, 23, 23);
      pdf.text(String(c.value), cx + 2.5, y + 10.5);
    });
    y += 17;
  }

  if (opts.notice) {
    pdf.setFillColor(255, 251, 235);
    pdf.setDrawColor(253, 230, 138);
    const lines = pdf.splitTextToSize(opts.notice, pageWidth - margin * 2 - 6);
    const boxH = lines.length * 3.8 + 4;
    pdf.roundedRect(margin, y, pageWidth - margin * 2, boxH, 1.5, 1.5, 'FD');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(146, 64, 14);
    pdf.text(lines, margin + 3, y + 4.5);
    y += boxH + 4;
  }

  y = drawTableBlock(pdf, opts.columns, opts.rows, y, margin, pageWidth, pageHeight, () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`${opts.title} (Continued)`, margin, margin + 2);
    return margin + 6;
  });

  drawSignatureBlock(pdf, y, margin, pageWidth, pageHeight);
  stampPageNumbers(pdf, opts.settings, margin);
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
  const margin = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl(settings?.logo_url);

  const docTitle = onlySectionId && targetSections[0]
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
    if (y + 26 > pageHeight - 20) {
      pdf.addPage();
      y = margin;
    }

    // Section Title Banner
    pdf.setFillColor(254, 242, 242);
    pdf.setDrawColor(252, 165, 165);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 8, 1.5, 1.5, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(185, 28, 28);
    pdf.text(`${sec.number}. ${sec.title}`, margin + 3, y + 5.4);
    y += 10.5;

    if (sec.summary) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(80, 80, 80);
      const sumLines = pdf.splitTextToSize(sec.summary, pageWidth - margin * 2);
      pdf.text(sumLines, margin, y);
      y += sumLines.length * 3.8 + 2.5;
    }

    const cols = sec.rows.length > 0 ? Object.keys(sec.rows[0]) : [];
    y = drawTableBlock(pdf, cols, sec.rows, y, margin, pageWidth, pageHeight, () => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${sec.number}. ${sec.title} (Continued)`, margin, margin + 2);
      return margin + 6;
    });
    y += 3;
  }

  drawSignatureBlock(pdf, y, margin, pageWidth, pageHeight);
  stampPageNumbers(pdf, settings, margin);

  const fileName = onlySectionId && targetSections[0]
    ? `Madrasa_Annual_${annual.academicYear}_Sec${targetSections[0].number}_${targetSections[0].title}`
    : `Madrasa_Gausiya_Razvia_Complete_Annual_Report_${annual.academicYear}`;
  pdf.save(`${sanitizeFileName(fileName)}.pdf`);
}
