import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Eye, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface ClassesPageProps {
  user: User;
}

export const ClassesPage: React.FC<ClassesPageProps> = ({ user }) => {
  const isAdmin = user.role_slug === 'super_admin';
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '', academic_session_id: '', class_teacher_id: '', room_no: '', status: 'active' });

  const [viewClass, setViewClass] = useState<any>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [transferSource, setTransferSource] = useState<any>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [cRes, tRes, sRes] = await Promise.all([
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ teachers: any[] }>('/api/teachers'),
        apiRequest<{ sessions: any[] }>('/api/settings'),
      ]);
      setClasses(cRes.classes);
      setTeachers(tRes.teachers);
      setSessions(sRes.sessions);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openStudentsModal = async (cls: any) => {
    setViewClass(cls);
    try {
      const res = await apiRequest<{ students: any[] }>(`/api/students?classId=${cls.id}`);
      setClassStudents(res.students);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      if (editingId) {
        await apiRequest(`/api/classes/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Class updated.');
      } else {
        const { class_teacher_id: _ignored, ...createPayload } = form;
        await apiRequest('/api/classes', { method: 'POST', body: JSON.stringify(createPayload) });
        setMsg('Class created.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSource || !transferTargetId) return;
    setErr('');
    try {
      const res = await apiRequest<{ transferred: number }>(`/api/classes/${transferSource.id}/transfer-students`, {
        method: 'POST',
        body: JSON.stringify({ to_class_id: transferTargetId }),
      });
      setTransferSource(null);
      setMsg(`Transferred ${res.transferred} student(s) successfully.`);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setErr('');
    try {
      await apiRequest(`/api/classes/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setMsg('Class deleted.');
      load();
    } catch (e: any) {
      setDeleteTarget(null);
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({ name: '', code: '', academic_session_id: String(sessions.find((s) => s.is_active)?.id || ''), class_teacher_id: '', room_no: '', status: 'active' });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Add Class
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-mono-num text-[#737373]">{c.code} · {c.session_name}</div>
                <h3 className="text-base font-bold text-[#171717] mt-0.5">{c.name}</h3>
                <div className="text-xs text-[#737373] mt-0.5">Class Teacher: <strong className="text-[#171717]">{c.class_teacher_name}</strong></div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-[#0EA5E9] font-mono-num">
                <Users className="w-4 h-4" />
                <span>{c.student_count}</span>
              </div>
            </div>

            <div className="text-xs text-[#737373]">
              Subjects ({(c.subjects || []).length}): {(c.subjects || []).map((s: any) => s.subject_name).join(', ') || 'None assigned'}
            </div>

            <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => openStudentsModal(c)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0EA5E9] hover:underline"
              >
                <Eye className="w-3.5 h-3.5" /> Student List
              </button>

              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setTransferSource(c); setTransferTargetId(''); }}
                    title="Transfer Students"
                    className="p-1.5 rounded-md text-[#14B8A6] hover:bg-teal-50"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setForm({
                        name: c.name,
                        code: c.code,
                        academic_session_id: String(c.academic_session_id || ''),
                        class_teacher_id: String(c.class_teacher_id || ''),
                        room_no: c.room_no || '',
                        status: c.status,
                      });
                      setFormOpen(true);
                    }}
                    title="Edit"
                    className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(c)} title="Delete" className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit Class' : 'Create Class'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div><label className="block font-medium mb-1">Class Name *</label><input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div><label className="block font-medium mb-1">Class Code *</label><input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CLS-06" className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              {editingId && (
                <div>
                  <label className="block font-medium mb-1">Class Teacher</label>
                  <select value={form.class_teacher_id} onChange={(e) => setForm({ ...form, class_teacher_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="">Unassigned</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block font-medium mb-1">Academic Session</label>
                <select value={form.academic_session_id} onChange={(e) => setForm({ ...form, academic_session_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label className="block font-medium mb-1">Room No</label><input type="text" value={form.room_no} onChange={(e) => setForm({ ...form, room_no: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Class</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewClass && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{viewClass.name} — Enrolled Students ({classStudents.length})</h3>
              <button type="button" onClick={() => setViewClass(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
              {classStudents.length === 0 ? <p className="py-6 text-center text-[#737373]">No students enrolled in this class.</p> : classStudents.map((st) => (
                <div key={st.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-[#171717]">{st.full_name}</div>
                    <div className="text-[#737373]">Father: {st.father_name}</div>
                  </div>
                  <span className="font-mono-num font-medium">{st.student_code}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {transferSource && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleTransfer} className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold">Transfer All Active Students from {transferSource.name}</h3>
            <div>
              <label className="block font-medium mb-1">Destination Class *</label>
              <select required value={transferTargetId} onChange={(e) => setTransferTargetId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                <option value="">Select Class</option>
                {classes.filter((c) => c.id !== transferSource.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTransferSource(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Transfer Students</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Class"
        message={`Delete ${deleteTarget?.name}? Classes with active students cannot be deleted until students are transferred.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
