import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Download,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Printer,
  Search,
} from 'lucide-react';
import { MadrasaSettings } from '../types.ts';
import { PrintModal } from './PrintModal.tsx';
import { ScaledA4Viewport } from './ScaledA4Viewport.tsx';
import { CaptchaChallengeData, SecurityCaptchaBox } from './SecurityCaptchaBox.tsx';
import { formatHttpErrorMessage, safeReadJson } from '../lib/imageUpload.ts';
import {
  ResultGradeCard,
  buildCardDataFromSavedResult,
  exportResultCardPdf,
  exportResultCardPng,
} from './ResultGradeCard.tsx';

interface StudentResultLookupWidgetProps {
  settings: MadrasaSettings | null;
  resultsOpen?: boolean;
  onBackHome?: () => void;
  onGoLogin?: () => void;
  compact?: boolean;
}

export const StudentResultLookupWidget: React.FC<StudentResultLookupWidgetProps> = ({
  settings,
  resultsOpen = true,
  onBackHome,
  onGoLogin,
  compact = false,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<{
    student: any;
    results: any[];
    attendanceSummary: any;
  } | null>(null);
  const [printResult, setPrintResult] = useState<any | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [captcha, setCaptcha] = useState<CaptchaChallengeData | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [refreshingCaptcha, setRefreshingCaptcha] = useState(false);

  const isLocked = Boolean(lockedUntil && lockedUntil > nowTick);
  const remainingLockSeconds =
    isLocked && lockedUntil ? Math.max(1, Math.ceil((lockedUntil - nowTick) / 1000)) : 0;

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!lockedUntil) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => {
      const current = Date.now();
      setNowTick(current);
      if (current >= lockedUntil) {
        setLockedUntil(null);
        setError('');
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const refreshCaptcha = async () => {
    setRefreshingCaptcha(true);
    try {
      const res = await fetch('/api/auth/captcha');
      if (res.ok) {
        const { data: next } = await safeReadJson<CaptchaChallengeData>(res);
        if (next) {
          setCaptcha(next);
          setCaptchaAnswer('');
        }
      }
    } catch {
      // ignore
    } finally {
      setRefreshingCaptcha(false);
    }
  };

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/public/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          captchaToken: captcha?.token,
          captchaAnswer: captcha ? captchaAnswer : undefined,
        }),
      });
      const { data, rawText } = await safeReadJson(res);
      if (!res.ok) {
        if (
          res.status === 429 ||
          data?.code === 'TOO_MANY_ATTEMPTS' ||
          data?.code === 'RATE_LIMITED'
        ) {
          const lockEnd =
            Number(data?.lockedUntil) ||
            Date.now() + (Number(data?.retryAfterSeconds) || 10) * 1000;
          setNowTick(Date.now());
          setLockedUntil(lockEnd);
          setCaptcha(null);
          setCaptchaAnswer('');
          setError(data?.error || 'Too many failed attempts. Please wait 10 seconds and try again.');
          return;
        }
        if (data?.captchaRequired) {
          if (data?.captcha) {
            setCaptcha(data.captcha);
            setCaptchaAnswer('');
          } else {
            await refreshCaptcha();
          }
        }
        throw new Error(formatHttpErrorMessage(res.status, data, rawText, 'Could not load result'));
      }
      setLockedUntil(null);
      setCaptcha(null);
      setCaptchaAnswer('');
      setReport(data);
    } catch (e: any) {
      setError(e.message || 'Unable to verify credentials');
    } finally {
      setLoading(false);
    }
  };

  const [downloadReady, setDownloadReady] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    return () => {
      if (downloadReady?.url) URL.revokeObjectURL(downloadReady.url);
    };
  }, [downloadReady]);

  const handleDownloadPdf = async (r: any) => {
    const key = `pdf-${r.id}`;
    const el = cardRefs.current[String(r.id)];
    if (!el || exportingKey) return;
    setExportingKey(key);
    setError('');
    try {
      const out = await exportResultCardPdf(
        el,
        `Result_Grade_Card_-_${report?.student?.full_name || 'Student'}_-_${r.exam_name || 'Examination'}`
      );
      setDownloadReady((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url: out.blobUrl, name: out.fileName };
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to download PDF');
    } finally {
      setExportingKey(null);
    }
  };

  const handleDownloadPng = async (r: any) => {
    const key = `png-${r.id}`;
    const el = cardRefs.current[String(r.id)];
    if (!el || exportingKey) return;
    setExportingKey(key);
    setError('');
    try {
      const out = await exportResultCardPng(
        el,
        `Result_Grade_Card_-_${report?.student?.full_name || 'Student'}_-_${r.exam_name || 'Examination'}`
      );
      setDownloadReady((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url: out.dataUrl, name: out.fileName };
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to download PNG');
    } finally {
      setExportingKey(null);
    }
  };

  if (!resultsOpen) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-10 text-center space-y-5">
        <div className="w-14 h-14 rounded-full bg-red-50 text-[#DC1726] flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#171717]">Online Results Currently Unavailable</h2>
          <p className="text-xs sm:text-sm text-[#737373] mt-2 leading-relaxed">
            Public online result checking is currently turned off by{' '}
            {settings?.name || 'Madrasa Gausiya Razvia'} administration.
          </p>
        </div>
        {(onBackHome || onGoLogin) && (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {onBackHome && (
              <button
                type="button"
                onClick={onBackHome}
                className="px-5 py-2.5 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 whitespace-nowrap"
              >
                Return to Home
              </button>
            )}
            {onGoLogin && (
              <button
                type="button"
                onClick={onGoLogin}
                className="px-5 py-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
              >
                Portal Login
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!report) {
    return (
      <form
        onSubmit={handleCheck}
        className={`mx-auto bg-white rounded-2xl border border-neutral-200 shadow-sm space-y-4 ${
          compact ? 'max-w-xl p-6 sm:p-8' : 'max-w-md mt-6 p-6 sm:p-8'
        }`}
      >
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-[#DC1726] flex items-center justify-center mx-auto mb-2">
            <Award className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#171717]">Check Examination Result</h2>
          <p className="text-xs text-[#737373]">
            Enter the student&apos;s portal username (or Student ID / Admission No) and password to view, print &amp; download your full official Grade Card.
          </p>
        </div>

        {isLocked && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] space-y-1">
            <div className="font-bold">Too many attempts. Please try again later.</div>
            <div className="font-mono-num text-[11px] text-red-700">
              Login temporarily locked. Try again in {formatCountdown(remainingLockSeconds)}
            </div>
          </div>
        )}

        {error && !isLocked && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <label className="block font-medium text-[#171717]">Student Username / Adm No *</label>
            <input
              type="text"
              required
              disabled={isLocked}
              autoComplete="off"
              placeholder="Username or Adm No"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-[#DC1726] disabled:bg-neutral-100"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-medium text-[#171717]">Password *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={isLocked}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pe-10 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-[#DC1726] disabled:bg-neutral-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#171717]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {!isLocked && captcha && (
          <SecurityCaptchaBox
            captcha={captcha}
            answer={captchaAnswer}
            onAnswerChange={setCaptchaAnswer}
            onRefresh={refreshCaptcha}
            refreshing={refreshingCaptcha}
          />
        )}

        <button
          type="submit"
          disabled={loading || isLocked || !username.trim() || !password}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg gold-gradient text-white text-sm font-semibold shadow-sm hover:opacity-95 disabled:opacity-60 cursor-pointer"
        >
          <Search className="w-4 h-4" />
          <span>{loading ? 'Checking Result...' : 'View Full Result Card'}</span>
        </button>
      </form>
    );
  }

  const printCardData = printResult ? buildCardDataFromSavedResult(printResult, settings) : null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
          {error}
        </div>
      )}

      {downloadReady && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex flex-wrap items-center justify-between gap-2">
          <span>Result card file ready: {downloadReady.name}</span>
          <a
            href={downloadReady.url}
            download={downloadReady.name}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700 text-white font-semibold hover:bg-emerald-800 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" /> Save File Again
          </a>
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 px-4 py-3 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <button
          type="button"
          onClick={() => {
            setReport(null);
            setError('');
            setPassword('');
            setDownloadReady(null);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Check Another Student
        </button>
        <div className="text-[#525252]">
          <strong className="text-[#171717]">{report.student?.full_name}</strong> ·{' '}
          <span className="font-mono-num">{report.student?.admission_no || report.student?.student_code}</span> ·{' '}
          <span>{report.student?.class_name}</span> ·{' '}
          <span className="font-mono-num text-[#10B981] font-semibold">
            Attendance: {report.attendanceSummary?.present || 0}/{report.attendanceSummary?.total || 0}
          </span>
        </div>
      </div>

      {report.results.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center text-xs text-[#737373]">
          No uploaded / published examination results are available for this student yet.
        </div>
      ) : (
        <div className="space-y-6">
          {report.results.map((r) => {
            const cardData = buildCardDataFromSavedResult(r, settings);
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#171717]">
                      Result Grade Card — {report.student?.full_name} ({r.exam_name})
                    </h3>
                    <p className="text-[11px] text-[#737373] font-mono-num">
                      Score: {r.obtained_marks}/{r.total_marks} · {Number(r.percentage).toFixed(2)}% · Grade {r.grade} · Rank #{r.position}
                      {r.total_students ? ` / ${r.total_students}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={exportingKey !== null}
                      onClick={() => handleDownloadPdf(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{exportingKey === `pdf-${r.id}` ? 'Saving PDF...' : 'Download PDF'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={exportingKey !== null}
                      onClick={() => handleDownloadPng(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ea580c] text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-60 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{exportingKey === `png-${r.id}` ? 'Saving PNG...' : 'Download PNG'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintResult(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                  </div>
                </div>

                <div className="p-2.5 sm:p-5 bg-neutral-100/80">
                  <ScaledA4Viewport>
                    <ResultGradeCard
                      data={cardData}
                      cardRef={(el) => {
                        cardRefs.current[String(r.id)] = el;
                      }}
                    />
                  </ScaledA4Viewport>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PrintModal
        open={Boolean(printResult)}
        standalone={true}
        title="Result Grade Card"
        subtitle={`${report.student?.full_name || ''} — ${printResult?.exam_name || ''}`}
        settings={settings}
        onClose={() => setPrintResult(null)}
        headerActions={
          printResult && (
            <>
              <button
                type="button"
                disabled={exportingKey !== null}
                onClick={() => handleDownloadPng(printResult)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#ea580c] text-white text-sm font-medium hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>
            </>
          )
        }
      >
        {printCardData && <ResultGradeCard data={printCardData} />}
      </PrintModal>
    </div>
  );
};
