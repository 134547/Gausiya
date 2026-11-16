import React from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Language } from '../i18n/translations.ts';

export interface CaptchaChallengeData {
  token: string;
  image: string;
}

interface SecurityCaptchaBoxProps {
  captcha: CaptchaChallengeData;
  answer: string;
  onAnswerChange: (value: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  lang?: Language;
}

export const SecurityCaptchaBox: React.FC<SecurityCaptchaBoxProps> = ({
  captcha,
  answer,
  onAnswerChange,
  onRefresh,
  refreshing = false,
  lang = 'en',
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#171717]">
          <ShieldCheck className="w-4 h-4 text-[#DC1726]" />
          <span>{lang === 'ur' ? 'سیکیورٹی تصدیق (CAPTCHA)' : 'Security Verification (CAPTCHA)'}</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#737373] hover:text-[#171717] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{lang === 'ur' ? 'نیا کوڈ' : 'Refresh'}</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <img
          src={captcha.image}
          alt="Security CAPTCHA"
          className="h-[52px] w-[180px] rounded-lg border border-neutral-200 bg-white shrink-0 select-none"
        />
        <input
          type="text"
          required
          autoComplete="off"
          maxLength={8}
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value.toUpperCase())}
          placeholder={lang === 'ur' ? 'تصویر کا کوڈ درج کریں' : 'Enter code shown'}
          className="w-full px-3 py-2.5 text-sm font-mono-num uppercase tracking-widest rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#DC1726]/20 focus:border-[#DC1726]"
        />
      </div>
    </div>
  );
};
