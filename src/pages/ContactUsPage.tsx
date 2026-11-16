import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from '../components/MadrasaLogo.tsx';

interface ContactUsPageProps {
  settings: MadrasaSettings | null;
}

const WHATSAPP_NUMBER = '7209629509';
const WHATSAPP_DISPLAY = '+91 72096 29509 (7209629509)';
const WHATSAPP_URL = 'https://wa.me/917209629509';
const CONTACT_GMAIL = 'dil.dil.a.1345@gmail.com';
const DEFAULT_ADDRESS = 'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110';

export const ContactUsPage: React.FC<ContactUsPageProps> = ({ settings }) => {
  const [copiedField, setCopiedField] = useState<'whatsapp' | 'gmail' | null>(null);

  const handleCopy = async (value: string, field: 'whatsapp' | 'gmail') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore clipboard errors in restricted iframes
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center gap-4">
        <MadrasaLogo logoUrl={settings?.logo_url} size={58} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-[#171717]">
            {settings?.name || 'Madrasa Ghausia Razvia'} — Contact Us
          </h2>
          <p className="urdu-text text-sm text-[#DC1726] font-semibold mt-0.5">
            {settings?.name_urdu || 'مدرسہ غوثیہ رضویہ'} — ہم سے رابطہ کریں
          </p>
          <p className="text-xs text-[#737373] mt-1">
            Reach our administration directly via WhatsApp or Gmail for admission assistance, portal account roles, or general inquiries.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* WhatsApp Contact Card */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#10B981] flex items-center justify-center shrink-0">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#10B981]">WhatsApp Support</div>
              <h3 className="text-base font-bold text-[#171717] mt-0.5 font-mono-num">{WHATSAPP_NUMBER}</h3>
              <p className="text-xs text-[#737373] mt-1 font-mono-num">{WHATSAPP_DISPLAY}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#10B981] text-white text-xs font-semibold hover:bg-emerald-600 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Chat on WhatsApp</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={`tel:+91${WHATSAPP_NUMBER}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-[#171717] hover:bg-neutral-50"
            >
              <Phone className="w-3.5 h-3.5 text-[#737373]" />
              <span>Call</span>
            </a>
            <button
              type="button"
              onClick={() => handleCopy(WHATSAPP_NUMBER, 'whatsapp')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-[#737373] hover:text-[#171717] hover:bg-neutral-50"
            >
              {copiedField === 'whatsapp' ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedField === 'whatsapp' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Gmail Contact Card */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-red-50 text-[#DC1726] flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#DC1726]">Official Gmail</div>
              <h3 className="text-base font-bold text-[#171717] mt-0.5 break-all">{CONTACT_GMAIL}</h3>
              <p className="text-xs text-[#737373] mt-1">Email us anytime for documents, results, or official correspondence.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
            <a
              href={`mailto:${CONTACT_GMAIL}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Send Email</span>
            </a>
            <button
              type="button"
              onClick={() => handleCopy(CONTACT_GMAIL, 'gmail')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-[#737373] hover:text-[#171717] hover:bg-neutral-50"
            >
              {copiedField === 'gmail' ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedField === 'gmail' ? 'Copied' : 'Copy Gmail'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Institutional Address */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-neutral-100 text-[#171717] flex items-center justify-center shrink-0">
          <MapPin className="w-5 h-5 text-[#DC1726]" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#737373]">Madrasa Address</div>
          <div className="text-sm font-semibold text-[#171717]">
            {settings?.address || DEFAULT_ADDRESS}
          </div>
          {settings?.address_urdu && (
            <div className="urdu-text text-sm text-[#737373]">{settings.address_urdu}</div>
          )}
          {settings?.phone && (
            <div className="text-xs text-[#737373] font-mono-num pt-1">
              Office Phone: {settings.phone}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
