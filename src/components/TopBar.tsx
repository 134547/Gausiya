import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, Copy, LogOut, Menu } from 'lucide-react';
import { NavModuleId, NotificationItem, User } from '../types.ts';
import { Language, translations } from '../i18n/translations.ts';

interface TopBarProps {
  user: User;
  activeModule: NavModuleId;
  lang: Language;
  notifications: NotificationItem[];
  unreadCount: number;
  onOpenMobileMenu: () => void;
  onSelectModule: (id: NavModuleId) => void;
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onRefreshNotifications?: () => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  user,
  activeModule,
  lang,
  notifications,
  unreadCount,
  onOpenMobileMenu,
  onSelectModule,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onRefreshNotifications,
  onLogout,
}) => {
  const t = translations[lang];
  const [notifOpen, setNotifOpen] = useState(false);
  const [copiedOtpNotifId, setCopiedOtpNotifId] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleCopyOtp = async (e: React.MouseEvent, id: string, code: string) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedOtpNotifId(id);
      window.setTimeout(() => {
        setCopiedOtpNotifId((cur) => (cur === id ? null : cur));
      }, 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const title = t.nav[activeModule] || t.nav.dashboard;
  const subtitle =
    activeModule === 'dashboard'
      ? `${user.role_name} · ${t.institutionName}`
      : `${t.institutionName} · ${t.institutionSub}`;

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-neutral-200 px-4 sm:px-6 py-3 no-print">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Hamburger + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-lg border border-neutral-200 text-[#171717] hover:bg-neutral-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-[#171717] truncate">{title}</h1>
            <p className="text-xs text-[#737373] truncate hidden sm:block">{subtitle}</p>
          </div>
        </div>

        {/* Right: Notifications, Profile, Logout */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">

          {/* Notification Bell */}
          <div className="relative" ref={dropRef}>
            <button
              type="button"
              onClick={() =>
                setNotifOpen((p) => {
                  const next = !p;
                  if (next && onRefreshNotifications) onRefreshNotifications();
                  return next;
                })
              }
              className="relative p-2 rounded-lg border border-neutral-200 bg-white text-[#171717] hover:bg-neutral-50 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC1726] text-white text-[10px] font-bold flex items-center justify-center font-mono-num">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute end-0 mt-2 w-80 sm:w-96 rounded-xl bg-white border border-neutral-200 shadow-xl z-40 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                  <span className="text-sm font-semibold text-[#171717]">
                    {t.common.notifications} ({unreadCount})
                  </span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={onMarkAllNotificationsRead}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#DC1726] hover:underline"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>{t.common.markAllRead}</span>
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#737373]">{t.common.noNotifications}</div>
                  ) : (
                    notifications.map((n) => {
                      const otpMatch =
                        n.type === 'parent_link_otp'
                          ? String(n.title || '').match(/\b(\d{6})\b/) || String(n.message || '').match(/\b(\d{6})\b/)
                          : null;
                      const otpCode = otpMatch ? otpMatch[1] : '';
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            onMarkNotificationRead(n.id);
                            if (n.link_module) onSelectModule(n.link_module);
                            setNotifOpen(false);
                          }}
                          className={`w-full text-start px-4 py-3 hover:bg-neutral-50 transition-colors flex flex-col gap-1.5 cursor-pointer ${
                            !n.is_read ? 'bg-red-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[#171717]">{n.title}</span>
                            <span className="text-[10px] text-[#737373] font-mono-num shrink-0">
                              {new Date(n.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-[#737373] line-clamp-2">{n.message}</p>
                          {otpCode && (
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="px-2 py-0.5 rounded bg-red-50 border border-red-200 text-[#DC1726] font-mono-num text-xs font-bold tracking-wider">
                                OTP: {otpCode}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleCopyOtp(e, n.id, otpCode)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                                  copiedOtpNotifId === n.id
                                    ? 'bg-[#10B981] border-[#10B981] text-white'
                                    : 'bg-white border-neutral-200 text-[#171717] hover:bg-neutral-100'
                                }`}
                              >
                                {copiedOtpNotifId === n.id ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy OTP</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile Chip */}
          <button
            type="button"
            onClick={() => onSelectModule('profile')}
            className="hidden sm:flex items-center gap-2 ps-1.5 pe-3 py-1 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-red-50 text-[#DC1726] flex items-center justify-center text-xs font-bold">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-[#171717] max-w-[120px] truncate">{user.full_name}</span>
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-[#171717] hover:bg-neutral-50 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.nav.logout}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
