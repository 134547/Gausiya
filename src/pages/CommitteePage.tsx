import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FileUp, Mail, Pencil, Phone, Plus, Printer, Trash2, X } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PrintModal } from '../components/PrintModal.tsx';

interface CommitteePageProps {
  user: User;
  settings: MadrasaSettings | null;
}

const DESIGNATIONS = ['President', 'Vice President', 'Secretary', 'Treasurer', 'Committee Member'];

export const CommitteePage: React.FC<CommitteePageProps> = ({ user, settings }) => {
  const canEdit = user.role_slug === 'super_admin' || user.role_slug === 'committee_member';
  const [members, setMembers] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    designation: 'Committee Member',
    mobile: '',
    email: '',
    address: '',
    joining_date: new Date().toISOString().slice(0, 10),
    description: '',
    photo_url: '',
    status: 'active',
  });
  const [printOpen, setPrintOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const res = await apiRequest<{ members: any[] }>('/api/committee');
      setMembers(res.members);
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
        await apiRequest(`/api/committee/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Committee member updated.');
      } else {
        await apiRequest('/api/committee', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Committee member added.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const moveMember = async (idx: number, dir: -1 | 1) => {
    const prev = members;
    const next = [...members];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setMembers(next);
    setErr('');
    try {
      await apiRequest('/api/committee/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds: next.map((m) => m.id) }),
      });
    } catch (e: any) {
      setMembers(prev);
      setErr(e.message || 'Failed to reorder committee members');
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#171717]">Madrasa Gausiya Razvia Management Committee</h2>
          <p className="text-xs text-[#737373]">Official office bearers and executive committee members.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPrintOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50">
            <Printer className="w-4 h-4" /> Print Directory
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm({ full_name: '', designation: 'Committee Member', mobile: '', email: '', address: '', joining_date: new Date().toISOString().slice(0, 10), description: '', photo_url: '', status: 'active' });
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
            >
              <Plus className="w-4 h-4" /> Add Member
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m, idx) => (
          <div key={m.id} className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs flex flex-col items-center text-center relative">
            {canEdit && (
              <div className="absolute top-3 end-3 flex items-center gap-1">
                <button type="button" onClick={() => moveMember(idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30" title="Move Up"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => moveMember(idx, 1)} disabled={idx === members.length - 1} className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30" title="Move Down"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => { setEditingId(m.id); setForm({ ...m }); setFormOpen(true); }} className="p-1 rounded text-[#F59E0B] hover:bg-amber-50"><Pencil className="w-3.5 h-3.5" /></button>
                {user.role_slug === 'super_admin' && (
                  <button type="button" onClick={() => setDeleteTarget(m)} className="p-1 rounded text-[#DC1726] hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            )}

            {m.photo_url ? (
              <img src={m.photo_url} alt={m.full_name} className="w-20 h-20 rounded-full object-cover border-2 border-neutral-100 mb-3" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#3B0A0D] text-white flex items-center justify-center text-2xl font-bold mb-3">
                {m.full_name.charAt(0).toUpperCase()}
              </div>
            )}
            <h3 className="text-sm font-bold text-[#171717]">{m.full_name}</h3>
            <div className="text-xs font-semibold text-[#DC1726] mt-0.5">{m.designation}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono-num text-[#DC1726]">
              <Phone className="w-3.5 h-3.5" />
              <span>{m.mobile}</span>
            </div>
            {m.email && (
              <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[#737373]">
                <Mail className="w-3 h-3" />
                <span>{m.email}</span>
              </div>
            )}
            {m.description && <p className="mt-3 text-xs text-[#737373] leading-relaxed">{m.description}</p>}
            <div className="mt-3 pt-3 w-full border-t border-neutral-100 text-[11px] text-[#737373] flex justify-between font-mono-num">
              <span>Joined: {m.joining_date}</span>
              <span className="capitalize font-semibold text-[#10B981]">{m.status}</span>
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit Committee Member' : 'Add Committee Member'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block font-medium mb-1">Full Name *</label><input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div>
                  <label className="block font-medium mb-1">Designation *</label>
                  <select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div><label className="block font-medium mb-1">Mobile *</label><input type="text" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
                <div><label className="block font-medium mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div><label className="block font-medium mb-1">Joining Date</label><input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
                <div>
                  <label className="block font-medium mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="sm:col-span-2"><label className="block font-medium mb-1">Address</label><input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div className="sm:col-span-2"><label className="block font-medium mb-1">Role Description</label><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div className="sm:col-span-2 flex items-center gap-3">
                  {form.photo_url && <img src={form.photo_url} alt="Member" className="w-12 h-12 rounded-full object-cover" />}
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer">
                    <FileUp className="w-3.5 h-3.5" /> Upload Photo
                    <input type="file" accept="image/*" onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setErr('');
                      try {
                        const up = await uploadFile(f, 'madrasa-assets');
                        setForm((prev) => ({ ...prev, photo_url: up.url }));
                      } catch (err: any) {
                        setErr(err.message || 'Failed to upload photo');
                      } finally {
                        e.target.value = '';
                      }
                    }} className="hidden" />
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PrintModal open={printOpen} title="Madrasa Management Committee Directory" settings={settings} onClose={() => setPrintOpen(false)}>
        <table className="w-full text-xs border-collapse border border-neutral-300">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-neutral-300 px-3 py-2 text-start">Full Name</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Designation</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Mobile</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Address</th>
              <th className="border border-neutral-300 px-3 py-2 text-start">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="border border-neutral-300 px-3 py-2 font-semibold">{m.full_name}</td>
                <td className="border border-neutral-300 px-3 py-2">{m.designation}</td>
                <td className="border border-neutral-300 px-3 py-2 font-mono-num">{m.mobile}</td>
                <td className="border border-neutral-300 px-3 py-2">{m.address}</td>
                <td className="border border-neutral-300 px-3 py-2 font-mono-num">{m.joining_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove Committee Member"
        message={`Remove ${deleteTarget?.full_name} from the committee?`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/committee/${deleteTarget.id}`, { method: 'DELETE' });
            setMsg('Committee member removed.');
            load();
          } catch (e: any) {
            setErr(e.message || 'Failed to remove committee member');
          } finally {
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
