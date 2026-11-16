import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  FileUp,
  Lock,
  LogIn,
  Mail,
  MapPin,
  Phone,
  Printer,
  ScrollText,
  Search,
  XCircle,
} from 'lucide-react';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from '../components/MadrasaLogo.tsx';
import { PrintModal } from '../components/PrintModal.tsx';
import { IqrarNamaSheet } from '../components/IqrarNamaSheet.tsx';
import { AdmissionPaperSheet } from '../components/AdmissionPaperSheet.tsx';

interface PublicAdmissionPageProps {
  settings: MadrasaSettings | null;
  admissionsOpen?: boolean;
  classes: { id: string; name: string }[];
  initialSection?: 'form' | 'iqrar' | 'status';
  onBackHome: () => void;
  onGoLogin: () => void;
}

type PrintDocMode = 'combined' | 'admission' | 'iqrar' | 'blank_iqrar';

export const PublicAdmissionPage: React.FC<PublicAdmissionPageProps> = ({
  settings,
  admissionsOpen = true,
  classes,
  initialSection = 'form',
  onBackHome,
  onGoLogin,
}) => {
  const [activeSection, setActiveSection] = useState<'form' | 'iqrar' | 'status'>(initialSection);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);
  const [form, setForm] = useState({
    student_name: '',
    father_name: '',
    mother_name: '',
    dob: '',
    gender: 'Male',
    guardian_name: '',
    guardian_relationship: 'Father',
    guardian_mobile: '',
    student_mobile: '',
    admission_class_id: classes[0]?.id ? String(classes[0].id) : '',
    previous_school: '',
    previous_class: '',
    address: '',
    village: '',
    district: 'Palamu',
    state: 'Jharkhand',
    pin_code: '',
    photo_url: '',
    remarks: '',
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<any>(null);
  const [submittedPreviewTab, setSubmittedPreviewTab] = useState<'admission' | 'iqrar'>('admission');
  const [printOpen, setPrintOpen] = useState(false);
  const [printMode, setPrintMode] = useState<PrintDocMode>('combined');

  const [statusRef, setStatusRef] = useState('');
  const [statusMobile, setStatusMobile] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusResult, setStatusResult] = useState<any>(null);

  const selectedClassName =
    classes.find((c) => String(c.id) === String(form.admission_class_id))?.name || '';

  const liveRecord =
    activeSection === 'status' && statusResult
      ? statusResult
      : submitted || {
          ...form,
          class_name: selectedClassName,
          admission_date: new Date().toISOString().slice(0, 10),
        };

  const openPrintWithMode = (mode: PrintDocMode) => {
    setPrintMode(mode);
    setPrintOpen(true);
  };

  const handlePhotoUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/public/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm((prev) => ({ ...prev, photo_url: data.url }));
    } catch (e: any) {
      setError(e.message || 'Could not upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/admission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setSubmitted(data);
      setSubmittedPreviewTab('admission');
    } catch (e: any) {
      setError(e.message || 'Failed to submit admission application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError('');
    setStatusResult(null);
    setStatusLoading(true);
    try {
      const res = await fetch('/api/public/admission-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_no: statusRef, mobile: statusMobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not find admission status');
      setStatusResult(data);
    } catch (e: any) {
      setStatusError(e.message || 'Could not check admission status');
    } finally {
      setStatusLoading(false);
    }
  };

  const resetForAnother = () => {
    setSubmitted(null);
    setActiveSection('form');
    setForm({
      ...form,
      student_name: '',
      father_name: '',
      mother_name: '',
      dob: '',
      guardian_name: '',
      guardian_mobile: '',
      student_mobile: '',
      previous_school: '',
      previous_class: '',
      address: '',
      village: '',
      pin_code: '',
      photo_url: '',
      remarks: '',
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4 no-print">
        <button type="button" onClick={onBackHome} className="flex items-center gap-3 text-start">
          <MadrasaLogo logoUrl={settings?.logo_url} size={38} />
          <div>
            <div className="text-sm font-bold text-[#171717] whitespace-nowrap">
              {settings?.name || 'Madrasa Ghausia Razvia'}
            </div>
            <div className="text-[11px] text-[#737373]">Online Admission &amp; Iqrar Nama</div>
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

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-5 no-print">
        {!admissionsOpen ? (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-10 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-red-50 text-[#DC1726] flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#171717]">Online Admissions Currently Closed</h1>
              <p className="text-xs sm:text-sm text-[#737373] mt-2 max-w-md mx-auto leading-relaxed">
                Online admission applications and status checking are currently closed by {settings?.name || 'Madrasa Ghausia Razvia'} administration. Please check back later or contact the Madrasa office directly for assistance.
              </p>
            </div>
            <div className="max-w-md mx-auto bg-neutral-50 rounded-xl border border-neutral-200 p-4 text-xs text-[#737373] space-y-2">
              <div className="flex items-center justify-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#DC1726] shrink-0" />
                <span>{settings?.address || 'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110'}</span>
              </div>
              <div className="flex items-center justify-center gap-2 font-mono-num">
                <Phone className="w-3.5 h-3.5 text-[#DC1726] shrink-0" />
                <span>{settings?.phone || '+91 62027 36648'}</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#DC1726] shrink-0" />
                <span>{settings?.email || 'dil.dil.a.1345@gmail.com'}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onBackHome}
                className="px-5 py-2.5 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 whitespace-nowrap"
              >
                Return to Home
              </button>
              <button
                type="button"
                onClick={onGoLogin}
                className="px-5 py-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
              >
                Portal Login
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Dedicated Sections under Admission: Admission Form | Iqrar Nama */}
            <div className="bg-white rounded-xl border border-neutral-200 p-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveSection('form')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeSection === 'form'
                      ? 'bg-[#DC1726] text-white shadow-xs'
                      : 'text-[#525252] hover:bg-neutral-100'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>{submitted ? 'Filled Admission Paper & Slip' : 'Admission Form (داخلہ فارم)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('status')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeSection === 'status'
                      ? 'bg-[#10B981] text-white shadow-xs'
                      : 'text-[#525252] hover:bg-neutral-100'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>Check Admission Status (اسٹیٹس چیک)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('iqrar')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeSection === 'iqrar'
                      ? 'bg-[#141E30] text-white shadow-xs'
                      : 'text-[#525252] hover:bg-neutral-100'
                  }`}
                >
                  <ScrollText className="w-4 h-4" />
                  <span>Iqrar Nama (اقرار نامہ)</span>
                </button>
              </div>

              {activeSection === 'iqrar' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openPrintWithMode('iqrar')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#141E30] text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Iqrar Nama
                  </button>
                  <button
                    type="button"
                    onClick={() => openPrintWithMode('blank_iqrar')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Blank Iqrar Nama
                  </button>
                </div>
              )}
            </div>

            {activeSection === 'status' ? (
              <div className="space-y-5">
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 sm:p-8 space-y-5">
                  <div className="border-b border-neutral-100 pb-4">
                    <h1 className="text-lg sm:text-xl font-bold text-[#171717]">
                      Check Online Admission Status (داخلہ کی صورتحال چیک کریں)
                    </h1>
                    <p className="text-xs text-[#737373] mt-1">
                      Enter your Application Reference Number (e.g. REF-2026-1001) and registered Mobile Number to view your current admission status.
                    </p>
                  </div>

                  <form onSubmit={handleCheckStatus} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-[#737373] mb-1">
                        Reference / Admission No *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. REF-2026-1001"
                        value={statusRef}
                        onChange={(e) => setStatusRef(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-xs font-mono-num focus:outline-none focus:ring-2 focus:ring-[#DC1726]/20 focus:border-[#DC1726]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#737373] mb-1">
                        Registered Mobile Number *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="10-digit Guardian/Student Mobile"
                        value={statusMobile}
                        onChange={(e) => setStatusMobile(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-xs font-mono-num focus:outline-none focus:ring-2 focus:ring-[#DC1726]/20 focus:border-[#DC1726]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={statusLoading}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg gold-gradient text-white text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-60 whitespace-nowrap"
                    >
                      <Search className="w-4 h-4" />
                      <span>{statusLoading ? 'Checking...' : 'Check Status'}</span>
                    </button>
                  </form>

                  {statusError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
                      {statusError}
                    </div>
                  )}
                </div>

                {statusResult && (
                  <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 sm:p-8 space-y-5">
                    <div
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        statusResult.status === 'approved'
                          ? 'bg-emerald-50 border-emerald-200'
                          : statusResult.status === 'rejected'
                            ? 'bg-red-50 border-red-200'
                            : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {statusResult.status === 'approved' ? (
                          <CheckCircle2 className="w-6 h-6 text-[#10B981] shrink-0 mt-0.5" />
                        ) : statusResult.status === 'rejected' ? (
                          <XCircle className="w-6 h-6 text-[#DC1726] shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="text-sm font-bold text-[#171717]">
                            {statusResult.status === 'approved'
                              ? 'Admission Approved (داخلہ منظور ہو گیا)'
                              : statusResult.status === 'rejected'
                                ? 'Application Not Approved (درخواست مسترد)'
                                : 'Pending Review (زیرِ غور)'}
                          </div>
                          <p className="text-xs text-[#525252] mt-0.5">
                            Reference No:{' '}
                            <span className="font-mono-num font-bold text-[#171717]">
                              {statusResult.reference_no}
                            </span>
                            {statusResult.official_admission_no && (
                              <>
                                {' '}
                                · Official Admission No:{' '}
                                <span className="font-mono-num font-bold text-[#10B981]">
                                  {statusResult.official_admission_no}
                                </span>
                              </>
                            )}
                            {statusResult.student_code && (
                              <>
                                {' '}
                                · Student ID:{' '}
                                <span className="font-mono-num font-bold text-[#171717]">
                                  {statusResult.student_code}
                                </span>
                              </>
                            )}
                          </p>
                          {statusResult.remarks && (
                            <p className="text-xs text-[#525252] mt-1">
                              <span className="font-semibold">Remarks:</span> {statusResult.remarks}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide self-start sm:self-center ${
                          statusResult.status === 'approved'
                            ? 'bg-emerald-600 text-white'
                            : statusResult.status === 'rejected'
                              ? 'bg-[#DC1726] text-white'
                              : 'bg-amber-500 text-white'
                        }`}
                      >
                        {statusResult.status}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 items-start border border-neutral-200 rounded-xl p-4 bg-neutral-50/60">
                      {statusResult.photo_url ? (
                        <img
                          src={statusResult.photo_url}
                          alt={statusResult.student_name}
                          className="w-20 h-24 rounded-lg object-cover border border-neutral-200 shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-24 rounded-lg bg-neutral-200/70 flex items-center justify-center text-[10px] text-[#737373] shrink-0">
                          No Photo
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5 text-xs flex-1 w-full">
                        <div>
                          <div className="text-[#737373]">Student Name</div>
                          <div className="font-semibold text-[#171717]">{statusResult.student_name}</div>
                        </div>
                        <div>
                          <div className="text-[#737373]">Father&apos;s Name</div>
                          <div className="font-semibold text-[#171717]">{statusResult.father_name}</div>
                        </div>
                        <div>
                          <div className="text-[#737373]">Class</div>
                          <div className="font-semibold text-[#171717]">{statusResult.class_name || 'To be assigned'}</div>
                        </div>
                        <div>
                          <div className="text-[#737373]">Guardian Mobile</div>
                          <div className="font-semibold font-mono-num text-[#171717]">{statusResult.guardian_mobile}</div>
                        </div>
                        <div>
                          <div className="text-[#737373]">Application Date</div>
                          <div className="font-semibold font-mono-num text-[#171717]">{statusResult.admission_date || '-'}</div>
                        </div>
                        <div>
                          <div className="text-[#737373]">District / State</div>
                          <div className="font-semibold text-[#171717]">
                            {statusResult.district || 'Palamu'}, {statusResult.state || 'Jharkhand'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => openPrintWithMode('admission')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 whitespace-nowrap"
                      >
                        <Printer className="w-4 h-4" /> Print Admission Paper
                      </button>
                      <button
                        type="button"
                        onClick={() => openPrintWithMode('iqrar')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#141E30] text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Printer className="w-4 h-4" /> Print Iqrar Nama
                      </button>
                      <button
                        type="button"
                        onClick={() => openPrintWithMode('combined')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
                      >
                        <Printer className="w-4 h-4" /> Print Both (PDF)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : activeSection === 'iqrar' ? (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 sm:p-8 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                  <div>
                    <h1 className="text-lg font-bold text-[#171717]">
                      Guardian Iqrar Nama Section (اقرار نامہ سرپرست برائے داخلہ)
                    </h1>
                    <p className="text-xs text-[#737373] mt-0.5">
                      Automatically updates from your Admission Form details. Print or save as PDF separately or together with the Admission Form.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openPrintWithMode('iqrar')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
                    >
                      <Printer className="w-4 h-4" /> Print / Save Iqrar Nama
                    </button>
                  </div>
                </div>

                <IqrarNamaSheet settings={settings} data={liveRecord} />
              </div>
            ) : submitted ? (
              <div className="space-y-5">
                {/* Submitted Confirmation + Print Actions for Filled Admission Paper & Iqrar Nama */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8 text-center space-y-5">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 text-[#10B981] flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-[#171717]">
                      Admission Application Submitted Successfully
                    </h1>
                    <p className="text-xs text-[#737373] mt-1">
                      Reference No:{' '}
                      <span className="font-mono-num font-bold text-[#DC1726]">
                        {submitted.reference_no || submitted.admission_no}
                      </span>{' '}
                      · Save this reference number. Official Admission No is assigned upon approval. You can print your Admission Form Paper and Iqrar Nama below.
                    </p>
                  </div>

                  {/* Separate & Combined Print Options after filling the admission form */}
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openPrintWithMode('admission')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 whitespace-nowrap"
                    >
                      <Printer className="w-4 h-4" /> Print Filled Admission Paper
                    </button>
                    <button
                      type="button"
                      onClick={() => openPrintWithMode('iqrar')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#141E30] text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Printer className="w-4 h-4" /> Print Iqrar Nama (اقرار نامہ)
                    </button>
                    <button
                      type="button"
                      onClick={() => openPrintWithMode('combined')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
                    >
                      <Printer className="w-4 h-4" /> Print Both (Admission + Iqrar Nama)
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1 border-t border-neutral-100">
                    <button
                      type="button"
                      onClick={resetForAnother}
                      className="px-4 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 whitespace-nowrap"
                    >
                      Submit Another Application
                    </button>
                    <button
                      type="button"
                      onClick={onBackHome}
                      className="px-4 py-2 rounded-lg bg-neutral-100 text-[#171717] text-xs font-medium hover:bg-neutral-200 whitespace-nowrap"
                    >
                      Return to Home
                    </button>
                  </div>
                </div>

                {/* Submitted Papers On-Screen Preview */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 sm:p-8 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSubmittedPreviewTab('admission')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                          submittedPreviewTab === 'admission'
                            ? 'bg-[#DC1726] text-white'
                            : 'bg-neutral-100 text-[#525252] hover:bg-neutral-200'
                        }`}
                      >
                        Filled Admission Paper
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubmittedPreviewTab('iqrar')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                          submittedPreviewTab === 'iqrar'
                            ? 'bg-[#141E30] text-white'
                            : 'bg-neutral-100 text-[#525252] hover:bg-neutral-200'
                        }`}
                      >
                        Iqrar Nama Paper (اقرار نامہ)
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openPrintWithMode(submittedPreviewTab === 'admission' ? 'admission' : 'iqrar')
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print This Paper
                    </button>
                  </div>

                  {submittedPreviewTab === 'admission' ? (
                    <AdmissionPaperSheet settings={settings} data={submitted} />
                  ) : (
                    <IqrarNamaSheet settings={settings} data={submitted} />
                  )}
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-4">
                  <div>
                    <h1 className="text-xl font-bold text-[#171717]">Online Admission Application Form</h1>
                    <p className="text-xs text-[#737373] mt-1">
                      Apply for admission at {settings?.name || 'Madrasa Ghausia Razvia'}, Islamnagar, Ramgarh, Palamu, Jharkhand.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSection('iqrar')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-semibold text-[#141E30] hover:bg-neutral-100 whitespace-nowrap self-start sm:self-center"
                  >
                    <ScrollText className="w-3.5 h-3.5" /> Open Iqrar Nama Section
                  </button>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-medium mb-1">Student Full Name *</label>
                    <input
                      type="text"
                      required
                      value={form.student_name}
                      onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Father&apos;s Name *</label>
                    <input
                      type="text"
                      required
                      value={form.father_name}
                      onChange={(e) => setForm({ ...form, father_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Mother&apos;s Name</label>
                    <input
                      type="text"
                      value={form.mother_name}
                      onChange={(e) => setForm({ ...form, mother_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={form.dob}
                      onChange={(e) => setForm({ ...form, dob: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Gender</label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Class Applying For</label>
                    <select
                      value={form.admission_class_id}
                      onChange={(e) => setForm({ ...form, admission_class_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                    >
                      <option value="">Select Class</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Guardian Name</label>
                    <input
                      type="text"
                      placeholder="Defaults to Father's Name"
                      value={form.guardian_name}
                      onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Guardian Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={form.guardian_mobile}
                      onChange={(e) => setForm({ ...form, guardian_mobile: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Previous School / Madrasa</label>
                    <input
                      type="text"
                      value={form.previous_school}
                      onChange={(e) => setForm({ ...form, previous_school: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Student Photograph</label>
                    <div className="flex items-center gap-3">
                      {form.photo_url && (
                        <img
                          src={form.photo_url}
                          alt="Applicant"
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-neutral-200"
                        />
                      )}
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100">
                        <FileUp className="w-3.5 h-3.5" />
                        <span>{uploading ? 'Uploading...' : 'Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handlePhotoUpload(f);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium mb-1">Complete Address</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Village / Mohalla</label>
                    <input
                      type="text"
                      value={form.village}
                      onChange={(e) => setForm({ ...form, village: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium mb-1">District</label>
                      <input
                        type="text"
                        value={form.district}
                        onChange={(e) => setForm({ ...form, district: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">PIN Code</label>
                      <input
                        type="text"
                        value={form.pin_code}
                        onChange={(e) => setForm({ ...form, pin_code: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium mb-1">Additional Remarks</label>
                    <textarea
                      rows={2}
                      value={form.remarks}
                      onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onBackHome}
                    className="px-4 py-2 rounded-lg bg-neutral-100 text-xs font-medium text-[#171717] hover:bg-neutral-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 rounded-lg gold-gradient text-white text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-60"
                  >
                    {submitting ? 'Submitting...' : 'Submit Admission Application'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
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
      </footer>

      <PrintModal
        open={printOpen}
        standalone
        title={
          printMode === 'admission'
            ? 'Online Admission Application Paper'
            : printMode === 'iqrar'
              ? 'Iqrar Nama (اقرار نامہ سرپرست برائے داخلہ)'
              : printMode === 'blank_iqrar'
                ? 'Blank Iqrar Nama (اقرار نامہ سرپرست برائے داخلہ)'
                : 'Online Admission Application Paper & Iqrar Nama'
        }
        subtitle={
          printMode === 'blank_iqrar'
            ? 'Blank Form'
            : liveRecord.reference_no || liveRecord.admission_no || liveRecord.student_name
        }
        settings={settings}
        onClose={() => setPrintOpen(false)}
        headerActions={
          submitted || (activeSection === 'status' && statusResult) ? (
            <div className="flex items-center gap-1 p-1 bg-neutral-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setPrintMode('admission')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  printMode === 'admission' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#525252]'
                }`}
              >
                Admission Paper
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('iqrar')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  printMode === 'iqrar' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#525252]'
                }`}
              >
                Iqrar Nama
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('combined')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  printMode === 'combined' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#525252]'
                }`}
              >
                Both
              </button>
            </div>
          ) : undefined
        }
        extraPages={
          printMode === 'combined' ? (
            <IqrarNamaSheet settings={settings} data={liveRecord} />
          ) : undefined
        }
      >
        {printMode === 'blank_iqrar' ? (
          <IqrarNamaSheet settings={settings} data={{}} />
        ) : printMode === 'iqrar' ? (
          <IqrarNamaSheet settings={settings} data={liveRecord} />
        ) : (
          <AdmissionPaperSheet settings={settings} data={liveRecord} />
        )}
      </PrintModal>
    </div>
  );
};
