import React from 'react';
import { ArrowLeft, LogIn } from 'lucide-react';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from '../components/MadrasaLogo.tsx';
import { StudentResultLookupWidget } from '../components/StudentResultLookupWidget.tsx';

interface PublicCheckResultPageProps {
  settings: MadrasaSettings | null;
  resultsOpen?: boolean;
  onBackHome: () => void;
  onGoLogin: () => void;
}

export const PublicCheckResultPage: React.FC<PublicCheckResultPageProps> = ({
  settings,
  resultsOpen = true,
  onBackHome,
  onGoLogin,
}) => {
  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4 no-print">
        <button type="button" onClick={onBackHome} className="flex items-center gap-3 text-start">
          <MadrasaLogo logoUrl={settings?.logo_url} size={38} />
          <div>
            <div className="text-sm font-bold text-[#171717] whitespace-nowrap">
              {settings?.name || 'Madrasa Gausiya Razvia'}
            </div>
            <div className="text-[11px] text-[#737373]">Student Result Verification</div>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </button>
          <button
            type="button"
            onClick={onGoLogin}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg gold-gradient text-white text-xs font-semibold shadow-sm whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5" /> Portal Login
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8">
        <StudentResultLookupWidget
          settings={settings}
          resultsOpen={resultsOpen}
          onBackHome={onBackHome}
          onGoLogin={onGoLogin}
        />
      </main>

      <footer className="border-t border-neutral-200 bg-white px-4 py-4 text-center text-xs text-[#737373] no-print">
        <span>Need help? Contact Us (Founder: Dilshad Ansari S/o MD Ayub Ansari): </span>
        <a
          href="https://wa.me/917209629509"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#10B981] hover:underline font-mono-num"
        >
          WhatsApp 7209629509
        </a>
        <span> · </span>
        <a href="tel:+916202736648" className="font-semibold text-[#0EA5E9] hover:underline font-mono-num">
          Call 6202736648
        </a>
        <span> · </span>
        <a href="mailto:dil.dil.a.1345@gmail.com" className="font-semibold text-[#DC1726] hover:underline">
          dil.dil.a.1345@gmail.com
        </a>
        <span> · </span>
        <a href="mailto:gausiyamadarsa92@gmail.com" className="font-semibold text-[#DC1726] hover:underline">
          gausiyamadarsa92@gmail.com
        </a>
      </footer>
    </div>
  );
};
