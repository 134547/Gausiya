import React, { useState } from 'react';
import { ArrowLeft, Award, Lock, LogIn, Printer, Search } from 'lucide-react';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from '../components/MadrasaLogo.tsx';
import { PrintModal } from '../components/PrintModal.tsx';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<{
    student: any;
    results: any[];
    attendanceSummary: any;
  } | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/public/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load result');
      setReport(data);
    } catch (e: any) {
      setError(e.message || 'Unable to verify credentials');
    } finally {
      setLoading(false);
    }
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

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8">
        {!resultsOpen ? (
          <div className="max-w-lg mx-auto mt-6 bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-10 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-red-50 text-[#DC1726] flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#171717]">Online Results Currently Unavailable</h1>
              <p className="text-xs sm:text-sm text-[#737373] mt-2 leading-relaxed">
                Public online result checking is currently turned off by {settings?.name || 'Madrasa Ghausia Razvia'} administration.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
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
        ) : !report ? (
          <form
            onSubmit={handleCheck}
            className="max-w-md mx-auto mt-6 bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8 space-y-4"
          >
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-[#DC1726] flex items-center justify-center mx-auto mb-2">
                <Award className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-[#171717]">Check Examination Result</h1>
              <p className="text-xs text-[#737373]">
                Enter the student&apos;s portal username (or Student ID) and password.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1 text-xs">
              <label className="block font-medium text-[#171717]">Student Username / ID *</label>
              <input
                type="text"
                required
                autoComplete="off"
                placeholder="Enter student username or ID"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-[#DC1726]"
              />
            </div>

            <div className="space-y-1 text-xs">
              <label className="block font-medium text-[#171717]">Password *</label>
              <input
                type="password"
                required
                placeholder="Enter student password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-[#DC1726]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg gold-gradient text-white text-sm font-semibold shadow-sm hover:opacity-95 disabled:opacity-60"
            >
              <Search className="w-4 h-4" />
              <span>{loading ? 'Checking...' : 'View Result Card'}</span>
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setReport(null)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Check Another Student
              </button>
              <button
                type="button"
                onClick={() => setPrintOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
              >
                <Printer className="w-4 h-4" /> Print Official Result Card
              </button>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-[#737373]">Student Name</div>
                <div className="text-sm font-bold text-[#171717] mt-0.5">{report.student?.full_name}</div>
                <div className="font-mono-num text-[#DC1726] mt-0.5">{report.student?.student_code}</div>
              </div>
              <div>
                <div className="text-[#737373]">Class &amp; Guardian</div>
                <div className="font-semibold text-[#171717] mt-0.5">{report.student?.class_name}</div>
                <div className="text-[#737373] mt-0.5">S/O {report.student?.father_name}</div>
              </div>
              <div>
                <div className="text-[#737373]">Attendance Record</div>
                <div className="font-mono-num font-bold text-[#10B981] mt-0.5">
                  {report.attendanceSummary?.present || 0} Present / {report.attendanceSummary?.total || 0} Days
                </div>
                <div className="text-[#737373] font-mono-num mt-0.5">
                  Absent: {report.attendanceSummary?.absent || 0} · Leave: {report.attendanceSummary?.on_leave || 0}
                </div>
              </div>
            </div>

            {report.results.length === 0 ? (
              <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center text-xs text-[#737373]">
                No published examination results are available for this student yet.
              </div>
            ) : (
              report.results.map((r) => (
                <div key={r.id} className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
                  <div className="px-5 py-4 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-bold text-[#171717]">{r.exam_name}</h2>
                      <p className="text-[11px] text-[#737373] font-mono-num">
                        {r.exam_type} · {r.start_date}
                      </p>
                    </div>
                    <div className="text-xs font-mono-num flex items-center gap-3">
                      <span>Score: <strong>{r.obtained_marks}/{r.total_marks}</strong></span>
                      <span>Percentage: <strong>{Number(r.percentage).toFixed(1)}%</strong></span>
                      <span className="font-bold text-[#10B981]">Grade {r.grade} · Rank #{r.position}</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50/70 border-b border-neutral-200 text-[#737373]">
                        <tr>
                          <th className="px-4 py-2.5 text-start">Subject</th>
                          <th className="px-4 py-2.5 text-start">Obtained</th>
                          <th className="px-4 py-2.5 text-start">Total</th>
                          <th className="px-4 py-2.5 text-start">Passing</th>
                          <th className="px-4 py-2.5 text-start">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {(r.subject_marks || []).map((m: any) => (
                          <tr key={m.id}>
                            <td className="px-4 py-2.5 font-medium text-[#171717]">{m.subject_name}</td>
                            <td className="px-4 py-2.5 font-mono-num font-bold">{m.is_absent ? 'ABS' : m.obtained_marks}</td>
                            <td className="px-4 py-2.5 font-mono-num">{m.total_marks}</td>
                            <td className="px-4 py-2.5 font-mono-num">{m.passing_marks}</td>
                            <td className="px-4 py-2.5 text-[#737373]">{m.remarks || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {r.teacher_remarks && (
                    <div className="px-5 py-3 bg-neutral-50/50 border-t border-neutral-100 text-xs text-[#737373]">
                      <strong className="text-[#171717]">Remarks:</strong> {r.teacher_remarks}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-neutral-200 bg-white px-4 py-4 text-center text-xs text-[#737373] no-print">
        <span>Need help? Contact Us: </span>
        <a
          href="https://wa.me/917209629509"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#10B981] hover:underline font-mono-num"
        >
          WhatsApp 7209629509
        </a>
        <span> · </span>
        <a href="mailto:dil.dil.a.1345@gmail.com" className="font-semibold text-[#DC1726] hover:underline">
          dil.dil.a.1345@gmail.com
        </a>
      </footer>

      <PrintModal
        open={printOpen}
        title="Official Student Examination Report Card"
        subtitle={report?.student?.student_code}
        settings={settings}
        onClose={() => setPrintOpen(false)}
      >
        {report && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 border border-neutral-300 rounded">
              <div><strong>Student:</strong> {report.student?.full_name}</div>
              <div className="font-mono-num"><strong>Student ID:</strong> {report.student?.student_code}</div>
              <div><strong>Father&apos;s Name:</strong> {report.student?.father_name}</div>
              <div><strong>Class:</strong> {report.student?.class_name}</div>
            </div>
            {report.results.map((r) => (
              <div key={r.id} className="space-y-2">
                <div className="font-bold text-sm">{r.exam_name} — {r.obtained_marks}/{r.total_marks} ({Number(r.percentage).toFixed(1)}% · Grade {r.grade})</div>
                <table className="w-full border-collapse border border-neutral-300">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-neutral-300 px-3 py-1.5 text-start">Subject</th>
                      <th className="border border-neutral-300 px-3 py-1.5 text-start">Obtained</th>
                      <th className="border border-neutral-300 px-3 py-1.5 text-start">Total</th>
                      <th className="border border-neutral-300 px-3 py-1.5 text-start">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(r.subject_marks || []).map((m: any) => (
                      <tr key={m.id}>
                        <td className="border border-neutral-300 px-3 py-1.5">{m.subject_name}</td>
                        <td className="border border-neutral-300 px-3 py-1.5 font-mono-num font-bold">{m.is_absent ? 'ABS' : m.obtained_marks}</td>
                        <td className="border border-neutral-300 px-3 py-1.5 font-mono-num">{m.total_marks}</td>
                        <td className="border border-neutral-300 px-3 py-1.5">{m.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </PrintModal>
    </div>
  );
};
