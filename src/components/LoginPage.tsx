import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Globe,
  KeyRound,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  User as UserIcon,
  UserPlus,
} from 'lucide-react';
import { apiRequest, setStoredToken } from '../lib/api.ts';
import { isSupabaseClientConfigured, missingSupabaseClientEnv, supabase } from '../lib/supabase.ts';
import { User } from '../types.ts';
import { Language } from '../i18n/translations.ts';
import { MadrasaLogo } from './MadrasaLogo.tsx';

interface LoginPageProps {
  lang: Language;
  onToggleLang: () => void;
  onSuccess: (user: User) => void;
  onBackHome?: () => void;
  initialMode?: 'login' | 'forgot' | 'reset' | 'register';
  initialError?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  lang,
  onToggleLang,
  onSuccess,
  onBackHome,
  initialMode = 'login',
  initialError = '',
}) => {
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset' | 'setup' | 'register'>(initialMode);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupForm, setSetupForm] = useState({ full_name: '', username: '', email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    full_name: '',
    username: '',
    email: '',
    mobile: '',
    father_name: '',
    village: '',
    district: 'Palamu',
    password: '',
  });
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.needsSetup) {
          setNeedsSetup(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const data = await apiRequest<{
        token: string;
        session?: { access_token: string; refresh_token: string };
        user: User;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });

      setStoredToken(data.token);
      if (supabase && data.session?.access_token && data.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const data = await apiRequest<{
        token: string;
        session?: { access_token: string; refresh_token: string };
        user: User;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registerForm),
      });

      setStoredToken(data.token);
      if (supabase && data.session?.access_token && data.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const data = await apiRequest<{
        token: string;
        session?: { access_token: string; refresh_token: string };
        user: User;
      }>('/api/auth/setup-admin', {
        method: 'POST',
        body: JSON.stringify(setupForm),
      });

      setStoredToken(data.token);
      if (supabase && data.session?.access_token && data.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Failed to create Super Admin account');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    if (!supabase) {
      setError(`Supabase Auth is not configured. Please set ${missingSupabaseClientEnv.join(' and ')}.`);
      return;
    }
    if (!resetEmail.includes('@')) {
      setError('Please enter the registered email address for your account.');
      return;
    }
    setLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: window.location.origin,
      });
      if (resetErr) throw resetErr;
      setInfoMsg('Password reset link sent. Please check your email inbox and open the link to set a new password.');
    } catch (err: any) {
      setError(err?.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    if (!supabase) {
      setError(`Supabase Auth is not configured. Please set ${missingSupabaseClientEnv.join(' and ')}.`);
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) throw updErr;
      setInfoMsg('Password updated successfully. You can now sign in with your new password.');
      setPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setMode('login');
    } catch (err: any) {
      setError(err?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-between p-4 sm:p-8">
      <div className="flex items-center justify-between max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <MadrasaLogo size={44} />
          <div>
            <div className="text-sm font-bold text-[#171717]">Madrasa Ghausia Razvia</div>
            <div className="text-xs text-[#737373]">Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onBackHome && (
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{lang === 'en' ? 'Home' : 'ہوم پیج'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5 text-[#DC1726]" />
            <span>{lang === 'en' ? 'اردو' : 'English'}</span>
          </button>
        </div>
      </div>

      <div className="max-w-md w-full mx-auto my-8 bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8">
        <div className="text-center mb-5">
          <div className="flex justify-center mb-3">
            <MadrasaLogo size={72} />
          </div>
          <h1 className="text-xl font-bold text-[#171717]">
            {lang === 'ur' ? 'مدرسہ غوثیہ رضویہ پورٹل' : 'Madrasa Management Portal'}
          </h1>
          <p className="urdu-text text-sm text-[#DC1726] font-semibold mt-0.5">
            مدرسہ غوثیہ رضویہ، اسلام نگر، رام گڑھ
          </p>
        </div>

        {(mode === 'login' || mode === 'register') && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setError('');
                setInfoMsg('');
                setMode('login');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'login' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              {lang === 'ur' ? 'سائن ان' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError('');
                setInfoMsg('');
                setMode('register');
              }}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'register' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-[#DC1726]" />
              <span>{lang === 'ur' ? 'نیا اکاؤنٹ بنائیں' : 'Create Account'}</span>
            </button>
          </div>
        )}

        {!isSupabaseClientConfigured && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <div className="font-semibold">Supabase Configuration Required</div>
              <p className="mt-0.5">
                Configure <span className="font-mono-num">{missingSupabaseClientEnv.join(', ')}</span> in your environment variables to enable authentication.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
            {error}
          </div>
        )}
        {infoMsg && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
            {infoMsg}
          </div>
        )}

        {needsSetup && mode === 'login' && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-[#10B981]" />
              <span>Initial Super Admin Account Setup Needed</span>
            </div>
            <p className="text-emerald-800/90">
              No active Super Admin account was found in Supabase yet. Register your Super Admin account first before signing in.
            </p>
            <button
              type="button"
              onClick={() => {
                setError('');
                setInfoMsg('');
                setMode('setup');
              }}
              className="w-full py-2 px-3 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white font-semibold transition-colors"
            >
              Setup Super Admin Account
            </button>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} autoComplete="off" className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1.5">
                {lang === 'ur' ? 'یوزر نیم / ای میل / موبائل' : 'Username, Email, or Mobile'}
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={lang === 'ur' ? 'یوزر نیم یا ای میل درج کریں' : 'Enter username, email, or mobile'}
                  className="w-full ps-9 pe-3 py-2.5 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#DC1726]/20 focus:border-[#DC1726]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#171717]">
                  {lang === 'ur' ? 'پاس ورڈ' : 'Password'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setInfoMsg('');
                    if (identifier.includes('@')) setResetEmail(identifier);
                    setMode('forgot');
                  }}
                  className="text-xs font-medium text-[#DC1726] hover:underline"
                >
                  {lang === 'ur' ? 'پاس ورڈ بھول گئے؟' : 'Forgot password?'}
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={lang === 'ur' ? 'پاس ورڈ درج کریں' : 'Enter password'}
                  className="w-full ps-9 pe-3 py-2.5 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#DC1726]/20 focus:border-[#DC1726]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#DC1726] hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in...' : lang === 'ur' ? 'لاگ ان کریں' : 'Sign In to Portal'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} autoComplete="off" className="space-y-3">
            <p className="text-xs text-[#737373]">
              Create a portal account (starts with Public access; Super Admin can upgrade your role to Teacher, Student, Parent, or Committee Member).
            </p>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1">Full Name *</label>
              <input
                type="text"
                required
                placeholder="Enter full name"
                value={registerForm.full_name}
                onChange={(e) => setRegisterForm((p) => ({ ...p, full_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Username *</label>
                <input
                  type="text"
                  required
                  placeholder="username"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm((p) => ({ ...p, username: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 font-mono-num focus:outline-none focus:border-[#DC1726]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Mobile Number</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={registerForm.mobile}
                  onChange={(e) => setRegisterForm((p) => ({ ...p, mobile: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 font-mono-num focus:outline-none focus:border-[#DC1726]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1">Email Address *</label>
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={registerForm.email}
                onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">Father&apos;s Name</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={registerForm.father_name}
                  onChange={(e) => setRegisterForm((p) => ({ ...p, father_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">District</label>
                <input
                  type="text"
                  value={registerForm.district}
                  onChange={(e) => setRegisterForm((p) => ({ ...p, district: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1">Password (min 6 chars) *</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Create password"
                value={registerForm.password}
                onChange={(e) => setRegisterForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#DC1726] hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Creating Account...' : 'Create Account & Enter Portal'}
            </button>
          </form>
        )}

        {mode === 'setup' && (
          <form onSubmit={handleSetupAdmin} autoComplete="off" className="space-y-3.5">
            <p className="text-xs text-[#737373]">
              Create the primary Super Admin account in Supabase Auth &amp; Portal Database.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1">Full Name *</label>
              <input
                type="text"
                required
                autoComplete="off"
                placeholder="Enter full name"
                value={setupForm.full_name}
                onChange={(e) => setSetupForm((p) => ({ ...p, full_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1">Username *</label>
              <input
                type="text"
                required
                autoComplete="off"
                placeholder="Enter username"
                value={setupForm.username}
                onChange={(e) => setSetupForm((p) => ({ ...p, username: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1">Email Address *</label>
              <input
                type="email"
                required
                autoComplete="off"
                placeholder="Enter email address"
                value={setupForm.email}
                onChange={(e) => setSetupForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1">Password (min 6 chars) *</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Enter password"
                value={setupForm.password}
                onChange={(e) => setSetupForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#DC1726] hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Creating Account...' : 'Create Super Admin & Sign In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError('');
                setInfoMsg('');
                setMode('login');
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#737373] hover:text-[#171717]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className="text-xs text-[#737373]">
              Enter your registered email address to receive a secure password reset link via Supabase Auth.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1.5">Registered Email Address</label>
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="name@madrasa.org"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#DC1726]/20 focus:border-[#DC1726]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !isSupabaseClientConfigured}
              className="w-full py-2.5 px-4 rounded-lg bg-[#DC1726] hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError('');
                setInfoMsg('');
                setMode('login');
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#737373] hover:text-[#171717]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-xs text-[#737373]">
              Set a new password for your Madrasa Ghausia Razvia Portal account.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1.5">New Password (min 6 chars)</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full ps-9 pe-3 py-2.5 text-sm rounded-lg border border-neutral-200"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#171717] mb-1.5">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-neutral-200"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#DC1726] hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#737373] hover:text-[#171717]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </button>
          </form>
        )}

        {/* Contact Us Help Bar */}
        <div className="mt-6 pt-4 border-t border-neutral-100 text-center space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">Contact Us / Help</div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <a
              href="https://wa.me/917209629509"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-[#10B981] font-semibold hover:bg-emerald-100 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="font-mono-num">WhatsApp: 7209629509</span>
            </a>
            <a
              href="mailto:dil.dil.a.1345@gmail.com"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-[#DC1726] font-semibold hover:bg-red-100 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>dil.dil.a.1345@gmail.com</span>
            </a>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-[#737373]">
        Madrasa Ghausia Razvia · Islamnagar, Ramgarh, Palamu, Jharkhand, 822110 · WhatsApp: 7209629509
      </div>
    </div>
  );
};
