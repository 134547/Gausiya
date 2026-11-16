import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest, setStoredToken } from './lib/api.ts';
import { initSupabaseClient, isSupabaseClientConfigured, supabase } from './lib/supabase.ts';
import { Language } from './i18n/translations.ts';
import { MadrasaSettings, NavModuleId, NotificationItem, User } from './types.ts';
import { LoginPage } from './components/LoginPage.tsx';
import { SIDEBAR_ITEMS, Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { MadrasaLogo } from './components/MadrasaLogo.tsx';
import { HomePage, PublicHomeData } from './pages/HomePage.tsx';
import { PublicAdmissionPage } from './pages/PublicAdmissionPage.tsx';
import { PublicCheckResultPage } from './pages/PublicCheckResultPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { SuperAdminPage } from './pages/SuperAdminPage.tsx';
import { AdmissionsPage } from './pages/AdmissionsPage.tsx';
import { StudentsPage } from './pages/StudentsPage.tsx';
import { TeachersPage } from './pages/TeachersPage.tsx';
import { ParentsPage } from './pages/ParentsPage.tsx';
import { ClassesPage } from './pages/ClassesPage.tsx';
import { SubjectsPage } from './pages/SubjectsPage.tsx';
import { AttendancePage } from './pages/AttendancePage.tsx';
import { ExaminationsPage } from './pages/ExaminationsPage.tsx';
import { ResultsPage } from './pages/ResultsPage.tsx';
import { CommitteePage } from './pages/CommitteePage.tsx';
import { ChatsPage } from './pages/ChatsPage.tsx';
import { LoginDetailsPage } from './pages/LoginDetailsPage.tsx';
import { HomeworkPage } from './pages/HomeworkPage.tsx';
import { OnlineClassesPage } from './pages/OnlineClassesPage.tsx';
import { NoticesPage } from './pages/NoticesPage.tsx';
import { ProgramsPage } from './pages/ProgramsPage.tsx';
import { FeedPage } from './pages/FeedPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { ActivityLogsPage } from './pages/ActivityLogsPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { ContactUsPage } from './pages/ContactUsPage.tsx';

type PublicView = 'home' | 'login' | 'admission' | 'check_result';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [settings, setSettings] = useState<MadrasaSettings | null>(null);
  const [publicData, setPublicData] = useState<PublicHomeData | null>(null);
  const [publicView, setPublicView] = useState<PublicView>('home');
  const [publicAdmissionSection, setPublicAdmissionSection] = useState<'form' | 'status'>('form');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeModule, setActiveModule] = useState<NavModuleId>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(isSupabaseClientConfigured);
  const currentUserIdRef = useRef<string | null>(null);

  const lang: Language = 'en';

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
    localStorage.removeItem('madrasa_lang');
  }, []);

  const loadPublicHome = useCallback(async () => {
    try {
      const res = await fetch('/api/public/home');
      if (res.ok) {
        const data = (await res.json()) as PublicHomeData;
        setPublicData(data);
        if (data.settings) {
          setSettings((prev) => prev || data.settings);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Ignore notification polling error if session expired
    }
  }, []);

  const fetchMe = useCallback(async (options?: { silent?: boolean; resetModule?: boolean }) => {
    const silent = Boolean(options?.silent);
    const resetModule = options?.resetModule !== false;
    if (!silent) setCheckingAuth(true);
    setPendingNotice(null);
    try {
      const res = await apiRequest<{ user: User; settings: MadrasaSettings }>('/api/auth/me');
      currentUserIdRef.current = res.user?.id || null;
      setUser(res.user);
      setSettings(res.settings);
      if (resetModule) setActiveModule('dashboard');
      loadNotifications();
    } catch (err: any) {
      currentUserIdRef.current = null;
      setUser(null);
      if (err instanceof ApiError && err.status === 403 && err.code === 'ACCOUNT_PENDING') {
        setPendingNotice(err.message);
      } else {
        setStoredToken(null);
      }
      await loadPublicHome();
    } finally {
      if (!silent) setCheckingAuth(false);
    }
  }, [loadNotifications, loadPublicHome]);

  useEffect(() => {
    initSupabaseClient().then((ready) => {
      if (ready) setSupabaseReady(true);
    });
    fetchMe({ silent: false, resetModule: true });
  }, [fetchMe]);

  useEffect(() => {
    if (!supabaseReady || !supabase) return;

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (session?.access_token) setStoredToken(session.access_token);
        currentUserIdRef.current = null;
        setLoginMode('reset');
        setPublicView('login');
        setUser(null);
        setCheckingAuth(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.access_token) {
          setStoredToken(session.access_token);
        }
        if (event === 'SIGNED_IN') {
          const authUid = session?.user?.id || null;
          if (authUid && currentUserIdRef.current === authUid) {
            return;
          }
          fetchMe({ silent: true, resetModule: !currentUserIdRef.current });
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        currentUserIdRef.current = null;
        setStoredToken(null);
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
    const timer = window.setInterval(loadNotifications, 25000);
    return () => window.clearInterval(timer);
  }, [user, loadNotifications]);

  const handleLoginSuccess = async (loggedInUser: User) => {
    currentUserIdRef.current = loggedInUser.id;
    setPendingNotice(null);
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
    setStoredToken(null);
    setUser(null);
    setPendingNotice(null);
    setNotifications([]);
    setUnreadCount(0);
    setActiveModule('dashboard');
    setLoginMode('login');
    setPublicView('home');
    loadPublicHome();
  };

  const handleSelectModule = (mod: NavModuleId) => {
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
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      loadNotifications();
    } catch {
      // ignore
    }
  };

  const handleMarkAllNotificationsRead = async () => {
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
          <p className="text-xs font-medium text-[#737373]">Loading Madrasa Ghausia Razvia Portal...</p>
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
            Please contact the Madrasa Ghausia Razvia Super Admin to assign your role and activate portal access.
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
        <LoginPage
          lang={lang}
          onSuccess={handleLoginSuccess}
          initialMode={loginMode}
          onBackHome={() => {
            setLoginMode('login');
            setPublicView('home');
          }}
        />
      );
    }
    if (publicView === 'admission') {
      return (
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
      );
    }
    if (publicView === 'check_result') {
      return (
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
          <SuperAdminPage onSettingsUpdated={(s) => setSettings(s)} />
        ) : (
          <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} />
        );
      case 'dashboard':
        return <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} />;
      case 'chats':
        return user.role_slug === 'super_admin' || settings?.chats_open !== false ? (
          <ChatsPage
            user={user}
            settings={settings}
            onSettingsUpdated={(s) => setSettings(s)}
          />
        ) : (
          <DashboardPage user={user} lang={lang} onNavigate={handleSelectModule} />
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
      case 'parents':
        return <ParentsPage user={user} />;
      case 'classes':
        return <ClassesPage user={user} />;
      case 'subjects':
        return <SubjectsPage user={user} />;
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
        return <ReportsPage settings={settings} />;
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

      <div className="lg:ps-64 min-h-screen flex flex-col">
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
          onLogout={handleLogout}
        />

        <main className="flex-1 p-4 sm:p-6">
          {renderModule()}
        </main>
      </div>
    </div>
  );
}
