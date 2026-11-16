import React, { useEffect, useState } from 'react';
import { Bell, FileText, FileUp, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PrintModal } from '../components/PrintModal.tsx';

interface NoticesPageProps {
  user: User;
  settings: MadrasaSettings | null;
}

const CATEGORIES = ['General', 'Examination', 'Holiday', 'Admission', 'Urgent', 'Event'];

export const NoticesPage: React.FC<NoticesPageProps> = ({ user, settings }) => {
  const canManage = user.role_slug === 'super_admin' || user.role_slug === 'committee_member';
  const [notices, setNotices] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'General',
    publish_date: new Date().toISOString().slice(0, 10),
    expiry_date: '',
    attachment_url: '',
    attachment_name: '',
    target_audience: 'all',
    target_class_id: '',
  });
  const [printTarget, setPrintTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [nRes, cRes] = await Promise.all([
        apiRequest<{ notices: any[] }>('/api/notices'),
        apiRequest<{ classes: any[] }>('/api/classes').catch(() => ({ classes: [] })),
      ]);
      setNotices(nRes.notices || []);
      setClasses(cRes.classes || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const payload = {
        ...form,
        target_class_id: form.target_audience === 'class' && form.target_class_id ? form.target_class_id : null,
      };
      if (editingId) {
        await apiRequest(`/api/notices/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Notice updated successfully.');
      } else {
        await apiRequest('/api/notices', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Notice published and notifications dispatched.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const filtered = notices.filter((n) => {
    if (categoryFilter && n.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        String(n.title).toLowerCase().includes(q) ||
        String(n.description).toLowerCase().includes(q) ||
        String(n.category).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const audienceLabel = (n: any) => {
    if (n.target_audience === 'class') return n.class_name ? `Class: ${n.class_name}` : 'Selected Class';
    if (n.target_audience === 'teachers') return 'Teachers';
    if (n.target_audience === 'parents') return 'Parents';
    if (n.target_audience === 'students') return 'Students';
    return 'All Portal Users';
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[220px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search notices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-[#DC1726]"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-xs bg-white"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({
                title: '',
                description: '',
                category: 'General',
                publish_date: new Date().toISOString().slice(0, 10),
                expiry_date: '',
                attachment_url: '',
                attachment_name: '',
                target_audience: 'all',
                target_class_id: '',
              });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Publish Notice
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">Loading notices...</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">No notices published for this criteria.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((n) => (
            <div key={n.id} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-red-50 text-[#DC1726] flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#171717] leading-snug">{n.title}</h3>
                      <div className="text-[11px] text-[#737373] mt-0.5 flex flex-wrap items-center gap-1.5 font-mono-num">
                        <span className="font-semibold text-[#DC1726]">{n.category}</span>
                        <span>·</span>
                        <span>{audienceLabel(n)}</span>
                        <span>·</span>
                        <span>{n.publish_date}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[#171717] leading-relaxed whitespace-pre-line">{n.description}</p>
                {n.attachment_url && (
                  <a
                    href={n.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#0EA5E9] hover:underline"
                  >
                    <FileText className="w-3.5 h-3.5" /> {n.attachment_name || 'Download Attachment'}
                  </a>
                )}
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] text-[#737373]">
                <span>By {n.author_name || 'Administration'}{n.expiry_date ? ` · Expires ${n.expiry_date}` : ''}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPrintTarget(n)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-200 text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(n.id);
                          setForm({
                            title: n.title || '',
                            description: n.description || '',
                            category: n.category || 'General',
                            publish_date: n.publish_date || new Date().toISOString().slice(0, 10),
                            expiry_date: n.expiry_date || '',
                            attachment_url: n.attachment_url || '',
                            attachment_name: n.attachment_name || '',
                            target_audience: n.target_audience || 'all',
                            target_class_id: n.target_class_id ? String(n.target_class_id) : '',
                          });
                          setFormOpen(true);
                        }}
                        className="p-1.5 rounded text-[#F59E0B] hover:bg-amber-50"
                        title="Edit Notice"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(n)}
                        className="p-1.5 rounded text-[#DC1726] hover:bg-red-50"
                        title="Delete Notice"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-[#171717]">{editingId ? 'Edit Notice' : 'Publish New Notice'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Notice Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Target Audience</label>
                  <select
                    value={form.target_audience}
                    onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    <option value="all">All Portal Users</option>
                    <option value="teachers">Teachers Only</option>
                    <option value="parents">Parents Only</option>
                    <option value="students">Students Only</option>
                    <option value="class">Specific Class</option>
                  </select>
                </div>
                {form.target_audience === 'class' && (
                  <div className="sm:col-span-2">
                    <label className="block font-medium mb-1">Select Class *</label>
                    <select
                      required
                      value={form.target_class_id}
                      onChange={(e) => setForm({ ...form, target_class_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                    >
                      <option value="">Choose class</option>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block font-medium mb-1">Publish Date</label>
                  <input
                    type="date"
                    value={form.publish_date}
                    onChange={(e) => setForm({ ...form, publish_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Expiry Date (Optional)</label>
                  <input
                    type="date"
                    value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Notice Description *</label>
                <textarea
                  rows={4}
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{form.attachment_name ? `Attached: ${form.attachment_name}` : 'Attach Circular / File'}</span>
                  <input
                    type="file"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setErr('');
                      try {
                        const up = await uploadFile(f, 'notices');
                        setForm((prev) => ({ ...prev, attachment_url: up.url, attachment_name: up.name }));
                      } catch (err: any) {
                        setErr(err.message || 'Failed to upload attachment');
                      } finally {
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
                    className="text-[#DC1726] hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">
                  {editingId ? 'Save Changes' : 'Publish Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PrintModal
        open={Boolean(printTarget)}
        title="Official Madrasa Notice"
        subtitle={printTarget?.category}
        settings={settings}
        onClose={() => setPrintTarget(null)}
      >
        {printTarget && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-[#737373] border-b border-neutral-200 pb-3 font-mono-num">
              <span>Ref: MGR/NTC/{printTarget.id}</span>
              <span>Date: {printTarget.publish_date}</span>
              <span>Audience: {audienceLabel(printTarget)}</span>
            </div>
            <h2 className="text-lg font-bold text-[#171717]">{printTarget.title}</h2>
            <p className="text-sm text-[#171717] leading-relaxed whitespace-pre-line">{printTarget.description}</p>
          </div>
        )}
      </PrintModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Notice"
        message={`Are you sure you want to remove "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/notices/${deleteTarget.id}`, { method: 'DELETE' });
            setMsg('Notice deleted.');
            load();
          } catch (e: any) {
            setErr(e.message || 'Failed to delete notice');
          } finally {
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
