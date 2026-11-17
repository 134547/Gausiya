import React from 'react';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from './MadrasaLogo.tsx';

export interface LoginCredentialsData {
  student_name?: string;
  father_name?: string;
  reference_no?: string;
  admission_no?: string;
  official_admission_no?: string;
  student_code?: string;
  username?: string;
  temporary_password?: string;
  class_name?: string;
  admission_date?: string;
  account_status?: string;
  guardian_mobile?: string;
}

interface LoginCredentialsSheetProps {
  settings?: MadrasaSettings | null;
  data: LoginCredentialsData;
}

export const LoginCredentialsSheet: React.FC<LoginCredentialsSheetProps> = ({ settings, data }) => {
  const englishName = (settings?.name || 'MADRASA GAUSIYA RAZVIA').toUpperCase();
  const urduName = settings?.name_urdu || 'مدرسہ غوثیہ رضویہ';
  const addressText =
    settings?.address ||
    'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110';
  const referenceNo = data.reference_no || data.admission_no || '—';
  const admissionNumberText = data.official_admission_no || 'Pending Approval';

  return (
    <div className="bg-white text-[#171717] space-y-5">
      <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-[#141E30]">
        <MadrasaLogo logoUrl={settings?.logo_url} size={64} />
        <div className="flex-1 text-center space-y-0.5">
          <div className="urdu-text text-xs text-neutral-600">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ</div>
          <h2 className="urdu-text text-xl font-bold text-[#171717]">{urduName}</h2>
          <div className="text-xs font-extrabold tracking-wide text-[#1B2A59]">{englishName}</div>
          <div className="text-[11px] text-neutral-600">{addressText}</div>
        </div>
        <div className="w-16 shrink-0" />
      </div>

      <div className="bg-[#141E30] text-white text-center py-2.5 px-4 rounded-lg">
        <div className="text-sm font-extrabold tracking-wider uppercase">
          STUDENT PORTAL LOGIN CREDENTIALS &amp; ADMISSION RECEIPT
        </div>
        <div className="text-[11px] text-white/80 mt-0.5">
          Save this slip carefully — Password is shown only once at registration
        </div>
      </div>

      <div className="border border-neutral-300 rounded-xl p-4 bg-neutral-50/70 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-[#737373]">Student Name:</span>{' '}
          <strong className="text-[#171717]">{data.student_name || '—'}</strong>
        </div>
        <div>
          <span className="text-[#737373]">Father&apos;s Name:</span>{' '}
          <strong className="text-[#171717]">{data.father_name || '—'}</strong>
        </div>
        <div>
          <span className="text-[#737373]">Application Reference Number:</span>{' '}
          <strong className="font-mono-num text-[#DC1726]">{referenceNo}</strong>
        </div>
        <div>
          <span className="text-[#737373]">Admission Number:</span>{' '}
          <strong className="font-mono-num text-[#171717]">{admissionNumberText}</strong>
        </div>
        <div>
          <span className="text-[#737373]">Class / Course:</span>{' '}
          <strong className="text-[#171717]">{data.class_name || 'To be assigned'}</strong>
        </div>
        <div>
          <span className="text-[#737373]">Account Status:</span>{' '}
          <strong className="text-amber-700 uppercase">Pending Approval</strong>
        </div>
        {data.student_code && (
          <div>
            <span className="text-[#737373]">Student Code:</span>{' '}
            <strong className="font-mono-num text-[#171717]">{data.student_code}</strong>
          </div>
        )}
        <div>
          <span className="text-[#737373]">Registration Date:</span>{' '}
          <strong className="font-mono-num text-[#171717]">{data.admission_date || '—'}</strong>
        </div>
      </div>

      <div className="border-2 border-[#DC1726] rounded-xl p-5 bg-red-50/30 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-[#DC1726]">
          Portal Login Credentials (Confidential)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-white border border-neutral-200 rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#737373]">Generated Username</div>
            <div className="text-base font-bold font-mono-num text-[#171717] mt-1">
              {data.username || '—'}
            </div>
          </div>
          <div className="bg-white border border-neutral-200 rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#737373]">Generated Temporary Password</div>
            <div className="text-base font-bold font-mono-num text-[#DC1726] mt-1">
              {data.temporary_password || 'Shown only once'}
            </div>
          </div>
        </div>
      </div>

      <div className="border border-amber-300 bg-amber-50/70 rounded-xl p-4 text-xs text-amber-900 leading-relaxed">
        Your admission application has been submitted successfully. Your student account and personal dashboard have
        been created. Please save your username and password carefully. You will be able to log in only after the
        Super Admin approves your admission.
      </div>

      <div className="pt-2 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span>Founder: Dilshad Ansari S/o MD Ayub Ansari · Contact: 7209629509 / 6202736648</span>
        <span>{settings?.name || 'Madrasa Gausiya Razvia'}</span>
      </div>
    </div>
  );
};
