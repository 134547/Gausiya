import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  Bell,
  BookMarked,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  GraduationCap,
  KeyRound,
  Monitor,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { PrintModal } from '../components/PrintModal.tsx';
import {
  ResultGradeCard,
  buildCardDataFromSavedResult,
  exportResultCardPdf,
  exportResultCardPng,
} from '../components/ResultGradeCard.tsx';

interface MyChildPageProps {
  user: User;
  settings: MadrasaSettings | null;
  initialStudentId?: string | null;
  onInitialStudentHandled?: () => void;
}

type ChildTab = 'overview' | 'homework' | 'attendance' | 'results' | 'syllabus' | 'classes';

const RELATIONSHIPS = ['Father', 'Mother', 'Guardian', 'Brother', 'Uncle', 'Grandparent', 'Other'];

export const MyChildPage: React.FC<MyChildPageProps> = ({
  user,
  settings,
  initialStudentId,
  onInitialStudentHandled,
}) => {
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [selectedChildId, setSelectedChildId] = useState<string>('');

  const [overview, setOverview] = useState<any>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [activeTab, setActiveTab] = useState<ChildTab>('overview');
  const [attFilter, setAttFilter] = useState<'all' | 'present' | 'absent' | 'late' | 'leave'>('all');

  // Connect child + OTP flow state
  const [showConnectBox, setShowConnectBox] = useState(false);
  const [studentCodeInput, setStudentCodeInput] = useState('');
  const [relationshipInput, setRelationshipInput] = useState('Father');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Homework submission state (parent submitting on child's behalf)
  const [submitTarget, setSubmitTarget] = useState<any>(null);
  const [subForm, setSubForm] = useState({ submission_text: '', attachment_url: '', attachment_name: '' });
  const [uploadingHwFile, setUploadingHwFile] = useState(false);
  const [submittingHw, setSubmittingHw] = useState(false);

  // Official Grade Card modal state
  const [viewResult, setViewResult] = useState<any>(null);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const viewCardRef = useRef<HTMLDivElement>(null);

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadChildren = useCallback(async (preferStudentId?: string) => {
    setLoadingChildren(true);
    try {
      const res = await apiRequest<{ parent: any; children: any[]; pendingRequests: any[] }>('/api/parent/children');
      const list = res.children || [];
      const pending = res.pendingRequests || [];
      setChildrenList(list);
      setPendingRequests(pending);
      if (list.length === 0) {
        setShowConnectBox(true);
      }
      setSelectedChildId((prev) => {
        if (preferStudentId && list.some((c) => c.id === preferStudentId)) return preferStudentId;
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch (e: any) {
      setErr(e?.message || 'Failed to load connected children');
    } finally {
      setLoadingChildren(false);
    }
  }, []);

  const loadChildOverview = useCallback(async (studentId: string) => {
    if (!studentId) {
      setOverview(null);
      return;
    }
    setLoadingOverview(true);
    try {
      const res = await apiRequest(`/api/parent/children/${studentId}/overview`);
      setOverview(res);
    } catch (e: any) {
      setOverview(null);
      setErr(e?.message || 'Failed to load child details');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    loadChildren(initialStudentId || undefined).then(() => {
      if (initialStudentId && onInitialStudentHandled) {
        onInitialStudentHandled();
      }
    });
  }, [loadChildren, initialStudentId, onInitialStudentHandled]);

  useEffect(() => {
    if (selectedChildId) {
      loadChildOverview(selectedChildId);
    } else {
      setOverview(null);
    }
  }, [selectedChildId, loadChildOverview]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sendingOtp) return;
    setErr('');
    setMsg('');
    const code = studentCodeInput.trim();
    if (!code) {
      setErr('Please enter your child’s Student ID (e.g. MGR-2026-001).');
      return;
    }
    setSendingOtp(true);
    try {
      const res = await apiRequest<{
        requestId: string;
        student: { id: string; full_name: string; student_code: string; class_name: string };
        message: string;
      }>('/api/parent/link-request', {
        method: 'POST',
        body: JSON.stringify({
          student_code: code,
          relationship: relationshipInput,
        }),
      });
      setStudentCodeInput('');
      setMsg(res.message || 'Verification OTP sent to student notification & dashboard.');
      await loadChildren();
    } catch (e: any) {
      setErr(e?.message || 'Could not send OTP to that Student ID');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleResendOtp = async (reqItem: any) => {
    if (sendingOtp) return;
    setErr('');
    setMsg('');
    setSendingOtp(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/parent/link-request', {
        method: 'POST',
        body: JSON.stringify({
          student_code: reqItem.student_code,
          relationship: reqItem.relationship || relationshipInput,
        }),
      });
      setMsg(res.message || `Fresh OTP sent to ${reqItem.student_name}'s notification.`);
      await loadChildren();
    } catch (e: any) {
      setErr(e?.message || 'Failed to resend OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (reqItem: any) => {
    if (verifyingId) return;
    const otp = (otpInputs[reqItem.id] || '').trim();
    if (!/^\d{6}$/.test(otp)) {
      setErr('Please enter the 6-digit OTP code from the student profile notification.');
      return;
    }
    setErr('');
    setMsg('');
    setVerifyingId(reqItem.id);
    try {
      const res = await apiRequest<{
        success: boolean;
        student_id: string;
        student_name: string;
        student_code: string;
      }>('/api/parent/link-verify', {
        method: 'POST',
        body: JSON.stringify({
          requestId: reqItem.id,
          student_code: reqItem.student_code,
          otp,
          relationship: reqItem.relationship,
        }),
      });
      setOtpInputs((prev) => {
        const next = { ...prev };
        delete next[reqItem.id];
        return next;
      });
      setMsg(`${res.student_name} (${res.student_code}) connected successfully to My Child!`);
      setShowConnectBox(false);
      await loadChildren(res.student_id);
      window.dispatchEvent(new Event('madrasa:notifications-updated'));
    } catch (e: any) {
      setErr(e?.message || 'OTP verification failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleCancelRequest = async (reqId: string) => {
    if (cancellingId) return;
    setCancellingId(reqId);
    setErr('');
    try {
      await apiRequest(`/api/parent/link-request/${reqId}`, { method: 'DELETE' });
      await loadChildren();
    } catch (e: any) {
      setErr(e?.message || 'Failed to cancel OTP request');
    } finally {
      setCancellingId(null);
    }
  };

  const handleSubmitHw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitTarget || !selectedChildId || submittingHw) return;
    setSubmittingHw(true);
    setErr('');
    try {
      await apiRequest(`/api/homework/${submitTarget.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: selectedChildId,
          submission_text: subForm.submission_text,
          attachment_url: subForm.attachment_url,
          attachment_name: subForm.attachment_name,
        }),
      });
      setSubmitTarget(null);
      setSubForm({ submission_text: '', attachment_url: '', attachment_name: '' });
      setMsg('Homework submitted for your child.');
      await loadChildOverview(selectedChildId);
    } catch (e: any) {
      setErr(e?.message || 'Failed to submit homework');
    } finally {
      setSubmittingHw(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!viewCardRef.current || !viewResult || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await exportResultCardPdf(
        viewCardRef.current,
        `Result_Grade_Card_-_${viewResult.student_name || 'Student'}_-_${viewResult.exam_name || 'Examination'}`
      );
    } catch (e: any) {
      setErr(e?.message || 'Failed to download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadPng = async () => {
    if (!viewCardRef.current || !viewResult || downloadingPng) return;
    setDownloadingPng(true);
    try {
      await exportResultCardPng(
        viewCardRef.current,
        `Result_Grade_Card_-_${viewResult.student_name || 'Student'}_-_${viewResult.exam_name || 'Examination'}`
      );
    } catch (e: any) {
      setErr(e?.message || 'Failed to download PNG');
    } finally {
      setDownloadingPng(false);
    }
  };

  const selectedChild = childrenList.find((c) => c.id === selectedChildId) || null;
  const st = overview?.student || selectedChild || null;
  const att = overview?.attendanceSummary || { total: 0, present: 0, absent: 0, late: 0, on_leave: 0, percentage: 0 };
  const homeworkList = overview?.homework || [];
  const attendanceList = (overview?.attendance || []).filter((a: any) => attFilter === 'all' || a.status === attFilter);
  const resultsList = overview?.results || [];
  const examsList = overview?.examinations || [];
  const subjectsList = overview?.subjects || [];
  const syllabusList = overview?.syllabusItems || [];
  const onlineClassesList = overview?.onlineClasses || [];
  const noticesList = overview?.notices || [];

  const viewCardData = viewResult ? buildCardDataFromSavedResult(viewResult, settings) : null;

  return (
    <div className="space-y-5">
      {/* Top Action Header */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#171717] flex items-center gap-2">
            <UsersRound className="w-4 h-4 text-[#DC1726]" />
            <span>My Child Portal ({childrenList.length} Connected)</span>
          </h2>
          <p className="text-xs text-[#737373] mt-0.5">
            Connect one or multiple children using their Student ID + OTP from their student notification, then switch children anytime.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadChildren(selectedChildId)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowConnectBox((p) => !p)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showConnectBox ? 'Hide Connect Child' : 'Connect Child (Student ID + OTP)'}</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium flex items-center justify-between gap-2">
          <span>{err}</span>
          <button type="button" onClick={() => setErr('')} className="text-[#DC1726] hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Connect Child via Student ID + OTP Panel */}
      {(showConnectBox || pendingRequests.length > 0) && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#171717] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                <span>Connect Your Child via Student ID &amp; OTP Verification</span>
              </h3>
              <p className="text-xs text-[#737373] mt-0.5">
                Step 1: Enter your child&apos;s Student ID · Step 2: Check your child&apos;s Student Profile Notification/Dashboard for the 6-digit OTP · Step 3: Verify OTP below.
              </p>
            </div>
            {childrenList.length > 0 && showConnectBox && (
              <button
                type="button"
                onClick={() => setShowConnectBox(false)}
                className="p-1.5 rounded-lg text-[#737373] hover:bg-neutral-100"
                aria-label="Close connect box"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {showConnectBox && (
            <form onSubmit={handleRequestOtp} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">
                  Child&apos;s Student ID or Admission No *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MGR-2026-001 or ADM-2026-001"
                  value={studentCodeInput}
                  onChange={(e) => setStudentCodeInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 font-mono-num focus:outline-none focus:border-[#DC1726]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Your Relationship</label>
                <select
                  value={relationshipInput}
                  onChange={(e) => setRelationshipInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:border-[#DC1726]"
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={sendingOtp}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingOtp ? 'Sending OTP...' : 'Send OTP to Student'}</span>
              </button>
            </form>
          )}

          {/* Active Pending OTP Verifications */}
          {pendingRequests.length > 0 && (
            <div className="pt-3 border-t border-neutral-100 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Pending OTP Verification ({pendingRequests.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingRequests.map((reqItem) => (
                  <div
                    key={reqItem.id}
                    className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[#171717]">{reqItem.student_name}</div>
                        <div className="text-xs text-[#737373] font-mono-num">
                          {reqItem.student_code} · {reqItem.class_name || 'Unassigned'} · {reqItem.relationship}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={cancellingId === reqItem.id}
                        onClick={() => handleCancelRequest(reqItem.id)}
                        className="p-1 rounded text-neutral-500 hover:text-[#DC1726] hover:bg-white"
                        title="Cancel Request"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-900">
                      6-digit OTP has been sent to <strong>{reqItem.student_name}</strong>&apos;s Student Notification Bell &amp; Dashboard. Enter it below:
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Enter 6-digit OTP"
                        value={otpInputs[reqItem.id] || ''}
                        onChange={(e) =>
                          setOtpInputs((prev) => ({
                            ...prev,
                            [reqItem.id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                          }))
                        }
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-amber-300 bg-white font-mono-num tracking-widest font-bold text-center focus:outline-none focus:border-[#10B981]"
                      />
                      <button
                        type="button"
                        disabled={verifyingId === reqItem.id}
                        onClick={() => handleVerifyOtp(reqItem)}
                        className="px-3.5 py-2 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
                      >
                        {verifyingId === reqItem.id ? 'Verifying...' : 'Verify OTP'}
                      </button>
                      <button
                        type="button"
                        disabled={sendingOtp}
                        onClick={() => handleResendOtp(reqItem)}
                        className="px-2.5 py-2 rounded-lg border border-amber-300 bg-white text-[11px] font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                      >
                        Resend
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Child Switcher Strip (Supports 1, 2, 3+ children seamlessly) */}
      {loadingChildren ? (
        <div className="h-24 rounded-xl bg-white border border-neutral-200 animate-pulse" />
      ) : childrenList.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center space-y-2">
          <UsersRound className="w-10 h-10 text-neutral-300 mx-auto" />
          <div className="text-sm font-bold text-[#171717]">No Children Connected Yet</div>
          <p className="text-xs text-[#737373] max-w-md mx-auto">
            Enter your child&apos;s Student ID above (you can add 1, 2, 3, or more children) and verify the 6-digit OTP sent to their student notification to view their Homework, Attendance, and Results.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#737373]">
                Select Child to View Full Progress ({childrenList.length})
              </div>
              <div className="text-[11px] text-[#737373]">Logged in as {user.full_name}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {childrenList.map((child) => {
                const isSelected = child.id === selectedChildId;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedChildId(child.id)}
                    className={`text-start p-3.5 rounded-xl border transition-all flex items-center gap-3 ${
                      isSelected
                        ? 'border-[#DC1726] bg-red-50/50 ring-2 ring-[#DC1726]/20 shadow-xs'
                        : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    {child.photo_url ? (
                      <img
                        src={child.photo_url}
                        alt={child.full_name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-full object-cover border border-neutral-200 shrink-0"
                      />
                    ) : (
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base shrink-0 ${
                          isSelected ? 'bg-[#DC1726] text-white' : 'bg-[#450A0A] text-white'
                        }`}
                      >
                        {(child.full_name || 'S').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#171717] truncate">{child.full_name}</span>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded bg-[#DC1726] text-white text-[10px] font-bold uppercase shrink-0">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#525252] truncate mt-0.5">
                        {child.class_name || 'Unassigned'} · {child.relationship || 'Child'}
                      </div>
                      <div className="text-[11px] font-mono-num text-[#737373] truncate">
                        ID: {child.student_code}
                        {child.admission_no ? ` · Adm: ${child.admission_no}` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Child Full Workspace */}
          {loadingOverview ? (
            <div className="h-64 rounded-xl bg-white border border-neutral-200 animate-pulse" />
          ) : st ? (
            <div className="space-y-5">
              {/* Selected Child Summary Banner */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {st.photo_url ? (
                      <img
                        src={st.photo_url}
                        alt={st.full_name}
                        referrerPolicy="no-referrer"
                        className="w-16 h-20 rounded-xl object-cover border border-neutral-200 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-20 rounded-xl bg-[#3B0A0D] text-white flex items-center justify-center font-bold text-2xl shrink-0">
                        {(st.full_name || 'S').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-[#171717]">{st.full_name}</h3>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-[#10B981] uppercase">
                          {st.status || 'active'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[11px] font-mono-num font-semibold text-[#525252]">
                          {st.student_code}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-1 text-xs text-[#525252]">
                        <div>
                          <span className="text-[#737373]">Class:</span>{' '}
                          <strong className="text-[#171717]">{st.class_name || 'Unassigned'}</strong>
                        </div>
                        <div>
                          <span className="text-[#737373]">Class Teacher:</span>{' '}
                          <strong className="text-[#171717]">
                            {st.class_teacher_name || 'Unassigned'}
                            {st.class_teacher_mobile ? ` (${st.class_teacher_mobile})` : ''}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#737373]">Admission No:</span>{' '}
                          <strong className="font-mono-num text-[#171717]">{st.admission_no || st.student_code}</strong>
                        </div>
                        <div>
                          <span className="text-[#737373]">Father:</span>{' '}
                          <strong className="text-[#171717]">{st.father_name || '—'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Child KPIs */}
                  <div className="grid grid-cols-3 gap-2 shrink-0">
                    <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                      <div className="text-base font-bold font-mono-num text-[#10B981]">{att.percentage}%</div>
                      <div className="text-[10px] font-semibold uppercase text-emerald-800">Attendance</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-center">
                      <div className="text-base font-bold font-mono-num text-[#F59E0B]">
                        {homeworkList.filter((h: any) => h.submission_status === 'pending').length}
                      </div>
                      <div className="text-[10px] font-semibold uppercase text-amber-800">HW Pending</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-center">
                      <div className="text-base font-bold font-mono-num text-[#DC1726]">{resultsList.length}</div>
                      <div className="text-[10px] font-semibold uppercase text-red-900">Results</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-neutral-200/70 rounded-xl">
                {(
                  [
                    { id: 'overview', label: 'Overview & Profile', icon: UserCheck },
                    { id: 'homework', label: `Homework (${homeworkList.length})`, icon: BookMarked },
                    { id: 'attendance', label: `Attendance (${att.total})`, icon: ClipboardCheck },
                    { id: 'results', label: `Results (${resultsList.length})`, icon: Award },
                    { id: 'syllabus', label: `Syllabus & Kitab (${syllabusList.length})`, icon: BookOpen },
                    { id: 'classes', label: 'Online Classes & Notices', icon: Monitor },
                  ] as const
                ).map((tabItem) => {
                  const Icon = tabItem.icon;
                  const active = activeTab === tabItem.id;
                  return (
                    <button
                      key={tabItem.id}
                      type="button"
                      onClick={() => setActiveTab(tabItem.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        active ? 'bg-white text-[#DC1726] shadow-xs' : 'text-[#525252] hover:text-[#171717]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tabItem.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: OVERVIEW & PROFILE */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
                    <h4 className="text-sm font-bold text-[#171717] flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-[#DC1726]" /> Student Details
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#737373] block">Full Name</span>
                        <span className="font-semibold text-[#171717]">{st.full_name}</span>
                      </div>
                      <div>
                        <span className="text-[#737373] block">Student ID</span>
                        <span className="font-mono-num font-semibold text-[#171717]">{st.student_code}</span>
                      </div>
                      <div>
                        <span className="text-[#737373] block">Admission No</span>
                        <span className="font-mono-num font-semibold text-[#171717]">{st.admission_no || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[#737373] block">Roll Number</span>
                        <span className="font-mono-num font-semibold text-[#171717]">{st.roll_number || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[#737373] block">Father&apos;s Name</span>
                        <span className="font-semibold text-[#171717]">{st.father_name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[#737373] block">Mother&apos;s Name</span>
                        <span className="font-semibold text-[#171717]">{st.mother_name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[#737373] block">Date of Birth / Gender</span>
                        <span className="font-semibold text-[#171717]">
                          {st.dob || '—'} · {st.gender || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#737373] block">Contact / Village</span>
                        <span className="font-semibold text-[#171717]">
                          {st.mobile || '—'} {st.village ? `· ${st.village}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
                    <h4 className="text-sm font-bold text-[#171717] flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#0EA5E9]" /> Class Subjects &amp; Exam Schedule
                    </h4>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-[#737373] mb-2">
                        Subjects ({subjectsList.length})
                      </div>
                      {subjectsList.length === 0 ? (
                        <p className="text-xs text-[#737373]">No subjects assigned to this class yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {subjectsList.map((s: any) => (
                            <span
                              key={s.id}
                              className="px-2.5 py-1 rounded-lg bg-neutral-50 border border-neutral-200 text-xs"
                            >
                              <strong>{s.name}</strong>
                              {s.teacher_name ? ` · ${s.teacher_name}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="pt-3 border-t border-neutral-100">
                      <div className="text-[11px] font-semibold uppercase text-[#737373] mb-2">
                        Examinations ({examsList.length})
                      </div>
                      {examsList.length === 0 ? (
                        <p className="text-xs text-[#737373]">No examinations scheduled for this class.</p>
                      ) : (
                        <div className="space-y-2">
                          {examsList.slice(0, 4).map((ex: any) => (
                            <div
                              key={ex.id}
                              className="flex items-center justify-between text-xs p-2 rounded-lg bg-neutral-50 border border-neutral-100"
                            >
                              <div>
                                <div className="font-semibold text-[#171717]">{ex.name}</div>
                                <div className="text-[11px] text-[#737373]">{ex.exam_type || 'Examination'}</div>
                              </div>
                              <div className="text-end">
                                <div className="font-mono-num font-semibold text-[#DC1726]">{ex.start_date}</div>
                                <div className="text-[10px] uppercase text-[#737373]">{ex.status}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: HOMEWORK */}
              {activeTab === 'homework' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {homeworkList.length === 0 ? (
                    <div className="col-span-full bg-white rounded-xl border border-neutral-200 p-8 text-center text-xs text-[#737373]">
                      No homework assigned to {st.full_name}&apos;s class yet.
                    </div>
                  ) : (
                    homeworkList.map((hw: any) => {
                      const statusCls =
                        hw.submission_status === 'reviewed'
                          ? 'bg-emerald-50 border-emerald-200 text-[#10B981]'
                          : hw.submission_status === 'submitted'
                            ? 'bg-sky-50 border-sky-200 text-[#0EA5E9]'
                            : 'bg-amber-50 border-amber-200 text-[#F59E0B]';
                      return (
                        <div key={hw.id} className="bg-white rounded-xl border border-neutral-200 p-4 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-[#171717]">{hw.title}</h4>
                              <p className="text-xs text-[#737373]">
                                {hw.subject_name}
                                {hw.teacher_name ? ` · ${hw.teacher_name}` : ''}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${statusCls}`}>
                              {hw.submission_status}
                              {hw.grade ? ` · ${hw.grade}` : ''}
                            </span>
                          </div>
                          {hw.description && <p className="text-xs text-[#525252]">{hw.description}</p>}
                          {hw.attachment_url && (
                            <a
                              href={hw.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#0EA5E9] hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> View Homework Attachment
                            </a>
                          )}
                          {hw.feedback && (
                            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                              <strong>Teacher Feedback:</strong> {hw.feedback}
                            </div>
                          )}
                          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
                            <span className="text-[#737373] font-mono-num">
                              <Clock className="w-3 h-3 inline me-1" />
                              Due: {hw.submission_deadline}
                            </span>
                            {hw.allow_submission !== false && hw.submission_status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSubmitTarget(hw);
                                  setSubForm({ submission_text: '', attachment_url: '', attachment_name: '' });
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
                              >
                                Submit for Child
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 3: ATTENDANCE */}
              {activeTab === 'attendance' && (
                <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                      <div className="text-lg font-bold font-mono-num text-[#171717]">{att.percentage}%</div>
                      <div className="text-[11px] text-[#737373]">Attendance Rate</div>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="text-lg font-bold font-mono-num text-[#10B981]">{att.present}</div>
                      <div className="text-[11px] text-emerald-800">Present</div>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                      <div className="text-lg font-bold font-mono-num text-[#DC1726]">{att.absent}</div>
                      <div className="text-[11px] text-red-900">Absent</div>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="text-lg font-bold font-mono-num text-[#F59E0B]">{att.late}</div>
                      <div className="text-[11px] text-amber-800">Late</div>
                    </div>
                    <div className="p-3 rounded-lg bg-sky-50 border border-sky-200">
                      <div className="text-lg font-bold font-mono-num text-[#0EA5E9]">{att.on_leave}</div>
                      <div className="text-[11px] text-sky-900">Leave</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(['all', 'present', 'absent', 'late', 'leave'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setAttFilter(status)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border ${
                          attFilter === status
                            ? 'bg-[#DC1726] text-white border-[#DC1726]'
                            : 'bg-white text-[#525252] border-neutral-200 hover:bg-neutral-50'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  {attendanceList.length === 0 ? (
                    <p className="text-xs text-[#737373] py-4 text-center">No attendance records found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-neutral-50 border-y border-neutral-200 text-[#737373]">
                          <tr>
                            <th className="px-3 py-2 text-start">Date</th>
                            <th className="px-3 py-2 text-start">Class</th>
                            <th className="px-3 py-2 text-start">Status</th>
                            <th className="px-3 py-2 text-start">Remark</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {attendanceList.map((row: any) => {
                            const cls =
                              row.status === 'present'
                                ? 'bg-emerald-50 text-[#10B981] border-emerald-200'
                                : row.status === 'absent'
                                  ? 'bg-red-50 text-[#DC1726] border-red-200'
                                  : row.status === 'late'
                                    ? 'bg-amber-50 text-[#F59E0B] border-amber-200'
                                    : 'bg-sky-50 text-[#0EA5E9] border-sky-200';
                            return (
                              <tr key={row.id}>
                                <td className="px-3 py-2 font-mono-num font-semibold text-[#171717]">
                                  {row.attendance_date}
                                </td>
                                <td className="px-3 py-2 text-[#525252]">{row.class_name}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${cls}`}>
                                    {row.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-[#737373]">{row.remark || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: EXAM RESULTS */}
              {activeTab === 'results' && (
                <div className="space-y-4">
                  {resultsList.length === 0 ? (
                    <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center text-xs text-[#737373]">
                      No published examination results available for {st.full_name} yet.
                    </div>
                  ) : (
                    resultsList.map((r: any) => (
                      <div key={r.id} className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-bold text-[#171717]">{r.exam_name}</h4>
                            <p className="text-xs text-[#737373] font-mono-num">
                              {r.class_name} · {r.obtained_marks}/{r.total_marks} Marks ({r.percentage}%) · Grade{' '}
                              <strong>{r.grade}</strong>
                              {r.position ? ` · Rank #${r.position}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase ${
                                r.status === 'pass'
                                  ? 'bg-emerald-50 text-[#10B981] border border-emerald-200'
                                  : 'bg-red-50 text-[#DC1726] border border-red-200'
                              }`}
                            >
                              {r.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => setViewResult(r)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View / Download Grade Card</span>
                            </button>
                          </div>
                        </div>
                        {(r.subjects || []).length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border border-neutral-200">
                              <thead className="bg-neutral-50 text-[#737373]">
                                <tr>
                                  <th className="px-3 py-1.5 text-start border-b border-neutral-200">Subject</th>
                                  <th className="px-3 py-1.5 text-end border-b border-neutral-200">Obtained</th>
                                  <th className="px-3 py-1.5 text-end border-b border-neutral-200">Max Marks</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {r.subjects.map((sub: any) => (
                                  <tr key={sub.id || sub.subject_id}>
                                    <td className="px-3 py-1.5 font-medium text-[#171717]">{sub.subject_name}</td>
                                    <td className="px-3 py-1.5 text-end font-mono-num font-semibold">
                                      {sub.obtained_marks}
                                    </td>
                                    <td className="px-3 py-1.5 text-end font-mono-num text-[#737373]">
                                      {sub.total_marks}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 5: SYLLABUS & KITAB */}
              {activeTab === 'syllabus' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {syllabusList.length === 0 ? (
                    <div className="col-span-full bg-white rounded-xl border border-neutral-200 p-8 text-center text-xs text-[#737373]">
                      No syllabus or kitab uploaded for {st.class_name} yet.
                    </div>
                  ) : (
                    syllabusList.map((item: any) => (
                      <div key={item.id} className="bg-white rounded-xl border border-neutral-200 p-4 flex gap-3">
                        {item.cover_page_url ? (
                          <img
                            src={item.cover_page_url}
                            alt={item.book_name}
                            referrerPolicy="no-referrer"
                            className="w-14 h-20 rounded-lg object-cover border border-neutral-200 shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-20 rounded-lg bg-[#3B0A0D] text-white flex items-center justify-center shrink-0">
                            <BookOpen className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-[11px] font-semibold text-[#0EA5E9] uppercase truncate">
                            {item.subject_name}
                          </div>
                          <div className="text-sm font-bold text-[#171717] truncate">{item.book_name}</div>
                          {item.weekly_plan && (
                            <p className="text-xs text-[#737373] line-clamp-2">{item.weekly_plan}</p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {item.book_pdf_url && (
                              <a
                                href={item.book_pdf_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-50 border border-neutral-200 text-[11px] font-semibold text-[#171717] hover:border-[#0EA5E9]"
                              >
                                <FileText className="w-3 h-3" /> Book PDF
                              </a>
                            )}
                            {item.syllabus_pdf_url && (
                              <a
                                href={item.syllabus_pdf_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-50 border border-neutral-200 text-[11px] font-semibold text-[#DC1726] hover:border-[#DC1726]"
                              >
                                <FileText className="w-3 h-3" /> Syllabus PDF
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 6: ONLINE CLASSES & NOTICES */}
              {activeTab === 'classes' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-xl border border-neutral-200 p-5">
                    <h4 className="text-sm font-bold text-[#171717] mb-3 flex items-center gap-1.5">
                      <Monitor className="w-4 h-4 text-[#0EA5E9]" /> Online Classes ({onlineClassesList.length})
                    </h4>
                    {onlineClassesList.length === 0 ? (
                      <p className="text-xs text-[#737373] py-4">No online classes scheduled for {st.class_name}.</p>
                    ) : (
                      <div className="divide-y divide-neutral-100">
                        {onlineClassesList.map((oc: any) => (
                          <div key={oc.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-semibold text-[#171717] truncate">{oc.title}</div>
                              <div className="text-[#737373] truncate">
                                {oc.subject_name || 'Session'} · {oc.meeting_date}{' '}
                                {oc.start_time ? `(${oc.start_time})` : ''}
                              </div>
                            </div>
                            {oc.meeting_url && (
                              <a
                                href={oc.meeting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0EA5E9] text-white text-[11px] font-semibold hover:bg-sky-600 shrink-0"
                              >
                                Join <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-neutral-200 p-5">
                    <h4 className="text-sm font-bold text-[#171717] mb-3 flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-[#DC1726]" /> Madrasa &amp; Class Notices ({noticesList.length})
                    </h4>
                    {noticesList.length === 0 ? (
                      <p className="text-xs text-[#737373] py-4">No notices available.</p>
                    ) : (
                      <div className="divide-y divide-neutral-100">
                        {noticesList.map((n: any) => (
                          <div key={n.id} className="py-2.5 text-xs space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[#171717]">{n.title}</span>
                              <span className="font-mono-num text-[#737373] shrink-0">{n.publish_date}</span>
                            </div>
                            {n.description && <p className="text-[#737373] line-clamp-2">{n.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Submit Homework Modal for Selected Child */}
      {submitTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-base font-bold text-[#171717]">
                Submit Homework for {st?.full_name}: {submitTarget.title}
              </h3>
              <button
                type="button"
                onClick={() => setSubmitTarget(null)}
                className="p-1.5 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitHw} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Answer / Notes *</label>
                <textarea
                  rows={4}
                  required
                  value={subForm.submission_text}
                  onChange={(e) => setSubForm((p) => ({ ...p, submission_text: e.target.value }))}
                  placeholder="Write your child's homework response..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">
                  Attach Homework Photo / PDF (Optional)
                </label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 text-xs font-medium cursor-pointer hover:bg-neutral-50">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{uploadingHwFile ? 'Uploading...' : subForm.attachment_name || 'Choose File'}</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setUploadingHwFile(true);
                      try {
                        const up = await uploadFile(f);
                        setSubForm((p) => ({ ...p, attachment_url: up.url, attachment_name: up.name }));
                      } catch (err: any) {
                        setErr(err?.message || 'File upload failed');
                      } finally {
                        setUploadingHwFile(false);
                      }
                    }}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitTarget(null)}
                  className="px-4 py-2 rounded-lg border border-neutral-200 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingHw || uploadingHwFile}
                  className="px-5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60"
                >
                  {submittingHw ? 'Submitting...' : 'Submit Homework'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Result Grade Card Modal (Print / PDF / PNG Download) */}
      <PrintModal
        open={Boolean(viewResult)}
        standalone={true}
        title="Result Grade Card"
        subtitle={`${viewResult?.student_name || ''} — ${viewResult?.exam_name || ''}`}
        settings={settings}
        onClose={() => setViewResult(null)}
        headerActions={
          viewResult && (
            <>
              <button
                type="button"
                disabled={downloadingPdf}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-60"
              >
                <FileText className="w-4 h-4" />
                <span>{downloadingPdf ? 'Saving PDF...' : 'Download PDF'}</span>
              </button>
              <button
                type="button"
                disabled={downloadingPng}
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#ea580c] text-white text-sm font-medium hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingPng ? 'Saving PNG...' : 'Download PNG'}</span>
              </button>
            </>
          )
        }
      >
        {viewCardData && <ResultGradeCard data={viewCardData} cardRef={viewCardRef} />}
      </PrintModal>
    </div>
  );
};
