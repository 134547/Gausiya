import React, { useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface ParentsPageProps {
  user: User;
}

export const ParentsPage: React.FC<ParentsPageProps> = ({ user }) => {
  const isAdmin = user.role_slug === 'super_admin';
  const [parents, setParents] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', mobile: '', email: '', address: '', relationship: 'Father', occupation: '', student_ids: [] as string[] });
  const [loginTarget, setLoginTarget] = useState<any>(null);
  const [loginCreds, setLoginCreds] = useState({ username: '', password: '' });
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        apiRequest<{ parents: any[] }>('/api/parents'),
        apiRequest<{ students: any[] }>('/api/students'),
      ]);
      setParents(pRes.parents);
      setStudents(sRes.students);
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
        await apiRequest(`/api/parents/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Parent record updated.');
      } else {
        await apiRequest('/api/parents', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Parent added and linked to children.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleCreateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginTarget) return;
    try {
      await apiRequest(`/api/parents/${loginTarget.id}/create-login`, { method: 'POST', body: JSON.stringify(loginCreds) });
      setLoginTarget(null);
      setMsg(`Parent login created for ${loginTarget.full_name}.`);
      load();
    } catch (e: any) {
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
              setForm({ full_name: '', mobile: '', email: '', address: '', relationship: 'Father', occupation: '', student_ids: [] });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Add Parent / Guardian
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {parents.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-mono-num text-[#737373]">{p.parent_code} · {p.relationship}</div>
                <h3 className="text-sm font-bold text-[#171717] mt-0.5">{p.full_name}</h3>
                <div className="text-xs font-mono-num text-[#DC1726] mt-0.5">{p.mobile}</div>
                {p.address && <div className="text-xs text-[#737373] mt-1">{p.address}</div>}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  {!p.user_id && (
                    <button
                      type="button"
                      onClick={() => { setLoginTarget(p); setLoginCreds({ username: p.full_name.toLowerCase().replace(/[^a-z0-9]/g, '.'), password: '' }); }}
                      title="Create Login"
                      className="p-1.5 rounded-md text-[#10B981] hover:bg-emerald-50"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(p.id);
                      setForm({
                        full_name: p.full_name,
                        mobile: p.mobile,
                        email: p.email || '',
                        address: p.address || '',
                        relationship: p.relationship || 'Father',
                        occupation: p.occupation || '',
                        student_ids: (p.children || []).map((c: any) => c.student_id),
                      });
                      setFormOpen(true);
                    }}
                    className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(p)} className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-neutral-100">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#737373] mb-1.5">
                <Users className="w-3.5 h-3.5" /> Linked Children ({(p.children || []).length})
              </div>
              {(p.children || []).length === 0 ? (
                <p className="text-xs text-[#737373]">No children linked.</p>
              ) : (
                <div className="space-y-1">
                  {p.children.map((c: any) => (
                    <div key={c.student_id} className="text-xs flex items-center justify-between bg-neutral-50 px-2.5 py-1.5 rounded">
                      <span className="font-medium text-[#171717]">{c.student_name}</span>
                      <span className="text-[#737373] font-mono-num">{c.class_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {p.login_username && (
              <div className="text-[11px] text-[#737373] font-mono-num">
                Portal Login: <strong className="text-[#171717]">{p.login_username}</strong>
              </div>
            )}
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit Parent' : 'Add Parent / Guardian'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block font-medium mb-1">Guardian Name *</label><input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div><label className="block font-medium mb-1">Mobile *</label><input type="text" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
                <div><label className="block font-medium mb-1">Relationship</label><input type="text" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div><label className="block font-medium mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
                <div className="sm:col-span-2"><label className="block font-medium mb-1">Address</label><input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              </div>

              <div>
                <label className="block font-medium mb-1.5">Link Children (Multi-Child Supported)</label>
                <div className="max-h-40 overflow-y-auto border border-neutral-200 rounded-lg p-2 space-y-1">
                  {students.map((st) => {
                    const checked = form.student_ids.includes(st.id);
                    return (
                      <label key={st.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-neutral-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setForm({ ...form, student_ids: [...form.student_ids, st.id] });
                            else setForm({ ...form, student_ids: form.student_ids.filter((id) => id !== st.id) });
                          }}
                        />
                        <span>{st.full_name} ({st.student_code}) — {st.class_name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Parent</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loginTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateLogin} className="max-w-sm w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold">Create Parent Login — {loginTarget.full_name}</h3>
            <div><label className="block font-medium mb-1">Username *</label><input type="text" required value={loginCreds.username} onChange={(e) => setLoginCreds({ ...loginCreds, username: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div><label className="block font-medium mb-1">Password (min 6 chars) *</label><input type="password" required minLength={6} value={loginCreds.password} onChange={(e) => setLoginCreds({ ...loginCreds, password: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setLoginTarget(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Create Login</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Parent Record"
        message={`Remove parent record for ${deleteTarget?.full_name}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/parents/${deleteTarget.id}`, { method: 'DELETE' });
            setMsg('Parent record deleted.');
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
