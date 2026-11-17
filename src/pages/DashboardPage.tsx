import React, { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  BookMarked,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Phone,
  UserCheck,
  Users,
  UsersRound,
  Video,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { apiRequest } from '../lib/api.ts';
import { NavModuleId, User } from '../types.ts';
import { Language, translations } from '../i18n/translations.ts';

interface DashboardPageProps {
  user: User;
  lang: Language;
  onNavigate: (mod: NavModuleId) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, lang, onNavigate }) => {
  const t = translations[lang];
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyticsTab, setAnalyticsTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest('/api/dashboard')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-24 rounded-xl bg-white border border-neutral-200 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-white border border-neutral-200 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl bg-white border border-red-200 text-sm text-[#DC1726]">
        {error || 'Unable to load dashboard'}
      </div>
    );
  }

  // ==================== PARENT DASHBOARD ====================
  if (data.role === 'parent') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#171717]">Parent Portal Overview</h2>
            <p className="text-xs text-[#737373]">Session {data.activeSession} · Linked Children Progress</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('homework')}
            className="px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            View Homework
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data.children || []).map((child: any) => {
            const pct = child.total_days > 0 ? Math.round((child.present_days / child.total_days) * 100) : 0;
            return (
              <div key={child.id} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#450A0A] text-white flex items-center justify-center font-bold text-base">
                      {child.full_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#171717]">{child.full_name}</h3>
                      <p className="text-xs text-[#737373] font-mono-num">
                        {child.student_code} · {child.class_name || 'Unassigned'}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-lg font-bold text-[#10B981] font-mono-num">{pct}%</div>
                    <div className="text-[11px] text-[#737373]">Attendance</div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('attendance')}
                    className="text-xs font-medium text-[#0EA5E9] hover:underline"
                  >
                    Attendance History
                  </button>
                  <span className="text-neutral-300">·</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('results')}
                    className="text-xs font-medium text-[#DC1726] hover:underline"
                  >
                    View Marksheet
                  </button>
                </div>
              </div>
            );
          })}
          {(!data.children || data.children.length === 0) && (
            <div className="col-span-full bg-white rounded-xl border border-neutral-200 p-8 text-center text-sm text-[#737373]">
              No children linked to this parent account yet. Contact Madrasa office.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-[#171717] mb-3">Published Examination Results</h3>
            {(data.recentResults || []).length === 0 ? (
              <p className="text-xs text-[#737373] py-4">No published results available.</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {data.recentResults.map((r: any) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[#171717]">{r.student_name} — {r.exam_name}</div>
                      <div className="text-[#737373] font-mono-num">{r.obtained_marks}/{r.total_marks} ({r.percentage}%)</div>
                    </div>
                    <span className={`font-bold ${r.status === 'pass' ? 'text-[#10B981]' : 'text-[#DC1726]'}`}>
                      Grade {r.grade} · {r.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-[#171717] mb-3">Recent Notices</h3>
            {(data.notices || []).map((n: any) => (
              <div key={n.id} className="py-2.5 border-b last:border-0 border-neutral-100 flex items-center justify-between text-xs">
                <span className="font-medium text-[#171717]">{n.title}</span>
                <span className="text-[#737373] font-mono-num">{n.publish_date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ==================== STUDENT DASHBOARD ====================
  if (data.role === 'student') {
    const att = data.attendanceSummary || { percentage: 0, present: 0, absent: 0, late: 0, on_leave: 0, total: 0 };
    const st = data.student || {};
    const adm = data.admissionDetails || {};
    const fee = data.feeStatus || { status: 'Active Enrollment', note: '' };
    return (
      <div className="space-y-6">
        {/* Student Profile & Admission Details Header */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              {st.photo_url ? (
                <img
                  src={st.photo_url}
                  alt={st.full_name || user.full_name}
                  referrerPolicy="no-referrer"
                  className="w-16 h-20 rounded-xl object-cover border border-neutral-200 shrink-0"
                />
              ) : (
                <div className="w-16 h-20 rounded-xl bg-[#3B0A0D] text-white flex items-center justify-center font-bold text-2xl shrink-0">
                  {(st.full_name || user.full_name || 'S').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-[#171717]">{st.full_name || user.full_name}</h2>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-[#10B981] uppercase">
                    {adm.status || 'Approved'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-1 text-xs text-[#525252]">
                  <div>
                    <span className="text-[#737373]">Username:</span>{' '}
                    <strong className="font-mono-num text-[#0EA5E9]">@{st.username || user.username}</strong>
                  </div>
                  <div>
                    <span className="text-[#737373]">Admission No:</span>{' '}
                    <strong className="font-mono-num text-[#171717]">
                      {st.admission_no || adm.official_admission_no || st.student_code || '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#737373]">Class / Course:</span>{' '}
                    <strong className="text-[#171717]">{st.class_name || 'Unassigned'}</strong>
                  </div>
                  <div>
                    <span className="text-[#737373]">Father&apos;s Name:</span>{' '}
                    <strong className="text-[#171717]">{st.father_name || '—'}</strong>
                  </div>
                  {adm.reference_no && (
                    <div>
                      <span className="text-[#737373]">Application Ref:</span>{' '}
                      <strong className="font-mono-num text-[#DC1726]">{adm.reference_no}</strong>
                    </div>
                  )}
                  <div>
                    <span className="text-[#737373]">Session:</span>{' '}
                    <strong className="font-mono-num text-[#171717]">{data.activeSession}</strong>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[#737373]">Fees / Enrollment:</span>{' '}
                    <strong className="text-[#10B981]">{fee.status}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50"
              >
                My Profile
              </button>
              <button
                type="button"
                onClick={() => onNavigate('results')}
                className="px-3.5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
              >
                My Results
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={GraduationCap} color="#0EA5E9" label="Class / Course" value={st.class_name || 'Unassigned'} onClick={() => onNavigate('profile')} />
          <StatCard icon={ClipboardCheck} color="#10B981" label="Attendance Rate" value={`${att.percentage}%`} sub={`${att.present}/${att.total} days`} onClick={() => onNavigate('attendance')} />
          <StatCard icon={BookMarked} color="#F59E0B" label="Assigned Homework" value={String((data.recentHomework || []).length)} onClick={() => onNavigate('homework')} />
          <StatCard icon={Award} color="#14B8A6" label="Examination Results" value={String((data.recentResults || []).length)} onClick={() => onNavigate('results')} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#171717]">Recent Homework</h3>
              <button type="button" onClick={() => onNavigate('homework')} className="text-xs font-medium text-[#DC1726] hover:underline">Open All</button>
            </div>
            {(data.recentHomework || []).length === 0 ? (
              <p className="text-xs text-[#737373] py-4">No homework assigned.</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {data.recentHomework.map((hw: any) => (
                  <div key={hw.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[#171717]">{hw.title}</div>
                      <div className="text-[#737373]">{hw.subject_name}</div>
                    </div>
                    <span className="text-[#737373] font-mono-num">Due {hw.submission_deadline}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#171717]">Examination Results</h3>
              <button type="button" onClick={() => onNavigate('results')} className="text-xs font-medium text-[#DC1726] hover:underline">View Marksheet</button>
            </div>
            {(data.recentResults || []).length === 0 ? (
              <p className="text-xs text-[#737373] py-4">No published examination results yet.</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {data.recentResults.map((r: any) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[#171717]">{r.exam_name}</div>
                      <div className="text-[#737373] font-mono-num">{r.obtained_marks}/{r.total_marks} ({r.percentage}%)</div>
                    </div>
                    <span className={`font-bold ${r.status === 'pass' ? 'text-[#10B981]' : 'text-[#DC1726]'}`}>
                      Grade {r.grade} · {String(r.status || '').toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#171717] flex items-center gap-1.5">
                <Video className="w-4 h-4 text-[#0EA5E9]" /> Online Classes
              </h3>
              <button type="button" onClick={() => onNavigate('online_classes')} className="text-xs font-medium text-[#DC1726] hover:underline">Open All</button>
            </div>
            {(data.onlineClasses || []).length === 0 ? (
              <p className="text-xs text-[#737373] py-4">No online classes scheduled for your class.</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {data.onlineClasses.map((oc: any) => (
                  <div key={oc.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#171717] truncate">{oc.title}</div>
                      <div className="text-[#737373]">{oc.subject_name || 'Class Session'} · {oc.status}</div>
                    </div>
                    <span className="text-[#737373] font-mono-num shrink-0">
                      {oc.scheduled_at ? new Date(oc.scheduled_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#171717]">Madrasa Notices</h3>
              <button type="button" onClick={() => onNavigate('notices')} className="text-xs font-medium text-[#DC1726] hover:underline">View All</button>
            </div>
            {(data.notices || []).length === 0 ? (
              <p className="text-xs text-[#737373] py-4">No notices available.</p>
            ) : (
              data.notices.map((n: any) => (
                <div key={n.id} className="py-2.5 border-b last:border-0 border-neutral-100 flex items-center justify-between text-xs">
                  <span className="font-medium text-[#171717]">{n.title}</span>
                  <span className="text-[#737373] font-mono-num">{n.publish_date}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== TEACHER DASHBOARD ====================
  if (data.role === 'teacher') {
    const s = data.stats;
    const todayAtt = data.todayAttendance;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Building2} color="#0EA5E9" label="Assigned Classes" value={s.assignedClasses} />
          <StatCard icon={GraduationCap} color="#10B981" label="My Students" value={s.totalStudents} />
          <StatCard icon={ClipboardCheck} color="#14B8A6" label="Present Today" value={s.presentToday} />
          <StatCard icon={Users} color="#DC1726" label="Absent Today" value={s.absentToday} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#171717]">{t.sections.todaysAttendance}</h3>
              <button type="button" onClick={() => onNavigate('attendance')} className="text-xs font-medium text-[#DC1726] hover:underline">Mark Attendance</button>
            </div>
            <p className="text-xs text-[#737373] mb-3">
              Marked: <span className="font-mono-num font-semibold text-[#171717]">{todayAtt.totalMarked}</span> · Rate: <span className="font-mono-num font-semibold text-[#10B981]">{todayAtt.percentage}%</span>
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <MiniStat label="Present" value={todayAtt.present} color="text-[#10B981]" />
              <MiniStat label="Absent" value={todayAtt.absent} color="text-[#DC1726]" />
              <MiniStat label="Late" value={todayAtt.late} color="text-[#F59E0B]" />
              <MiniStat label="Leave" value={todayAtt.leave} color="text-[#0EA5E9]" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#171717]">Homework &amp; Pending Reviews</h3>
              <button type="button" onClick={() => onNavigate('homework')} className="text-xs font-medium text-[#DC1726] hover:underline">Manage</button>
            </div>
            {(data.pendingHomework || []).map((hw: any) => (
              <div key={hw.id} className="py-2 border-b last:border-0 border-neutral-100 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-[#171717]">{hw.title}</div>
                  <div className="text-[#737373]">{hw.class_name} · {hw.subject_name}</div>
                </div>
                <span className="font-mono-num text-[#F59E0B] font-semibold">{hw.pending_reviews} pending</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ==================== PUBLIC DASHBOARD ====================
  if (data.role === 'public') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#171717]">Public Portal Overview</h2>
            <p className="text-xs text-[#737373]">
              Welcome, {user.full_name} · Session {data.activeSession}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('contact_us')}
            className="px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            Contact Us
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            color="#0EA5E9"
            label="Committee Members"
            value={String((data.committeeMembers || []).length)}
            onClick={() => onNavigate('committee')}
          />
          <StatCard
            icon={ClipboardList}
            color="#10B981"
            label="Public Notices"
            value={String((data.notices || []).length)}
            onClick={() => onNavigate('notices')}
          />
          <StatCard
            icon={CalendarCheck}
            color="#F59E0B"
            label="Upcoming Programs"
            value={String((data.programs || []).length)}
            onClick={() => onNavigate('programs')}
          />
          <StatCard
            icon={Activity}
            color="#DC1726"
            label="Feed Updates"
            value={String(data.feedCount || 0)}
            onClick={() => onNavigate('feed')}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#171717]">Madrasa Notices</h3>
              <button type="button" onClick={() => onNavigate('notices')} className="text-xs font-medium text-[#DC1726] hover:underline">
                View All
              </button>
            </div>
            {(data.notices || []).length === 0 ? (
              <p className="text-xs text-[#737373] py-4">No public notices available.</p>
            ) : (
              data.notices.map((n: any) => (
                <div key={n.id} className="py-2.5 border-b last:border-0 border-neutral-100 flex items-center justify-between text-xs">
                  <span className="font-medium text-[#171717]">{n.title}</span>
                  <span className="text-[#737373] font-mono-num">{n.publish_date}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#171717]">Upcoming Programs</h3>
              <button type="button" onClick={() => onNavigate('programs')} className="text-xs font-medium text-[#DC1726] hover:underline">
                View All
              </button>
            </div>
            {(data.programs || []).length === 0 ? (
              <p className="text-xs text-[#737373] py-4">No upcoming programs scheduled.</p>
            ) : (
              data.programs.map((p: any) => (
                <div key={p.id} className="py-2.5 border-b last:border-0 border-neutral-100 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-[#171717]">{p.title}</div>
                    {p.venue && <div className="text-[11px] text-[#737373]">{p.venue}</div>}
                  </div>
                  <span className="text-[#737373] font-mono-num">{p.program_date}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== SUPER ADMIN & COMMITTEE DASHBOARD ====================
  const stats = data.stats;
  const todayAtt = data.todayAttendance;
  const analyticsData = data.attendanceAnalytics?.[analyticsTab] || [];

  return (
    <div className="space-y-6">
      {/* 8 KPI Cards (matching screenshot style + complete prompt metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={GraduationCap}
          color="#10B981"
          label={t.stats.totalStudents}
          value={stats.totalStudents}
          sub={`+${stats.studentsGrowthPct}% vs last month`}
          onClick={() => onNavigate('students')}
        />
        <StatCard
          icon={UserCheck}
          color="#14B8A6"
          label={t.stats.totalTeachers}
          value={stats.totalTeachers}
          sub="Active Asatiza"
          onClick={() => onNavigate('teachers')}
        />
        <StatCard
          icon={UsersRound}
          color="#F59E0B"
          label={t.stats.totalParents}
          value={stats.totalParents}
          sub="Registered Guardians"
          onClick={() => onNavigate('parents')}
        />
        <StatCard
          icon={Building2}
          color="#0EA5E9"
          label={t.stats.totalClasses}
          value={stats.totalClasses}
          sub={`Session ${data.activeSession}`}
          onClick={() => onNavigate('classes')}
        />
        <StatCard
          icon={Users}
          color="#171717"
          label={t.stats.totalStaff}
          value={stats.totalStaff}
          sub="Teachers & Committee"
        />
        <StatCard
          icon={ClipboardCheck}
          color="#10B981"
          label={t.stats.presentToday}
          value={stats.presentToday}
          sub={`${todayAtt.percentage}% attendance today`}
          onClick={() => onNavigate('attendance')}
        />
        <StatCard
          icon={Activity}
          color="#DC1726"
          label={t.stats.absentToday}
          value={stats.absentToday}
          sub="Today's absentees"
          onClick={() => onNavigate('attendance')}
        />
        <StatCard
          icon={ClipboardList}
          color="#F59E0B"
          label={t.stats.pendingAdmissions}
          value={stats.pendingAdmissions}
          sub="Awaiting approval"
          onClick={() => onNavigate('admissions')}
        />
      </div>

      {/* Row: Today's Attendance & Upcoming Examinations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[#DC1726]" />
              <h2 className="text-sm font-semibold text-[#171717]">{t.sections.todaysAttendance}</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="text-xs font-medium text-[#DC1726] hover:underline"
            >
              Mark Attendance
            </button>
          </div>
          {todayAtt.totalMarked === 0 ? (
            <p className="text-xs text-[#737373] py-6 text-center">No attendance recorded today.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <MiniStat label={t.common.present} value={todayAtt.present} color="text-[#10B981]" />
                <MiniStat label={t.common.absent} value={todayAtt.absent} color="text-[#DC1726]" />
                <MiniStat label={t.common.late} value={todayAtt.late} color="text-[#F59E0B]" />
                <MiniStat label={t.common.leave} value={todayAtt.leave} color="text-[#0EA5E9]" />
                <MiniStat label="Rate" value={`${todayAtt.percentage}%`} color="text-[#171717]" />
              </div>
              <div className="w-full h-2.5 rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className="h-full bg-[#10B981] rounded-full transition-all"
                  style={{ width: `${todayAtt.percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[#DC1726]" />
              <h2 className="text-sm font-semibold text-[#171717]">{t.sections.upcomingExams}</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('examinations')}
              className="text-xs font-medium text-[#DC1726] hover:underline"
            >
              Manage Exams
            </button>
          </div>
          {(data.upcomingExams || []).length === 0 ? (
            <p className="text-xs text-[#737373] py-6 text-center">No upcoming exams.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {data.upcomingExams.map((ex: any) => (
                <div key={ex.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#171717] truncate">{ex.name}</div>
                    <div className="text-[#737373] truncate">
                      {ex.class_name} {ex.subjects ? `· ${ex.subjects}` : ''}
                    </div>
                  </div>
                  <span className="font-mono-num text-[#171717] font-medium shrink-0">{ex.start_date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Students Per Class Chart */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-[#171717] mb-4">{t.sections.studentsPerClass}</h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.studentsPerClass || []} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#737373' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#737373' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E5E5E5', fontSize: 12 }}
              />
              <Bar dataKey="count" name="Students" fill="#DC1726" radius={[6, 6, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Attendance Analytics (Daily / Weekly / Monthly) */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-[#171717]">{t.sections.attendanceAnalytics}</h2>
          <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
            {(['daily', 'weekly', 'monthly'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setAnalyticsTab(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  analyticsTab === tab ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                {t.common[tab]}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64 w-full">
          {analyticsData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[#737373]">
              No attendance data recorded for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#737373' }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E5E5', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="present" name="Present" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill="#DC1726" radius={[4, 4, 0, 0]} />
                <Bar dataKey="late" name="Late" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="on_leave" name="Leave" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Admissions & Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#171717]">{t.sections.recentAdmissions}</h2>
            <button
              type="button"
              onClick={() => onNavigate('admissions')}
              className="text-xs font-medium text-[#DC1726] hover:underline"
            >
              View All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-start text-[#737373] border-b border-neutral-100">
                  <th className="py-2 text-start font-medium">Reference No</th>
                  <th className="py-2 text-start font-medium">Student</th>
                  <th className="py-2 text-start font-medium">Class</th>
                  <th className="py-2 text-start font-medium">Date</th>
                  <th className="py-2 text-end font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(data.recentAdmissions || []).map((a: any) => (
                  <tr key={a.id} className="hover:bg-neutral-50">
                    <td className="py-2.5 font-mono-num font-medium text-[#171717]">{a.admission_no}</td>
                    <td className="py-2.5 font-medium text-[#171717]">{a.student_name}</td>
                    <td className="py-2.5 text-[#737373]">{a.class_name}</td>
                    <td className="py-2.5 font-mono-num text-[#737373]">{a.admission_date}</td>
                    <td className="py-2.5 text-end">
                      <span
                        className={`font-semibold capitalize ${
                          a.status === 'approved' ? 'text-[#10B981]' : a.status === 'rejected' ? 'text-[#DC1726]' : 'text-[#F59E0B]'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#171717]">{t.sections.recentActivities}</h2>
            {user.role_slug === 'super_admin' && (
              <button
                type="button"
                onClick={() => onNavigate('activity_logs')}
                className="text-xs font-medium text-[#DC1726] hover:underline"
              >
                Audit Logs
              </button>
            )}
          </div>
          <div className="divide-y divide-neutral-100">
            {(data.recentActivities || []).map((act: any) => (
              <div key={act.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-[#171717] truncate">{act.details || act.action}</div>
                  <div className="text-[#737373] text-[11px]">
                    {act.username} · {act.module}
                  </div>
                </div>
                <span className="text-[11px] text-[#737373] font-mono-num shrink-0">
                  {new Date(act.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Madrasa Committee Section (matching reference screenshot) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#DC1726]" />
            <h2 className="text-sm font-semibold text-[#171717]">{t.sections.madrasaCommittee}</h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('committee')}
            className="text-xs font-medium text-[#DC1726] hover:underline"
          >
            Manage Committee
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data.committeeMembers || []).map((m: any) => (
            <div key={m.id} className="bg-white rounded-xl border border-neutral-200 p-6 flex flex-col items-center text-center shadow-xs">
              {m.photo_url ? (
                <img
                  src={m.photo_url}
                  alt={m.full_name}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-full object-cover border-2 border-neutral-100 mb-3"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#3B0A0D] text-white flex items-center justify-center text-2xl font-bold mb-3">
                  {m.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-sm font-bold text-[#171717]">{m.full_name}</div>
              <div className="text-xs font-medium text-[#DC1726] mt-0.5">{m.designation}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono-num text-[#DC1726]">
                <Phone className="w-3.5 h-3.5" />
                <span>{m.mobile}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, color, label, value, sub, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex items-center gap-4 ${
        onClick ? 'cursor-pointer hover:border-neutral-300 transition-colors' : ''
      }`}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-[#171717] font-mono-num leading-tight">{value}</div>
        <div className="text-xs font-medium text-[#737373] truncate">{label}</div>
        {sub && <div className="text-[11px] text-[#737373] mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
  <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100 text-center">
    <div className={`text-base font-bold font-mono-num ${color}`}>{value}</div>
    <div className="text-[11px] text-[#737373]">{label}</div>
  </div>
);
