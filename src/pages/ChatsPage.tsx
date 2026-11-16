import React, { useEffect, useState } from 'react';
import { Paperclip, Plus, Power, Send, Users, X } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';

interface ChatsPageProps {
  user: User;
  settings?: MadrasaSettings | null;
  onSettingsUpdated?: (s: MadrasaSettings) => void;
}

export const ChatsPage: React.FC<ChatsPageProps> = ({ user, settings, onSettingsUpdated }) => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [chatType, setChatType] = useState<'private' | 'group'>('private');
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [initialMsg, setInitialMsg] = useState('');
  const [chatsOpen, setChatsOpen] = useState<boolean>(settings?.chats_open !== false);
  const [togglingChat, setTogglingChat] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const isSuperAdmin = user.role_slug === 'super_admin';

  useEffect(() => {
    if (typeof settings?.chats_open === 'boolean') {
      setChatsOpen(settings.chats_open);
    }
  }, [settings?.chats_open]);

  const loadChats = async () => {
    try {
      const [res, statusRes] = await Promise.all([
        apiRequest<{ conversations: any[]; contacts: any[] }>('/api/chats'),
        apiRequest<{ chatsOpen: boolean }>('/api/chats/status'),
      ]);
      setConversations(res.conversations);
      setContacts(res.contacts);
      if (typeof statusRes?.chatsOpen === 'boolean') {
        setChatsOpen(statusRes.chatsOpen);
      }
      if (!activeConv && res.conversations[0]) {
        selectConv(res.conversations[0]);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  };

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
          ? 'Chat turned ON. Teachers, parents, and committee members can see the Chats button.'
          : 'Chat turned OFF. Chats button is now hidden for everyone except Super Admin.'
      );
    } catch (e: any) {
      setErr(e.message || 'Failed to update chat visibility');
    } finally {
      setTogglingChat(false);
    }
  };

  const selectConv = async (conv: any) => {
    setActiveConv(conv);
    try {
      const res = await apiRequest<{ messages: any[] }>(`/api/chats/${conv.id}/messages`);
      setMessages(res.messages);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || (!text.trim() && !attachment)) return;
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
      loadChats();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedContacts.length === 0) {
      setErr('Please select at least one recipient.');
      return;
    }
    setErr('');
    try {
      const res = await apiRequest<{ id: string }>('/api/chats', {
        method: 'POST',
        body: JSON.stringify({
          title: chatType === 'group' ? groupTitle : '',
          type: chatType,
          participant_ids: selectedContacts,
          initial_message: initialMsg,
        }),
      });
      setNewChatOpen(false);
      setSelectedContacts([]);
      setGroupTitle('');
      setInitialMsg('');
      const refreshed = await apiRequest<{ conversations: any[]; contacts: any[] }>('/api/chats');
      setConversations(refreshed.conversations);
      const created = refreshed.conversations.find((c) => c.id === res.id);
      if (created) selectConv(created);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726]">{err}</div>}

      {isSuperAdmin && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                chatsOpen ? 'bg-emerald-50 text-[#10B981]' : 'bg-red-50 text-[#DC1726]'
              }`}
            >
              <Power className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#171717]">
                Portal Chat Visibility:{' '}
                <span className={chatsOpen ? 'text-[#10B981]' : 'text-[#DC1726]'}>
                  {chatsOpen ? 'ON (All Authorized Roles)' : 'OFF (Super Admin Only)'}
                </span>
              </div>
              <p className="text-xs text-[#737373] mt-0.5">
                {chatsOpen
                  ? 'Teachers, parents, and committee members can see the Chats button in their sidebar.'
                  : 'Chats button and messaging are hidden for everyone except Super Admin.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg shrink-0 self-start sm:self-center">
            <button
              type="button"
              disabled={togglingChat}
              aria-pressed={chatsOpen}
              onClick={() => handleToggleChat(true)}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                chatsOpen
                  ? 'bg-[#10B981] text-white shadow-xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Chat ON
            </button>
            <button
              type="button"
              disabled={togglingChat}
              aria-pressed={!chatsOpen}
              onClick={() => handleToggleChat(false)}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                !chatsOpen
                  ? 'bg-[#DC1726] text-white shadow-xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Chat OFF
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden grid grid-cols-1 md:grid-cols-3 min-h-[540px]">
        {/* Left Conversation List */}
        <div className="border-e border-neutral-200 flex flex-col">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
            <span className="text-xs font-bold text-[#171717]">Conversations</span>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
            >
              <Plus className="w-3.5 h-3.5" /> New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#737373]">No conversations yet. Start a chat.</div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConv(c)}
                  className={`w-full text-start p-3.5 hover:bg-neutral-50 transition-colors ${
                    activeConv?.id === c.id ? 'bg-red-50/50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#171717] truncate flex items-center gap-1.5">
                      {c.type === 'group' && <Users className="w-3.5 h-3.5 text-[#DC1726] shrink-0" />}
                      {c.display_title}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#DC1726] text-white text-[10px] font-bold font-mono-num">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#737373] truncate mt-1">{c.last_message || 'No messages yet'}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Messages Panel */}
        <div className="md:col-span-2 flex flex-col">
          {!activeConv ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[#737373] p-8">
              Select a conversation or start a new message.
            </div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-neutral-100 bg-neutral-50">
                <div className="text-sm font-bold text-[#171717]">{activeConv.display_title}</div>
                <div className="text-[11px] text-[#737373]">
                  {(activeConv.participants || []).map((p: any) => p.full_name).join(', ')}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFAFA] max-h-[380px]">
                {messages.map((m) => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-xs shadow-xs ${
                        mine ? 'bg-[#171717] text-white' : 'bg-white border border-neutral-200 text-[#171717]'
                      }`}>
                        {!mine && <div className="text-[10px] font-bold text-[#DC1726] mb-0.5">{m.sender_name} · {m.sender_role}</div>}
                        {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                        {m.attachment_url && (
                          <a href={m.attachment_url} target="_blank" rel="noreferrer" className={`mt-1.5 inline-flex items-center gap-1 underline ${mine ? 'text-neutral-200' : 'text-[#0EA5E9]'}`}>
                            <Paperclip className="w-3 h-3" /> {m.attachment_name || 'Attachment'}
                          </a>
                        )}
                      </div>
                      <span className="text-[10px] text-[#737373] mt-1 font-mono-num">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleSend} className="p-3 border-t border-neutral-200 bg-white flex items-center gap-2">
                <label className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer shrink-0" title="Attach file">
                  <Paperclip className="w-4 h-4 text-[#737373]" />
                  <input
                    type="file"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setErr('');
                      try {
                        const up = await uploadFile(f, 'chat-attachments');
                        setAttachment({ url: up.url, name: up.name });
                      } catch (err: any) {
                        setErr(err.message || 'Failed to upload attachment');
                      } finally {
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <div className="flex-1 flex flex-col">
                  {attachment && (
                    <div className="text-[11px] text-[#0EA5E9] flex items-center gap-1 mb-1">
                      <span>Attached: {attachment.name}</span>
                      <button type="button" onClick={() => setAttachment(null)}><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 focus:outline-none focus:border-[#DC1726]"
                  />
                </div>
                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 shrink-0">
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {newChatOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateChat} className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">Start New Conversation</h3>
              <button type="button" onClick={() => setNewChatOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2">
              {(['private', 'group'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setChatType(t); setSelectedContacts([]); }}
                  className={`flex-1 py-2 rounded-lg border font-semibold capitalize ${chatType === t ? 'bg-[#171717] text-white border-[#171717]' : 'bg-neutral-50 border-neutral-200'}`}
                >
                  {t} Message
                </button>
              ))}
            </div>
            {chatType === 'group' && (
              <div><label className="block font-medium mb-1">Group Name *</label><input type="text" required value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            )}
            <div>
              <label className="block font-medium mb-1">Select Recipients</label>
              <div className="max-h-40 overflow-y-auto border border-neutral-200 rounded-lg p-2 space-y-1">
                {contacts.map((c) => {
                  const checked = selectedContacts.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-neutral-50 cursor-pointer">
                      <input
                        type={chatType === 'private' ? 'radio' : 'checkbox'}
                        name="chat_recipient"
                        checked={checked}
                        onChange={() => {
                          if (chatType === 'private') setSelectedContacts([c.id]);
                          else setSelectedContacts((prev) => prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]);
                        }}
                      />
                      <span>{c.full_name} ({c.role_name})</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div><label className="block font-medium mb-1">Initial Message</label><textarea rows={2} value={initialMsg} onChange={(e) => setInitialMsg(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200" /></div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewChatOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Start Chat</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
