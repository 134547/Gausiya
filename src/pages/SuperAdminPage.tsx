import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  Check,
  CreditCard,
  Eye,
  GraduationCap,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Save,
  Search,
  Settings,
  Upload,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { AcademicSession, GradingRule, MadrasaSettings, User } from '../types.ts';
import { MadrasaLogo } from '../components/MadrasaLogo.tsx';
import { SyllabusPage } from './SyllabusPage.tsx';
import { IdCardsPage } from './IdCardsPage.tsx';

interface SuperAdminPageProps {
  user: User;
  onSettingsUpdated: (s: MadrasaSettings) => void;
}

const ROLE_ORDER = ['super_admin', 'teacher', 'student', 'parent', 'public', 'committee_member'];

export const SuperAdminPage: React.FC<SuperAdminPageProps> = ({ user, onSettingsUpdated }) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'users' | 'syllabus' | 'class_teachers' | 'id_cards'>('settings');

  // Settings & Sessions state
  const [settings, setSettings] = useState<MadrasaSettings | null>(null);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [gradingRules, setGradingRules] = useState<GradingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingAdmission, setTogglingAdmission] = useState(false);
  const [togglingResult, setTogglingResult] = useState(false);
  const [togglingChat, setTogglingChat] = useState(false);
  const [newSession, setNewSession] = useState({ name: '', start_date: '', end_date: '', is_active: true });

  // Users & Roles state
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const [viewUser, setViewUser] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    full_name: '',
    username: '',
    email: '',
    mobile: '',
    father_name: '',
    village: '',
    district: 'Palamu',
    password: '',
    role_id: '',
    status: 'active',
  });
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');

  // Class Teachers state
  const [classesList, setClassesList] = useState<any[]>([]);
  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [savingClassTeacherId, setSavingClassTeacherId] = useState<string | null>(null);
  const [newClassForm, setNewClassForm] = useState({
    name: '',
    code: '',
    class_teacher_id: '',
    room_no: '',
  });
  const [creatingClass, setCreatingClass] = useState(false);

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ settings: MadrasaSettings; sessions: AcademicSession[] }>('/api/settings');
      setSettings(data.settings);
      setSessions(data.sessions);
      try {
        setGradingRules(JSON.parse(data.settings.grading_rules_json || '[]'));
      } catch {
        setGradingRules([]);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await apiRequest<{ users: any[]; roles: any[] }>('/api/users');
      setUsers(res.users || []);
      const sortedRoles = [...(res.roles || [])].sort((a, b) => {
        const ia = ROLE_ORDER.indexOf(a.slug);
        const ib = ROLE_ORDER.indexOf(b.slug);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      setRoles(sortedRoles);
    } catch (e: any) {
      setErr(e.message || 'Failed to load user accounts');
    } finally {
      setUsersLoading(false);
    }
  };

  const loadClassesAndTeachers = async () => {
    setClassesLoading(true);
    try {
      const [cRes, tRes] = await Promise.all([
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ teachers: any[] }>('/api/teachers'),
      ]);
      setClassesList(cRes.classes || []);
      setTeachersList(tRes.teachers || []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load classes and teachers');
    } finally {
      setClassesLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadUsers();
    loadClassesAndTeachers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role_slug !== roleFilter) return false;
      if (!q) return true;
      return (
        String(u.full_name || '').toLowerCase().includes(q) ||
        String(u.username || '').toLowerCase().includes(q) ||
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.mobile || '').toLowerCase().includes(q) ||
        String(u.user_code || '').toLowerCase().includes(q) ||
        String(u.role_name || '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, roleFilter]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    setErr('');
    try {
      const uploaded = await uploadFile(file, 'madrasa-assets');
      setSettings({ ...settings, logo_url: uploaded.url });
      setMsg('Logo uploaded. Click Save Institutional Settings to apply globally.');
    } catch (e: any) {
      setErr(e.message || 'Failed to upload logo');
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiRequest<{ settings: MadrasaSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...settings,
          grading_rules_json: JSON.stringify(gradingRules),
        }),
      });
      setSettings(res.settings);
      onSettingsUpdated(res.settings);
      setMsg('Institutional settings saved successfully.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiRequest('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(newSession),
      });
      setNewSession({ name: '', start_date: '', end_date: '', is_active: false });
      await loadSettings();
      setMsg('Academic session created.');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleToggleAdmission = async (open: boolean) => {
    if (!settings || togglingAdmission || open === (settings.admissions_open !== false)) return;
    setTogglingAdmission(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ admissionsOpen: boolean }>('/api/admissions/status', {
        method: 'PUT',
        body: JSON.stringify({ open }),
      });
      const nextSettings = { ...settings, admissions_open: res.admissionsOpen };
      setSettings(nextSettings);
      onSettingsUpdated(nextSettings);
      setMsg(
        res.admissionsOpen
          ? 'Online Admission turned ON. Public admission form is now active.'
          : 'Online Admission turned OFF. Public admission form is now closed.'
      );
    } catch (e: any) {
      setErr(e.message || 'Failed to update admission status');
    } finally {
      setTogglingAdmission(false);
    }
  };

  const handleToggleResult = async (open: boolean) => {
    if (!settings || togglingResult || open === (settings.results_open !== false)) return;
    setTogglingResult(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ resultsOpen: boolean }>('/api/results/portal-status', {
        method: 'PUT',
        body: JSON.stringify({ open }),
      });
      const nextSettings = { ...settings, results_open: res.resultsOpen };
      setSettings(nextSettings);
      onSettingsUpdated(nextSettings);
      setMsg(
        res.resultsOpen
          ? 'Public Result turned ON. Check Result button is now visible on homepage.'
          : 'Public Result turned OFF. Check Result button is now hidden on homepage.'
      );
    } catch (e: any) {
      setErr(e.message || 'Failed to update result portal status');
    } finally {
      setTogglingResult(false);
    }
  };

  const handleToggleChat = async (open: boolean) => {
    if (!settings || togglingChat || open === (settings.chats_open !== false)) return;
    setTogglingChat(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ chatsOpen: boolean }>('/api/chats/status', {
        method: 'PUT',
        body: JSON.stringify({ open }),
      });
      const nextSettings = { ...settings, chats_open: res.chatsOpen };
      setSettings(nextSettings);
      onSettingsUpdated(nextSettings);
      setMsg(
        res.chatsOpen
          ? 'Portal Chat turned ON. Authorized roles can now see the Chats button.'
          : 'Portal Chat turned OFF. Chats button is hidden for everyone except Super Admin.'
      );
    } catch (e: any) {
      setErr(e.message || 'Failed to update chat portal status');
    } finally {
      setTogglingChat(false);
    }
  };

  const handleQuickRoleChange = async (userObj: any, newRoleId: string) => {
    if (!newRoleId || newRoleId === userObj.role_id) return;
    setUpdatingRoleId(userObj.id);
    setErr('');
    setMsg('');
    try {
      await apiRequest(`/api/users/${userObj.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          role_id: newRoleId,
          ...(userObj.status === 'pending' ? { status: 'active' } : {}),
        }),
      });
      const roleObj = roles.find((r) => r.id === newRoleId);
      setMsg(`Role for ${userObj.full_name} (@${userObj.username}) changed to ${roleObj?.name || 'selected role'}.`);
      await loadUsers();
      if (viewUser?.id === userObj.id && roleObj) {
        setViewUser((prev: any) => (prev ? { ...prev, role_id: roleObj.id, role_name: roleObj.name, role_slug: roleObj.slug } : prev));
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to change user role');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      if (editingId) {
        await apiRequest(`/api/users/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(userForm),
        });
        setMsg('User account updated.');
      } else {
        await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(userForm),
        });
        setMsg('User account created.');
      }
      setFormOpen(false);
      await loadUsers();
    } catch (e: any) {
      setErr(e.message || 'Failed to save user account');
    }
  };

  const handleToggleUserStatus = async (u: any) => {
    setErr('');
    setMsg('');
    const nextStatus = u.status === 'active' ? 'disabled' : 'active';
    try {
      await apiRequest(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setMsg(`Account @${u.username} is now ${nextStatus}.`);
      await loadUsers();
    } catch (e: any) {
      setErr(e.message || 'Failed to update account status');
    }
  };

  const handleAssignClassTeacher = async (cls: any, teacherId: string) => {
    setSavingClassTeacherId(cls.id);
    setErr('');
    setMsg('');
    try {
      await apiRequest(`/api/classes/${cls.id}`, {
        method: 'PUT',
        body: JSON.stringify({ class_teacher_id: teacherId || null }),
      });
      const tObj = teachersList.find((t) => String(t.id) === String(teacherId));
      setMsg(
        teacherId
          ? `Class Teacher for ${cls.name} assigned to ${tObj?.full_name || 'selected teacher'}.`
          : `Class Teacher removed from ${cls.name}.`
      );
      await loadClassesAndTeachers();
    } catch (e: any) {
      setErr(e.message || 'Failed to update Class Teacher');
    } finally {
      setSavingClassTeacherId(null);
    }
  };

  const handleQuickCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassForm.name.trim() || !newClassForm.code.trim()) return;
    setCreatingClass(true);
    setErr('');
    setMsg('');
    try {
      const activeSessionId = sessions.find((s) => s.is_active)?.id || settings?.active_session_id || '';
      await apiRequest('/api/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: newClassForm.name.trim(),
          code: newClassForm.code.trim(),
          class_teacher_id: newClassForm.class_teacher_id || null,
          room_no: newClassForm.room_no.trim(),
          academic_session_id: activeSessionId || undefined,
          status: 'active',
        }),
      });
      setNewClassForm({ name: '', code: '', class_teacher_id: '', room_no: '' });
      setMsg(`Class ${newClassForm.name.trim()} created successfully.`);
      await loadClassesAndTeachers();
    } catch (e: any) {
      setErr(e.message || 'Failed to create class');
    } finally {
      setCreatingClass(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setErr('');
    setMsg('');
    try {
      await apiRequest(`/api/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      setResetTarget(null);
      setNewPassword('');
      setMsg(`Password reset successfully for @${resetTarget.username}.`);
    } catch (e: any) {
      setErr(e.message || 'Failed to reset password');
    }
  };

  if (loading || !settings) {
    return (
      <div className="p-6 bg-white rounded-xl border border-neutral-200 text-sm text-[#737373]">
        Loading institutional configuration...
      </div>
    );
  }

  const admissionsOpen = settings.admissions_open !== false;
  const resultsOpen = settings.results_open !== false;
  const chatsOpen = settings.chats_open !== false;

  return (
    <div className="space-y-6">
      {/* Super Admin Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-neutral-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'settings' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-[#DC1726]" />
            <span>Settings &amp; Controls</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'users' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#DC1726]" />
            <span>Users &amp; Roles ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('syllabus')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'syllabus' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[#DC1726]" />
            <span>Syllabus &amp; Books</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('class_teachers')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'class_teachers' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 text-[#DC1726]" />
            <span>Class Teachers ({classesList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('id_cards')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'id_cards' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-[#1D56B8]" />
            <span>ID Cards</span>
          </button>
        </div>

        {activeTab === 'users' && (
          <button
            type="button"
            onClick={() => {
              const publicRole = roles.find((r) => r.slug === 'public') || roles[0];
              setEditingId(null);
              setUserForm({
                full_name: '',
                username: '',
                email: '',
                mobile: '',
                father_name: '',
                village: '',
                district: 'Palamu',
                password: '',
                role_id: String(publicRole?.id || ''),
                status: 'active',
              });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Create User Account
          </button>
        )}
      </div>

      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      {activeTab === 'syllabus' ? (
        <SyllabusPage user={user} embedded />
      ) : activeTab === 'id_cards' ? (
        <IdCardsPage settings={settings} />
      ) : activeTab === 'class_teachers' ? (
        <div className="space-y-5">
          {/* Quick Add Class with Class Teacher */}
          <form onSubmit={handleQuickCreateClass} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#171717]">Add New Class &amp; Assign Class Teacher</h2>
              <p className="text-xs text-[#737373]">
                Create a new class and immediately set its Class Teacher, or assign/change the Class Teacher for every existing class below.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                type="text"
                required
                placeholder="Class Name (e.g. Class 6)"
                value={newClassForm.name}
                onChange={(e) => setNewClassForm({ ...newClassForm, name: e.target.value })}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-200"
              />
              <input
                type="text"
                required
                placeholder="Code (e.g. CLS-06)"
                value={newClassForm.code}
                onChange={(e) => setNewClassForm({ ...newClassForm, code: e.target.value })}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-200 font-mono-num"
              />
              <select
                value={newClassForm.class_teacher_id}
                onChange={(e) => setNewClassForm({ ...newClassForm, class_teacher_id: e.target.value })}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
              >
                <option value="">Select Class Teacher (Optional)</option>
                {teachersList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} {t.designation ? `(${t.designation})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Room No (Optional)"
                value={newClassForm.room_no}
                onChange={(e) => setNewClassForm({ ...newClassForm, room_no: e.target.value })}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-200"
              />
              <button
                type="submit"
                disabled={creatingClass}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                <span>{creatingClass ? 'Creating...' : 'Add Class'}</span>
              </button>
            </div>
          </form>

          {/* Per-Class Teacher Assignment Table */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#171717]">Class Teacher Assignment (All Classes)</h2>
                <p className="text-xs text-[#737373]">
                  Select a Class Teacher for each class — updates automatically across Syllabus, Classes, and Result Builder.
                </p>
              </div>
              <span className="text-xs font-mono-num text-[#737373]">
                {classesList.length} Classes · {teachersList.length} Teachers
              </span>
            </div>

            {classesLoading ? (
              <div className="p-8 text-center text-xs text-[#737373]">Loading classes and teachers...</div>
            ) : classesList.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#737373]">No classes created yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold">Class</th>
                      <th className="px-4 py-3 text-start font-semibold">Code / Session</th>
                      <th className="px-4 py-3 text-start font-semibold">Students</th>
                      <th className="px-4 py-3 text-start font-semibold">Current Class Teacher</th>
                      <th className="px-4 py-3 text-start font-semibold">Assign / Change Class Teacher</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {classesList.map((cls) => (
                      <tr key={cls.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3">
                          <div className="font-bold text-[#171717]">{cls.name}</div>
                          {cls.room_no && <div className="text-[11px] text-[#737373]">Room {cls.room_no}</div>}
                        </td>
                        <td className="px-4 py-3 font-mono-num text-[#737373]">
                          <div>{cls.code}</div>
                          <div className="text-[11px]">{cls.session_name || '-'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono-num font-semibold text-[#0EA5E9]">
                          {cls.student_count ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                              cls.class_teacher_name && cls.class_teacher_name !== 'Unassigned'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {cls.class_teacher_name || 'Unassigned'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 max-w-xs">
                            <select
                              aria-label={`Class Teacher for ${cls.name}`}
                              disabled={savingClassTeacherId === cls.id}
                              value={cls.class_teacher_id || ''}
                              onChange={(e) => handleAssignClassTeacher(cls, e.target.value)}
                              className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 bg-white text-[#171717] focus:outline-none focus:border-[#DC1726] disabled:opacity-60"
                            >
                              <option value="">-- Unassigned --</option>
                              {teachersList.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.full_name} {t.designation ? `(${t.designation})` : ''}
                                </option>
                              ))}
                            </select>
                            {savingClassTeacherId === cls.id && (
                              <span className="text-[11px] text-[#737373] shrink-0">Saving...</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-4">
          {/* Role Filter Pills + Search */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#171717]">All Created Portal Accounts &amp; Role Assignment</h2>
                <p className="text-xs text-[#737373]">
                  Inspect every registered user account and switch roles between Super Admin, Teacher, Student, Parent, Public, or Committee Member.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, username, email, phone..."
                  className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  roleFilter === 'all'
                    ? 'bg-[#171717] text-white border-[#171717]'
                    : 'bg-neutral-50 text-[#525252] border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                All ({users.length})
              </button>
              {roles.map((r) => {
                const count = users.filter((u) => u.role_slug === r.slug).length;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoleFilter(r.slug)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      roleFilter === r.slug
                        ? 'bg-[#DC1726] text-white border-[#DC1726]'
                        : 'bg-neutral-50 text-[#525252] border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {r.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            {usersLoading ? (
              <div className="p-8 text-center text-xs text-[#737373]">Loading user accounts...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#737373]">No matching user accounts found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold">User ID</th>
                      <th className="px-4 py-3 text-start font-semibold">Account Holder</th>
                      <th className="px-4 py-3 text-start font-semibold">Email &amp; Mobile</th>
                      <th className="px-4 py-3 text-start font-semibold">Change Role</th>
                      <th className="px-4 py-3 text-start font-semibold">Status</th>
                      <th className="px-4 py-3 text-start font-semibold">Created / Last Login</th>
                      <th className="px-4 py-3 text-end font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 font-mono-num font-semibold text-[#171717]">{u.user_code}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#171717]">{u.full_name}</div>
                          <div className="text-[11px] font-mono-num text-[#737373]">@{u.username}</div>
                          {u.father_name && <div className="text-[11px] text-[#737373]">S/O {u.father_name}</div>}
                        </td>
                        <td className="px-4 py-3 text-[#737373]">
                          <div>{u.email || '-'}</div>
                          <div className="font-mono-num text-[11px]">{u.mobile || '-'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Change role for ${u.full_name}`}
                            disabled={updatingRoleId === u.id}
                            value={u.role_id || ''}
                            onChange={(e) => handleQuickRoleChange(u, e.target.value)}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 bg-white text-[#171717] focus:outline-none focus:border-[#DC1726] disabled:opacity-60"
                          >
                            {!u.role_id && <option value="">Pending Role</option>}
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-semibold capitalize ${
                              u.status === 'active'
                                ? 'text-[#10B981]'
                                : u.status === 'pending'
                                  ? 'text-[#F59E0B]'
                                  : 'text-[#DC1726]'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono-num text-[11px] text-[#737373]">
                          <div>Created: {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</div>
                          <div>Login: {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setViewUser(u)}
                              title="View Full Account Details"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[#171717] bg-neutral-100 hover:bg-neutral-200 font-medium"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(u.id);
                                setUserForm({
                                  full_name: u.full_name || '',
                                  username: u.username || '',
                                  email: u.email || '',
                                  mobile: u.mobile || '',
                                  father_name: u.father_name || '',
                                  village: u.village || '',
                                  district: u.district || 'Palamu',
                                  password: '',
                                  role_id: String(u.role_id || roles[0]?.id || ''),
                                  status: u.status || 'active',
                                });
                                setFormOpen(true);
                              }}
                              title="Edit Account"
                              className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResetTarget(u);
                                setNewPassword('');
                              }}
                              title="Reset Password"
                              className="p-1.5 rounded-md text-[#0EA5E9] hover:bg-sky-50"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(u)}
                              title={u.status === 'active' ? 'Disable Account' : 'Activate Account'}
                              className={`p-1.5 rounded-md ${
                                u.status === 'active' ? 'text-[#DC1726] hover:bg-red-50' : 'text-[#10B981] hover:bg-emerald-50'
                              }`}
                            >
                              {u.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Public Admission, Result & Chat ON / OFF Controls */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    admissionsOpen ? 'bg-emerald-50 text-[#10B981]' : 'bg-red-50 text-[#DC1726]'
                  }`}
                >
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#171717]">
                    Online Admission:{' '}
                    <span className={admissionsOpen ? 'text-[#10B981]' : 'text-[#DC1726]'}>
                      {admissionsOpen ? 'ON (Open)' : 'OFF (Closed)'}
                    </span>
                  </h2>
                  <p className="text-xs text-[#737373] mt-0.5">
                    Turn public online admission applications ON or OFF.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  disabled={togglingAdmission}
                  aria-pressed={admissionsOpen}
                  onClick={() => handleToggleAdmission(true)}
                  className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                    admissionsOpen ? 'bg-[#10B981] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  Admission ON
                </button>
                <button
                  type="button"
                  disabled={togglingAdmission}
                  aria-pressed={!admissionsOpen}
                  onClick={() => handleToggleAdmission(false)}
                  className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                    !admissionsOpen ? 'bg-[#DC1726] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  Admission OFF
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    resultsOpen ? 'bg-emerald-50 text-[#10B981]' : 'bg-red-50 text-[#DC1726]'
                  }`}
                >
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#171717]">
                    Public Result Portal:{' '}
                    <span className={resultsOpen ? 'text-[#10B981]' : 'text-[#DC1726]'}>
                      {resultsOpen ? 'ON (Visible)' : 'OFF (Hidden)'}
                    </span>
                  </h2>
                  <p className="text-xs text-[#737373] mt-0.5">
                    Show or hide the Check Result button on the public homepage.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  disabled={togglingResult}
                  aria-pressed={resultsOpen}
                  onClick={() => handleToggleResult(true)}
                  className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                    resultsOpen ? 'bg-[#10B981] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  Result ON
                </button>
                <button
                  type="button"
                  disabled={togglingResult}
                  aria-pressed={!resultsOpen}
                  onClick={() => handleToggleResult(false)}
                  className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                    !resultsOpen ? 'bg-[#DC1726] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  Result OFF
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    chatsOpen ? 'bg-emerald-50 text-[#10B981]' : 'bg-red-50 text-[#DC1726]'
                  }`}
                >
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#171717]">
                    Portal Chats:{' '}
                    <span className={chatsOpen ? 'text-[#10B981]' : 'text-[#DC1726]'}>
                      {chatsOpen ? 'ON (Visible)' : 'OFF (Super Admin Only)'}
                    </span>
                  </h2>
                  <p className="text-xs text-[#737373] mt-0.5">
                    ON = visible to all portal users; OFF = Super Admin only.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  disabled={togglingChat}
                  aria-pressed={chatsOpen}
                  onClick={() => handleToggleChat(true)}
                  className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                    chatsOpen ? 'bg-[#10B981] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  Chat ON
                </button>
                <button
                  type="button"
                  disabled={togglingChat}
                  aria-pressed={!chatsOpen}
                  onClick={() => handleToggleChat(false)}
                  className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                    !chatsOpen ? 'bg-[#DC1726] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  Chat OFF
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-100">
              <div>
                <h2 className="text-base font-bold text-[#171717]">Madrasa Identity &amp; Printable Letterhead</h2>
                <p className="text-xs text-[#737373]">Official name, Urdu calligraphy title, address, and logo used across all PDFs and ID cards.</p>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Institutional Settings'}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200">
              <MadrasaLogo logoUrl={settings.logo_url} size={64} />
              <div className="flex-1">
                <div className="text-xs font-semibold text-[#171717]">Official Madrasa Logo</div>
                <p className="text-xs text-[#737373] mt-0.5">Upload a PNG/JPG crest logo to appear in the portal sidebar and official PDF documents.</p>
              </div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-[#171717] hover:bg-neutral-100 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Logo</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Institution Name (English)</label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Institution Name (Urdu)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={settings.name_urdu}
                  onChange={(e) => setSettings({ ...settings, name_urdu: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 urdu-text"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Address (English)</label>
                <input
                  type="text"
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Address (Urdu)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={settings.address_urdu}
                  onChange={(e) => setSettings({ ...settings, address_urdu: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 urdu-text"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Official Phone</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Official Email</label>
                <input
                  type="email"
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Website</label>
                <input
                  type="text"
                  value={settings.website}
                  onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Active Academic Session</label>
                <select
                  value={settings.active_session_id || ''}
                  onChange={(e) => setSettings({ ...settings, active_session_id: e.target.value || null })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_date} to {s.end_date})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grading Rules Configuration */}
            <div className="pt-4 border-t border-neutral-100">
              <h3 className="text-sm font-semibold text-[#171717] mb-2">Examination Grading Rules</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {gradingRules.map((rule, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-neutral-200 bg-neutral-50 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={rule.grade}
                        onChange={(e) => {
                          const next = [...gradingRules];
                          next[idx] = { ...next[idx], grade: e.target.value };
                          setGradingRules(next);
                        }}
                        className="w-16 px-2 py-1 text-xs font-bold rounded border border-neutral-200 bg-white"
                        placeholder="Grade"
                      />
                      <input
                        type="number"
                        value={rule.minPercent}
                        onChange={(e) => {
                          const next = [...gradingRules];
                          next[idx] = { ...next[idx], minPercent: Number(e.target.value) };
                          setGradingRules(next);
                        }}
                        className="w-20 px-2 py-1 text-xs font-mono-num rounded border border-neutral-200 bg-white"
                        placeholder="Min %"
                      />
                      <span className="text-[11px] text-[#737373]">%+</span>
                    </div>
                    <input
                      type="text"
                      value={rule.remark || ''}
                      onChange={(e) => {
                        const next = [...gradingRules];
                        next[idx] = { ...next[idx], remark: e.target.value };
                        setGradingRules(next);
                      }}
                      className="w-full px-2 py-1 text-xs rounded border border-neutral-200 bg-white"
                      placeholder="Remark"
                    />
                  </div>
                ))}
              </div>
            </div>
          </form>

          {/* Academic Sessions */}
          <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-[#DC1726]" />
              <h2 className="text-base font-bold text-[#171717]">Academic Sessions</h2>
            </div>

            <form onSubmit={handleAddSession} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
              <input
                type="text"
                required
                placeholder="Session (e.g. 2027-2028)"
                value={newSession.name}
                onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
                className="px-3 py-2 text-sm rounded-lg border border-neutral-200"
              />
              <input
                type="date"
                required
                value={newSession.start_date}
                onChange={(e) => setNewSession({ ...newSession, start_date: e.target.value })}
                className="px-3 py-2 text-sm rounded-lg border border-neutral-200 font-mono-num"
              />
              <input
                type="date"
                required
                value={newSession.end_date}
                onChange={(e) => setNewSession({ ...newSession, end_date: e.target.value })}
                className="px-3 py-2 text-sm rounded-lg border border-neutral-200 font-mono-num"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800"
              >
                <Plus className="w-4 h-4" /> Add Session
              </button>
            </form>

            <div className="divide-y divide-neutral-100">
              {sessions.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[#171717] font-mono-num">{s.name}</span>
                    <span className="text-[#737373] ms-3 font-mono-num">{s.start_date} → {s.end_date}</span>
                  </div>
                  {Boolean(s.is_active) && (
                    <span className="inline-flex items-center gap-1 text-[#10B981] font-semibold">
                      <Check className="w-3.5 h-3.5" /> Active Session
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* User Full Detail Modal */}
      {viewUser && (
        <div className="fixed inset-0 z-50 bg-black/55 overflow-y-auto p-4 flex items-center justify-center">
          <div className="max-w-lg w-full bg-white rounded-2xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#171717]">{viewUser.full_name}</h3>
                <div className="text-[11px] font-mono-num text-[#737373]">
                  {viewUser.user_code} · @{viewUser.username}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewUser(null)}
                className="p-1.5 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <div>
                <div className="text-[11px] text-[#737373]">Assigned Role</div>
                <div className="font-bold text-[#171717]">{viewUser.role_name}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Account Status</div>
                <div className={`font-bold capitalize ${viewUser.status === 'active' ? 'text-[#10B981]' : viewUser.status === 'pending' ? 'text-[#F59E0B]' : 'text-[#DC1726]'}`}>
                  {viewUser.status}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Email Address</div>
                <div className="font-medium text-[#171717] break-all">{viewUser.email || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Mobile Number</div>
                <div className="font-mono-num font-medium text-[#171717]">{viewUser.mobile || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Father&apos;s Name</div>
                <div className="font-medium text-[#171717]">{viewUser.father_name || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Gender / DOB</div>
                <div className="font-medium text-[#171717]">{[viewUser.gender, viewUser.dob].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-[11px] text-[#737373]">Address</div>
                <div className="font-medium text-[#171717]">
                  {[viewUser.address, viewUser.village, viewUser.district, viewUser.state, viewUser.pin_code].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Created At</div>
                <div className="font-mono-num text-[#171717]">
                  {viewUser.created_at ? new Date(viewUser.created_at).toLocaleString() : '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#737373]">Last Login</div>
                <div className="font-mono-num text-[#171717]">
                  {viewUser.last_login ? new Date(viewUser.last_login).toLocaleString() : 'Never'}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[#171717]">Change Account Role</label>
              <select
                value={viewUser.role_id || ''}
                onChange={(e) => handleQuickRoleChange(viewUser, e.target.value)}
                disabled={updatingRoleId === viewUser.id}
                className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setViewUser(null)}
                className="px-4 py-2 rounded-lg bg-[#171717] text-white font-semibold hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit User Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4 flex items-center justify-center">
          <form onSubmit={handleSaveUser} className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit User Account' : 'Create User Account'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block font-medium mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200"
              />
            </div>
            {!editingId && (
              <div>
                <label className="block font-medium mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Mobile</label>
                <input
                  type="text"
                  value={userForm.mobile}
                  onChange={(e) => setUserForm({ ...userForm, mobile: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Father&apos;s Name</label>
                <input
                  type="text"
                  value={userForm.father_name}
                  onChange={(e) => setUserForm({ ...userForm, father_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">District</label>
                <input
                  type="text"
                  value={userForm.district}
                  onChange={(e) => setUserForm({ ...userForm, district: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Assigned Role *</label>
              <select
                required
                value={userForm.role_id}
                onChange={(e) => setUserForm({ ...userForm, role_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
              >
                <option value="">Select Role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {editingId && (
              <div>
                <label className="block font-medium mb-1">Account Status *</label>
                <select
                  value={userForm.status}
                  onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            )}
            {!editingId && (
              <div>
                <label className="block font-medium mb-1">Password (min 6 chars) *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Account</button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleResetPassword} className="max-w-sm w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold">Reset Password — {resetTarget.username}</h3>
            <div>
              <label className="block font-medium mb-1">New Password (min 6 chars) *</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Reset Password</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
