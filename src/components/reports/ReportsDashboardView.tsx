import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ReportCategoryId } from './reportCatalog.ts';

export interface ReportsDashboardData {
  period: {
    label: string;
    sessionName: string;
    startDate: string;
    endDate: string;
  };
  kpis: {
    totalStudents: number;
    activeStudents: number;
    inactiveStudents: number;
    totalTeachers: number;
    activeTeachers: number;
    totalClasses: number;
    totalAdmissions: number;
    presentRecords: number;
    absentRecords: number;
    lateRecords: number;
    leaveRecords: number;
    totalAttRecords: number;
    attendancePct: number;
    presentStudentsDistinct: number;
    absentStudentsDistinct: number;
    totalExaminations: number;
    totalResults: number;
    passedResults: number;
    failedResults: number;
    passPercentage: number;
    avgPercentage: number;
    programFeesCollected: number;
    tuitionFeeModuleEnabled: boolean;
  };
  monthlySeries: Array<{
    monthKey: string;
    label: string;
    admissions: number;
    present: number;
    absent: number;
    attendancePct: number;
    examinations: number;
    resultsCount: number;
    passed: number;
    passPct: number;
    programFees: number;
  }>;
  quarterlySeries: Array<{
    quarter: string;
    admissions: number;
    attendancePct: number;
    examinations: number;
    passPct: number;
    programFees: number;
  }>;
  yearlySeries: Array<{
    year: string;
    students: number;
    admissions: number;
    attendancePct: number;
    examinations: number;
    passPct: number;
    programFees: number;
  }>;
  classBreakdown: Array<{
    classId: string;
    className: string;
    students: number;
    activeStudents: number;
    attendancePct: number;
    passPct: number;
  }>;
  statusDistribution: Array<{ name: string; value: number }>;
  generatedAt: string;
}

interface ReportsDashboardViewProps {
  data: ReportsDashboardData | null;
  loading: boolean;
  onJumpCategory: (cat: ReportCategoryId, reportId?: string) => void;
}

const PIE_COLORS = ['#059669', '#D97706', '#DC1726', '#2563EB', '#6B7280'];

export const ReportsDashboardView: React.FC<ReportsDashboardViewProps> = ({
  data,
  loading,
  onJumpCategory,
}) => {
  const [chartTab, setChartTab] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-white border border-neutral-200 animate-pulse p-4" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center text-xs text-[#737373]">
        Unable to load dashboard analytics.
      </div>
    );
  }

  const k = data.kpis;

  const kpiCards = [
    { label: 'Total Students', value: k.totalStudents, sub: `${data.period.sessionName}`, icon: GraduationCap, accent: 'text-[#171717]' },
    { label: 'Active Students', value: k.activeStudents, sub: 'Currently enrolled', icon: UserCheck, accent: 'text-emerald-700' },
    { label: 'Inactive Students', value: k.inactiveStudents, sub: 'Inactive / exited', icon: UserMinus, accent: 'text-amber-700' },
    { label: 'Total Teachers', value: k.totalTeachers, sub: `${k.activeTeachers} active faculty`, icon: Users, accent: 'text-[#171717]' },
    { label: 'Total Classes', value: k.totalClasses, sub: 'Active academic classes', icon: Building2, accent: 'text-[#171717]' },
    { label: 'Total Admissions', value: k.totalAdmissions, sub: 'Selected period intake', icon: BookOpen, accent: 'text-blue-700' },
    { label: 'Present Students', value: k.presentStudentsDistinct, sub: `${k.presentRecords + k.lateRecords} present marks (${k.attendancePct}%)`, icon: ClipboardCheck, accent: 'text-emerald-700' },
    { label: 'Absent Students', value: k.absentStudentsDistinct, sub: `${k.absentRecords} absent marks`, icon: XCircle, accent: 'text-[#DC1726]' },
    { label: 'Total Examinations', value: k.totalExaminations, sub: `${k.totalResults} result entries`, icon: CalendarCheck, accent: 'text-[#171717]' },
    { label: 'Passed Students', value: k.passedResults, sub: 'Passing result entries', icon: CheckCircle2, accent: 'text-emerald-700' },
    { label: 'Failed Students', value: k.failedResults, sub: 'Failing result entries', icon: XCircle, accent: 'text-[#DC1726]' },
    { label: 'Overall Pass %', value: k.totalResults ? `${k.passPercentage}%` : 'N/A', sub: k.totalResults ? `Avg score ${k.avgPercentage}%` : 'No results yet', icon: Award, accent: 'text-emerald-700' },
    {
      label: 'Program Collections',
      value: `Rs. ${k.programFeesCollected.toLocaleString('en-IN')}`,
      sub: 'Actual program receipts',
      icon: Wallet,
      accent: 'text-emerald-700',
    },
    {
      label: 'Student Tuition Fees',
      value: 'Not Configured',
      sub: 'No fee ledger table yet',
      icon: TrendingUp,
      accent: 'text-amber-700',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Quick One-Click Executive Action Bar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#171717]">
            Executive Analytics — {data.period.label}
          </h2>
          <p className="text-xs text-[#737373]">
            All figures are computed live from verified Supabase database records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onJumpCategory('annual_complete')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap cursor-pointer"
          >
            <FileBarChart className="w-3.5 h-3.5" /> Generate Complete Annual Report
          </button>
          <button
            type="button"
            onClick={() => onJumpCategory('students', 'individual_student_dossier')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 whitespace-nowrap cursor-pointer"
          >
            Individual Student Report <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onJumpCategory('comparison')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 whitespace-nowrap cursor-pointer"
          >
            Compare Periods <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 14-Card Comprehensive KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {kpiCards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="bg-white rounded-xl border border-neutral-200 p-3.5 flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#737373] truncate">{c.label}</span>
                <Icon className="w-4 h-4 text-neutral-400 shrink-0" />
              </div>
              <div>
                <div className={`text-xl font-extrabold font-mono-num leading-tight ${c.accent}`}>
                  {c.value}
                </div>
                <div className="text-[11px] text-[#737373] mt-0.5 truncate">{c.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly / Quarterly / Yearly Interactive Chart Panel */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#171717]">
              Institutional Performance Trends
            </h3>
            <p className="text-xs text-[#737373]">
              Switch between Monthly, Quarterly, and Multi-Year database analytics
            </p>
          </div>
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-neutral-100">
            {(['monthly', 'quarterly', 'yearly'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setChartTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize cursor-pointer ${
                  chartTab === tab
                    ? 'bg-white text-[#171717] shadow-xs'
                    : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const activeSeries =
            chartTab === 'monthly'
              ? data.monthlySeries.map((m) => ({
                  periodLabel: m.label,
                  attendancePct: m.attendancePct,
                  passPct: m.passPct,
                  admissions: m.admissions,
                  examinations: m.examinations,
                }))
              : chartTab === 'quarterly'
              ? data.quarterlySeries.map((q) => ({
                  periodLabel: q.quarter,
                  attendancePct: q.attendancePct,
                  passPct: q.passPct,
                  admissions: q.admissions,
                  examinations: q.examinations,
                }))
              : data.yearlySeries.map((y) => ({
                  periodLabel: y.year,
                  attendancePct: y.attendancePct,
                  passPct: y.passPct,
                  admissions: y.admissions,
                  examinations: y.examinations,
                }));

          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-neutral-100 rounded-xl p-3">
                <div className="text-xs font-semibold text-[#525252] mb-2">
                  Attendance % vs Pass % ({chartTab})
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={activeSeries}
                      margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="periodLabel"
                        tick={{ fontSize: 11, fill: '#737373' }}
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#737373' }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="attendancePct" name="Attendance %" stroke="#059669" strokeWidth={2.2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="passPct" name="Pass %" stroke="#DC1726" strokeWidth={2.2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border border-neutral-100 rounded-xl p-3">
                <div className="text-xs font-semibold text-[#525252] mb-2">
                  Admissions & Examinations ({chartTab})
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activeSeries}
                      margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="periodLabel"
                        tick={{ fontSize: 11, fill: '#737373' }}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="admissions" name="Admissions" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="examinations" name="Examinations" fill="#DC1726" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bottom Row: Class Strength Comparison + Student Status Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#171717]">Class-wise Student Strength & Pass %</h3>
            <button
              type="button"
              onClick={() => onJumpCategory('classes', 'class_complete')}
              className="text-xs font-semibold text-[#DC1726] hover:underline cursor-pointer"
            >
              Open Class Reports
            </button>
          </div>
          {data.classBreakdown.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#737373]">No class records found.</div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.classBreakdown} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="className" tick={{ fontSize: 11, fill: '#737373' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="students" name="Students" fill="#171717" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="passPct" name="Pass %" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <h3 className="text-sm font-bold text-[#171717] mb-3">Student Enrollment Status</h3>
          {data.statusDistribution.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#737373]">No student records found.</div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.statusDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={3}
                  >
                    {data.statusDistribution.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
