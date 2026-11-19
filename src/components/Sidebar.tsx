import React from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileBarChart,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Library,
  LogOut,
  MessageCircle,
  Monitor,
  PhoneCall,
  Rss,
  Settings,
  Sparkles,
  UserCheck,
  UserCircle,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { MadrasaSettings, NavModuleId, RoleSlug, User } from '../types.ts';
import { Language, translations } from '../i18n/translations.ts';
import { MadrasaLogo } from './MadrasaLogo.tsx';

export interface NavItemConfig {
  id: NavModuleId;
  icon: React.ComponentType<{ className?: string }>;
  roles: RoleSlug[];
}

export const SIDEBAR_ITEMS: NavItemConfig[] = [
  { id: 'super_admin', icon: Settings, roles: ['super_admin'] },
  { id: 'dashboard', icon: LayoutGrid, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'] },
  { id: 'my_child', icon: UsersRound, roles: ['parent'] },
  { id: 'chats', icon: MessageCircle, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'] },
  { id: 'committee', icon: Users, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'] },
  { id: 'admissions', icon: ClipboardList, roles: ['super_admin', 'committee_member'] },
  { id: 'login_details', icon: KeyRound, roles: ['super_admin'] },
  { id: 'students', icon: GraduationCap, roles: ['super_admin', 'teacher', 'parent', 'student'] },
  { id: 'teachers', icon: UserCheck, roles: ['super_admin', 'committee_member'] },
  { id: 'id_cards', icon: CreditCard, roles: ['super_admin'] },
  { id: 'parents', icon: UsersRound, roles: ['super_admin', 'parent'] },
  { id: 'classes', icon: Building2, roles: ['super_admin', 'teacher'] },
  { id: 'subjects', icon: BookOpen, roles: ['super_admin', 'teacher'] },
  { id: 'syllabus', icon: Library, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'] },
  { id: 'attendance', icon: ClipboardCheck, roles: ['super_admin', 'teacher', 'parent', 'student'] },
  { id: 'examinations', icon: CalendarCheck, roles: ['super_admin', 'teacher', 'parent', 'student'] },
  { id: 'results', icon: BarChart3, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member'] },
  { id: 'programs', icon: Sparkles, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'] },
  { id: 'homework', icon: BookMarked, roles: ['super_admin', 'teacher', 'parent', 'student'] },
  { id: 'online_classes', icon: Monitor, roles: ['super_admin', 'teacher', 'parent', 'student'] },
  { id: 'notices', icon: Bell, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'] },
  { id: 'feed', icon: Rss, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'] },
  { id: 'reports', icon: FileBarChart, roles: ['super_admin', 'committee_member', 'teacher'] },
  { id: 'activity_logs', icon: Activity, roles: ['super_admin'] },
  { id: 'contact_us', icon: PhoneCall, roles: ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'] },
];

interface SidebarProps {
  user: User;
  settings: MadrasaSettings | null;
  activeModule: NavModuleId;
  lang: Language;
  mobileOpen: boolean;
  onSelectModule: (id: NavModuleId) => void;
  onCloseMobile: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  settings,
  activeModule,
  lang,
  mobileOpen,
  onSelectModule,
  onCloseMobile,
  onLogout,
}) => {
  const t = translations[lang];
  const chatsOpen = settings?.chats_open !== false;
  const visibleItems = SIDEBAR_ITEMS.filter((item) => {
    if (!item.roles.includes(user.role_slug)) return false;
    if (item.id === 'chats' && !chatsOpen && user.role_slug !== 'super_admin') return false;
    return true;
  });

  const sidebarContent = (
    <aside className="flex flex-col h-full w-64 bg-[#171717] text-white select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <MadrasaLogo logoUrl={settings?.logo_url} size={38} surface="dark" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">
              {lang === 'ur' ? (settings?.name_urdu || t.portalTitle) : t.portalTitle}
            </div>
            <div className="text-[11px] text-neutral-400 truncate">{user.role_name}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectModule(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#DC1726] text-white shadow-sm'
                  : 'text-neutral-300 hover:text-white hover:bg-white/8'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.nav[item.id]}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Profile & Logout */}
      <div className="p-3 border-t border-white/10 space-y-1.5">
        <button
          type="button"
          onClick={() => {
            onSelectModule('profile');
            onCloseMobile();
          }}
          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors text-start ${
            activeModule === 'profile' ? 'bg-[#DC1726] text-white' : 'hover:bg-white/8 text-neutral-200'
          }`}
        >
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.full_name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/20"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#450A0A] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{user.full_name}</div>
            <div className="text-[11px] text-neutral-400 truncate font-mono-num">{user.username}</div>
          </div>
          <UserCircle className="w-4 h-4 text-neutral-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-300 hover:text-white hover:bg-white/8 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>{t.nav.logout}</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <div className="hidden lg:block fixed inset-y-0 start-0 z-30 w-64 no-print">
        {sidebarContent}
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-black/50" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
