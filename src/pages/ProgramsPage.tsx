import React, { useEffect, useState } from 'react';
import {
  BadgeIndianRupee,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Rss,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { downloadImageFile } from '../lib/download.ts';
import { User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface ProgramsPageProps {
  user: User;
}

const CATEGORIES = [
  'Religious Gathering',
  'Annual Jalsa',
  'Competition',
  'Tarbiyat Workshop',
  'Community Welfare',
];

function toWhatsAppHref(num?: string): string {
  const digits = String(num || '').replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

function isImageUrl(url: string, name?: string): boolean {
  const check = `${url} ${name || ''}`.toLowerCase();
  if (/\.pdf(\?|$)/i.test(check)) return false;
  return /\.(png|jpe?g|gif|webp|bmp|avif|jfif)(\?|$)/i.test(check) || check.includes('ibb.co');
}

export const ProgramsPage: React.FC<ProgramsPageProps> = ({ user }) => {
  const canManage = user.role_slug === 'super_admin' || user.role_slug === 'committee_member';
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [sendingFeedId, setSendingFeedId] = useState<string | null>(null);
  const [savingProgram, setSavingProgram] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<'poster' | 'featured' | 'gallery' | 'statement' | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Registration modal state
  const [registerTarget, setRegisterTarget] = useState<any>(null);
  const [regForm, setRegForm] = useState({
    full_name: user.full_name || '',
    father_name: '',
    whatsapp_number: user.mobile || '',
    address_or_class: '',
    notes: '',
    payment_statement_url: '',
    payment_statement_name: '',
  });
  const [submittingReg, setSubmittingReg] = useState(false);

  // Registrations list modal state (for admins/committee)
  const [regsProgram, setRegsProgram] = useState<any>(null);
  const [regsList, setRegsList] = useState<any[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const [previewStatement, setPreviewStatement] = useState<{ url: string; name: string; participant: string } | null>(null);
  const [deleteRegTarget, setDeleteRegTarget] = useState<any>(null);

  const emptyForm = () => ({
    title: '',
    description: '',
    program_date: new Date().toISOString().slice(0, 10),
    start_time: '10:00 AM',
    venue: 'Madrasa Gausiya Razvia Campus, Islamnagar',
    category: 'Religious Gathering',
    poster_url: '',
    featured_photo: '',
    gallery_images: [] as string[],
    whatsapp_number: '',
    registration_enabled: true,
    payment_required: false,
    payment_amount: '',
    payment_instructions: '',
    status: 'upcoming',
  });

  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ programs: any[] }>('/api/programs');
      setPrograms(res.programs || []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load programs');
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
    setMsg('');
    if (form.payment_required && (!form.payment_amount || Number(form.payment_amount) <= 0)) {
      setErr('Please enter a fixed payment amount greater than Rs. 0 when Payment is ON.');
      return;
    }

    setSavingProgram(true);
    try {
      const payload = {
        ...form,
        payment_amount: form.payment_required ? Number(form.payment_amount || 0) : 0,
      };
      if (editingId) {
        await apiRequest(`/api/programs/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Program updated successfully.');
      } else {
        await apiRequest('/api/programs', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Program created and shared with portal members.');
      }
      setFormOpen(false);
      await load();
    } catch (e: any) {
      setErr(e.message || 'Failed to save program');
    } finally {
      setSavingProgram(false);
    }
  };

  const handleSendToFeed = async (program: any) => {
    if (sendingFeedId) return;
    setErr('');
    setMsg('');
    setSendingFeedId(program.id);
    try {
      await apiRequest(`/api/programs/${program.id}/send-to-feed`, { method: 'POST' });
      setMsg(`"${program.title}" sent to Activity Feed successfully!`);
      await load();
    } catch (e: any) {
      setErr(e.message || 'Failed to send program to feed');
    } finally {
      setSendingFeedId(null);
    }
  };

  const openRegistrationModal = (program: any) => {
    setErr('');
    setMsg('');
    setRegisterTarget(program);
    setRegForm({
      full_name: user.full_name || '',
      father_name: '',
      whatsapp_number: user.mobile || '',
      address_or_class: '',
      notes: '',
      payment_statement_url: '',
      payment_statement_name: '',
    });
  };

  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerTarget || submittingReg) return;
    setErr('');
    setMsg('');

    if (registerTarget.payment_required && !regForm.payment_statement_url) {
      setErr(`Please upload your Payment Statement for Rs. ${registerTarget.payment_amount} before submitting.`);
      return;
    }

    setSubmittingReg(true);
    try {
      await apiRequest(`/api/programs/${registerTarget.id}/register`, {
        method: 'POST',
        body: JSON.stringify(regForm),
      });
      setMsg(`Registration saved for "${registerTarget.title}"!`);
      setRegisterTarget(null);
      await load();
    } catch (e: any) {
      setErr(e.message || 'Failed to complete registration');
    } finally {
      setSubmittingReg(false);
    }
  };

  const openRegistrationsModal = async (program: any) => {
    setRegsProgram(program);
    setRegsList([]);
    setLoadingRegs(true);
    setErr('');
    try {
      const res = await apiRequest<{ program: any; registrations: any[] }>(
        `/api/programs/${program.id}/registrations`
      );
      setRegsProgram({ ...program, ...(res.program || {}) });
      setRegsList(res.registrations || []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load registrations');
    } finally {
      setLoadingRegs(false);
    }
  };

  return (
    <div className="space-y-5">
      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
          {err}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#171717]">Madrasa Programs &amp; Special Gatherings</h2>
          <p className="text-xs text-[#737373]">
            Upload posters, configure optional registration fees, send individual programs to Feed, and manage participants.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm());
              setErr('');
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create Program
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">
          Loading programs...
        </div>
      ) : programs.length === 0 ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">
          No programs scheduled yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {programs.map((p) => {
            const gallery = parseGallery(p.gallery_json);
            const coverImage = p.poster_url || p.featured_photo;
            const waHref = toWhatsAppHref(p.whatsapp_number);
            return (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative">
                    {coverImage ? (
                      <img
                        src={coverImage}
                        alt={p.title}
                        onClick={() => setViewItem({ ...p, gallery })}
                        className="w-full h-48 object-cover border-b border-neutral-100 cursor-pointer hover:opacity-95 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-36 bg-neutral-900 text-white p-5 flex flex-col justify-between">
                        <Sparkles className="w-5 h-5 text-[#F59E0B]" />
                        <span className="text-[11px] uppercase tracking-wider text-neutral-300">
                          {p.category}
                        </span>
                      </div>
                    )}
                    <div className="absolute top-2.5 start-2.5 flex flex-wrap items-center gap-1.5">
                      {p.poster_url && (
                        <span className="px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-semibold">
                          Poster
                        </span>
                      )}
                      {p.payment_required ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold font-mono-num">
                          Fee: Rs. {p.payment_amount}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                          Free Entry
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#DC1726]">{p.category}</span>
                      <span
                        className={`font-semibold capitalize ${
                          p.status === 'completed' ? 'text-[#10B981]' : 'text-[#0EA5E9]'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#171717]">{p.title}</h3>
                    <p className="text-xs text-[#737373] line-clamp-3 leading-relaxed">
                      {p.description}
                    </p>
                    <div className="pt-2 space-y-1.5 text-xs text-[#737373]">
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
                      {p.whatsapp_number && (
                        <div className="flex items-center gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono-num font-semibold text-[#10B981] hover:underline"
                          >
                            WhatsApp: {p.whatsapp_number}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Registration + Per-Program Feed Action Row */}
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      {p.registration_enabled !== false && (
                        <button
                          type="button"
                          onClick={() => openRegistrationModal(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16a34a] hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>
                            {p.my_registration
                              ? 'Registered ✓ (Register Again)'
                              : p.payment_required
                                ? `Register (Rs. ${p.payment_amount})`
                                : 'Register Now'}
                          </span>
                        </button>
                      )}

                      {canManage && (
                        <button
                          type="button"
                          disabled={sendingFeedId === p.id}
                          onClick={() => handleSendToFeed(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0EA5E9] hover:bg-sky-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                          title="Send this individual program to Activity Feed"
                        >
                          {sendingFeedId === p.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Rss className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {sendingFeedId === p.id
                              ? 'Sending...'
                              : p.sent_to_feed_count > 0
                                ? `Send to Feed (${p.sent_to_feed_count})`
                                : 'Send to Feed'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setViewItem({ ...p, gallery })}
                      className="inline-flex items-center gap-1 font-medium text-[#0EA5E9] hover:underline cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Details
                      {gallery.length > 0 ? ` (${gallery.length})` : ''}
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openRegistrationsModal(p)}
                        className="inline-flex items-center gap-1 font-semibold text-[#171717] hover:text-[#DC1726] cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-[#10B981]" />
                        <span>Registrations ({p.registrations_count || 0})</span>
                      </button>
                    )}
                  </div>

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
                            poster_url: p.poster_url || '',
                            featured_photo: p.featured_photo || '',
                            gallery_images: gallery,
                            whatsapp_number: p.whatsapp_number || '',
                            registration_enabled: p.registration_enabled !== false,
                            payment_required: Boolean(p.payment_required),
                            payment_amount: p.payment_amount ? String(p.payment_amount) : '',
                            payment_instructions: p.payment_instructions || '',
                            status: p.status || 'upcoming',
                          });
                          setErr('');
                          setFormOpen(true);
                        }}
                        className="p-1.5 rounded text-[#F59E0B] hover:bg-amber-50 cursor-pointer"
                        title="Edit Program"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        className="p-1.5 rounded text-[#DC1726] hover:bg-red-50 cursor-pointer"
                        title="Delete Program"
                      >
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

      {/* Create / Edit Program Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-xl bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs my-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-[#171717]">
                {editingId ? 'Edit Program' : 'Create Madrasa Program'}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-1 rounded hover:bg-neutral-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block font-medium mb-1">Program Title *</label>
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
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Program Date *</label>
                  <input
                    type="date"
                    required
                    value={form.program_date}
                    onChange={(e) => setForm({ ...form, program_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Start Time</label>
                  <input
                    type="text"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 7209629509"
                    value={form.whatsapp_number}
                    onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Venue</label>
                  <input
                    type="text"
                    value={form.venue}
                    onChange={(e) => setForm({ ...form, venue: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>

              {/* Registration & Optional Payment (ON / OFF + Fixed Amount) */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#171717]">Registration &amp; Payment Settings</div>
                    <div className="text-[11px] text-[#737373]">
                      Turn Payment ON to set a fixed registration fee &amp; collect payment statements.
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 font-semibold text-[#171717] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.registration_enabled}
                      onChange={(e) => setForm({ ...form, registration_enabled: e.target.checked })}
                      className="rounded border-neutral-300"
                    />
                    <span>Registration Open</span>
                  </label>
                </div>

                {form.registration_enabled && (
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#171717]">Registration Payment:</span>
                      <div className="inline-flex items-center gap-1 p-1 bg-white border border-neutral-200 rounded-lg">
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, payment_required: false, payment_amount: '' })
                          }
                          className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                            !form.payment_required
                              ? 'bg-emerald-600 text-white'
                              : 'text-[#737373] hover:text-[#171717]'
                          }`}
                        >
                          OFF (Free)
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, payment_required: true })}
                          className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                            form.payment_required
                              ? 'bg-[#DC1726] text-white'
                              : 'text-[#737373] hover:text-[#171717]'
                          }`}
                        >
                          ON (Paid)
                        </button>
                      </div>
                    </div>

                    {form.payment_required ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block font-semibold text-[#171717] mb-1">
                            Fixed Payment Amount (Rs.) *
                          </label>
                          <input
                            type="number"
                            min={1}
                            required
                            placeholder="e.g. 200"
                            value={form.payment_amount}
                            onChange={(e) => setForm({ ...form, payment_amount: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-[#171717] mb-1">
                            Payment Note / UPI Details (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Pay via UPI: madrasa@upi & upload screenshot"
                            value={form.payment_instructions}
                            onChange={(e) =>
                              setForm({ ...form, payment_instructions: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        Payment is OFF — participants will submit registration details without payment or statement upload.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Poster Upload + Featured Photo + Gallery Photos */}
              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-[#DC1726] font-semibold cursor-pointer hover:bg-red-100">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{uploadingAsset === 'poster' ? 'Uploading Poster...' : 'Upload Poster'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setErr('');
                        setUploadingAsset('poster');
                        try {
                          const up = await uploadFile(f, 'programs');
                          setForm((prev) => ({ ...prev, poster_url: up.url }));
                        } catch (err: any) {
                          setErr(err.message || 'Failed to upload poster');
                        } finally {
                          setUploadingAsset(null);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100">
                    <FileUp className="w-3.5 h-3.5" />
                    <span>
                      {uploadingAsset === 'featured' ? 'Uploading...' : 'Featured Photo'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setErr('');
                        setUploadingAsset('featured');
                        try {
                          const up = await uploadFile(f, 'programs');
                          setForm((prev) => ({ ...prev, featured_photo: up.url }));
                        } catch (err: any) {
                          setErr(err.message || 'Failed to upload featured photo');
                        } finally {
                          setUploadingAsset(null);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100">
                    <FileUp className="w-3.5 h-3.5" />
                    <span>
                      {uploadingAsset === 'gallery'
                        ? 'Uploading...'
                        : `Add Gallery Photos (${form.gallery_images.length})`}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        setErr('');
                        setUploadingAsset('gallery');
                        try {
                          const urls: string[] = [];
                          for (const f of files) {
                            const up = await uploadFile(f, 'programs');
                            urls.push(up.url);
                          }
                          setForm((prev) => ({
                            ...prev,
                            gallery_images: [...prev.gallery_images, ...urls],
                          }));
                        } catch (err: any) {
                          setErr(err.message || 'Failed to upload gallery photos');
                        } finally {
                          setUploadingAsset(null);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {form.poster_url && (
                  <div className="p-2 rounded-lg border border-red-200 bg-red-50/40 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#DC1726]">
                      <span>Program Poster Preview</span>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, poster_url: '' }))}
                        className="hover:underline cursor-pointer"
                      >
                        Remove Poster
                      </button>
                    </div>
                    <img
                      src={form.poster_url}
                      alt="Poster preview"
                      className="w-full max-h-44 object-contain rounded-lg bg-white border border-neutral-200"
                    />
                  </div>
                )}

                {form.featured_photo && (
                  <div className="p-2 rounded-lg border border-neutral-200 bg-neutral-50 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#171717]">
                      <span>Featured Photo Preview</span>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, featured_photo: '' }))}
                        className="text-[#DC1726] hover:underline cursor-pointer"
                      >
                        Remove Featured
                      </button>
                    </div>
                    <img
                      src={form.featured_photo}
                      alt="Featured preview"
                      className="w-full h-32 object-cover rounded-lg border border-neutral-200"
                    />
                  </div>
                )}

                {form.gallery_images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.gallery_images.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-neutral-200"
                      >
                        <img src={url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              gallery_images: prev.gallery_images.filter((_, i) => i !== idx),
                            }))
                          }
                          className="absolute top-0.5 end-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center"
                          aria-label="Remove gallery photo"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProgram || uploadingAsset !== null}
                  className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {savingProgram ? 'Saving...' : 'Save Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Program Details Modal */}
      {viewItem && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 my-4">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#171717]">{viewItem.title}</h3>
                <p className="text-xs text-[#737373] font-mono-num">
                  {viewItem.program_date} · {viewItem.start_time} · {viewItem.venue}
                </p>
              </div>
              <button type="button" onClick={() => setViewItem(null)} className="p-1 rounded hover:bg-neutral-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {viewItem.poster_url && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#171717]">Official Program Poster</span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadImageFile(viewItem.poster_url, `${viewItem.title || 'program'}-poster`)
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-200 text-xs font-semibold hover:bg-neutral-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#0EA5E9]" /> Download Poster
                  </button>
                </div>
                <img
                  src={viewItem.poster_url}
                  alt={`${viewItem.title} poster`}
                  className="w-full max-h-96 object-contain rounded-lg border border-neutral-200 bg-neutral-50"
                />
              </div>
            )}

            {viewItem.featured_photo && viewItem.featured_photo !== viewItem.poster_url && (
              <img
                src={viewItem.featured_photo}
                alt={viewItem.title}
                className="w-full max-h-72 object-cover rounded-lg border border-neutral-200"
              />
            )}

            <p className="text-xs text-[#171717] leading-relaxed whitespace-pre-line">
              {viewItem.description}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
              <div>
                <div className="text-[#737373]">Registration &amp; Fee</div>
                <div className="font-bold text-[#171717] mt-0.5">
                  {viewItem.registration_enabled === false
                    ? 'Closed'
                    : viewItem.payment_required
                      ? `Paid · Fixed Fee Rs. ${viewItem.payment_amount}`
                      : 'Free Registration (No Fee)'}
                </div>
                {viewItem.payment_required && viewItem.payment_instructions && (
                  <div className="text-[11px] text-[#525252] mt-1">{viewItem.payment_instructions}</div>
                )}
              </div>
              {viewItem.whatsapp_number && (
                <div>
                  <div className="text-[#737373]">Organizer WhatsApp</div>
                  <a
                    href={toWhatsAppHref(viewItem.whatsapp_number)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1.5 font-bold font-mono-num text-[#10B981] hover:underline"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{viewItem.whatsapp_number}</span>
                  </a>
                </div>
              )}
            </div>

            {viewItem.gallery?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[#171717] mb-2">Event Photo Gallery</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {viewItem.gallery.map((url: string, i: number) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Event ${i + 1}`}
                      className="w-full h-28 object-cover rounded-lg border border-neutral-200"
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              {viewItem.registration_enabled !== false && (
                <button
                  type="button"
                  onClick={() => {
                    const target = viewItem;
                    setViewItem(null);
                    openRegistrationModal(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#16a34a] text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>
                    {viewItem.payment_required
                      ? `Register (Rs. ${viewItem.payment_amount})`
                      : 'Register Now'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Participant Program Registration Modal */}
      {registerTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs my-4">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#171717]">Program Registration</h3>
                <p className="text-xs text-[#737373] mt-0.5">
                  {registerTarget.title} · {registerTarget.program_date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRegisterTarget(null)}
                className="p-1 rounded hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {registerTarget.whatsapp_number && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                <span className="text-[11px] text-emerald-900 font-medium">
                  Organizer WhatsApp Help:
                </span>
                <a
                  href={toWhatsAppHref(registerTarget.whatsapp_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold font-mono-num text-[#10B981] hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> {registerTarget.whatsapp_number}
                </a>
              </div>
            )}

            <form onSubmit={handleSubmitRegistration} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={regForm.full_name}
                    onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Father / Guardian Name</label>
                  <input
                    type="text"
                    value={regForm.father_name}
                    onChange={(e) => setRegForm({ ...regForm, father_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">WhatsApp / Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={regForm.whatsapp_number}
                    onChange={(e) => setRegForm({ ...regForm, whatsapp_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Class / Village / Address</label>
                  <input
                    type="text"
                    placeholder="Class or City/Village"
                    value={regForm.address_or_class}
                    onChange={(e) => setRegForm({ ...regForm, address_or_class: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Any special note or participant info..."
                  value={regForm.notes}
                  onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>

              {registerTarget.payment_required ? (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-[#171717]">
                      <BadgeIndianRupee className="w-4 h-4 text-[#DC1726]" />
                      <span>Fixed Registration Fee</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#DC1726] text-white font-bold font-mono-num text-sm">
                      Rs. {registerTarget.payment_amount}
                    </span>
                  </div>
                  {registerTarget.payment_instructions && (
                    <p className="text-[11px] text-[#525252] leading-relaxed">
                      {registerTarget.payment_instructions}
                    </p>
                  )}
                  <div className="pt-1 space-y-2">
                    <label className="block font-semibold text-[#171717]">
                      Upload Payment Statement / Receipt (Image or PDF) *
                    </label>
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white cursor-pointer hover:bg-neutral-50 font-semibold">
                      <FileUp className="w-3.5 h-3.5 text-[#DC1726]" />
                      <span>
                        {uploadingAsset === 'statement'
                          ? 'Uploading Payment Statement...'
                          : regForm.payment_statement_url
                            ? 'Replace Payment Statement'
                            : 'Choose Payment Statement'}
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setErr('');
                          setUploadingAsset('statement');
                          try {
                            const up = await uploadFile(f, 'student-documents');
                            setRegForm((prev) => ({
                              ...prev,
                              payment_statement_url: up.url,
                              payment_statement_name: f.name,
                            }));
                          } catch (uploadErr: any) {
                            setErr(uploadErr.message || 'Failed to upload payment statement');
                          } finally {
                            setUploadingAsset(null);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                      />
                    </label>

                    {regForm.payment_statement_url && (
                      <div className="p-2.5 rounded-lg bg-white border border-emerald-200 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isImageUrl(regForm.payment_statement_url, regForm.payment_statement_name) ? (
                            <img
                              src={regForm.payment_statement_url}
                              alt="Payment Statement"
                              className="w-10 h-10 rounded object-cover border border-neutral-200 shrink-0"
                            />
                          ) : (
                            <FileText className="w-5 h-5 text-[#DC1726] shrink-0" />
                          )}
                          <span className="truncate font-medium text-emerald-700">
                            {regForm.payment_statement_name || 'Payment Statement Uploaded'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setRegForm((prev) => ({
                              ...prev,
                              payment_statement_url: '',
                              payment_statement_name: '',
                            }))
                          }
                          className="text-[#DC1726] hover:underline shrink-0 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-medium">
                  Free Registration — Payment is OFF for this program. Click Submit below to save your registration details.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRegisterTarget(null)}
                  className="px-4 py-2 rounded-lg bg-neutral-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReg || uploadingAsset === 'statement'}
                  className="px-5 py-2 rounded-lg bg-[#16a34a] hover:bg-emerald-700 text-white font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {submittingReg
                    ? 'Saving Registration...'
                    : registerTarget.payment_required
                      ? `Submit Registration (Rs. ${registerTarget.payment_amount})`
                      : 'Submit Free Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Registrations List Modal (Admin / Committee) */}
      {regsProgram && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-4xl bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs my-4">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#171717]">
                  Saved Program Registrations — {regsProgram.title}
                </h3>
                <p className="text-xs text-[#737373] mt-0.5 font-mono-num">
                  Total Registered: {regsList.length} ·{' '}
                  {regsProgram.payment_required
                    ? `Fixed Fee: Rs. ${regsProgram.payment_amount} · Total Paid Amount: Rs. ${regsList.reduce((acc, r) => acc + Number(r.payment_amount || 0), 0)}`
                    : 'Free Entry Program (Payment OFF)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRegsProgram(null)}
                className="p-1 rounded hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingRegs ? (
              <div className="p-10 text-center text-[#737373] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading saved registrations...</span>
              </div>
            ) : regsList.length === 0 ? (
              <div className="p-10 text-center text-[#737373]">
                No participants have registered for this program yet.
              </div>
            ) : (
              <div className="overflow-x-auto border border-neutral-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                    <tr>
                      <th className="px-3 py-2.5 text-start font-semibold">Participant</th>
                      <th className="px-3 py-2.5 text-start font-semibold">WhatsApp</th>
                      <th className="px-3 py-2.5 text-start font-semibold">Details / Notes</th>
                      <th className="px-3 py-2.5 text-start font-semibold">Payment</th>
                      <th className="px-3 py-2.5 text-start font-semibold">Statement</th>
                      <th className="px-3 py-2.5 text-end font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {regsList.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-50">
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-[#171717]">{r.full_name}</div>
                          {r.father_name && (
                            <div className="text-[11px] text-[#737373]">S/O {r.father_name}</div>
                          )}
                          <div className="text-[10px] text-[#737373] font-mono-num">
                            {new Date(r.created_at).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono-num">
                          <a
                            href={toWhatsAppHref(r.whatsapp_number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#10B981] font-semibold hover:underline"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>{r.whatsapp_number}</span>
                          </a>
                        </td>
                        <td className="px-3 py-2.5 text-[#525252]">
                          <div>{r.address_or_class || '—'}</div>
                          {r.notes && <div className="text-[11px] text-[#737373]">{r.notes}</div>}
                        </td>
                        <td className="px-3 py-2.5 font-mono-num">
                          {r.payment_required ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                              Rs. {r.payment_amount}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-neutral-100 text-[#737373] font-medium">
                              Free
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.payment_statement_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewStatement({
                                  url: r.payment_statement_url,
                                  name: r.payment_statement_name || 'Payment Statement',
                                  participant: r.full_name,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-200 bg-white hover:bg-neutral-50 text-[11px] font-semibold text-[#0EA5E9] cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Statement
                            </button>
                          ) : (
                            <span className="text-[#737373]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          <button
                            type="button"
                            onClick={() => setDeleteRegTarget(r)}
                            className="p-1.5 rounded text-[#DC1726] hover:bg-red-50 cursor-pointer"
                            title="Delete Registration"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Statement Preview Modal */}
      {previewStatement && (
        <div className="fixed inset-0 z-[60] bg-black/60 overflow-y-auto p-4 flex items-center justify-center">
          <div className="mx-auto max-w-xl w-full bg-white rounded-xl border border-neutral-200 shadow-2xl p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
              <div>
                <h4 className="text-sm font-bold text-[#171717]">
                  Payment Statement — {previewStatement.participant}
                </h4>
                <div className="text-[11px] text-[#737373]">{previewStatement.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewStatement(null)}
                className="p-1 rounded hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isImageUrl(previewStatement.url, previewStatement.name) ? (
              <img
                src={previewStatement.url}
                alt="Payment statement"
                className="w-full max-h-[65vh] object-contain rounded-lg border border-neutral-200 bg-neutral-50"
              />
            ) : (
              <div className="p-6 rounded-lg border border-neutral-200 bg-neutral-50 text-center space-y-2">
                <FileText className="w-8 h-8 text-[#DC1726] mx-auto" />
                <div className="font-semibold text-[#171717]">{previewStatement.name}</div>
                <a
                  href={previewStatement.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0EA5E9] text-white font-semibold hover:bg-sky-600"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open Payment Statement PDF
                </a>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <a
                href={previewStatement.url}
                download={previewStatement.name}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10B981] text-white font-semibold hover:bg-emerald-600"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
              <button
                type="button"
                onClick={() => setPreviewStatement(null)}
                className="px-4 py-2 rounded-lg bg-neutral-100 font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
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

      <ConfirmDialog
        open={Boolean(deleteRegTarget)}
        title="Remove Registration"
        message={`Remove registration for "${deleteRegTarget?.full_name}"?`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!deleteRegTarget || !regsProgram) return;
          setErr('');
          try {
            await apiRequest(`/api/programs/${regsProgram.id}/registrations/${deleteRegTarget.id}`, {
              method: 'DELETE',
            });
            setRegsList((prev) => prev.filter((item) => item.id !== deleteRegTarget.id));
            load();
          } catch (e: any) {
            setErr(e.message || 'Failed to remove registration');
          } finally {
            setDeleteRegTarget(null);
          }
        }}
        onCancel={() => setDeleteRegTarget(null)}
      />
    </div>
  );
};
