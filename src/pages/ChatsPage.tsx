import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Bookmark,
  Check,
  CheckCheck,
  Copy,
  Download,
  Eraser,
  Eye,
  Film,
  Heart,
  Info,
  Lock,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  Send,
  Share2,
  ShieldOff,
  Smile,
  SmilePlus,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { downloadImageFile, sanitizeFileName } from '../lib/download.ts';
import { isVideoUrl } from '../lib/media.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { EmojiPickerPanel } from '../components/EmojiPickerPanel.tsx';
import { WhatsAppStatusItem, WhatsAppStatusViewer } from '../components/WhatsAppStatusViewer.tsx';
import { QUICK_REACTION_EMOJIS } from '../lib/chatEmojis.ts';

interface ChatsPageProps {
  user: User;
  settings?: MadrasaSettings | null;
  onSettingsUpdated?: (s: MadrasaSettings) => void;
  initialConvId?: string | null;
  onInitialConvHandled?: () => void;
}

function isImageAttachment(url: string, name: string): boolean {
  if (isVideoUrl(url, name)) return false;
  const target = `${name || ''} ${url || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|avif|jfif)(\?|$|\s)/i.test(target) || url.startsWith('data:image/');
}

function isVideoAttachment(url: string, name: string): boolean {
  return isVideoUrl(url, name);
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

export const ChatsPage: React.FC<ChatsPageProps> = ({
  user,
  settings,
  onSettingsUpdated,
  initialConvId,
  onInitialConvHandled,
}) => {
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'status' | 'contacts'>('chats');
  const [conversations, setConversations] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
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
  const [statusForm, setStatusForm] = useState<{
    text: string;
    image_url: string;
    media_url: string;
    media_type: 'text' | 'image' | 'video';
    bg_color: string;
  }>({ text: '', image_url: '', media_url: '', media_type: 'text', bg_color: '#008069' });
  const [uploadingStatusMedia, setUploadingStatusMedia] = useState(false);
  const [postingStatus, setPostingStatus] = useState(false);
  const [viewerQueue, setViewerQueue] = useState<{ items: WhatsAppStatusItem[]; index: number } | null>(null);

  const [chatsOpen, setChatsOpen] = useState<boolean>(settings?.chats_open !== false);
  const [togglingChat, setTogglingChat] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [connectingUserId, setConnectingUserId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<{ scope: 'sidebar' | 'header' | 'conv' | 'contact'; id?: string } | null>(null);
  const [deleteChannelTarget, setDeleteChannelTarget] = useState<any>(null);
  const [deleteContactTarget, setDeleteContactTarget] = useState<any>(null);
  const [clearChatTarget, setClearChatTarget] = useState<any>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{ user: any; action: 'block' | 'unblock' } | null>(null);
  const [shareContactTarget, setShareContactTarget] = useState<any>(null);
  const [shareSendingConvId, setShareSendingConvId] = useState<string | null>(null);
  const [contactInfoTarget, setContactInfoTarget] = useState<{ contact: any; conv?: any } | null>(null);
  const [blockedListOpen, setBlockedListOpen] = useState(false);
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
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openMenu]);

  useEffect(() => {
    if (typeof settings?.chats_open === 'boolean') {
      setChatsOpen(settings.chats_open);
    }
  }, [settings?.chats_open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConv?.id]);

  const selectConv = async (conv: any) => {
    setActiveConv({ ...conv, unread_count: 0 });
    activeConvIdRef.current = conv.id;
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id && c.unread_count !== 0 ? { ...c, unread_count: 0 } : c))
    );
    setEditingMsg(null);
    setReactionPickerMsgId(null);
    setReactionFullPickerMsgId(null);
    setComposerEmojiOpen(false);
    setOpenMenu(null);
    try {
      const res = await apiRequest<{ messages: any[]; blocked_by_me?: boolean; blocked_by_other?: boolean }>(
        `/api/chats/${conv.id}/messages`
      );
      setMessages(res.messages || []);
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id && c.unread_count !== 0 ? { ...c, unread_count: 0 } : c))
      );
      if (typeof res.blocked_by_me === 'boolean' || typeof res.blocked_by_other === 'boolean') {
        setActiveConv((prev: any) =>
          prev && prev.id === conv.id
            ? {
                ...prev,
                unread_count: 0,
                blocked_by_me: Boolean(res.blocked_by_me),
                blocked_by_other: Boolean(res.blocked_by_other),
              }
            : prev
        );
      }
      window.dispatchEvent(new CustomEvent('madrasa:notifications-updated'));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loadChats = async (preferConvId?: string, silent = false) => {
    try {
      const [res, statusRes, stListRes] = await Promise.all([
        apiRequest<{ conversations: any[]; contacts: any[]; blockedUsers?: any[] }>('/api/chats'),
        apiRequest<{ chatsOpen: boolean }>('/api/chats/status'),
        apiRequest<{ statuses: any[] }>('/api/chats/statuses').catch(() => ({ statuses: [] })),
      ]);
      const openConvId = activeConvIdRef.current;
      const syncedConvs = (res.conversations || []).map((c) =>
        openConvId && c.id === openConvId ? { ...c, unread_count: 0 } : c
      );
      setConversations(syncedConvs);
      setContacts(res.contacts || []);
      setBlockedUsers(res.blockedUsers || []);
      setStatuses(stListRes.statuses || []);
      if (typeof statusRes?.chatsOpen === 'boolean') {
        setChatsOpen(statusRes.chatsOpen);
      }

      const targetId = preferConvId || openConvId;
      if (targetId) {
        const found = syncedConvs.find((c) => c.id === targetId);
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
    loadChats(initialConvId || undefined);
    if (initialConvId) {
      onInitialConvHandled?.();
    }
    const timer = window.setInterval(() => {
      loadChats(undefined, true);
      if (activeConvIdRef.current) {
        apiRequest<{ messages: any[]; blocked_by_me?: boolean; blocked_by_other?: boolean }>(
          `/api/chats/${activeConvIdRef.current}/messages`
        )
          .then((r) => {
            setMessages(r.messages || []);
            setActiveConv((prev: any) =>
              prev && prev.id === activeConvIdRef.current
                ? {
                    ...prev,
                    unread_count: 0,
                    blocked_by_me: Boolean(r.blocked_by_me),
                    blocked_by_other: Boolean(r.blocked_by_other),
                  }
                : prev
            );
            window.dispatchEvent(new CustomEvent('madrasa:notifications-updated'));
          })
          .catch(() => {});
      }
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!initialConvId) return;
    const found = conversations.find((c) => c.id === initialConvId);
    if (found) {
      setSidebarTab('chats');
      selectConv(found);
      onInitialConvHandled?.();
    } else {
      loadChats(initialConvId).then(() => {
        onInitialConvHandled?.();
      });
    }
  }, [initialConvId]);

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
    const wasChannel = Boolean(deleteChannelTarget.is_personal_channel);
    setErr('');
    try {
      await apiRequest(`/api/chats/${targetId}`, { method: 'DELETE' });
      setDeleteChannelTarget(null);
      if (activeConv?.id === targetId) {
        setActiveConv(null);
        activeConvIdRef.current = null;
        setMessages([]);
      }
      setMsg(wasChannel ? 'Personal channel deleted.' : 'Chat deleted from your chat list.');
      await loadChats();
    } catch (e: any) {
      setDeleteChannelTarget(null);
      setErr(e.message || 'Failed to delete chat');
    }
  };

  const handleConfirmDeleteContact = async () => {
    if (!deleteContactTarget) return;
    const target = deleteContactTarget;
    const targetId = target.id || target.user_id;
    setErr('');
    try {
      await apiRequest(`/api/chats/contacts/${targetId}`, { method: 'DELETE' });
      setDeleteContactTarget(null);
      setContacts((prev) => prev.filter((c) => c.id !== targetId));
      if (contactInfoTarget?.contact?.id === targetId || contactInfoTarget?.contact?.user_id === targetId) {
        setContactInfoTarget(null);
      }
      setMsg(`${target.full_name} removed from your chat contacts.`);
    } catch (e: any) {
      setDeleteContactTarget(null);
      setErr(e.message || 'Failed to delete contact');
    }
  };

  const handleConfirmClearChat = async () => {
    if (!clearChatTarget) return;
    const target = clearChatTarget;
    setErr('');
    try {
      await apiRequest(`/api/chats/${target.id}/clear`, { method: 'POST' });
      setClearChatTarget(null);
      if (activeConv?.id === target.id) {
        setMessages([]);
      }
      setMsg(`Cleared messages in "${target.display_title || 'chat'}".`);
      await loadChats();
    } catch (e: any) {
      setClearChatTarget(null);
      setErr(e.message || 'Failed to clear chat');
    }
  };

  const handleConfirmClearAllChats = async () => {
    setErr('');
    try {
      await apiRequest('/api/chats/clear-all', { method: 'POST' });
      setClearAllConfirmOpen(false);
      setMessages([]);
      setMsg('All chat histories cleared for your account.');
      await loadChats();
    } catch (e: any) {
      setClearAllConfirmOpen(false);
      setErr(e.message || 'Failed to clear all chats');
    }
  };

  const handleConfirmBlockAction = async () => {
    if (!blockTarget) return;
    const { user: targetUser, action } = blockTarget;
    const targetId = targetUser.id || targetUser.user_id;
    setErr('');
    try {
      await apiRequest(`/api/chats/contacts/${targetId}/${action}`, { method: 'POST' });
      setBlockTarget(null);
      const isNowBlocked = action === 'block';
      setMsg(
        isNowBlocked
          ? `${targetUser.full_name} blocked. They can no longer message you.`
          : `${targetUser.full_name} unblocked.`
      );
      if (contactInfoTarget?.contact && (contactInfoTarget.contact.id === targetId || contactInfoTarget.contact.user_id === targetId)) {
        setContactInfoTarget({
          ...contactInfoTarget,
          contact: { ...contactInfoTarget.contact, is_blocked: isNowBlocked },
        });
      }
      await loadChats();
    } catch (e: any) {
      setBlockTarget(null);
      setErr(e.message || `Failed to ${action} contact`);
    }
  };

  const formatContactShareText = (contact: any) => {
    const lines = [
      `📇 Contact Card`,
      `Name: ${contact.full_name || 'Unknown'}`,
      contact.role_name ? `Role: ${contact.role_name}` : '',
      contact.mobile ? `Phone: ${contact.mobile}` : '',
      contact.username ? `Username: @${contact.username}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  };

  const handleCopyContact = async (contact: any) => {
    try {
      await navigator.clipboard.writeText(formatContactShareText(contact));
      setMsg(`Copied contact details for ${contact.full_name}.`);
    } catch {
      setErr('Unable to copy to clipboard.');
    }
  };

  const handleSendSharedContactToConv = async (conv: any) => {
    if (!shareContactTarget || shareSendingConvId) return;
    setShareSendingConvId(conv.id);
    setErr('');
    try {
      await apiRequest(`/api/chats/${conv.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: formatContactShareText(shareContactTarget),
        }),
      });
      setShareContactTarget(null);
      setMsg(`Shared ${shareContactTarget.full_name}'s contact to "${conv.display_title}".`);
      await loadChats(conv.id);
    } catch (e: any) {
      setErr(e.message || 'Failed to share contact');
    } finally {
      setShareSendingConvId(null);
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
    const mediaUrl = statusForm.media_url || statusForm.image_url;
    if (!statusForm.text.trim() && !mediaUrl) {
      setErr('Write a status message or upload a photo/video (max 10 MB).');
      return;
    }
    setPostingStatus(true);
    setErr('');
    try {
      await apiRequest('/api/chats/statuses', {
        method: 'POST',
        body: JSON.stringify({
          text: statusForm.text,
          image_url: statusForm.media_type === 'image' ? mediaUrl : '',
          media_url: mediaUrl,
          media_type: mediaUrl ? statusForm.media_type : 'text',
          bg_color: statusForm.bg_color,
        }),
      });
      setStatusModalOpen(false);
      setStatusForm({ text: '', image_url: '', media_url: '', media_type: 'text', bg_color: '#008069' });
      setMsg('Status posted! Visible for 24 hours with views, likes, reactions, comments & direct reply.');
      await loadChats(undefined, true);
    } catch (e: any) {
      setErr(e.message || 'Failed to post status');
    } finally {
      setPostingStatus(false);
    }
  };

  const handleStatusUpdated = (updated: WhatsAppStatusItem) => {
    setStatuses((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setViewerQueue((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
          }
        : null
    );
  };

  const handleDeleteStatus = async (statusId: string) => {
    setErr('');
    try {
      await apiRequest(`/api/chats/statuses/${statusId}`, { method: 'DELETE' });
      setStatuses((prev) => prev.filter((s) => s.id !== statusId));
      setViewerQueue((prev) => {
        if (!prev) return null;
        const remaining = prev.items.filter((s) => s.id !== statusId);
        if (remaining.length === 0) return null;
        return { items: remaining, index: Math.min(prev.index, remaining.length - 1) };
      });
      setMsg('Status removed.');
      await loadChats(undefined, true);
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
              <div className="flex items-center gap-1.5 relative">
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu((prev) => (prev?.scope === 'sidebar' ? null : { scope: 'sidebar' }));
                  }}
                  title="More Chat Options"
                  aria-label="More Chat Options"
                  className="p-1.5 rounded-md bg-white/15 hover:bg-white/25 text-white transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {openMenu?.scope === 'sidebar' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute end-0 top-full mt-1.5 w-52 bg-white text-[#111B21] rounded-xl border border-neutral-200 shadow-xl py-1.5 z-40 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        handleQuickPersonalChannel();
                      }}
                      className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-[#008069]" />
                      <span>My Personal Channel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        setChatType('private');
                        setGroupTitle('');
                        setSelectedContacts([]);
                        setInitialMsg('');
                        setNewChatOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#008069]" />
                      <span>New Chat / Group</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        setBlockedListOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-start flex items-center justify-between gap-2 hover:bg-[#F5F6F6]"
                    >
                      <span className="flex items-center gap-2.5">
                        <Ban className="w-3.5 h-3.5 text-[#667781]" />
                        <span>Blocked Contacts</span>
                      </span>
                      {blockedUsers.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-[#DC1726] text-[10px] font-bold font-mono-num">
                          {blockedUsers.length}
                        </span>
                      )}
                    </button>
                    <div className="my-1 border-t border-neutral-100" />
                    <button
                      type="button"
                      disabled={conversations.length === 0}
                      onClick={() => {
                        setOpenMenu(null);
                        setClearAllConfirmOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 text-[#DC1726] hover:bg-red-50 disabled:opacity-45"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      <span>All Clear Chat</span>
                    </button>
                  </div>
                )}
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
                  filteredConversations.map((c, idx) => {
                    const isSelected = activeConv?.id === c.id;
                    const menuOpenHere = openMenu?.scope === 'conv' && openMenu?.id === c.id;
                    const isPrivateWithOther = Boolean(!c.is_personal_channel && c.type === 'private' && c.other_user);
                    const openUp = idx >= filteredConversations.length - 2 && idx > 0;
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectConv(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectConv(c);
                          }
                        }}
                        className={`group relative w-full text-start px-3.5 py-3 flex items-center gap-3 hover:bg-[#F5F6F6] transition-colors cursor-pointer ${
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
                              {c.blocked_by_me && (
                                <span className="px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-[9px] font-bold text-[#DC1726] shrink-0">
                                  Blocked
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
                            <div className="flex items-center gap-1 shrink-0 relative">
                              {c.unread_count > 0 && (
                                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-white text-[10px] font-bold font-mono-num flex items-center justify-center">
                                  {c.unread_count}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenu((prev) =>
                                    prev?.scope === 'conv' && prev?.id === c.id ? null : { scope: 'conv', id: c.id }
                                  );
                                }}
                                title="Chat options"
                                aria-label="Chat options"
                                className="p-1 rounded-full text-[#667781] hover:text-[#111B21] hover:bg-neutral-200/70 transition-colors"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>

                              {menuOpenHere && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className={`absolute end-0 ${
                                    openUp ? 'bottom-full mb-1' : 'top-full mt-1'
                                  } w-48 bg-white text-[#111B21] rounded-xl border border-neutral-200 shadow-xl py-1.5 z-40 text-xs`}
                                >
                                  {isPrivateWithOther && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenu(null);
                                          setContactInfoTarget({ contact: c.other_user, conv: c });
                                        }}
                                        className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                                      >
                                        <Info className="w-3.5 h-3.5 text-[#54656F]" />
                                        <span>View Contact</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenu(null);
                                          setShareContactTarget(c.other_user);
                                        }}
                                        className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                                      >
                                        <Share2 className="w-3.5 h-3.5 text-[#008069]" />
                                        <span>Share Contact</span>
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenu(null);
                                      setClearChatTarget(c);
                                    }}
                                    className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                                  >
                                    <Eraser className="w-3.5 h-3.5 text-[#54656F]" />
                                    <span>Clear Chat</span>
                                  </button>
                                  {isPrivateWithOther && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenu(null);
                                        setBlockTarget({
                                          user: c.other_user,
                                          action: c.blocked_by_me ? 'unblock' : 'block',
                                        });
                                      }}
                                      className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                                    >
                                      {c.blocked_by_me ? (
                                        <>
                                          <ShieldOff className="w-3.5 h-3.5 text-[#008069]" />
                                          <span className="text-[#008069] font-medium">Unblock Contact</span>
                                        </>
                                      ) : (
                                        <>
                                          <Ban className="w-3.5 h-3.5 text-amber-600" />
                                          <span className="text-amber-700 font-medium">Block Contact</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                  <div className="my-1 border-t border-neutral-100" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenu(null);
                                      setDeleteChannelTarget(c);
                                    }}
                                    className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 text-[#DC1726] hover:bg-red-50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>{c.is_personal_channel ? 'Delete Channel' : 'Delete Chat'}</span>
                                  </button>
                                  {isPrivateWithOther && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenu(null);
                                        setDeleteContactTarget(c.other_user);
                                      }}
                                      className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 text-[#DC1726] hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Delete Contact</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {sidebarTab === 'status' && (() => {
              const myStatuses: WhatsAppStatusItem[] = statuses.filter((s) => s.user_id === user.id);
              const myTotalViews = myStatuses.reduce((sum, s) => sum + (s.views_count || 0), 0);
              const myTotalLikes = myStatuses.reduce((sum, s) => sum + (s.likes_count || 0), 0);

              const othersGroupedMap = new Map<string, WhatsAppStatusItem[]>();
              for (const st of statuses) {
                if (st.user_id === user.id) continue;
                const list = othersGroupedMap.get(st.user_id) || [];
                list.push(st);
                othersGroupedMap.set(st.user_id, list);
              }
              const otherGroups = Array.from(othersGroupedMap.values()).map((items) => {
                // Show oldest first within a user's story reel (just like real WhatsApp), latest metadata for preview
                const chronological = [...items].reverse();
                const latest = items[0];
                const hasUnseen = items.some((i) => !i.viewed_by_me);
                return { userId: latest.user_id, latest, chronological, hasUnseen };
              });
              const recentGroups = otherGroups.filter((g) => g.hasUnseen);
              const viewedGroups = otherGroups.filter((g) => !g.hasUnseen);

              const renderGroupRow = (g: (typeof otherGroups)[number]) => {
                const latest = g.latest;
                const isVid = latest.media_type === 'video' || isVideoUrl(latest.media_url || latest.image_url);
                const previewLine =
                  latest.text ||
                  (isVid ? '🎥 Video status' : latest.media_url || latest.image_url ? '📷 Photo status' : 'Status update');
                return (
                  <button
                    key={g.userId}
                    type="button"
                    onClick={() => setViewerQueue({ items: g.chronological, index: 0 })}
                    className="w-full text-start px-3.5 py-3 flex items-center gap-3 hover:bg-[#F5F6F6] transition-colors"
                  >
                    <div
                      className={`p-0.5 rounded-full border-2 shrink-0 ${
                        g.hasUnseen ? 'border-[#25D366]' : 'border-neutral-300'
                      }`}
                    >
                      {renderAvatar({ photo_url: latest.author_photo, full_name: latest.author_name }, 38)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#111B21] truncate flex items-center gap-1.5">
                          <span className="truncate">{latest.author_name}</span>
                          {g.chronological.length > 1 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-50 text-[#008069] font-mono-num shrink-0">
                              {g.chronological.length}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-[#667781] font-mono-num shrink-0">
                          {formatChatTime(latest.created_at)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#667781] truncate mt-0.5">{previewLine}</div>
                      <div className="flex items-center gap-2.5 mt-1 text-[10px] text-[#667781] font-mono-num">
                        <span className="inline-flex items-center gap-0.5">
                          <Heart className={`w-2.5 h-2.5 ${latest.liked_by_me ? 'text-red-500 fill-red-500' : ''}`} />{' '}
                          {latest.likes_count || 0}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <MessageCircle className="w-2.5 h-2.5" /> {latest.comments_count || 0}
                        </span>
                        {(latest.reactions_summary || []).slice(0, 3).map((rx) => (
                          <span key={rx.emoji}>{rx.emoji}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              };

              return (
                <div className="divide-y divide-neutral-100">
                  {/* My Status */}
                  <div className="p-3.5 flex items-center justify-between gap-2.5 bg-neutral-50/80">
                    <button
                      type="button"
                      onClick={() => {
                        if (myStatuses.length > 0) {
                          setViewerQueue({ items: [...myStatuses].reverse(), index: 0 });
                        } else {
                          setStatusModalOpen(true);
                        }
                      }}
                      className="flex items-center gap-3 min-w-0 flex-1 text-start"
                    >
                      <div
                        className={`relative p-0.5 rounded-full border-2 shrink-0 ${
                          myStatuses.length > 0 ? 'border-[#00A884]' : 'border-dashed border-neutral-300'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-[#008069] text-white flex items-center justify-center font-bold text-sm">
                          {user.full_name.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#111B21] flex items-center gap-1.5">
                          <span>My Status</span>
                          {myStatuses.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-[#008069] font-mono-num">
                              {myStatuses.length} active
                            </span>
                          )}
                        </div>
                        {myStatuses.length > 0 ? (
                          <div className="text-[11px] text-[#008069] flex items-center gap-2.5 font-medium mt-0.5">
                            <span className="inline-flex items-center gap-0.5">
                              <Eye className="w-3 h-3" /> {myTotalViews} views
                            </span>
                            <span className="inline-flex items-center gap-0.5">
                              <Heart className="w-3 h-3" /> {myTotalLikes}
                            </span>
                            <span className="text-[#667781] truncate">Tap to view</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#667781]">
                            Add photo, video (10 MB), or text (24h)
                          </div>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusModalOpen(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#008069] text-white text-xs font-semibold hover:bg-[#006a57] shrink-0"
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
                      <div className="text-[11px] text-[#667781] truncate">Save messages, photos, videos & PDFs privately</div>
                    </div>
                  </button>

                  {recentGroups.length > 0 && (
                    <div>
                      <div className="px-3.5 py-1.5 bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-[#008069]">
                        Recent Updates ({recentGroups.length})
                      </div>
                      <div className="divide-y divide-neutral-100">
                        {recentGroups.map(renderGroupRow)}
                      </div>
                    </div>
                  )}

                  {viewedGroups.length > 0 && (
                    <div>
                      <div className="px-3.5 py-1.5 bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-[#667781]">
                        Viewed Updates ({viewedGroups.length})
                      </div>
                      <div className="divide-y divide-neutral-100">
                        {viewedGroups.map(renderGroupRow)}
                      </div>
                    </div>
                  )}

                  {otherGroups.length === 0 && myStatuses.length === 0 && (
                    <div className="p-6 text-center text-xs text-[#667781]">
                      No status updates in the last 24 hours. Share a photo, video, or text status!
                    </div>
                  )}
                </div>
              );
            })()}

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
                    filteredContacts.map((c, idx) => {
                      const menuOpenHere = openMenu?.scope === 'contact' && openMenu?.id === c.id;
                      const openUp = idx >= filteredContacts.length - 2 && idx > 0;
                      return (
                        <div key={c.id} className="relative px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-[#F5F6F6]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {renderAvatar(c, 38)}
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#111B21] truncate flex items-center gap-1.5">
                                <span className="truncate">{c.full_name}</span>
                                {c.is_blocked && (
                                  <span className="px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-[9px] font-bold text-[#DC1726] shrink-0">
                                    Blocked
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#667781] truncate font-mono-num">
                                {c.role_name}
                                {c.mobile ? ` · ${c.mobile}` : ''} · @{c.username}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 relative">
                            <button
                              type="button"
                              disabled={connectingUserId === c.id}
                              onClick={() => handleConnectUser(c, false)}
                              className="px-2.5 py-1 rounded-md border border-[#008069] text-[#008069] text-[11px] font-semibold hover:bg-[#008069] hover:text-white transition-colors"
                            >
                              Chat
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenu((prev) =>
                                  prev?.scope === 'contact' && prev?.id === c.id ? null : { scope: 'contact', id: c.id }
                                );
                              }}
                              title="Contact options"
                              aria-label={`More options for ${c.full_name}`}
                              className="p-1.5 rounded-full text-[#54656F] hover:text-[#111B21] hover:bg-neutral-200/70 transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {menuOpenHere && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute end-0 ${
                                  openUp ? 'bottom-full mb-1' : 'top-full mt-1'
                                } w-48 bg-white text-[#111B21] rounded-xl border border-neutral-200 shadow-xl py-1.5 z-40 text-xs`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setContactInfoTarget({ contact: c });
                                  }}
                                  className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                                >
                                  <Info className="w-3.5 h-3.5 text-[#54656F]" />
                                  <span>Contact Info</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setShareContactTarget(c);
                                  }}
                                  className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                                >
                                  <Share2 className="w-3.5 h-3.5 text-[#008069]" />
                                  <span>Share Contact</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setBlockTarget({
                                      user: c,
                                      action: c.is_blocked ? 'unblock' : 'block',
                                    });
                                  }}
                                  className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                                >
                                  {c.is_blocked ? (
                                    <>
                                      <ShieldOff className="w-3.5 h-3.5 text-[#008069]" />
                                      <span className="text-[#008069] font-medium">Unblock Contact</span>
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="w-3.5 h-3.5 text-amber-600" />
                                      <span className="text-amber-700 font-medium">Block Contact</span>
                                    </>
                                  )}
                                </button>
                                <div className="my-1 border-t border-neutral-100" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setDeleteContactTarget(c);
                                  }}
                                  className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 text-[#DC1726] hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete Contact</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
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

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu((prev) => (prev?.scope === 'header' ? null : { scope: 'header' }));
                    }}
                    title="Chat Menu"
                    aria-label="Chat Menu"
                    className="p-2 rounded-full text-[#54656F] hover:text-[#111B21] hover:bg-neutral-200/70 transition-colors"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {openMenu?.scope === 'header' && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute end-0 top-full mt-1.5 w-52 bg-white text-[#111B21] rounded-xl border border-neutral-200 shadow-xl py-1.5 z-40 text-xs"
                    >
                      {!activeConv.is_personal_channel && activeConv.type === 'private' && activeConv.other_user && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenu(null);
                              setContactInfoTarget({ contact: activeConv.other_user, conv: activeConv });
                            }}
                            className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                          >
                            <Info className="w-3.5 h-3.5 text-[#54656F]" />
                            <span>Contact Info</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenu(null);
                              setShareContactTarget(activeConv.other_user);
                            }}
                            className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                          >
                            <Share2 className="w-3.5 h-3.5 text-[#008069]" />
                            <span>Share Contact</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          setClearChatTarget(activeConv);
                        }}
                        className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                      >
                        <Eraser className="w-3.5 h-3.5 text-[#54656F]" />
                        <span>Clear Chat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          setClearAllConfirmOpen(true);
                        }}
                        className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                      >
                        <Eraser className="w-3.5 h-3.5 text-[#DC1726]" />
                        <span>All Clear Chat</span>
                      </button>
                      {!activeConv.is_personal_channel && activeConv.type === 'private' && activeConv.other_user && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setBlockTarget({
                              user: activeConv.other_user,
                              action: activeConv.blocked_by_me ? 'unblock' : 'block',
                            });
                          }}
                          className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 hover:bg-[#F5F6F6]"
                        >
                          {activeConv.blocked_by_me ? (
                            <>
                              <ShieldOff className="w-3.5 h-3.5 text-[#008069]" />
                              <span className="text-[#008069] font-medium">Unblock Contact</span>
                            </>
                          ) : (
                            <>
                              <Ban className="w-3.5 h-3.5 text-amber-600" />
                              <span className="text-amber-700 font-medium">Block Contact</span>
                            </>
                          )}
                        </button>
                      )}
                      <div className="my-1 border-t border-neutral-100" />
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          setDeleteChannelTarget(activeConv);
                        }}
                        className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 text-[#DC1726] hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{activeConv.is_personal_channel ? 'Delete Channel' : 'Delete Chat'}</span>
                      </button>
                      {!activeConv.is_personal_channel && activeConv.type === 'private' && activeConv.other_user && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            setDeleteContactTarget(activeConv.other_user);
                          }}
                          className="w-full px-3.5 py-2 text-start flex items-center gap-2.5 text-[#DC1726] hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Contact</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
                    const isVid = m.attachment_url && isVideoAttachment(m.attachment_url, m.attachment_name || '');
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

                            {m.attachment_url && isVid && (
                              <div className="mt-1.5 space-y-1.5">
                                <div className="rounded-lg overflow-hidden border border-black/15 bg-black">
                                  <video
                                    src={m.attachment_url}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="max-h-64 w-full max-w-[280px] sm:max-w-[320px] object-contain bg-black"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadAttachment(m.attachment_url, m.attachment_name || 'video.mp4')}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#008069] hover:underline"
                                >
                                  <Download className="w-3 h-3" /> Download Video
                                </button>
                              </div>
                            )}

                            {m.attachment_url && !isImg && !isVid && (
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

              {/* Bottom WhatsApp Composer Bar or Blocked Banner */}
              {activeConv.blocked_by_me ? (
                <div className="px-4 py-3 border-t border-neutral-200 bg-[#F0F2F5] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-[#54656F]">
                    <Ban className="w-4 h-4 text-[#DC1726] shrink-0" />
                    <span>You blocked this contact. Unblock to send messages.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBlockTarget({ user: activeConv.other_user, action: 'unblock' })}
                    className="px-3 py-1.5 rounded-lg bg-[#008069] text-white font-semibold hover:bg-[#006a57]"
                  >
                    Unblock
                  </button>
                </div>
              ) : activeConv.blocked_by_other ? (
                <div className="px-4 py-3 border-t border-neutral-200 bg-[#F0F2F5] flex items-center justify-center gap-2 text-xs text-[#667781]">
                  <Ban className="w-4 h-4 text-[#DC1726] shrink-0" />
                  <span>You cannot send messages to this contact.</span>
                </div>
              ) : (
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
                        title="Attach photo, video (max 10 MB), or PDF/document (max 10 MB)"
                      >
                        <Paperclip className="w-5 h-5" />
                        <input
                          type="file"
                          accept="image/*,video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.m4v,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
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
                      {uploadingFile && <div className="text-[11px] text-[#667781] mb-1">Uploading file (max 10 MB)...</div>}
                      {!editingMsg && attachment && (
                        <div className="text-[11px] text-[#008069] font-medium flex items-center gap-1.5 mb-1 bg-white px-2.5 py-1 rounded-md border border-emerald-200">
                          {isVideoAttachment(attachment.url, attachment.name) ? (
                            <Film className="w-3.5 h-3.5 shrink-0 text-[#008069]" />
                          ) : (
                            <Paperclip className="w-3 h-3 shrink-0" />
                          )}
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
              )}
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

      {/* Post 24-Hour WhatsApp Status Modal (Photo, Video up to 10 MB, or Colored Text) */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handlePostStatus} className="max-w-md w-full bg-white rounded-2xl border border-neutral-200 shadow-2xl p-5 sm:p-6 space-y-4 text-xs my-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#111B21]">Add 24-Hour Status</h3>
                <p className="text-[10px] text-[#667781]">Auto-disappears after 24 hours · Supports Photo, Video (max 10 MB) & Text</p>
              </div>
              <button type="button" onClick={() => setStatusModalOpen(false)} className="p-1 rounded hover:bg-neutral-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Preview Box */}
            {statusForm.media_url ? (
              <div className="relative rounded-xl overflow-hidden bg-black border border-neutral-200">
                {statusForm.media_type === 'video' ? (
                  <video
                    src={statusForm.media_url}
                    controls
                    muted
                    playsInline
                    className="w-full max-h-56 object-contain bg-black"
                  />
                ) : (
                  <img
                    src={statusForm.media_url}
                    alt="Status preview"
                    className="w-full max-h-56 object-contain bg-black"
                  />
                )}
                <button
                  type="button"
                  onClick={() =>
                    setStatusForm((prev) => ({
                      ...prev,
                      image_url: '',
                      media_url: '',
                      media_type: 'text',
                    }))
                  }
                  className="absolute top-2 end-2 px-2.5 py-1 rounded-full bg-black/75 text-white text-[10px] font-semibold hover:bg-red-600"
                >
                  Remove Media
                </button>
              </div>
            ) : (
              <div
                style={{ backgroundColor: statusForm.bg_color }}
                className="rounded-xl p-5 min-h-[110px] flex items-center justify-center text-white text-center font-semibold text-sm transition-colors"
              >
                {statusForm.text.trim() || 'Your 24-hour status preview will appear here...'}
              </div>
            )}

            <div>
              <label className="block font-medium mb-1">
                {statusForm.media_url ? 'Caption (Optional)' : 'Status Text'}
              </label>
              <textarea
                rows={3}
                value={statusForm.text}
                onChange={(e) => setStatusForm({ ...statusForm, text: e.target.value })}
                placeholder="Share a quick announcement, dua, or update..."
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#008069]"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Photo or Video (Optional · Max 10 MB)</label>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100 font-medium ${uploadingStatusMedia ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Film className="w-3.5 h-3.5 text-[#008069]" />
                  <span>{uploadingStatusMedia ? 'Uploading...' : 'Upload Photo / Video (Max 10 MB)'}</span>
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.m4v"
                    disabled={uploadingStatusMedia}
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setErr('');
                      setUploadingStatusMedia(true);
                      try {
                        const up = await uploadFile(f, 'chat-attachments');
                        const vid = f.type.startsWith('video/') || isVideoUrl(up.url, up.name);
                        setStatusForm((prev) => ({
                          ...prev,
                          image_url: vid ? '' : up.url,
                          media_url: up.url,
                          media_type: vid ? 'video' : 'image',
                        }));
                      } catch (err: any) {
                        setErr(err.message || 'Failed to upload status media');
                      } finally {
                        setUploadingStatusMedia(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {!statusForm.media_url && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Background:</span>
                {['#008069', '#0B5345', '#1E3A8A', '#7C2D12', '#4C1D95', '#991B1B', '#171717'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setStatusForm({ ...statusForm, bg_color: col })}
                    style={{ backgroundColor: col }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      statusForm.bg_color === col ? 'border-black scale-110' : 'border-white'
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t border-neutral-100">
              <button type="button" onClick={() => setStatusModalOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100 font-medium">
                Cancel
              </button>
              <button
                type="submit"
                disabled={postingStatus || uploadingStatusMedia}
                className="px-4 py-2 rounded-lg bg-[#008069] hover:bg-[#006a57] text-white font-semibold disabled:opacity-60"
              >
                {postingStatus ? 'Posting...' : 'Post 24h Status'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Full Real WhatsApp-Style 24-Hour Status Viewer */}
      {viewerQueue && (
        <WhatsAppStatusViewer
          statuses={viewerQueue.items}
          initialIndex={viewerQueue.index}
          currentUserId={user.id}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setViewerQueue(null)}
          onStatusUpdated={handleStatusUpdated}
          onDeleteStatus={handleDeleteStatus}
          onOpenChatConversation={(convId) => {
            setSidebarTab('chats');
            loadChats(convId);
          }}
        />
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

      {/* Contact Info Modal */}
      {contactInfoTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setContactInfoTarget(null)}
        >
          <div
            className="max-w-sm w-full bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#008069] text-white px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Contact Info</h3>
              <button type="button" onClick={() => setContactInfoTarget(null)} className="p-1 rounded-full hover:bg-white/15">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-col items-center text-center gap-2">
                {renderAvatar(contactInfoTarget.contact, 68)}
                <div>
                  <div className="text-base font-bold text-[#111B21]">{contactInfoTarget.contact.full_name}</div>
                  <div className="text-[11px] text-[#667781] font-mono-num">
                    {contactInfoTarget.contact.role_name} · @{contactInfoTarget.contact.username}
                  </div>
                  {contactInfoTarget.contact.mobile && (
                    <div className="text-xs font-semibold text-[#008069] font-mono-num mt-1">
                      📞 {contactInfoTarget.contact.mobile}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyContact(contactInfoTarget.contact)}
                  className="px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center gap-1.5 font-semibold"
                >
                  <Copy className="w-3.5 h-3.5 text-[#008069]" />
                  <span>Copy Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = contactInfoTarget.contact;
                    setContactInfoTarget(null);
                    setShareContactTarget(target);
                  }}
                  className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-[#008069] hover:bg-emerald-100 flex items-center justify-center gap-1.5 font-semibold"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Contact</span>
                </button>
              </div>

              <div className="border-t border-neutral-100 pt-3 space-y-1.5">
                {contactInfoTarget.conv && (
                  <button
                    type="button"
                    onClick={() => {
                      const conv = contactInfoTarget.conv;
                      setContactInfoTarget(null);
                      setClearChatTarget(conv);
                    }}
                    className="w-full px-3 py-2 rounded-lg hover:bg-neutral-50 text-start flex items-center gap-2.5 font-medium text-[#111B21]"
                  >
                    <Eraser className="w-4 h-4 text-[#54656F]" />
                    <span>Clear Chat Messages</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const c = contactInfoTarget.contact;
                    setBlockTarget({ user: c, action: c.is_blocked ? 'unblock' : 'block' });
                  }}
                  className="w-full px-3 py-2 rounded-lg hover:bg-neutral-50 text-start flex items-center gap-2.5 font-medium"
                >
                  {contactInfoTarget.contact.is_blocked ? (
                    <>
                      <ShieldOff className="w-4 h-4 text-[#008069]" />
                      <span className="text-[#008069]">Unblock {contactInfoTarget.contact.full_name}</span>
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4 text-amber-600" />
                      <span className="text-amber-700">Block {contactInfoTarget.contact.full_name}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const c = contactInfoTarget.contact;
                    setContactInfoTarget(null);
                    setDeleteContactTarget(c);
                  }}
                  className="w-full px-3 py-2 rounded-lg hover:bg-red-50 text-start flex items-center gap-2.5 font-medium text-[#DC1726]"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Contact</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Contact Modal */}
      {shareContactTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShareContactTarget(null)}
        >
          <div
            className="max-w-md w-full bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#008069]" />
                <h3 className="text-sm font-bold text-[#111B21]">Share Contact</h3>
              </div>
              <button type="button" onClick={() => setShareContactTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {renderAvatar(shareContactTarget, 38)}
                  <div className="min-w-0">
                    <div className="font-bold text-[#111B21] truncate">{shareContactTarget.full_name}</div>
                    <div className="text-[11px] text-[#54656F] font-mono-num truncate">
                      {shareContactTarget.mobile || 'No phone'} · @{shareContactTarget.username}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyContact(shareContactTarget)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-[#008069] font-semibold hover:bg-emerald-50 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>

              <div className="text-[11px] font-semibold text-[#54656F]">Forward to a Chat or Channel:</div>
              <div className="max-h-56 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
                {conversations.filter((cv) => !cv.blocked_by_me && !cv.blocked_by_other).length === 0 ? (
                  <div className="p-4 text-center text-[#667781]">No available chats to forward to. Copy the contact above.</div>
                ) : (
                  conversations
                    .filter((cv) => !cv.blocked_by_me && !cv.blocked_by_other)
                    .map((cv) => (
                      <div key={cv.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-[#F5F6F6]">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {renderAvatar(
                            {
                              photo_url: cv.other_user?.photo_url,
                              full_name: cv.display_title,
                              is_personal_channel: cv.is_personal_channel,
                              type: cv.type,
                            },
                            34
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-[#111B21] truncate">{cv.display_title}</div>
                            <div className="text-[10px] text-[#667781] truncate">
                              {cv.is_personal_channel ? 'Personal Channel' : cv.other_user?.role_name || cv.type}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={shareSendingConvId === cv.id}
                          onClick={() => handleSendSharedContactToConv(cv)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#008069] text-white font-semibold hover:bg-[#006a57] disabled:opacity-60 shrink-0"
                        >
                          <Send className="w-3 h-3" />
                          <span>{shareSendingConvId === cv.id ? '...' : 'Send'}</span>
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Contacts Modal */}
      {blockedListOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setBlockedListOpen(false)}
        >
          <div
            className="max-w-md w-full bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-[#DC1726]" />
                <h3 className="text-sm font-bold text-[#111B21]">Blocked Contacts</h3>
              </div>
              <button type="button" onClick={() => setBlockedListOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {blockedUsers.length === 0 ? (
                <div className="p-6 text-center text-[#667781]">You have not blocked any contacts.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
                  {blockedUsers.map((bu) => (
                    <div key={bu.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {renderAvatar(bu, 36)}
                        <div className="min-w-0">
                          <div className="font-semibold text-[#111B21] truncate">{bu.full_name}</div>
                          <div className="text-[11px] text-[#667781] font-mono-num truncate">
                            {bu.role_name}
                            {bu.mobile ? ` · ${bu.mobile}` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBlockTarget({ user: bu, action: 'unblock' })}
                        className="px-3 py-1.5 rounded-lg border border-[#008069] text-[#008069] font-semibold hover:bg-[#008069] hover:text-white transition-colors shrink-0"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteChannelTarget)}
        title={deleteChannelTarget?.is_personal_channel ? 'Delete Personal Channel' : 'Delete Chat'}
        message={
          deleteChannelTarget?.is_personal_channel
            ? `Delete "${deleteChannelTarget?.display_title || 'this channel'}" and all saved messages inside it?`
            : `Delete chat "${deleteChannelTarget?.display_title || 'this conversation'}" from your chat list?`
        }
        confirmLabel={deleteChannelTarget?.is_personal_channel ? 'Delete Channel' : 'Delete Chat'}
        onConfirm={handleDeletePersonalChannel}
        onCancel={() => setDeleteChannelTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteContactTarget)}
        title="Delete Contact"
        message={`Remove "${deleteContactTarget?.full_name || 'this contact'}" from your chat contacts list? You can always reconnect later using their contact number or username.`}
        confirmLabel="Delete Contact"
        onConfirm={handleConfirmDeleteContact}
        onCancel={() => setDeleteContactTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(clearChatTarget)}
        title="Clear Chat"
        message={`Clear all messages in "${clearChatTarget?.display_title || 'this chat'}" for your account?`}
        confirmLabel="Clear Chat"
        onConfirm={handleConfirmClearChat}
        onCancel={() => setClearChatTarget(null)}
      />

      <ConfirmDialog
        open={clearAllConfirmOpen}
        title="All Clear Chat"
        message="Clear message history across all your chats and personal channels? This cannot be undone."
        confirmLabel="Clear All Chats"
        onConfirm={handleConfirmClearAllChats}
        onCancel={() => setClearAllConfirmOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(blockTarget)}
        title={blockTarget?.action === 'unblock' ? 'Unblock Contact' : 'Block Contact'}
        message={
          blockTarget?.action === 'unblock'
            ? `Unblock "${blockTarget?.user?.full_name || 'this contact'}"? You will be able to message each other again.`
            : `Block "${blockTarget?.user?.full_name || 'this contact'}"? Blocked contacts will no longer be able to send messages to you.`
        }
        confirmLabel={blockTarget?.action === 'unblock' ? 'Unblock' : 'Block'}
        onConfirm={handleConfirmBlockAction}
        onCancel={() => setBlockTarget(null)}
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
