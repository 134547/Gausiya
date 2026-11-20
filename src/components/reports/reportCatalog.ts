export type ReportCategoryId =
  | 'dashboard'
  | 'students'
  | 'classes'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'annual_complete'
  | 'examinations'
  | 'results'
  | 'attendance'
  | 'teachers'
  | 'financial'
  | 'historical'
  | 'comparison';

export interface ReportDefinition {
  id: string;
  label: string;
  description: string;
  viewMode?: 'table' | 'student_dossier';
}

export interface ReportCategoryConfig {
  id: ReportCategoryId;
  label: string;
  shortLabel: string;
  reports: ReportDefinition[];
}

export interface ReportMetaData {
  sessions: { id: string; name: string; start_date: string; end_date: string; is_active: boolean }[];
  activeSessionId: string;
  calendarYears: string[];
  classes: { id: string; name: string; code: string; room_no?: string }[];
  subjects: { id: string; name: string; code: string }[];
  teachers: { id: string; teacher_code: string; full_name: string }[];
  examinations: {
    id: string;
    name: string;
    exam_type: string;
    class_id: string;
    start_date: string;
    academic_session_id: string | null;
  }[];
  students: {
    id: string;
    student_code: string;
    admission_no: string;
    full_name: string;
    father_name: string;
    class_id: string;
    status: string;
  }[];
  capabilities: {
    tuitionFeeModuleEnabled: boolean;
    programPaymentsCount: number;
    canViewAdminLogs: boolean;
    canViewFinance: boolean;
    isTeacherScoped: boolean;
  };
}

export const REPORT_CATEGORIES: ReportCategoryConfig[] = [
  {
    id: 'dashboard',
    label: 'Reports Dashboard',
    shortLabel: 'Dashboard',
    reports: [],
  },
  {
    id: 'students',
    label: 'Student Reports',
    shortLabel: 'Students',
    reports: [
      { id: 'individual_student_dossier', label: 'Individual Student Complete Report (By Admission No)', description: 'Full student profile, attendance, exams, subject marks, rank & promotions', viewMode: 'student_dossier' },
      { id: 'complete_student_list', label: '1. Complete Student List', description: 'All enrolled students with class, contact, and status' },
      { id: 'active_students', label: '2. Active Students', description: 'Currently active enrolled students' },
      { id: 'inactive_students', label: '3. Inactive Students', description: 'Inactive, disabled, transferred, or pending students' },
      { id: 'class_wise_students', label: '4. Class-wise Students', description: 'Students organized cleanly by class' },
      { id: 'admission_wise_students', label: '5. Admission-wise Students', description: 'Students sorted by admission date and number' },
      { id: 'new_admissions', label: '6. New Admissions', description: 'Admission register for the selected period' },
      { id: 'monthly_admissions', label: '7. Monthly Admissions', description: 'Month-by-month admission intake summary' },
      { id: 'yearly_admissions', label: '8. Yearly Admissions', description: 'Annual student admissions register' },
      { id: 'student_attendance', label: '9. Student Attendance', description: 'Present, late, absent, leave totals per student' },
      { id: 'student_performance', label: '10. Student Performance', description: 'Academic percentage, grade, and rank performance' },
      { id: 'student_exam_history', label: '11. Student Examination History', description: 'Complete record of examinations taken by students' },
      { id: 'student_result_history', label: '12. Student Result History', description: 'Historical examination result ledger' },
      { id: 'student_pass_fail', label: '13. Student Pass / Fail Report', description: 'Pass and fail breakdown across students' },
      { id: 'student_promotion', label: '14. Student Promotion Report', description: 'Promotions, class transfers, and session upgrades' },
      { id: 'student_leaving', label: '15. Student Leaving / Transfer Report', description: 'Transferred, graduated, and exited student records' },
      { id: 'student_academic_history', label: '16. Student Academic History', description: 'Combined exams, attendance %, and promotion summary' },
      { id: 'student_subject_performance', label: '17. Student-wise Subject Performance', description: 'Detailed subject-level marks obtained per student' },
      { id: 'student_attendance_percentage', label: '18. Student-wise Attendance Percentage', description: 'Exact working days and attendance % per student' },
      { id: 'student_rank_merit', label: '19. Student Rank & Merit Report', description: 'Merit-ordered list of passing students' },
    ],
  },
  {
    id: 'classes',
    label: 'Class Reports',
    shortLabel: 'Classes',
    reports: [
      { id: 'class_complete', label: 'Complete Class Report', description: 'Strength, teacher, attendance %, exams & pass rate per class' },
      { id: 'class_student_list', label: 'Class-wise Student List', description: 'Full student roster for selected class' },
      { id: 'class_strength', label: 'Class Strength Report', description: 'Active vs inactive headcount across classes' },
      { id: 'class_attendance', label: 'Class Attendance Report', description: 'Attendance summary broken down by class' },
      { id: 'class_daily', label: 'Daily Class Report', description: 'Daily class-level metrics for selected date' },
      { id: 'class_weekly', label: 'Weekly Class Report', description: 'Weekly class-level metrics for selected week' },
      { id: 'class_monthly', label: 'Monthly Class Report', description: 'Monthly class-level strength, attendance & results' },
      { id: 'class_yearly', label: 'Yearly Class Report', description: 'Full academic year performance by class' },
      { id: 'class_examinations', label: 'Class Examination Report', description: 'All examinations conducted for each class' },
      { id: 'class_results', label: 'Class Result Report', description: 'Detailed student results grouped by class' },
      { id: 'class_subject_wise', label: 'Class Subject-wise Report', description: 'Subject pass % and average score per class' },
      { id: 'class_pass_fail', label: 'Class Pass / Fail Report', description: 'Pass and fail counts and percentages' },
      { id: 'class_topper', label: 'Class Topper Report', description: 'Top 3 rank holders for each class & exam' },
      { id: 'class_merit_list', label: 'Class Merit List', description: 'Merit ranking for selected class' },
      { id: 'class_promotion', label: 'Class Promotion Report', description: 'Class-to-class promotion and transfer records' },
      { id: 'class_comparison', label: 'Class Performance Comparison', description: 'Side-by-side strength, attendance & pass % across classes' },
    ],
  },
  {
    id: 'daily',
    label: 'Daily Reports',
    shortLabel: 'Daily',
    reports: [
      { id: 'daily_overview', label: 'Daily Madarsa Overview', description: 'Complete daily snapshot for selected date' },
      { id: 'daily_attendance', label: 'Daily Student Attendance', description: 'Class-wise present, late, absent, leave totals' },
      { id: 'daily_admissions', label: 'Daily Student Admissions', description: 'Admission applications received on selected date' },
      { id: 'daily_class', label: 'Daily Class Report', description: 'Class-level attendance and status for date' },
      { id: 'daily_teacher_attendance', label: 'Daily Teacher Attendance', description: 'Faculty attendance log for selected date' },
      { id: 'daily_activities', label: 'Daily Activities Log', description: 'Programs, notices, and administrative actions' },
      { id: 'daily_fees', label: 'Daily Collection Report', description: 'Actual recorded program receipts for selected date' },
    ],
  },
  {
    id: 'weekly',
    label: 'Weekly Reports',
    shortLabel: 'Weekly',
    reports: [
      { id: 'weekly_overview', label: 'Weekly Madarsa Overview', description: '7-day consolidated operational summary' },
      { id: 'weekly_attendance', label: 'Weekly Attendance Report', description: 'Daily-by-class attendance across the selected week' },
      { id: 'weekly_class_performance', label: 'Weekly Class Performance', description: 'Class strength, attendance & exam metrics for week' },
      { id: 'weekly_admissions', label: 'Weekly Admissions Report', description: 'New admissions submitted during the week' },
      { id: 'weekly_activities', label: 'Weekly Activities Report', description: 'Programs, notices, and portal logs for week' },
      { id: 'weekly_attendance_comparison', label: 'Weekly Attendance Comparison', description: 'Day-by-day attendance comparison chart & table' },
    ],
  },
  {
    id: 'monthly',
    label: 'Monthly Reports',
    shortLabel: 'Monthly',
    reports: [
      { id: 'monthly_complete', label: 'Monthly Complete Madarsa Report', description: 'Comprehensive monthly report with Previous Month comparison' },
      { id: 'monthly_students', label: 'Monthly Student Report', description: 'Student roster active during selected month' },
      { id: 'monthly_admissions', label: 'Monthly Admission Report', description: 'Admissions recorded during selected month' },
      { id: 'monthly_attendance', label: 'Monthly Attendance Report', description: 'Monthly class-wise attendance breakdown' },
      { id: 'monthly_class', label: 'Monthly Class Report', description: 'Class performance summary for the month' },
      { id: 'monthly_teachers', label: 'Monthly Teacher Report', description: 'Faculty status and monthly attendance' },
      { id: 'monthly_examinations', label: 'Monthly Examination Report', description: 'Examinations conducted in selected month' },
      { id: 'monthly_results', label: 'Monthly Result Report', description: 'Examination results issued in selected month' },
      { id: 'monthly_pass_fail', label: 'Monthly Pass / Fail Report', description: 'Monthly pass and fail distribution' },
      { id: 'monthly_fees', label: 'Monthly Collection Report', description: 'Actual program receipts for selected month' },
      { id: 'monthly_activities', label: 'Monthly Activities Report', description: 'Programs, notices & audit activity for month' },
    ],
  },
  {
    id: 'yearly',
    label: 'Yearly Reports',
    shortLabel: 'Yearly',
    reports: [
      { id: 'annual_madarsa', label: '1. Annual Madarsa Report (12-Month Breakdown)', description: 'Month-by-month admissions, attendance, exams & pass rates' },
      { id: 'annual_students', label: '2. Annual Student Report', description: 'All students for the selected academic year' },
      { id: 'annual_classes', label: '3. Annual Class Report', description: 'Complete class strength & academic outcomes' },
      { id: 'annual_teachers', label: '4. Annual Teacher Report', description: 'Annual faculty roster, assignments & attendance' },
      { id: 'annual_attendance', label: '5. Annual Attendance Report', description: 'Monthly & class-wise annual attendance logs' },
      { id: 'annual_admissions', label: '6. Annual Admission Report', description: 'Full-year admissions register' },
      { id: 'annual_examinations', label: '7. Annual Examination Report', description: 'All examinations conducted in academic year' },
      { id: 'annual_results', label: '8. Annual Result Report', description: 'Consolidated annual examination results' },
      { id: 'annual_pass_fail', label: '9. Annual Pass / Fail Report', description: 'Full-year pass/fail ratio and statistics' },
      { id: 'annual_merit_list', label: '10. Annual Merit List', description: 'Ranked merit list of passing students' },
      { id: 'annual_toppers', label: '11. Annual Topper Report', description: 'Class & examination toppers for the year' },
      { id: 'annual_promotions', label: '12. Annual Promotion Report', description: 'Session-end student promotions and transfers' },
      { id: 'annual_subject_performance', label: '13. Annual Subject Performance', description: 'Subject pass % and average score for the year' },
      { id: 'annual_fees', label: '14. Annual Financial Report', description: 'Actual recorded program collections for the year' },
      { id: 'annual_activities', label: '15. Annual Activities Report', description: 'Annual events, notices & operational log' },
      { id: 'annual_academic_performance', label: '16. Annual Academic Performance', description: 'Exam-wise pass rate, average, highest & lowest scores' },
      { id: 'annual_growth', label: '17. Annual Growth Report', description: '12-month growth trend analysis across key metrics' },
      { id: 'annual_administrative', label: '18. Annual Administrative Report', description: 'Executive institutional metrics & operational summary' },
    ],
  },
  {
    id: 'annual_complete',
    label: 'Annual Madarsa Report',
    shortLabel: 'Annual Book',
    reports: [],
  },
  {
    id: 'examinations',
    label: 'Examination Reports',
    shortLabel: 'Exams',
    reports: [
      { id: 'exam_complete_list', label: 'Complete Examination List', description: 'All examinations with status, publication & pass rate' },
      { id: 'exam_wise', label: 'Examination-wise Report', description: 'Detailed performance for selected examination' },
      { id: 'exam_class_wise', label: 'Class-wise Examination Report', description: 'Examinations filtered by class' },
      { id: 'exam_subject_wise', label: 'Subject-wise Examination Report', description: 'Subject pass rate, highest & lowest marks' },
      { id: 'exam_comparison', label: 'Examination Comparison', description: 'Compare pass rate & averages across examinations' },
      { id: 'exam_year_comparison', label: 'Previous Year vs Current Year Results', description: 'Multi-year examination performance comparison' },
    ],
  },
  {
    id: 'results',
    label: 'Result Reports',
    shortLabel: 'Results',
    reports: [
      { id: 'exam_student_marks', label: 'Student-wise Marks Report', description: 'All student results with marks, percentage & grade' },
      { id: 'exam_highest_marks', label: 'Highest Marks Report', description: 'Top scorers in each examination and class' },
      { id: 'exam_lowest_marks', label: 'Lowest Marks Report', description: 'Lowest recorded scores needing academic attention' },
      { id: 'exam_toppers', label: 'Topper List', description: 'Top 3 rank holders per class and exam' },
      { id: 'exam_merit_list', label: 'Merit List', description: 'Ranked merit list of all passing students' },
      { id: 'exam_pass_students', label: 'Pass Students Report', description: 'All students who passed examinations' },
      { id: 'exam_fail_students', label: 'Fail Students Report', description: 'All students who failed examinations' },
      { id: 'exam_grade_wise', label: 'Grade-wise Distribution', description: 'Student count and share by official grade' },
      { id: 'exam_class_pass_pct', label: 'Class-wise Pass Percentage', description: 'Pass rate comparison across classes' },
      { id: 'exam_subject_pass_pct', label: 'Subject-wise Pass Percentage', description: 'Pass rate comparison across subjects' },
      { id: 'exam_overall_result', label: 'Overall Result Summary', description: 'Complete institutional exam result breakdown' },
    ],
  },
  {
    id: 'attendance',
    label: 'Attendance Reports',
    shortLabel: 'Attendance',
    reports: [
      { id: 'att_daily', label: 'Daily Attendance', description: 'Date-wise attendance records' },
      { id: 'att_weekly', label: 'Weekly Attendance', description: '7-day attendance summary' },
      { id: 'att_monthly', label: 'Monthly Attendance', description: 'Month-by-month class attendance summary' },
      { id: 'att_annual', label: 'Annual Attendance', description: 'Full-year attendance ledger' },
      { id: 'att_student_wise', label: 'Student-wise Attendance', description: 'Working days, present, late, absent, leave per student' },
      { id: 'att_class_wise', label: 'Class-wise Attendance', description: 'Class-level attendance totals and percentages' },
      { id: 'att_teacher', label: 'Teacher Attendance', description: 'Faculty attendance records' },
      { id: 'att_present', label: 'Present Students Log', description: 'Detailed present & late attendance register' },
      { id: 'att_absent', label: 'Absent Students Log', description: 'Detailed absentee register for follow-up' },
      { id: 'att_percentage', label: 'Attendance Percentage Report', description: 'Exact attendance percentage by student' },
      { id: 'att_low_attendance', label: 'Low Attendance Students', description: 'Students below configurable attendance threshold' },
      { id: 'att_monthly_comparison', label: 'Monthly Attendance Comparison', description: 'Month-to-month attendance trend' },
      { id: 'att_annual_comparison', label: 'Annual Attendance Comparison', description: 'Academic year-over-year attendance comparison' },
    ],
  },
  {
    id: 'teachers',
    label: 'Teacher Reports',
    shortLabel: 'Teachers',
    reports: [
      { id: 'teacher_complete', label: 'Complete Teacher List', description: 'All faculty members with qualification and contact' },
      { id: 'teacher_details', label: 'Teacher-wise Details', description: 'Comprehensive faculty directory' },
      { id: 'teacher_assignments', label: 'Teacher-wise Class Assignment', description: 'Assigned classes and subjects per teacher' },
      { id: 'teacher_attendance', label: 'Teacher Attendance', description: 'Recorded faculty attendance entries' },
      { id: 'teacher_monthly', label: 'Monthly Teacher Report', description: 'Monthly teacher attendance and roster' },
      { id: 'teacher_annual', label: 'Annual Teacher Report', description: 'Full-year teacher summary' },
      { id: 'teacher_performance', label: 'Teacher Activity & Class Outcomes', description: 'Homework assigned, attendance % & assigned class pass rate' },
      { id: 'teacher_student_strength', label: 'Teacher-wise Student Strength', description: 'Total & active students under each teacher' },
    ],
  },
  {
    id: 'financial',
    label: 'Financial Reports',
    shortLabel: 'Finance',
    reports: [
      { id: 'fin_summary', label: 'Financial Summary (Actual DB Records)', description: 'Verified program registration collections & module status' },
      { id: 'fin_daily', label: 'Daily Collection', description: 'Program receipts recorded on selected date' },
      { id: 'fin_weekly', label: 'Weekly Collection', description: 'Program receipts recorded during selected week' },
      { id: 'fin_monthly', label: 'Monthly Collection', description: 'Program receipts recorded during selected month' },
      { id: 'fin_annual', label: 'Annual Collection', description: 'Program receipts recorded in selected academic year' },
      { id: 'fin_paid', label: 'Paid Receipts Log', description: 'All recorded paid registrations' },
      { id: 'fin_pending', label: 'Pending / Outstanding Fees Status', description: 'Tuition fee ledger availability & status' },
      { id: 'fin_monthly_comparison', label: 'Monthly Financial Comparison', description: 'Month-by-month recorded collection totals' },
    ],
  },
  {
    id: 'historical',
    label: 'Historical Reports',
    shortLabel: 'Historical',
    reports: [
      { id: 'hist_year_to_year', label: 'Year-to-Year Comparison (All Sessions)', description: 'Multi-session institutional comparison without mixing records' },
      { id: 'hist_students', label: 'Previous Year Student Records', description: 'Students strictly belonging to selected historical session' },
      { id: 'hist_classes', label: 'Previous Year Class Reports', description: 'Class strength & pass rates for selected historical year' },
      { id: 'hist_attendance', label: 'Previous Year Attendance', description: 'Archived attendance records for selected year' },
      { id: 'hist_results', label: 'Previous Year Results', description: 'Archived examination results for selected year' },
      { id: 'hist_admissions', label: 'Previous Year Admissions', description: 'Archived admission applications for selected year' },
      { id: 'hist_teachers', label: 'Previous Year Teacher Records', description: 'Faculty records for selected year' },
      { id: 'hist_financial', label: 'Previous Year Financial Records', description: 'Archived program collections for selected year' },
      { id: 'hist_student_academic_history', label: 'Student Academic History', description: 'Multi-exam student progression & promotions' },
      { id: 'hist_class_history', label: 'Class Performance History', description: 'Historical class academic outcomes' },
    ],
  },
  {
    id: 'comparison',
    label: 'Comparison & Analytics',
    shortLabel: 'Compare',
    reports: [],
  },
];
