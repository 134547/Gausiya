import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  EyeOff,
  FileText,
  FileUp,
  GraduationCap,
  MapPin,
  Pencil,
  Pin,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PrintModal } from '../components/PrintModal.tsx';

interface SchedulesPageProps {
  user: User;
  settings: MadrasaSettings | null;
}

type AudienceSlug = 'student' | 'teacher' | 'parent' | 'super_admin';

interface ScheduleSlot {
  id?: string;
  day_label: string;
  start_time: string;
  end_time: string;
  title: string;
  details: string;
  assigned_to: string;
  location: string;
}

interface ScheduleRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  target_audience: string;
  target_audiences: AudienceSlug[];
  target_class_id: string;
  target_class_name: string;
  start_date: string;
  end_date: string;
  effective_days: string;
  status: 'draft' | 'published';
  is_pinned: boolean;
  attachment_url: string;
  attachment_name: string;
  created_by: string;
  created_by_name: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  items: ScheduleSlot[];
}

const CATEGORIES = [
  'Daily Timetable',
  'Weekly Routine',
  'Exam Schedule',
  'Teacher Duty',
  'Parents Meeting',
  'Admin Plan',
  'Ramzan / Special',
  'Other',
];

const AUDIENCE_META: Record<
  AudienceSlug,
  {
    label: string;
    shortLabel: string;
    badgeClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  student: {
    label: 'Students',
    shortLabel: 'Students',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: GraduationCap,
  },
  teacher: {
    label: 'Masters / Teachers',
    shortLabel: 'Masters',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: UserCheck,
  },
  parent: {
    label: 'Parents',
    shortLabel: 'Parents',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: UsersRound,
  },
  super_admin: {
    label: 'Super Admin',
    shortLabel: 'Super Admin',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: ShieldCheck,
  },
};

const ALL_AUDIENCES: AudienceSlug[] = ['student', 'teacher', 'parent', 'super_admin'];

const QUICK_TEMPLATES: Record<
  AudienceSlug,
  {
    title: string;
    category: string;
    effective_days: string;
    description: string;
    items: ScheduleSlot[];
  }
> = {
  student: {
    title: 'Daily Madrasa Student Timetable',
    category: 'Daily Timetable',
    effective_days: 'Saturday - Thursday',
    description: 'Students must arrive 10 minutes before assembly in proper Madrasa uniform.',
    items: [
      { day_label: 'Daily', start_time: '07:00 AM', end_time: '07:20 AM', title: 'Dua & Morning Assembly', details: 'Tilawat-e-Quran, Naat & Attendance', assigned_to: 'Class Teacher', location: 'Main Courtyard' },
      { day_label: 'Daily', start_time: '07:20 AM', end_time: '08:30 AM', title: 'Nazira / Hifz-e-Quran', details: 'Sabaq, Sabaqi & Manzil recitation', assigned_to: 'Qari / Hafiz Sahab', location: 'Classroom' },
      { day_label: 'Daily', start_time: '08:30 AM', end_time: '09:30 AM', title: 'Deeniyat, Fiqh & Urdu', details: 'Daily lesson & writing practice', assigned_to: 'Subject Master', location: 'Classroom' },
      { day_label: 'Daily', start_time: '09:30 AM', end_time: '10:00 AM', title: 'Break / Refreshment', details: 'Short recess', assigned_to: 'Duty Master', location: 'Campus' },
      { day_label: 'Daily', start_time: '10:00 AM', end_time: '11:30 AM', title: 'Arabic, Mathematics & English', details: 'Core academic periods & homework review', assigned_to: 'Subject Masters', location: 'Classroom' },
    ],
  },
  teacher: {
    title: 'Masters / Teachers Daily Duty Roster',
    category: 'Teacher Duty',
    effective_days: 'Saturday - Thursday',
    description: 'All respected Masters / Teachers are requested to mark attendance and complete daily diary updates on time.',
    items: [
      { day_label: 'Daily', start_time: '06:50 AM', end_time: '07:00 AM', title: 'Staff Reporting & Sign-in', details: 'Register sign-in & class preparation', assigned_to: 'All Masters', location: 'Staff Room' },
      { day_label: 'Daily', start_time: '07:00 AM', end_time: '07:20 AM', title: 'Assembly Supervision', details: 'Student discipline & line management', assigned_to: 'Duty Master', location: 'Main Courtyard' },
      { day_label: 'Daily', start_time: '07:20 AM', end_time: '11:30 AM', title: 'Scheduled Teaching Periods', details: 'Conduct classes, mark attendance & assign homework', assigned_to: 'Respective Masters', location: 'Assigned Classes' },
      { day_label: 'Thursday', start_time: '11:30 AM', end_time: '12:15 PM', title: 'Weekly Academic Review', details: 'Syllabus progress & weak student review with Principal', assigned_to: 'All Masters', location: 'Office / Staff Room' },
    ],
  },
  parent: {
    title: 'Parents Meeting & Progress Review Schedule',
    category: 'Parents Meeting',
    effective_days: 'Last Sunday of Month',
    description: 'Respected Parents are invited to review attendance, Hifz/Nazira progress, and exam performance with class teachers.',
    items: [
      { day_label: 'Session 1', start_time: '09:00 AM', end_time: '10:30 AM', title: 'Primary & Nazira Classes (Nursery - Class 3)', details: 'Collect progress report & discuss home revision', assigned_to: 'Class Teachers', location: 'Ground Floor Hall' },
      { day_label: 'Session 2', start_time: '10:30 AM', end_time: '12:00 PM', title: 'Hifz & Senior Classes (Class 4+)', details: 'Individual student evaluation & parent feedback', assigned_to: 'Senior Masters', location: 'Main Hall' },
      { day_label: 'Session 3', start_time: '12:00 PM', end_time: '12:45 PM', title: 'Open Discussion with Principal / Super Admin', details: 'Suggestions, admissions & upcoming program updates', assigned_to: 'Super Admin', location: 'Principal Office' },
    ],
  },
  super_admin: {
    title: 'Super Admin Inspection & Administration Plan',
    category: 'Admin Plan',
    effective_days: 'Weekly Internal Plan',
    description: 'Internal Super Admin checklist for madrasa supervision, record verification, and committee coordination.',
    items: [
      { day_label: 'Monday', start_time: '07:30 AM', end_time: '08:30 AM', title: 'Classroom & Attendance Audit', details: 'Inspect student & master attendance logs', assigned_to: 'Super Admin', location: 'All Classrooms' },
      { day_label: 'Wednesday', start_time: '10:00 AM', end_time: '11:00 AM', title: 'Admissions & Portal Records Check', details: 'Approve pending admission forms & verify student IDs', assigned_to: 'Super Admin', location: 'Admin Office' },
      { day_label: 'Saturday', start_time: '11:30 AM', end_time: '12:30 PM', title: 'Monthly Report & Committee Review', details: 'Review exam results, notices, and upcoming schedules', assigned_to: 'Super Admin', location: 'Admin Office' },
    ],
  },
};

function createEmptySlot(): ScheduleSlot {
  return {
    day_label: 'Daily',
    start_time: '',
    end_time: '',
    title: '',
    details: '',
    assigned_to: '',
    location: '',
  };
}

function isSafeAttachmentHref(url: string): boolean {
  const val = String(url || '').trim();
  if (!val) return false;
  return val.startsWith('/api/media/') || val.startsWith('https://') || val.startsWith('http://');
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const SchedulesPage: React.FC<SchedulesPageProps> = ({ user, settings }) => {
  const isSuperAdmin = user.role_slug === 'super_admin';

  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [tursoConfigured, setTursoConfigured] = useState<boolean>(true);
  const [tursoTables, setTursoTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingTables, setSyncingTables] = useState(false);

  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<'all_filter' | AudienceSlug>('all_filter');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Daily Timetable',
    target_audiences: ['student'] as AudienceSlug[],
    target_class_id: '',
    start_date: '',
    end_date: '',
    effective_days: 'Saturday - Thursday',
    is_pinned: false,
    attachment_url: '',
    attachment_name: '',
    items: [createEmptySlot()] as ScheduleSlot[],
  });

  const [printTarget, setPrintTarget] = useState<ScheduleRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRecord | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [sRes, cRes] = await Promise.all([
        apiRequest<{
          schedules: ScheduleRecord[];
          tursoConfigured: boolean;
          tables?: string[];
          message?: string;
        }>('/api/schedules'),
        isSuperAdmin
          ? apiRequest<{ classes: Array<{ id: string; name: string }> }>('/api/classes').catch(() => ({ classes: [] }))
          : Promise.resolve({ classes: [] }),
      ]);
      setSchedules(sRes.schedules || []);
      setTursoConfigured(sRes.tursoConfigured !== false);
      setTursoTables(sRes.tables || []);
      if (isSuperAdmin) setClasses(cRes.classes || []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInitTursoTables = async () => {
    setSyncingTables(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ success: boolean; tables: string[]; message: string }>(
        '/api/schedules/init-tables',
        { method: 'POST' }
      );
      setTursoTables(res.tables || []);
      setTursoConfigured(true);
      setMsg(res.message || 'Turso tables created & verified.');
      loadData();
    } catch (e: any) {
      setErr(e.message || 'Could not initialize Turso tables');
    } finally {
      setSyncingTables(false);
    }
  };

  const openCreateModal = (defaultAudience: AudienceSlug = 'student') => {
    setEditingId(null);
    setErr('');
    setForm({
      title: '',
      description: '',
      category:
        defaultAudience === 'teacher'
          ? 'Teacher Duty'
          : defaultAudience === 'parent'
            ? 'Parents Meeting'
            : defaultAudience === 'super_admin'
              ? 'Admin Plan'
              : 'Daily Timetable',
      target_audiences: [defaultAudience],
      target_class_id: '',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
      effective_days: 'Saturday - Thursday',
      is_pinned: false,
      attachment_url: '',
      attachment_name: '',
      items: [createEmptySlot()],
    });
    setFormOpen(true);
  };

  const openEditModal = (s: ScheduleRecord, asDuplicate = false) => {
    setEditingId(asDuplicate ? null : s.id);
    setErr('');
    setForm({
      title: asDuplicate ? `${s.title} (Copy)` : s.title,
      description: s.description || '',
      category: s.category || 'Daily Timetable',
      target_audiences: s.target_audiences?.length ? [...s.target_audiences] : ['student'],
      target_class_id: s.target_class_id || '',
      start_date: s.start_date || '',
      end_date: s.end_date || '',
      effective_days: s.effective_days || 'Saturday - Thursday',
      is_pinned: asDuplicate ? false : Boolean(s.is_pinned),
      attachment_url: s.attachment_url || '',
      attachment_name: s.attachment_name || '',
      items:
        s.items && s.items.length > 0
          ? s.items.map((it) => ({
              day_label: it.day_label || 'Daily',
              start_time: it.start_time || '',
              end_time: it.end_time || '',
              title: it.title || '',
              details: it.details || '',
              assigned_to: it.assigned_to || '',
              location: it.location || '',
            }))
          : [createEmptySlot()],
    });
    setFormOpen(true);
  };

  const toggleAudience = (slug: AudienceSlug) => {
    setForm((prev) => {
      const exists = prev.target_audiences.includes(slug);
      let next = exists
        ? prev.target_audiences.filter((a) => a !== slug)
        : [...prev.target_audiences, slug];
      if (next.length === 0) next = [slug];
      return { ...prev, target_audiences: next };
    });
  };

  const selectAllAudiences = () => {
    setForm((prev) => ({ ...prev, target_audiences: [...ALL_AUDIENCES] }));
  };

  const applyTemplate = (slug: AudienceSlug) => {
    const tpl = QUICK_TEMPLATES[slug];
    setForm((prev) => ({
      ...prev,
      title: tpl.title,
      category: tpl.category,
      effective_days: tpl.effective_days,
      description: tpl.description,
      target_audiences: [slug],
      items: tpl.items.map((it) => ({ ...it })),
    }));
  };

  const updateSlot = (index: number, patch: Partial<ScheduleSlot>) => {
    setForm((prev) => {
      const next = [...prev.items];
      next[index] = { ...next[index], ...patch };
      return { ...prev, items: next };
    });
  };

  const addSlot = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, createEmptySlot()],
    }));
  };

  const removeSlot = (index: number) => {
    setForm((prev) => {
      const next = prev.items.filter((_, idx) => idx !== index);
      return { ...prev, items: next.length ? next : [createEmptySlot()] };
    });
  };

  const moveSlot = (index: number, dir: -1 | 1) => {
    setForm((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.items.length) return prev;
      const next = [...prev.items];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return { ...prev, items: next };
    });
  };

  const submitSchedule = async (publishStatus: 'draft' | 'published') => {
    if (!form.title.trim()) {
      setErr('Please enter a Schedule Title.');
      return;
    }
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const cleanItems = form.items.filter(
        (it) => it.title.trim() || it.start_time.trim() || it.details.trim()
      );
      const isAll = form.target_audiences.length === ALL_AUDIENCES.length;
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        target_audience: isAll
          ? 'all'
          : form.target_audiences.length === 1
            ? form.target_audiences[0]
            : 'custom',
        target_audiences: form.target_audiences,
        target_class_id:
          form.target_audiences.includes('super_admin') && form.target_audiences.length === 1
            ? ''
            : form.target_class_id,
        start_date: form.start_date,
        end_date: form.end_date,
        effective_days: form.effective_days.trim() || 'Daily',
        status: publishStatus,
        is_pinned: form.is_pinned,
        attachment_url: form.attachment_url,
        attachment_name: form.attachment_name,
        items: cleanItems,
      };

      if (editingId) {
        await apiRequest(`/api/schedules/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMsg(
          publishStatus === 'published'
            ? 'Schedule updated and posted live!'
            : 'Schedule updated and saved as Draft.'
        );
      } else {
        await apiRequest('/api/schedules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg(
          publishStatus === 'published'
            ? 'Schedule posted live and notifications sent!'
            : 'Schedule saved as Draft. You can review and post it anytime.'
        );
      }

      setFormOpen(false);
      await loadData();
    } catch (e: any) {
      setErr(e.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (s: ScheduleRecord) => {
    const nextStatus = s.status === 'published' ? 'draft' : 'published';
    setBusyActionId(s.id);
    setErr('');
    setMsg('');
    try {
      await apiRequest(`/api/schedules/${s.id}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setMsg(
        nextStatus === 'published'
          ? `"${s.title}" is now Posted Live!`
          : `"${s.title}" moved back to Draft.`
      );
      await loadData();
    } catch (e: any) {
      setErr(e.message || 'Failed to update schedule status');
    } finally {
      setBusyActionId(null);
    }
  };

  const stats = useMemo(() => {
    const total = schedules.length;
    const posted = schedules.filter((s) => s.status === 'published').length;
    const drafts = schedules.filter((s) => s.status === 'draft').length;
    const forStudents = schedules.filter((s) => s.target_audiences.includes('student')).length;
    const forTeachers = schedules.filter((s) => s.target_audiences.includes('teacher')).length;
    const forParents = schedules.filter((s) => s.target_audiences.includes('parent')).length;
    const forAdmin = schedules.filter((s) => s.target_audiences.includes('super_admin')).length;
    return { total, posted, drafts, forStudents, forTeachers, forParents, forAdmin };
  }, [schedules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedules.filter((s) => {
      if (isSuperAdmin && audienceFilter !== 'all_filter') {
        if (!s.target_audiences.includes(audienceFilter)) return false;
      }
      if (isSuperAdmin && statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (categoryFilter && s.category !== categoryFilter) return false;
      if (q) {
        const matchHeader =
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.target_class_name.toLowerCase().includes(q) ||
          s.effective_days.toLowerCase().includes(q);
        const matchSlot = (s.items || []).some(
          (it) =>
            it.title.toLowerCase().includes(q) ||
            it.details.toLowerCase().includes(q) ||
            it.assigned_to.toLowerCase().includes(q) ||
            it.day_label.toLowerCase().includes(q)
        );
        if (!matchHeader && !matchSlot) return false;
      }
      return true;
    });
  }, [schedules, isSuperAdmin, audienceFilter, statusFilter, categoryFilter, search]);

  const roleHeaderTitle =
    user.role_slug === 'super_admin'
      ? 'Schedules & Timetable Manager'
      : user.role_slug === 'teacher'
        ? 'Master / Teacher Schedules'
        : user.role_slug === 'parent'
          ? 'Parents Schedules & Meetings'
          : user.role_slug === 'student'
            ? 'Student Timetables & Schedules'
            : 'Madrasa Schedules';

  const roleHeaderSub =
    user.role_slug === 'super_admin'
      ? 'Prepare schedules in Turso for Students, Masters, Parents, or Super Admin — save drafts or post live instantly.'
      : 'Official schedules and timetables posted by the Super Admin of Madrasa Gausiya Razvia.';

  const renderAudienceBadges = (s: ScheduleRecord) => {
    const isAll = s.target_audience === 'all' || s.target_audiences.length === ALL_AUDIENCES.length;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {isAll ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-neutral-100 text-neutral-700 border-neutral-200 text-[11px] font-semibold">
            <Users className="w-3 h-3" /> All Roles
          </span>
        ) : (
          s.target_audiences.map((slug) => {
            const meta = AUDIENCE_META[slug];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <span
                key={slug}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${meta.badgeClass}`}
              >
                <Icon className="w-3 h-3" /> {meta.label}
              </span>
            );
          })
        )}
        {s.target_class_name && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-red-50 text-[#DC1726] border-red-200 text-[11px] font-semibold">
            Class: {s.target_class_name}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {msg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center justify-between gap-2">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg('')} className="p-0.5 hover:bg-emerald-100 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {err && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium flex items-center justify-between gap-2">
          <span>{err}</span>
          <button type="button" onClick={() => setErr('')} className="p-0.5 hover:bg-red-100 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!tursoConfigured && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Database className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Turso Database Connection Pending</span>
          </div>
          <p className="text-xs leading-relaxed text-amber-800">
            Schedules are powered by Turso. Please add <span className="font-mono-num font-semibold">TURSO_DATABASE_URL</span> and{' '}
            <span className="font-mono-num font-semibold">TURSO_AUTH_TOKEN</span> in your AI Studio Secrets / Vercel Environment Variables — tables will auto-create immediately.
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#DC1726] border border-red-100 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-[#171717] leading-tight">{roleHeaderTitle}</h2>
              <p className="text-xs text-[#737373] mt-0.5 leading-relaxed">{roleHeaderSub}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleInitTursoTables}
                disabled={syncingTables}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-xs font-semibold text-[#171717] disabled:opacity-60"
                title="Verify & auto-create Turso database tables"
              >
                <Database className={`w-3.5 h-3.5 text-emerald-600 ${syncingTables ? 'animate-pulse' : ''}`} />
                <span>{syncingTables ? 'Syncing...' : `Turso DB (${tursoTables.length || 4})`}</span>
              </button>
            )}
            <button
              type="button"
              onClick={loadData}
              className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-[#171717]"
              title="Refresh schedules"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => openCreateModal('student')}
                disabled={!tursoConfigured}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Create Schedule
              </button>
            )}
          </div>
        </div>

        {isSuperAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3">
              <div className="text-[11px] font-medium text-[#737373]">Total Schedules</div>
              <div className="text-xl font-bold text-[#171717] font-mono-num mt-0.5">{stats.total}</div>
              <div className="text-[10px] text-[#737373] mt-0.5">Stored in Turso</div>
            </div>
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3">
              <div className="text-[11px] font-medium text-emerald-800">Posted Live</div>
              <div className="text-xl font-bold text-emerald-700 font-mono-num mt-0.5">{stats.posted}</div>
              <div className="text-[10px] text-emerald-700/80 mt-0.5">Visible to target roles</div>
            </div>
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3">
              <div className="text-[11px] font-medium text-amber-800">Drafts (Tayyar)</div>
              <div className="text-xl font-bold text-amber-700 font-mono-num mt-0.5">{stats.drafts}</div>
              <div className="text-[10px] text-amber-700/80 mt-0.5">Ready to review & post</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="text-[11px] font-medium text-[#737373]">By Audience</div>
              <div className="text-[11px] text-[#171717] font-mono-num mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Students / Masters</span>
                  <span className="font-bold">
                    {stats.forStudents} / {stats.forTeachers}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Parents / Admin</span>
                  <span className="font-bold">
                    {stats.forParents} / {stats.forAdmin}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-3.5 shadow-xs space-y-3">
        {isSuperAdmin && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAudienceFilter('all_filter')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                audienceFilter === 'all_filter'
                  ? 'bg-[#171717] text-white'
                  : 'bg-neutral-100 text-[#171717] hover:bg-neutral-200'
              }`}
            >
              All ({stats.total})
            </button>
            {ALL_AUDIENCES.map((slug) => {
              const meta = AUDIENCE_META[slug];
              const Icon = meta.icon;
              const count =
                slug === 'student'
                  ? stats.forStudents
                  : slug === 'teacher'
                    ? stats.forTeachers
                    : slug === 'parent'
                      ? stats.forParents
                      : stats.forAdmin;
              const active = audienceFilter === slug;
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setAudienceFilter(slug)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#DC1726] text-white'
                      : 'bg-neutral-100 text-[#171717] hover:bg-neutral-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{meta.shortLabel}</span>
                  <span className={`font-mono-num text-[10px] ${active ? 'text-white/90' : 'text-[#737373]'}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search schedule title, subject, master, day..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-[#DC1726]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-neutral-200 text-xs bg-white flex-1 sm:flex-none"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {isSuperAdmin && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'published' | 'draft')}
                className="px-3 py-2 rounded-lg border border-neutral-200 text-xs bg-white flex-1 sm:flex-none"
              >
                <option value="all">All Status</option>
                <option value="published">Posted Live</option>
                <option value="draft">Drafts Only</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">
          Loading schedules from Turso...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-white rounded-2xl border border-neutral-200 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
            <CalendarClock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#171717]">No Schedules Found</h3>
            <p className="text-xs text-[#737373] max-w-md mx-auto">
              {isSuperAdmin
                ? 'Start by creating a schedule for Students, Masters/Teachers, Parents, or Super Admin. You can save as Draft first or Post Live right away.'
                : 'No schedule has been posted for your role yet. You will be notified as soon as Super Admin posts a schedule.'}
            </p>
          </div>
          {isSuperAdmin && tursoConfigured && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {ALL_AUDIENCES.map((slug) => {
                const meta = AUDIENCE_META[slug];
                const Icon = meta.icon;
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => openCreateModal(slug)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-xs font-semibold text-[#171717]"
                  >
                    <Icon className="w-3.5 h-3.5 text-[#DC1726]" />
                    <span>+ {meta.shortLabel} Schedule</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => {
            const isDraft = s.status === 'draft';
            const isBusy = busyActionId === s.id;
            return (
              <article
                key={s.id}
                className={`bg-white rounded-2xl border shadow-xs overflow-hidden transition-colors ${
                  s.is_pinned ? 'border-[#DC1726]/40' : 'border-neutral-200'
                }`}
              >
                <div className="p-4 sm:p-5 border-b border-neutral-100 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.is_pinned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-[#DC1726] border border-red-200 text-[10px] font-bold uppercase tracking-wide">
                            <Pin className="w-3 h-3" /> Pinned
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-neutral-100 text-[#171717] text-[11px] font-semibold">
                          {s.category}
                        </span>
                        {isSuperAdmin && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                              isDraft
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {isDraft ? (
                              <>
                                <EyeOff className="w-3 h-3" /> Draft (Not Posted)
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> Posted Live
                              </>
                            )}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-[#171717] leading-snug">
                        {s.title}
                      </h3>

                      {renderAudienceBadges(s)}
                    </div>

                    <div className="flex flex-wrap sm:flex-col sm:items-end gap-1.5 text-[11px] text-[#737373] shrink-0 font-mono-num">
                      {s.effective_days && (
                        <span className="inline-flex items-center gap-1 bg-neutral-50 border border-neutral-200 px-2.5 py-1 rounded-lg text-[#171717] font-medium">
                          <Calendar className="w-3.5 h-3.5 text-[#DC1726]" />
                          {s.effective_days}
                        </span>
                      )}
                      {(s.start_date || s.end_date) && (
                        <span>
                          {s.start_date ? formatDateShort(s.start_date) : 'Starts Now'}
                          {s.end_date ? ` → ${formatDateShort(s.end_date)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {s.description && (
                    <p className="text-xs text-[#525252] leading-relaxed whitespace-pre-line">
                      {s.description}
                    </p>
                  )}
                </div>

                {s.items && s.items.length > 0 && (
                  <div className="p-4 sm:p-5 bg-neutral-50/40">
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
                            <th className="py-2.5 px-3 w-28">Day / Session</th>
                            <th className="py-2.5 px-3 w-40">Timing</th>
                            <th className="py-2.5 px-3">Activity / Subject / Task</th>
                            <th className="py-2.5 px-3 w-40">Master / Assigned</th>
                            <th className="py-2.5 px-3 w-36">Location</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {s.items.map((slot, idx) => (
                            <tr key={slot.id || idx} className="hover:bg-neutral-50/70">
                              <td className="py-2.5 px-3 font-semibold text-[#171717] align-top">
                                {slot.day_label || 'Daily'}
                              </td>
                              <td className="py-2.5 px-3 font-mono-num text-[#DC1726] font-semibold whitespace-nowrap align-top">
                                {slot.start_time || slot.end_time ? (
                                  <span>
                                    {slot.start_time || '—'}
                                    {slot.end_time ? ` - ${slot.end_time}` : ''}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 align-top">
                                <div className="font-semibold text-[#171717]">{slot.title}</div>
                                {slot.details && (
                                  <div className="text-[11px] text-[#737373] mt-0.5">{slot.details}</div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-[#404040] align-top">
                                {slot.assigned_to || <span className="text-neutral-300">—</span>}
                              </td>
                              <td className="py-2.5 px-3 text-[#404040] align-top">
                                {slot.location || <span className="text-neutral-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="md:hidden space-y-2.5">
                      {s.items.map((slot, idx) => (
                        <div
                          key={slot.id || idx}
                          className="rounded-xl border border-neutral-200 bg-white p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-bold text-[#171717] bg-neutral-100 px-2 py-0.5 rounded">
                              {slot.day_label || 'Daily'}
                            </span>
                            {(slot.start_time || slot.end_time) && (
                              <span className="inline-flex items-center gap-1 font-mono-num font-bold text-[#DC1726]">
                                <Clock className="w-3 h-3" />
                                {slot.start_time}
                                {slot.end_time ? ` - ${slot.end_time}` : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-[#171717]">{slot.title}</div>
                          {slot.details && (
                            <p className="text-[11px] text-[#525252] leading-relaxed">{slot.details}</p>
                          )}
                          {(slot.assigned_to || slot.location) && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-[#737373]">
                              {slot.assigned_to && (
                                <span className="inline-flex items-center gap-1">
                                  <UserCheck className="w-3 h-3 text-emerald-600" />
                                  {slot.assigned_to}
                                </span>
                              )}
                              {slot.location && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-[#DC1726]" />
                                  {slot.location}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-4 sm:px-5 py-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2.5 bg-white">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#737373]">
                    <span>
                      By <strong className="text-[#171717]">{s.created_by_name || 'Super Admin'}</strong>
                      {s.published_at ? ` · Posted ${formatDateShort(s.published_at)}` : ` · Updated ${formatDateShort(s.updated_at)}`}
                    </span>
                    {s.attachment_url && isSafeAttachmentHref(s.attachment_url) && (
                      <a
                        href={s.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[#0EA5E9] hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{s.attachment_name || 'Open Attached File'}</span>
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPrintTarget(s)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-[#171717] hover:bg-neutral-50"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print / PDF</span>
                    </button>

                    {isSuperAdmin && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleTogglePublish(s)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                            isDraft
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          {isDraft ? (
                            <>
                              <Send className="w-3.5 h-3.5" /> Post Now
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" /> Move to Draft
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(s, false)}
                          className="p-1.5 rounded-lg border border-neutral-200 text-[#F59E0B] hover:bg-amber-50"
                          title="Edit Schedule"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(s, true)}
                          className="p-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                          title="Duplicate Schedule"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          className="p-1.5 rounded-lg border border-neutral-200 text-[#DC1726] hover:bg-red-50"
                          title="Delete Schedule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-black/55 overflow-y-auto p-2.5 sm:p-4">
          <div className="mx-auto max-w-3xl bg-white rounded-2xl border border-neutral-200 shadow-2xl overflow-hidden my-2 sm:my-6">
            <div className="px-4 sm:px-6 py-4 border-b border-neutral-100 flex items-center justify-between gap-3 bg-neutral-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#DC1726] text-white flex items-center justify-center">
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#171717]">
                    {editingId ? 'Edit Schedule' : 'Prepare New Schedule'}
                  </h3>
                  <p className="text-[11px] text-[#737373]">
                    Saved directly in Turso · Save as Draft or Post Live immediately
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-200/70 text-neutral-600"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 text-xs max-h-[78vh] overflow-y-auto">
              {!editingId && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#171717]">
                    <Sparkles className="w-3.5 h-3.5 text-[#DC1726]" />
                    <span>Quick Start Templates (Optional — One Click Fill)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_AUDIENCES.map((slug) => {
                      const meta = AUDIENCE_META[slug];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={slug}
                          type="button"
                          onClick={() => applyTemplate(slug)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:border-[#DC1726] hover:text-[#DC1726] text-[11px] font-semibold text-[#171717] transition-colors"
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{meta.shortLabel} Template</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-bold text-[#171717]">
                    Who Is This Schedule For? (Target Audience) *
                  </label>
                  <button
                    type="button"
                    onClick={selectAllAudiences}
                    className="text-[11px] font-semibold text-[#DC1726] hover:underline"
                  >
                    Select All Roles
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ALL_AUDIENCES.map((slug) => {
                    const meta = AUDIENCE_META[slug];
                    const Icon = meta.icon;
                    const selected = form.target_audiences.includes(slug);
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => toggleAudience(slug)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          selected
                            ? 'bg-[#DC1726] border-[#DC1726] text-white shadow-xs'
                            : 'bg-white border-neutral-200 text-[#171717] hover:bg-neutral-50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-white' : 'text-[#DC1726]'}`} />
                        <span className="font-semibold text-[11px] leading-tight">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>

                {!(form.target_audiences.length === 1 && form.target_audiences[0] === 'super_admin') &&
                  classes.length > 0 && (
                    <div className="pt-1">
                      <label className="block font-medium text-[#525252] mb-1">
                        Filter by Specific Class (Optional — leave &quot;All Classes&quot; for everyone in selected role)
                      </label>
                      <select
                        value={form.target_class_id}
                        onChange={(e) => setForm({ ...form, target_class_id: e.target.value })}
                        className="w-full sm:w-72 px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                      >
                        <option value="">All Classes</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#171717] mb-1">Schedule Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Class 3 Daily Timetable / Masters Duty Roster / Parents Meeting"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#171717] mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#171717] mb-1">Effective Days</label>
                  <input
                    type="text"
                    placeholder="e.g. Saturday - Thursday / Daily / Friday Special"
                    value={form.effective_days}
                    onChange={(e) => setForm({ ...form, effective_days: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#171717] mb-1">Start Date (Optional)</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#171717] mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#171717] mb-1">
                    Notes / Instructions (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Important instructions, dress code, reporting rules, or special remarks..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-bold text-[#171717]">
                    Schedule Time Slots & Activities ({form.items.length})
                  </label>
                  <button
                    type="button"
                    onClick={addSlot}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#171717] text-white text-[11px] font-semibold hover:bg-neutral-800"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Time Row
                  </button>
                </div>

                <div className="space-y-2.5">
                  {form.items.map((slot, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#737373] font-mono-num">
                          Row #{idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveSlot(idx, -1)}
                            className="p-1 rounded border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:opacity-35"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === form.items.length - 1}
                            onClick={() => moveSlot(idx, 1)}
                            className="p-1 rounded border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:opacity-35"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSlot(idx)}
                            className="p-1 rounded border border-red-200 bg-white text-[#DC1726] hover:bg-red-50"
                            title="Remove Row"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                        <input
                          type="text"
                          placeholder="Day (e.g. Daily / Mon)"
                          value={slot.day_label}
                          onChange={(e) => updateSlot(idx, { day_label: e.target.value })}
                          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white"
                        />
                        <input
                          type="text"
                          placeholder="Start (e.g. 07:00 AM)"
                          value={slot.start_time}
                          onChange={(e) => updateSlot(idx, { start_time: e.target.value })}
                          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white font-mono-num"
                        />
                        <input
                          type="text"
                          placeholder="End (e.g. 08:00 AM)"
                          value={slot.end_time}
                          onChange={(e) => updateSlot(idx, { end_time: e.target.value })}
                          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white font-mono-num"
                        />

                        <input
                          type="text"
                          placeholder="Subject / Activity / Task *"
                          value={slot.title}
                          onChange={(e) => updateSlot(idx, { title: e.target.value })}
                          className="sm:col-span-3 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white font-medium"
                        />
                        <input
                          type="text"
                          placeholder="Master / Assigned Person"
                          value={slot.assigned_to}
                          onChange={(e) => updateSlot(idx, { assigned_to: e.target.value })}
                          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white"
                        />
                        <input
                          type="text"
                          placeholder="Room / Hall"
                          value={slot.location}
                          onChange={(e) => updateSlot(idx, { location: e.target.value })}
                          className="sm:col-span-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white"
                        />

                        <input
                          type="text"
                          placeholder="Short details / note (optional)"
                          value={slot.details}
                          onChange={(e) => updateSlot(idx, { details: e.target.value })}
                          className="sm:col-span-6 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-neutral-100">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 cursor-pointer font-medium">
                    <FileUp className="w-3.5 h-3.5 text-[#DC1726]" />
                    <span>
                      {uploadingFile
                        ? 'Uploading to Turso...'
                        : form.attachment_name
                          ? `Attached: ${form.attachment_name}`
                          : 'Attach PDF / Image (Max 10 MB)'}
                    </span>
                    <input
                      type="file"
                      disabled={uploadingFile}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setErr('');
                        setUploadingFile(true);
                        try {
                          const up = await uploadFile(f, 'notices');
                          setForm((prev) => ({
                            ...prev,
                            attachment_url: up.url,
                            attachment_name: up.name,
                          }));
                        } catch (uploadErr: any) {
                          setErr(uploadErr.message || 'Failed to upload attachment');
                        } finally {
                          setUploadingFile(false);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  {form.attachment_url && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, attachment_url: '', attachment_name: '' })}
                      className="text-[#DC1726] font-semibold hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer select-none font-medium text-[#171717]">
                  <input
                    type="checkbox"
                    checked={form.is_pinned}
                    onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
                    className="w-4 h-4 accent-[#DC1726] rounded"
                  />
                  <span>Pin to top of Schedules</span>
                </label>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-3.5 border-t border-neutral-100 bg-neutral-50/80 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-100"
              >
                Cancel
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saving || uploadingFile}
                  onClick={() => submitSchedule('draft')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                </button>
                <button
                  type="button"
                  disabled={saving || uploadingFile}
                  onClick={() => submitSchedule('published')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{saving ? 'Posting...' : editingId ? 'Save & Post Live' : 'Post Schedule Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PrintModal
        open={Boolean(printTarget)}
        title="Official Madrasa Schedule"
        subtitle={printTarget?.category}
        settings={settings}
        onClose={() => setPrintTarget(null)}
      >
        {printTarget && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-[#525252] border-b border-neutral-200 pb-3 font-mono-num">
              <span>
                Audience:{' '}
                <strong className="text-[#171717]">
                  {printTarget.target_audience === 'all'
                    ? 'All Roles'
                    : printTarget.target_audiences.map((a) => AUDIENCE_META[a]?.label || a).join(', ')}
                  {printTarget.target_class_name ? ` (${printTarget.target_class_name})` : ''}
                </strong>
              </span>
              <span>Days: {printTarget.effective_days || 'Daily'}</span>
              {(printTarget.start_date || printTarget.end_date) && (
                <span>
                  Period: {printTarget.start_date || '—'}
                  {printTarget.end_date ? ` to ${printTarget.end_date}` : ''}
                </span>
              )}
            </div>

            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#171717]">{printTarget.title}</h2>
              {printTarget.description && (
                <p className="text-xs text-[#525252] mt-1 whitespace-pre-line">{printTarget.description}</p>
              )}
            </div>

            {printTarget.items && printTarget.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-neutral-300 text-xs">
                  <thead>
                    <tr className="bg-neutral-100 text-[#171717]">
                      <th className="border border-neutral-300 px-2.5 py-2 text-left">Day</th>
                      <th className="border border-neutral-300 px-2.5 py-2 text-left">Time</th>
                      <th className="border border-neutral-300 px-2.5 py-2 text-left">Activity / Subject</th>
                      <th className="border border-neutral-300 px-2.5 py-2 text-left">Assigned To</th>
                      <th className="border border-neutral-300 px-2.5 py-2 text-left">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printTarget.items.map((slot, idx) => (
                      <tr key={slot.id || idx}>
                        <td className="border border-neutral-300 px-2.5 py-2 font-semibold">
                          {slot.day_label || 'Daily'}
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-2 font-mono-num whitespace-nowrap">
                          {slot.start_time || '—'}
                          {slot.end_time ? ` - ${slot.end_time}` : ''}
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-2">
                          <div className="font-semibold">{slot.title}</div>
                          {slot.details && <div className="text-[11px] text-[#525252]">{slot.details}</div>}
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-2">{slot.assigned_to || '—'}</td>
                        <td className="border border-neutral-300 px-2.5 py-2">{slot.location || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pt-4 flex justify-between text-[11px] text-[#525252]">
              <span>Issued by: {printTarget.created_by_name || 'Super Admin'}</span>
              <span>Date: {formatDateShort(printTarget.published_at || printTarget.updated_at)}</span>
            </div>
          </div>
        )}
      </PrintModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Schedule"
        message={`Are you sure you want to permanently delete "${deleteTarget?.title}" from Turso?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/schedules/${deleteTarget.id}`, { method: 'DELETE' });
            setMsg('Schedule deleted successfully.');
            await loadData();
          } catch (e: any) {
            setErr(e.message || 'Failed to delete schedule');
          } finally {
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
