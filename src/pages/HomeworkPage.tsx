import React, { useEffect, useState } from 'react';
import { CheckSquare, FileUp, Plus, Send, Trash2, X } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { User } from '../types.ts';

interface HomeworkPageProps {
  user: User;
}

export const HomeworkPage: React.FC<HomeworkPageProps> = ({ user }) => {
  const canManage = user.role_slug === 'super_admin' || user.role_slug === 'teacher';
  const canSubmit = user.role_slug === 'student' || user.role_slug === 'parent';

  const [homework, setHomework] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [myChildren, setMyChildren] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    class_id: '',
    subject_id: '',
    teacher_id: '',
    title: '',
    description: '',
    attachment_url: '',
    attachment_name: '',
    submission_deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    allow_submission: true,
  });

  const [submitTarget, setSubmitTarget] = useState<any>(null);
  const [subForm, setSubForm] = useState({ student_id: '', submission_text: '', attachment_url: '', attachment_name: '' });

  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [reviewForm, setReviewForm] = useState({ feedback: '', grade: 'A', status: 'reviewed' });

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [hwRes, cRes, sRes, tRes] = await Promise.all([
        apiRequest<{ homework: any[] }>('/api/homework'),
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ subjects: any[] }>('/api/subjects'),
        apiRequest<{ teachers: any[] }>('/api/teachers'),
      ]);
      setHomework(hwRes.homework);
      setClasses(cRes.classes);
      setSubjects(sRes.subjects);
      setTeachers(tRes.teachers);
      if (user.role_slug === 'parent') {
        const stRes = await apiRequest<{ students: any[] }>('/api/students');
        setMyChildren(stRes.students);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/homework', { method: 'POST', body: JSON.stringify(form) });
      setFormOpen(false);
      setMsg('Homework assigned and students/parents notified.');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleSubmitHw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitTarget) return;
    try {
      await apiRequest(`/api/homework/${submitTarget.id}/submit`, { method: 'POST', body: JSON.stringify(subForm) });
      setSubmitTarget(null);
      setMsg('Homework submitted successfully.');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    try {
      await apiRequest(`/api/homework/submissions/${reviewTarget.id}/review`, { method: 'POST', body: JSON.stringify(reviewForm) });
      setReviewTarget(null);
      setMsg('Submission feedback saved.');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setForm({
                class_id: String(classes[0]?.id || ''),
                subject_id: String(subjects[0]?.id || ''),
                teacher_id: String(teachers[0]?.id || ''),
                title: '',
                description: '',
                attachment_url: '',
                attachment_name: '',
                submission_deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
                allow_submission: true,
              });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Assign Homework
          </button>
        </div>
      )}

      <div className="space-y-4">
        {homework.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center text-xs text-[#737373]">No homework assigned yet.</div>
        ) : (
          homework.map((hw) => (
            <div key={hw.id} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-[#737373] font-mono-num">
                    {hw.class_name} · {hw.subject_name} · By {hw.teacher_name}
                  </div>
                  <h3 className="text-base font-bold text-[#171717] mt-0.5">{hw.title}</h3>
                  <p className="text-xs text-[#737373] mt-1 leading-relaxed">{hw.description}</p>
                  {hw.attachment_url && (
                    <a href={hw.attachment_url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs font-semibold text-[#0EA5E9] hover:underline">
                      Attachment: {hw.attachment_name || 'Download'}
                    </a>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="text-xs font-mono-num font-semibold text-[#DC1726]">Due: {hw.submission_deadline}</span>
                  <div className="flex items-center gap-2">
                    {canSubmit && Boolean(hw.allow_submission) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSubmitTarget(hw);
                          setSubForm({ student_id: String(myChildren[0]?.id || ''), submission_text: '', attachment_url: '', attachment_name: '' });
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800"
                      >
                        <Send className="w-3.5 h-3.5" /> Submit Work
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={async () => {
                          setErr('');
                          try {
                            await apiRequest(`/api/homework/${hw.id}`, { method: 'DELETE' });
                            setMsg('Homework deleted.');
                            load();
                          } catch (e: any) {
                            setErr(e.message);
                          }
                        }}
                        className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Submissions Section */}
              {(hw.submissions || []).length > 0 && (
                <div className="pt-3 border-t border-neutral-100 space-y-2">
                  <div className="text-[11px] font-semibold text-[#737373]">Submissions ({hw.submissions.length})</div>
                  {hw.submissions.map((sub: any) => (
                    <div key={sub.id} className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-semibold text-[#171717]">{sub.student_name} <span className="font-mono-num text-[#737373]">({sub.student_code})</span></div>
                        <p className="text-[#737373] mt-0.5">{sub.submission_text}</p>
                        {sub.attachment_url && (
                          <a href={sub.attachment_url} target="_blank" rel="noreferrer" className="text-[#0EA5E9] hover:underline">
                            File: {sub.attachment_name || 'View'}
                          </a>
                        )}
                        {sub.feedback && <div className="mt-1 text-[#10B981] font-medium">Feedback: {sub.feedback} (Grade: {sub.grade})</div>}
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => { setReviewTarget(sub); setReviewForm({ feedback: sub.feedback || '', grade: sub.grade || 'A', status: 'reviewed' }); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 font-medium"
                        >
                          <CheckSquare className="w-3.5 h-3.5 text-[#10B981]" /> Review
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="max-w-lg w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">Assign New Homework</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium mb-1">Class *</label>
                <select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Subject *</label>
                <select required value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
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
            <div><label className="block font-medium mb-1">Homework Title *</label><input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div><label className="block font-medium mb-1">Description / Instructions</label><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-medium mb-1">Submission Deadline *</label><input type="date" required value={form.submission_deadline} onChange={(e) => setForm({ ...form, submission_deadline: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer w-full justify-center">
                  <FileUp className="w-3.5 h-3.5" /> {form.attachment_name || 'Attach Worksheet'}
                  <input type="file" onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setErr('');
                    try {
                      const up = await uploadFile(f, 'madrasa-assets');
                      setForm((prev) => ({ ...prev, attachment_url: up.url, attachment_name: up.name }));
                    } catch (errUpload: any) {
                      setErr(errUpload.message);
                    } finally {
                      e.target.value = '';
                    }
                  }} className="hidden" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Assign Homework</button>
            </div>
          </form>
        </div>
      )}

      {submitTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmitHw} className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold">Submit Homework — {submitTarget.title}</h3>
            {user.role_slug === 'parent' && myChildren.length > 0 && (
              <div>
                <label className="block font-medium mb-1">Student</label>
                <select value={subForm.student_id} onChange={(e) => setSubForm({ ...subForm, student_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  {myChildren.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
            )}
            <div><label className="block font-medium mb-1">Submission Notes *</label><textarea required rows={3} value={subForm.submission_text} onChange={(e) => setSubForm({ ...subForm, submission_text: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer">
              <FileUp className="w-3.5 h-3.5" /> {subForm.attachment_name || 'Attach File (Optional)'}
              <input type="file" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setErr('');
                try {
                  const up = await uploadFile(f, 'madrasa-assets');
                  setSubForm((prev) => ({ ...prev, attachment_url: up.url, attachment_name: up.name }));
                } catch (errUpload: any) {
                  setErr(errUpload.message);
                } finally {
                  e.target.value = '';
                }
              }} className="hidden" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSubmitTarget(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Submit</button>
            </div>
          </form>
        </div>
      )}

      {reviewTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleReview} className="max-w-sm w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold">Review Submission — {reviewTarget.student_name}</h3>
            <div><label className="block font-medium mb-1">Grade / Score</label><input type="text" value={reviewForm.grade} onChange={(e) => setReviewForm({ ...reviewForm, grade: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div><label className="block font-medium mb-1">Teacher Feedback *</label><textarea required rows={3} value={reviewForm.feedback} onChange={(e) => setReviewForm({ ...reviewForm, feedback: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReviewTarget(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#10B981] text-white font-semibold">Save Review</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
