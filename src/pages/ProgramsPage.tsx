import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Eye, FileUp, MapPin, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface ProgramsPageProps {
  user: User;
}

const CATEGORIES = ['Religious Gathering', 'Annual Jalsa', 'Competition', 'Tarbiyat Workshop', 'Community Welfare'];

export const ProgramsPage: React.FC<ProgramsPageProps> = ({ user }) => {
  const canManage = user.role_slug === 'super_admin' || user.role_slug === 'committee_member';
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    program_date: new Date().toISOString().slice(0, 10),
    start_time: '10:00 AM',
    venue: 'Madrasa Gausiya Razvia Campus, Islamnagar',
    category: 'Religious Gathering',
    featured_photo: '',
    gallery_images: [] as string[],
    status: 'upcoming',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ programs: any[] }>('/api/programs');
      setPrograms(res.programs || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const parseGallery = (jsonStr: string): string[] => {
    try {
      const parsed = JSON.parse(jsonStr || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      if (editingId) {
        await apiRequest(`/api/programs/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Program updated successfully.');
      } else {
        await apiRequest('/api/programs', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Program created and shared with all portal members.');
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
        <div>
          <h2 className="text-sm font-bold text-[#171717]">Madrasa Programs &amp; Special Gatherings</h2>
          <p className="text-xs text-[#737373]">Upcoming educational, spiritual, and community events at Islamnagar.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({
                title: '',
                description: '',
                program_date: new Date().toISOString().slice(0, 10),
                start_time: '10:00 AM',
                venue: 'Madrasa Gausiya Razvia Campus, Islamnagar',
                category: 'Religious Gathering',
                featured_photo: '',
                gallery_images: [],
                status: 'upcoming',
              });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Create Program
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">Loading programs...</div>
      ) : programs.length === 0 ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">No programs scheduled yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {programs.map((p) => {
            const gallery = parseGallery(p.gallery_json);
            return (
              <div key={p.id} className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden flex flex-col justify-between">
                <div>
                  {p.featured_photo ? (
                    <img src={p.featured_photo} alt={p.title} className="w-full h-44 object-cover border-b border-neutral-100" />
                  ) : (
                    <div className="w-full h-32 bg-neutral-900 text-white p-5 flex flex-col justify-between">
                      <Sparkles className="w-5 h-5 text-[#F59E0B]" />
                      <span className="text-[11px] uppercase tracking-wider text-neutral-300">{p.category}</span>
                    </div>
                  )}
                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#DC1726]">{p.category}</span>
                      <span className={`font-semibold capitalize ${p.status === 'completed' ? 'text-[#10B981]' : 'text-[#0EA5E9]'}`}>
                        {p.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#171717]">{p.title}</h3>
                    <p className="text-xs text-[#737373] line-clamp-3 leading-relaxed">{p.description}</p>
                    <div className="pt-2 space-y-1 text-xs text-[#737373]">
                      <div className="flex items-center gap-1.5 font-mono-num">
                        <Calendar className="w-3.5 h-3.5 text-[#171717]" />
                        <span>{p.program_date}</span>
                        {p.start_time && (
                          <>
                            <span>·</span>
                            <Clock className="w-3.5 h-3.5 text-[#171717]" />
                            <span>{p.start_time}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#171717] shrink-0" />
                        <span className="truncate">{p.venue}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setViewItem({ ...p, gallery })}
                    className="inline-flex items-center gap-1 font-medium text-[#0EA5E9] hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" /> Details {gallery.length > 0 ? `(${gallery.length} photos)` : ''}
                  </button>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(p.id);
                          setForm({
                            title: p.title || '',
                            description: p.description || '',
                            program_date: p.program_date || '',
                            start_time: p.start_time || '',
                            venue: p.venue || '',
                            category: p.category || 'Religious Gathering',
                            featured_photo: p.featured_photo || '',
                            gallery_images: gallery,
                            status: p.status || 'upcoming',
                          });
                          setFormOpen(true);
                        }}
                        className="p-1.5 rounded text-[#F59E0B] hover:bg-amber-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(p)} className="p-1.5 rounded text-[#DC1726] hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-[#171717]">{editingId ? 'Edit Program' : 'Create Madrasa Program'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Program Title *</label>
                <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Program Date *</label>
                  <input type="date" required value={form.program_date} onChange={(e) => setForm({ ...form, program_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Start Time</label>
                  <input type="text" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Venue</label>
                  <input type="text" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Description</label>
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5" /> Featured Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setErr('');
                      try {
                        const up = await uploadFile(f, 'programs');
                        setForm((prev) => ({ ...prev, featured_photo: up.url }));
                      } catch (err: any) {
                        setErr(err.message || 'Failed to upload featured photo');
                      } finally {
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5" /> Add Gallery Photos ({form.gallery_images.length})
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      setErr('');
                      try {
                        const urls: string[] = [];
                        for (const f of files) {
                          const up = await uploadFile(f, 'programs');
                          urls.push(up.url);
                        }
                        setForm((prev) => ({ ...prev, gallery_images: [...prev.gallery_images, ...urls] }));
                      } catch (err: any) {
                        setErr(err.message || 'Failed to upload gallery photos');
                      } finally {
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {form.featured_photo && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, featured_photo: '' }))}
                    className="text-[#DC1726] hover:underline"
                  >
                    Remove Featured
                  </button>
                )}
              </div>
              {form.featured_photo && (
                <img src={form.featured_photo} alt="Preview" className="w-full h-32 object-cover rounded-lg border border-neutral-200" />
              )}
              {form.gallery_images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.gallery_images.map((url, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-neutral-200">
                      <img src={url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, gallery_images: prev.gallery_images.filter((_, i) => i !== idx) }))}
                        className="absolute top-0.5 end-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center"
                        aria-label="Remove gallery photo"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Program</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewItem && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#171717]">{viewItem.title}</h3>
                <p className="text-xs text-[#737373] font-mono-num">{viewItem.program_date} · {viewItem.start_time} · {viewItem.venue}</p>
              </div>
              <button type="button" onClick={() => setViewItem(null)}><X className="w-4 h-4" /></button>
            </div>
            {viewItem.featured_photo && (
              <img src={viewItem.featured_photo} alt={viewItem.title} className="w-full max-h-72 object-cover rounded-lg border border-neutral-200" />
            )}
            <p className="text-xs text-[#171717] leading-relaxed whitespace-pre-line">{viewItem.description}</p>
            {viewItem.gallery?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[#171717] mb-2">Event Photo Gallery</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {viewItem.gallery.map((url: string, i: number) => (
                    <img key={i} src={url} alt={`Event ${i + 1}`} className="w-full h-28 object-cover rounded-lg border border-neutral-200" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Program"
        message={`Remove program "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/programs/${deleteTarget.id}`, { method: 'DELETE' });
            setMsg('Program deleted.');
            load();
          } catch (e: any) {
            setErr(e.message || 'Failed to delete program');
          } finally {
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
