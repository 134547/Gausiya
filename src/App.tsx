import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest, clearStoredSession, getStoredRefreshToken, getStoredToken, setStoredSession } from './lib/api.ts';
import { safeReadJson } from './lib/imageUpload.ts';
import { initSupabaseClient, isSupabaseClientConfigured, supabase } from './lib/supabase.ts';
import { Language } from './i18n/translations.ts';
import { MadrasaSettings, NavModuleId, NotificationItem, User } from './types.ts';
import { SIDEBAR_ITEMS, Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { MobileBottomNav } from './components/MobileBottomNav.tsx';
import { MadrasaLogo } from './components/MadrasaLogo.tsx';
import { CornerAdWidget } from './components/CornerAdWidget.tsx';
import { HomePage, PublicHomeData } from './pages/HomePage.tsx';

const LoginPage = lazy(() => import('./components/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));
const PublicAdmissionPage = lazy(() =>
  import('./pages/PublicAdmissionPage.tsx').then((m) => ({ default: m.PublicAdmissionPage }))
);
const PublicCheckResultPage = lazy(() =>
  import('./pages/PublicCheckResultPage.tsx').then((m) => ({ default: m.PublicCheckResultPage }))
);
const DashboardPage = lazy(() => import('./pages/DashboardPage.tsx').then((m) => ({ default: m.DashboardPage })));
const MyChildPage = lazy(() => import('./pages/MyChildPage.tsx').then((m) => ({ default: m.MyChildPage })));
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage.tsx').then((m) => ({ default: m.SuperAdminPage })));
const AdmissionsPage = lazy(() => import('./pages/AdmissionsPage.tsx').then((m) => ({ default: m.AdmissionsPage })));
const StudentsPage = lazy(() => import('./pages/StudentsPage.tsx').then((m) => ({ default: m.StudentsPage })));
const TeachersPage = lazy(() => import('./pages/TeachersPage.tsx').then((m) => ({ default: m.TeachersPage })));
const IdCardsPage = lazy(() => import('./pages/IdCardsPage.tsx').then((m) => ({ default: m.IdCardsPage })));
const ParentsPage = lazy(() => import('./pages/ParentsPage.tsx').then((m) => ({ default: m.ParentsPage })));
const ClassesPage = lazy(() => import('./pages/ClassesPage.tsx').then((m) => ({ default: m.ClassesPage })));
const SubjectsPage = lazy(() => import('./pages/SubjectsPage.tsx').then((m) => ({ default: m.SubjectsPage })));
const SyllabusPage = lazy(() => import('./pages/SyllabusPage.tsx').then((m) => ({ default: m.SyllabusPage })));
const AttendancePage = lazy(() => import('./pages/AttendancePage.tsx').then((m) => ({ default: m.AttendancePage })));
const ExaminationsPage = lazy(() =>
  import('./pages/ExaminationsPage.tsx').then((m) => ({ default: m.ExaminationsPage }))
);
const ResultsPage = lazy(() => import('./pages/ResultsPage.tsx').then((m) => ({ default: m.ResultsPage })));
const CommitteePage = lazy(() => import('./pages/CommitteePage.tsx').then((m) => ({ default: m.CommitteePage })));
const ChatsPage = lazy(() => import('./pages/ChatsPage.tsx').then((m) => ({ default: m.ChatsPage })));
const LoginDetailsPage = lazy(() =>
  import('./pages/LoginDetailsPage.tsx').then((m) => ({ default: m.LoginDetailsPage }))
);
const HomeworkPage = lazy(() => import('./pages/HomeworkPage.tsx').then((m) => ({ default: m.HomeworkPage })));
const OnlineClassesPage = lazy(() =>
  import('./pages/OnlineClassesPage.tsx').then((m) => ({ default: m.OnlineClassesPage }))
);
const NoticesPage = lazy(() => import('./pages/NoticesPage.tsx').then((m) => ({ default: m.NoticesPage })));
const ProgramsPage = lazy(() => import('./pages/ProgramsPage.tsx').then((m) => ({ default: m.ProgramsPage })));
const FeedPage = lazy(() => import('./pages/FeedPage.tsx').then((m) => ({ default: m.FeedPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.tsx').then((m) => ({ default: m.ReportsPage })));
const ActivityLogsPage = lazy(() =>
  import('./pages/ActivityLogsPage.tsx').then((m) => ({ default: m.ActivityLogsPage }))
);
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));
const ContactUsPage = lazy(() => import('./pages/ContactUsPage.tsx').then((m) => ({ default: m.ContactUsPage })));

type PublicView = 'home' | 'login' | 'admission' | 'check_result';

const PUBLIC_HOME_CACHE_KEY = 'madrasa_public_home_v1';

function readCachedPublicHome(): PublicHomeData | null {
  try {
    const raw = localStorage.getItem(PUBLIC_HOME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'classes' in parsed) {
      return parsed as PublicHomeData;
    }
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function hasLocalSessionHint(): boolean {
  if (getStoredToken() || getStoredRefreshToken()) return true;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/i.test(k)) {
        return true;
      }
    }
  } catch {
    // ignore storage errors
  }
  return false;
}

const PageLoaderFallback: React.FC<{ label?: string }> = ({ label = 'Loading module...' }) => (
  <div className="min-h-[260px] flex items-center justify-center p-6">
    <div className="text-center space-y-2">
      <div className="w-7 h-7 rounded-full border-2 border-[#DC1726] border-t-transparent animate-spin mx-auto" />
      <p className="text-xs font-medium text-[#737373]">{label}</p>
    </div>
  </div>
);

export default function App() {
  const cachedHomeRef = useRef<PublicHomeData | null>(readCachedPublicHome());
  const initialHasTokenRef = useRef<boolean>(hasLocalSessionHint());

  const [user, setUser] = useState<User | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string>('');
  const [loginMode, setLoginMode] = useState<'login' | 'forgot' | 'reset' | 'register'>('login');
  const [loginAccountType, setLoginAccountType] = useState<'public' | 'parent'>('parent');
  const [settings, setSettings] = useState<MadrasaSettings | null>(cachedHomeRef.current?.settings || null);
  const [publicData, setPublicData] = useState<PublicHomeData | null>(cachedHomeRef.current);
  const [publicView, setPublicView] = useState<PublicView>('home');
  const [publicAdmissionSection, setPublicAdmissionSection] = useState<'form' | 'status'>('form');
  const [checkingAuth, setCheckingAuth] = useState(initialHasTokenRef.current);
  const [activeModule, setActiveModule] = useState<NavModuleId>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(isSupabaseClientConfigured);
  const currentUserIdRef = useRef<string | null>(null);
  const currentAuthUidRef = useRef<string | null>(null);
  const lastNotifSigRef = useRef<string>('');

  const lang: Language = 'en';

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [targetChatConvId, setTargetChatConvId] = useState<string | null>(null);
  const [selectedParentChildId, setSelectedParentChildId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
    localStorage.removeItem('madrasa_lang');
  }, []);

  const loadPublicHome = useCallback(async () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch('/api/public/home', {
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const { data } = await safeReadJson<PublicHomeData>(res);
          if (data) {
            setPublicData(data);
            if (data.settings) {
              setSettings((prev) => prev || data.settings);
            }
            try {
              localStorage.setItem(PUBLIC_HOME_CACHE_KEY, JSON.stringify(data));
            } catch {
              // ignore quota exceeded
            }
            return;
          }
        }
      } catch {
        // retry on transient network error
      }
      if (attempt < 2) {
        await new Promise((r) => window.setTimeout(r, 700));
      }
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      const nextList = res.notifications || [];
      const nextUnread = res.unreadCount || 0;
      const sig = `${nextUnread}|${nextList.map((n) => `${n.id}:${n.is_read}`).join(',')}`;
      if (sig === lastNotifSigRef.current) return;
      lastNotifSigRef.current = sig;
      setNotifications(nextList);
      setUnreadCount(nextUnread);
    } catch {
      // Ignore notification polling error if session expired
    }
  }, []);

  const fetchMe = useCallback(
    async (options?: { silent?: boolean; resetModule?: boolean; skipPublicFallback?: boolean }) => {
      const silent = Boolean(options?.silent);
      const resetModule = options?.resetModule !== false;
      if (!silent) setCheckingAuth(true);
      setPendingNotice(null);
      try {
        const res = await apiRequest<{ user: User; settings: MadrasaSettings }>('/api/auth/me');
        currentUserIdRef.current = res.user?.id || null;
        if (supabase) {
          supabase.auth
            .getSession()
            .then(({ data }) => {
              if (data.session?.user?.id) currentAuthUidRef.current = data.session.user.id;
            })
            .catch(() => {});
        }
        setUser(res.user);
        setSettings(res.settings);
        if (resetModule) setActiveModule('dashboard');
        loadNotifications();
      } catch (err: any) {
        currentUserIdRef.current = null;
        currentAuthUidRef.current = null;
        setUser(null);
        if (
          err instanceof ApiError &&
          err.status === 403 &&
          (err.code === 'ACCOUNT_PENDING' || err.code === 'ADMISSION_PENDING' || err.code === 'ADMISSION_REJECTED')
        ) {
          clearStoredSession();
          setPendingNotice(err.message);
        } else {
          clearStoredSession();
        }
        if (!options?.skipPublicFallback) {
          await loadPublicHome();
        }
      } finally {
        if (!silent) setCheckingAuth(false);
      }
    },
    [loadNotifications, loadPublicHome]
  );

  useEffect(() => {
    initSupabaseClient().then((ready) => {
      if (ready) setSupabaseReady(true);
    });
    if (initialHasTokenRef.current) {
      fetchMe({ silent: false, resetModule: true });
    } else {
      loadPublicHome();
      fetchMe({ silent: true, resetModule: true, skipPublicFallback: true });
    }
  }, [fetchMe, loadPublicHome]);

  useEffect(() => {
    const onSessionExpired = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      currentUserIdRef.current = null;
      clearStoredSession();
      setUser(null);
      setNotifications([]);
      setUnreadCount(0);
      setSessionNotice(detail?.message || 'Your session has expired. Please sign in again.');
      setLoginMode('login');
      setPublicView('login');
    };
    window.addEventListener('madrasa:session-expired', onSessionExpired);
    return () => window.removeEventListener('madrasa:session-expired', onSessionExpired);
  }, []);

  useEffect(() => {
    if (!supabaseReady || !supabase) return;

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (session?.access_token) setStoredSession(session.access_token, session.refresh_token);
        currentUserIdRef.current = null;
        setLoginMode('reset');
        setPublicView('login');
        setUser(null);
        setCheckingAuth(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.access_token) {
          setStoredSession(session.access_token, session.refresh_token);
        }
        if (event === 'SIGNED_IN') {
          const authUid = session?.user?.id || null;
          if (
            currentUserIdRef.current &&
            (!authUid || currentUserIdRef.current === authUid || currentAuthUidRef.current === authUid)
          ) {
            if (authUid) currentAuthUidRef.current = authUid;
            return;
          }
          if (authUid) currentAuthUidRef.current = authUid;
          fetchMe({ silent: true, resetModule: !currentUserIdRef.current });
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        currentUserIdRef.current = null;
        currentAuthUidRef.current = null;
        lastNotifSigRef.current = '';
        clearStoredSession();
        setUser(null);
        setPendingNotice(null);
        setNotifications([]);
        setUnreadCount(0);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [fetchMe, supabaseReady]);

  useEffect(() => {
    if (!user) return;
    const onNotifsUpdated = () => {
      loadNotifications();
    };
    window.addEventListener('madrasa:notifications-updated', onNotifsUpdated);
    return () => {
      window.removeEventListener('madrasa:notifications-updated', onNotifsUpdated);
    };
  }, [user, loadNotifications]);

  const handleLoginSuccess = async (loggedInUser: User) => {
    currentUserIdRef.current = loggedInUser.id;
    currentAuthUidRef.current = loggedInUser.id;
    lastNotifSigRef.current = '';
    setPendingNotice(null);
    setSessionNotice('');
    setUser(loggedInUser);
    setActiveModule('dashboard');
    try {
      const res = await apiRequest<{ user: User; settings: MadrasaSettings }>('/api/auth/me');
      currentUserIdRef.current = res.user?.id || loggedInUser.id;
      setUser(res.user);
      setSettings(res.settings);
      loadNotifications();
    } catch {
      // keep loggedInUser
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    currentUserIdRef.current = null;
    clearStoredSession();
    setUser(null);
    setPendingNotice(null);
    setSessionNotice('');
    setNotifications([]);
    setUnreadCount(0);
    setActiveModule('dashboard');
    setLoginMode('login');
    setPublicView('home');
    loadPublicHome();
  };

  const handleSelectModule = useCallback(
    (mod: NavModuleId) => {
      if (!user) return;
      if (mod === 'profile') {
        setActiveModule('profile');
        return;
      }
      const chatsOpen = settings?.chats_open !== false;
      const navConfig = SIDEBAR_ITEMS.find((i) => i.id === mod);
      if (
        navConfig &&
        navConfig.roles.includes(user.role_slug) &&
        !(mod === 'chats' && !chatsOpen && user.role_slug !== 'super_admin')
      ) {
        setActiveModule(mod);
      } else {
        setActiveModule('dashboard');
      }
    },
    [user, settings?.chats_open]
  );

  const handleOpenParentChild = useCallback((studentId: string | null) => {
    setSelectedParentChildId(studentId);
    setActiveModule('my_child');
  }, []);

  const handleClearSelectedParentChild = useCallback(() => {
    setSelectedParentChildId(null);
  }, []);

  const handleClearTargetChatConv = useCallback(() => {
    setTargetChatConvId(null);
  }, []);

  const handleMarkNotificationRead = async (id: string) => {
    const clicked = notifications.find((n) => n.id === id);
    if (clicked?.link_module === 'chats' && clicked.reference_id) {
      setTargetChatConvId(clicked.reference_id);
    }
    if (clicked && !clicked.is_read) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      loadNotifications();
    } catch {
      // ignore
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      loadNotifications();
    } catch {
      // ignore
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 rounded-full border-2 border-[#DC1726] border-t-transparent animate-spin mx-auto" />
          <p className="text-xs font-medium text-[#737373]">Loading Madrasa Gausiya Razvia Portal...</p>
        </div>
      </div>
    );
  }

  if (!user && pendingNotice) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8 text-center space-y-4">
          <div className="flex justify-center">
            <MadrasaLogo logoUrl={settings?.logo_url} size={64} />
          </div>
          <h1 className="text-lg font-bold text-[#171717]">Account Pending Approval</h1>
          <p className="text-xs text-[#737373] leading-relaxed">{pendingNotice}</p>
          <p className="text-xs text-[#737373]">
            Please contact the Madrasa Gausiya Razvia Super Admin to assign your role and activate portal access.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    if (publicView === 'login') {
      return (
        <Suspense fallback={<PageLoaderFallback label="Opening Login Portal..." />}>
          <LoginPage
            lang={lang}
            onSuccess={handleLoginSuccess}
            initialMode={loginMode}
            initialAccountType={loginAccountType}
            initialError={sessionNotice}
            onBackHome={() => {
              setSessionNotice('');
              setLoginMode('login');
              setPublicView('home');
            }}
          />
        </Suspense>
      );
    }
    if (publicView === 'admission') {
      return (
        <Suspense fallback={<PageLoaderFallback label="Loading Online Admission Form..." />}>
          <PublicAdmissionPage
            settings={settings || publicData?.settings || null}
            admissionsOpen={
              publicData?.admissionsOpen !== false &&
              (settings?.admissions_open ?? publicData?.settings?.admissions_open) !== false
            }
            classes={publicData?.classes || []}
            initialSection={publicAdmissionSection}
            onBackHome={() => {
              setPublicView('home');
              loadPublicHome();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onGoLogin={() => {
              setLoginMode('login');
              setPublicView('login');
            }}
          />
        </Suspense>
      );
    }
    if (publicView === 'check_result') {
      return (
        <Suspense fallback={<PageLoaderFallback label="Loading Result Verification..." />}>
          <PublicCheckResultPage
            settings={settings || publicData?.settings || null}
            resultsOpen={
              publicData?.resultsOpen !== false &&
              (settings?.results_open ?? publicData?.settings?.results_open) !== false
            }
            onBackHome={() => {
              setPublicView('home');
              loadPublicHome();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onGoLogin={() => {
              setLoginMode('login');
              setPublicView('login');
            }}
          />
        </Suspense>
      );
    }
    return (
      <HomePage
        data={publicData}
        lang={lang}
        onOpenLogin={() => {
          setLoginMode('login');
          setPublicView('login');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenParentRegister={() => {
          setLoginAccountType('parent');
          setLoginMode('register');
          setPublicView('login');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenAdmission={() => {
          setPublicAdmissionSection('form');
          setPublicView('admission');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenAdmissionStatus={() => {
          setPublicAdmissionSection('status');
          setPublicView('admission');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenCheckResult={() => {
          setPublicView('check_result');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'super_admin':
        return user.role_slug === 'super_admin' ? (
          <SuperAdminPage user={user} onSettingsUpdated={(s) => setSettings(s)} />
        ) : (
          <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} onOpenChild={handleOpenParentChild} />
        );
      case 'dashboard':
        return <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} onOpenChild={handleOpenParentChild} />;
      case 'my_child':
        return user.role_slug === 'parent' ? (
          <MyChildPage
            user={user}
            settings={settings}
            initialStudentId={selectedParentChildId}
            onInitialStudentHandled={handleClearSelectedParentChild}
          />
        ) : (
          <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} onOpenChild={handleOpenParentChild} />
        );
      case 'chats':
        return user.role_slug === 'super_admin' || settings?.chats_open !== false ? (
          <ChatsPage
            user={user}
            settings={settings}
            onSettingsUpdated={(s) => setSettings(s)}
            initialConvId={targetChatConvId}
            onInitialConvHandled={handleClearTargetChatConv}
          />
        ) : (
          <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} onOpenChild={handleOpenParentChild} />
        );
      case 'committee':
        return <CommitteePage user={user} settings={settings} />;
      case 'admissions':
        return (
          <AdmissionsPage
            settings={settings}
            user={user}
            onSettingsUpdated={(s) => {
              setSettings(s);
              loadPublicHome();
            }}
          />
        );
      case 'login_details':
        return user.role_slug === 'super_admin' ? (
          <LoginDetailsPage />
        ) : (
          <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} />
        );
      case 'students':
        return <StudentsPage user={user} settings={settings} />;
      case 'teachers':
        return <TeachersPage user={user} settings={settings} />;
      case 'id_cards':
        return user.role_slug === 'super_admin' ? (
          <IdCardsPage settings={settings} />
        ) : (
          <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} onOpenChild={handleOpenParentChild} />
        );
      case 'parents':
        return <ParentsPage user={user} />;
      case 'classes':
        return <ClassesPage user={user} />;
      case 'subjects':
        return <SubjectsPage user={user} />;
      case 'syllabus':
        return <SyllabusPage user={user} />;
      case 'attendance':
        return <AttendancePage user={user} settings={settings} />;
      case 'examinations':
        return <ExaminationsPage user={user} settings={settings} />;
      case 'results':
        return (
          <ResultsPage
            user={user}
            settings={settings}
            onSettingsUpdated={(s) => {
              setSettings(s);
              loadPublicHome();
            }}
          />
        );
      case 'programs':
        return <ProgramsPage user={user} />;
      case 'homework':
        return <HomeworkPage user={user} />;
      case 'online_classes':
        return <OnlineClassesPage user={user} />;
      case 'notices':
        return <NoticesPage user={user} settings={settings} />;
      case 'feed':
        return <FeedPage user={user} />;
      case 'reports':
        return <ReportsPage user={user} settings={settings} />;
      case 'activity_logs':
        return user.role_slug === 'super_admin' ? (
          <ActivityLogsPage />
        ) : (
          <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} />
        );
      case 'contact_us':
        return <ContactUsPage settings={settings} />;
      case 'profile':
        return <ProfilePage user={user} onUserUpdated={(u) => setUser(u)} />;
      default:
        return <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717]">
      <Sidebar
        user={user}
        settings={settings}
        activeModule={activeModule}
        lang={lang}
        mobileOpen={mobileOpen}
        onSelectModule={handleSelectModule}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />

      <div className="md:ps-56 lg:ps-64 min-h-screen flex flex-col">
        <TopBar
          user={user}
          activeModule={activeModule}
          lang={lang}
          notifications={notifications}
          unreadCount={unreadCount}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onSelectModule={handleSelectModule}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onRefreshNotifications={loadNotifications}
          onLogout={handleLogout}
        />

        <main className="flex-1 p-3 sm:p-5 md:p-6 pb-24 md:pb-6 min-w-0">
          <Suspense fallback={<PageLoaderFallback />}>
            {renderModule()}
          </Suspense>
        </main>
      </div>

      <MobileBottomNav
        user={user}
        settings={settings}
        activeModule={activeModule}
        lang={lang}
        onSelectModule={handleSelectModule}
        onLogout={handleLogout}
      />

      <CornerAdWidget
        context="portal"
        canManage={user.role_slug === 'super_admin' || user.role_slug === 'committee_member'}
      />
    </div>
  );
}
