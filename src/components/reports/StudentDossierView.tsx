import React, { useEffect, useState } from 'react';
import {
  Award,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Loader2,
  Printer,
  Search,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../../lib/api.ts';
import { MadrasaSettings } from '../../types.ts';
import { PrintModal } from '../PrintModal.tsx';
import {
  exportMultiSheetExcel,
  exportReportToCSV,
  exportStructuredReportToPdf,
} from '../../utils/reportExportUtils.ts';
import { ReportMetaData } from './reportCatalog.ts';

interface StudentDossierViewProps {
  meta: ReportMetaData | null;
  settings: MadrasaSettings | null;
  initialStudentId?: string;
}

export const StudentDossierView: React.FC<StudentDossierViewProps> = ({
  meta,
  settings,
  initialStudentId = '',
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [admissionInput, setAdmissionInput] = useState('');
  const [dossier, setDossier] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const loadDossier = async (params: { studentId?: string; admissionNo?: string }) => {
    if (!params.studentId && !params.admissionNo) return;
    setLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (params.studentId) qs.set('studentId', params.studentId);
      else if (params.admissionNo) qs.set('admissionNo', params.admissionNo);
      const data = await apiRequest<any>(`/api/reports-erp/student-dossier?${qs.toString()}`);
      setDossier(data);
      if (data?.student?.id) setSelectedStudentId(data.student.id);
    } catch (e: any) {
      setDossier(null);
      setErr(e?.message || 'Student not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
      void loadDossier({ studentId: initialStudentId });
    } else if (meta?.students?.length && !selectedStudentId && !dossier) {
      const firstId = meta.students[0].id;
      setSelectedStudentId(firstId);
      void loadDossier({ studentId: firstId });
    }
  }, [initialStudentId, meta?.students]);

  const handleDownloadPdf = async () => {
    if (!dossier || pdfBusy) return;
    setPdfBusy(true);
    try {
      const st = dossier.student;
      const rows = (dossier.examinationHistory || []).map((ex: any) => ({
        Examination: ex.examinationName,
        'Academic Year': ex.academicYear,
        Class: ex.className,
        Date: ex.examDate,
        Obtained: ex.obtainedMarks,
        Total: ex.totalMarks,
        'Percentage %': `${ex.percentage}%`,
        Grade: ex.grade,
        Result: ex.status,
        Rank: ex.rank || '—',
      }));
      await exportStructuredReportToPdf({
        title: `Individual Student Complete Report — ${st.fullName}`,
        subtitle: `Admission No: ${st.admissionNumber} | Father: ${st.fatherName} | Class: ${st.className} | Status: ${String(st.status).toUpperCase()}`,
        academicYear: st.academicYear,
        dateRange: `Admitted: ${st.admissionDate}`,
        settings,
        summaryCards: [
          { label: 'Attendance %', value: dossier.attendanceSummary.totalDays ? `${dossier.attendanceSummary.attendancePercentage}%` : 'N/A' },
          { label: 'Working Days', value: dossier.attendanceSummary.totalDays },
          { label: 'Exams Taken', value: dossier.academicSummary.totalExamsTaken },
          { label: 'Avg Score %', value: dossier.academicSummary.totalExamsTaken ? `${dossier.academicSummary.averagePercentage}%` : 'N/A' },
          { label: 'Latest Rank', value: dossier.academicSummary.latestRank || '—' },
        ],
        columns: rows.length ? Object.keys(rows[0]) : ['Examination', 'Result'],
        rows,
        fileName: `Student_Report_${st.admissionNumber}_${st.fullName}`,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const handleExportExcel = () => {
    if (!dossier) return;
    const st = dossier.student;
    exportMultiSheetExcel(
      [
        {
          name: 'Student Profile',
          rows: [
            { Field: 'Full Name', Value: st.fullName },
            { Field: 'Admission Number', Value: st.admissionNumber },
            { Field: 'Student ID', Value: st.studentCode },
            { Field: 'Father Name', Value: st.fatherName },
            { Field: 'Mother Name', Value: st.motherName },
            { Field: 'Class', Value: st.className },
            { Field: 'Admission Date', Value: st.admissionDate },
            { Field: 'Status', Value: st.status },
            { Field: 'Mobile', Value: st.mobile },
            { Field: 'Address', Value: `${st.village}, ${st.district}, ${st.state}` },
          ],
        },
        {
          name: 'Monthly Attendance',
          rows: (dossier.monthlyAttendance || []).map((m: any) => ({
            Month: m.month,
            Present: m.present,
            Late: m.late,
            Absent: m.absent,
            Leave: m.leave,
            Total: m.total,
            'Attendance %': `${m.percentage}%`,
          })),
        },
        {
          name: 'Exam History',
          rows: (dossier.examinationHistory || []).map((ex: any) => ({
            Examination: ex.examinationName,
            Date: ex.examDate,
            Class: ex.className,
            Obtained: ex.obtainedMarks,
            Total: ex.totalMarks,
            'Percentage %': `${ex.percentage}%`,
            Grade: ex.grade,
            Result: ex.status,
            Rank: ex.rank || '—',
          })),
        },
        {
          name: 'Subject Performance',
          rows: (dossier.subjectSummary || []).map((s: any) => ({
            Subject: s.subject,
            Exams: s.exams,
            Obtained: s.obtained,
            Total: s.total,
            'Average %': `${s.averagePct}%`,
          })),
        },
        {
          name: 'Promotions',
          rows: (dossier.promotions || []).map((p: any) => ({
            Date: p.date,
            Action: p.actionType,
            'From Class': p.fromClass,
            'To Class': p.toClass,
            Remarks: p.remarks,
          })),
        },
      ],
      `Student_Complete_Report_${st.admissionNumber}_${st.fullName}`
    );
  };

  return (
    <div className="space-y-4">
      {/* Selector & Lookup Bar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#171717]">
              Individual Student Complete Report
            </h3>
            <p className="text-xs text-[#737373]">
              Select a student or enter an Admission Number to load their complete institutional record.
            </p>
          </div>
          {dossier && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPrintOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold hover:bg-neutral-50 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#DC1726]" /> Print
              </button>
              <button
                type="button"
                disabled={pdfBusy}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {pdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
              <button
                type="button"
                onClick={() =>
                  exportReportToCSV(
                    (dossier.examinationHistory || []).map((ex: any) => ({
                      Student: dossier.student.fullName,
                      AdmissionNo: dossier.student.admissionNumber,
                      Examination: ex.examinationName,
                      Obtained: ex.obtainedMarks,
                      Total: ex.totalMarks,
                      Percentage: ex.percentage,
                      Grade: ex.grade,
                      Status: ex.status,
                      Rank: ex.rank,
                    })),
                    `Student_${dossier.student.admissionNumber}_Results`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold hover:bg-neutral-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-[#737373] mb-1">
              Select Student (Admission Number &amp; Name)
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                setSelectedStudentId(e.target.value);
                if (e.target.value) void loadDossier({ studentId: e.target.value });
              }}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white font-medium"
            >
              <option value="">— Select Student —</option>
              {(meta?.students || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.admission_no || s.student_code} — {s.full_name} (S/o {s.father_name})
                </option>
              ))}
            </select>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (admissionInput.trim()) void loadDossier({ admissionNo: admissionInput.trim() });
            }}
          >
            <label className="block text-[11px] font-semibold text-[#737373] mb-1">
              Or Quick Lookup by Admission Number / Student ID
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={admissionInput}
                  onChange={(e) => setAdmissionInput(e.target.value)}
                  placeholder="Enter Admission No (e.g. ADM-2026-...)"
                  className="w-full ps-8 pe-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#171717] text-white font-semibold hover:bg-neutral-800 whitespace-nowrap cursor-pointer"
              >
                Load Record
              </button>
            </div>
          </form>
        </div>
      </div>

      {err && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
          {err}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-10 text-center text-xs text-[#737373]">
          <Loader2 className="w-5 h-5 animate-spin text-[#DC1726] mx-auto mb-2" />
          Loading complete student academic dossier...
        </div>
      ) : !dossier ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-10 text-center text-xs text-[#737373]">
          Select a student or enter an Admission Number above to view their complete report.
        </div>
      ) : (
        <>
          {/* Student Profile Card */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-neutral-100 pb-4">
              {dossier.student.photoUrl ? (
                <img
                  src={dossier.student.photoUrl}
                  alt={dossier.student.fullName}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-xl object-cover border border-neutral-200 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-red-50 text-[#DC1726] flex items-center justify-center shrink-0">
                  <GraduationCap className="w-8 h-8" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-bold text-[#171717]">{dossier.student.fullName}</h4>
                  <span className="text-xs font-mono-num font-semibold text-[#DC1726]">
                    {dossier.student.admissionNumber}
                  </span>
                </div>
                <div className="text-xs text-[#737373] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Father: <strong className="text-[#171717]">{dossier.student.fatherName}</strong></span>
                  <span>·</span>
                  <span>Class: <strong className="text-[#171717]">{dossier.student.className}</strong></span>
                  <span>·</span>
                  <span>Status: <strong className="uppercase text-emerald-700">{dossier.student.status}</strong></span>
                  <span>·</span>
                  <span className="font-mono-num">Admitted: {dossier.student.admissionDate}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <div className="text-[11px] text-[#737373]">Mother&apos;s Name</div>
                <div className="font-semibold text-[#171717]">{dossier.student.motherName}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Date of Birth</div>
                <div className="font-semibold font-mono-num text-[#171717]">{dossier.student.dob}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Gender</div>
                <div className="font-semibold text-[#171717]">{dossier.student.gender}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Contact Mobile</div>
                <div className="font-semibold font-mono-num text-[#171717]">{dossier.student.mobile}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Village / District</div>
                <div className="font-semibold text-[#171717]">{dossier.student.village}, {dossier.student.district}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Academic Session</div>
                <div className="font-semibold font-mono-num text-[#171717]">{dossier.student.academicYear}</div>
              </div>
            </div>

            {/* Key Student KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-[11px] text-[#737373]">Attendance %</div>
                <div className="text-lg font-bold font-mono-num text-emerald-700">
                  {dossier.attendanceSummary.totalDays ? `${dossier.attendanceSummary.attendancePercentage}%` : 'N/A'}
                </div>
                <div className="text-[10px] text-[#737373] font-mono-num">
                  {dossier.attendanceSummary.presentDays}P · {dossier.attendanceSummary.absentDays}A · {dossier.attendanceSummary.totalDays}D
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-[11px] text-[#737373]">Exams Taken</div>
                <div className="text-lg font-bold font-mono-num text-[#171717]">
                  {dossier.academicSummary.totalExamsTaken}
                </div>
                <div className="text-[10px] text-[#737373] font-mono-num">
                  {dossier.academicSummary.passedExams} Pass · {dossier.academicSummary.failedExams} Fail
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-[11px] text-[#737373]">Average Marks</div>
                <div className="text-lg font-bold font-mono-num text-[#171717]">
                  {dossier.academicSummary.totalExamsTaken ? `${dossier.academicSummary.averagePercentage}%` : 'N/A'}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-[11px] text-[#737373]">Latest Grade / Status</div>
                <div className="text-lg font-bold font-mono-num text-[#DC1726]">
                  {dossier.academicSummary.latestGrade} · {dossier.academicSummary.latestStatus}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-[11px] text-[#737373]">Class Rank</div>
                <div className="text-lg font-bold font-mono-num text-[#171717] inline-flex items-center gap-1">
                  <Award className="w-4 h-4 text-amber-600" />
                  {dossier.academicSummary.latestRank || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Monthly Attendance Chart + Subject Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h4 className="text-sm font-bold text-[#171717] mb-3">Monthly Attendance History</h4>
              {dossier.monthlyAttendance.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#737373]">No attendance records found.</div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dossier.monthlyAttendance} margin={{ top: 6, right: 8, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#737373' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="present" name="Present" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="absent" name="Absent" fill="#DC1726" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h4 className="text-sm font-bold text-[#171717] mb-3">Subject-wise Cumulative Performance</h4>
              {dossier.subjectSummary.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#737373]">No subject marks recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                      <tr>
                        <th className="px-3 py-2 text-start">Subject</th>
                        <th className="px-3 py-2 text-end">Exams</th>
                        <th className="px-3 py-2 text-end">Marks</th>
                        <th className="px-3 py-2 text-end">Avg %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {dossier.subjectSummary.map((s: any) => (
                        <tr key={s.subject}>
                          <td className="px-3 py-2 font-medium text-[#171717]">{s.subject}</td>
                          <td className="px-3 py-2 text-end font-mono-num">{s.exams}</td>
                          <td className="px-3 py-2 text-end font-mono-num">{s.obtained}/{s.total}</td>
                          <td className="px-3 py-2 text-end font-mono-num font-bold text-emerald-700">{s.averagePct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Examination & Subject-wise Marks History */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h4 className="text-sm font-bold text-[#171717]">Examination &amp; Subject-wise Marks History</h4>
            {dossier.examinationHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#737373]">No examination results recorded for this student.</div>
            ) : (
              <div className="space-y-3">
                {dossier.examinationHistory.map((ex: any) => (
                  <div key={ex.resultId} className="rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-bold text-[#171717]">{ex.examinationName}</span>
                        <span className="text-[#737373] ms-2">
                          {ex.className} · {ex.academicYear} · {ex.examDate}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono-num">
                        <span>{ex.obtainedMarks}/{ex.totalMarks} ({ex.percentage}%)</span>
                        <span className="font-bold">Grade {ex.grade}</span>
                        <span className={ex.status === 'PASS' ? 'font-bold text-emerald-700' : 'font-bold text-[#DC1726]'}>
                          {ex.status}
                        </span>
                        {ex.rank > 0 && <span className="font-bold text-amber-700">Rank #{ex.rank}</span>}
                      </div>
                    </div>
                    {ex.subjectMarks.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white border-b border-neutral-100 text-[#737373] text-[11px]">
                            <tr>
                              <th className="px-3 py-1.5 text-start">Subject</th>
                              <th className="px-3 py-1.5 text-end">Obtained</th>
                              <th className="px-3 py-1.5 text-end">Total</th>
                              <th className="px-3 py-1.5 text-end">%</th>
                              <th className="px-3 py-1.5 text-end">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {ex.subjectMarks.map((sm: any, idx: number) => (
                              <tr key={idx}>
                                <td className="px-3 py-1.5 text-[#171717]">{sm.subjectName}</td>
                                <td className="px-3 py-1.5 text-end font-mono-num">{sm.isAbsent ? 'AB' : sm.obtainedMarks}</td>
                                <td className="px-3 py-1.5 text-end font-mono-num">{sm.totalMarks}</td>
                                <td className="px-3 py-1.5 text-end font-mono-num">{sm.percentage}%</td>
                                <td className={`px-3 py-1.5 text-end font-semibold ${sm.status === 'Pass' ? 'text-emerald-700' : 'text-[#DC1726]'}`}>
                                  {sm.status}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Promotion History */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-2.5">
            <h4 className="text-sm font-bold text-[#171717]">Promotion &amp; Class Transfer History</h4>
            {dossier.promotions.length === 0 ? (
              <div className="py-4 text-xs text-[#737373]">No promotion or transfer records logged yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                    <tr>
                      <th className="px-3 py-2 text-start">Date</th>
                      <th className="px-3 py-2 text-start">Action</th>
                      <th className="px-3 py-2 text-start">From Class</th>
                      <th className="px-3 py-2 text-start">To Class</th>
                      <th className="px-3 py-2 text-start">Session</th>
                      <th className="px-3 py-2 text-start">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {dossier.promotions.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono-num">{p.date}</td>
                        <td className="px-3 py-2 uppercase font-semibold">{p.actionType}</td>
                        <td className="px-3 py-2">{p.fromClass}</td>
                        <td className="px-3 py-2">{p.toClass}</td>
                        <td className="px-3 py-2 font-mono-num">{p.fromSession} → {p.toSession}</td>
                        <td className="px-3 py-2 text-[#737373]">{p.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Print Preview Modal */}
          <PrintModal
            open={printOpen}
            title={`Individual Student Report — ${dossier.student.fullName}`}
            subtitle={`Admission No: ${dossier.student.admissionNumber} · Class: ${dossier.student.className}`}
            settings={settings}
            onClose={() => setPrintOpen(false)}
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-neutral-300 rounded p-3">
                <div><strong>Student:</strong> {dossier.student.fullName}</div>
                <div><strong>Admission No:</strong> {dossier.student.admissionNumber}</div>
                <div><strong>Father:</strong> {dossier.student.fatherName}</div>
                <div><strong>Class:</strong> {dossier.student.className}</div>
                <div><strong>Admission Date:</strong> {dossier.student.admissionDate}</div>
                <div><strong>Status:</strong> {String(dossier.student.status).toUpperCase()}</div>
                <div><strong>Attendance:</strong> {dossier.attendanceSummary.attendancePercentage}% ({dossier.attendanceSummary.presentDays}/{dossier.attendanceSummary.totalDays})</div>
                <div><strong>Avg Score:</strong> {dossier.academicSummary.averagePercentage}%</div>
                <div><strong>Latest Rank:</strong> {dossier.academicSummary.latestRank || '—'}</div>
              </div>

              <div>
                <h4 className="font-bold mb-1.5">Examination History</h4>
                <table className="w-full text-[11px] border-collapse border border-neutral-300">
                  <thead className="bg-neutral-100">
                    <tr>
                      <th className="border border-neutral-300 px-2 py-1 text-start">Examination</th>
                      <th className="border border-neutral-300 px-2 py-1 text-start">Date</th>
                      <th className="border border-neutral-300 px-2 py-1 text-end">Marks</th>
                      <th className="border border-neutral-300 px-2 py-1 text-end">%</th>
                      <th className="border border-neutral-300 px-2 py-1 text-center">Grade</th>
                      <th className="border border-neutral-300 px-2 py-1 text-center">Status</th>
                      <th className="border border-neutral-300 px-2 py-1 text-center">Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.examinationHistory.length === 0 ? (
                      <tr><td colSpan={7} className="border border-neutral-300 p-3 text-center">No examination results recorded.</td></tr>
                    ) : (
                      dossier.examinationHistory.map((ex: any) => (
                        <tr key={ex.resultId}>
                          <td className="border border-neutral-300 px-2 py-1">{ex.examinationName}</td>
                          <td className="border border-neutral-300 px-2 py-1 font-mono-num">{ex.examDate}</td>
                          <td className="border border-neutral-300 px-2 py-1 text-end font-mono-num">{ex.obtainedMarks}/{ex.totalMarks}</td>
                          <td className="border border-neutral-300 px-2 py-1 text-end font-mono-num">{ex.percentage}%</td>
                          <td className="border border-neutral-300 px-2 py-1 text-center font-bold">{ex.grade}</td>
                          <td className="border border-neutral-300 px-2 py-1 text-center font-bold">{ex.status}</td>
                          <td className="border border-neutral-300 px-2 py-1 text-center font-mono-num">{ex.rank || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </PrintModal>
        </>
      )}
    </div>
  );
};
