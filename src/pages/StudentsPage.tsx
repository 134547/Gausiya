import React, { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle, CreditCard, Eye, EyeOff, FileText, FileUp, KeyRound, Pencil, Plus, Printer, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PrintModal } from '../components/PrintModal.tsx';
import { AdmissionPaperSheet } from '../components/AdmissionPaperSheet.tsx';
import { IqrarNamaSheet } from '../components/IqrarNamaSheet.tsx';
import { OfficialIdCard } from '../components/OfficialIdCard.tsx';

interface StudentsPageProps {
  user: User;
  settings: MadrasaSettings | null;
}

const emptyStudent = {
  full_name: '',
  father_name: '',
  mother_name: '',
  dob: '',
  gender: 'Male',
  religion: 'Islam',
  address: '',
  village: '',
  district: 'Palamu',
  state: 'Jharkhand',
  pin_code: '',
  mobile: '',
  guardian_name: '',
  guardian_relationship: 'Father',
  guardian_mobile: '',
  class_id: '',
  admission_no: '',
  admission_date: new Date().toISOString().slice(0, 10),
  photo_url: '',
  status: 'active',
  previous_school: '',
  previous_class: '',
  remarks: '',
  username: '',
  password: '',
};

export const StudentsPage: React.FC<StudentsPageProps> = ({ user, settings }) => {
  const isAdmin = user.role_slug === 'super_admin';
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingHasLogin, setEditingHasLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyStudent);

  const [profileData, setProfileData] = useState<any>(null);
  const [profileTab, setProfileTab] = useState<string>('personal');
  const [promoteTarget, setPromoteTarget] = useState<any>(null);
  const [promoteForm, setPromoteForm] = useState({ to_class_id: '', to_session_id: '', action_type: 'promote', remarks: '' });
  const [printMode, setPrintMode] = useState<'profile' | 'id_card' | 'admission' | null>(null);
  const [printStudent, setPrintStudent] = useState<any>(null);
  const [recentEnrollment, setRecentEnrollment] = useState<{
    student: any;
    admission?: any;
    student_code: string;
    admission_no: string;
    username?: string | null;
    dashboard_created?: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const buildAdmissionData = (st: any, linkedAdmission?: any) => ({
    reference_no: linkedAdmission?.admission_no || st?.admission_no || st?.student_code || '—',
    admission_no: linkedAdmission?.admission_number || linkedAdmission?.admission_no || st?.admission_no || '',
    student_code: st?.student_code || '',
    admission_date: linkedAdmission?.admission_date || st?.admission_date || '',
    student_name: linkedAdmission?.student_name || st?.full_name || '',
    father_name: linkedAdmission?.father_name || st?.father_name || '',
    mother_name: linkedAdmission?.mother_name || st?.mother_name || '',
    dob: linkedAdmission?.dob || st?.dob || '',
    gender: linkedAdmission?.gender || st?.gender || 'Male',
    religion: linkedAdmission?.religion || st?.religion || 'Islam',
    class_name: linkedAdmission?.class_name || st?.class_name || 'Unassigned',
    guardian_name: linkedAdmission?.guardian_name || st?.guardian_name || st?.father_name || '',
    guardian_relationship: linkedAdmission?.guardian_relationship || st?.guardian_relationship || 'Father',
    guardian_mobile: linkedAdmission?.guardian_mobile || st?.guardian_mobile || st?.mobile || '',
    student_mobile: linkedAdmission?.student_mobile || st?.mobile || '',
    address: linkedAdmission?.address || st?.address || '',
    village: linkedAdmission?.village || st?.village || '',
    district: linkedAdmission?.district || st?.district || 'Palamu',
    state: linkedAdmission?.state || st?.state || 'Jharkhand',
    pin_code: linkedAdmission?.pin_code || st?.pin_code || '',
    previous_school: linkedAdmission?.previous_school || st?.previous_school || '',
    previous_class: linkedAdmission?.previous_class || st?.previous_class || '',
    photo_url: linkedAdmission?.photo_url || st?.photo_url || '',
    remarks: linkedAdmission?.remarks || st?.remarks || '',
    status: linkedAdmission?.status || (st?.status === 'active' ? 'approved' : 'pending'),
  });

  const suggestUsernameFromName = (name: string) => {
    const clean = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join('.');
    const rand = Math.floor(100 + Math.random() * 900);
    return `${clean || 'student'}${rand}`;
  };

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (filterClass) qs.set('classId', filterClass);
      if (filterStatus) qs.set('status', filterStatus);

      const [stData, clsData, setRes] = await Promise.all([
        apiRequest<{ students: any[] }>(`/api/students?${qs.toString()}`),
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ sessions: any[] }>('/api/settings'),
      ]);
      setStudents(stData.students);
      setClasses(clsData.classes);
      setSessions(setRes.sessions);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filterClass, filterStatus]);

  const openProfile = async (id: string) => {
    try {
      const res = await apiRequest(`/api/students/${id}`);
      setProfileData(res);
      setProfileTab('personal');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      if (editingId) {
        const res = await apiRequest<{ success: boolean; username?: string; dashboard_created?: boolean }>(
          `/api/students/${editingId}`,
          { method: 'PUT', body: JSON.stringify(form) }
        );
        setMsg(
          !editingHasLogin && res.username && res.dashboard_created
            ? `Student updated & Dashboard created (@${res.username}).`
            : 'Student updated.'
        );
      } else {
        const res = await apiRequest<{
          id: string;
          student_code: string;
          admission_no: string;
          admission_id?: string | null;
          username?: string | null;
          dashboard_created?: boolean;
          student?: any;
          admission?: any;
        }>('/api/students', {
          method: 'POST',
          body: JSON.stringify({ ...form, create_account: true }),
        });
        setRecentEnrollment({
          student: res.student || { ...form, id: res.id, student_code: res.student_code, admission_no: res.admission_no, class_name: classes.find((c) => String(c.id) === String(form.class_id))?.name || 'Unassigned' },
          admission: res.admission || null,
          student_code: res.student_code,
          admission_no: res.admission_no,
          username: res.username,
          dashboard_created: res.dashboard_created,
        });
        setMsg(
          res.dashboard_created && res.username
            ? `Student ID (${res.student_code}), Official Admission (${res.admission_no}) & Dashboard (@${res.username}) created successfully.`
            : `Student ID (${res.student_code}) & Official Admission (${res.admission_no}) created successfully.`
        );
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteTarget) return;
    try {
      await apiRequest(`/api/students/${promoteTarget.id}/promote`, {
        method: 'POST',
        body: JSON.stringify(promoteForm),
      });
      setPromoteTarget(null);
      setMsg(`Student ${promoteTarget.full_name} updated (${promoteForm.action_type}).`);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profileData?.student) return;
    setErr('');
    try {
      const up = await uploadFile(file, 'student-documents');
      await apiRequest(`/api/students/${profileData.student.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title: up.name, file_url: up.url, file_type: up.mimetype }),
      });
      setMsg('Document uploaded.');
      await openProfile(profileData.student.id);
    } catch (error: any) {
      setErr(error.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setErr('');
    try {
      await apiRequest(`/api/students/${deleteTarget.id}`, { method: 'DELETE' });
      setMsg('Student marked inactive.');
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      {/* Newly Created Student ID & Admission Ready Banner */}
      {recentEnrollment && (
        <div className="bg-emerald-50/90 rounded-xl border border-emerald-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#171717]">
                {recentEnrollment.student.full_name} — Student ID &amp; Official Admission Created
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-700">
                <span>
                  Student ID: <strong className="font-mono-num text-[#171717]">{recentEnrollment.student_code}</strong>
                </span>
                <span>
                  Admission No: <strong className="font-mono-num text-[#DC1726]">{recentEnrollment.admission_no}</strong>
                </span>
                {recentEnrollment.username && (
                  <span>
                    Portal Login: <strong className="font-mono-num text-emerald-700">@{recentEnrollment.username}</strong>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-600">
                Approved admission record is also added to the <strong>Admissions</strong> section automatically.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPrintStudent(recentEnrollment.student);
                setPrintMode('id_card');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800"
            >
              <CreditCard className="w-3.5 h-3.5" /> Print ID Card
            </button>
            <button
              type="button"
              onClick={() => {
                setPrintStudent({
                  ...recentEnrollment.student,
                  _linkedAdmission: recentEnrollment.admission,
                });
                setPrintMode('admission');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
            >
              <FileText className="w-3.5 h-3.5" /> Print Admission Paper
            </button>
            <button
              type="button"
              onClick={() => setRecentEnrollment(null)}
              title="Dismiss"
              className="p-2 rounded-lg text-neutral-500 hover:bg-emerald-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filter & Actions */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex flex-wrap items-center gap-2 flex-1"
        >
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Name, Student ID, or Admission No..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-neutral-200"
            />
          </div>
          <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white">
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="transferred">Transferred</option>
            <option value="graduated">Graduated</option>
          </select>
          <button type="submit" className="px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-medium">Search</button>
        </form>

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setEditingHasLogin(false);
              setShowPassword(false);
              setErr('');
              setForm({ ...emptyStudent, admission_date: new Date().toISOString().slice(0, 10) });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Student
          </button>
        )}
      </div>

      {/* Students List: Phone App Cards (< md) + Tablet/Desktop Table (md+) */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        {/* Phone App Card View */}
        <div className="md:hidden divide-y divide-neutral-100">
          {loading ? (
            <div className="p-8 text-center text-xs text-[#737373]">Loading students...</div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#737373]">No students found.</div>
          ) : (
            students.map((st) => (
              <div key={st.id} className="p-3.5 space-y-2.5 bg-white">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {st.photo_url ? (
                      <img src={st.photo_url} alt={st.full_name} className="w-10 h-10 rounded-full object-cover border border-neutral-200 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#171717] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {st.full_name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#171717] truncate">{st.full_name}</div>
                      <div className="text-[11px] text-[#737373] font-mono-num truncate">
                        {st.student_code}{st.admission_no ? ` · ${st.admission_no}` : ''}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase shrink-0 ${
                      st.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {st.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs bg-neutral-50/80 rounded-lg p-2.5 border border-neutral-100">
                  <div className="min-w-0">
                    <span className="text-[10px] text-neutral-500 block">Class</span>
                    <span className="font-semibold text-[#171717] truncate block">{st.class_name || '-'}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-neutral-500 block">Father Name</span>
                    <span className="font-medium text-[#171717] truncate block">{st.father_name || '-'}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-neutral-500 block">Mobile</span>
                    <span className="font-mono-num text-[#171717] truncate block">{st.mobile || '-'}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-neutral-500 block">Portal Login</span>
                    {st.login_username ? (
                      <span className="font-mono-num text-[11px] font-semibold text-emerald-700 truncate block">@{st.login_username}</span>
                    ) : (
                      <span className="text-[11px] text-amber-600 block">No login</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <button type="button" onClick={() => openProfile(st.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 text-[#0EA5E9] text-[11px] font-semibold">
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                  <button type="button" onClick={() => { setPrintStudent(st); setPrintMode('id_card'); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-[#10B981] text-[11px] font-semibold">
                    <CreditCard className="w-3.5 h-3.5" /> ID
                  </button>
                  <button type="button" onClick={() => { setPrintStudent(st); setPrintMode('admission'); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-[#DC1726] text-[11px] font-semibold">
                    <FileText className="w-3.5 h-3.5" /> Form
                  </button>
                  <button type="button" onClick={() => { setPrintStudent(st); setPrintMode('profile'); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 text-[#171717] text-[11px] font-semibold">
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPromoteTarget(st);
                          setPromoteForm({ to_class_id: String(st.class_id || ''), to_session_id: String(st.academic_session_id || ''), action_type: 'promote', remarks: '' });
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 text-[#14B8A6] text-[11px] font-semibold"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" /> Promote
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(st.id);
                          setEditingHasLogin(Boolean(st.has_login || st.login_username));
                          setShowPassword(false);
                          setErr('');
                          setForm({
                            full_name: st.full_name || '',
                            father_name: st.father_name || '',
                            mother_name: st.mother_name || '',
                            dob: st.dob || '',
                            gender: st.gender || 'Male',
                            religion: st.religion || 'Islam',
                            address: st.address || '',
                            village: st.village || '',
                            district: st.district || 'Palamu',
                            state: st.state || 'Jharkhand',
                            pin_code: st.pin_code || '',
                            mobile: st.mobile || '',
                            guardian_name: st.guardian_name || st.father_name || '',
                            guardian_relationship: st.guardian_relationship || 'Father',
                            guardian_mobile: st.guardian_mobile || st.mobile || '',
                            class_id: st.class_id ? String(st.class_id) : '',
                            admission_no: st.admission_no || '',
                            admission_date: st.admission_date || '',
                            photo_url: st.photo_url || '',
                            status: st.status || 'active',
                            previous_school: st.previous_school || '',
                            previous_class: st.previous_class || '',
                            remarks: st.remarks || '',
                            username: st.login_username || '',
                            password: '',
                          });
                          setFormOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-[#F59E0B] text-[11px] font-semibold"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(st)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-[#DC1726] text-[11px] font-semibold">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Tablet & Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">Student ID</th>
                <th className="px-4 py-3 text-start font-semibold">Student Name</th>
                <th className="px-4 py-3 text-start font-semibold">Father Name</th>
                <th className="px-4 py-3 text-start font-semibold">Class</th>
                <th className="px-4 py-3 text-start font-semibold">Mobile</th>
                <th className="px-4 py-3 text-start font-semibold">Status</th>
                <th className="px-4 py-3 text-end font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-[#737373]">Loading students...</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-[#737373]">No students found.</td></tr>
              ) : (
                students.map((st) => (
                  <tr key={st.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="font-mono-num font-semibold text-[#171717]">{st.student_code}</div>
                      {st.admission_no && (
                        <div className="text-[10px] font-mono-num text-[#737373]">{st.admission_no}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {st.photo_url ? (
                          <img src={st.photo_url} alt={st.full_name} className="w-7 h-7 rounded-full object-cover border border-neutral-200" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#171717] text-white flex items-center justify-center text-[11px] font-bold">
                            {st.full_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-[#171717]">{st.full_name}</div>
                          {st.login_username ? (
                            <div className="text-[10px] font-mono-num text-emerald-700">@{st.login_username} · Dashboard</div>
                          ) : (
                            <div className="text-[10px] text-amber-600">No login account</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#737373]">{st.father_name}</td>
                    <td className="px-4 py-3 font-medium text-[#171717]">{st.class_name}</td>
                    <td className="px-4 py-3 font-mono-num text-[#737373]">{st.mobile || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold capitalize ${st.status === 'active' ? 'text-[#10B981]' : 'text-[#737373]'}`}>
                        {st.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openProfile(st.id)} title="View 8-Tab Profile" className="p-1.5 rounded-md text-[#0EA5E9] hover:bg-sky-50">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => { setPrintStudent(st); setPrintMode('id_card'); }} title="Print ID Card" className="p-1.5 rounded-md text-[#10B981] hover:bg-emerald-50">
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => { setPrintStudent(st); setPrintMode('admission'); }} title="Print Admission Paper & Iqrar Nama" className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50">
                          <FileText className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => { setPrintStudent(st); setPrintMode('profile'); }} title="Print Profile PDF" className="p-1.5 rounded-md text-[#171717] hover:bg-neutral-100">
                          <Printer className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setPromoteTarget(st);
                                setPromoteForm({ to_class_id: String(st.class_id || ''), to_session_id: String(st.academic_session_id || ''), action_type: 'promote', remarks: '' });
                              }}
                              title="Promote / Transfer"
                              className="p-1.5 rounded-md text-[#14B8A6] hover:bg-teal-50"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(st.id);
                                setEditingHasLogin(Boolean(st.has_login || st.login_username));
                                setShowPassword(false);
                                setErr('');
                                setForm({
                                  full_name: st.full_name || '',
                                  father_name: st.father_name || '',
                                  mother_name: st.mother_name || '',
                                  dob: st.dob || '',
                                  gender: st.gender || 'Male',
                                  religion: st.religion || 'Islam',
                                  address: st.address || '',
                                  village: st.village || '',
                                  district: st.district || 'Palamu',
                                  state: st.state || 'Jharkhand',
                                  pin_code: st.pin_code || '',
                                  mobile: st.mobile || '',
                                  guardian_name: st.guardian_name || st.father_name || '',
                                  guardian_relationship: st.guardian_relationship || 'Father',
                                  guardian_mobile: st.guardian_mobile || st.mobile || '',
                                  class_id: st.class_id ? String(st.class_id) : '',
                                  admission_no: st.admission_no || '',
                                  admission_date: st.admission_date || '',
                                  photo_url: st.photo_url || '',
                                  status: st.status || 'active',
                                  previous_school: st.previous_school || '',
                                  previous_class: st.previous_class || '',
                                  remarks: st.remarks || '',
                                  username: st.login_username || '',
                                  password: '',
                                });
                                setFormOpen(true);
                              }}
                              title="Edit"
                              className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setDeleteTarget(st)} title="Delete" className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Student Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl bg-white rounded-xl border border-neutral-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50">
              <h3 className="text-base font-bold text-[#171717]">{editingId ? 'Edit Student' : 'Add New Student'}</h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-neutral-200"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-3 text-xs">
              {!editingId && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-[11px] text-sky-900">
                  Student add karte hi <strong>Official Student ID (MGR-...)</strong>, <strong>Admission No (ADM-...)</strong>, <strong>Approved Admission Paper &amp; Iqrar Nama</strong>, <strong>ID Card</strong>, aur <strong>Student Dashboard</strong> sab automatically ban jayega.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block font-medium mb-1">Full Name *</label><input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div><label className="block font-medium mb-1">Father Name *</label><input type="text" required value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div><label className="block font-medium mb-1">Mother Name</label><input type="text" value={form.mother_name} onChange={(e) => setForm({ ...form, mother_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div>
                  <label className="block font-medium mb-1">Class</label>
                  <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="">Select Class</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="block font-medium mb-1">Date of Birth</label><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
                <div>
                  <label className="block font-medium mb-1">Gender</label>
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div><label className="block font-medium mb-1">Mobile / Guardian Mobile</label><input type="text" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
                <div><label className="block font-medium mb-1">Village</label><input type="text" value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div>
                  <label className="block font-medium mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="transferred">Transferred</option>
                    <option value="graduated">Graduated</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Admission No <span className="text-[#737373] font-normal">(Auto ADM-... if blank)</span></label>
                  <input type="text" placeholder="Auto-generated e.g. ADM-2026-001" value={form.admission_no} onChange={(e) => setForm({ ...form, admission_no: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Admission Date</label>
                  <input type="date" value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Guardian Name <span className="text-[#737373] font-normal">(Auto Father if blank)</span></label>
                  <input type="text" placeholder="Defaults to Father Name" value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div className="sm:col-span-2"><label className="block font-medium mb-1">Complete Address</label><input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>

                {/* Student Portal Login & Dashboard Section */}
                <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-[#171717]">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span>
                        {editingId
                          ? editingHasLogin
                            ? 'Student Portal Login & Dashboard (Active)'
                            : 'Create Student Portal Login & Dashboard'
                          : 'Student Portal Login & Dashboard *'}
                      </span>
                    </div>
                    {(!editingId || !editingHasLogin) && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            username: suggestUsernameFromName(prev.full_name),
                          }))
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-emerald-200 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        <KeyRound className="w-3 h-3" /> Auto Username
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[#737373]">
                    {editingId
                      ? editingHasLogin
                        ? 'Leave New Password blank to keep the existing password unchanged.'
                        : 'This student has no dashboard yet. Enter Username & Password to create their Student Dashboard immediately.'
                      : 'Student add karte hi is Username aur Password se unka Student Dashboard aur Home Result Check account turant create ho jayega.'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium mb-1">
                        Username {(!editingId || !editingHasLogin) && '*'}
                      </label>
                      <input
                        type="text"
                        required={!editingId}
                        placeholder="e.g. zahid.akhtar"
                        value={form.username}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">
                        {editingId && editingHasLogin ? 'New Password (Optional)' : 'Password *'}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required={!editingId}
                          minLength={6}
                          placeholder={editingId && editingHasLogin ? 'Leave blank to keep same' : 'Min 6 characters'}
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          className="w-full px-3 py-2 pe-9 rounded-lg border border-neutral-200 bg-white font-mono-num"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#171717]"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2 flex items-center gap-3">
                  {form.photo_url && <img src={form.photo_url} alt="Photo" className="w-12 h-12 rounded-lg object-cover border" />}
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100">
                    <FileUp className="w-3.5 h-3.5" /> Upload Photograph
                    <input type="file" accept="image/*" onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setErr('');
                      try {
                        const up = await uploadFile(f, 'student-photos');
                        setForm((prev) => ({ ...prev, photo_url: up.url }));
                      } catch (errUpload: any) {
                        setErr(errUpload.message);
                      } finally {
                        e.target.value = '';
                      }
                    }} className="hidden" />
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100 font-medium">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold hover:bg-red-700 disabled:opacity-60">
                  {saving ? 'Saving...' : editingId ? 'Update Student' : 'Save & Create Dashboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8-Tab Student Profile Modal */}
      {profileData && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-4xl bg-white rounded-xl border border-neutral-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#171717] text-white">
              <div className="flex items-center gap-3">
                {profileData.student.photo_url ? (
                  <img src={profileData.student.photo_url} alt={profileData.student.full_name} className="w-12 h-12 rounded-full object-cover border border-white/20" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#DC1726] flex items-center justify-center font-bold text-lg">
                    {profileData.student.full_name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold">{profileData.student.full_name}</h3>
                  <p className="text-xs text-neutral-300 font-mono-num">
                    {profileData.student.student_code}
                    {profileData.student.admission_no ? ` · ${profileData.student.admission_no}` : ''}
                    {` · ${profileData.student.class_name} · ${profileData.student.status.toUpperCase()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrintStudent(profileData.student);
                    setPrintMode('id_card');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white"
                >
                  <CreditCard className="w-3.5 h-3.5" /> ID Card
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintStudent({
                      ...profileData.student,
                      _linkedAdmission: profileData.admission || null,
                    });
                    setPrintMode('admission');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] hover:bg-red-700 text-xs font-medium text-white"
                >
                  <FileText className="w-3.5 h-3.5" /> Admission Paper
                </button>
                <button type="button" onClick={() => setProfileData(null)} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* 8 Profile Tabs */}
            <div className="flex overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-4">
              {[
                ['personal', '1. Personal'],
                ['guardian', '2. Guardian'],
                ['academic', '3. Academic'],
                ['attendance', '4. Attendance'],
                ['results', '5. Exam Results'],
                ['homework', '6. Homework'],
                ['notices', '7. Notices'],
                ['documents', '8. Documents'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProfileTab(id)}
                  className={`px-3.5 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    profileTab === id ? 'border-[#DC1726] text-[#DC1726]' : 'border-transparent text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-6 text-xs min-h-[260px]">
              {profileTab === 'personal' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><span className="text-[#737373]">Father&apos;s Name:</span> <strong>{profileData.student.father_name}</strong></div>
                  <div><span className="text-[#737373]">Mother&apos;s Name:</span> <strong>{profileData.student.mother_name || '-'}</strong></div>
                  <div><span className="text-[#737373]">Date of Birth:</span> <strong className="font-mono-num">{profileData.student.dob || '-'}</strong></div>
                  <div><span className="text-[#737373]">Gender / Religion:</span> <strong>{profileData.student.gender} / {profileData.student.religion}</strong></div>
                  <div><span className="text-[#737373]">Mobile:</span> <strong className="font-mono-num">{profileData.student.mobile || '-'}</strong></div>
                  <div><span className="text-[#737373]">Portal Username:</span> <strong className="font-mono-num text-emerald-700">{profileData.student.login_username ? `@${profileData.student.login_username}` : 'Not created'}</strong></div>
                  <div><span className="text-[#737373]">Village / District:</span> <strong>{profileData.student.village}, {profileData.student.district}</strong></div>
                  <div className="sm:col-span-2"><span className="text-[#737373]">Complete Address:</span> <strong>{profileData.student.address}, {profileData.student.state} {profileData.student.pin_code}</strong></div>
                </div>
              )}

              {profileTab === 'guardian' && (
                <div className="space-y-3">
                  {(profileData.guardians || []).length === 0 ? <p className="text-[#737373]">No linked guardians.</p> : profileData.guardians.map((g: any) => (
                    <div key={g.id} className="p-3 rounded-lg border border-neutral-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[#171717]">{g.full_name} ({g.link_relationship})</div>
                        <div className="text-[#737373]">{g.address}</div>
                      </div>
                      <div className="font-mono-num font-semibold text-[#DC1726]">{g.mobile}</div>
                    </div>
                  ))}
                </div>
              )}

              {profileTab === 'academic' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div><span className="text-[#737373]">Current Class:</span> <strong>{profileData.student.class_name}</strong></div>
                    <div><span className="text-[#737373]">Admission No:</span> <strong className="font-mono-num">{profileData.student.admission_no || '-'}</strong></div>
                    <div><span className="text-[#737373]">Session:</span> <strong>{profileData.student.session_name}</strong></div>
                    <div><span className="text-[#737373]">Admission Date:</span> <strong className="font-mono-num">{profileData.student.admission_date}</strong></div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-[#171717] mb-2">Class Promotion &amp; Transfer History</h4>
                    {(profileData.promotions || []).length === 0 ? <p className="text-[#737373]">No historical promotions recorded yet.</p> : (
                      <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
                        {profileData.promotions.map((p: any) => (
                          <div key={p.id} className="p-2.5 flex items-center justify-between">
                            <span>{p.action_type.toUpperCase()}: {p.from_class_name || 'N/A'} → {p.to_class_name}</span>
                            <span className="font-mono-num text-[#737373]">{new Date(p.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {profileTab === 'attendance' && (
                <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
                  {(profileData.attendance || []).length === 0 ? <p className="text-[#737373]">No attendance history.</p> : profileData.attendance.map((a: any) => (
                    <div key={a.id} className="py-2 flex items-center justify-between">
                      <span className="font-mono-num">{a.attendance_date} · {a.class_name}</span>
                      <span className={`font-semibold uppercase ${a.status === 'present' ? 'text-[#10B981]' : a.status === 'absent' ? 'text-[#DC1726]' : 'text-[#F59E0B]'}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {profileTab === 'results' && (
                <div className="space-y-2">
                  {(profileData.results || []).length === 0 ? <p className="text-[#737373]">No published exam results.</p> : profileData.results.map((r: any) => (
                    <div key={r.id} className="p-3 rounded-lg border border-neutral-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{r.exam_name}</div>
                        <div className="text-[#737373] font-mono-num">{r.obtained_marks}/{r.total_marks} ({r.percentage}%) · Rank #{r.position}</div>
                      </div>
                      <span className="font-bold text-[#10B981]">Grade {r.grade}</span>
                    </div>
                  ))}
                </div>
              )}

              {profileTab === 'homework' && (
                <div className="space-y-2">
                  {(profileData.homework || []).length === 0 ? <p className="text-[#737373]">No homework assigned.</p> : profileData.homework.map((h: any) => (
                    <div key={h.id} className="p-3 rounded-lg border border-neutral-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{h.title}</div>
                        <div className="text-[#737373]">{h.subject_name} · Due {h.submission_deadline}</div>
                      </div>
                      <span className="font-semibold text-[#0EA5E9]">{h.submission_status || 'Pending'}</span>
                    </div>
                  ))}
                </div>
              )}

              {profileTab === 'notices' && (
                <div className="space-y-2">
                  {(profileData.notices || []).map((n: any) => (
                    <div key={n.id} className="p-3 rounded-lg border border-neutral-200">
                      <div className="font-semibold">{n.title}</div>
                      <p className="text-[#737373] mt-1">{n.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {profileTab === 'documents' && (
                <div className="space-y-3">
                  {isAdmin && (
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100">
                      <FileUp className="w-3.5 h-3.5" /> Upload Student Document
                      <input type="file" onChange={handleUploadDoc} className="hidden" />
                    </label>
                  )}
                  {(profileData.documents || []).length === 0 ? <p className="text-[#737373]">No documents uploaded.</p> : profileData.documents.map((d: any) => (
                    <div key={d.id} className="p-3 rounded-lg border border-neutral-200 flex items-center justify-between">
                      <span className="font-medium">{d.title}</span>
                      <a href={d.file_url} target="_blank" rel="noreferrer" className="text-[#DC1726] font-semibold hover:underline">Download</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Promote / Transfer Modal */}
      {promoteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold text-[#171717]">Promote / Transfer {promoteTarget.full_name}</h3>
            <form onSubmit={handlePromote} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Action</label>
                <select value={promoteForm.action_type} onChange={(e) => setPromoteForm({ ...promoteForm, action_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  <option value="promote">Promote to Next Class</option>
                  <option value="transfer">Transfer Class</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Target Class *</label>
                <select required value={promoteForm.to_class_id} onChange={(e) => setPromoteForm({ ...promoteForm, to_class_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  <option value="">Select Class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Academic Session</label>
                <select value={promoteForm.to_session_id} onChange={(e) => setPromoteForm({ ...promoteForm, to_session_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Remarks</label>
                <input type="text" value={promoteForm.remarks} onChange={(e) => setPromoteForm({ ...promoteForm, remarks: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setPromoteTarget(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Profile, Student ID Card, or Admission Paper & Iqrar Nama */}
      <PrintModal
        open={Boolean(printMode && printStudent)}
        title={
          printMode === 'id_card'
            ? 'Official Student Identity Card'
            : printMode === 'admission'
              ? 'Official Admission Form & Iqrar Nama'
              : 'Official Student Profile'
        }
        subtitle={
          printMode === 'admission'
            ? `${printStudent?.student_code || ''}${printStudent?.admission_no ? ` · ${printStudent.admission_no}` : ''}`
            : printStudent?.student_code
        }
        settings={settings}
        standalone={printMode === 'admission' || printMode === 'id_card'}
        extraPages={
          printStudent && printMode === 'admission' ? (
            <IqrarNamaSheet
              settings={settings}
              data={buildAdmissionData(printStudent, printStudent._linkedAdmission)}
            />
          ) : undefined
        }
        onClose={() => { setPrintMode(null); setPrintStudent(null); }}
      >
        {printStudent && printMode === 'id_card' && (
          <div className="flex justify-center py-6">
            <OfficialIdCard
              type="student"
              settings={settings}
              person={{
                id: printStudent.id,
                code: printStudent.student_code || '—',
                admission_no: printStudent.admission_no || '',
                full_name: printStudent.full_name || 'Student',
                father_name: printStudent.father_name || '',
                mother_name: printStudent.mother_name || '',
                dob: printStudent.dob || '',
                mobile: printStudent.mobile || '',
                address: printStudent.address || '',
                village: printStudent.village || '',
                district: printStudent.district || 'Palamu',
                state: printStudent.state || 'Jharkhand',
                pin_code: printStudent.pin_code || '',
                class_name: printStudent.class_name || 'Unassigned',
                photo_url: printStudent.photo_url || '',
                status: printStudent.status || 'active',
              }}
            />
          </div>
        )}

        {printStudent && printMode === 'admission' && (
          <AdmissionPaperSheet
            settings={settings}
            data={buildAdmissionData(printStudent, printStudent._linkedAdmission)}
          />
        )}

        {printStudent && printMode === 'profile' && (
          <div className="grid grid-cols-2 gap-3 text-xs border border-neutral-200 rounded-lg p-4">
            <div><span className="text-[#737373]">Student ID:</span> <strong className="font-mono-num">{printStudent.student_code}</strong></div>
            <div><span className="text-[#737373]">Admission No:</span> <strong className="font-mono-num">{printStudent.admission_no || '-'}</strong></div>
            <div><span className="text-[#737373]">Class:</span> <strong>{printStudent.class_name}</strong></div>
            <div><span className="text-[#737373]">Admission Date:</span> <strong className="font-mono-num">{printStudent.admission_date || '-'}</strong></div>
            <div><span className="text-[#737373]">Full Name:</span> <strong>{printStudent.full_name}</strong></div>
            <div><span className="text-[#737373]">Father&apos;s Name:</span> <strong>{printStudent.father_name}</strong></div>
            <div><span className="text-[#737373]">Date of Birth:</span> <strong className="font-mono-num">{printStudent.dob || '-'}</strong></div>
            <div><span className="text-[#737373]">Mobile:</span> <strong className="font-mono-num">{printStudent.mobile || '-'}</strong></div>
            <div className="col-span-2"><span className="text-[#737373]">Address:</span> <strong>{printStudent.address}, {printStudent.village}, {printStudent.district}</strong></div>
          </div>
        )}
      </PrintModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Deactivate Student"
        message={`Mark ${deleteTarget?.full_name} (${deleteTarget?.student_code}) as inactive?`}
        confirmLabel="Deactivate"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
