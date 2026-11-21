import React, { useEffect, useState } from 'react';
import { Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface SubjectsPageProps {
  user: User;
}

export const SubjectsPage: React.FC<SubjectsPageProps> = ({ user }) => {
  const isAdmin = user.role_slug === 'super_admin';
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '', total_marks: 100, passing_marks: 33, description: '', class_id: '', teacher_id: '' });

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ class_id: '', subject_id: '', teacher_id: '', total_marks: 100, passing_marks: 33 });
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [sRes, cRes, tRes] = await Promise.all([
        apiRequest<{ subjects: any[]; classSubjects: any[] }>('/api/subjects'),
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ teachers: any[] }>('/api/teachers'),
      ]);
      setSubjects(sRes.subjects);
      setClassSubjects(sRes.classSubjects);
      setClasses(cRes.classes);
      setTeachers(tRes.teachers);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      if (editingId) {
        await apiRequest(`/api/subjects/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Subject updated.');
      } else {
        await apiRequest('/api/subjects', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Subject added.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiRequest('/api/subjects/assign', { method: 'POST', body: JSON.stringify(assignForm) });
      setAssignOpen(false);
      setMsg('Subject mapped to class and teacher.');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      {isAdmin && (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold hover:bg-neutral-50"
          >
            <Link2 className="w-4 h-4" /> Assign Subject to Class
          </button>
          <button
            type="button"
            onClick={() => { setEditingId(null); setForm({ name: '', code: '', total_marks: 100, passing_marks: 33, description: '', class_id: '', teacher_id: '' }); setFormOpen(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Add Subject
          </button>
        </div>
      )}

      {/* Subjects Master Catalog */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-neutral-100 bg-neutral-50 text-xs font-bold text-[#171717]">
          Master Subjects Catalog
        </div>

        {/* Phone App Card List (< md) */}
        <div className="md:hidden divide-y divide-neutral-100">
          {subjects.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#737373]">No subjects added yet.</div>
          ) : (
            subjects.map((s) => (
              <div key={`m-sub-${s.id}`} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#171717]">{s.name}</div>
                    <div className="text-[11px] font-mono-num text-[#737373]">{s.code}</div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 font-mono-num text-[11px] font-bold text-[#171717]">
                    {s.passing_marks} / {s.total_marks}
                  </span>
                </div>
                <div className="text-[11px] text-[#525252] bg-neutral-50 rounded-lg px-2.5 py-1.5 border border-neutral-100">
                  <span className="text-[#737373]">Classes: </span>
                  <span className="font-medium text-[#171717]">{s.assigned_classes || 'None'}</span>
                  {s.description && <p className="text-[#737373] mt-0.5">{s.description}</p>}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(s.id);
                        setForm({ name: s.name, code: s.code, total_marks: s.total_marks, passing_marks: s.passing_marks, description: s.description || '', class_id: '', teacher_id: '' });
                        setFormOpen(true);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-[#D97706] border border-amber-200 text-[11px] font-semibold"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(s)}
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-[#DC1726] border border-red-200 text-[11px] font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Tablet & Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-neutral-200 text-[#737373]">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">Code</th>
                <th className="px-4 py-3 text-start font-semibold">Subject Name</th>
                <th className="px-4 py-3 text-start font-semibold">Marks (Pass / Total)</th>
                <th className="px-4 py-3 text-start font-semibold">Assigned Classes</th>
                <th className="px-4 py-3 text-start font-semibold">Description</th>
                {isAdmin && <th className="px-4 py-3 text-end font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {subjects.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-mono-num font-semibold">{s.code}</td>
                  <td className="px-4 py-3 font-semibold text-[#171717]">{s.name}</td>
                  <td className="px-4 py-3 font-mono-num">{s.passing_marks} / {s.total_marks}</td>
                  <td className="px-4 py-3 text-[#737373]">{s.assigned_classes || 'None'}</td>
                  <td className="px-4 py-3 text-[#737373] max-w-xs truncate">{s.description || '-'}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-end">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(s.id);
                            setForm({ name: s.name, code: s.code, total_marks: s.total_marks, passing_marks: s.passing_marks, description: s.description || '', class_id: '', teacher_id: '' });
                            setFormOpen(true);
                          }}
                          className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(s)} className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Class-Subject Mapping */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-neutral-100 bg-neutral-50 text-xs font-bold text-[#171717]">
          Class-Wise Subject &amp; Teacher Curriculum
        </div>

        {/* Phone App Card List (< md) */}
        <div className="md:hidden divide-y divide-neutral-100">
          {classSubjects.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#737373]">No class-subject mappings yet.</div>
          ) : (
            classSubjects.map((cs) => (
              <div key={`m-cs-${cs.id}`} className="p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-red-50 text-[#DC1726] text-[10px] font-bold">
                      {cs.class_name}
                    </span>
                    <span className="font-bold text-xs text-[#171717] truncate">
                      {cs.subject_name} <span className="text-[#737373] font-mono-num">({cs.subject_code})</span>
                    </span>
                  </div>
                  <div className="text-[11px] text-[#737373]">
                    Teacher: <span className="font-medium text-[#171717]">{cs.teacher_name}</span> · Marks:{' '}
                    <span className="font-mono-num font-semibold text-[#171717]">{cs.passing_marks}/{cs.total_marks}</span>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={async () => {
                      setErr('');
                      try {
                        await apiRequest(`/api/subjects/assign/${cs.id}`, { method: 'DELETE' });
                        setMsg('Class-subject assignment removed.');
                        load();
                      } catch (e: any) {
                        setErr(e.message);
                      }
                    }}
                    className="shrink-0 p-2 rounded-lg bg-red-50 text-[#DC1726] border border-red-200"
                    title="Remove assignment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Tablet & Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-neutral-200 text-[#737373]">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">Class</th>
                <th className="px-4 py-3 text-start font-semibold">Subject</th>
                <th className="px-4 py-3 text-start font-semibold">Assigned Teacher</th>
                <th className="px-4 py-3 text-start font-semibold">Pass / Total Marks</th>
                {isAdmin && <th className="px-4 py-3 text-end font-semibold">Remove</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {classSubjects.map((cs) => (
                <tr key={cs.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-semibold">{cs.class_name}</td>
                  <td className="px-4 py-3">{cs.subject_name} <span className="text-[#737373] font-mono-num">({cs.subject_code})</span></td>
                  <td className="px-4 py-3 text-[#737373]">{cs.teacher_name}</td>
                  <td className="px-4 py-3 font-mono-num">{cs.passing_marks} / {cs.total_marks}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={async () => {
                          setErr('');
                          try {
                            await apiRequest(`/api/subjects/assign/${cs.id}`, { method: 'DELETE' });
                            setMsg('Class-subject assignment removed.');
                            load();
                          } catch (e: any) {
                            setErr(e.message);
                          }
                        }}
                        className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit Subject' : 'Add New Subject'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div><label className="block font-medium mb-1">Subject Name *</label><input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div><label className="block font-medium mb-1">Subject Code *</label><input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block font-medium mb-1">Total Marks</label><input type="number" value={form.total_marks} onChange={(e) => setForm({ ...form, total_marks: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
                <div><label className="block font-medium mb-1">Passing Marks</label><input type="number" value={form.passing_marks} onChange={(e) => setForm({ ...form, passing_marks: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              </div>
              {!editingId && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Assign Class (Opt)</label>
                    <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                      <option value="">Select</option>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Teacher (Opt)</label>
                    <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                      <option value="">Select</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div><label className="block font-medium mb-1">Description</label><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Subject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleAssign} className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold">Map Subject to Class &amp; Teacher</h3>
            <div>
              <label className="block font-medium mb-1">Class *</label>
              <select required value={assignForm.class_id} onChange={(e) => setAssignForm({ ...assignForm, class_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                <option value="">Select Class</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Subject *</label>
              <select required value={assignForm.subject_id} onChange={(e) => setAssignForm({ ...assignForm, subject_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                <option value="">Select Subject</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Assigned Teacher</label>
              <select value={assignForm.teacher_id} onChange={(e) => setAssignForm({ ...assignForm, teacher_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                <option value="">Unassigned</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-medium mb-1">Total Marks</label><input type="number" value={assignForm.total_marks} onChange={(e) => setAssignForm({ ...assignForm, total_marks: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              <div><label className="block font-medium mb-1">Passing Marks</label><input type="number" value={assignForm.passing_marks} onChange={(e) => setAssignForm({ ...assignForm, passing_marks: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAssignOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Assign</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Subject"
        message={`Delete subject ${deleteTarget?.name}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/subjects/${deleteTarget.id}`, { method: 'DELETE' });
            setMsg('Subject deleted.');
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
