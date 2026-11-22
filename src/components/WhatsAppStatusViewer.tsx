import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { isVideoUrl } from '../lib/media.ts';

export interface StatusViewerEntry {
  user_id: string;
  name: string;
  role: string;
  photo_url?: string;
  viewed_at: string;
  liked?: boolean;
  reaction?: string;
}

export interface StatusCommentEntry {
  id: string;
  user_id: string;
  name: string;
  role: string;
  photo_url?: string;
  text: string;
  created_at: string;
}

export interface WhatsAppStatusItem {
  id: string;
  user_id: string;
  author_name: string;
  author_username?: string;
  author_role?: string;
  author_photo?: string;
  text: string;
  image_url?: string;
  media_url?: string;
  media_type?: 'text' | 'image' | 'video';
  bg_color?: string;
  created_at: string;
  expires_at?: string;
  views_count?: number;
  viewed_by_me?: boolean;
  views?: StatusViewerEntry[];
  likes_count?: number;
  liked_by_me?: boolean;
  reactions_summary?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  my_reaction?: string;
  comments_count?: number;
  comments?: StatusCommentEntry[];
}

interface WhatsAppStatusViewerProps {
  statuses: WhatsAppStatusItem[];
  initialIndex: number;
  currentUserId: string;
  isSuperAdmin: boolean;
  onClose: () => void;
  onStatusUpdated: (updated: WhatsAppStatusItem) => void;
  onDeleteStatus: (statusId: string) => Promise<void>;
  onOpenChatConversation?: (convId: string) => void;
}

const QUICK_STATUS_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥'];
const IMAGE_STATUS_DURATION_MS = 6500;

function formatRelativeShort(iso?: string): string {
  if (!iso) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function formatRemaining24h(createdAt?: string): string {
  if (!createdAt) return '24h';
  const expiresMs = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000;
  const remMs = Math.max(0, expiresMs - Date.now());
  const remHrs = Math.floor(remMs / (60 * 60 * 1000));
  const remMins = Math.floor((remMs % (60 * 60 * 1000)) / (60 * 1000));
  if (remHrs > 0) return `${remHrs}h left`;
  return `${Math.max(1, remMins)}m left`;
}

export const WhatsAppStatusViewer: React.FC<WhatsAppStatusViewerProps> = ({
  statuses,
  initialIndex,
  currentUserId,
  isSuperAdmin,
  onClose,
  onStatusUpdated,
  onDeleteStatus,
  onOpenChatConversation,
}) => {
  const [index, setIndex] = useState(Math.min(Math.max(0, initialIndex), Math.max(0, statuses.length - 1)));
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sheet, setSheet] = useState<'none' | 'views' | 'comments'>('none');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replySentConvId, setReplySentConvId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [floatingEmoji, setFloatingEmoji] = useState<{ emoji: string; key: number } | null>(null);
  const [actionErr, setActionErr] = useState('');
  const [deleting, setDeleting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewedIdsRef = useRef<Set<string>>(new Set());

  const current = statuses[index];
  const mediaSrc = current?.media_url || current?.image_url || '';
  const isVideo = Boolean(
    mediaSrc && (current?.media_type === 'video' || isVideoUrl(mediaSrc))
  );
  const isOwner = Boolean(current && current.user_id === currentUserId);
  const canSeeViewers = Boolean(isOwner || isSuperAdmin);
  const canDelete = Boolean(isOwner || isSuperAdmin);
  const isInteractivePaused = paused || sheet !== 'none' || Boolean(replyText.trim()) || sendingReply;

  // Keep index valid if list changes (e.g., deletion)
  useEffect(() => {
    if (statuses.length === 0) {
      onClose();
      return;
    }
    if (index >= statuses.length) {
      setIndex(statuses.length - 1);
    }
  }, [statuses.length, index, onClose]);

  // Reset per-slide UI when index changes
  useEffect(() => {
    setProgress(0);
    setSheet('none');
    setReplyText('');
    setReplySentConvId(null);
    setActionErr('');
  }, [index, current?.id]);

  // Record view once per status open
  useEffect(() => {
    if (!current?.id) return;
    if (viewedIdsRef.current.has(current.id)) return;
    viewedIdsRef.current.add(current.id);

    apiRequest<{ status: WhatsAppStatusItem }>(`/api/chats/statuses/${current.id}/view`, {
      method: 'POST',
    })
      .then((res) => {
        if (res?.status) onStatusUpdated(res.status);
      })
      .catch(() => {
        // non-blocking
      });
  }, [current?.id, onStatusUpdated]);

  // Progress timer for non-video statuses
  useEffect(() => {
    if (!current || isVideo || isInteractivePaused) return;
    const stepMs = 60;
    const increment = (stepMs / IMAGE_STATUS_DURATION_MS) * 100;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          if (index < statuses.length - 1) {
            setIndex((i) => i + 1);
          } else {
            onClose();
          }
          return 0;
        }
        return next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [current, isVideo, isInteractivePaused, index, statuses.length, onClose]);

  // Pause / resume video element cleanly
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !isVideo) return;
    if (isInteractivePaused) {
      vid.pause();
    } else {
      vid.play().catch(() => {});
    }
  }, [isInteractivePaused, isVideo, current?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        if (sheet !== 'none') setSheet('none');
        else onClose();
      } else if (!typing && e.key === 'ArrowRight') {
        if (index < statuses.length - 1) setIndex((i) => i + 1);
        else onClose();
      } else if (!typing && e.key === 'ArrowLeft') {
        if (index > 0) setIndex((i) => i - 1);
      } else if (!typing && e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, statuses.length, sheet, onClose]);

  if (!current) return null;

  const triggerEmojiBurst = (emoji: string) => {
    setFloatingEmoji({ emoji, key: Date.now() });
    window.setTimeout(() => {
      setFloatingEmoji((prev) => (prev && Date.now() - prev.key >= 900 ? null : prev));
    }, 950);
  };

  const handleToggleLike = async () => {
    setActionErr('');
    try {
      if (!current.liked_by_me) triggerEmojiBurst('❤️');
      const res = await apiRequest<{ status: WhatsAppStatusItem }>(`/api/chats/statuses/${current.id}/like`, {
        method: 'POST',
      });
      if (res?.status) onStatusUpdated(res.status);
    } catch (e: any) {
      setActionErr(e?.message || 'Failed to like status');
    }
  };

  const handleReact = async (emoji: string) => {
    setActionErr('');
    try {
      if (current.my_reaction !== emoji) triggerEmojiBurst(emoji);
      const res = await apiRequest<{ status: WhatsAppStatusItem }>(`/api/chats/statuses/${current.id}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
      if (res?.status) onStatusUpdated(res.status);
    } catch (e: any) {
      setActionErr(e?.message || 'Failed to react');
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = commentText.trim();
    if (!clean || postingComment) return;
    setPostingComment(true);
    setActionErr('');
    try {
      const res = await apiRequest<{ status: WhatsAppStatusItem }>(`/api/chats/statuses/${current.id}/comment`, {
        method: 'POST',
        body: JSON.stringify({ text: clean }),
      });
      if (res?.status) onStatusUpdated(res.status);
      setCommentText('');
    } catch (err: any) {
      setActionErr(err?.message || 'Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = replyText.trim();
    if (!clean || sendingReply) return;
    setSendingReply(true);
    setActionErr('');
    try {
      const res = await apiRequest<{ conversation_id: string }>(`/api/chats/statuses/${current.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text: clean }),
      });
      setReplyText('');
      setReplySentConvId(res?.conversation_id || 'sent');
      triggerEmojiBurst('✉️');
    } catch (err: any) {
      setActionErr(err?.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDeleteStatus(current.id);
    } finally {
      setDeleting(false);
    }
  };

  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
    else setProgress(0);
  };

  const goNext = () => {
    if (index < statuses.length - 1) setIndex((i) => i + 1);
    else onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 backdrop-blur-xs flex items-center justify-center sm:p-4"
      onClick={onClose}
    >
      {/* Desktop Left Arrow */}
      {index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="Previous status"
          className="hidden sm:flex items-center justify-center w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white me-4 shrink-0 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Main Story Stage (Full height on mobile, crisp vertical card on desktop) */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: mediaSrc ? '#0B141A' : current.bg_color || '#008069',
        }}
        className="relative w-full h-full sm:h-[88vh] sm:max-h-[760px] sm:max-w-[430px] sm:rounded-2xl overflow-hidden shadow-2xl text-white flex flex-col justify-between select-none"
      >
        {/* Top Progress Bars + Author Header */}
        <div className="relative z-20 px-3 pt-3 pb-2 bg-gradient-to-b from-black/75 via-black/40 to-transparent">
          {/* Segmented Story Progress Bars */}
          <div className="flex items-center gap-1 mb-2.5">
            {statuses.map((st, idx) => {
              const fillPct = idx < index ? 100 : idx === index ? Math.min(100, Math.max(0, progress)) : 0;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setIndex(idx)}
                  aria-label={`Status ${idx + 1}`}
                  className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden cursor-pointer"
                >
                  <div
                    className="h-full bg-white rounded-full transition-[width] duration-75"
                    style={{ width: `${fillPct}%` }}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {current.author_photo ? (
                <img
                  src={current.author_photo}
                  alt={current.author_name}
                  className="w-9 h-9 rounded-full object-cover border border-white/40 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#00A884] text-white flex items-center justify-center text-xs font-bold border border-white/30 shrink-0">
                  {String(current.author_name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold truncate flex items-center gap-1.5">
                  <span className="truncate">{current.author_name}</span>
                  {isOwner && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/20 font-semibold shrink-0">
                      You
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-white/80 flex items-center gap-1.5 font-mono-num">
                  <span>{formatRelativeShort(current.created_at)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-emerald-300">
                    <Clock className="w-2.5 h-2.5" /> {formatRemaining24h(current.created_at)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isVideo && (
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="p-1.5 rounded-full bg-black/35 hover:bg-black/55"
                  title={muted ? 'Unmute video' : 'Mute video'}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="p-1.5 rounded-full bg-black/35 hover:bg-black/55"
                title={paused ? 'Play' : 'Pause'}
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              {canDelete && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="p-1.5 rounded-full bg-black/35 hover:bg-red-600 transition-colors disabled:opacity-50"
                  title="Delete Status"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full bg-black/35 hover:bg-black/55"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Center Content Area with Left/Right Tap Navigation */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden">
          {/* Left / Right tap zones (don't block video controls at bottom) */}
          <button
            type="button"
            aria-label="Previous"
            onClick={goPrev}
            className="absolute start-0 top-0 bottom-14 w-[26%] z-10 cursor-pointer focus:outline-none"
          />
          <button
            type="button"
            aria-label="Next"
            onClick={goNext}
            className="absolute end-0 top-0 bottom-14 w-[26%] z-10 cursor-pointer focus:outline-none"
          />

          {isVideo ? (
            <video
              ref={videoRef}
              key={current.id}
              src={mediaSrc}
              autoPlay
              playsInline
              muted={muted}
              controls
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration && Number.isFinite(v.duration)) {
                  setProgress((v.currentTime / v.duration) * 100);
                }
              }}
              onEnded={goNext}
              className="relative z-10 max-h-full max-w-full w-full object-contain bg-black"
            />
          ) : mediaSrc ? (
            <img
              src={mediaSrc}
              alt="Status"
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full w-full object-contain"
            />
          ) : (
            <div className="px-7 py-6 text-center max-h-full overflow-y-auto">
              <p className="text-xl sm:text-2xl font-bold leading-relaxed whitespace-pre-wrap break-words drop-shadow">
                {current.text}
              </p>
            </div>
          )}

          {/* Media Caption Overlay */}
          {mediaSrc && current.text && (
            <div className="absolute bottom-2 inset-x-3 z-20 pointer-events-none flex justify-center">
              <div className="px-3.5 py-2 rounded-xl bg-black/65 backdrop-blur-xs text-xs sm:text-sm text-white text-center max-w-full whitespace-pre-wrap leading-snug">
                {current.text}
              </div>
            </div>
          )}

          {/* Floating Emoji Burst */}
          {floatingEmoji && (
            <div
              key={floatingEmoji.key}
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
            >
              <span className="text-6xl animate-bounce drop-shadow-lg">{floatingEmoji.emoji}</span>
            </div>
          )}
        </div>

        {/* Bottom WhatsApp Interactive Bar */}
        <div className="relative z-20 px-3 pt-2 pb-3 bg-gradient-to-t from-black/90 via-black/75 to-transparent space-y-2">
          {actionErr && (
            <div className="px-2.5 py-1.5 rounded-lg bg-red-600/90 text-[11px] text-white font-medium text-center">
              {actionErr}
            </div>
          )}

          {replySentConvId && (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-600/95 text-[11px] text-white font-medium flex items-center justify-between gap-2">
              <span>Reply sent directly to {current.author_name}'s chat!</span>
              {onOpenChatConversation && replySentConvId !== 'sent' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenChatConversation(replySentConvId);
                  }}
                  className="underline font-bold shrink-0"
                >
                  Open Chat
                </button>
              )}
            </div>
          )}

          {/* Reactions Summary + Quick WhatsApp Reaction Strip */}
          <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <div className="flex items-center gap-1">
              {QUICK_STATUS_EMOJIS.map((em) => {
                const active = current.my_reaction === em;
                const countObj = (current.reactions_summary || []).find((r) => r.emoji === em);
                return (
                  <button
                    key={em}
                    type="button"
                    onClick={() => handleReact(em)}
                    className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-sm transition-transform active:scale-125 ${
                      active
                        ? 'bg-[#00A884] ring-1 ring-white/60 scale-105'
                        : 'bg-white/12 hover:bg-white/25'
                    }`}
                    title={`React ${em}`}
                  >
                    <span>{em}</span>
                    {countObj && countObj.count > 0 && (
                      <span className="text-[10px] font-bold font-mono-num">{countObj.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Row: Seen By (Owner) | Like | Comments */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleLike}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  current.liked_by_me
                    ? 'bg-red-600 text-white'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${current.liked_by_me ? 'fill-white' : ''}`} />
                <span className="font-mono-num">{current.likes_count || 0}</span>
              </button>

              <button
                type="button"
                onClick={() => setSheet(sheet === 'comments' ? 'none' : 'comments')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  sheet === 'comments'
                    ? 'bg-[#00A884] text-white'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="font-mono-num">{current.comments_count || 0}</span>
                <span className="hidden xs:inline">Comments</span>
              </button>
            </div>

            {canSeeViewers ? (
              <button
                type="button"
                onClick={() => setSheet(sheet === 'views' ? 'none' : 'views')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  sheet === 'views'
                    ? 'bg-white text-[#111B21]'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Seen by</span>
                <span className="font-mono-num font-bold">{current.views_count || 0}</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-white/75 font-mono-num">
                <Eye className="w-3.5 h-3.5" /> {current.views_count || 0} views
              </span>
            )}
          </div>

          {/* Direct WhatsApp Reply Box (Viewers replying directly into 1-on-1 Chat) */}
          {!isOwner && (
            <form onSubmit={handleSendReply} className="flex items-center gap-2 pt-0.5">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply privately to ${current.author_name}...`}
                className="flex-1 px-3.5 py-2 rounded-full bg-white/15 border border-white/25 text-xs text-white placeholder:text-white/65 focus:outline-none focus:border-[#25D366] focus:bg-black/45"
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                aria-label="Send direct reply"
                className="w-9 h-9 rounded-full bg-[#00A884] hover:bg-[#008069] text-white flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

        {/* Slide-Up Sheet: Seen By / Viewers (Owner & Super Admin) */}
        {sheet === 'views' && canSeeViewers && (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[65%] bg-white text-[#111B21] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-[#008069] text-white flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Eye className="w-4 h-4" />
                <span>Viewed by {current.views_count || 0}</span>
              </div>
              <button
                type="button"
                onClick={() => setSheet('none')}
                className="p-1 rounded-full hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-neutral-100 p-2">
              {!current.views || current.views.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#667781]">
                  No views yet. Viewers will appear here as people watch your 24-hour status.
                </div>
              ) : (
                current.views.map((v) => (
                  <div key={v.user_id} className="px-2.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {v.photo_url ? (
                        <img
                          src={v.photo_url}
                          alt={v.name}
                          className="w-8 h-8 rounded-full object-cover border border-neutral-200 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-[#008069] flex items-center justify-center text-xs font-bold shrink-0">
                          {String(v.name || 'U').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#111B21] truncate">{v.name}</div>
                        <div className="text-[10px] text-[#667781] truncate">
                          {v.role ? `${v.role} · ` : ''}
                          {formatRelativeShort(v.viewed_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {v.liked && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-red-600" title="Liked">
                          <Heart className="w-3.5 h-3.5 fill-red-600" />
                        </span>
                      )}
                      {v.reaction && (
                        <span className="text-base" title="Reaction">
                          {v.reaction}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Slide-Up Sheet: Comments */}
        {sheet === 'comments' && (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[68%] bg-white text-[#111B21] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-[#111B21] text-white flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold">
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                <span>Status Comments ({current.comments_count || 0})</span>
              </div>
              <button
                type="button"
                onClick={() => setSheet('none')}
                className="p-1 rounded-full hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-neutral-50">
              {!current.comments || current.comments.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#667781]">
                  No comments yet. Be the first to comment!
                </div>
              ) : (
                current.comments.map((c) => (
                  <div key={c.id} className="bg-white rounded-xl border border-neutral-200/80 px-3 py-2 text-xs shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#111B21] truncate">
                        {c.name}{' '}
                        {c.role && <span className="font-normal text-[#667781]">({c.role})</span>}
                      </span>
                      <span className="text-[10px] text-[#667781] font-mono-num shrink-0">
                        {formatRelativeShort(c.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-[#171717] whitespace-pre-wrap break-words leading-snug">{c.text}</p>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handlePostComment} className="p-2.5 bg-white border-t border-neutral-200 flex items-center gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment on this status..."
                className="flex-1 px-3 py-2 rounded-full border border-neutral-200 text-xs focus:outline-none focus:border-[#008069]"
              />
              <button
                type="submit"
                disabled={postingComment || !commentText.trim()}
                className="px-3.5 py-2 rounded-full bg-[#008069] text-white text-xs font-semibold hover:bg-[#006a57] disabled:opacity-50"
              >
                Post
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Desktop Right Arrow */}
      {index < statuses.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="Next status"
          className="hidden sm:flex items-center justify-center w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white ms-4 shrink-0 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
    </div>
  );
};
