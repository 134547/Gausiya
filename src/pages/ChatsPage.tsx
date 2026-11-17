import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  CheckCheck,
  Download,
  Lock,
  MessageCircle,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  Send,
  Smile,
  SmilePlus,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { downloadImageFile, sanitizeFileName } from '../lib/download.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { EmojiPickerPanel } from '../components/EmojiPickerPanel.tsx';
import { QUICK_REACTION_EMOJIS } from '../data/chatEmojis.ts';

interface ChatsPageProps {
  user: User;
  settings?: MadrasaSettings | null;
  onSettingsUpdated?: (s: MadrasaSettings) => void;
}

function isImageAttachment(url: string, name: string): boolean {
  const target = `${name || ''} ${url || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|avif|jfif)(\?|$|\s)/i.test(target) || url.startsWith('data:image/');
}

function formatChatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export const ChatsPage: React.FC<ChatsPageProps> = ({ user, settings, onSettingsUpdated }) => {
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'status' | 'contacts'>('chats');
  const [conversations, setConversations] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [lookupMatches, setLookupMatches] = useState<any[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [phoneInput, setPhoneInput] = useState('');
  const [phoneResults, setPhoneResults] = useState<any[] | null>(null);
  const [phoneSearching, setPhoneSearching] = useState(false);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [chatType, setChatType] = useState<'channel' | 'private' | 'group'>('channel');
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [initialMsg, setInitialMsg] = useState('');

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusForm, setStatusForm] = useState({ text: '', image_url: '', bg_color: '#008069' });
  const [postingStatus, setPostingStatus] = useState(false);
  const [viewStatus, setViewStatus] = useState<any>(null);

  const [chatsOpen, setChatsOpen] = useState<boolean>(settings?.chats_open !== false);
  const [togglingChat, setTogglingChat] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [connectingUserId, setConnectingUserId] = useState<string | null>(null);
  const [deleteChannelTarget, setDeleteChannelTarget] = useState<any>(null);
  const [deleteMsgTarget, setDeleteMsgTarget] = useState<any>(null);
  const [editingMsg, setEditingMsg] = useState<{ id: string; originalText: string } | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [reactionFullPickerMsgId, setReactionFullPickerMsgId] = useState<string | null>(null);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const isSuperAdmin = user.role_slug === 'super_admin';

  useEffect(() => {
    activeConvIdRef.current = activeConv?.id || null;
  }, [activeConv?.id]);

  useEffect(() => {
    if (typeof settings?.chats_open === 'boolean') {
      setChatsOpen(settings.chats_open);
    }
  }, [settings?.chats_open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConv?.id]);

  const selectConv = async (conv: any) => {
    setActiveConv(conv);
    activeConvIdRef.current = conv.id;
    setEditingMsg(null);
    setReactionPickerMsgId(null);
    setReactionFullPickerMsgId(null);
    setComposerEmojiOpen(false);
    try {
      const res = await apiRequest<{ messages: any[] }>(`/api/chats/${conv.id}/messages`);
      setMessages(res.messages || []);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loadChats = async (preferConvId?: string, silent = false) => {
    try {
      const [res, statusRes, stListRes] = await Promise.all([
        apiRequest<{ conversations: any[]; contacts: any[] }>('/api/chats'),
        apiRequest<{ chatsOpen: boolean }>('/api/chats/status'),
        apiRequest<{ statuses: any[] }>('/api/chats/statuses').catch(() => ({ statuses: [] })),
      ]);
      setConversations(res.conversations || []);
      setContacts(res.contacts || []);
      setStatuses(stListRes.statuses || []);
      if (typeof statusRes?.chatsOpen === 'boolean') {
        setChatsOpen(statusRes.chatsOpen);
      }

      const targetId = preferConvId || activeConvIdRef.current;
      if (targetId) {
        const found = (res.conversations || []).find((c) => c.id === targetId);
        if (found) {
          setActiveConv(found);
          if (preferConvId) {
            await selectConv(found);
          }
        }
      }
    } catch (e: any) {
      if (!silent) setErr(e.message);
    }
  };

  useEffect(() => {
    loadChats();
    const timer = window.setInterval(() => {
      loadChats(undefined, true);
      if (activeConvIdRef.current) {
        apiRequest<{ messages: any[] }>(`/api/chats/${activeConvIdRef.current}/messages`)
          .then((r) => setMessages(r.messages || []))
          .catch(() => {});
      }
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  // Live lookup by phone number, username, or name whenever searchQuery changes
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setLookupMatches([]);
      setLookupLoading(false);
      return;
    }
    let cancelled = false;
    setLookupLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiRequest<{ matches: any[] }>(`/api/chats/lookup?q=${encodeURIComponent(q)}`);
        if (!cancelled) {
          setLookupMatches(res.matches || []);
        }
      } catch {
        if (!cancelled) setLookupMatches([]);
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    const digits = q.replace(/\D/g, '');
    return conversations.filter((c) => {
      const title = String(c.display_title || '').toLowerCase();
      const last = String(c.last_message || '').toLowerCase();
      const uname = String(c.other_user?.username || '').toLowerCase();
      const mobile = String(c.other_user?.mobile || '').replace(/\D/g, '');
      return (
        title.includes(q) ||
        last.includes(q) ||
        uname.includes(q) ||
        (digits.length >= 3 && mobile.includes(digits))
      );
    });
  }, [conversations, searchQuery]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    const digits = q.replace(/\D/g, '');
    return contacts.filter((c) => {
      const name = String(c.full_name || '').toLowerCase();
      const uname = String(c.username || '').toLowerCase();
      const role = String(c.role_name || '').toLowerCase();
      const mobile = String(c.mobile || '').replace(/\D/g, '');
      return (
        name.includes(q) ||
        uname.includes(q) ||
        role.includes(q) ||
        (digits.length >= 3 && mobile.includes(digits))
      );
    });
  }, [contacts, searchQuery]);

  const handleToggleChat = async (open: boolean) => {
    if (!isSuperAdmin || togglingChat || open === chatsOpen) return;
    setTogglingChat(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ chatsOpen: boolean }>('/api/chats/status', {
        method: 'PUT',
        body: JSON.stringify({ open }),
      });
      setChatsOpen(res.chatsOpen);
      if (settings && onSettingsUpdated) {
        onSettingsUpdated({ ...settings, chats_open: res.chatsOpen });
      }
      setMsg(
        res.chatsOpen
          ? 'Chat turned ON. All portal users can now see and use Chats.'
          : 'Chat turned OFF. Chats section is now visible only to Super Admin.'
      );
    } catch (e: any) {
      setErr(e.message || 'Failed to update chat visibility');
    } finally {
      setTogglingChat(false);
    }
  };

  const handleConnectUser = async (targetUser: any, connectByPhone = false) => {
    if (!targetUser?.id || connectingUserId) return;
    setConnectingUserId(targetUser.id);
    setErr('');
    try {
      const existingConv = conversations.find(
        (c) => !c.is_personal_channel && c.type === 'private' && c.other_user?.id === targetUser.id
      );
      if (existingConv) {
        setSidebarTab('chats');
        await selectConv(existingConv);
        return;
      }

      const res = await apiRequest<{ id: string }>('/api/chats', {
        method: 'POST',
        body: JSON.stringify({
          type: 'private',
          participant_ids: [targetUser.id],
          connect_by_phone: connectByPhone,
        }),
      });
      setSidebarTab('chats');
      setSearchQuery('');
      await loadChats(res.id);
    } catch (e: any) {
      setErr(e.message || 'Unable to connect with this contact');
    } finally {
      setConnectingUserId(null);
    }
  };

  const handlePhoneSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = phoneInput.trim();
    if (!q) return;
    setPhoneSearching(true);
    setErr('');
    try {
      const res = await apiRequest<{ matches: any[] }>(`/api/chats/lookup?q=${encodeURIComponent(q)}`);
      setPhoneResults(res.matches || []);
    } catch (e: any) {
      setErr(e.message || 'Phone lookup failed');
    } finally {
      setPhoneSearching(false);
    }
  };

  const handleQuickPersonalChannel = async () => {
    const existingPersonal = conversations.find((c) => c.is_personal_channel);
    if (existingPersonal) {
      setSidebarTab('chats');
      await selectConv(existingPersonal);
      return;
    }
    setCreatingChannel(true);
    setErr('');
    try {
      const res = await apiRequest<{ id: string }>('/api/chats', {
        method: 'POST',
        body: JSON.stringify({
          type: 'channel',
          is_personal: true,
          title: 'My Personal Channel',
        }),
      });
      setSidebarTab('chats');
      await loadChats(res.id);
      setMsg('Personal Channel created. Save your private notes, photos, and PDFs here.');
    } catch (e: any) {
      setErr(e.message || 'Failed to create Personal Channel');
    } finally {
      setCreatingChannel(false);
    }
  };

  const startEditMessage = (m: any) => {
    setReactionPickerMsgId(null);
    setAttachment(null);
    setEditingMsg({ id: m.id, originalText: m.content || '' });
    setText(m.content || '');
    window.setTimeout(() => messageInputRef.current?.focus(), 20);
  };

  const cancelEditMessage = () => {
    setEditingMsg(null);
    setText('');
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv) return;

    if (editingMsg) {
      const trimmed = text.trim();
      const targetMsg = messages.find((m) => m.id === editingMsg.id);
      if (!trimmed && !targetMsg?.attachment_url) {
        setErr('Message text cannot be empty.');
        return;
      }
      setErr('');
      try {
        const res = await apiRequest<{ content: string; edited_at: string }>(
          `/api/chats/${activeConv.id}/messages/${editingMsg.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({ content: trimmed }),
          }
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMsg.id
              ? { ...m, content: res.content ?? trimmed, edited_at: res.edited_at || new Date().toISOString() }
              : m
          )
        );
        setEditingMsg(null);
        setText('');
        loadChats(undefined, true);
      } catch (e: any) {
        setErr(e.message || 'Failed to edit message');
      }
      return;
    }

    if (!text.trim() && !attachment) return;
    setErr('');
    try {
      await apiRequest(`/api/chats/${activeConv.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: text.trim(),
          attachment_url: attachment?.url || '',
          attachment_name: attachment?.name || '',
        }),
      });
      setText('');
      setAttachment(null);
      await selectConv(activeConv);
      loadChats(activeConv.id, true);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const insertEmojiToMessage = (emoji: string) => {
    const inputEl = messageInputRef.current;
    if (!inputEl) {
      setText((prev) => `${prev}${emoji}`);
      return;
    }
    const start = inputEl.selectionStart ?? text.length;
    const end = inputEl.selectionEnd ?? text.length;
    const nextValue = text.slice(0, start) + emoji + text.slice(end);
    setText(nextValue);
    window.setTimeout(() => {
      inputEl.focus();
      const nextCursor = start + emoji.length;
      try {
        inputEl.setSelectionRange(nextCursor, nextCursor);
      } catch {
        // ignore if input doesn't support selection range
      }
    }, 10);
  };

  const handleReactMessage = async (messageId: string, emoji: string) => {
    if (!activeConv) return;
    setReactionPickerMsgId(null);
    setReactionFullPickerMsgId(null);
    setErr('');
    try {
      const res = await apiRequest<{ reactions: any[] }>(
        `/api/chats/${activeConv.id}/messages/${messageId}/react`,
        {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        }
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions || [] } : m))
      );
    } catch (e: any) {
      setErr(e.message || 'Failed to add reaction');
    }
  };

  const handleConfirmDeleteMessage = async () => {
    if (!activeConv || !deleteMsgTarget) return;
    const messageId = deleteMsgTarget.id;
    setDeleteMsgTarget(null);
    setErr('');
    try {
      await apiRequest(`/api/chats/${activeConv.id}/messages/${messageId}`, {
        method: 'DELETE',
      });
      if (editingMsg?.id === messageId) {
        setEditingMsg(null);
        setText('');
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      loadChats(undefined, true);
    } catch (e: any) {
      setErr(e.message || 'Failed to delete message');
    }
  };

  const handleDeletePersonalChannel = async () => {
    if (!deleteChannelTarget) return;
    const targetId = deleteChannelTarget.id;
    setErr('');
    try {
      await apiRequest(`/api/chats/${targetId}`, { method: 'DELETE' });
      setDeleteChannelTarget(null);
      if (activeConv?.id === targetId) {
        setActiveConv(null);
        activeConvIdRef.current = null;
        setMessages([]);
      }
      setMsg('Personal channel deleted.');
      await loadChats();
    } catch (e: any) {
      setDeleteChannelTarget(null);
      setErr(e.message || 'Failed to delete channel');
    }
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chatType !== 'channel' && selectedContacts.length === 0) {
      setErr('Please select at least one recipient.');
      return;
    }
    setErr('');
    try {
      const res = await apiRequest<{ id: string }>('/api/chats', {
        method: 'POST',
        body: JSON.stringify({
          title: chatType === 'group' || chatType === 'channel' ? groupTitle : '',
          type: chatType,
          is_personal: chatType === 'channel',
          participant_ids: chatType === 'channel' ? [] : selectedContacts,
          initial_message: initialMsg,
        }),
      });
      setNewChatOpen(false);
      setSelectedContacts([]);
      setGroupTitle('');
      setInitialMsg('');
      setSidebarTab('chats');
      await loadChats(res.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handlePostStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusForm.text.trim() && !statusForm.image_url) {
      setErr('Write a status message or upload a photo.');
      return;
    }
    setPostingStatus(true);
    setErr('');
    try {
      await apiRequest('/api/chats/statuses', {
        method: 'POST',
        body: JSON.stringify(statusForm),
      });
      setStatusModalOpen(false);
      setStatusForm({ text: '', image_url: '', bg_color: '#008069' });
      setMsg('Status posted (visible for 24 hours).');
      await loadChats();
    } catch (e: any) {
      setErr(e.message || 'Failed to post status');
    } finally {
      setPostingStatus(false);
    }
  };

  const handleDeleteStatus = async (statusId: string) => {
    setErr('');
    try {
      await apiRequest(`/api/chats/statuses/${statusId}`, { method: 'DELETE' });
      setViewStatus(null);
      setMsg('Status removed.');
      await loadChats();
    } catch (e: any) {
      setErr(e.message || 'Failed to delete status');
    }
  };

  const handleDownloadAttachment = async (url: string, name: string) => {
    setErr('');
    try {
      if (isImageAttachment(url, name)) {
        await downloadImageFile(url, sanitizeFileName(name || 'saved-image', 'saved-image'));
        return;
      }
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = name || 'madrasa-attachment';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = name || 'madrasa-attachment';
      link.target = '_blank';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      const link = document.createElement('a');
      link.href = url;
      link.download = name || 'madrasa-attachment';
      link.target = '_blank';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const renderAvatar = (item: { photo_url?: string; full_name?: string; is_personal_channel?: boolean; type?: string }, size = 40) => {
    const cls = `rounded-full flex items-center justify-center shrink-0 overflow-hidden font-bold`;
    if (item.is_personal_channel) {
      return (
        <div
          style={{ width: size, height: size }}
          className={`${cls} bg-[#008069] text-white`}
        >
          <Bookmark className="w-4 h-4" />
        </div>
      );
    }
    if (item.photo_url) {
      return (
        <img
          src={item.photo_url}
          alt={item.full_name || 'User'}
          referrerPolicy="no-referrer"
          style={{ width: size, height: size }}
          className="rounded-full object-cover shrink-0 border border-neutral-200"
        />
      );
    }
    if (item.type === 'group') {
      return (
        <div style={{ width: size, height: size }} className={`${cls} bg-emerald-100 text-[#008069]`}>
          <Users className="w-4 h-4" />
        </div>
      );
    }
    const letter = (item.full_name || 'U').charAt(0).toUpperCase();
    return (
      <div style={{ width: size, height: size }} className={`${cls} bg-emerald-50 text-[#008069] border border-emerald-200 text-sm`}>
        {letter}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {msg && (
        <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center justify-between">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg('')} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {err && (
        <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] flex items-center justify-between">
          <span>{err}</span>
          <button type="button" onClick={() => setErr('')} className="text-[#DC1726]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isSuperAdmin && (
        <div className="bg-white rounded-xl border border-neutral-200 px-4 py-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                chatsOpen ? 'bg-emerald-50 text-[#008069]' : 'bg-red-50 text-[#DC1726]'
              }`}
            >
              <Power className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#171717]">
                Portal Chats:{' '}
                <span className={chatsOpen ? 'text-[#008069]' : 'text-[#DC1726]'}>
                  {chatsOpen ? 'ON (Visible to All Users)' : 'OFF (Super Admin Only)'}
                </span>
              </div>
              <p className="text-[11px] text-[#737373]">
                {chatsOpen
                  ? 'All logged-in users can chat, connect via contact number, and save notes in My Channel.'
                  : 'Chats is hidden for everyone except Super Admin.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg shrink-0">
            <button
              type="button"
              disabled={togglingChat}
              aria-pressed={chatsOpen}
              onClick={() => handleToggleChat(true)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                chatsOpen ? 'bg-[#008069] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Chat ON
            </button>
            <button
              type="button"
              disabled={togglingChat}
              aria-pressed={!chatsOpen}
              onClick={() => handleToggleChat(false)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                !chatsOpen ? 'bg-[#DC1726] text-white shadow-xs' : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Chat OFF
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp-Style Split Messenger Container */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden flex flex-col md:flex-row min-h-[580px] md:h-[calc(100vh-195px)]">
        {/* LEFT SIDEBAR (WhatsApp Green Header + Search + Tabs) */}
        <div
          className={`w-full md:w-[340px] lg:w-[375px] border-e border-neutral-200 flex flex-col bg-white shrink-0 ${
            activeConv ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* WhatsApp Emerald Green Top Header */}
          <div className="bg-[#008069] text-white">
            <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold tracking-tight">Chats</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={creatingChannel}
                  onClick={handleQuickPersonalChannel}
                  title="Open My Personal Channel (Save Notes, Photos & PDFs)"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold transition-colors whitespace-nowrap"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>My Channel</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatType('channel');
                    setGroupTitle('');
                    setSelectedContacts([]);
                    setInitialMsg('');
                    setNewChatOpen(true);
                  }}
                  title="New Chat, Group, or Personal Channel"
                  className="p-1.5 rounded-md bg-white/15 hover:bg-white/25 text-white transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 3 WhatsApp Tabs: Chats | Status | Contacts */}
            <div className="grid grid-cols-3 text-xs font-semibold">
              {(['chats', 'status', 'contacts'] as const).map((tabKey) => {
                const active = sidebarTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setSidebarTab(tabKey)}
                    className={`py-2.5 text-center capitalize border-b-[3px] transition-colors ${
                      active
                        ? 'border-white text-white'
                        : 'border-transparent text-emerald-100/80 hover:text-white'
                    }`}
                  >
                    {tabKey === 'chats'
                      ? 'Chats'
                      : tabKey === 'status'
                        ? `Status${statuses.length ? ` (${statuses.length})` : ''}`
                        : 'Contacts'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="p-2.5 bg-white border-b border-neutral-100">
            <div className="relative">
              <Search className="w-4 h-4 text-[#667781] absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, username or phone"
                className="w-full bg-[#F0F2F5] rounded-lg ps-9 pe-8 py-2 text-xs text-[#111B21] placeholder:text-[#667781] focus:outline-none focus:ring-1 focus:ring-[#008069]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[#667781] hover:text-[#111B21]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* TAB BODY */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {sidebarTab === 'chats' && (
              <>
                {/* Phone/Username Live Lookup Results when user searches */}
                {searchQuery.trim().length >= 2 && (
                  <div className="bg-emerald-50/40 border-b border-emerald-100">
                    <div className="px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-[#008069] flex items-center justify-between">
                      <span>Connect by Phone / Username</span>
                      {lookupLoading && <span>Searching...</span>}
                    </div>
                    {!lookupLoading && lookupMatches.length === 0 ? (
                      <div className="px-3.5 pb-2.5 text-[11px] text-[#667781]">
                        No registered user found matching &ldquo;{searchQuery.trim()}&rdquo;.
                      </div>
                    ) : (
                      <div className="divide-y divide-emerald-100/70">
                        {lookupMatches.map((m) => (
                          <div key={m.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-emerald-50">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {renderAvatar(m, 36)}
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#111B21] truncate">{m.full_name}</div>
                                <div className="text-[11px] text-[#667781] truncate font-mono-num">
                                  {m.mobile ? `${m.mobile} · ` : ''}@{m.username} · {m.role_name}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={connectingUserId === m.id}
                              onClick={() => handleConnectUser(m, true)}
                              className="px-2.5 py-1 rounded-md bg-[#008069] text-white text-[11px] font-semibold hover:bg-[#006a57] shrink-0 disabled:opacity-60"
                            >
                              {connectingUserId === m.id ? '...' : 'Connect'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-xs text-[#667781] leading-relaxed">
                      {searchQuery
                        ? 'No matching chats found.'
                        : 'No chats yet. Search a username or contact number to start a conversation.'}
                    </p>
                    {!searchQuery && (
                      <button
                        type="button"
                        onClick={handleQuickPersonalChannel}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#008069]/10 text-[#008069] text-xs font-semibold hover:bg-[#008069]/15"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>Create My Personal Channel</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isSelected = activeConv?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectConv(c)}
                        className={`w-full text-start px-3.5 py-3 flex items-center gap-3 hover:bg-[#F5F6F6] transition-colors ${
                          isSelected ? 'bg-[#F0F2F5]' : ''
                        }`}
                      >
                        {renderAvatar(
                          {
                            photo_url: c.other_user?.photo_url,
                            full_name: c.display_title,
                            is_personal_channel: c.is_personal_channel,
                            type: c.type,
                          },
                          44
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold text-[#111B21] truncate flex items-center gap-1.5">
                              <span className="truncate">{c.display_title}</span>
                              {c.is_personal_channel && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[9px] font-bold text-[#008069] shrink-0">
                                  Saved
                                </span>
                              )}
                            </span>
                            <span
                              className={`text-[10px] font-mono-num shrink-0 ${
                                c.unread_count > 0 ? 'text-[#008069] font-bold' : 'text-[#667781]'
                              }`}
                            >
                              {formatChatTime(c.last_message_at)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-xs text-[#667781] truncate">
                              {c.last_message ||
                                (c.is_personal_channel
                                  ? 'Your private saved notes & files'
                                  : c.other_user?.mobile
                                    ? `📞 ${c.other_user.mobile}`
                                    : 'Tap to start messaging')}
                            </span>
                            {c.unread_count > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-white text-[10px] font-bold font-mono-num flex items-center justify-center shrink-0">
                                {c.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}

            {sidebarTab === 'status' && (
              <div className="divide-y divide-neutral-100">
                <div className="p-3.5 flex items-center justify-between gap-3 bg-neutral-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#008069] text-white flex items-center justify-center font-bold text-sm">
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#111B21]">My Status</div>
                      <div className="text-[11px] text-[#667781]">Share text or photo update (24h)</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStatusModalOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#008069] text-white text-xs font-semibold hover:bg-[#006a57]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                {/* Personal Saved Channel Shortcut */}
                <button
                  type="button"
                  onClick={handleQuickPersonalChannel}
                  className="w-full text-start px-3.5 py-3 flex items-center gap-3 hover:bg-emerald-50/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Bookmark className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#111B21]">My Personal Channel (Saved Notes)</div>
                    <div className="text-[11px] text-[#667781] truncate">Save messages, photos, and PDFs privately</div>
                  </div>
                </button>

                {statuses.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#667781]">
                    No status updates in the last 24 hours.
                  </div>
                ) : (
                  statuses.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setViewStatus(st)}
                      className="w-full text-start px-3.5 py-3 flex items-center gap-3 hover:bg-[#F5F6F6] transition-colors"
                    >
                      <div className="p-0.5 rounded-full border-2 border-[#25D366] shrink-0">
                        {renderAvatar({ photo_url: st.author_photo, full_name: st.author_name }, 38)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#111B21] truncate">{st.author_name}</span>
                          <span className="text-[10px] text-[#667781] font-mono-num">{formatChatTime(st.created_at)}</span>
                        </div>
                        <div className="text-[11px] text-[#667781] truncate">
                          {st.text || (st.image_url ? '📷 Photo status' : '')}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {sidebarTab === 'contacts' && (
              <div>
                {/* Direct Connect by Contact Number Box */}
                <form onSubmit={handlePhoneSearch} className="p-3.5 bg-emerald-50/50 border-b border-emerald-100 space-y-2">
                  <div className="text-[11px] font-bold text-[#008069] flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    <span>Connect via Registered Contact Number</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="Enter 10-digit mobile number..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-emerald-200 bg-white font-mono-num focus:outline-none focus:border-[#008069]"
                    />
                    <button
                      type="submit"
                      disabled={phoneSearching}
                      className="px-3 py-1.5 rounded-lg bg-[#008069] text-white text-xs font-semibold hover:bg-[#006a57] disabled:opacity-60"
                    >
                      {phoneSearching ? '...' : 'Find'}
                    </button>
                  </div>
                  {phoneResults !== null && (
                    <div className="space-y-1.5 pt-1">
                      {phoneResults.length === 0 ? (
                        <p className="text-[11px] text-[#667781]">
                          No active portal account found with this contact number.
                        </p>
                      ) : (
                        phoneResults.map((m) => (
                          <div
                            key={m.id}
                            className="p-2 rounded-lg bg-white border border-emerald-200 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {renderAvatar(m, 34)}
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-[#111B21] truncate">{m.full_name}</div>
                                <div className="text-[10px] text-[#667781] font-mono-num truncate">
                                  {m.mobile || 'No mobile'} · @{m.username} · {m.role_name}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={connectingUserId === m.id}
                              onClick={() => handleConnectUser(m, true)}
                              className="px-2.5 py-1 rounded-md bg-[#008069] text-white text-[11px] font-semibold hover:bg-[#006a57] shrink-0"
                            >
                              Message
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </form>

                {/* Pinned My Channel */}
                <button
                  type="button"
                  onClick={handleQuickPersonalChannel}
                  className="w-full text-start px-3.5 py-3 border-b border-neutral-100 flex items-center gap-3 hover:bg-[#F5F6F6]"
                >
                  {renderAvatar({ is_personal_channel: true }, 40)}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#111B21]">My Personal Channel (You)</div>
                    <div className="text-[11px] text-[#667781]">Message yourself &amp; save important files</div>
                  </div>
                </button>

                {/* Directory Contacts */}
                <div className="divide-y divide-neutral-100">
                  {filteredContacts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#667781]">No contacts match your search.</div>
                  ) : (
                    filteredContacts.map((c) => (
                      <div key={c.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-[#F5F6F6]">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {renderAvatar(c, 38)}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#111B21] truncate">{c.full_name}</div>
                            <div className="text-[11px] text-[#667781] truncate font-mono-num">
                              {c.role_name}
                              {c.mobile ? ` · ${c.mobile}` : ''} · @{c.username}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={connectingUserId === c.id}
                          onClick={() => handleConnectUser(c, false)}
                          className="px-2.5 py-1 rounded-md border border-[#008069] text-[#008069] text-[11px] font-semibold hover:bg-[#008069] hover:text-white transition-colors shrink-0"
                        >
                          Chat
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT CONVERSATION PANEL */}
        <div className={`flex-1 flex flex-col min-w-0 ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
          {!activeConv ? (
            <div className="flex-1 bg-[#F0F2F5] flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[#008069]/10 text-[#008069] flex items-center justify-center mb-4">
                <MessageCircle className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-normal text-[#41525D]">Madarsa Chat</h3>
              <p className="text-xs text-[#667781] max-w-md mt-2 leading-relaxed">
                Message students, teachers, parents, and committee members. Connect directly via contact number or username, share photos, files, and statuses, or save notes in your Personal Channel.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={handleQuickPersonalChannel}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#008069] text-white text-xs font-semibold hover:bg-[#006a57] shadow-xs"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Open My Personal Channel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('contacts')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-neutral-200 text-[#111B21] text-xs font-semibold hover:bg-neutral-50"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#008069]" />
                  <span>Connect by Contact Number</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Active Chat Top Header */}
              <div className="px-4 py-2.5 border-b border-neutral-200 bg-[#F0F2F5] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConv(null);
                      activeConvIdRef.current = null;
                    }}
                    className="md:hidden p-1.5 rounded-lg text-[#54656F] hover:bg-neutral-200/70"
                    aria-label="Back to chats"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  {renderAvatar(
                    {
                      photo_url: activeConv.other_user?.photo_url,
                      full_name: activeConv.display_title,
                      is_personal_channel: activeConv.is_personal_channel,
                      type: activeConv.type,
                    },
                    40
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#111B21] truncate">{activeConv.display_title}</span>
                      {activeConv.is_personal_channel && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-[#008069] text-[10px] font-semibold shrink-0">
                          <Lock className="w-2.5 h-2.5" /> Only You
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#667781] truncate font-mono-num">
                      {activeConv.is_personal_channel
                        ? 'Personal Channel · Save notes, photos, PDFs & documents privately'
                        : activeConv.other_user
                          ? `${activeConv.other_user.role_name}${activeConv.other_user.mobile ? ` · ${activeConv.other_user.mobile}` : ''} · @${activeConv.other_user.username}`
                          : (activeConv.participants || []).map((p: any) => p.full_name).join(', ')}
                    </div>
                  </div>
                </div>

                {activeConv.is_personal_channel && (
                  <button
                    type="button"
                    onClick={() => setDeleteChannelTarget(activeConv)}
                    title="Delete Personal Channel"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-[11px] font-semibold text-[#DC1726] hover:bg-red-50 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                )}
              </div>

              {/* WhatsApp Wallpaper Message Area */}
              <div
                onClick={() => {
                  if (reactionPickerMsgId) setReactionPickerMsgId(null);
                  if (reactionFullPickerMsgId) setReactionFullPickerMsgId(null);
                  if (composerEmojiOpen) setComposerEmojiOpen(false);
                }}
                className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#EFEAE2]"
              >
                {messages.length === 0 ? (
                  <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center">
                    <div className="bg-white/95 border border-neutral-200/80 rounded-xl px-5 py-4 max-w-sm shadow-xs space-y-1.5">
                      {activeConv.is_personal_channel ? (
                        <>
                          <div className="text-xs font-bold text-[#008069] flex items-center justify-center gap-1.5">
                            <Bookmark className="w-4 h-4" />
                            <span>Your Private Personal Channel</span>
                          </div>
                          <p className="text-[11px] text-[#54656F] leading-relaxed">
                            Message yourself here to save important notes, images, PDFs, or documents — only visible to your account.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="text-xs font-bold text-[#111B21]">Start Messaging</div>
                          <p className="text-[11px] text-[#54656F]">
                            Send a message, photo, or file attachment below.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  messages.map((m, msgIdx) => {
                    const mine = m.sender_id === user.id;
                    const canDelete = mine || isSuperAdmin;
                    const isImg = m.attachment_url && isImageAttachment(m.attachment_url, m.attachment_name || '');
                    const reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }> = Array.isArray(m.reactions)
                      ? m.reactions
                      : [];
                    const pickerOpen = reactionPickerMsgId === m.id;
                    const isBeingEdited = editingMsg?.id === m.id;
                    const placeBelow = msgIdx < 2;

                    return (
                      <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                        <div className={`group relative flex items-end gap-1.5 max-w-[88%] sm:max-w-[74%] ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                          {/* Message Bubble */}
                          <div
                            className={`relative rounded-lg px-3.5 py-2 text-xs shadow-xs min-w-[110px] ${
                              mine
                                ? 'bg-[#D9FDD3] text-[#111B21] rounded-tr-none'
                                : 'bg-white text-[#111B21] rounded-tl-none'
                            } ${isBeingEdited ? 'ring-2 ring-[#008069]' : ''}`}
                          >
                            {!mine && (
                              <div className="text-[11px] font-bold text-[#008069] mb-0.5">
                                {m.sender_name} · <span className="font-normal text-[#667781]">{m.sender_role}</span>
                              </div>
                            )}
                            {m.content && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>}

                            {m.attachment_url && isImg && (
                              <div className="mt-1.5 space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => setLightboxImage({ url: m.attachment_url, name: m.attachment_name || 'image' })}
                                  className="block rounded-lg overflow-hidden border border-black/10 bg-black/5"
                                >
                                  <img
                                    src={m.attachment_url}
                                    alt={m.attachment_name || 'Attachment'}
                                    referrerPolicy="no-referrer"
                                    className="max-h-60 w-auto object-contain"
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadAttachment(m.attachment_url, m.attachment_name || 'image.jpg')}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#008069] hover:underline"
                                >
                                  <Download className="w-3 h-3" /> Download Image
                                </button>
                              </div>
                            )}

                            {m.attachment_url && !isImg && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 bg-black/5 rounded-md px-2.5 py-1.5">
                                <a
                                  href={m.attachment_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[#027EB5] font-medium hover:underline"
                                >
                                  <Paperclip className="w-3 h-3" /> {m.attachment_name || 'Attachment'}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadAttachment(m.attachment_url, m.attachment_name || 'attachment')}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white text-[#008069] text-[10px] font-semibold border border-neutral-200 hover:bg-neutral-50"
                                >
                                  <Download className="w-3 h-3" /> Download
                                </button>
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-1.5 mt-1">
                              {m.edited_at && (
                                <span className="text-[9px] italic text-[#667781]">edited</span>
                              )}
                              <span className="text-[10px] text-[#667781] font-mono-num">
                                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {mine && (
                                <span title={m.is_seen ? 'Seen' : 'Sent / Delivered'}>
                                  <CheckCheck
                                    className={`w-3.5 h-3.5 ${m.is_seen ? 'text-[#53BDEB]' : 'text-[#667781]'}`}
                                  />
                                </span>
                              )}
                            </div>

                            {/* Floating Emoji Reaction Picker Popover */}
                            {pickerOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute z-30 flex flex-col gap-1.5 ${
                                  placeBelow ? 'top-full mt-2' : 'bottom-full mb-2'
                                } ${mine ? 'end-0 items-end' : 'start-0 items-start'}`}
                              >
                                {reactionFullPickerMsgId === m.id && (
                                  <EmojiPickerPanel
                                    title="React to Message"
                                    activeEmoji={reactions.find((r) => r.reactedByMe)?.emoji || null}
                                    onSelect={(emoji) => handleReactMessage(m.id, emoji)}
                                    onClose={() => {
                                      setReactionFullPickerMsgId(null);
                                      setReactionPickerMsgId(null);
                                    }}
                                  />
                                )}
                                <div className="flex items-center gap-0.5 sm:gap-1 bg-white border border-neutral-200 rounded-full px-2 py-1 shadow-lg max-w-[92vw] overflow-x-auto">
                                  {QUICK_REACTION_EMOJIS.map((emoji) => {
                                    const activeEmoji = reactions.some((r) => r.emoji === emoji && r.reactedByMe);
                                    return (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => handleReactMessage(m.id, emoji)}
                                        className={`w-7 h-7 rounded-full flex items-center justify-center text-base transition-transform hover:scale-125 shrink-0 ${
                                          activeEmoji ? 'bg-emerald-100 ring-1 ring-[#008069]' : 'hover:bg-neutral-100'
                                        }`}
                                        title={`React ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReactionFullPickerMsgId((prev) => (prev === m.id ? null : m.id))
                                    }
                                    title="More Emojis"
                                    className={`w-7 h-7 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                                      reactionFullPickerMsgId === m.id
                                        ? 'bg-[#008069] text-white border-[#008069]'
                                        : 'bg-neutral-100 text-[#54656F] border-neutral-200 hover:bg-neutral-200'
                                    }`}
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Always-Visible Dedicated React Button + Edit / Delete */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-0.5 bg-white/95 border border-neutral-200 rounded-full px-1 py-0.5 shadow-xs shrink-0"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (pickerOpen) {
                                  setReactionPickerMsgId(null);
                                  setReactionFullPickerMsgId(null);
                                } else {
                                  setComposerEmojiOpen(false);
                                  setReactionPickerMsgId(m.id);
                                  setReactionFullPickerMsgId(null);
                                }
                              }}
                              title="React with Emoji"
                              aria-label="React to message"
                              className={`p-1 rounded-full transition-colors ${
                                pickerOpen
                                  ? 'bg-[#008069] text-white'
                                  : 'text-[#54656F] hover:text-[#008069] hover:bg-emerald-50'
                              }`}
                            >
                              <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                            {mine && (
                              <button
                                type="button"
                                onClick={() => startEditMessage(m)}
                                title="Edit message"
                                className="p-1 rounded-full text-[#54656F] hover:text-[#008069] hover:bg-emerald-50"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReactionPickerMsgId(null);
                                  setReactionFullPickerMsgId(null);
                                  setDeleteMsgTarget(m);
                                }}
                                title="Delete message"
                                className="p-1 rounded-full text-[#54656F] hover:text-[#DC1726] hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Displayed Reaction Pills Below Bubble */}
                        {reactions.length > 0 && (
                          <div className={`flex flex-wrap items-center gap-1 mt-1 px-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                            {reactions.map((r) => (
                              <button
                                key={r.emoji}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReactMessage(m.id, r.emoji);
                                }}
                                title="Click to toggle your reaction"
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border shadow-2xs transition-colors ${
                                  r.reactedByMe
                                    ? 'bg-emerald-50 border-[#008069] text-[#008069] font-semibold'
                                    : 'bg-white border-neutral-200 text-[#111B21] hover:bg-neutral-50'
                                }`}
                              >
                                <span>{r.emoji}</span>
                                <span className="font-mono-num text-[10px]">{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Editing Banner Strip */}
              {editingMsg && (
                <div className="px-4 py-2 bg-[#F0F2F5] border-t border-neutral-200 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2 border-s-4 border-[#008069] ps-2.5">
                    <Pencil className="w-3.5 h-3.5 text-[#008069] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-[#008069]">Editing message</div>
                      <div className="text-[11px] text-[#54656F] truncate">
                        {editingMsg.originalText || 'Attachment caption'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={cancelEditMessage}
                    title="Cancel edit"
                    className="p-1 rounded-full text-[#54656F] hover:bg-neutral-200/70 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Bottom WhatsApp Composer Bar */}
              <div className="relative">
                {composerEmojiOpen && (
                  <div className="absolute bottom-full start-2 sm:start-3 mb-2 z-30">
                    <EmojiPickerPanel
                      title="Insert Emoji"
                      onSelect={insertEmojiToMessage}
                      onClose={() => setComposerEmojiOpen(false)}
                    />
                  </div>
                )}
                <form onSubmit={handleSend} className="px-3 py-2.5 border-t border-neutral-200 bg-[#F0F2F5] flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReactionPickerMsgId(null);
                      setReactionFullPickerMsgId(null);
                      setComposerEmojiOpen((prev) => !prev);
                    }}
                    title="Emoji Picker"
                    aria-label="Open Emoji Picker"
                    className={`p-2 rounded-full shrink-0 transition-colors ${
                      composerEmojiOpen
                        ? 'bg-[#008069] text-white'
                        : 'hover:bg-neutral-200/70 text-[#54656F]'
                    }`}
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  {!editingMsg && (
                    <label
                      className={`p-2 rounded-full hover:bg-neutral-200/70 cursor-pointer shrink-0 text-[#54656F] ${
                        uploadingFile ? 'opacity-50 pointer-events-none' : ''
                      }`}
                      title="Attach photo, PDF, or document"
                    >
                      <Paperclip className="w-5 h-5" />
                      <input
                        type="file"
                        disabled={uploadingFile}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setErr('');
                          setUploadingFile(true);
                          try {
                            const up = await uploadFile(f, 'chat-attachments');
                            setAttachment({ url: up.url, name: up.name });
                          } catch (err: any) {
                            setErr(err.message || 'Failed to upload attachment');
                          } finally {
                            setUploadingFile(false);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}

                  <div className="flex-1 flex flex-col min-w-0">
                    {uploadingFile && <div className="text-[11px] text-[#667781] mb-1">Uploading file...</div>}
                    {!editingMsg && attachment && (
                      <div className="text-[11px] text-[#008069] font-medium flex items-center gap-1.5 mb-1 bg-white px-2.5 py-1 rounded-md border border-emerald-200">
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span className="truncate">{attachment.name}</span>
                        <button type="button" onClick={() => setAttachment(null)} className="ms-auto text-[#667781] hover:text-[#DC1726]">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <input
                      ref={messageInputRef}
                      type="text"
                      value={text}
                      onFocus={() => setComposerEmojiOpen(false)}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={
                        editingMsg
                          ? 'Edit your message...'
                          : activeConv.is_personal_channel
                            ? 'Write a note or save a message to your channel...'
                            : 'Type a message'
                      }
                      className="w-full px-4 py-2.5 text-xs rounded-full bg-white border border-neutral-200/80 text-[#111B21] placeholder:text-[#667781] focus:outline-none focus:border-[#008069]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingFile}
                    aria-label={editingMsg ? 'Save Edit' : 'Send'}
                    className="w-10 h-10 rounded-full bg-[#008069] text-white flex items-center justify-center hover:bg-[#006a57] disabled:opacity-60 shrink-0 shadow-xs"
                  >
                    {editingMsg ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Chat / Channel Modal */}
      {newChatOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateChat} className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-[#111B21]">New Chat or Personal Channel</h3>
              <button type="button" onClick={() => setNewChatOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setChatType('channel');
                  setSelectedContacts([]);
                }}
                className={`py-2 px-2 rounded-lg border font-semibold text-[11px] ${
                  chatType === 'channel' ? 'bg-[#008069] text-white border-[#008069]' : 'bg-neutral-50 border-neutral-200'
                }`}
              >
                My Channel
              </button>
              <button
                type="button"
                onClick={() => {
                  setChatType('private');
                  setSelectedContacts([]);
                }}
                className={`py-2 px-2 rounded-lg border font-semibold text-[11px] ${
                  chatType === 'private' ? 'bg-[#008069] text-white border-[#008069]' : 'bg-neutral-50 border-neutral-200'
                }`}
              >
                Private Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setChatType('group');
                  setSelectedContacts([]);
                }}
                className={`py-2 px-2 rounded-lg border font-semibold text-[11px] ${
                  chatType === 'group' ? 'bg-[#008069] text-white border-[#008069]' : 'bg-neutral-50 border-neutral-200'
                }`}
              >
                Group Chat
              </button>
            </div>

            {chatType === 'channel' && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-[#008069]">
                Create your own private Personal Channel (only visible to you) to save personal notes, photos, PDFs, and documents.
              </div>
            )}

            {(chatType === 'group' || chatType === 'channel') && (
              <div>
                <label className="block font-medium mb-1">
                  {chatType === 'channel' ? 'Channel Name *' : 'Group Name *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={chatType === 'channel' ? 'e.g. My Personal Channel / Saved Docs' : 'Enter group name'}
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
            )}

            {chatType !== 'channel' && (
              <div>
                <label className="block font-medium mb-1">Select Recipients</label>
                <div className="max-h-40 overflow-y-auto border border-neutral-200 rounded-lg p-2 space-y-1">
                  {contacts.length === 0 ? (
                    <div className="text-[#667781] p-2 text-center">No contacts available. Use Contact Number search in Contacts tab!</div>
                  ) : (
                    contacts.map((c) => {
                      const checked = selectedContacts.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-neutral-50 cursor-pointer">
                          <input
                            type={chatType === 'private' ? 'radio' : 'checkbox'}
                            name="chat_recipient"
                            checked={checked}
                            onChange={() => {
                              if (chatType === 'private') setSelectedContacts([c.id]);
                              else setSelectedContacts((prev) => (prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]));
                            }}
                          />
                          <span>
                            {c.full_name} ({c.role_name}){c.mobile ? ` · ${c.mobile}` : ''}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block font-medium mb-1">
                {chatType === 'channel' ? 'First Note (Optional)' : 'Initial Message'}
              </label>
              <textarea
                rows={2}
                value={initialMsg}
                onChange={(e) => setInitialMsg(e.target.value)}
                placeholder={chatType === 'channel' ? 'Write your first note...' : 'Write a message...'}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewChatOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#008069] text-white font-semibold">
                {chatType === 'channel' ? 'Create Channel' : 'Start Chat'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Post Status Modal */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handlePostStatus} className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-[#111B21]">Add 24-Hour Status</h3>
              <button type="button" onClick={() => setStatusModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block font-medium mb-1">Status Text</label>
              <textarea
                rows={3}
                value={statusForm.text}
                onChange={(e) => setStatusForm({ ...statusForm, text: e.target.value })}
                placeholder="Share a quick announcement, dua, or update..."
                className="w-full px-3 py-2 rounded-lg border border-neutral-200"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Photo (Optional)</label>
              <div className="flex items-center gap-2">
                <label className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100 font-medium">
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        const up = await uploadFile(f, 'chat-attachments');
                        setStatusForm((prev) => ({ ...prev, image_url: up.url }));
                      } catch (err: any) {
                        setErr(err.message || 'Failed to upload status photo');
                      } finally {
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
                {statusForm.image_url && (
                  <button
                    type="button"
                    onClick={() => setStatusForm({ ...statusForm, image_url: '' })}
                    className="text-[#DC1726] underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-medium">Background:</span>
              {['#008069', '#1E3A8A', '#7C2D12', '#4C1D95', '#171717'].map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setStatusForm({ ...statusForm, bg_color: col })}
                  style={{ backgroundColor: col }}
                  className={`w-6 h-6 rounded-full border-2 ${
                    statusForm.bg_color === col ? 'border-black scale-110' : 'border-white'
                  }`}
                />
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setStatusModalOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">
                Cancel
              </button>
              <button
                type="submit"
                disabled={postingStatus}
                className="px-4 py-2 rounded-lg bg-[#008069] text-white font-semibold disabled:opacity-60"
              >
                {postingStatus ? 'Posting...' : 'Post Status'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View Status Modal */}
      {viewStatus && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setViewStatus(null)}
        >
          <div
            style={{ backgroundColor: viewStatus.image_url ? '#111B21' : viewStatus.bg_color || '#008069' }}
            className="max-w-md w-full rounded-2xl overflow-hidden shadow-2xl text-white p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {renderAvatar({ photo_url: viewStatus.author_photo, full_name: viewStatus.author_name }, 36)}
                <div>
                  <div className="text-xs font-bold">{viewStatus.author_name}</div>
                  <div className="text-[10px] text-white/75 font-mono-num">
                    {viewStatus.author_role} · {formatChatTime(viewStatus.created_at)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {(viewStatus.user_id === user.id || isSuperAdmin) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteStatus(viewStatus.id)}
                    className="p-1.5 rounded-lg bg-white/15 hover:bg-red-600"
                    title="Delete Status"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => setViewStatus(null)} className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {viewStatus.image_url && (
              <img
                src={viewStatus.image_url}
                alt="Status"
                referrerPolicy="no-referrer"
                className="max-h-[55vh] w-full object-contain rounded-xl bg-black/40"
              />
            )}

            {viewStatus.text && (
              <p className="text-sm font-medium text-center py-6 px-3 whitespace-pre-wrap leading-relaxed">
                {viewStatus.text}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Image Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <span className="text-xs font-bold text-[#111B21] truncate">{lightboxImage.name}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadAttachment(lightboxImage.url, lightboxImage.name)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#008069] text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button type="button" onClick={() => setLightboxImage(null)} className="p-1.5 rounded-lg hover:bg-neutral-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-neutral-950 flex items-center justify-center max-h-[75vh]">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteChannelTarget)}
        title="Delete Personal Channel"
        message={`Delete "${deleteChannelTarget?.display_title || 'this channel'}" and all saved messages inside it?`}
        confirmLabel="Delete Channel"
        onConfirm={handleDeletePersonalChannel}
        onCancel={() => setDeleteChannelTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteMsgTarget)}
        title="Delete Message"
        message="Are you sure you want to delete this message?"
        confirmLabel="Delete Message"
        onConfirm={handleConfirmDeleteMessage}
        onCancel={() => setDeleteMsgTarget(null)}
      />
    </div>
  );
};
