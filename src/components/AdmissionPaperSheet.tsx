import React from 'react';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from './MadrasaLogo.tsx';

export interface AdmissionPaperData {
  reference_no?: string;
  admission_no?: string;
  student_code?: string;
  admission_date?: string;
  student_name?: string;
  father_name?: string;
  mother_name?: string;
  dob?: string;
  gender?: string;
  religion?: string;
  class_name?: string;
  guardian_name?: string;
  guardian_relationship?: string;
  guardian_mobile?: string;
  student_mobile?: string;
  address?: string;
  village?: string;
  district?: string;
  state?: string;
  pin_code?: string;
  previous_school?: string;
  previous_class?: string;
  photo_url?: string;
  remarks?: string;
  status?: string;
}

interface AdmissionPaperSheetProps {
  settings?: MadrasaSettings | null;
  data: AdmissionPaperData;
}

export const AdmissionPaperSheet: React.FC<AdmissionPaperSheetProps> = ({ settings, data }) => {
  const fullAddress = [
    data.address,
    data.village,
    data.district,
    data.state,
    data.pin_code,
  ]
    .filter((v) => String(v || '').trim().length > 0)
    .join(', ');

  const englishName = (settings?.name || 'MADRASA GAUSIYA RAZVIA').toUpperCase();
  const urduName = settings?.name_urdu || 'مدرسہ غوثیہ رضویہ';
  const addressText =
    settings?.address ||
    'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110';
  const websiteUrl = settings?.website || 'https://gausiya.zite.so/';
  const referenceNo = data.reference_no || data.admission_no || '—';

  return (
    <div className="bg-white text-[#171717] space-y-4">
      {/* Header matching Iqrar Nama exact top letterhead layout */}
      <div className="flex items-start justify-between gap-4 pb-3 border-b-2 border-[#141E30]">
        {/* Passport Size Photo Box (Top-Left) */}
        <div className="w-24 h-28 rounded-lg border-2 border-dashed border-neutral-400 flex items-center justify-center p-1 text-center shrink-0 bg-neutral-50/50 overflow-hidden">
          {data.photo_url ? (
            <img
              src={data.photo_url}
              alt={data.student_name || 'Student'}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded"
            />
          ) : (
            <div className="space-y-1">
              <div className="urdu-text text-[11px] font-medium text-neutral-500 leading-snug">
                تصویر برائے طالب علم
              </div>
              <div className="text-[10px] text-neutral-400">(Passport Size)</div>
            </div>
          )}
        </div>

        {/* Center Institutional Heading */}
        <div className="flex-1 text-center space-y-1">
          <div className="urdu-text text-xs text-neutral-700">
            بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
          </div>
          <h2 className="urdu-text text-xl sm:text-2xl font-bold text-[#171717] leading-snug">
            {urduName}
          </h2>
          <div className="text-xs sm:text-sm font-extrabold tracking-wide text-[#1B2A59]">
            {englishName}
          </div>
          <div className="text-[11px] text-neutral-600">{addressText}</div>
        </div>

        {/* Madrasa Logo (Top-Right) */}
        <div className="shrink-0 flex items-center justify-center">
          <MadrasaLogo logoUrl={settings?.logo_url} size={72} />
        </div>
      </div>

      {/* Navy Title Banner for Admission Form */}
      <div className="bg-[#141E30] text-white text-center py-2 px-4 rounded-lg flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="text-sm sm:text-base font-extrabold tracking-wider uppercase">
          ADMISSION APPLICATION FORM
        </span>
        <span className="text-white/50">•</span>
        <span className="urdu-text text-base sm:text-lg font-bold tracking-wide">
          داخلہ فارم
        </span>
      </div>

      {/* Reference / Official Admission Number & Status Summary Strip */}
      <div className={`grid grid-cols-1 ${data.student_code ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3 border border-neutral-300 rounded-lg p-3.5 bg-neutral-50/70 text-xs`}>
        {data.student_code && (
          <div>
            <span className="text-[#737373]">Student ID:</span>{' '}
            <strong className="font-mono-num text-sm text-[#171717]">
              {data.student_code}
            </strong>
          </div>
        )}
        <div>
          <span className="text-[#737373]">
            {data.status === 'approved' && !String(referenceNo).startsWith('REF-')
              ? 'Official Admission No:'
              : 'Reference Number:'}
          </span>{' '}
          <strong className="font-mono-num text-sm text-[#DC1726]">
            {referenceNo}
          </strong>
        </div>
        <div>
          <span className="text-[#737373]">
            {data.status === 'approved' ? 'Admission Date:' : 'Application Date:'}
          </span>{' '}
          <strong className="font-mono-num text-[#171717]">
            {data.admission_date || '—'}
          </strong>
        </div>
        <div>
          <span className="text-[#737373]">Status:</span>{' '}
          <strong
            className={`uppercase ${
              data.status === 'approved'
                ? 'text-[#10B981]'
                : data.status === 'rejected'
                  ? 'text-[#DC1726]'
                  : 'text-[#F59E0B]'
            }`}
          >
            {data.status || 'pending'}
          </strong>
        </div>
      </div>

      {/* Complete Filled Admission Details */}
      <div className="border border-neutral-300 rounded-lg p-4 bg-white space-y-3 text-xs">
        <div className="text-xs font-bold uppercase tracking-wide text-[#141E30] border-b border-neutral-200 pb-1.5">
          Student &amp; Guardian Details
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <div>
            <span className="text-[#737373]">Student Full Name:</span>{' '}
            <strong className="text-[#171717]">{data.student_name || '—'}</strong>
          </div>
          <div>
            <span className="text-[#737373]">Applied Class:</span>{' '}
            <strong className="text-[#171717]">{data.class_name || '—'}</strong>
          </div>
          <div>
            <span className="text-[#737373]">Father&apos;s Name:</span>{' '}
            <strong className="text-[#171717]">{data.father_name || '—'}</strong>
          </div>
          <div>
            <span className="text-[#737373]">Mother&apos;s Name:</span>{' '}
            <strong className="text-[#171717]">{data.mother_name || '—'}</strong>
          </div>
          <div>
            <span className="text-[#737373]">Date of Birth:</span>{' '}
            <strong className="font-mono-num text-[#171717]">{data.dob || '—'}</strong>
          </div>
          <div>
            <span className="text-[#737373]">Gender / Religion:</span>{' '}
            <strong className="text-[#171717]">
              {data.gender || '—'} / {data.religion || 'Islam'}
            </strong>
          </div>
          <div>
            <span className="text-[#737373]">Guardian Name:</span>{' '}
            <strong className="text-[#171717]">
              {data.guardian_name || data.father_name || '—'} (
              {data.guardian_relationship || 'Father'})
            </strong>
          </div>
          <div>
            <span className="text-[#737373]">Guardian Mobile:</span>{' '}
            <strong className="font-mono-num text-[#171717]">
              {data.guardian_mobile || '—'}
            </strong>
          </div>
          {data.student_mobile && (
            <div>
              <span className="text-[#737373]">Student Mobile:</span>{' '}
              <strong className="font-mono-num text-[#171717]">{data.student_mobile}</strong>
            </div>
          )}
          <div>
            <span className="text-[#737373]">Previous School / Madrasa:</span>{' '}
            <strong className="text-[#171717]">
              {data.previous_school || '—'}
              {data.previous_class ? ` (${data.previous_class})` : ''}
            </strong>
          </div>
          <div className="sm:col-span-2">
            <span className="text-[#737373]">Complete Address:</span>{' '}
            <strong className="text-[#171717]">{fullAddress || '—'}</strong>
          </div>
          {data.remarks && (
            <div className="sm:col-span-2">
              <span className="text-[#737373]">Remarks:</span>{' '}
              <span className="text-[#171717]">{data.remarks}</span>
            </div>
          )}
        </div>
      </div>

      {/* Office Note & Signature Footer */}
      <div className="border border-neutral-300 rounded-lg p-3.5 bg-neutral-50/50 space-y-3 text-xs">
        <p className="text-[11px] text-[#525252]">
          {data.status === 'approved'
            ? 'Note: Official Student Admission confirmed by the Madrasa Administration. Keep this Admission Form and Student ID for all future academic records.'
            : 'Note: This Reference Number is issued for admission application tracking. Official Student Admission Number is assigned by the Madrasa Administration upon approval.'}
        </p>
        <div className="grid grid-cols-3 gap-4 pt-7 text-center text-[11px] text-[#737373]">
          <div className="border-t border-neutral-400 pt-1.5 font-medium text-[#171717]">
            Guardian / Applicant Signature
          </div>
          <div className="border-t border-neutral-400 pt-1.5 font-medium text-[#171717]">
            Nazim-e-Talimat / Clerk
          </div>
          <div className="border-t border-neutral-400 pt-1.5 font-medium text-[#171717]">
            Principal / Sadr-e-Madrasa
          </div>
        </div>
      </div>

      {/* Institutional Bottom Strip */}
      <div className="pt-2 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span className="font-mono-num">Website: {websiteUrl}</span>
        <span>
          Admission Application Form - {settings?.name || 'Madrasa Gausiya Razvia'}
        </span>
      </div>
    </div>
  );
};
