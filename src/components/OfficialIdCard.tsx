import React from 'react';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from './MadrasaLogo.tsx';
import principalSignatureImg from '../assets/images/principal_signature_pro_1795082378400.jpg';

export interface IdCardPerson {
  id: string;
  code: string;
  admission_no?: string;
  full_name: string;
  father_name?: string;
  mother_name?: string;
  dob?: string;
  mobile?: string;
  address?: string;
  village?: string;
  district?: string;
  state?: string;
  pin_code?: string;
  class_name?: string;
  qualification?: string;
  joining_date?: string;
  photo_url?: string;
  status?: string;
  assigned_classes?: string;
}

interface OfficialIdCardProps {
  type: 'student' | 'teacher';
  person: IdCardPerson;
  settings: MadrasaSettings | null;
}

function formatDisplayDate(raw?: string): string {
  const val = String(raw || '').trim();
  if (!val) return '—';
  const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return val;
}

function buildCompactAddress(person: IdCardPerson): string {
  const parts = [person.address, person.village, person.district, person.state, person.pin_code]
    .map((p) => String(p || '').trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (!unique.some((u) => u.toLowerCase().includes(lower) || lower.includes(u.toLowerCase()))) {
      unique.push(part);
    }
  }
  return unique.join(', ') || 'Islamnagar, Ramgarh, Palamu, Jharkhand';
}

export const OfficialIdCard: React.FC<OfficialIdCardProps> = ({ type, person, settings }) => {
  const isStudent = type === 'student';
  const urduTitle = settings?.name_urdu || 'مدرسہ غوثیہ رضویہ اسلام نگر';
  const englishTitle = (settings?.name || 'Madarsa Gausiya Rizviya Islamnagar').toUpperCase();
  const institutionAddress =
    settings?.address || 'Islamnagar, Ramgarh, Palamu, Jharkhand - 822110';
  const institutionPhone = settings?.phone?.trim() || '';

  const rows: Array<{ label: string; value: string; mono?: boolean }> = isStudent
    ? [
        { label: "Father's Name", value: person.father_name || '—' },
        { label: "Mother's Name", value: person.mother_name || '—' },
        { label: 'D.O.B.', value: formatDisplayDate(person.dob), mono: true },
        {
          label: person.admission_no ? 'Admission No.' : 'Student ID',
          value: person.admission_no || person.code || '—',
          mono: true,
        },
        { label: 'Contact No.', value: person.mobile || '—', mono: true },
      ]
    : [
        { label: 'Teacher ID', value: person.code || '—', mono: true },
        { label: "Father's Name", value: person.father_name || '—' },
        { label: 'Qualification', value: person.qualification || '—' },
        { label: 'Joining Date', value: formatDisplayDate(person.joining_date), mono: true },
        { label: 'Contact No.', value: person.mobile || '—', mono: true },
      ];

  const addressLine = buildCompactAddress(person);

  return (
    <div
      className="relative w-[292px] bg-white rounded-[18px] border-[1.5px] border-[#1D56B8]/40 shadow-md overflow-hidden select-none break-inside-avoid flex flex-col"
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {/* Top Royal Blue Header with Curved Double Wave */}
      <div className="relative bg-gradient-to-b from-[#174BB0] via-[#1D56B8] to-[#1D56B8] text-white px-3 pt-2.5 pb-11 overflow-hidden">
        {/* Top Bismillah */}
        <div
          className="urdu-text text-center text-[10px] leading-tight text-blue-100/95 mb-1"
          dir="rtl"
        >
          بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
        </div>

        {/* Logo + Madrasa Name */}
        <div className="flex items-center gap-2">
          <div className="w-[46px] h-[46px] rounded-full bg-white p-0.5 shadow-sm border border-blue-200 flex items-center justify-center shrink-0 overflow-hidden">
            <MadrasaLogo logoUrl={settings?.logo_url} size={40} />
          </div>
          <div className="min-w-0 flex-1 text-center">
            <div
              className="urdu-text text-[14px] font-bold leading-snug text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
              dir="rtl"
            >
              {urduTitle}
            </div>
            <div className="text-[9.5px] font-extrabold tracking-wide text-white leading-tight mt-0.5">
              {englishTitle}
            </div>
          </div>
        </div>

        {/* Madrasa Address & Phone */}
        <div className="mt-1.5 text-center space-y-0.5 px-1">
          <div className="text-[8.5px] leading-tight text-blue-100 line-clamp-2">
            {institutionAddress}
          </div>
          {institutionPhone && (
            <div className="text-[9.5px] font-bold tracking-wide text-white font-mono-num">
              Phone No.: {institutionPhone}
            </div>
          )}
        </div>

        {/* Curved Double Wave Bottom (Exact match to reference ID card) */}
        <svg
          viewBox="0 0 292 44"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0 w-full h-[38px] pointer-events-none"
          aria-hidden="true"
        >
          {/* Light blue secondary wave */}
          <path d="M0,18 Q146,-6 292,18 L292,44 L0,44 Z" fill="#92B8F8" />
          {/* Crisp white body wave */}
          <path d="M0,26 Q146,2 292,26 L292,44 L0,44 Z" fill="#FFFFFF" />
        </svg>
      </div>

      {/* Centered Passport Photo Box Overlapping Curve */}
      <div className="relative z-10 -mt-[34px] flex flex-col items-center px-3">
        <div className="w-[90px] h-[102px] bg-white p-[2.5px] border-[2px] border-[#1D56B8] shadow-xs overflow-hidden flex items-center justify-center">
          {person.photo_url ? (
            <img
              src={person.photo_url}
              alt={person.full_name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-blue-50 to-slate-100 flex flex-col items-center justify-center text-[#1D56B8]">
              <span className="text-2xl font-extrabold">
                {(person.full_name || '?').trim().charAt(0).toUpperCase()}
              </span>
              <span className="text-[8px] font-semibold uppercase tracking-wider text-[#1D56B8]/70 mt-0.5">
                {isStudent ? 'Student' : 'Teacher'}
              </span>
            </div>
          )}
        </div>

        {/* Name & ID Subtitle */}
        <div className="mt-2 text-center w-full">
          <div className="text-[15px] font-extrabold text-[#111827] leading-tight truncate px-1">
            {person.full_name}
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[9.5px] font-bold tracking-wider uppercase">
            <span className={isStudent ? 'text-[#1D56B8]' : 'text-[#DC1726]'}>
              {isStudent ? 'STUDENT ID' : 'TEACHER ID'}
            </span>
            <span className="text-neutral-300">•</span>
            <span className="font-mono-num text-[#171717]">{person.code}</span>
          </div>
        </div>
      </div>

      {/* Structured 2-Column Ruled Details Table */}
      <div className="px-3.5 pt-2 pb-1.5 flex-1">
        <div className="border-t border-b border-neutral-200 divide-y divide-neutral-200 text-[10px]">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[92px_1fr] items-center py-[3.5px]">
              <div className="text-[#4B5563] font-medium pe-2 border-e border-neutral-200 truncate">
                {row.label}
              </div>
              <div
                className={`ps-2.5 text-[#111827] font-semibold truncate ${
                  row.mono ? 'font-mono-num' : ''
                }`}
              >
                {row.value}
              </div>
            </div>
          ))}
        </div>

        {/* Address Line */}
        <div className="mt-2 text-[9.5px] leading-snug text-[#1F2937] min-h-[26px]">
          <span className="font-bold text-[#111827]">Add.: </span>
          <span>{addressLine}</span>
        </div>
      </div>

      {/* Bottom Footer: Class / Role (Left) & Principal Sign (Right) */}
      <div className="px-3.5 pt-1 pb-3 flex items-end justify-between gap-2 text-[10px]">
        <div className="min-w-0">
          {isStudent ? (
            <div className="font-bold text-[#111827] truncate">
              Class : <span className="text-[#1D56B8]">{person.class_name || 'Unassigned'}</span>
            </div>
          ) : (
            <div className="font-bold text-[#111827] truncate">
              Post : <span className="text-[#DC1726]">Teacher</span>
            </div>
          )}
        </div>

        <div className="text-center shrink-0">
          <div className="h-[34px] flex items-end justify-center -mb-1">
            <img
              src={principalSignatureImg}
              alt="Principal Signature"
              referrerPolicy="no-referrer"
              className="h-[34px] w-auto max-w-[106px] object-contain contrast-110 mix-blend-multiply pointer-events-none select-none"
            />
          </div>
          <div className="border-t border-neutral-400 pt-0.5 text-[9.5px] font-bold text-[#111827]">
            Principal Sign.
          </div>
        </div>
      </div>

      {/* Subtle Bottom Accent Bar */}
      <div className={`h-1.5 w-full ${isStudent ? 'bg-[#1D56B8]' : 'bg-[#DC1726]'}`} />
    </div>
  );
};
