import React, { useEffect, useState } from 'react';
import { FileUp, KeyRound, Save, User as UserIcon } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { User } from '../types.ts';

interface ProfilePageProps {
  user: User;
  onUserUpdated: (user: User) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ user, onUserUpdated }) => {
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    email: user.email || '',
    mobile: user.mobile || '',
    father_name: '',
    dob: '',
    gender: 'Male',
    address: '',
    village: '',
    district: 'Palamu',
    state: 'Jharkhand',
    pin_code: '',
    photo_url: user.photo_url || '',
    bio: '',
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    apiRequest<{ user: User; profile: any }>('/api/auth/me')
      .then((res) => {
        if (res.profile || res.user) {
          setForm({
            full_name: res.user?.full_name || '',
            email: res.user?.email || '',
            mobile: res.user?.mobile || '',
            father_name: res.profile?.father_name || '',
            dob: res.profile?.dob || '',
            gender: res.profile?.gender || 'Male',
            address: res.profile?.address || '',
            village: res.profile?.village || '',
            district: res.profile?.district || 'Palamu',
            state: res.profile?.state || 'Jharkhand',
            pin_code: res.profile?.pin_code || '',
            photo_url: res.profile?.photo_url || res.user?.photo_url || '',
            bio: res.profile?.bio || '',
          });
        }
      })
      .catch((e: any) => setErr(e.message || 'Failed to load profile'));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      if (res.user) onUserUpdated(res.user);
      setMsg('Profile updated successfully.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (passwords.newPassword !== passwords.confirmPassword) {
      setErr('New password and confirmation do not match.');
      return;
    }
    setSavingPass(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMsg('Password changed successfully.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      {/* Account Header */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs flex flex-wrap items-center gap-4">
        {form.photo_url ? (
          <img src={form.photo_url} alt={user.full_name} className="w-16 h-16 rounded-full object-cover border border-neutral-200" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-[#3B0A0D] text-white flex items-center justify-center text-2xl font-bold">
            {user.full_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-base font-bold text-[#171717]">{user.full_name}</h2>
          <p className="text-xs text-[#737373] font-mono-num">
            {user.role_name} · {user.username} · {user.user_code}
          </p>
        </div>
        <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-medium cursor-pointer hover:bg-neutral-100">
          <FileUp className="w-3.5 h-3.5" /> Change Photo
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setErr('');
              try {
                const up = await uploadFile(f, 'madrasa-assets');
                setForm((prev) => ({ ...prev, photo_url: up.url }));
                setMsg('Photo uploaded. Click Save Profile to apply changes.');
              } catch (err: any) {
                setErr(err.message || 'Failed to upload photo');
              } finally {
                e.target.value = '';
              }
            }}
            className="hidden"
          />
        </label>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
          <UserIcon className="w-4 h-4 text-[#DC1726]" />
          <h3 className="text-sm font-bold text-[#171717]">Personal &amp; Contact Information</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Full Name *</label>
            <input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
          <div>
            <label className="block font-medium mb-1">Father&apos;s Name</label>
            <input type="text" value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
          <div>
            <label className="block font-medium mb-1">Mobile Number</label>
            <input type="text" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
          </div>
          <div>
            <label className="block font-medium mb-1">Email Address</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
          <div>
            <label className="block font-medium mb-1">Date of Birth</label>
            <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
          </div>
          <div>
            <label className="block font-medium mb-1">Gender</label>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block font-medium mb-1">Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
          <div>
            <label className="block font-medium mb-1">Village / Mohalla</label>
            <input type="text" value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
          <div>
            <label className="block font-medium mb-1">District</label>
            <input type="text" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
          <div>
            <label className="block font-medium mb-1">State &amp; PIN</label>
            <div className="flex gap-2">
              <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
              <input type="text" placeholder="PIN" value={form.pin_code} onChange={(e) => setForm({ ...form, pin_code: e.target.value })} className="w-24 px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block font-medium mb-1">Bio / Notes</label>
            <textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>

      {/* Change Password */}
      <form onSubmit={handleChangePassword} className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
          <KeyRound className="w-4 h-4 text-[#0EA5E9]" />
          <h3 className="text-sm font-bold text-[#171717]">Account Security &amp; Password Change</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Current Password *</label>
            <input type="password" required value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
          <div>
            <label className="block font-medium mb-1">New Password (min 6 chars) *</label>
            <input type="password" required minLength={6} value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
          <div>
            <label className="block font-medium mb-1">Confirm New Password *</label>
            <input type="password" required minLength={6} value={passwords.confirmPassword} onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPass}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4" /> {savingPass ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
};
