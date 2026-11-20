import React, { useMemo, useState } from 'react';
import { Grid2x2, LogOut, UserCircle, X } from 'lucide-react';
import { MadrasaSettings, NavModuleId, RoleSlug, User } from '../types.ts';
import { Language, translations } from '../i18n/translations.ts';
import { SIDEBAR_ITEMS } from './Sidebar.tsx';

interface MobileBottomNavProps {
  user: User;
  settings: MadrasaSettings | null;
  activeModule: NavModuleId;
  lang: Language;
  onSelectModule: (id: NavModuleId) => void;
  onLogout: () => void;
}

const ROLE_PINNED_TABS: Record<RoleSlug, NavModuleId[]> = {
  super_admin: ['dashboard', 'students', 'results', 'notices'],
  teacher: ['dashboard', 'attendance', 'results', 'homework'],
  student: ['dashboard', 'results', 'homework', 'notices'],
  parent: ['dashboard', 'my_child', 'results', 'notices'],
  committee_member: ['dashboard', 'admissions', 'results', 'notices'],
  public: ['dashboard', 'feed', 'notices', 'programs'],
};

const SHORT_TAB_LABELS: Partial<Record<NavModuleId, string>> = {
  dashboard: 'Home',
  my_child: 'My Child',
  super_admin: 'Admin',
  admissions: 'Admit',
  login_details: 'Logins',
  students: 'Students',
  teachers: 'Teachers',
  id_cards: 'ID Cards',
  parents: 'Parents',
  classes: 'Classes',
  subjects: 'Subjects',
  syllabus: 'Syllabus',
  attendance: 'Attend',
  examinations: 'Exams',
  results: 'Results',
  programs: 'Events',
  homework: 'Work',
  online_classes: 'Classes',
  notices: 'Notices',
  feed: 'Feed',
  chats: 'Chats',
  committee: 'Committee',
  reports: 'Reports',
  activity_logs: 'Logs',
  contact_us: 'Contact',
  profile: 'Profile',
};

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  user,
  settings,
  activeModule,
  lang,
  onSelectModule,
  onLogout,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = translations[lang];
  const chatsOpen = settings?.chats_open !== false;

  const visibleItems = useMemo(
    () =>
      SIDEBAR_ITEMS.filter((item) => {
        if (!item.roles.includes(user.role_slug)) return false;
        if (item.id === 'chats' && !chatsOpen && user.role_slug !== 'super_admin') return false;
        return true;
      }),
    [user.role_slug, chatsOpen]
  );

  const pinnedItems = useMemo(() => {
    const preferred = ROLE_PINNED_TABS[user.role_slug] || ['dashboard', 'notices', 'feed', 'contact_us'];
    const resolved = preferred
      .map((id) => visibleItems.find((item) => item.id === id))
      .filter((x): x is (typeof visibleItems)[number] => Boolean(x));

    for (const item of visibleItems) {
      if (resolved.length >= 4) break;
      if (!resolved.some((r) => r.id === item.id)) {
        resolved.push(item);
      }
    }
    return resolved.slice(0, 4);
  }, [user.role_slug, visibleItems]);

  const isMoreActive =
    drawerOpen ||
    (!pinnedItems.some((item) => item.id === activeModule) && activeModule !== 'dashboard');

  const handleNavigate = (id: NavModuleId) => {
    onSelectModule(id);
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* Native Mobile App "All Modules" Bottom Sheet */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-black/50 backdrop-blur-[2px] no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="bg-white rounded-t-3xl border-t border-neutral-200 shadow-2xl max-h-[82vh] flex flex-col app-sheet-enter pb-safe">
            {/* Drag Handle */}
            <div className="pt-2.5 pb-1 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-neutral-300" />
            </div>

            {/* Header + User Quick Info */}
            <div className="px-4 py-2.5 border-b border-neutral-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {user.photo_url ? (
                  <img
                    src={user.photo_url}
                    alt={user.full_name}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover border border-neutral-200 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-red-50 text-[#DC1726] flex items-center justify-center text-sm font-bold shrink-0">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#171717] truncate">{user.full_name}</div>
                  <div className="text-[11px] text-[#737373] truncate">{user.role_name}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="min-w-[40px] min-h-[40px] rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center active:scale-95 transition-transform"
                aria-label="Close app launcher"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* All Role Modules App Icon Grid */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="text-[11px] font-semibold text-[#737373] uppercase tracking-wider mb-3">
                All Portal Modules
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavigate(item.id)}
                      className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-2xl border text-center transition-all active:scale-95 min-h-[76px] ${
                        isActive
                          ? 'bg-[#DC1726] border-[#DC1726] text-white shadow-sm'
                          : 'bg-neutral-50 border-neutral-200/80 text-[#171717] hover:bg-neutral-100'
                      }`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-[#DC1726]'}`} />
                      <span className="text-[11px] font-semibold leading-tight line-clamp-2">
                        {t.nav[item.id]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Profile & Logout Actions */}
            <div className="px-4 py-3 border-t border-neutral-100 bg-neutral-50/70 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleNavigate('profile')}
                className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors active:scale-95 ${
                  activeModule === 'profile'
                    ? 'bg-[#DC1726] border-[#DC1726] text-white'
                    : 'bg-white border-neutral-200 text-[#171717]'
                }`}
              >
                <UserCircle className="w-4 h-4" />
                <span>My Profile</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onLogout();
                }}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-[#DC1726] text-xs font-semibold active:scale-95 transition-transform"
              >
                <LogOut className="w-4 h-4" />
                <span>{t.nav.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Native Mobile App Bottom Navigation Bar (< 768px only) */}
      <nav
        aria-label="Mobile app navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-neutral-200 shadow-[0_-4px_18px_rgba(0,0,0,0.06)] pb-safe no-print"
      >
        <div className="grid grid-cols-5 items-center h-[58px]">
          {pinnedItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id && !drawerOpen;
            const shortLabel = SHORT_TAB_LABELS[item.id] || t.nav[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 h-full min-h-[48px] px-1 transition-transform active:scale-95 ${
                  isActive ? 'text-[#DC1726]' : 'text-neutral-500'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 inset-x-4 h-[2.5px] rounded-b-full bg-[#DC1726]" />
                )}
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'stroke-[2.3]' : 'stroke-[1.9]'}`} />
                <span className={`text-[10px] leading-none truncate max-w-full ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {shortLabel}
                </span>
              </button>
            );
          })}

          {/* 5th Tab: All Apps / More */}
          <button
            type="button"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className={`relative flex flex-col items-center justify-center gap-1 h-full min-h-[48px] px-1 transition-transform active:scale-95 ${
              isMoreActive ? 'text-[#DC1726]' : 'text-neutral-500'
            }`}
          >
            {isMoreActive && (
              <span className="absolute top-0 inset-x-4 h-[2.5px] rounded-b-full bg-[#DC1726]" />
            )}
            <Grid2x2 className={`w-5 h-5 shrink-0 ${isMoreActive ? 'stroke-[2.3]' : 'stroke-[1.9]'}`} />
            <span className={`text-[10px] leading-none truncate max-w-full ${isMoreActive ? 'font-bold' : 'font-medium'}`}>
              Apps
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
