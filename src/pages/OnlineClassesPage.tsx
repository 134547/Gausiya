import React, { useEffect, useState } from 'react';
import { Calendar, Clock, ExternalLink, Monitor, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { User } from '../types.ts';

interface OnlineClassesPageProps {
  user: User;
}

export const OnlineClassesPage: React.FC<OnlineClassesPageProps> = ({ user }) => {
  const canManage = user.role_slug === 'super_admin' || user.role_slug === 'teacher';
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    class_id: '',
    subject_id: '',
    teacher_id: '',
    meeting_date: new Date().toISOString().slice(0, 10),
    start_time: '10:00',
    end_time: '11:00',
    platform: 'Google Meet',
    meeting_url: '',
    instructions: '',
    status: 'scheduled',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [ocRes, cRes, sRes, tRes] = await Promise.all([
        apiRequest<{ onlineClasses: any[] }>('/api/online-classes'),
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ subjects: any[] }>('/api/subjects'),
        apiRequest<{ teachers: any[] }>('/api/teachers'),
      ]);
      setItems(ocRes.onlineClasses);
      setClasses(cRes.classes);
      setSubjects(sRes.subjects);
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
        await apiRequest(`/api/online-classes/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Online class updated.');
      } else {
        await apiRequest('/api/online-classes', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Online class scheduled and students/parents notified.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#737373]">Schedule and share external meeting links (Google Meet, Zoom, Microsoft Teams) for authorized students.</p>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({
                title: '',
                class_id: String(classes[0]?.id || ''),
                subject_id: String(subjects[0]?.id || ''),
                teacher_id: String(teachers[0]?.id || ''),
                meeting_date: new Date().toISOString().slice(0, 10),
                start_time: '10:00',
                end_time: '11:00',
                platform: 'Google Meet',
                meeting_url: '',
                instructions: '',
                status: 'scheduled',
              });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Schedule Online Class
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((oc) => (
          <div key={oc.id} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-[#0EA5E9] font-semibold">{oc.platform} · {oc.class_name}</div>
                <h3 className="text-base font-bold text-[#171717] mt-0.5">{oc.title}</h3>
                <div className="text-xs text-[#737373] mt-0.5">
                  {oc.subject_name ? `${oc.subject_name} · ` : ''}Instructor: {oc.teacher_name}
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(oc.id);
                      setForm({ ...oc, class_id: String(oc.class_id), subject_id: String(oc.subject_id || ''), teacher_id: String(oc.teacher_id) });
                      setFormOpen(true);
                    }}
                    className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setErr('');
                      try {
                        await apiRequest(`/api/online-classes/${oc.id}`, { method: 'DELETE' });
                        setMsg('Online class removed.');
                        load();
                      } catch (e: any) {
                        setErr(e.message);
                      }
                    }}
                    className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono-num text-[#171717]">
              <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-[#DC1726]" /> {oc.meeting_date}</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#10B981]" /> {oc.start_time} – {oc.end_time}</span>
              <span className="capitalize font-semibold text-[#737373]">Status: {oc.status}</span>
            </div>

            {oc.instructions && <p className="text-xs text-[#737373] bg-neutral-50 p-2.5 rounded-lg">{oc.instructions}</p>}

            <div className="pt-2">
              <a
                href={oc.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Join {oc.platform} Session</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="max-w-lg w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit Online Class' : 'Schedule Online Class'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div><label className="block font-medium mb-1">Class / Session Title *</label><input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Class *</label>
                <select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Subject</label>
                <select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  <option value="">General</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Teacher</label>
                <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="block font-medium mb-1">Date *</label><input type="date" required value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              <div><label className="block font-medium mb-1">Start Time *</label><input type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              <div><label className="block font-medium mb-1">End Time *</label><input type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Meeting Platform *</label>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  <option value="Google Meet">Google Meet</option>
                  <option value="Zoom">Zoom</option>
                  <option value="Microsoft Teams">Microsoft Teams</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  <option value="scheduled">Scheduled</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div><label className="block font-medium mb-1">Meeting URL *</label><input type="url" required value={form.meeting_url} onChange={(e) => setForm({ ...form, meeting_url: e.target.value })} placeholder="https://meet.google.com/..." className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div><label className="block font-medium mb-1">Instructions</label><textarea rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Class</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
