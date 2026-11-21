import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  BookOpen,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  History,
  LayoutDashboard,
  ListFilter,
  Menu,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import {
  REPORT_CATEGORIES,
  ReportCategoryId,
  ReportMetaData,
} from '../components/reports/reportCatalog.ts';
import {
  ReportsDashboardData,
  ReportsDashboardView,
} from '../components/reports/ReportsDashboardView.tsx';
import {
  ReportDataTable,
  ReportDatasetResponse,
} from '../components/reports/ReportDataTable.tsx';
import { StudentDossierView } from '../components/reports/StudentDossierView.tsx';
import { AnnualCompleteReportView } from '../components/reports/AnnualCompleteReportView.tsx';
import { ComparisonAnalyticsView } from '../components/reports/ComparisonAnalyticsView.tsx';
import { AnnualCompletePayload } from '../utils/reportExportUtils.ts';

interface ReportsPageProps {
  user?: User;
  settings: MadrasaSettings | null;
}

interface FilterState {
  sessionId: string;
  calendarYear: string;
  month: string;
  date: string;
  weekStart: string;
  dateFrom: string;
  dateTo: string;
  classId: string;
  studentId: string;
  admissionNo: string;
  examId: string;
  subjectId: string;
  teacherId: string;
  studentStatus: string;
  resultStatus: string;
  lowAttendanceThreshold: string;
}

const CATEGORY_ICONS: Record<ReportCategoryId, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  students: Users,
  classes: Building2,
  daily: Calendar,
  weekly: CalendarRange,
  monthly: CalendarDays,
  yearly: CalendarClock,
  annual_complete: BookOpen,
  examinations: ClipboardCheck,
  results: Award,
  attendance: UserCheck,
  teachers: GraduationCap,
  financial: Wallet,
  historical: History,
  comparison: ArrowLeftRight,
};

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

function getCurrentWeekMondayIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function isDailyReport(category: ReportCategoryId, reportId: string): boolean {
  return (
    category === 'daily' ||
    reportId === 'att_daily' ||
    reportId === 'fin_daily' ||
    reportId === 'class_daily'
  );
}

function isWeeklyReport(category: ReportCategoryId, reportId: string): boolean {
  return (
    category === 'weekly' ||
    reportId === 'att_weekly' ||
    reportId === 'fin_weekly' ||
    reportId === 'class_weekly'
  );
}

function isMonthlyReport(category: ReportCategoryId, reportId: string): boolean {
  return (
    category === 'monthly' ||
    reportId === 'att_monthly' ||
    reportId === 'fin_monthly' ||
    reportId === 'class_monthly' ||
    reportId === 'teacher_monthly'
  );
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ user, settings }) => {
  const [meta, setMeta] = useState<ReportMetaData | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState('');

  const [activeCategory, setActiveCategory] = useState<ReportCategoryId>('dashboard');
  const [activeReportId, setActiveReportId] = useState<string>('complete_student_list');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [mobileModulesOpen, setMobileModulesOpen] = useState(false);
  const [subReportPickerOpen, setSubReportPickerOpen] = useState(false);
  const [subReportSearch, setSubReportSearch] = useState('');

  const [filters, setFilters] = useState<FilterState>({
    sessionId: '',
    calendarYear: '',
    month: getCurrentMonthIso(),
    date: getTodayIso(),
    weekStart: getCurrentWeekMondayIso(),
    dateFrom: '',
    dateTo: '',
    classId: '',
    studentId: '',
    admissionNo: '',
    examId: '',
    subjectId: '',
    teacherId: '',
    studentStatus: '',
    resultStatus: '',
    lowAttendanceThreshold: '75',
  });

  const [debouncedAdmissionNo, setDebouncedAdmissionNo] = useState('');

  // View payloads
  const [dashboardData, setDashboardData] = useState<ReportsDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');

  const [dataset, setDataset] = useState<ReportDatasetResponse | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState('');

  const [annualData, setAnnualData] = useState<AnnualCompletePayload | null>(null);
  const [annualLoading, setAnnualLoading] = useState(false);
  const [annualError, setAnnualError] = useState('');

  const [refreshTick, setRefreshTick] = useState(0);
  const activeReqSeq = useRef(0);

  // Debounce admission number typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAdmissionNo(filters.admissionNo.trim()), 280);
    return () => clearTimeout(t);
  }, [filters.admissionNo]);

  // Fetch initial metadata (sessions, classes, subjects, teachers, exams, students, capabilities)
  useEffect(() => {
    let cancelled = false;
    setMetaLoading(true);
    setMetaError('');
    apiRequest<ReportMetaData>('/api/reports-erp/meta')
      .then((res) => {
        if (cancelled) return;
        setMeta(res);
        setFilters((prev) => ({
          ...prev,
          sessionId: prev.sessionId || res.activeSessionId || 'all',
        }));
      })
      .catch((err: any) => {
        if (!cancelled) setMetaError(err?.message || 'Failed to load reporting metadata.');
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter out Financial category if role does not have financial permission (e.g. Teacher)
  const visibleCategories = useMemo(() => {
    if (meta && !meta.capabilities.canViewFinance) {
      return REPORT_CATEGORIES.filter((c) => c.id !== 'financial');
    }
    return REPORT_CATEGORIES;
  }, [meta]);

  const currentCategoryConfig = useMemo(
    () => visibleCategories.find((c) => c.id === activeCategory) || visibleCategories[0],
    [visibleCategories, activeCategory]
  );

  const currentReportDef = useMemo(
    () =>
      currentCategoryConfig?.reports.find((r) => r.id === activeReportId) ||
      currentCategoryConfig?.reports[0] ||
      null,
    [currentCategoryConfig, activeReportId]
  );

  const handleSelectCategory = useCallback(
    (catId: ReportCategoryId, explicitReportId?: string) => {
      setActiveCategory(catId);
      setMobileModulesOpen(false);
      setSubReportPickerOpen(false);
      setSubReportSearch('');
      const cat = REPORT_CATEGORIES.find((c) => c.id === catId);
      if (explicitReportId) {
        setActiveReportId(explicitReportId);
      } else if (cat && cat.reports.length > 0) {
        setActiveReportId(cat.reports[0].id);
      }
    },
    []
  );

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // If user picks a specific calendar year, clear conflicting custom date range
      if (key === 'calendarYear' && value) {
        next.dateFrom = '';
        next.dateTo = '';
      }
      // If user picks a session, clear calendarYear override so session applies cleanly
      if (key === 'sessionId') {
        next.calendarYear = '';
      }
      // If class changes, reset studentId if student doesn't belong to that class
      if (key === 'classId' && value && next.studentId && meta) {
        const st = meta.students.find((s) => s.id === next.studentId);
        if (st && st.class_id !== value) next.studentId = '';
      }
      return next;
    });
  };

  const handleResetFilters = () => {
    setFilters({
      sessionId: meta?.activeSessionId || 'all',
      calendarYear: '',
      month: getCurrentMonthIso(),
      date: getTodayIso(),
      weekStart: getCurrentWeekMondayIso(),
      dateFrom: '',
      dateTo: '',
      classId: '',
      studentId: '',
      admissionNo: '',
      examId: '',
      subjectId: '',
      teacherId: '',
      studentStatus: '',
      resultStatus: '',
      lowAttendanceThreshold: '75',
    });
  };

  const activeExtraFilterCount = useMemo(() => {
    let count = 0;
    if (filters.calendarYear) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.classId) count++;
    if (filters.studentId) count++;
    if (filters.admissionNo.trim()) count++;
    if (filters.examId) count++;
    if (filters.subjectId) count++;
    if (filters.teacherId) count++;
    if (filters.studentStatus) count++;
    if (filters.resultStatus) count++;
    if (filters.lowAttendanceThreshold !== '75') count++;
    return count;
  }, [filters]);

  // Filtered students list for student dropdown when classId is active
  const selectableStudents = useMemo(() => {
    const list = meta?.students || [];
    if (!filters.classId) return list;
    return list.filter((s) => s.class_id === filters.classId);
  }, [meta?.students, filters.classId]);

  // Filtered exams list when classId is active
  const selectableExams = useMemo(() => {
    const list = meta?.examinations || [];
    if (!filters.classId) return list;
    return list.filter((e) => e.class_id === filters.classId);
  }, [meta?.examinations, filters.classId]);

  // Load Main Report Dashboard (Part 1)
  useEffect(() => {
    if (activeCategory !== 'dashboard' || metaLoading) return;
    let cancelled = false;
    setDashboardLoading(true);
    setDashboardError('');
    const qs = new URLSearchParams();
    if (filters.sessionId) qs.set('sessionId', filters.sessionId);
    if (filters.calendarYear) qs.set('calendarYear', filters.calendarYear);
    if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) qs.set('dateTo', filters.dateTo);
    if (filters.classId) qs.set('classId', filters.classId);

    apiRequest<ReportsDashboardData>(`/api/reports-erp/dashboard?${qs.toString()}`)
      .then((res) => {
        if (!cancelled) setDashboardData(res);
      })
      .catch((err: any) => {
        if (!cancelled) setDashboardError(err?.message || 'Failed to load dashboard statistics.');
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeCategory,
    metaLoading,
    filters.sessionId,
    filters.calendarYear,
    filters.dateFrom,
    filters.dateTo,
    filters.classId,
    refreshTick,
  ]);

  // Load One-Click Complete Annual Report (Part 6)
  useEffect(() => {
    if (activeCategory !== 'annual_complete' || metaLoading) return;
    let cancelled = false;
    setAnnualLoading(true);
    setAnnualError('');
    const qs = new URLSearchParams();
    if (filters.sessionId) qs.set('sessionId', filters.sessionId);
    if (filters.calendarYear) qs.set('calendarYear', filters.calendarYear);

    apiRequest<AnnualCompletePayload>(`/api/reports-erp/annual-complete?${qs.toString()}`)
      .then((res) => {
        if (!cancelled) setAnnualData(res);
      })
      .catch((err: any) => {
        if (!cancelled) setAnnualError(err?.message || 'Failed to generate complete annual report.');
      })
      .finally(() => {
        if (!cancelled) setAnnualLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, metaLoading, filters.sessionId, filters.calendarYear, refreshTick]);

  // Load Dataset Reports (Parts 2, 3, 4, 5, 7, 8, 9, 10, 11)
  useEffect(() => {
    if (
      metaLoading ||
      activeCategory === 'dashboard' ||
      activeCategory === 'annual_complete' ||
      activeCategory === 'comparison' ||
      !currentReportDef ||
      currentReportDef.viewMode === 'student_dossier'
    ) {
      return;
    }

    const seq = ++activeReqSeq.current;
    setDatasetLoading(true);
    setDatasetError('');

    const qs = new URLSearchParams();
    qs.set('reportId', currentReportDef.id);

    // Smart temporal window selection based on report granularity
    if (filters.dateFrom || filters.dateTo) {
      if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) qs.set('dateTo', filters.dateTo);
      if (filters.sessionId) qs.set('sessionId', filters.sessionId);
    } else if (isDailyReport(activeCategory, currentReportDef.id)) {
      qs.set('date', filters.date || getTodayIso());
      if (filters.sessionId) qs.set('sessionId', filters.sessionId);
    } else if (isWeeklyReport(activeCategory, currentReportDef.id)) {
      qs.set('weekStart', filters.weekStart || getCurrentWeekMondayIso());
      if (filters.sessionId) qs.set('sessionId', filters.sessionId);
    } else if (isMonthlyReport(activeCategory, currentReportDef.id)) {
      qs.set('month', filters.month || getCurrentMonthIso());
      if (filters.sessionId) qs.set('sessionId', filters.sessionId);
    } else {
      if (filters.sessionId) qs.set('sessionId', filters.sessionId);
      if (filters.calendarYear) qs.set('calendarYear', filters.calendarYear);
    }

    // Entity filters
    if (filters.classId) qs.set('classId', filters.classId);
    if (filters.studentId) qs.set('studentId', filters.studentId);
    if (debouncedAdmissionNo) qs.set('admissionNo', debouncedAdmissionNo);
    if (filters.examId) qs.set('examId', filters.examId);
    if (filters.subjectId) qs.set('subjectId', filters.subjectId);
    if (filters.teacherId) qs.set('teacherId', filters.teacherId);
    if (filters.studentStatus) qs.set('studentStatus', filters.studentStatus);
    if (filters.resultStatus) qs.set('resultStatus', filters.resultStatus);
    if (filters.lowAttendanceThreshold) {
      qs.set('lowAttendanceThreshold', filters.lowAttendanceThreshold);
    }

    apiRequest<ReportDatasetResponse>(`/api/reports-erp/dataset?${qs.toString()}`)
      .then((res) => {
        if (seq === activeReqSeq.current) setDataset(res);
      })
      .catch((err: any) => {
        if (seq === activeReqSeq.current) {
          setDataset(null);
          setDatasetError(err?.message || 'Failed to fetch report records.');
        }
      })
      .finally(() => {
        if (seq === activeReqSeq.current) setDatasetLoading(false);
      });
  }, [
    activeCategory,
    currentReportDef,
    metaLoading,
    filters.sessionId,
    filters.calendarYear,
    filters.month,
    filters.date,
    filters.weekStart,
    filters.dateFrom,
    filters.dateTo,
    filters.classId,
    filters.studentId,
    debouncedAdmissionNo,
    filters.examId,
    filters.subjectId,
    filters.teacherId,
    filters.studentStatus,
    filters.resultStatus,
    filters.lowAttendanceThreshold,
    refreshTick,
  ]);

  const showDailyPicker = currentReportDef ? isDailyReport(activeCategory, currentReportDef.id) : false;
  const showWeeklyPicker = currentReportDef ? isWeeklyReport(activeCategory, currentReportDef.id) : false;
  const showMonthlyPicker = currentReportDef ? isMonthlyReport(activeCategory, currentReportDef.id) : false;
  const showFilterStrip =
    activeCategory !== 'comparison' &&
    !(activeCategory === 'students' && currentReportDef?.viewMode === 'student_dossier');

  const isTeacherScoped = meta?.capabilities?.isTeacherScoped || user?.role_slug === 'teacher';

  const ActiveCategoryIcon =
    CATEGORY_ICONS[currentCategoryConfig?.id || 'dashboard'] || LayoutDashboard;

  const currentReportIdx = useMemo(() => {
    if (!currentCategoryConfig || !currentReportDef) return 0;
    const idx = currentCategoryConfig.reports.findIndex((r) => r.id === currentReportDef.id);
    return idx >= 0 ? idx : 0;
  }, [currentCategoryConfig, currentReportDef]);

  const filteredSubReports = useMemo(() => {
    const list = currentCategoryConfig?.reports || [];
    const q = subReportSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }, [currentCategoryConfig, subReportSearch]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Top Executive ERP Header (Compact App Header on Phone, Full Executive Bar on Desktop) */}
      <div className="bg-white rounded-xl border border-neutral-200 p-3 sm:p-4 lg:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center sm:items-start gap-2.5 sm:gap-3 min-w-0">
            {/* Phone & Tablet 3-Line Report Modules Menu Trigger (inside Reports) */}
            <button
              type="button"
              onClick={() => setMobileModulesOpen(true)}
              aria-label="Open Report Modules menu"
              className="lg:hidden min-w-[38px] min-h-[38px] rounded-xl border border-neutral-200 bg-neutral-50 text-[#171717] hover:bg-neutral-100 active:scale-95 transition-transform flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-red-50 border border-red-100 text-[#DC1726] items-center justify-center shrink-0">
              <FileBarChart className="w-5 h-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h1 className="text-base sm:text-lg lg:text-xl font-bold text-neutral-900 tracking-tight truncate">
                  Reports &amp; Analytics ERP
                </h1>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold ${
                    isTeacherScoped ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                  {isTeacherScoped ? 'Assigned Classes Scope' : 'Full Institutional Scope'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-neutral-500 mt-0.5 line-clamp-1 sm:line-clamp-none">
                {settings?.name || 'Madrasa Gausiya Razvia'} — Live institutional records, multi-period analytics &amp; official A4 PDF / Excel / CSV reporting
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Global Academic Year Selector */}
            <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 sm:py-2 flex-1 sm:flex-none min-w-0">
              <CalendarClock className="w-3.5 h-3.5 text-[#DC1726] shrink-0" />
              <span className="text-[11px] font-semibold text-neutral-500 hidden sm:inline">
                Academic Year:
              </span>
              <select
                value={filters.sessionId}
                onChange={(e) => updateFilter('sessionId', e.target.value)}
                disabled={metaLoading}
                aria-label="Academic Year"
                className="bg-transparent text-xs font-bold text-neutral-900 focus:outline-none cursor-pointer pr-1 w-full sm:w-auto truncate"
              >
                <option value="all">All Academic Years</option>
                {(meta?.sessions || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_active ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
              title="Refresh live database metrics"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectCategory('annual_complete')}
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-[#B81220] transition-colors shadow-xs cursor-pointer w-full sm:w-auto"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Generate Complete Annual Report</span>
            </button>
          </div>
        </div>
      </div>

      {metaError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-[#DC1726]">
          {metaError}
        </div>
      )}

      {/* Mobile & Tablet Active Module Bar with Quick 3-Line Menu Trigger (< lg) */}
      <div className="lg:hidden bg-white rounded-xl border border-neutral-200 px-3 py-2.5 shadow-xs flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMobileModulesOpen(true)}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-start cursor-pointer"
        >
          <span className="w-8 h-8 rounded-lg bg-[#DC1726] text-white flex items-center justify-center shrink-0">
            <ActiveCategoryIcon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 leading-none">
              Report Module ({visibleCategories.length})
            </div>
            <div className="text-xs font-bold text-neutral-900 truncate mt-0.5">
              {currentCategoryConfig?.label || 'Reports Dashboard'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMobileModulesOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-bold text-neutral-800 hover:bg-neutral-100 shrink-0 cursor-pointer"
        >
          <Menu className="w-3.5 h-3.5 text-[#DC1726]" />
          <span>Modules</span>
        </button>
      </div>

      {/* Slide-Over Drawer for All 15 Report Modules on Phone & Tablet (< lg) */}
      {mobileModulesOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setMobileModulesOpen(false)}
          />
          <div className="relative z-10 w-[84vw] max-w-[310px] h-full bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3.5 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#DC1726]">
                  Report Modules ({visibleCategories.length})
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Select a reporting department
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileModulesOpen(false)}
                className="p-2 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900"
                aria-label="Close report modules menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2.5 space-y-1">
              {visibleCategories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.id];
                const isActive = cat.id === activeCategory;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategory(cat.id)}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#DC1726] text-white shadow-xs'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-white' : 'text-neutral-400'
                        }`}
                      />
                      <span className="truncate">{cat.label}</span>
                    </span>
                    {cat.reports.length > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums shrink-0 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {cat.reports.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main ERP Two-Column Layout: 15-Category Left Sidebar (lg+) + Workspace */}
      <div className="flex flex-col lg:flex-row items-start gap-4">
        {/* Desktop 15-Category ERP Report Sidebar */}
        <aside className="hidden lg:block w-60 xl:w-64 shrink-0 sticky top-4 bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
          <div className="px-3.5 py-3 border-b border-neutral-100 bg-neutral-50/70">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Report Modules ({visibleCategories.length})
            </p>
          </div>
          <nav className="p-2 space-y-0.5 max-h-[calc(100vh-180px)] overflow-y-auto">
            {visibleCategories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.id];
              const isActive = cat.id === activeCategory;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left text-xs font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#DC1726] text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-white' : 'text-neutral-400'
                      }`}
                    />
                    <span className="truncate">{cat.label}</span>
                  </span>
                  {cat.reports.length > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {cat.reports.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Workspace Column */}
        <div className="flex-1 min-w-0 w-full space-y-3 sm:space-y-4">
          {/* Executive Sub-Report Selector Bar (Clean, Non-Cluttered on Phone & Window) */}
          {currentCategoryConfig && currentCategoryConfig.reports.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 p-3 sm:p-4 shadow-xs space-y-2.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-neutral-500">
                    <span className="text-[#DC1726] font-bold">{currentCategoryConfig.label}</span>
                    <span>·</span>
                    <span className="font-mono-num">
                      Report {currentReportIdx + 1} of {currentCategoryConfig.reports.length}
                    </span>
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-neutral-900 truncate mt-0.5">
                    {currentReportDef?.label || currentCategoryConfig.label}
                  </h2>
                  {currentReportDef?.description && (
                    <p className="text-[11px] sm:text-xs text-neutral-500 mt-0.5 line-clamp-1">
                      {currentReportDef.description}
                    </p>
                  )}
                </div>

                {/* Clean Controls: Prev / Next + Quick Select + Browse All Modal Button */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 w-full md:w-auto">
                  <div className="inline-flex items-center rounded-lg border border-neutral-200 bg-white overflow-hidden shrink-0">
                    <button
                      type="button"
                      disabled={currentReportIdx <= 0}
                      onClick={() => {
                        const prev = currentCategoryConfig.reports[currentReportIdx - 1];
                        if (prev) setActiveReportId(prev.id);
                      }}
                      title="Previous Report"
                      className="p-2 text-neutral-700 hover:bg-neutral-50 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={currentReportIdx >= currentCategoryConfig.reports.length - 1}
                      onClick={() => {
                        const next = currentCategoryConfig.reports[currentReportIdx + 1];
                        if (next) setActiveReportId(next.id);
                      }}
                      title="Next Report"
                      className="p-2 border-s border-neutral-200 text-neutral-700 hover:bg-neutral-50 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <select
                    value={currentReportDef?.id || ''}
                    onChange={(e) => setActiveReportId(e.target.value)}
                    aria-label="Select Sub-Report"
                    className="flex-1 md:w-56 lg:w-64 min-w-0 px-2.5 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-800 focus:outline-none focus:border-[#DC1726] truncate cursor-pointer"
                  >
                    {currentCategoryConfig.reports.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setSubReportSearch('');
                      setSubReportPickerOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shrink-0 cursor-pointer"
                    title={`Browse all ${currentCategoryConfig.reports.length} ${currentCategoryConfig.label}`}
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    <span>All ({currentCategoryConfig.reports.length})</span>
                  </button>
                </div>
              </div>

              {/* Clean Single-Row Scrollable Quick Switcher Strip (md+ only, no multi-row clutter) */}
              <div className="hidden md:flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-neutral-100">
                {currentCategoryConfig.reports.map((rep) => {
                  const active = rep.id === currentReportDef?.id;
                  return (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => setActiveReportId(rep.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                        active
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200/80 hover:bg-neutral-100'
                      }`}
                    >
                      {rep.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Searchable Sub-Report Directory Modal / Sheet (Works seamlessly on Phone & Desktop) */}
          {subReportPickerOpen && currentCategoryConfig && (
            <div
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSubReportPickerOpen(false);
              }}
            >
              <div className="w-full sm:max-w-2xl max-h-[85vh] bg-white rounded-t-2xl sm:rounded-2xl border border-neutral-200 shadow-2xl flex flex-col overflow-hidden">
                <div className="px-4 py-3.5 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">
                      {currentCategoryConfig.label} ({currentCategoryConfig.reports.length})
                    </h3>
                    <p className="text-[11px] text-neutral-500">
                      Search or pick any report below to load live database records
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubReportPickerOpen(false)}
                    className="p-2 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900 cursor-pointer"
                    aria-label="Close report picker"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 border-b border-neutral-100">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={subReportSearch}
                      onChange={(e) => setSubReportSearch(e.target.value)}
                      placeholder={`Search ${currentCategoryConfig.reports.length} ${currentCategoryConfig.label.toLowerCase()}...`}
                      className="w-full ps-8 pe-3 py-2 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredSubReports.length === 0 ? (
                    <div className="sm:col-span-2 py-8 text-center text-xs text-neutral-500">
                      No matching reports found.
                    </div>
                  ) : (
                    filteredSubReports.map((rep) => {
                      const active = rep.id === currentReportDef?.id;
                      return (
                        <button
                          key={rep.id}
                          type="button"
                          onClick={() => {
                            setActiveReportId(rep.id);
                            setSubReportPickerOpen(false);
                          }}
                          className={`p-3 rounded-xl border text-start transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                            active
                              ? 'bg-red-50/70 border-[#DC1726] text-neutral-900'
                              : 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div
                              className={`text-xs font-bold leading-snug ${
                                active ? 'text-[#DC1726]' : 'text-neutral-900'
                              }`}
                            >
                              {rep.label}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">
                              {rep.description}
                            </div>
                          </div>
                          {active && (
                            <span className="w-5 h-5 rounded-full bg-[#DC1726] text-white flex items-center justify-center shrink-0 mt-0.5">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Contextual + Full 14-Field Advanced Filter Panel (Part 13) */}
          {showFilterStrip && (
            <div className="bg-white rounded-xl border border-neutral-200 p-3.5 sm:p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-end gap-2.5">
                {/* Contextual Temporal Controls */}
                {showDailyPicker && (
                  <div className="min-w-[145px]">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={filters.date}
                      onChange={(e) => updateFilter('date', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>
                )}

                {showWeeklyPicker && (
                  <div className="min-w-[155px]">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Week Starting
                    </label>
                    <input
                      type="date"
                      value={filters.weekStart}
                      onChange={(e) => updateFilter('weekStart', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>
                )}

                {showMonthlyPicker && (
                  <div className="min-w-[155px]">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Select Month
                    </label>
                    <input
                      type="month"
                      value={filters.month}
                      onChange={(e) => updateFilter('month', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>
                )}

                {(activeCategory === 'yearly' ||
                  activeCategory === 'historical' ||
                  activeCategory === 'annual_complete') && (
                  <div className="min-w-[135px]">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Calendar Year
                    </label>
                    <select
                      value={filters.calendarYear}
                      onChange={(e) => updateFilter('calendarYear', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">Use Academic Session</option>
                      {(meta?.calendarYears || []).map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Quick Class Filter (almost universally useful) */}
                {activeCategory !== 'annual_complete' && (
                  <div className="min-w-[145px] flex-1 sm:flex-none sm:w-44">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Class
                    </label>
                    <select
                      value={filters.classId}
                      onChange={(e) => updateFilter('classId', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Classes</option>
                      {(meta?.classes || []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Quick Exam Filter on Examinations / Results */}
                {(activeCategory === 'examinations' || activeCategory === 'results') && (
                  <div className="min-w-[160px] flex-1 sm:flex-none sm:w-48">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Examination
                    </label>
                    <select
                      value={filters.examId}
                      onChange={(e) => updateFilter('examId', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Examinations</option>
                      {selectableExams.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Quick Teacher Filter on Teachers */}
                {activeCategory === 'teachers' && (
                  <div className="min-w-[160px] flex-1 sm:flex-none sm:w-48">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Teacher
                    </label>
                    <select
                      value={filters.teacherId}
                      onChange={(e) => updateFilter('teacherId', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Teachers</option>
                      {(meta?.teachers || []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} ({t.teacher_code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Low Attendance Threshold when on Low Attendance report */}
                {currentReportDef?.id === 'att_low_attendance' && (
                  <div className="w-32">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Threshold (%)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={99}
                      value={filters.lowAttendanceThreshold}
                      onChange={(e) => updateFilter('lowAttendanceThreshold', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>
                )}

                {/* Advanced Filters Drawer Toggle + Reset Button */}
                <div className="flex items-center gap-2 ml-auto">
                  {activeCategory !== 'annual_complete' && (
                    <button
                      type="button"
                      onClick={() => setShowAdvancedFilters((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        showAdvancedFilters || activeExtraFilterCount > 0
                          ? 'bg-red-50 border-red-200 text-[#DC1726]'
                          : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      Advanced Filters
                      {activeExtraFilterCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-[#DC1726] text-white text-[10px] font-bold">
                          {activeExtraFilterCount}
                        </span>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
                    title="Reset all active filters"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                </div>
              </div>

              {/* Expanded Complete 14-Field Filter Matrix (Part 13) */}
              {showAdvancedFilters && activeCategory !== 'annual_complete' && (
                <div className="pt-3 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Calendar Year Override
                    </label>
                    <select
                      value={filters.calendarYear}
                      onChange={(e) => updateFilter('calendarYear', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">None (Use Academic Year)</option>
                      {(meta?.calendarYears || []).map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Custom Date From
                    </label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => updateFilter('dateFrom', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Custom Date To
                    </label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => updateFilter('dateTo', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Admission Number
                    </label>
                    <input
                      type="text"
                      value={filters.admissionNo}
                      onChange={(e) => updateFilter('admissionNo', e.target.value)}
                      placeholder="e.g. ADM-2026-001"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Student
                    </label>
                    <select
                      value={filters.studentId}
                      onChange={(e) => updateFilter('studentId', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Students</option>
                      {selectableStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.admission_no || s.student_code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Examination
                    </label>
                    <select
                      value={filters.examId}
                      onChange={(e) => updateFilter('examId', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Examinations</option>
                      {selectableExams.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Subject
                    </label>
                    <select
                      value={filters.subjectId}
                      onChange={(e) => updateFilter('subjectId', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Subjects</option>
                      {(meta?.subjects || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Teacher
                    </label>
                    <select
                      value={filters.teacherId}
                      onChange={(e) => updateFilter('teacherId', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Teachers</option>
                      {(meta?.teachers || []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Student Status
                    </label>
                    <select
                      value={filters.studentStatus}
                      onChange={(e) => updateFilter('studentStatus', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="disabled">Disabled</option>
                      <option value="transferred">Transferred</option>
                      <option value="graduated">Graduated</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Result Status
                    </label>
                    <select
                      value={filters.resultStatus}
                      onChange={(e) => updateFilter('resultStatus', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    >
                      <option value="">All Results</option>
                      <option value="pass">Pass Only</option>
                      <option value="fail">Fail Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      Low Attendance Alert (%)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={99}
                      value={filters.lowAttendanceThreshold}
                      onChange={(e) => updateFilter('lowAttendanceThreshold', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs text-neutral-800 bg-white focus:outline-none focus:border-[#DC1726]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Module View */}
          {activeCategory === 'dashboard' ? (
            dashboardError ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
                {dashboardError}
              </div>
            ) : (
              <ReportsDashboardView
                data={dashboardData}
                loading={dashboardLoading || metaLoading}
                onJumpCategory={handleSelectCategory}
              />
            )
          ) : activeCategory === 'annual_complete' ? (
            <AnnualCompleteReportView
              annual={annualData}
              loading={annualLoading || metaLoading}
              error={annualError}
              settings={settings}
              onRegenerate={() => setRefreshTick((t) => t + 1)}
            />
          ) : activeCategory === 'comparison' ? (
            <ComparisonAnalyticsView meta={meta} settings={settings} />
          ) : activeCategory === 'students' && currentReportDef?.viewMode === 'student_dossier' ? (
            <StudentDossierView
              meta={meta}
              settings={settings}
              initialStudentId={filters.studentId}
            />
          ) : (
            <ReportDataTable
              dataset={dataset}
              loading={datasetLoading || metaLoading}
              error={datasetError}
              settings={settings}
            />
          )}
        </div>
      </div>
    </div>
  );
};
