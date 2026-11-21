import React, { useEffect, useState } from 'react';
import { BookOpen, CheckSquare, CreditCard, FileUp, KeyRound, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PrintModal } from '../components/PrintModal.tsx';
import { OfficialIdCard } from '../components/OfficialIdCard.tsx';

interface TeachersPageProps {
  user: User;
  settings: MadrasaSettings | null;
}

const emptyTeacher = {
  full_name: '',
  father_name: '',
  dob: '',
  gender: 'Male',
  mobile: '',
  email: '',
  address: '',
  qualification: '',
  joining_date: new Date().toISOString().slice(0, 10),
  photo_url: '',
  employment_status: 'active',
  remarks: '',
};

export const TeachersPage: React.FC<TeachersPageProps> = ({ user, settings }) => {
  const isAdmin = user.role_slug === 'super_admin';
  const [tab, setTab] = useState<'directory' | 'attendance'>('directory');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [attRecords, setAttRecords] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyTeacher);

  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [selectedPairs, setSelectedPairs] = useState<{ class_id: string; subject_id: string | null; is_class_teacher?: boolean }[]>([]);

  const [loginTarget, setLoginTarget] = useState<any>(null);
  const [loginCreds, setLoginCreds] = useState({ username: '', password: '' });
  const [printTeacher, setPrintTeacher] = useState<any>(null);
  const [printTeacherMode, setPrintTeacherMode] = useState<'profile' | 'id_card'>('profile');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [tRes, cRes, sRes] = await Promise.all([
        apiRequest<{ teachers: any[]; assignments: any[] }>('/api/teachers'),
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ subjects: any[] }>('/api/subjects'),
      ]);
      setTeachers(tRes.teachers);
      setAssignments(tRes.assignments);
      setClasses(cRes.classes);
      setSubjects(sRes.subjects);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loadAttendance = async (d: string) => {
    if (!isAdmin) return;
    try {
      const res = await apiRequest<{ records: any[] }>(`/api/teacher-attendance?date=${d}`);
      setAttRecords(res.records.map((r) => ({ ...r, status: r.status === 'unmarked' ? 'present' : r.status })));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (tab === 'attendance') loadAttendance(attDate);
  }, [tab, attDate]);

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      if (editingId) {
        await apiRequest(`/api/teachers/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Teacher updated.');
      } else {
        await apiRequest('/api/teachers', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Teacher added.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const openAssign = (t: any) => {
    setAssignTarget(t);
    setSelectedPairs(
      assignments
        .filter((a) => a.teacher_id === t.id)
        .map((a) => ({ class_id: a.class_id, subject_id: a.subject_id, is_class_teacher: Boolean(a.is_class_teacher) }))
    );
  };

  const handleSaveAssign = async () => {
    if (!assignTarget) return;
    try {
      await apiRequest(`/api/teachers/${assignTarget.id}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ assignments: selectedPairs }),
      });
      setAssignTarget(null);
      setMsg('Class & subject assignments updated.');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleCreateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginTarget) return;
    try {
      await apiRequest(`/api/teachers/${loginTarget.id}/create-login`, {
        method: 'POST',
        body: JSON.stringify(loginCreds),
      });
      setLoginTarget(null);
      setMsg(`Login account created for ${loginTarget.full_name}.`);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleSaveAttendance = async () => {
    try {
      await apiRequest('/api/teacher-attendance', {
        method: 'POST',
        body: JSON.stringify({ date: attDate, records: attRecords }),
      });
      setMsg(`Teacher attendance saved for ${attDate}.`);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-neutral-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('directory')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'directory' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'}`}
          >
            Teachers Directory
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab('attendance')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'attendance' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'}`}
            >
              Teacher Attendance
            </button>
          )}
        </div>

        {isAdmin && tab === 'directory' && (
          <button
            type="button"
            onClick={() => { setEditingId(null); setForm(emptyTeacher); setFormOpen(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Add Teacher
          </button>
        )}
      </div>

      {tab === 'directory' ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
          {/* Phone App Card List */}
          <div className="md:hidden divide-y divide-neutral-100">
            {teachers.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#737373]">No teachers found.</div>
            ) : (
              teachers.map((t) => (
                <div key={t.id} className="p-3.5 space-y-2.5 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#171717] truncate">{t.full_name}</div>
                      <div className="text-[11px] font-mono-num text-[#737373]">{t.teacher_code} · {t.qualification || 'Faculty'}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      {t.employment_status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-50/80 rounded-lg p-2.5 border border-neutral-100">
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Classes &amp; Subjects</span>
                      <span className="font-medium text-[#171717] block">{t.assigned_classes || 'Unassigned'}</span>
                      {t.assigned_subjects && <span className="text-[10px] text-[#0EA5E9] block">{t.assigned_subjects}</span>}
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Mobile</span>
                      <span className="font-mono-num text-[#171717] block">{t.mobile || '-'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => { setPrintTeacher(t); setPrintTeacherMode('id_card'); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-[#1D56B8] text-[11px] font-semibold"><CreditCard className="w-3.5 h-3.5" /> ID</button>
                    <button type="button" onClick={() => { setPrintTeacher(t); setPrintTeacherMode('profile'); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 text-[#171717] text-[11px] font-semibold"><Printer className="w-3.5 h-3.5" /> Print</button>
                    {isAdmin && (
                      <>
                        <button type="button" onClick={() => openAssign(t)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 text-[#0EA5E9] text-[11px] font-semibold"><BookOpen className="w-3.5 h-3.5" /> Assign</button>
                        {!t.user_id && (
                          <button type="button" onClick={() => { setLoginTarget(t); setLoginCreds({ username: t.full_name.toLowerCase().replace(/\s+/g, '.'), password: '' }); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-[#10B981] text-[11px] font-semibold"><KeyRound className="w-3.5 h-3.5" /> Login</button>
                        )}
                        <button type="button" onClick={() => { setEditingId(t.id); setForm({ ...emptyTeacher, ...t }); setFormOpen(true); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-[#F59E0B] text-[11px] font-semibold"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                        <button type="button" onClick={() => setDeleteTarget(t)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-[#DC1726] text-[11px] font-semibold"><Trash2 className="w-3.5 h-3.5" /></button>
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
                  <th className="px-4 py-3 text-start font-semibold">Teacher ID</th>
                  <th className="px-4 py-3 text-start font-semibold">Full Name</th>
                  <th className="px-4 py-3 text-start font-semibold">Qualification</th>
                  <th className="px-4 py-3 text-start font-semibold">Assigned Classes &amp; Subjects</th>
                  <th className="px-4 py-3 text-start font-semibold">Mobile</th>
                  <th className="px-4 py-3 text-start font-semibold">Status</th>
                  <th className="px-4 py-3 text-end font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono-num font-semibold">{t.teacher_code}</td>
                    <td className="px-4 py-3 font-semibold text-[#171717]">{t.full_name}</td>
                    <td className="px-4 py-3 text-[#737373]">{t.qualification || '-'}</td>
                    <td className="px-4 py-3 text-[#737373]">
                      <div>{t.assigned_classes || 'Unassigned'}</div>
                      <div className="text-[11px] text-[#0EA5E9]">{t.assigned_subjects || ''}</div>
                    </td>
                    <td className="px-4 py-3 font-mono-num">{t.mobile}</td>
                    <td className="px-4 py-3 capitalize font-semibold text-[#10B981]">{t.employment_status}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => { setPrintTeacher(t); setPrintTeacherMode('id_card'); }} title="Print Teacher ID Card" className="p-1.5 rounded-md text-[#1D56B8] hover:bg-blue-50"><CreditCard className="w-4 h-4" /></button>
                        <button type="button" onClick={() => { setPrintTeacher(t); setPrintTeacherMode('profile'); }} title="Print Profile" className="p-1.5 rounded-md hover:bg-neutral-100"><Printer className="w-4 h-4" /></button>
                        {isAdmin && (
                          <>
                            <button type="button" onClick={() => openAssign(t)} title="Assign Classes & Subjects" className="p-1.5 rounded-md text-[#0EA5E9] hover:bg-sky-50"><BookOpen className="w-4 h-4" /></button>
                            {!t.user_id && (
                              <button type="button" onClick={() => { setLoginTarget(t); setLoginCreds({ username: t.full_name.toLowerCase().replace(/\s+/g, '.'), password: '' }); }} title="Create Teacher Login" className="p-1.5 rounded-md text-[#10B981] hover:bg-emerald-50"><KeyRound className="w-4 h-4" /></button>
                            )}
                            <button type="button" onClick={() => { setEditingId(t.id); setForm({ ...emptyTeacher, ...t }); setFormOpen(true); }} title="Edit" className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"><Pencil className="w-4 h-4" /></button>
                            <button type="button" onClick={() => setDeleteTarget(t)} title="Delete" className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold">Date:</label>
              <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-neutral-200 font-mono-num flex-1 sm:flex-none" />
            </div>
            <button type="button" onClick={handleSaveAttendance} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 w-full sm:w-auto">
              <CheckSquare className="w-4 h-4" /> Save Teacher Attendance
            </button>
          </div>

          {/* Phone Attendance Cards */}
          <div className="md:hidden divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
            {attRecords.map((r, idx) => (
              <div key={r.teacher_id} className="p-3.5 space-y-2.5 bg-white">
                <div className="font-semibold text-sm text-[#171717]">
                  {r.full_name} <span className="text-xs text-[#737373] font-mono-num">({r.teacher_code})</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['present', 'absent', 'late', 'leave'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        const next = [...attRecords];
                        next[idx].status = st;
                        setAttRecords(next);
                      }}
                      className={`py-2 rounded-lg text-[11px] font-semibold capitalize border ${
                        r.status === st ? 'bg-[#171717] text-white border-[#171717]' : 'bg-white text-[#737373] border-neutral-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={r.remark || ''}
                  onChange={(e) => {
                    const next = [...attRecords];
                    next[idx].remark = e.target.value;
                    setAttRecords(next);
                  }}
                  placeholder="Optional remark"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200"
                />
              </div>
            ))}
          </div>

          {/* Desktop Attendance Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                <tr>
                  <th className="px-4 py-2.5 text-start">Teacher</th>
                  <th className="px-4 py-2.5 text-start">Status</th>
                  <th className="px-4 py-2.5 text-start">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {attRecords.map((r, idx) => (
                  <tr key={r.teacher_id}>
                    <td className="px-4 py-2.5 font-medium">{r.full_name} <span className="text-[#737373] font-mono-num">({r.teacher_code})</span></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        {(['present', 'absent', 'late', 'leave'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              const next = [...attRecords];
                              next[idx].status = st;
                              setAttRecords(next);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize border ${
                              r.status === st ? 'bg-[#171717] text-white border-[#171717]' : 'bg-white text-[#737373] border-neutral-200'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        value={r.remark || ''}
                        onChange={(e) => {
                          const next = [...attRecords];
                          next[idx].remark = e.target.value;
                          setAttRecords(next);
                        }}
                        placeholder="Optional remark"
                        className="w-full px-2.5 py-1 rounded border border-neutral-200"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Teacher Form Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit Teacher' : 'Add New Teacher'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveTeacher} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block font-medium mb-1">Full Name *</label><input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div><label className="block font-medium mb-1">Father&apos;s Name</label><input type="text" value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div><label className="block font-medium mb-1">Mobile *</label><input type="text" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              <div><label className="block font-medium mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div><label className="block font-medium mb-1">Qualification</label><input type="text" value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div><label className="block font-medium mb-1">Joining Date</label><input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              <div className="sm:col-span-2"><label className="block font-medium mb-1">Address</label><input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div className="sm:col-span-2 flex items-center gap-3">
                {form.photo_url && <img src={form.photo_url} alt="Teacher" className="w-12 h-12 rounded-full object-cover" />}
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5" /> Upload Photograph
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setErr('');
                    try {
                      const up = await uploadFile(f, 'teacher-photos');
                      setForm((prev) => ({ ...prev, photo_url: up.url }));
                    } catch (errUpload: any) {
                      setErr(errUpload.message);
                    } finally {
                      e.target.value = '';
                    }
                  }} className="hidden" />
                </label>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Teacher</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Classes & Subjects Modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold">Assign Classes &amp; Subjects — {assignTarget.full_name}</h3>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {classes.map((cls) => (
                <div key={cls.id} className="p-3 rounded-lg border border-neutral-200 space-y-2">
                  <div className="font-semibold text-[#171717]">{cls.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {subjects.map((sub) => {
                      const active = selectedPairs.some((p) => p.class_id === cls.id && p.subject_id === sub.id);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            if (active) {
                              setSelectedPairs(selectedPairs.filter((p) => !(p.class_id === cls.id && p.subject_id === sub.id)));
                            } else {
                              setSelectedPairs([...selectedPairs, { class_id: cls.id, subject_id: sub.id }]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded border text-[11px] font-medium ${
                            active ? 'bg-[#DC1726] text-white border-[#DC1726]' : 'bg-neutral-50 text-[#171717] border-neutral-200'
                          }`}
                        >
                          {sub.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAssignTarget(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="button" onClick={handleSaveAssign} className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Assignments</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Teacher Login Modal */}
      {loginTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateLogin} className="max-w-sm w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold">Create Teacher Login — {loginTarget.full_name}</h3>
            <div><label className="block font-medium mb-1">Username *</label><input type="text" required value={loginCreds.username} onChange={(e) => setLoginCreds({ ...loginCreds, username: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div><label className="block font-medium mb-1">Initial Password (min 6 chars) *</label><input type="password" required minLength={6} value={loginCreds.password} onChange={(e) => setLoginCreds({ ...loginCreds, password: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setLoginTarget(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Create Account</button>
            </div>
          </form>
        </div>
      )}

      <PrintModal
        open={Boolean(printTeacher)}
        title={printTeacherMode === 'id_card' ? 'Official Teacher Identity Card' : 'Teacher Profile'}
        subtitle={printTeacher?.teacher_code}
        settings={settings}
        standalone={printTeacherMode === 'id_card'}
        onClose={() => setPrintTeacher(null)}
      >
        {printTeacher && printTeacherMode === 'id_card' && (
          <div className="flex justify-center py-6">
            <OfficialIdCard
              type="teacher"
              settings={settings}
              person={{
                id: printTeacher.id,
                code: printTeacher.teacher_code || '—',
                full_name: printTeacher.full_name || 'Teacher',
                father_name: printTeacher.father_name || '',
                dob: printTeacher.dob || '',
                mobile: printTeacher.mobile || '',
                address: printTeacher.address || '',
                qualification: printTeacher.qualification || '',
                joining_date: printTeacher.joining_date || '',
                photo_url: printTeacher.photo_url || '',
                status: printTeacher.employment_status || 'active',
              }}
            />
          </div>
        )}
        {printTeacher && printTeacherMode === 'profile' && (
          <div className="grid grid-cols-2 gap-3 text-xs border border-neutral-200 rounded-lg p-4">
            <div><span className="text-[#737373]">Teacher ID:</span> <strong className="font-mono-num">{printTeacher.teacher_code}</strong></div>
            <div><span className="text-[#737373]">Full Name:</span> <strong>{printTeacher.full_name}</strong></div>
            <div><span className="text-[#737373]">Qualification:</span> <strong>{printTeacher.qualification}</strong></div>
            <div><span className="text-[#737373]">Joining Date:</span> <strong className="font-mono-num">{printTeacher.joining_date}</strong></div>
            <div><span className="text-[#737373]">Mobile:</span> <strong className="font-mono-num">{printTeacher.mobile}</strong></div>
            <div><span className="text-[#737373]">Email:</span> <strong>{printTeacher.email || '-'}</strong></div>
            <div className="col-span-2"><span className="text-[#737373]">Address:</span> <strong>{printTeacher.address}</strong></div>
            <div className="col-span-2"><span className="text-[#737373]">Assigned Classes:</span> <strong>{printTeacher.assigned_classes || 'None'}</strong></div>
          </div>
        )}
      </PrintModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove Teacher"
        message={`Mark ${deleteTarget?.full_name} as inactive?`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/teachers/${deleteTarget.id}`, { method: 'DELETE' });
            setMsg('Teacher removed.');
            load();
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
