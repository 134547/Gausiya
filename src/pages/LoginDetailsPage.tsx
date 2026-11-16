import React, { useEffect, useMemo, useState } from 'react';
import { Eye, KeyRound, Pencil, Plus, Search, Shield, UserCheck, UserX, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';

const ROLE_ORDER = ['super_admin', 'teacher', 'student', 'parent', 'public', 'committee_member'];

export const LoginDetailsPage: React.FC = () => {
  const [tab, setTab] = useState<'accounts' | 'permissions'>('accounts');
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [rolePerms, setRolePerms] = useState<{ role_id: string; permission_id: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [viewUser, setViewUser] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', username: '', email: '', mobile: '', password: '', role_id: '', status: 'active' });

  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const res = await apiRequest<{ users: any[]; roles: any[]; permissions: any[]; rolePermissions: any[] }>('/api/users');
      setUsers(res.users);
      const sortedRoles = [...(res.roles || [])].sort((a, b) => {
        const ia = ROLE_ORDER.indexOf(a.slug);
        const ib = ROLE_ORDER.indexOf(b.slug);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      setRoles(sortedRoles);
      setPermissions(res.permissions);
      setRolePerms(res.rolePermissions);
      if (!selectedRoleId && sortedRoles[0]) setSelectedRoleId(sortedRoles[0].id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role_slug !== roleFilter) return false;
      if (!q) return true;
      return (
        String(u.full_name || '').toLowerCase().includes(q) ||
        String(u.username || '').toLowerCase().includes(q) ||
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.mobile || '').toLowerCase().includes(q) ||
        String(u.user_code || '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, roleFilter]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      if (editingId) {
        await apiRequest(`/api/users/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('User account updated.');
      } else {
        await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(form) });
        setMsg('User account created via Supabase Auth.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleQuickRoleChange = async (u: any, roleId: string) => {
    if (!roleId || roleId === u.role_id) return;
    setErr('');
    setMsg('');
    try {
      await apiRequest(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ role_id: roleId, ...(u.status === 'pending' ? { status: 'active' } : {}) }),
      });
      const rObj = roles.find((r) => r.id === roleId);
      setMsg(`Role updated to ${rObj?.name || 'selected role'} for @${u.username}.`);
      load();
    } catch (e: any) {
      setErr(e.message || 'Failed to update role');
    }
  };

  const toggleStatus = async (u: any) => {
    setErr('');
    const next = u.status === 'active' ? 'disabled' : 'active';
    try {
      await apiRequest(`/api/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) });
      setMsg(`Account ${u.username} is now ${next}.`);
      load();
    } catch (e: any) {
      setErr(e.message || 'Failed to update account status');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setErr('');
    try {
      await apiRequest(`/api/users/${resetTarget.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
      setResetTarget(null);
      setNewPassword('');
      setMsg(`Password securely reset for ${resetTarget.username}.`);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const toggleRolePerm = async (pid: string) => {
    if (!selectedRoleId) return;
    setErr('');
    const current = rolePerms.filter((rp) => rp.role_id === selectedRoleId).map((rp) => rp.permission_id);
    const updated = current.includes(pid) ? current.filter((id) => id !== pid) : [...current, pid];
    try {
      await apiRequest(`/api/roles/${selectedRoleId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionIds: updated }) });
      setMsg('Role permissions updated.');
      load();
    } catch (e: any) {
      setErr(e.message || 'Failed to update role permissions');
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-neutral-200/70 rounded-lg">
          <button type="button" onClick={() => setTab('accounts')} className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'accounts' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'}`}>
            User Accounts ({users.length})
          </button>
          <button type="button" onClick={() => setTab('permissions')} className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'permissions' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373]'}`}>
            Role Permissions Matrix
          </button>
        </div>

        {tab === 'accounts' && (
          <button
            type="button"
            onClick={() => {
              const publicRole = roles.find((r) => r.slug === 'public') || roles[0];
              setEditingId(null);
              setForm({ full_name: '', username: '', email: '', mobile: '', password: '', role_id: String(publicRole?.id || ''), status: 'active' });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Create User Account
          </button>
        )}
      </div>

      {tab === 'accounts' ? (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                  roleFilter === 'all' ? 'bg-[#171717] text-white border-[#171717]' : 'bg-neutral-50 text-[#525252] border-neutral-200'
                }`}
              >
                All ({users.length})
              </button>
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoleFilter(r.slug)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                    roleFilter === r.slug ? 'bg-[#DC1726] text-white border-[#DC1726]' : 'bg-neutral-50 text-[#525252] border-neutral-200'
                  }`}
                >
                  {r.name} ({users.filter((u) => u.role_slug === r.slug).length})
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user..."
                className="w-full ps-8 pe-3 py-1.5 text-xs rounded-lg border border-neutral-200"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">User ID</th>
                    <th className="px-4 py-3 text-start font-semibold">Full Name &amp; Username</th>
                    <th className="px-4 py-3 text-start font-semibold">Email / Mobile</th>
                    <th className="px-4 py-3 text-start font-semibold">Assigned Role</th>
                    <th className="px-4 py-3 text-start font-semibold">Status</th>
                    <th className="px-4 py-3 text-start font-semibold">Last Login</th>
                    <th className="px-4 py-3 text-end font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 font-mono-num font-semibold">{u.user_code}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#171717]">{u.full_name}</div>
                        <div className="text-[11px] font-mono-num text-[#737373]">@{u.username}</div>
                      </td>
                      <td className="px-4 py-3 text-[#737373]">
                        <div>{u.email || '-'}</div>
                        <div className="font-mono-num text-[11px]">{u.mobile || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Role for ${u.full_name}`}
                          value={u.role_id || ''}
                          onChange={(e) => handleQuickRoleChange(u, e.target.value)}
                          className="px-2 py-1 text-xs rounded-lg border border-neutral-200 bg-white font-medium text-[#171717]"
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold capitalize ${u.status === 'active' ? 'text-[#10B981]' : u.status === 'pending' ? 'text-[#F59E0B]' : 'text-[#DC1726]'}`}>{u.status}</span>
                      </td>
                      <td className="px-4 py-3 font-mono-num text-[#737373]">
                        {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => setViewUser(u)} title="View Details" className="p-1.5 rounded-md text-[#171717] hover:bg-neutral-100">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => { setResetTarget(u); setNewPassword(''); }} title="Reset Password" className="p-1.5 rounded-md text-[#0EA5E9] hover:bg-sky-50">
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(u.id);
                              setForm({ full_name: u.full_name, username: u.username, email: u.email, mobile: u.mobile, password: '', role_id: String(u.role_id || roles[0]?.id || ''), status: u.status });
                              setFormOpen(true);
                            }}
                            title="Edit Account"
                            className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(u)}
                            title={u.status === 'active' ? 'Disable Account' : 'Activate Account'}
                            className={`p-1.5 rounded-md ${u.status === 'active' ? 'text-[#DC1726] hover:bg-red-50' : 'text-[#10B981] hover:bg-emerald-50'}`}
                          >
                            {u.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-[#DC1726]" />
            <span className="text-xs font-semibold">Select Role:</span>
            <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 bg-white">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {permissions.map((p) => {
              const checked = rolePerms.some((rp) => rp.role_id === selectedRoleId && rp.permission_id === p.id);
              return (
                <label key={p.id} className="flex items-start gap-2.5 p-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggleRolePerm(p.id)} className="mt-0.5" />
                  <div>
                    <div className="font-semibold text-[#171717]">{p.code}</div>
                    <div className="text-[11px] text-[#737373]">{p.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {viewUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold">{viewUser.full_name}</h3>
                <div className="text-[11px] font-mono-num text-[#737373]">{viewUser.user_code} · @{viewUser.username}</div>
              </div>
              <button type="button" onClick={() => setViewUser(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
              <div><div className="text-[#737373]">Role</div><div className="font-bold">{viewUser.role_name}</div></div>
              <div><div className="text-[#737373]">Status</div><div className="font-bold capitalize">{viewUser.status}</div></div>
              <div><div className="text-[#737373]">Email</div><div className="break-all">{viewUser.email || '—'}</div></div>
              <div><div className="text-[#737373]">Mobile</div><div className="font-mono-num">{viewUser.mobile || '—'}</div></div>
              <div><div className="text-[#737373]">District</div><div>{viewUser.district || '—'}</div></div>
              <div><div className="text-[#737373]">Last Login</div><div className="font-mono-num">{viewUser.last_login ? new Date(viewUser.last_login).toLocaleDateString() : 'Never'}</div></div>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => setViewUser(null)} className="px-4 py-2 rounded-lg bg-[#171717] text-white font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveUser} className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit User Account' : 'Create User Account'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div><label className="block font-medium mb-1">Full Name *</label><input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            {!editingId && (
              <div><label className="block font-medium mb-1">Username *</label><input type="text" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-medium mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
              <div><label className="block font-medium mb-1">Mobile</label><input type="text" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" /></div>
            </div>
            <div>
              <label className="block font-medium mb-1">Assigned Role *</label>
              <select required value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                <option value="">Select Role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            {editingId && (
              <div>
                <label className="block font-medium mb-1">Account Status *</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            )}
            {!editingId && (
              <div><label className="block font-medium mb-1">Password (min 6 chars, Supabase Auth) *</label><input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Save Account</button>
            </div>
          </form>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleResetPassword} className="max-w-sm w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold">Reset Password — {resetTarget.username}</h3>
            <div><label className="block font-medium mb-1">New Password (min 6 chars) *</label><input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Reset Password</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
