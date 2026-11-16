import React from 'react';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from './MadrasaLogo.tsx';

export interface IqrarNamaData {
  reference_no?: string;
  admission_no?: string;
  student_name?: string;
  father_name?: string;
  dob?: string;
  gender?: string;
  guardian_name?: string;
  guardian_relationship?: string;
  guardian_mobile?: string;
  address?: string;
  village?: string;
  district?: string;
  state?: string;
  pin_code?: string;
  class_name?: string;
  previous_school?: string;
  admission_date?: string;
  photo_url?: string;
  status?: string;
}

interface IqrarNamaSheetProps {
  settings: MadrasaSettings | null;
  data: IqrarNamaData;
  compact?: boolean;
}

function mapGenderUrdu(gender?: string): string {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'male') return 'لڑکا';
  if (g === 'female') return 'لڑکی';
  return gender || '';
}

function mapRelationshipUrdu(rel?: string): string {
  const r = String(rel || '').trim().toLowerCase();
  if (r === 'father') return 'والد';
  if (r === 'mother') return 'والدہ';
  if (r === 'brother') return 'بھائی';
  if (r === 'uncle') return 'چچا / ماموں';
  return rel || 'والد / سرپرست';
}

export const IqrarNamaSheet: React.FC<IqrarNamaSheetProps> = ({
  settings,
  data,
  compact = false,
}) => {
  const guardianName = (data.guardian_name || data.father_name || '').trim();
  const villageOrAddress = (data.village || data.address || '').trim();
  const fullAddress = [data.address, data.village, data.district, data.state, data.pin_code]
    .filter((v) => String(v || '').trim().length > 0)
    .join(', ');
  const studentName = (data.student_name || '').trim();
  const genderUrdu = mapGenderUrdu(data.gender);
  const relUrdu = mapRelationshipUrdu(data.guardian_relationship);
  const websiteUrl = settings?.website || 'https://gausiya.zite.so/';
  const englishName = (settings?.name || 'MADARSA GAUSIYA RIZVIYA ISLAMNAGAR').toUpperCase();
  const urduName = settings?.name_urdu || 'مدرسہ غوثیہ رضویہ اسلام نگر';
  const addressText =
    settings?.address ||
    'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110';

  if (compact) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 overflow-hidden">
        <div className="bg-[#141E30] text-white px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold tracking-wide">
            Iqrar Nama — Guardian Admission Declaration
          </span>
          <span className="urdu-text text-sm font-bold" dir="rtl">
            اقرار نامہ سرپرست (برائے داخلہ)
          </span>
        </div>

        <div className="p-4 sm:p-5 space-y-3 text-right" dir="rtl">
          <div className="urdu-text text-sm font-bold text-[#141E30]">
            اقرار نامہ
          </div>
          <p className="urdu-text text-xs sm:text-[13px] text-[#171717] leading-loose">
            میں{' '}
            <span className="inline-block min-w-[110px] border-b border-dashed border-neutral-400 px-1.5 font-bold text-[#DC1726] text-center">
              {guardianName || '____________________'}
            </span>{' '}
            ، پتہ (گاؤں / محلہ){' '}
            <span className="inline-block min-w-[110px] border-b border-dashed border-neutral-400 px-1.5 font-bold text-[#171717] text-center">
              {villageOrAddress || '____________________'}
            </span>{' '}
            ، میں اپنی مکمل رضامندی سے اپنے بیٹے / بیٹی{' '}
            <span className="inline-block min-w-[110px] border-b border-dashed border-neutral-400 px-1.5 font-bold text-[#DC1726] text-center">
              {studentName || '____________________'}
            </span>{' '}
            کو مدرسہ غوثیہ رضویہ اسلام نگر میں داخل کروا رہا / رہی ہوں۔
          </p>

          <ol className="urdu-text text-xs text-[#262626] space-y-1.5 leading-loose list-none pr-0">
            <li>
              ١۔ میں اقرار کرتا / کرتی ہوں کہ میرا نیک فرزند / دختر نیک مدرسے کے تمام قواعد و ضوابط، تعلیمی اوقات اور نظم و ضبط کی مکمل پابندی کرے گا / کرے گی۔
            </li>
            <li>
              ٢۔ میں اپنے بچے کی تعلیم و تربیت میں مدرسے کی انتظامیہ کے ساتھ مکمل تعاون کروں گا / کروں گی اور اساتذہ کی مناسب رہنمائی اور انتظامیہ کے تمام جائز فیصلوں کو قبول کروں گا / کروں گی۔
            </li>
            <li>
              ٣۔ میں اس بات کا بھی ذمہ دار ہوں کہ مدرسے کے قواعد کی خلاف ورزی یا مدرسے کی املاک کو نقصان پہنچانے کی صورت میں اپنی ذمہ داری ادا کروں گا / کروں گی۔
            </li>
          </ol>

          <p className="urdu-text text-xs font-semibold text-[#171717] pt-1 border-t border-neutral-200">
            میں نے یہ اقرار نامہ پڑھ اور سمجھ لیا ہے اور اس کے تمام درج ذیل اصول و ضوابط سے مکمل اتفاق کرتا / کرتی ہوں۔
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white text-[#171717] space-y-4">
      {/* Header matching Page 1 of Guardian Iqrar Nama PDF */}
      <div className="flex items-start justify-between gap-4 pb-3 border-b-2 border-[#141E30]">
        {/* Passport Size Photo Box (Top-Left visually) */}
        <div className="w-24 h-28 rounded-lg border-2 border-dashed border-neutral-400 flex items-center justify-center p-1 text-center shrink-0 bg-neutral-50/50">
          {data.photo_url ? (
            <img
              src={data.photo_url}
              alt={studentName || 'Student'}
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

        {/* Madrasa Logo (Top-Right visually) */}
        <div className="shrink-0 flex items-center justify-center">
          <MadrasaLogo logoUrl={settings?.logo_url} size={72} />
        </div>
      </div>

      {/* Navy Title Banner */}
      <div className="bg-[#141E30] text-white text-center py-2 px-4 rounded-lg">
        <span className="urdu-text text-base sm:text-lg font-bold tracking-wide">
          اقرار نامہ سرپرست (برائے داخلہ)
        </span>
      </div>

      {/* 2-Column Metadata Cards (RTL) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" dir="rtl">
        {/* Right Column in RTL: Guardian Personal Information */}
        <div className="border border-neutral-300 rounded-lg p-3.5 bg-neutral-50/40 space-y-2">
          <div className="urdu-text text-sm font-bold text-[#141E30] border-b border-neutral-200 pb-1.5">
            ذاتی معلومات (سرپرست)
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">سرپرست کا نام:</span>
              <span className="font-semibold text-[#171717] text-left">
                {guardianName || '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">
                سرپرست کی حیثیت (والد / والدہ / دیگر):
              </span>
              <span className="urdu-text font-medium text-[#171717] text-left">
                {relUrdu}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">موبائل نمبر:</span>
              <span className="font-mono-num font-semibold text-[#171717]" dir="ltr">
                {data.guardian_mobile || '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">مکمل پتہ:</span>
              <span className="font-medium text-[#171717] text-left">
                {fullAddress || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Left Column in RTL: Student Information */}
        <div className="border border-neutral-300 rounded-lg p-3.5 bg-neutral-50/40 space-y-2">
          <div className="urdu-text text-sm font-bold text-[#141E30] border-b border-neutral-200 pb-1.5">
            معلومات برائے طالب علم
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">
                ریفرنس نمبر (Reference No):
              </span>
              <span className="font-mono-num font-bold text-[#DC1726]" dir="ltr">
                {data.reference_no || data.admission_no || '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">
                طالب علم کا نام (لڑکا / لڑکی):
              </span>
              <span className="font-semibold text-[#171717] text-left">
                {studentName || '—'}
                {genderUrdu ? ` (${genderUrdu})` : ''}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">تاریخ پیدائش:</span>
              <span className="font-mono-num font-medium text-[#171717]" dir="ltr">
                {data.dob || '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">
                داخلہ مطلوبہ جماعت (Class):
              </span>
              <span className="font-semibold text-[#171717] text-left">
                {data.class_name || '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="urdu-text text-neutral-600 shrink-0">
                سابقہ مدرسہ / اسکول:
              </span>
              <span className="font-medium text-[#171717] text-left">
                {data.previous_school || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Iqrar Nama Declaration Box */}
      <div className="border border-neutral-300 rounded-lg p-4 space-y-2.5" dir="rtl">
        <div className="urdu-text text-base font-bold text-[#141E30] border-b border-neutral-200 pb-1">
          اقرار نامہ
        </div>
        <p className="urdu-text text-xs sm:text-[13px] text-[#171717] leading-loose">
          میں{' '}
          <span className="inline-block min-w-[130px] border-b border-dotted border-neutral-500 px-2 font-bold text-[#141E30] text-center">
            {guardianName || '____________________'}
          </span>{' '}
          ، پتہ (گاؤں / محلہ){' '}
          <span className="inline-block min-w-[130px] border-b border-dotted border-neutral-500 px-2 font-bold text-[#141E30] text-center">
            {villageOrAddress || '____________________'}
          </span>{' '}
          ، میں اپنی مکمل رضامندی سے اپنے بیٹے / بیٹی{' '}
          <span className="inline-block min-w-[130px] border-b border-dotted border-neutral-500 px-2 font-bold text-[#141E30] text-center">
            {studentName || '____________________'}
          </span>{' '}
          کو مدرسہ غوثیہ رضویہ اسلام نگر میں داخل کروا رہا / رہی ہوں۔
        </p>

        <ol className="urdu-text text-xs text-[#262626] space-y-1.5 leading-loose list-none pr-0">
          <li>
            ١۔ میں اقرار کرتا / کرتی ہوں کہ میرا نیک فرزند / دختر نیک مدرسے کے تمام قواعد و ضوابط، تعلیمی اوقات اور نظم و ضبط کی مکمل پابندی کرے گا / کرے گی۔
          </li>
          <li>
            ٢۔ میں اپنے بچے کی تعلیم و تربیت میں مدرسے کی انتظامیہ کے ساتھ مکمل تعاون کروں گا / کروں گی اور اساتذہ کی مناسب رہنمائی اور انتظامیہ کے تمام جائز فیصلوں کو قبول کروں گا / کروں گی۔
          </li>
          <li>
            ٣۔ میں اس بات کا بھی ذمہ دار ہوں کہ مدرسے کے قواعد کی خلاف ورزی یا مدرسے کی املاک کو نقصان پہنچانے کی صورت میں اپنی ذمہ داری ادا کروں گا / کروں گی۔
          </li>
        </ol>

        <p className="urdu-text text-xs font-bold text-[#171717] pt-1">
          میں نے یہ اقرار نامہ پڑھ اور سمجھ لیا ہے اور اس کے تمام درج ذیل اصول و ضوابط سے مکمل اتفاق کرتا / کرتی ہوں۔
        </p>
      </div>

      {/* Guardian & Student Signature Verification Box */}
      <div className="border border-neutral-300 rounded-lg p-3.5 space-y-3" dir="rtl">
        <div className="urdu-text text-sm font-bold text-[#141E30]">
          دستخط سرپرست و توثیق
        </div>
        <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs">
          <div className="border-t border-neutral-400 pt-1.5 urdu-text font-medium text-[#171717]">
            دستخط سرپرست
          </div>
          <div className="border-t border-neutral-400 pt-1.5 urdu-text font-medium text-[#171717]">
            دستخط طالب علم
          </div>
          <div>
            <div className="font-mono-num text-[11px] font-semibold text-[#171717] -mt-5 mb-1" dir="ltr">
              {data.admission_date || ''}
            </div>
            <div className="border-t border-neutral-400 pt-1.5 urdu-text font-medium text-[#171717]">
              تاریخ
            </div>
          </div>
        </div>
      </div>

      {/* Madrasa Office Administration Box */}
      <div className="border border-neutral-300 rounded-lg p-3.5 bg-neutral-50/60" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-3 flex-1">
            <div className="urdu-text text-sm font-bold text-[#141E30]">
              برائے مدرسہ انتظامیہ (دفتر کے لیے)
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <span className="urdu-text font-medium text-neutral-700">داخلہ کیفیت:</span>
                <span className="urdu-text font-bold text-[#171717]">
                  {data.status === 'approved' ? (
                    <span className="text-[#10B981]">منظور</span>
                  ) : data.status === 'rejected' ? (
                    <span className="text-[#DC1726]">نامنظور</span>
                  ) : (
                    'منظور / نامنظور'
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="urdu-text font-medium text-neutral-700">
                  دستخط داخلہ کنندہ:
                </span>
                <span className="inline-block w-36 border-b border-neutral-400" />
              </div>
            </div>
          </div>

          <div className="w-28 h-20 border border-dashed border-neutral-400 rounded-lg flex flex-col items-center justify-center text-center shrink-0 bg-white">
            <span className="urdu-text text-xs font-medium text-neutral-500">مہر مدرسہ</span>
            <span className="text-[10px] text-neutral-400">(Seal)</span>
          </div>
        </div>
      </div>

      {/* Footer matching Page 1 */}
      <div className="pt-2 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span className="font-mono-num">Website: {websiteUrl}</span>
        <span className="urdu-text">
          اقرار نامہ سرپرست برائے داخلہ - Madarsa Gausiya Rizviya Islamnagar
        </span>
      </div>
    </div>
  );
};
