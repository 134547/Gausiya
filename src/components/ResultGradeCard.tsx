import React, { useEffect, useState } from 'react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { resolveImageDataUrl, sanitizeFileName } from '../lib/download.ts';

import { OFFICIAL_LOGO_URL } from './MadrasaLogo.tsx';

export const FIXED_RESULT_SCHOOL_NAME = 'MADARSA GAUSIYA RIZVIYA ISLAMNAGAR';
export const FIXED_RESULT_SCHOOL_ADDRESS =
  'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822108';
export const FIXED_RESULT_URDU_NAME = 'مدرسہ غوثیہ رضویہ اسلام نگر';

export interface ResultCardSubjectItem {
  subject_id?: string;
  subject_code?: string;
  name: string;
  score: number;
  max: number;
}

export interface ResultCardData {
  schoolName: string;
  schoolAddress: string;
  logoUrl?: string;
  academicYear: string;
  examSession: string;
  issueDate: string;
  issueTime: string;
  className: string;
  admNo: string;
  studentName: string;
  division: string;
  roll?: number | string;
  teacher: string;
  photo: string;
  remarks: string;
  rank?: number;
  totalStudents?: number;
  subjects: ResultCardSubjectItem[];
}

export function percentageToCardGrade(p: number): string {
  if (p >= 90) return 'A+';
  if (p >= 80) return 'A';
  if (p >= 70) return 'B';
  if (p >= 60) return 'C+';
  if (p >= 50) return 'C';
  if (p >= 40) return 'D';
  return 'F';
}

export function percentageToGPA(p: number): number {
  if (p >= 90) return 5.0;
  if (p >= 80) return 4.5;
  if (p >= 70) return 4.0;
  if (p >= 60) return 3.5;
  if (p >= 50) return 3.0;
  if (p >= 40) return 2.0;
  return 0.0;
}

export function performanceLabel(p: number): string {
  if (p >= 90) return 'OPL';
  if (p >= 80) return 'Excellent';
  if (p >= 70) return 'Very Good';
  if (p >= 60) return 'Good';
  if (p >= 50) return 'Average';
  if (p >= 40) return 'MPL';
  return 'Below MPL';
}

export function autoCardRemark(p: number, failCount: number): string {
  if (p >= 90) return 'Excellent academic performance and strong consistency.';
  if (p >= 80) return 'Very good performance with commendable effort.';
  if (p >= 70) return 'Good performance. Continue regular improvement.';
  if (p >= 60) return 'Satisfactory performance with scope for improvement.';
  if (p >= 50) return 'Average performance. More focused practice is recommended.';
  if (p >= 40) {
    return failCount > 0
      ? 'Needs improvement in weak subjects.'
      : 'Below expected level. Improvement is needed.';
  }
  return 'Poor academic performance. Immediate improvement is required.';
}

export function computeCardStats(subjects: ResultCardSubjectItem[]) {
  let total = 0;
  let maxTotal = 0;
  let failCount = 0;

  const computedRows = subjects.map((sub, idx) => {
    const score = Number(sub.score || 0);
    const max = Number(sub.max || 50);
    const percent = max > 0 ? (score / max) * 100 : 0;
    const grade = percentageToCardGrade(percent);
    if (score < max * 0.4) failCount += 1;
    total += score;
    maxTotal += max;
    return {
      ...sub,
      slNo: idx + 1,
      code: sub.subject_code || `SUB-${idx + 1}`,
      score,
      max,
      percent,
      grade,
      avg: Math.round(percent),
    };
  });

  const overallPercent = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const overallGrade = percentageToCardGrade(overallPercent);
  const gpa = percentageToGPA(overallPercent);
  const perf = performanceLabel(overallPercent);

  return {
    rows: computedRows,
    total,
    maxTotal,
    failCount,
    overallPercent,
    overallGrade,
    gpa,
    perf,
  };
}

export function buildCardDataFromSavedResult(result: any, settings: any): ResultCardData {
  const meta = result?.card_meta || {};
  const subjects: ResultCardSubjectItem[] = (result?.subjects || []).map((s: any) => ({
    subject_id: s.subject_id,
    subject_code: s.subject_code || '',
    name: s.subject_name || 'Subject',
    score: Number(s.obtained_marks || 0),
    max: Number(s.total_marks || 50),
  }));

  return {
    schoolName: FIXED_RESULT_SCHOOL_NAME,
    schoolAddress: FIXED_RESULT_SCHOOL_ADDRESS,
    logoUrl: settings?.logo_url || OFFICIAL_LOGO_URL,
    academicYear: meta.academicYear || result?.session_name || '',
    examSession: meta.examSession || result?.exam_name || 'Annual Examination',
    issueDate:
      meta.issueDate ||
      result?.exam_date ||
      (result?.created_at ? String(result.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10)),
    issueTime: meta.issueTime || '',
    className: result?.class_name || '-',
    admNo: meta.admNo || result?.admission_no || result?.student_code || '-',
    studentName: meta.studentName || result?.student_name || '-',
    division: meta.division || 'A',
    teacher: meta.teacher || result?.class_teacher_name || 'Class Teacher',
    photo: meta.photo || result?.photo_url || '',
    remarks: meta.remarks || result?.teacher_remarks || '',
    rank: result?.position ? Number(result.position) : (meta.rank ? Number(meta.rank) : undefined),
    totalStudents: result?.total_students || meta.totalStudents || undefined,
    subjects,
  };
}

async function resolveElementImagesTemporarily(rootEl: HTMLElement): Promise<() => void> {
  const imgs = Array.from(rootEl.querySelectorAll('img'));
  const restores: Array<{ img: HTMLImageElement; originalSrc: string }> = [];

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;
      try {
        const dataUrl = await resolveImageDataUrl(src);
        restores.push({ img, originalSrc: src });
        img.setAttribute('src', dataUrl);
        await img.decode().catch(() => {});
      } catch {
        // fallback leave unchanged
      }
    })
  );

  return () => {
    for (const r of restores) {
      r.img.setAttribute('src', r.originalSrc);
    }
  };
}

async function waitForFontsReady() {
  try {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
    }
  } catch {
    // ignore font readiness errors
  }
}

export async function exportResultCardPng(
  element: HTMLElement,
  fileBaseName: string
): Promise<{ fileName: string; dataUrl: string }> {
  await waitForFontsReady();
  const restore = await resolveElementImagesTemporarily(element);
  try {
    let dataUrl: string;
    try {
      dataUrl = await toPng(element, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
    } catch {
      dataUrl = await toPng(element, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true });
    }
    const fileName = `${sanitizeFileName(fileBaseName, 'result-card')}.png`;
    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { fileName, dataUrl };
  } finally {
    restore();
  }
}

export async function exportResultCardPdf(
  element: HTMLElement,
  fileBaseName: string
): Promise<{ fileName: string; blobUrl: string }> {
  await waitForFontsReady();
  const restore = await resolveElementImagesTemporarily(element);
  try {
    let dataUrl: string;
    try {
      dataUrl = await toPng(element, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
    } catch {
      dataUrl = await toPng(element, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true });
    }
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const imgProps = pdf.getImageProperties(dataUrl);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    if (imgHeight <= pageHeight - margin * 2) {
      pdf.addImage(dataUrl, 'PNG', margin, margin, imgWidth, imgHeight, undefined, 'FAST');
    } else {
      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(dataUrl, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight - margin * 2;
      while (heightLeft > 2) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(dataUrl, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight - margin * 2;
      }
    }
    const fileName = `${sanitizeFileName(fileBaseName, 'result-card')}.pdf`;
    const blob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    pdf.save(fileName);
    return { fileName, blobUrl };
  } finally {
    restore();
  }
}

interface ResultGradeCardProps {
  data: ResultCardData;
  cardRef?: React.Ref<HTMLDivElement>;
}

export const ResultGradeCard: React.FC<ResultGradeCardProps> = ({ data, cardRef }) => {
  const [safePhoto, setSafePhoto] = useState<string>('');
  const stats = computeCardStats(data.subjects);
  const remarkText = data.remarks?.trim()
    ? data.remarks.trim()
    : autoCardRemark(stats.overallPercent, stats.failCount);

  useEffect(() => {
    let active = true;
    const raw = (data.photo || '').trim();
    if (!raw) {
      setSafePhoto('');
      return;
    }
    if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('/')) {
      setSafePhoto(raw);
      return;
    }
    resolveImageDataUrl(raw)
      .then((converted) => {
        if (active) setSafePhoto(converted);
      })
      .catch(() => {
        if (active) setSafePhoto(raw);
      });
    return () => {
      active = false;
    };
  }, [data.photo]);

  const examHeadline = `${(data.className || '-').toUpperCase()} ${(data.examSession || 'ANNUAL EXAMINATION').toUpperCase()}`;
  const logoSrc = (data.logoUrl || '').trim() || OFFICIAL_LOGO_URL;

  return (
    <div
      ref={cardRef}
      id="resultCard"
      className="w-full max-w-[1060px] mx-auto bg-white text-black p-5 sm:p-6 border-2 border-[#111] shadow-sm"
      style={{ fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Top Institution Header matching Official Madrasa Letterhead */}
      <div className="grid grid-cols-[72px_1fr_72px] sm:grid-cols-[100px_1fr_100px] items-center gap-3 sm:gap-5 border-b-2 border-[#C9A227] pb-3.5">
        {/* Left: Balancing spacer so header stays centered */}
        <div aria-hidden="true" className="w-[72px] sm:w-[100px]" />

        {/* Center: Arabic Bismillah, Urdu Title, English Title & Address */}
        <div className="text-center px-1">
          <div
            className="text-sm sm:text-base font-bold text-[#1E3A8A] leading-snug"
            dir="rtl"
          >
            بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ
          </div>
          <h2
            className="urdu-text m-0 mt-1 text-xl sm:text-2xl font-extrabold text-[#111827] leading-snug"
            dir="rtl"
          >
            {FIXED_RESULT_URDU_NAME}
          </h2>
          <div className="mt-1 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#1E3A8A]">
            {FIXED_RESULT_SCHOOL_NAME}
          </div>
          <div className="mt-0.5 text-[11px] sm:text-xs font-medium text-[#1f2937] leading-snug">
            {FIXED_RESULT_SCHOOL_ADDRESS}
          </div>
        </div>

        {/* Right: Official Madrasa Logo */}
        <div className="w-[72px] sm:w-[100px] h-[80px] sm:h-[96px] flex items-center justify-center mx-auto">
          <img
            src={logoSrc}
            alt="Madrasa Gausiya Razvia Logo"
            referrerPolicy="no-referrer"
            className="w-[68px] sm:w-[92px] h-[68px] sm:h-[92px] object-contain select-none"
          />
        </div>
      </div>

      {/* Academic Year & Issue Timestamp Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#111] py-2 border-b border-neutral-300">
        <div>Academic Year: {data.academicYear || '—'}</div>
        <div>
          Issued Date: {data.issueDate || '--/--/----'}
          {data.issueTime ? ` · ${data.issueTime}` : ''}
        </div>
      </div>

      {/* Grade Card Title */}
      <div className="text-center mt-2.5 mb-1 text-2xl sm:text-3xl font-extrabold text-[#16a34a]">
        GRADE CARD
      </div>
      <div className="text-center text-base sm:text-lg font-extrabold mb-2.5 uppercase text-black">
        {examHeadline}
      </div>

      {/* Student Metadata + Student Photo */}
      <div className="border-2 border-[#111] border-b-0 px-3.5 py-2.5 grid grid-cols-[1fr_90px] sm:grid-cols-[1fr_104px] gap-4 items-center">
        <div className="text-sm leading-[1.85] grid grid-cols-1 sm:grid-cols-2 gap-x-5">
          <div>
            <b className="inline-block min-w-[115px] sm:min-w-[125px]">Adm No:</b>{' '}
            <span>{data.admNo || '-'}</span>
          </div>
          <div>
            <b className="inline-block min-w-[115px] sm:min-w-[125px]">Standard:</b>{' '}
            <span>{data.className || '-'}</span>
          </div>
          <div>
            <b className="inline-block min-w-[115px] sm:min-w-[125px]">Name:</b>{' '}
            <span>{data.studentName || 'Select Student'}</span>
          </div>
          <div>
            <b className="inline-block min-w-[115px] sm:min-w-[125px]">Division:</b>{' '}
            <span>{data.division || 'A'}</span>
          </div>
          <div>
            <b className="inline-block min-w-[115px] sm:min-w-[125px]">Rank:</b>{' '}
            <span className="font-bold font-mono-num">
              {data.rank
                ? `#${data.rank}${data.totalStudents ? ` / ${data.totalStudents}` : ''}`
                : 'Auto'}
            </span>
          </div>
          <div>
            <b className="inline-block min-w-[115px] sm:min-w-[125px]">Class Teacher:</b>{' '}
            <span>{data.teacher || 'Class Teacher'}</span>
          </div>
        </div>

        {/* Student Photo placed inside Student Metadata box */}
        <div className="w-[86px] sm:w-[98px] h-[104px] sm:h-[118px] border border-[#111] rounded-sm flex items-center justify-center overflow-hidden bg-[#f8fafc] mx-auto">
          {safePhoto ? (
            <img
              src={safePhoto}
              alt={data.studentName || 'Student'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-[11px] font-bold text-[#64748b] tracking-wider">PHOTO</div>
          )}
        </div>
      </div>

      {/* Subject Marks Table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#e5e7eb] w-[52px]">
              Sl.No
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#e5e7eb] w-[120px]">
              Subject Code
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#e5e7eb]">
              Subjects
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#e5e7eb] w-[85px]">
              Scored
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#e5e7eb] w-[85px]">
              Max.Mark
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#e5e7eb] w-[80px]">
              Grade
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#e5e7eb] w-[80px]">
              Average
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="border border-[#111] px-2 py-3 text-xs text-center text-[#64748b]">
                No subjects selected
              </td>
            </tr>
          ) : (
            stats.rows.map((row) => (
              <tr key={`${row.code}_${row.slNo}`}>
                <td className="border border-[#111] px-2 py-1.5 text-xs text-center">{row.slNo}</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs text-center font-mono-num">
                  {row.code}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs text-left font-medium">
                  {row.name}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs text-center font-mono-num">
                  {row.score}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs text-center font-mono-num">
                  {row.max}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs text-center font-bold">
                  {row.grade}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs text-center font-mono-num">
                  {row.avg}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3} className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#f3f4f6]">
              Total
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#f3f4f6] font-mono-num">
              {stats.total}
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#f3f4f6] font-mono-num">
              {stats.maxTotal}
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#f3f4f6]">
              {stats.overallGrade}
            </th>
            <th className="border border-[#111] px-2 py-1.5 text-xs font-extrabold text-center bg-[#f3f4f6] font-mono-num">
              {Math.round(stats.overallPercent)}
            </th>
          </tr>
        </tfoot>
      </table>

      {/* Academic Report & Remarks */}
      <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr] border-2 border-[#111] border-t-0">
        <div className="border-b-2 sm:border-b-0 sm:border-r-2 border-[#111]">
          <div className="px-2.5 py-2 border-b-2 border-[#111] bg-[#f3f4f6] text-xs font-extrabold text-center">
            ACADEMIC REPORT
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-[#111] px-2 py-1.5 text-xs font-bold text-left">Field</th>
                <th className="border border-[#111] px-2 py-1.5 text-xs font-bold text-left">Value</th>
                <th className="border border-[#111] px-2 py-1.5 text-xs font-bold text-left">Out of</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-[#111] px-2 py-1.5 text-xs">Grand Total</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">{stats.total}</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">{stats.maxTotal}</td>
              </tr>
              <tr>
                <td className="border border-[#111] px-2 py-1.5 text-xs">Overall Percentage</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">
                  {stats.overallPercent.toFixed(2)}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">100</td>
              </tr>
              <tr>
                <td className="border border-[#111] px-2 py-1.5 text-xs">No. of Subjects Failed</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">{stats.failCount}</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">
                  {stats.rows.length}
                </td>
              </tr>
              <tr>
                <td className="border border-[#111] px-2 py-1.5 text-xs">Overall Grade</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-bold">{stats.overallGrade}</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs">-</td>
              </tr>
              <tr>
                <td className="border border-[#111] px-2 py-1.5 text-xs">Overall Rank</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">
                  {data.rank || '-'}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">
                  {data.totalStudents || '-'}
                </td>
              </tr>
              <tr>
                <td className="border border-[#111] px-2 py-1.5 text-xs">Performance Level</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-semibold">{stats.perf}</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs">-</td>
              </tr>
              <tr>
                <td className="border border-[#111] px-2 py-1.5 text-xs">Average Percentage</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">
                  {stats.overallPercent.toFixed(2)}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs">-</td>
              </tr>
              <tr>
                <td className="border border-[#111] px-2 py-1.5 text-xs">GPA</td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">
                  {stats.gpa.toFixed(2)}
                </td>
                <td className="border border-[#111] px-2 py-1.5 text-xs font-mono-num">5.00</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-col">
          <div className="px-2.5 py-2 border-b-2 border-[#111] bg-[#f3f4f6] text-xs font-extrabold text-center">
            REMARKS AND ACKNOWLEDGEMENT
          </div>
          <div className="flex-1 min-h-[210px] p-3 text-xs leading-relaxed flex flex-col justify-between">
            <div>{remarkText}</div>
            <div className="grid grid-cols-2 gap-5 mt-14 pt-4">
              <div className="text-center border-t border-[#111] pt-2 font-medium">Guardian</div>
              <div className="text-center border-t border-[#111] pt-2 font-medium">
                {data.teacher || 'Class Teacher'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reference & Certification */}
      <div className="mt-2.5 border-2 border-[#111] p-2.5 text-xs leading-relaxed">
        <b>Reference:</b>
        <br />
        Grades: A+ = 90-100%, A = 80-89%, B = 70-79%, C+ = 60-69%, C = 50-59%, D = 40-49%, F = Below 40%
        <br />
        Subject full marks can be selected manually for each subject from dropdown: <b>25, 50, 75, 100</b>.
        <br />
        <span className="text-[11px] text-[#475569]">
          Disclaimer: This result is system-generated for academic record display.
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 items-end text-sm">
        <div className="italic text-center">Certification</div>
        <div className="text-right leading-relaxed font-medium">
          (Sign &amp; Seal)
          <br />
          Principal
        </div>
      </div>
    </div>
  );
};
