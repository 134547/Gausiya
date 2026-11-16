import React, { useEffect, useState } from 'react';
import { Calendar, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PrintModal } from '../components/PrintModal.tsx';

interface ExaminationsPageProps {
  user: User;
  settings: MadrasaSettings | null;
}

export const ExaminationsPage: React.FC<ExaminationsPageProps> = ({ user, settings }) => {
  const isAdmin = user.role_slug === 'super_admin';
  const [exams, setExams] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    exam_type: 'Term Exam',
    class_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    instructions: '',
    status: 'scheduled',
    subjects: [] as { subject_id: string; exam_date: string; start_time: string; end_time: string; total_marks: number; passing_marks: number; room_no: string }[],
  });

  const [printExam, setPrintExam] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [eRes, cRes, sRes] = await Promise.all([
        apiRequest<{ examinations: any[] }>('/api/examinations'),
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ subjects: any[] }>('/api/subjects'),
      ]);
      setExams(eRes.examinations);
      setClasses(cRes.classes);
      setSubjects(sRes.subjects);
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
        await apiRequest(`/api/examinations/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Examination updated.');
      } else {
        await apiRequest('/api/examinations', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Examination created and schedule published.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const addSubjectRow = () => {
    const firstSub = String(subjects[0]?.id || '');
    setForm((f) => ({
      ...f,
      subjects: [...f.subjects, { subject_id: firstSub, exam_date: f.start_date, start_time: '09:00', end_time: '12:00', total_marks: 100, passing_marks: 33, room_no: 'Hall A' }],
    }));
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
              setForm({
                name: '',
                exam_type: 'Term Exam',
                class_id: String(classes[0]?.id || ''),
                start_date: new Date().toISOString().slice(0, 10),
                end_date: new Date().toISOString().slice(0, 10),
                instructions: 'Bring official Madrasa ID Card.',
                status: 'scheduled',
                subjects: [],
              });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Create Examination
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {exams.map((ex) => (
          <div key={ex.id} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-[#737373] font-mono-num">{ex.exam_type} · {ex.class_name} · {ex.session_name}</div>
                <h3 className="text-base font-bold text-[#171717] mt-0.5">{ex.name}</h3>
                <div className="flex items-center gap-2 text-xs text-[#737373] mt-1 font-mono-num">
                  <Calendar className="w-3.5 h-3.5 text-[#DC1726]" />
                  <span>{ex.start_date} to {ex.end_date || ex.start_date}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPrintExam(ex)} title="Print Schedule" className="p-1.5 rounded-md hover:bg-neutral-100"><Printer className="w-4 h-4" /></button>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(ex.id);
                        setForm({
                          name: ex.name,
                          exam_type: ex.exam_type,
                          class_id: String(ex.class_id),
                          start_date: ex.start_date,
                          end_date: ex.end_date || ex.start_date,
                          instructions: ex.instructions || '',
                          status: ex.status,
                          subjects: (ex.subjects || []).map((s: any) => ({
                            subject_id: s.subject_id,
                            exam_date: s.exam_date,
                            start_time: s.start_time,
                            end_time: s.end_time,
                            total_marks: s.total_marks,
                            passing_marks: s.passing_marks,
                            room_no: s.room_no || '',
                          })),
                        });
                        setFormOpen(true);
                      }}
                      className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(ex)} className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>

            {ex.instructions && <p className="text-xs text-[#737373] bg-neutral-50 p-2.5 rounded-lg">{ex.instructions}</p>}

            <div className="border-t border-neutral-100 pt-3">
              <div className="text-[11px] font-semibold text-[#737373] mb-2">Examination Schedule ({(ex.subjects || []).length} Subjects)</div>
              {(ex.subjects || []).length === 0 ? (
                <p className="text-xs text-[#737373]">No subjects scheduled yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {ex.subjects.map((s: any) => (
                    <div key={s.id} className="text-xs flex items-center justify-between bg-neutral-50 px-3 py-2 rounded">
                      <span className="font-medium text-[#171717]">{s.subject_name}</span>
                      <span className="font-mono-num text-[#737373]">{s.exam_date} · {s.start_time}-{s.end_time} · {s.total_marks}m</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-3xl bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit Examination' : 'Create Examination & Schedule'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="block font-medium mb-1">Exam Name *</label><input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div>
                  <label className="block font-medium mb-1">Exam Type</label>
                  <select value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="Term Exam">Term Exam</option>
                    <option value="Half-Yearly">Half-Yearly</option>
                    <option value="Annual Exam">Annual Exam</option>
                    <option value="Unit Test">Unit Test</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Class *</label>
                  <select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="block font-medium mb-1">Start Date *</label><input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
                <div><label className="block font-medium mb-1">End Date</label><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
                <div>
                  <label className="block font-medium mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="scheduled">Scheduled</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div><label className="block font-medium mb-1">Examination Instructions</label><textarea rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Subject Timetable</span>
                  <button type="button" onClick={addSubjectRow} className="px-3 py-1 rounded bg-neutral-100 hover:bg-neutral-200 font-medium">+ Add Subject</button>
                </div>
                {form.subjects.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center bg-neutral-50 p-2 rounded-lg">
                    <select
                      value={row.subject_id}
                      onChange={(e) => {
                        const next = [...form.subjects];
                        next[idx].subject_id = e.target.value;
                        setForm({ ...form, subjects: next });
                      }}
                      className="px-2 py-1.5 rounded border border-neutral-200 bg-white"
                    >
                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input type="date" value={row.exam_date} onChange={(e) => { const n = [...form.subjects]; n[idx].exam_date = e.target.value; setForm({ ...form, subjects: n }); }} className="px-2 py-1.5 rounded border border-neutral-200 font-mono-num" />
                    <input type="time" value={row.start_time} onChange={(e) => { const n = [...form.subjects]; n[idx].start_time = e.target.value; setForm({ ...form, subjects: n }); }} className="px-2 py-1.5 rounded border border-neutral-200 font-mono-num" />
                    <input type="number" value={row.total_marks} onChange={(e) => { const n = [...form.subjects]; n[idx].total_marks = Number(e.target.value); setForm({ ...form, subjects: n }); }} placeholder="Total" className="px-2 py-1.5 rounded border border-neutral-200 font-mono-num" />
                    <input type="number" value={row.passing_marks} onChange={(e) => { const n = [...form.subjects]; n[idx].passing_marks = Number(e.target.value); setForm({ ...form, subjects: n }); }} placeholder="Pass" className="px-2 py-1.5 rounded border border-neutral-200 font-mono-num" />
                    <button type="button" onClick={() => setForm({ ...form, subjects: form.subjects.filter((_, i) => i !== idx) })} className="text-[#DC1726] font-semibold">Remove</button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Examination</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PrintModal open={Boolean(printExam)} title="Official Examination Schedule" subtitle={`${printExam?.name} — ${printExam?.class_name}`} settings={settings} onClose={() => setPrintExam(null)}>
        {printExam && (
          <div className="space-y-4 text-xs">
            <div className="flex justify-between">
              <span><strong>Exam:</strong> {printExam.name} ({printExam.exam_type})</span>
              <span><strong>Class:</strong> {printExam.class_name}</span>
            </div>
            <table className="w-full border-collapse border border-neutral-300">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="border border-neutral-300 px-3 py-2 text-start">Subject</th>
                  <th className="border border-neutral-300 px-3 py-2 text-start">Date</th>
                  <th className="border border-neutral-300 px-3 py-2 text-start">Timing</th>
                  <th className="border border-neutral-300 px-3 py-2 text-end">Total / Pass Marks</th>
                </tr>
              </thead>
              <tbody>
                {(printExam.subjects || []).map((s: any) => (
                  <tr key={s.id}>
                    <td className="border border-neutral-300 px-3 py-2 font-medium">{s.subject_name}</td>
                    <td className="border border-neutral-300 px-3 py-2 font-mono-num">{s.exam_date}</td>
                    <td className="border border-neutral-300 px-3 py-2 font-mono-num">{s.start_time} – {s.end_time}</td>
                    <td className="border border-neutral-300 px-3 py-2 text-end font-mono-num">{s.passing_marks} / {s.total_marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {printExam.instructions && <p className="text-[#737373]"><strong>Instructions:</strong> {printExam.instructions}</p>}
          </div>
        )}
      </PrintModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Examination"
        message={`Delete ${deleteTarget?.name}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/examinations/${deleteTarget.id}`, { method: 'DELETE' });
            setMsg('Examination deleted.');
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
