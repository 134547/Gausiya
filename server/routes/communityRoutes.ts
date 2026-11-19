import { Router } from 'express';
import multer from 'multer';
import {
  ALLOWED_BUCKETS,
  requireSupabaseAdmin,
  resolveStorageUrl,
  resolveStorageUrlsInRows,
  supabaseAdmin,
} from '../supabase.ts';
import { saveUploadedAsset } from '../imgbb.ts';
import {
  AuthRequest,
  createNotification,
  getParentIdForUser,
  getParentStudentIds,
  getStudentIdForUser,
  logActivity,
  notifyRoles,
  requireAuth,
  requireRole,
} from '../auth.ts';
import { getChatsOpen, normalizeStorageRef, sanitizeOrTerm, setChatsOpen } from './publicRoutes.ts';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const requestedBucket = String((req.query.bucket as string) || (req.body?.bucket as string) || 'madrasa-assets');
    const bucket = ALLOWED_BUCKETS.has(requestedBucket) ? requestedBucket : 'madrasa-assets';
    const uploaded = await saveUploadedAsset({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      bucket,
      folder: req.user!.id,
    });

    return res.json({
      url: uploaded.url,
      storedRef: uploaded.storedRef,
      provider: uploaded.provider,
      name: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    return res.status(status).json({ error: err?.message || 'Upload failed' });
  }
});

// ==================== COMMITTEE ====================
router.get('/committee', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { data } = await admin
    .from('committee_members')
    .select('*')
    .is('deleted_at', null)
    .order('display_order', { ascending: true });
  const members = await resolveStorageUrlsInRows(data || [], ['photo_url']);
  return res.json({ members });
});

router.post('/committee', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { full_name, designation, mobile, email, address, joining_date, description, photo_url, status } = req.body;
    if (!full_name || !designation || !mobile) {
      return res.status(400).json({ error: 'Name, designation, and mobile are required.' });
    }
    const { data: maxRow } = await admin
      .from('committee_members')
      .select('display_order')
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await admin
      .from('committee_members')
      .insert({
        full_name: full_name.trim(),
        designation: designation.trim(),
        mobile: mobile.trim(),
        email: email || '',
        address: address || '',
        joining_date: joining_date || new Date().toISOString().slice(0, 10),
        description: description || '',
        photo_url: normalizeStorageRef(photo_url),
        display_order: (maxRow?.display_order || 0) + 1,
        status: status || 'active',
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to add committee member' });
    await logActivity(req.user!, 'COMMITTEE_MEMBER_ADDED', 'committee', created.id, `Added committee member ${full_name} (${designation})`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to add committee member' });
  }
});

router.put('/committee/:id', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { full_name, designation, mobile, email, address, joining_date, description, photo_url, status, display_order } = req.body;
  const payload: Record<string, any> = {};
  if (full_name !== undefined) payload.full_name = full_name;
  if (designation !== undefined) payload.designation = designation;
  if (mobile !== undefined) payload.mobile = mobile;
  if (email !== undefined) payload.email = email;
  if (address !== undefined) payload.address = address;
  if (joining_date !== undefined) payload.joining_date = joining_date;
  if (description !== undefined) payload.description = description;
  if (photo_url !== undefined) payload.photo_url = normalizeStorageRef(photo_url);
  if (status !== undefined) payload.status = status;
  if (display_order !== undefined) payload.display_order = display_order;

  const { error } = await admin.from('committee_members').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'COMMITTEE_MEMBER_UPDATED', 'committee', id, `Updated committee member ${id}`, req.ip);
  return res.json({ success: true });
});

router.post('/committee/reorder', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { orderedIds } = req.body as { orderedIds: string[] };
  const results = await Promise.all(
    (orderedIds || []).map((id, idx) => admin.from('committee_members').update({ display_order: idx + 1 }).eq('id', id))
  );
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) return res.status(400).json({ error: firstErr.message });
  return res.json({ success: true });
});

router.delete('/committee/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('committee_members').update({ deleted_at: new Date().toISOString(), status: 'inactive' }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'COMMITTEE_MEMBER_REMOVED', 'committee', id, `Removed committee member ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== CHATS & MESSAGING ====================
function getAllowedContactRoleSlugs(roleSlug: string): string[] {
  if (roleSlug === 'super_admin') return ['super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'];
  if (roleSlug === 'teacher') return ['super_admin', 'teacher', 'parent', 'student'];
  if (roleSlug === 'parent') return ['super_admin', 'teacher'];
  if (roleSlug === 'committee_member') return ['super_admin', 'committee_member', 'teacher'];
  if (roleSlug === 'student') return ['super_admin', 'teacher'];
  return ['super_admin'];
}

interface ChatMsgMeta {
  edited_at: string | null;
  reactions: Record<string, string[]>;
}

function parseMsgMeta(raw: string | null | undefined): ChatMsgMeta {
  if (!raw) return { edited_at: null, reactions: {} };
  try {
    const parsed = JSON.parse(raw);
    const reactions: Record<string, string[]> = {};
    if (parsed?.reactions && typeof parsed.reactions === 'object') {
      for (const [emoji, ids] of Object.entries(parsed.reactions)) {
        if (typeof emoji === 'string' && emoji.trim() && Array.isArray(ids)) {
          const cleanIds = Array.from(new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0)));
          if (cleanIds.length) reactions[emoji.trim()] = cleanIds;
        }
      }
    }
    return {
      edited_at: typeof parsed?.edited_at === 'string' && parsed.edited_at ? parsed.edited_at : null,
      reactions,
    };
  } catch {
    return { edited_at: null, reactions: {} };
  }
}

function formatReactionsList(reactions: Record<string, string[]>, currentUserId: string) {
  return Object.entries(reactions)
    .filter(([, ids]) => ids.length > 0)
    .map(([emoji, ids]) => ({
      emoji,
      count: ids.length,
      reactedByMe: ids.includes(currentUserId),
      userIds: ids,
    }));
}

async function getMsgMetaRow(admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>, convId: string, messageId: string) {
  const { data } = await admin
    .from('documents')
    .select('id, file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', convId)
    .eq('title', 'CHAT_MSG_META')
    .eq('file_type', messageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function saveMsgMeta(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  convId: string,
  messageId: string,
  meta: ChatMsgMeta,
  userId: string
) {
  const existing = await getMsgMetaRow(admin, convId, messageId);
  const hasReactions = Object.keys(meta.reactions).length > 0;
  if (!meta.edited_at && !hasReactions) {
    if (existing?.id) {
      await admin.from('documents').delete().eq('id', existing.id);
    }
    return;
  }

  const serialized = JSON.stringify({
    edited_at: meta.edited_at || null,
    reactions: meta.reactions,
  });

  if (existing?.id) {
    const { error } = await admin.from('documents').update({ file_url: serialized }).eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from('documents').insert({
      entity_type: 'general',
      entity_id: convId,
      title: 'CHAT_MSG_META',
      file_url: serialized,
      file_type: messageId,
      uploaded_by: userId,
    });
    if (error) throw new Error(error.message);
  }
}

async function getHiddenContactIds(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  userId: string
): Promise<{ rowId: string | null; ids: string[] }> {
  const { data } = await admin
    .from('documents')
    .select('id, file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', userId)
    .eq('title', 'CHAT_HIDDEN_CONTACTS')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { rowId: null, ids: [] };
  try {
    const parsed = JSON.parse(data.file_url || '[]');
    const ids = Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)))
      : [];
    return { rowId: data.id, ids };
  } catch {
    return { rowId: data.id, ids: [] };
  }
}

async function saveHiddenContactIds(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  userId: string,
  rowId: string | null,
  ids: string[]
) {
  const cleanIds = Array.from(new Set(ids.filter(Boolean)));
  const serialized = JSON.stringify(cleanIds);
  if (rowId) {
    const { error } = await admin.from('documents').update({ file_url: serialized }).eq('id', rowId);
    if (error) throw new Error(error.message);
  } else if (cleanIds.length > 0) {
    const { error } = await admin.from('documents').insert({
      entity_type: 'general',
      entity_id: userId,
      title: 'CHAT_HIDDEN_CONTACTS',
      file_url: serialized,
      uploaded_by: userId,
    });
    if (error) throw new Error(error.message);
  }
}

async function getBlockedUserIds(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  userId: string
): Promise<{ rowId: string | null; ids: string[] }> {
  const { data } = await admin
    .from('documents')
    .select('id, file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', userId)
    .eq('title', 'CHAT_BLOCKED_CONTACTS')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { rowId: null, ids: [] };
  try {
    const parsed = JSON.parse(data.file_url || '[]');
    const ids = Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)))
      : [];
    return { rowId: data.id, ids };
  } catch {
    return { rowId: data.id, ids: [] };
  }
}

async function saveBlockedUserIds(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  userId: string,
  rowId: string | null,
  ids: string[]
) {
  const cleanIds = Array.from(new Set(ids.filter(Boolean)));
  const serialized = JSON.stringify(cleanIds);
  if (rowId) {
    const { error } = await admin.from('documents').update({ file_url: serialized }).eq('id', rowId);
    if (error) throw new Error(error.message);
  } else if (cleanIds.length > 0) {
    const { error } = await admin.from('documents').insert({
      entity_type: 'general',
      entity_id: userId,
      title: 'CHAT_BLOCKED_CONTACTS',
      file_url: serialized,
      uploaded_by: userId,
    });
    if (error) throw new Error(error.message);
  }
}

async function getUsersBlockingMe(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  userId: string
): Promise<Set<string>> {
  const { data } = await admin
    .from('documents')
    .select('entity_id, file_url')
    .eq('entity_type', 'general')
    .eq('title', 'CHAT_BLOCKED_CONTACTS');

  const blockers = new Set<string>();
  for (const row of data || []) {
    if (!row.entity_id || row.entity_id === userId) continue;
    try {
      const parsed = JSON.parse(row.file_url || '[]');
      if (Array.isArray(parsed) && parsed.includes(userId)) {
        blockers.add(row.entity_id);
      }
    } catch {
      // ignore malformed row
    }
  }
  return blockers;
}

async function isBlockedBetween(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  uidA: string,
  uidB: string
): Promise<{ blockedByMe: boolean; blockedByOther: boolean }> {
  const [aBlocked, bBlocked] = await Promise.all([
    getBlockedUserIds(admin, uidA),
    getBlockedUserIds(admin, uidB),
  ]);
  return {
    blockedByMe: aBlocked.ids.includes(uidB),
    blockedByOther: bBlocked.ids.includes(uidA),
  };
}

async function getClearedChatMap(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  userId: string
): Promise<{ rowId: string | null; map: Record<string, string> }> {
  const { data } = await admin
    .from('documents')
    .select('id, file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', userId)
    .eq('title', 'CHAT_CLEARED_MAP')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { rowId: null, map: {} };
  try {
    const parsed = JSON.parse(data.file_url || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const cleanMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === 'string' && typeof v === 'string' && v) {
          cleanMap[k] = v;
        }
      }
      return { rowId: data.id, map: cleanMap };
    }
    return { rowId: data.id, map: {} };
  } catch {
    return { rowId: data.id, map: {} };
  }
}

async function saveClearedChatMap(
  admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>,
  userId: string,
  rowId: string | null,
  map: Record<string, string>
) {
  const serialized = JSON.stringify(map);
  if (rowId) {
    const { error } = await admin.from('documents').update({ file_url: serialized }).eq('id', rowId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from('documents').insert({
      entity_type: 'general',
      entity_id: userId,
      title: 'CHAT_CLEARED_MAP',
      file_url: serialized,
      uploaded_by: userId,
    });
    if (error) throw new Error(error.message);
  }
}

router.get('/chats/status', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  try {
    const chatsOpen = await getChatsOpen(admin);
    return res.json({ chatsOpen });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to read chat status' });
  }
});

router.put('/chats/status', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  try {
    const open = Boolean((req.body as { open?: boolean })?.open);
    const updated = await setChatsOpen(admin, open);
    await logActivity(
      req.user!,
      updated ? 'CHATS_OPENED' : 'CHATS_CLOSED',
      'chats',
      '1',
      `Super Admin turned portal chats ${updated ? 'ON' : 'OFF'}`,
      req.ip
    );
    return res.json({ chatsOpen: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update chat status' });
  }
});

router.get('/chats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const uid = req.user!.id;
    const allowedRoles = getAllowedContactRoleSlugs(req.user!.role_slug);

    const [{ data: contactsRaw }, { data: myPartRows }, hiddenMeta, blockedMeta, blockedMeSet, clearedMeta] =
      await Promise.all([
        admin
          .from('profiles')
          .select('id, full_name, username, mobile, photo_url, roles!inner(name, slug)')
          .neq('id', uid)
          .eq('status', 'active')
          .is('deleted_at', null)
          .in('roles.slug', allowedRoles)
          .order('full_name', { ascending: true }),
        admin.from('conversation_participants').select('conversation_id, last_read_at').eq('user_id', uid),
        getHiddenContactIds(admin, uid),
        getBlockedUserIds(admin, uid),
        getUsersBlockingMe(admin, uid),
        getClearedChatMap(admin, uid),
      ]);

    const hiddenContactSet = new Set(hiddenMeta.ids);
    const blockedSet = new Set(blockedMeta.ids);

    let blockedUsers: any[] = [];
    if (blockedMeta.ids.length > 0) {
      const { data: blockedRaw } = await admin
        .from('profiles')
        .select('id, full_name, username, mobile, photo_url, roles(name, slug)')
        .in('id', blockedMeta.ids)
        .is('deleted_at', null);
      const blockedResolved = await resolveStorageUrlsInRows(blockedRaw || [], ['photo_url']);
      blockedUsers = blockedResolved.map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        username: c.username,
        mobile: c.mobile || '',
        role_name: c.roles?.name || '',
        role_slug: c.roles?.slug || '',
        photo_url: c.photo_url || '',
        is_blocked: true,
      }));
    }

    const contactsResolved = await resolveStorageUrlsInRows(
      (contactsRaw || []).filter((c: any) => !hiddenContactSet.has(c.id)),
      ['photo_url']
    );
    const contacts = contactsResolved.map((c: any) => ({
      id: c.id,
      full_name: c.full_name,
      username: c.username,
      mobile: c.mobile || '',
      role_name: c.roles?.name || '',
      role_slug: c.roles?.slug || '',
      photo_url: c.photo_url || '',
      is_blocked: blockedSet.has(c.id),
    }));

    const convIds = (myPartRows || []).map((p) => p.conversation_id);
    if (!convIds.length) return res.json({ conversations: [], contacts, blockedUsers });

    const [{ data: convs }, { data: allParticipants }, { data: recentMsgs }] = await Promise.all([
      admin.from('conversations').select('*').in('id', convIds),
      admin
        .from('conversation_participants')
        .select('conversation_id, user_id, profiles(full_name, username, mobile, photo_url, roles(name, slug))')
        .in('conversation_id', convIds),
      admin
        .from('messages')
        .select('id, conversation_id, sender_id, content, attachment_name, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
    ]);

    const myLastReadMap = new Map((myPartRows || []).map((p) => [p.conversation_id, p.last_read_at]));
    const rawParticipants = (allParticipants || []).map((p: any) => ({
      conversation_id: p.conversation_id,
      user_id: p.user_id,
      full_name: p.profiles?.full_name || '',
      username: p.profiles?.username || '',
      mobile: p.profiles?.mobile || '',
      photo_url: p.profiles?.photo_url || '',
      role_name: p.profiles?.roles?.name || '',
      role_slug: p.profiles?.roles?.slug || '',
    }));
    const participants = await resolveStorageUrlsInRows(rawParticipants, ['photo_url']);

    const conversations = (convs || [])
      .map((conv: any) => {
        const clearedAt = clearedMeta.map[conv.id] || '';
        const clearedTs = clearedAt ? new Date(clearedAt).getTime() : 0;
        const msgs = (recentMsgs || []).filter((m) => {
          if (m.conversation_id !== conv.id) return false;
          if (!clearedTs) return true;
          return new Date(m.created_at).getTime() > clearedTs;
        });
        const lastMsg = msgs[0];
        const lastReadRaw = myLastReadMap.get(conv.id);
        const lastReadTs = lastReadRaw ? new Date(lastReadRaw).getTime() : 0;
        const unread_count = msgs.filter(
          (m) => m.sender_id !== uid && new Date(m.created_at).getTime() > lastReadTs
        ).length;
        const convParts = participants.filter((p) => p.conversation_id === conv.id);
        const other = convParts.find((p) => p.user_id !== uid);
        const is_personal_channel = convParts.length === 1 && convParts[0]?.user_id === uid;
        const otherId = other?.user_id || '';
        const blocked_by_me = Boolean(!is_personal_channel && conv.type === 'private' && otherId && blockedSet.has(otherId));
        const blocked_by_other = Boolean(!is_personal_channel && conv.type === 'private' && otherId && blockedMeSet.has(otherId));
        const display_title = is_personal_channel
          ? conv.title || 'My Personal Channel'
          : conv.type === 'private' && !conv.title
            ? other
              ? other.full_name
              : 'Direct Message'
            : conv.title || 'Group Conversation';
        return {
          ...conv,
          is_personal_channel,
          other_user: other ? { ...other, id: other.user_id, is_blocked: blocked_by_me } : null,
          blocked_by_me,
          blocked_by_other,
          last_message: lastMsg?.content || (lastMsg?.attachment_name ? `📎 ${lastMsg.attachment_name}` : ''),
          last_message_at: lastMsg?.created_at || conv.created_at,
          unread_count,
          participants: convParts,
          display_title,
        };
      })
      .sort((a: any, b: any) => String(b.last_message_at).localeCompare(String(a.last_message_at)));

    return res.json({ conversations, contacts, blockedUsers });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load chats' });
  }
});

// Connect / find registered active portal users by Contact Number, Username, or Name
router.get('/chats/lookup', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }

    const rawQ = String(req.query.q || req.query.phone || '').trim();
    if (!rawQ) return res.json({ matches: [] });

    const uid = req.user!.id;
    const digits = rawQ.replace(/\D/g, '');
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
    const qLower = rawQ.toLowerCase();

    const { data: allActiveRaw } = await admin
      .from('profiles')
      .select('id, full_name, username, mobile, user_code, photo_url, roles(name, slug)')
      .neq('id', uid)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('full_name', { ascending: true });

    const extraPhonesByUserId = new Map<string, string>();
    if (digits.length >= 4) {
      const [{ data: stRows }, { data: trRows }, { data: prRows }] = await Promise.all([
        admin.from('students').select('user_id, mobile').not('user_id', 'is', null).is('deleted_at', null),
        admin.from('teachers').select('user_id, mobile').not('user_id', 'is', null).is('deleted_at', null),
        admin.from('parents').select('user_id, mobile').not('user_id', 'is', null).is('deleted_at', null),
      ]);
      for (const row of [...(stRows || []), ...(trRows || []), ...(prRows || [])]) {
        if (row.user_id && row.mobile && !extraPhonesByUserId.has(row.user_id)) {
          extraPhonesByUserId.set(row.user_id, String(row.mobile));
        }
      }
    }

    const matchedRaw = (allActiveRaw || []).filter((p: any) => {
      const profileDigits = String(p.mobile || '').replace(/\D/g, '');
      const linkedDigits = String(extraPhonesByUserId.get(p.id) || '').replace(/\D/g, '');
      if (digits.length >= 4) {
        const pMatch =
          profileDigits &&
          (profileDigits === digits ||
            (last10.length >= 6 && profileDigits.endsWith(last10)) ||
            profileDigits.includes(digits));
        const lMatch =
          linkedDigits &&
          (linkedDigits === digits ||
            (last10.length >= 6 && linkedDigits.endsWith(last10)) ||
            linkedDigits.includes(digits));
        if (pMatch || lMatch) return true;
      }
      if (
        String(p.username || '').toLowerCase().includes(qLower) ||
        String(p.user_code || '').toLowerCase().includes(qLower) ||
        String(p.full_name || '').toLowerCase().includes(qLower)
      ) {
        return true;
      }
      return false;
    });

    const resolved = await resolveStorageUrlsInRows(matchedRaw.slice(0, 25), ['photo_url']);
    const matches = resolved.map((c: any) => ({
      id: c.id,
      full_name: c.full_name,
      username: c.username,
      mobile: c.mobile || extraPhonesByUserId.get(c.id) || '',
      role_name: c.roles?.name || '',
      role_slug: c.roles?.slug || '',
      photo_url: c.photo_url || '',
    }));

    return res.json({ matches });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Contact lookup failed' });
  }
});

// 24-Hour WhatsApp-style Status Updates (stored in public.documents)
const CHAT_STATUS_ENTITY_ID = '00000000-0000-0000-0000-000000000002';

router.get('/chats/statuses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }

    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await admin
      .from('documents')
      .select('id, file_url, uploaded_by, created_at, profiles:uploaded_by(full_name, username, photo_url, roles(name))')
      .eq('entity_type', 'general')
      .eq('title', 'CHAT_STATUS')
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false });

    const statuses: any[] = [];
    for (const r of rows || []) {
      let payload: any = {};
      try {
        payload = JSON.parse(r.file_url || '{}');
      } catch {
        payload = { text: r.file_url || '' };
      }
      const imageUrl = payload.image_url ? await resolveStorageUrl(payload.image_url) : '';
      const authorPhoto = (r as any).profiles?.photo_url ? await resolveStorageUrl((r as any).profiles.photo_url) : '';
      statuses.push({
        id: r.id,
        user_id: r.uploaded_by,
        author_name: (r as any).profiles?.full_name || 'Portal User',
        author_username: (r as any).profiles?.username || '',
        author_role: (r as any).profiles?.roles?.name || '',
        author_photo: authorPhoto,
        text: payload.text || '',
        image_url: imageUrl,
        bg_color: payload.bg_color || '#008069',
        created_at: r.created_at,
      });
    }

    return res.json({ statuses });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load statuses' });
  }
});

router.post('/chats/statuses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }

    const { text, image_url, bg_color } = req.body as {
      text?: string;
      image_url?: string;
      bg_color?: string;
    };

    const cleanText = String(text || '').trim();
    const cleanImage = normalizeStorageRef(image_url);
    if (!cleanText && !cleanImage) {
      return res.status(400).json({ error: 'Status text or photo is required.' });
    }

    const payloadJson = JSON.stringify({
      text: cleanText,
      image_url: cleanImage,
      bg_color: bg_color || '#008069',
    });

    const { data: created, error } = await admin
      .from('documents')
      .insert({
        entity_type: 'general',
        entity_id: CHAT_STATUS_ENTITY_ID,
        title: 'CHAT_STATUS',
        file_url: payloadJson,
        file_type: 'chat_status',
        uploaded_by: req.user!.id,
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to post status' });
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to post status' });
  }
});

router.delete('/chats/statuses/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;

    const { data: existing } = await admin
      .from('documents')
      .select('id, uploaded_by')
      .eq('id', id)
      .eq('title', 'CHAT_STATUS')
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: 'Status not found' });
    if (existing.uploaded_by !== req.user!.id && req.user!.role_slug !== 'super_admin') {
      return res.status(403).json({ error: 'You can only delete your own status.' });
    }

    const { error } = await admin.from('documents').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to delete status' });
  }
});

router.get('/chats/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const convId = req.params.id;
    const uid = req.user!.id;
    const { data: isPart } = await admin.from('conversation_participants').select('id').eq('conversation_id', convId).eq('user_id', uid).maybeSingle();
    if (!isPart) return res.status(403).json({ error: 'Access denied to this conversation' });

    const [{ data: msgsRaw }, { data: metaRows }, { data: partRows }, { data: convMeta }, clearedMeta] =
      await Promise.all([
        admin
          .from('messages')
          .select('*, profiles(full_name, roles(name))')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true }),
        admin
          .from('documents')
          .select('file_type, file_url, created_at')
          .eq('entity_type', 'general')
          .eq('entity_id', convId)
          .eq('title', 'CHAT_MSG_META')
          .order('created_at', { ascending: true }),
        admin
          .from('conversation_participants')
          .select('user_id, last_read_at')
          .eq('conversation_id', convId),
        admin.from('conversations').select('id, type').eq('id', convId).maybeSingle(),
        getClearedChatMap(admin, uid),
      ]);

    const latestMsgTs = (msgsRaw || []).reduce((maxTs: number, m: any) => {
      const ts = m.created_at ? new Date(m.created_at).getTime() : 0;
      return ts > maxTs ? ts : maxTs;
    }, 0);
    const readIso = new Date(Math.max(Date.now(), latestMsgTs + 1)).toISOString();

    await Promise.all([
      admin
        .from('conversation_participants')
        .update({ last_read_at: readIso })
        .eq('conversation_id', convId)
        .eq('user_id', uid),
      admin
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', uid)
        .eq('link_module', 'chats')
        .eq('reference_id', convId)
        .eq('is_read', false),
    ]);

    const clearedAt = clearedMeta.map[convId] || '';
    const clearedTs = clearedAt ? new Date(clearedAt).getTime() : 0;
    const visibleMsgsRaw = clearedTs
      ? (msgsRaw || []).filter((m: any) => new Date(m.created_at).getTime() > clearedTs)
      : msgsRaw || [];

    const metaMap = new Map<string, ChatMsgMeta>();
    for (const row of metaRows || []) {
      if (row.file_type) {
        metaMap.set(row.file_type, parseMsgMeta(row.file_url));
      }
    }

    const participantsList = (partRows || []).map((p: any) => ({
      user_id: String(p.user_id || ''),
      read_ts: p.last_read_at ? new Date(p.last_read_at).getTime() : 0,
    }));

    const otherPart = participantsList.find((p) => p.user_id && p.user_id !== uid);
    let blocked_by_me = false;
    let blocked_by_other = false;
    if (convMeta?.type === 'private' && otherPart?.user_id) {
      const blk = await isBlockedBetween(admin, uid, otherPart.user_id);
      blocked_by_me = blk.blockedByMe;
      blocked_by_other = blk.blockedByOther;
    }

    const resolved = await resolveStorageUrlsInRows(visibleMsgsRaw, ['attachment_url']);
    const messages = resolved.map((m: any) => {
      const meta = metaMap.get(m.id) || { edited_at: null, reactions: {} };
      const msgTs = m.created_at ? new Date(m.created_at).getTime() : 0;
      const otherReaders = participantsList.filter((p) => p.user_id && p.user_id !== m.sender_id);
      const isSeen =
        otherReaders.length > 0 && otherReaders.some((p) => p.read_ts > 0 && p.read_ts >= msgTs);
      return {
        ...m,
        sender_name: m.profiles?.full_name || '',
        sender_role: m.profiles?.roles?.name || '',
        edited_at: meta.edited_at,
        reactions: formatReactionsList(meta.reactions, uid),
        is_seen: isSeen,
      };
    });

    return res.json({ messages, blocked_by_me, blocked_by_other });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load messages' });
  }
});

router.post('/chats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const uid = req.user!.id;
    const { title, type, participant_ids, initial_message, is_personal, connect_by_phone } = req.body as {
      title?: string;
      type?: 'private' | 'group' | 'channel';
      participant_ids?: string[];
      initial_message?: string;
      is_personal?: boolean;
      connect_by_phone?: boolean;
    };

    const personalChannel = Boolean(is_personal || type === 'channel');
    const cleanTitle = (title || '').trim();

    if (personalChannel) {
      const channelTitle = cleanTitle || 'My Personal Channel';
      const { data: createdConv, error: convErr } = await admin
        .from('conversations')
        .insert({ title: channelTitle, type: 'group', created_by: uid })
        .select('id')
        .single();
      if (convErr || !createdConv) return res.status(500).json({ error: 'Failed to create personal channel' });

      await admin.from('conversation_participants').insert({ conversation_id: createdConv.id, user_id: uid });
      if (initial_message?.trim()) {
        await admin.from('messages').insert({
          conversation_id: createdConv.id,
          sender_id: uid,
          content: initial_message.trim(),
        });
      }
      return res.status(201).json({ id: createdConv.id, is_personal_channel: true });
    }

    const uniqueIds = Array.from(new Set([uid, ...(participant_ids || [])]));
    if (uniqueIds.length < 2) return res.status(400).json({ error: 'Select at least one recipient.' });

    const allowedSlugs = getAllowedContactRoleSlugs(req.user!.role_slug);
    const otherIds = uniqueIds.filter((id) => id !== uid);

    const { data: targets } = await admin
      .from('profiles')
      .select('id, status, deleted_at, roles(slug)')
      .in('id', otherIds);
    for (const oid of otherIds) {
      const t = (targets || []).find((x: any) => x.id === oid) as any;
      if (!t || t.status !== 'active' || t.deleted_at) {
        return res.status(404).json({ error: 'Selected user account is not active.' });
      }
      const allowViaPhone = Boolean(connect_by_phone && (type || 'private') === 'private' && otherIds.length === 1);
      if (!allowViaPhone && (!t?.roles?.slug || !allowedSlugs.includes(t.roles.slug))) {
        return res.status(403).json({ error: 'Role-based messaging policy restricts contacting one of the selected users.' });
      }
    }

    // Reconnecting with a contact restores them into the user's Contacts list if previously removed
    if (otherIds.length > 0) {
      const hiddenMeta = await getHiddenContactIds(admin, uid);
      if (hiddenMeta.ids.some((hid) => otherIds.includes(hid))) {
        await saveHiddenContactIds(
          admin,
          uid,
          hiddenMeta.rowId,
          hiddenMeta.ids.filter((hid) => !otherIds.includes(hid))
        );
      }
    }

    if ((type || 'private') === 'private' && otherIds.length === 1) {
      const otherId = otherIds[0];
      const blk = await isBlockedBetween(admin, uid, otherId);
      const [{ data: myConvs }, { data: otherConvs }] = await Promise.all([
        admin.from('conversation_participants').select('conversation_id').eq('user_id', uid),
        admin.from('conversation_participants').select('conversation_id').eq('user_id', otherId),
      ]);
      const otherSet = new Set((otherConvs || []).map((c) => c.conversation_id));
      const sharedIds = (myConvs || []).map((c) => c.conversation_id).filter((id) => otherSet.has(id));
      if (sharedIds.length) {
        const { data: existingPriv } = await admin.from('conversations').select('id').in('id', sharedIds).eq('type', 'private').limit(1).maybeSingle();
        if (existingPriv) {
          if (initial_message) {
            if (blk.blockedByMe) {
              return res.status(403).json({ error: 'You blocked this contact. Unblock them first to send messages.' });
            }
            if (blk.blockedByOther) {
              return res.status(403).json({ error: 'You cannot send messages to this contact.' });
            }
            await admin.from('messages').insert({ conversation_id: existingPriv.id, sender_id: uid, content: initial_message });
            await createNotification(otherId, 'message', 'New Message', `${req.user!.full_name}: ${initial_message.slice(0, 80)}`, 'chats', existingPriv.id);
          }
          return res.json({ id: existingPriv.id });
        }
      }
      if (blk.blockedByMe) {
        return res.status(403).json({ error: 'You blocked this contact. Unblock them first to start a chat.' });
      }
      if (blk.blockedByOther) {
        return res.status(403).json({ error: 'You cannot start a chat with this contact.' });
      }
    }

    const dbType = type === 'group' ? 'group' : 'private';
    const { data: createdConv, error: convErr } = await admin
      .from('conversations')
      .insert({ title: cleanTitle, type: dbType, created_by: uid })
      .select('id')
      .single();
    if (convErr || !createdConv) return res.status(500).json({ error: 'Failed to create conversation' });

    await admin.from('conversation_participants').insert(
      uniqueIds.map((pid) => ({
        conversation_id: createdConv.id,
        user_id: pid,
        last_read_at: pid === uid ? new Date().toISOString() : new Date(0).toISOString(),
      }))
    );
    if (initial_message) {
      await admin.from('messages').insert({ conversation_id: createdConv.id, sender_id: uid, content: initial_message });
      for (const oid of otherIds) {
        await createNotification(oid, 'message', 'New Message', `${req.user!.full_name}: ${initial_message.slice(0, 80)}`, 'chats', createdConv.id);
      }
    }
    return res.status(201).json({ id: createdConv.id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to create conversation' });
  }
});

router.post('/chats/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const convId = req.params.id;
    const uid = req.user!.id;
    const { data: isPart } = await admin.from('conversation_participants').select('id').eq('conversation_id', convId).eq('user_id', uid).maybeSingle();
    if (!isPart) return res.status(403).json({ error: 'Access denied' });

    const { content, attachment_url, attachment_name } = req.body as { content?: string; attachment_url?: string; attachment_name?: string };
    if (!content && !attachment_url) return res.status(400).json({ error: 'Message text or attachment required' });

    const [{ data: convMeta }, { data: others }] = await Promise.all([
      admin.from('conversations').select('type').eq('id', convId).maybeSingle(),
      admin.from('conversation_participants').select('user_id').eq('conversation_id', convId).neq('user_id', uid),
    ]);

    if (convMeta?.type === 'private' && (others || []).length === 1) {
      const blk = await isBlockedBetween(admin, uid, others![0].user_id);
      if (blk.blockedByMe) {
        return res.status(403).json({ error: 'You blocked this contact. Unblock them to send messages.' });
      }
      if (blk.blockedByOther) {
        return res.status(403).json({ error: 'You cannot send messages to this contact.' });
      }
    }

    const { data: createdMsg, error } = await admin
      .from('messages')
      .insert({
        conversation_id: convId,
        sender_id: uid,
        content: content || '',
        attachment_url: normalizeStorageRef(attachment_url),
        attachment_name: attachment_name || '',
      })
      .select('id')
      .single();
    if (error || !createdMsg) return res.status(400).json({ error: error?.message || 'Failed to send message' });

    await Promise.all([
      admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId),
      admin.from('conversation_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', convId).eq('user_id', uid),
    ]);

    for (const o of others || []) {
      await createNotification(o.user_id, 'message', 'New Message', `${req.user!.full_name}: ${(content || attachment_name || 'Attachment').slice(0, 80)}`, 'chats', convId);
    }
    return res.status(201).json({ id: createdMsg.id, is_seen: false });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to send message' });
  }
});

router.put('/chats/:id/messages/:messageId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const { id: convId, messageId } = req.params;
    const uid = req.user!.id;

    const { data: isPart } = await admin.from('conversation_participants').select('id').eq('conversation_id', convId).eq('user_id', uid).maybeSingle();
    if (!isPart) return res.status(403).json({ error: 'Access denied' });

    const { data: msgRow } = await admin
      .from('messages')
      .select('id, sender_id, attachment_url')
      .eq('id', messageId)
      .eq('conversation_id', convId)
      .maybeSingle();

    if (!msgRow) return res.status(404).json({ error: 'Message not found' });
    if (msgRow.sender_id !== uid) {
      return res.status(403).json({ error: 'You can only edit your own messages.' });
    }

    const cleanContent = String((req.body as { content?: string })?.content || '').trim();
    if (!cleanContent && !msgRow.attachment_url) {
      return res.status(400).json({ error: 'Message text cannot be empty.' });
    }

    const { error } = await admin
      .from('messages')
      .update({ content: cleanContent })
      .eq('id', messageId)
      .eq('conversation_id', convId);
    if (error) return res.status(400).json({ error: error.message });

    const existingRow = await getMsgMetaRow(admin, convId, messageId);
    const meta = parseMsgMeta(existingRow?.file_url);
    const editedAt = new Date().toISOString();
    meta.edited_at = editedAt;
    await saveMsgMeta(admin, convId, messageId, meta, uid);
    await admin.from('conversations').update({ updated_at: editedAt }).eq('id', convId);

    return res.json({ success: true, content: cleanContent, edited_at: editedAt });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to edit message' });
  }
});

router.post('/chats/:id/messages/:messageId/react', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const { id: convId, messageId } = req.params;
    const uid = req.user!.id;

    const { data: isPart } = await admin.from('conversation_participants').select('id').eq('conversation_id', convId).eq('user_id', uid).maybeSingle();
    if (!isPart) return res.status(403).json({ error: 'Access denied' });

    const { data: msgRow } = await admin
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .eq('conversation_id', convId)
      .maybeSingle();
    if (!msgRow) return res.status(404).json({ error: 'Message not found' });

    const emoji = String((req.body as { emoji?: string })?.emoji || '').trim();
    if (!emoji || emoji.length > 24) {
      return res.status(400).json({ error: 'Valid reaction emoji is required.' });
    }

    const existingRow = await getMsgMetaRow(admin, convId, messageId);
    const meta = parseMsgMeta(existingRow?.file_url);

    const alreadyReactedThis = (meta.reactions[emoji] || []).includes(uid);
    // Remove user's previous reaction from any emoji on this message (WhatsApp single-reaction-per-user toggle)
    for (const [key, users] of Object.entries(meta.reactions)) {
      const filtered = users.filter((id) => id !== uid);
      if (filtered.length) {
        meta.reactions[key] = filtered;
      } else {
        delete meta.reactions[key];
      }
    }
    if (!alreadyReactedThis) {
      meta.reactions[emoji] = [...(meta.reactions[emoji] || []), uid];
    }

    await saveMsgMeta(admin, convId, messageId, meta, uid);
    return res.json({ reactions: formatReactionsList(meta.reactions, uid) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to update reaction' });
  }
});

router.delete('/chats/:id/messages/:messageId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const { id: convId, messageId } = req.params;
    const uid = req.user!.id;

    const { data: isPart } = await admin.from('conversation_participants').select('id').eq('conversation_id', convId).eq('user_id', uid).maybeSingle();
    if (!isPart && req.user!.role_slug !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: msgRow } = await admin
      .from('messages')
      .select('id, sender_id, conversation_id')
      .eq('id', messageId)
      .eq('conversation_id', convId)
      .maybeSingle();

    if (!msgRow) return res.status(404).json({ error: 'Message not found' });
    if (msgRow.sender_id !== uid && req.user!.role_slug !== 'super_admin') {
      return res.status(403).json({ error: 'You can only delete your own messages.' });
    }

    const { error } = await admin.from('messages').delete().eq('id', messageId).eq('conversation_id', convId);
    if (error) return res.status(400).json({ error: error.message });

    await admin
      .from('documents')
      .delete()
      .eq('entity_type', 'general')
      .eq('entity_id', convId)
      .eq('title', 'CHAT_MSG_META')
      .eq('file_type', messageId);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to delete message' });
  }
});

router.post('/chats/clear-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const uid = req.user!.id;
    const { data: myPartRows } = await admin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', uid);

    const convIds = (myPartRows || []).map((p: any) => p.conversation_id).filter(Boolean);
    if (!convIds.length) return res.json({ success: true, clearedCount: 0 });

    const [{ data: convs }, { data: allParts }, clearedMeta] = await Promise.all([
      admin.from('conversations').select('id, created_by').in('id', convIds),
      admin.from('conversation_participants').select('conversation_id, user_id').in('conversation_id', convIds),
      getClearedChatMap(admin, uid),
    ]);

    const nowIso = new Date().toISOString();
    const nextMap = { ...clearedMeta.map };

    for (const conv of convs || []) {
      const parts = (allParts || []).filter((p: any) => p.conversation_id === conv.id);
      const isPersonal = parts.length === 1 && parts[0]?.user_id === uid && conv.created_by === uid;
      if (isPersonal) {
        await admin
          .from('documents')
          .delete()
          .eq('entity_type', 'general')
          .eq('entity_id', conv.id)
          .eq('title', 'CHAT_MSG_META');
        await admin.from('messages').delete().eq('conversation_id', conv.id);
      } else {
        nextMap[conv.id] = nowIso;
      }
    }

    await saveClearedChatMap(admin, uid, clearedMeta.rowId, nextMap);
    return res.json({ success: true, clearedCount: convIds.length });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to clear all chats' });
  }
});

router.post('/chats/contacts/:contactId/block', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const uid = req.user!.id;
    const contactId = String(req.params.contactId || '').trim();
    if (!contactId || contactId === uid) {
      return res.status(400).json({ error: 'Valid contact ID is required.' });
    }
    const blockedMeta = await getBlockedUserIds(admin, uid);
    if (!blockedMeta.ids.includes(contactId)) {
      await saveBlockedUserIds(admin, uid, blockedMeta.rowId, [...blockedMeta.ids, contactId]);
    }
    return res.json({ success: true, blocked: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to block contact' });
  }
});

router.post('/chats/contacts/:contactId/unblock', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const uid = req.user!.id;
    const contactId = String(req.params.contactId || '').trim();
    if (!contactId || contactId === uid) {
      return res.status(400).json({ error: 'Valid contact ID is required.' });
    }
    const blockedMeta = await getBlockedUserIds(admin, uid);
    if (blockedMeta.ids.includes(contactId)) {
      await saveBlockedUserIds(
        admin,
        uid,
        blockedMeta.rowId,
        blockedMeta.ids.filter((id) => id !== contactId)
      );
    }
    return res.json({ success: true, blocked: false });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to unblock contact' });
  }
});

router.delete('/chats/contacts/:contactId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const uid = req.user!.id;
    const contactId = String(req.params.contactId || '').trim();
    if (!contactId || contactId === uid) {
      return res.status(400).json({ error: 'Valid contact ID is required.' });
    }

    const hiddenMeta = await getHiddenContactIds(admin, uid);
    if (!hiddenMeta.ids.includes(contactId)) {
      await saveHiddenContactIds(admin, uid, hiddenMeta.rowId, [...hiddenMeta.ids, contactId]);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to delete contact' });
  }
});

router.post('/chats/:id/clear', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const convId = req.params.id;
    const uid = req.user!.id;

    const [{ data: conv }, { data: parts }] = await Promise.all([
      admin.from('conversations').select('id, created_by').eq('id', convId).maybeSingle(),
      admin.from('conversation_participants').select('user_id').eq('conversation_id', convId),
    ]);
    if (!conv) return res.status(404).json({ error: 'Chat not found' });

    const isParticipant = (parts || []).some((p: any) => p.user_id === uid);
    if (!isParticipant) return res.status(403).json({ error: 'Access denied to this conversation.' });

    const isPersonal = (parts || []).length === 1 && parts?.[0]?.user_id === uid && conv.created_by === uid;
    if (isPersonal) {
      await admin
        .from('documents')
        .delete()
        .eq('entity_type', 'general')
        .eq('entity_id', convId)
        .eq('title', 'CHAT_MSG_META');
      await admin.from('messages').delete().eq('conversation_id', convId);
    } else {
      const clearedMeta = await getClearedChatMap(admin, uid);
      await saveClearedChatMap(admin, uid, clearedMeta.rowId, {
        ...clearedMeta.map,
        [convId]: new Date().toISOString(),
      });
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to clear chat' });
  }
});

router.delete('/chats/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (req.user!.role_slug !== 'super_admin' && !(await getChatsOpen(admin))) {
      return res.status(403).json({ error: 'Chat is currently turned off by Super Admin.' });
    }
    const convId = req.params.id;
    const uid = req.user!.id;

    const [{ data: conv }, { data: parts }] = await Promise.all([
      admin.from('conversations').select('id, created_by, type').eq('id', convId).maybeSingle(),
      admin.from('conversation_participants').select('user_id').eq('conversation_id', convId),
    ]);

    if (!conv) return res.status(404).json({ error: 'Chat not found' });
    const isParticipant = (parts || []).some((p: any) => p.user_id === uid);
    if (!isParticipant && req.user!.role_slug !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied to this conversation.' });
    }

    const isPersonal = (parts || []).length === 1 && parts?.[0]?.user_id === uid && conv.created_by === uid;
    if (isPersonal) {
      await admin
        .from('documents')
        .delete()
        .eq('entity_type', 'general')
        .eq('entity_id', convId)
        .eq('title', 'CHAT_MSG_META');

      const { error } = await admin.from('conversations').delete().eq('id', convId);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true, deletedAll: true });
    }

    // Remove this user from conversation_participants (WhatsApp-style Delete Chat for me)
    const { error: partErr } = await admin
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', convId)
      .eq('user_id', uid);
    if (partErr) return res.status(400).json({ error: partErr.message });

    const { count: remainingCount } = await admin
      .from('conversation_participants')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', convId);

    if (!remainingCount || remainingCount === 0) {
      await admin
        .from('documents')
        .delete()
        .eq('entity_type', 'general')
        .eq('entity_id', convId)
        .eq('title', 'CHAT_MSG_META');
      await admin.from('messages').delete().eq('conversation_id', convId);
      await admin.from('conversations').delete().eq('id', convId);
    }

    return res.json({ success: true, deletedAll: !remainingCount });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to delete chat' });
  }
});

// ==================== NOTICES ====================
router.get('/notices', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const user = req.user!;

  const { data: noticesRaw } = await admin
    .from('notices')
    .select('*, classes(name), profiles(full_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  let allowedClassIds: string[] = [];
  let myStudentClassId: string | null = null;
  if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    const cids = pid ? await getParentStudentIds(pid) : [];
    if (cids.length) {
      const { data: sts } = await admin.from('students').select('class_id').in('id', cids);
      allowedClassIds = (sts || []).map((s) => s.class_id).filter(Boolean) as string[];
    }
  } else if (user.role_slug === 'student') {
    const stId = await getStudentIdForUser(user);
    const { data: st } = stId ? await admin.from('students').select('class_id').eq('id', stId).maybeSingle() : { data: null };
    myStudentClassId = st?.class_id || null;
  }

  const filtered = (noticesRaw || []).filter((n: any) => {
    if (user.role_slug === 'public') return n.target_audience === 'all';
    if (user.role_slug === 'teacher') return n.target_audience === 'all' || n.target_audience === 'teachers';
    if (user.role_slug === 'parent') {
      return n.target_audience === 'all' || n.target_audience === 'parents' || (n.target_audience === 'class' && allowedClassIds.includes(n.target_class_id));
    }
    if (user.role_slug === 'student') {
      return n.target_audience === 'all' || n.target_audience === 'students' || (n.target_audience === 'class' && n.target_class_id === myStudentClassId);
    }
    return true;
  });

  const resolved = await resolveStorageUrlsInRows(filtered, ['attachment_url']);
  const notices = resolved.map((n: any) => ({
    ...n,
    class_name: n.classes?.name || '',
    author_name: n.profiles?.full_name || 'Administration',
  }));
  return res.json({ notices });
});

router.post('/notices', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { title, description, category, publish_date, expiry_date, attachment_url, attachment_name, target_audience, target_class_id } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Notice title and description are required.' });

    const { data: created, error } = await admin
      .from('notices')
      .insert({
        title: title.trim(),
        description: description.trim(),
        category: category || 'General',
        publish_date: publish_date || new Date().toISOString().slice(0, 10),
        expiry_date: expiry_date || '',
        attachment_url: normalizeStorageRef(attachment_url),
        attachment_name: attachment_name || '',
        target_audience: target_audience || 'all',
        target_class_id: target_class_id || null,
        created_by: req.user!.id,
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to publish notice' });
    const aud = target_audience || 'all';
    const rolesToNotify =
      aud === 'teachers' ? ['teacher'] : aud === 'parents' ? ['parent'] : aud === 'students' ? ['student'] : ['super_admin', 'teacher', 'parent', 'student', 'committee_member'];
    await notifyRoles(rolesToNotify, 'notice', 'New Notice Published', title.trim(), 'notices', created.id);
    await logActivity(req.user!, 'NOTICE_PUBLISHED', 'notices', created.id, `Published notice: ${title}`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to publish notice' });
  }
});

router.put('/notices/:id', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { title, description, category, publish_date, expiry_date, attachment_url, attachment_name, target_audience, target_class_id } = req.body;
  const payload: Record<string, any> = {};
  if (title !== undefined) payload.title = title;
  if (description !== undefined) payload.description = description;
  if (category !== undefined) payload.category = category;
  if (publish_date !== undefined) payload.publish_date = publish_date;
  if (expiry_date !== undefined) payload.expiry_date = expiry_date;
  if (attachment_url !== undefined) payload.attachment_url = normalizeStorageRef(attachment_url);
  if (attachment_name !== undefined) payload.attachment_name = attachment_name;
  if (target_audience !== undefined) payload.target_audience = target_audience;
  if (target_class_id !== undefined) payload.target_class_id = target_class_id || null;

  const { error } = await admin.from('notices').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'NOTICE_UPDATED', 'notices', id, `Updated notice ${id}`, req.ip);
  return res.json({ success: true });
});

router.delete('/notices/:id', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('notices').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'NOTICE_DELETED', 'notices', id, `Deleted notice ${id}`, req.ip);
  return res.json({ success: true });
});

// ==================== PROGRAMS & EVENTS ====================
interface ProgramMetaPayload {
  poster_url: string;
  end_date: string;
  end_time: string;
  whatsapp_number: string;
  whatsapp_channel_name: string;
  whatsapp_channel_link: string;
  registration_enabled: boolean;
  payment_required: boolean;
  payment_amount: number;
  payment_instructions: string;
  sent_to_feed_count?: number;
  last_sent_to_feed_at?: string;
}

function defaultProgramMeta(): ProgramMetaPayload {
  return {
    poster_url: '',
    end_date: '',
    end_time: '',
    whatsapp_number: '',
    whatsapp_channel_name: '',
    whatsapp_channel_link: '',
    registration_enabled: true,
    payment_required: false,
    payment_amount: 0,
    payment_instructions: '',
    sent_to_feed_count: 0,
    last_sent_to_feed_at: '',
  };
}

function normalizeChannelUrl(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function isMissingColumnError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  return code === 'PGRST204' || code === '42703' || msg.includes('column') || msg.includes('schema cache');
}

async function getProgramMetaMap(
  admin: NonNullable<typeof supabaseAdmin>,
  programIds: string[]
): Promise<Map<string, ProgramMetaPayload>> {
  const map = new Map<string, ProgramMetaPayload>();
  if (!programIds.length) return map;

  const { data: docs } = await admin
    .from('documents')
    .select('entity_id, file_url, created_at')
    .eq('entity_type', 'general')
    .eq('title', 'PROGRAM_META')
    .in('entity_id', programIds)
    .order('created_at', { ascending: false });

  for (const doc of docs || []) {
    const pid = String(doc.entity_id || '');
    if (!pid || map.has(pid)) continue;
    try {
      const parsed = JSON.parse(doc.file_url || '{}');
      const posterUrl = parsed?.poster_url ? await resolveStorageUrl(String(parsed.poster_url)) : '';
      map.set(pid, {
        poster_url: posterUrl,
        end_date: String(parsed?.end_date || ''),
        end_time: String(parsed?.end_time || ''),
        whatsapp_number: String(parsed?.whatsapp_number || ''),
        whatsapp_channel_name: String(parsed?.whatsapp_channel_name || ''),
        whatsapp_channel_link: String(parsed?.whatsapp_channel_link || ''),
        registration_enabled: parsed?.registration_enabled !== false,
        payment_required: Boolean(parsed?.payment_required),
        payment_amount: Number(parsed?.payment_amount || 0),
        payment_instructions: String(parsed?.payment_instructions || ''),
        sent_to_feed_count: Number(parsed?.sent_to_feed_count || 0),
        last_sent_to_feed_at: String(parsed?.last_sent_to_feed_at || ''),
      });
    } catch {
      map.set(pid, defaultProgramMeta());
    }
  }
  return map;
}

async function upsertProgramMeta(
  admin: NonNullable<typeof supabaseAdmin>,
  programId: string,
  userId: string,
  meta: ProgramMetaPayload
) {
  const cleanMeta: ProgramMetaPayload = {
    poster_url: normalizeStorageRef(meta.poster_url),
    end_date: String(meta.end_date || '').trim(),
    end_time: String(meta.end_time || '').trim(),
    whatsapp_number: String(meta.whatsapp_number || '').trim(),
    whatsapp_channel_name: String(meta.whatsapp_channel_name || '').trim(),
    whatsapp_channel_link: normalizeChannelUrl(meta.whatsapp_channel_link),
    registration_enabled: meta.registration_enabled !== false,
    payment_required: Boolean(meta.payment_required),
    payment_amount: Boolean(meta.payment_required) ? Math.max(0, Number(meta.payment_amount || 0)) : 0,
    payment_instructions: String(meta.payment_instructions || '').trim(),
    sent_to_feed_count: Number(meta.sent_to_feed_count || 0),
    last_sent_to_feed_at: String(meta.last_sent_to_feed_at || ''),
  };

  await admin
    .from('documents')
    .delete()
    .eq('entity_type', 'general')
    .eq('title', 'PROGRAM_META')
    .eq('entity_id', programId);

  const { error } = await admin.from('documents').insert({
    entity_type: 'general',
    entity_id: programId,
    title: 'PROGRAM_META',
    file_url: JSON.stringify(cleanMeta),
    file_type: 'program_meta',
    uploaded_by: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

router.get('/programs', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { data } = await admin.from('programs').select('*').is('deleted_at', null).order('program_date', { ascending: false });
  const rawList = data || [];
  const programIds = rawList.map((p: any) => String(p.id)).filter(Boolean);

  const [resolved, metaMap, regDocsRes] = await Promise.all([
    resolveStorageUrlsInRows(rawList, ['featured_photo', 'poster_url']),
    getProgramMetaMap(admin, programIds),
    programIds.length
      ? admin
          .from('documents')
          .select('id, entity_id, file_url, uploaded_by, created_at')
          .eq('entity_type', 'general')
          .eq('title', 'PROGRAM_REGISTRATION')
          .in('entity_id', programIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const regCountByProgram = new Map<string, number>();
  const myRegByProgram = new Map<string, any>();
  for (const rdoc of regDocsRes.data || []) {
    const pid = String(rdoc.entity_id || '');
    regCountByProgram.set(pid, (regCountByProgram.get(pid) || 0) + 1);
    if (rdoc.uploaded_by === req.user!.id && !myRegByProgram.has(pid)) {
      try {
        const parsed = JSON.parse(rdoc.file_url || '{}');
        myRegByProgram.set(pid, {
          id: rdoc.id,
          full_name: parsed.full_name || '',
          whatsapp_number: parsed.whatsapp_number || '',
          payment_required: Boolean(parsed.payment_required),
          payment_amount: Number(parsed.payment_amount || 0),
          created_at: rdoc.created_at,
        });
      } catch {
        myRegByProgram.set(pid, { id: rdoc.id, created_at: rdoc.created_at });
      }
    }
  }

  const programs = await Promise.all(
    resolved.map(async (p: any) => {
      let rawGallery: string[] = [];
      try {
        rawGallery = typeof p.gallery_json === 'string' ? JSON.parse(p.gallery_json || '[]') : Array.isArray(p.gallery_json) ? p.gallery_json : [];
      } catch {
        rawGallery = [];
      }
      const resolvedGallery = await Promise.all(rawGallery.map((u) => resolveStorageUrl(u)));
      const meta = metaMap.get(String(p.id)) || defaultProgramMeta();
      return {
        ...p,
        gallery_json: JSON.stringify(resolvedGallery),
        poster_url: p.poster_url || meta.poster_url || '',
        end_date: p.end_date || meta.end_date || p.program_date || '',
        end_time: p.end_time || meta.end_time || '',
        whatsapp_number: p.whatsapp_number || meta.whatsapp_number || '',
        whatsapp_channel_name: p.whatsapp_channel_name || meta.whatsapp_channel_name || '',
        whatsapp_channel_link: p.whatsapp_channel_link || meta.whatsapp_channel_link || '',
        registration_enabled:
          typeof p.registration_enabled === 'boolean' ? p.registration_enabled : meta.registration_enabled,
        payment_required:
          typeof p.payment_required === 'boolean' ? p.payment_required : meta.payment_required,
        payment_amount:
          p.payment_amount !== undefined && p.payment_amount !== null && Number(p.payment_amount) > 0
            ? Number(p.payment_amount)
            : meta.payment_amount,
        payment_instructions: p.payment_instructions || meta.payment_instructions || '',
        sent_to_feed_count: meta.sent_to_feed_count || 0,
        last_sent_to_feed_at: meta.last_sent_to_feed_at || '',
        registrations_count: regCountByProgram.get(String(p.id)) || 0,
        my_registration: myRegByProgram.get(String(p.id)) || null,
      };
    })
  );
  return res.json({ programs });
});

router.post('/programs', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const {
      title,
      description,
      program_date,
      start_time,
      end_date,
      end_time,
      venue,
      category,
      featured_photo,
      gallery_images,
      status,
      poster_url,
      whatsapp_number,
      whatsapp_channel_name,
      whatsapp_channel_link,
      registration_enabled,
      payment_required,
      payment_amount,
      payment_instructions,
    } = req.body;
    if (!title || !program_date) return res.status(400).json({ error: 'Program title and start date are required.' });

    const cleanEndDate = String(end_date || program_date).trim();
    if (cleanEndDate && cleanEndDate < String(program_date).trim()) {
      return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
    }

    const payReq = Boolean(payment_required);
    const fixedAmount = payReq ? Number(payment_amount || 0) : 0;
    if (payReq && (Number.isNaN(fixedAmount) || fixedAmount <= 0)) {
      return res.status(400).json({ error: 'Please enter a valid fixed payment amount greater than 0 when payment is ON.' });
    }

    const cleanChannelLink = normalizeChannelUrl(whatsapp_channel_link);
    const baseInsert = {
      title: title.trim(),
      description: description || '',
      program_date,
      start_time: start_time || '',
      venue: venue || 'Madrasa Gausiya Razvia Campus',
      category: category || 'Religious Gathering',
      featured_photo: normalizeStorageRef(featured_photo),
      gallery_json: Array.isArray(gallery_images) ? gallery_images.map((u: string) => normalizeStorageRef(u)).filter(Boolean) : [],
      status: status || 'upcoming',
      created_by: req.user!.id,
    };

    const extendedInsert = {
      ...baseInsert,
      end_date: cleanEndDate,
      end_time: String(end_time || '').trim(),
      poster_url: normalizeStorageRef(poster_url),
      whatsapp_number: String(whatsapp_number || '').trim(),
      whatsapp_channel_name: String(whatsapp_channel_name || '').trim(),
      whatsapp_channel_link: cleanChannelLink,
      registration_enabled: registration_enabled !== false,
      payment_required: payReq,
      payment_amount: fixedAmount,
      payment_instructions: String(payment_instructions || '').trim(),
    };

    let created: { id: string } | null = null;
    let insertErr: any = null;

    const firstAttempt = await admin.from('programs').insert(extendedInsert).select('id').single();
    if (firstAttempt.error && isMissingColumnError(firstAttempt.error)) {
      const fallbackAttempt = await admin.from('programs').insert(baseInsert).select('id').single();
      created = fallbackAttempt.data;
      insertErr = fallbackAttempt.error;
    } else {
      created = firstAttempt.data;
      insertErr = firstAttempt.error;
    }

    if (insertErr || !created) return res.status(400).json({ error: insertErr?.message || 'Failed to create program' });

    await upsertProgramMeta(admin, created.id, req.user!.id, {
      poster_url: poster_url || '',
      end_date: cleanEndDate,
      end_time: String(end_time || '').trim(),
      whatsapp_number: whatsapp_number || '',
      whatsapp_channel_name: whatsapp_channel_name || '',
      whatsapp_channel_link: cleanChannelLink,
      registration_enabled: registration_enabled !== false,
      payment_required: payReq,
      payment_amount: fixedAmount,
      payment_instructions: payment_instructions || '',
      sent_to_feed_count: 0,
      last_sent_to_feed_at: '',
    });

    await notifyRoles(['super_admin', 'teacher', 'parent', 'student', 'committee_member'], 'program', 'Upcoming Madrasa Program', `${title} on ${program_date}`, 'programs', created.id);
    await logActivity(req.user!, 'PROGRAM_CREATED', 'programs', created.id, `Created program: ${title}`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create program' });
  }
});

router.put('/programs/:id', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const {
      title,
      description,
      program_date,
      start_time,
      end_date,
      end_time,
      venue,
      category,
      featured_photo,
      gallery_images,
      status,
      poster_url,
      whatsapp_number,
      whatsapp_channel_name,
      whatsapp_channel_link,
      registration_enabled,
      payment_required,
      payment_amount,
      payment_instructions,
    } = req.body;

    const existingMetaMap = await getProgramMetaMap(admin, [id]);
    const existingMeta = existingMetaMap.get(id) || defaultProgramMeta();

    const nextStartDate = program_date !== undefined ? String(program_date).trim() : '';
    const nextEndDate = end_date !== undefined ? String(end_date).trim() : existingMeta.end_date;
    if (nextStartDate && nextEndDate && nextEndDate < nextStartDate) {
      return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
    }

    const nextPayReq = payment_required !== undefined ? Boolean(payment_required) : existingMeta.payment_required;
    const nextPayAmount = nextPayReq
      ? Number(payment_amount !== undefined ? payment_amount : existingMeta.payment_amount)
      : 0;
    if (nextPayReq && (Number.isNaN(nextPayAmount) || nextPayAmount <= 0)) {
      return res.status(400).json({ error: 'Please enter a valid fixed payment amount greater than 0 when payment is ON.' });
    }

    const basePayload: Record<string, any> = {};
    if (title !== undefined) basePayload.title = title;
    if (description !== undefined) basePayload.description = description;
    if (program_date !== undefined) basePayload.program_date = program_date;
    if (start_time !== undefined) basePayload.start_time = start_time;
    if (venue !== undefined) basePayload.venue = venue;
    if (category !== undefined) basePayload.category = category;
    if (featured_photo !== undefined) basePayload.featured_photo = normalizeStorageRef(featured_photo);
    if (gallery_images !== undefined) {
      basePayload.gallery_json = Array.isArray(gallery_images) ? gallery_images.map((u: string) => normalizeStorageRef(u)).filter(Boolean) : [];
    }
    if (status !== undefined) basePayload.status = status;

    const extendedPayload: Record<string, any> = { ...basePayload };
    if (end_date !== undefined) extendedPayload.end_date = end_date || null;
    if (end_time !== undefined) extendedPayload.end_time = String(end_time || '').trim();
    if (poster_url !== undefined) extendedPayload.poster_url = normalizeStorageRef(poster_url);
    if (whatsapp_number !== undefined) extendedPayload.whatsapp_number = String(whatsapp_number || '').trim();
    if (whatsapp_channel_name !== undefined) extendedPayload.whatsapp_channel_name = String(whatsapp_channel_name || '').trim();
    if (whatsapp_channel_link !== undefined) extendedPayload.whatsapp_channel_link = normalizeChannelUrl(whatsapp_channel_link);
    if (registration_enabled !== undefined) extendedPayload.registration_enabled = Boolean(registration_enabled);
    if (payment_required !== undefined) extendedPayload.payment_required = nextPayReq;
    if (payment_amount !== undefined || payment_required !== undefined) extendedPayload.payment_amount = nextPayAmount;
    if (payment_instructions !== undefined) extendedPayload.payment_instructions = String(payment_instructions || '').trim();

    if (Object.keys(extendedPayload).length > 0) {
      const firstUpdate = await admin.from('programs').update(extendedPayload).eq('id', id).is('deleted_at', null);
      if (firstUpdate.error && isMissingColumnError(firstUpdate.error)) {
        if (Object.keys(basePayload).length > 0) {
          const fallbackUpdate = await admin.from('programs').update(basePayload).eq('id', id).is('deleted_at', null);
          if (fallbackUpdate.error) return res.status(400).json({ error: fallbackUpdate.error.message });
        }
      } else if (firstUpdate.error) {
        return res.status(400).json({ error: firstUpdate.error.message });
      }
    }

    await upsertProgramMeta(admin, id, req.user!.id, {
      poster_url: poster_url !== undefined ? poster_url : existingMeta.poster_url,
      end_date: end_date !== undefined ? String(end_date || '').trim() : existingMeta.end_date,
      end_time: end_time !== undefined ? String(end_time || '').trim() : existingMeta.end_time,
      whatsapp_number: whatsapp_number !== undefined ? whatsapp_number : existingMeta.whatsapp_number,
      whatsapp_channel_name:
        whatsapp_channel_name !== undefined ? whatsapp_channel_name : existingMeta.whatsapp_channel_name,
      whatsapp_channel_link:
        whatsapp_channel_link !== undefined
          ? normalizeChannelUrl(whatsapp_channel_link)
          : existingMeta.whatsapp_channel_link,
      registration_enabled: registration_enabled !== undefined ? Boolean(registration_enabled) : existingMeta.registration_enabled,
      payment_required: nextPayReq,
      payment_amount: nextPayAmount,
      payment_instructions: payment_instructions !== undefined ? payment_instructions : existingMeta.payment_instructions,
      sent_to_feed_count: existingMeta.sent_to_feed_count || 0,
      last_sent_to_feed_at: existingMeta.last_sent_to_feed_at || '',
    });

    await logActivity(req.user!, 'PROGRAM_UPDATED', 'programs', id, `Updated program ${id}`, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update program' });
  }
});

router.put('/programs/:id/poster', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const { poster_url } = req.body as { poster_url?: string };

    const { data: prog } = await admin.from('programs').select('id, title').eq('id', id).is('deleted_at', null).maybeSingle();
    if (!prog) return res.status(404).json({ error: 'Program not found.' });

    const cleanPosterRef = normalizeStorageRef(poster_url);
    const updateRes = await admin.from('programs').update({ poster_url: cleanPosterRef }).eq('id', id).is('deleted_at', null);
    if (updateRes.error && !isMissingColumnError(updateRes.error)) {
      return res.status(400).json({ error: updateRes.error.message });
    }

    const existingMetaMap = await getProgramMetaMap(admin, [id]);
    const existingMeta = existingMetaMap.get(id) || defaultProgramMeta();
    await upsertProgramMeta(admin, id, req.user!.id, {
      ...existingMeta,
      poster_url: cleanPosterRef,
    });

    await logActivity(req.user!, 'PROGRAM_POSTER_UPDATED', 'programs', id, `Updated poster for program "${prog.title}"`, req.ip);
    return res.json({ success: true, poster_url: cleanPosterRef ? await resolveStorageUrl(cleanPosterRef) : '' });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update program poster' });
  }
});

router.delete('/programs/:id', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { error } = await admin.from('programs').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'PROGRAM_DELETED', 'programs', id, `Deleted program ${id}`, req.ip);
  return res.json({ success: true });
});

router.post('/programs/:id/send-to-feed', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;

    const { data: prog } = await admin.from('programs').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (!prog) return res.status(404).json({ error: 'Program not found.' });

    const metaMap = await getProgramMetaMap(admin, [id]);
    const meta = metaMap.get(id) || defaultProgramMeta();

    let rawGallery: string[] = [];
    try {
      rawGallery = typeof prog.gallery_json === 'string' ? JSON.parse(prog.gallery_json || '[]') : Array.isArray(prog.gallery_json) ? prog.gallery_json : [];
    } catch {
      rawGallery = [];
    }

    const posterRef = prog.poster_url || meta.poster_url;
    const mediaRefs = Array.from(
      new Set(
        [
          normalizeStorageRef(posterRef),
          normalizeStorageRef(prog.featured_photo),
          ...rawGallery.map((u) => normalizeStorageRef(u)),
        ].filter(Boolean)
      )
    );

    const startDate = prog.program_date || '';
    const startTime = prog.start_time || '';
    const endDate = prog.end_date || meta.end_date || startDate;
    const endTime = prog.end_time || meta.end_time || '';
    const waNumber = prog.whatsapp_number || meta.whatsapp_number || '';
    const waChannelName = prog.whatsapp_channel_name || meta.whatsapp_channel_name || '';
    const waChannelLink = prog.whatsapp_channel_link || meta.whatsapp_channel_link || '';
    const regEnabled = typeof prog.registration_enabled === 'boolean' ? prog.registration_enabled : meta.registration_enabled;
    const payRequired = typeof prog.payment_required === 'boolean' ? prog.payment_required : meta.payment_required;
    const payAmount =
      prog.payment_amount !== undefined && prog.payment_amount !== null && Number(prog.payment_amount) > 0
        ? Number(prog.payment_amount)
        : meta.payment_amount;

    const startLabel = `${startDate}${startTime ? ` (${startTime})` : ''}`;
    const endLabel = `${endDate}${endTime ? ` (${endTime})` : ''}`;

    const lines: string[] = [];
    if (prog.description) lines.push(String(prog.description).trim());
    lines.push('');
    lines.push(`Category: ${prog.category || 'Program'}`);
    lines.push(`Schedule: ${startLabel} → ${endLabel}`);
    if (prog.venue) lines.push(`Venue: ${prog.venue}`);
    if (waNumber) lines.push(`WhatsApp Contact: ${waNumber}`);
    if (waChannelName || waChannelLink) {
      lines.push(
        `WhatsApp Channel: ${waChannelName || 'Official Channel'}${waChannelLink ? ` (${waChannelLink})` : ''}`
      );
    }
    if (regEnabled) {
      if (payRequired && payAmount > 0) {
        lines.push(`Registration Fee: Rs. ${payAmount} (Payment statement required in Programs section)`);
      } else {
        lines.push('Registration: Open (Free Registration in Programs section)');
      }
    }

    const { data: createdPost, error: feedErr } = await admin
      .from('feed_posts')
      .insert({
        author_id: req.user!.id,
        title: prog.title,
        content: lines.join('\n').trim(),
        images_json: mediaRefs,
      })
      .select('id')
      .single();

    if (feedErr || !createdPost) {
      return res.status(400).json({ error: feedErr?.message || 'Failed to send program to feed.' });
    }

    const sentAt = new Date().toISOString();
    await upsertProgramMeta(admin, id, req.user!.id, {
      ...meta,
      poster_url: posterRef || '',
      end_date: endDate,
      end_time: endTime,
      whatsapp_number: waNumber,
      whatsapp_channel_name: waChannelName,
      whatsapp_channel_link: waChannelLink,
      sent_to_feed_count: (meta.sent_to_feed_count || 0) + 1,
      last_sent_to_feed_at: sentAt,
    });

    await notifyRoles(
      ['super_admin', 'teacher', 'parent', 'student', 'committee_member'],
      'feed',
      'Program Shared to Feed',
      `${prog.title} (${prog.program_date})`,
      'feed',
      createdPost.id
    );
    await logActivity(req.user!, 'PROGRAM_SENT_TO_FEED', 'programs', id, `Sent program "${prog.title}" to activity feed`, req.ip);

    return res.status(201).json({
      success: true,
      feedPostId: createdPost.id,
      sent_to_feed_count: (meta.sent_to_feed_count || 0) + 1,
      last_sent_to_feed_at: sentAt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to send program to feed' });
  }
});

router.post('/programs/:id/register', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;
    const {
      full_name,
      father_name,
      whatsapp_number,
      address_or_class,
      notes,
      payment_statement_url,
      payment_statement_name,
    } = req.body as Record<string, any>;

    const { data: prog } = await admin.from('programs').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (!prog) return res.status(404).json({ error: 'Program not found.' });

    const metaMap = await getProgramMetaMap(admin, [id]);
    const meta = metaMap.get(id) || defaultProgramMeta();

    const regEnabled =
      typeof prog.registration_enabled === 'boolean' ? prog.registration_enabled : meta.registration_enabled;
    if (regEnabled === false) {
      return res.status(400).json({ error: 'Registration is currently closed for this program.' });
    }

    const cleanName = String(full_name || '').trim();
    const cleanWhatsapp = String(whatsapp_number || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Participant full name is required.' });
    if (!cleanWhatsapp) return res.status(400).json({ error: 'WhatsApp / mobile number is required.' });

    const paymentRequired = Boolean(
      typeof prog.payment_required === 'boolean' ? prog.payment_required : meta.payment_required
    );
    const fixedAmount = paymentRequired
      ? Number(
          prog.payment_amount !== undefined && prog.payment_amount !== null && Number(prog.payment_amount) > 0
            ? prog.payment_amount
            : meta.payment_amount || 0
        )
      : 0;
    const statementRef = paymentRequired ? normalizeStorageRef(String(payment_statement_url || '').trim()) : '';

    if (paymentRequired && !statementRef) {
      return res.status(400).json({
        error: `Please upload your payment statement / receipt for the fixed amount of Rs. ${fixedAmount}.`,
      });
    }

    const regPayload = {
      program_id: id,
      program_title: prog.title,
      user_id: req.user!.id,
      username: req.user!.username || '',
      registered_by_role: req.user!.role_slug,
      full_name: cleanName,
      father_name: String(father_name || '').trim(),
      whatsapp_number: cleanWhatsapp,
      address_or_class: String(address_or_class || '').trim(),
      notes: String(notes || '').trim(),
      payment_required: paymentRequired,
      payment_amount: fixedAmount,
      payment_statement_url: statementRef,
      payment_statement_name: paymentRequired ? String(payment_statement_name || 'Payment Statement').trim() : '',
      created_at: new Date().toISOString(),
    };

    const { data: inserted, error } = await admin
      .from('documents')
      .insert({
        entity_type: 'general',
        entity_id: id,
        title: 'PROGRAM_REGISTRATION',
        file_url: JSON.stringify(regPayload),
        file_type: 'program_registration',
        uploaded_by: req.user!.id,
      })
      .select('id, created_at')
      .single();

    if (error || !inserted) {
      return res.status(400).json({ error: error?.message || 'Failed to save registration details.' });
    }

    await notifyRoles(
      ['super_admin', 'committee_member'],
      'program',
      'New Program Registration',
      `${cleanName} registered for ${prog.title}${paymentRequired ? ` (Paid Rs. ${fixedAmount})` : ' (Free)'}`,
      'programs',
      id
    );
    await logActivity(req.user!, 'PROGRAM_REGISTERED', 'programs', id, `Registered ${cleanName} for program ${prog.title}`, req.ip);

    return res.status(201).json({
      success: true,
      registration: {
        ...regPayload,
        id: inserted.id,
        created_at: inserted.created_at,
        payment_statement_url: statementRef ? await resolveStorageUrl(statementRef) : '',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to register for program' });
  }
});

router.get('/programs/:id/registrations', requireAuth, requireRole('super_admin', 'committee_member'), async (req, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const id = req.params.id;

    const [{ data: prog }, metaMap, { data: docs }] = await Promise.all([
      admin.from('programs').select('id, title, program_date, venue').eq('id', id).is('deleted_at', null).maybeSingle(),
      getProgramMetaMap(admin, [id]),
      admin
        .from('documents')
        .select('id, file_url, uploaded_by, created_at')
        .eq('entity_type', 'general')
        .eq('title', 'PROGRAM_REGISTRATION')
        .eq('entity_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (!prog) return res.status(404).json({ error: 'Program not found.' });
    const meta = metaMap.get(id) || defaultProgramMeta();

    const registrations = await Promise.all(
      (docs || []).map(async (doc: any) => {
        let parsed: any = {};
        try {
          parsed = JSON.parse(doc.file_url || '{}');
        } catch {
          parsed = {};
        }
        const resolvedStatement = parsed.payment_statement_url
          ? await resolveStorageUrl(String(parsed.payment_statement_url))
          : '';
        return {
          id: doc.id,
          program_id: id,
          user_id: parsed.user_id || doc.uploaded_by || '',
          username: parsed.username || '',
          registered_by_role: parsed.registered_by_role || '',
          full_name: parsed.full_name || 'Participant',
          father_name: parsed.father_name || '',
          whatsapp_number: parsed.whatsapp_number || '',
          address_or_class: parsed.address_or_class || '',
          notes: parsed.notes || '',
          payment_required: Boolean(parsed.payment_required),
          payment_amount: Number(parsed.payment_amount || 0),
          payment_statement_url: resolvedStatement,
          payment_statement_name: parsed.payment_statement_name || '',
          created_at: parsed.created_at || doc.created_at,
        };
      })
    );

    return res.json({
      program: {
        ...prog,
        payment_required: meta.payment_required,
        payment_amount: meta.payment_amount,
        whatsapp_number: meta.whatsapp_number,
      },
      registrations,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load registrations' });
  }
});

router.delete('/programs/:id/registrations/:regId', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { id, regId } = req.params;
    const { error } = await admin
      .from('documents')
      .delete()
      .eq('id', regId)
      .eq('entity_type', 'general')
      .eq('title', 'PROGRAM_REGISTRATION')
      .eq('entity_id', id);
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.user!, 'PROGRAM_REG_DELETED', 'programs', id, `Removed registration ${regId}`, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to remove registration' });
  }
});

// ==================== ACTIVITY FEED ====================
router.get('/feed', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;

  const [{ data: postsRaw }, { data: likesRaw }, { data: commentsRaw }] = await Promise.all([
    admin.from('feed_posts').select('*, profiles(full_name, roles(name))').is('deleted_at', null).order('created_at', { ascending: false }),
    admin.from('feed_likes').select('post_id').eq('user_id', req.user!.id),
    admin.from('feed_comments').select('*, profiles(full_name, roles(name))').is('deleted_at', null).order('created_at', { ascending: true }),
  ]);

  const likedSet = new Set((likesRaw || []).map((l) => l.post_id));
  const comments = (commentsRaw || []).map((c: any) => ({
    ...c,
    author_name: c.profiles?.full_name || '',
    author_role: c.profiles?.roles?.name || '',
  }));

  const posts = await Promise.all(
    (postsRaw || []).map(async (p: any) => {
      let rawImgs: string[] = [];
      try {
        rawImgs = typeof p.images_json === 'string' ? JSON.parse(p.images_json || '[]') : Array.isArray(p.images_json) ? p.images_json : [];
      } catch {
        rawImgs = [];
      }
      const resolvedImgs = await Promise.all(rawImgs.map((u) => resolveStorageUrl(u)));
      return {
        ...p,
        images_json: JSON.stringify(resolvedImgs),
        author_name: p.profiles?.full_name || '',
        author_role: p.profiles?.roles?.name || '',
        liked_by_me: likedSet.has(p.id) ? 1 : 0,
        comments: comments.filter((c) => c.post_id === p.id),
      };
    })
  );
  return res.json({ posts });
});

router.post('/feed', requireAuth, requireRole('super_admin', 'teacher', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { title, content, images } = req.body;
  if (!content) return res.status(400).json({ error: 'Post content is required.' });
  const { data: created, error } = await admin
    .from('feed_posts')
    .insert({
      author_id: req.user!.id,
      title: title || '',
      content: content.trim(),
      images_json: Array.isArray(images) ? images.map((u: string) => normalizeStorageRef(u)).filter(Boolean) : [],
    })
    .select('id')
    .single();
  if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to publish post' });
  await logActivity(req.user!, 'FEED_POST_PUBLISHED', 'feed', created.id, `Published feed post: ${title || content.slice(0, 40)}`, req.ip);
  return res.status(201).json({ id: created.id });
});

router.put('/feed/:id', requireAuth, requireRole('super_admin', 'teacher', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { title, content, images } = req.body;
  const payload: Record<string, any> = {};
  if (title !== undefined) payload.title = title;
  if (content !== undefined) payload.content = content;
  if (images !== undefined) {
    payload.images_json = Array.isArray(images) ? images.map((u: string) => normalizeStorageRef(u)).filter(Boolean) : [];
  }

  const { error } = await admin.from('feed_posts').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ success: true });
});

router.post('/feed/:id/like', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const postId = req.params.id;
  const uid = req.user!.id;

  const { data: exists } = await admin.from('feed_likes').select('id').eq('post_id', postId).eq('user_id', uid).maybeSingle();
  const { data: post } = await admin.from('feed_posts').select('likes_count').eq('id', postId).maybeSingle();
  const currentLikes = post?.likes_count || 0;

  if (exists) {
    await admin.from('feed_likes').delete().eq('id', exists.id);
    await admin.from('feed_posts').update({ likes_count: Math.max(0, currentLikes - 1) }).eq('id', postId);
    return res.json({ liked: false });
  }
  await admin.from('feed_likes').insert({ post_id: postId, user_id: uid });
  await admin.from('feed_posts').update({ likes_count: currentLikes + 1 }).eq('id', postId);
  return res.json({ liked: true });
});

router.post('/feed/:id/comments', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const postId = req.params.id;
  const { comment } = req.body as { comment?: string };
  if (!comment?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
  const { data: created, error } = await admin
    .from('feed_comments')
    .insert({ post_id: postId, user_id: req.user!.id, comment: comment.trim() })
    .select('id')
    .single();
  if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to add comment' });
  return res.status(201).json({ id: created.id });
});

router.delete('/feed/:id', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { error } = await admin.from('feed_posts').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ success: true });
});

// ==================== REPORTS (13 LIVE DATABASE REPORTS) ====================
router.get('/reports', requireAuth, requireRole('super_admin', 'committee_member', 'teacher'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { type, classId, studentId, dateFrom, dateTo, search } = req.query as Record<string, string>;
  const q = sanitizeOrTerm(search).toLowerCase();

  switch (type) {
    case 'total_students':
    case 'class_students': {
      let query = admin.from('students').select('student_code, full_name, father_name, mobile, village, admission_date, status, classes(name)').is('deleted_at', null);
      if (classId) query = query.eq('class_id', classId);
      if (q) query = query.or(`full_name.ilike.%${q}%,student_code.ilike.%${q}%`);
      const { data } = await query.order('full_name', { ascending: true });
      return res.json({
        rows: (data || []).map((st: any) => ({
          'Student ID': st.student_code,
          'Full Name': st.full_name,
          'Father Name': st.father_name,
          'Class': st.classes?.name || 'Unassigned',
          'Mobile': st.mobile,
          'Village': st.village,
          'Admission Date': st.admission_date,
          'Status': st.status,
        })),
      });
    }
    case 'admissions': {
      let query = admin.from('admissions').select('admission_no, student_name, father_name, guardian_mobile, admission_date, status, classes(name)').is('deleted_at', null);
      if (classId) query = query.eq('admission_class_id', classId);
      if (dateFrom) query = query.gte('admission_date', dateFrom);
      if (dateTo) query = query.lte('admission_date', dateTo);
      if (q) query = query.or(`student_name.ilike.%${q}%,admission_no.ilike.%${q}%`);
      const { data } = await query.order('created_at', { ascending: false });
      return res.json({
        rows: (data || []).map((a: any) => ({
          'Reference No': a.admission_no,
          'Student Name': a.student_name,
          'Father Name': a.father_name,
          'Guardian Mobile': a.guardian_mobile,
          'Class': a.classes?.name || 'Unassigned',
          'Admission Date': a.admission_date,
          'Status': a.status,
        })),
      });
    }
    case 'teachers': {
      let query = admin.from('teachers').select('teacher_code, full_name, qualification, mobile, email, joining_date, employment_status').is('deleted_at', null);
      if (q) query = query.or(`full_name.ilike.%${q}%,teacher_code.ilike.%${q}%`);
      const { data } = await query.order('full_name', { ascending: true });
      return res.json({
        rows: (data || []).map((t: any) => ({
          'Teacher ID': t.teacher_code,
          'Full Name': t.full_name,
          'Qualification': t.qualification,
          'Mobile': t.mobile,
          'Email': t.email,
          'Joining Date': t.joining_date,
          'Status': t.employment_status,
        })),
      });
    }
    case 'parents': {
      let query = admin.from('parents').select('id, parent_code, full_name, relationship, mobile, address, student_guardians(students(full_name))').is('deleted_at', null);
      if (q) query = query.or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%`);
      const { data } = await query;
      return res.json({
        rows: (data || []).map((p: any) => ({
          'Parent ID': p.parent_code,
          'Guardian Name': p.full_name,
          'Relationship': p.relationship,
          'Mobile': p.mobile,
          'Address': p.address,
          'Linked Children': (p.student_guardians || []).map((sg: any) => sg.students?.full_name).filter(Boolean).join(', '),
        })),
      });
    }
    case 'daily_attendance':
    case 'monthly_attendance': {
      let query = admin.from('attendance').select('attendance_date, status, class_id, classes(name)');
      if (classId) query = query.eq('class_id', classId);
      if (dateFrom) query = query.gte('attendance_date', dateFrom);
      if (dateTo) query = query.lte('attendance_date', dateTo);
      const { data } = await query;

      const map = new Map<string, any>();
      for (const a of (data || []) as any[]) {
        const period = type === 'monthly_attendance' ? a.attendance_date.slice(0, 7) : a.attendance_date;
        const key = `${period}_${a.class_id}`;
        const row = map.get(key) || { Period: period, Class: a.classes?.name || '', Present: 0, Absent: 0, Late: 0, Leave: 0, 'Total Marked': 0 };
        if (a.status === 'present') row.Present += 1;
        else if (a.status === 'absent') row.Absent += 1;
        else if (a.status === 'late') row.Late += 1;
        else if (a.status === 'leave') row.Leave += 1;
        row['Total Marked'] += 1;
        map.set(key, row);
      }
      const rows = Array.from(map.values()).sort((a, b) => b.Period.localeCompare(a.Period));
      return res.json({ rows });
    }
    case 'student_attendance': {
      let stQ = admin.from('students').select('id, student_code, full_name, classes(name)').is('deleted_at', null);
      if (classId) stQ = stQ.eq('class_id', classId);
      if (studentId) stQ = stQ.eq('id', studentId);
      if (q) stQ = stQ.or(`full_name.ilike.%${q}%,student_code.ilike.%${q}%`);
      const [{ data: students }, { data: attRows }] = await Promise.all([
        stQ.order('full_name', { ascending: true }),
        admin.from('attendance').select('student_id, status'),
      ]);
      return res.json({
        rows: (students || []).map((st: any) => {
          const list = (attRows || []).filter((a) => a.student_id === st.id);
          return {
            'Student ID': st.student_code,
            'Student Name': st.full_name,
            'Class': st.classes?.name || '',
            'Present': list.filter((a) => a.status === 'present').length,
            'Absent': list.filter((a) => a.status === 'absent').length,
            'Late': list.filter((a) => a.status === 'late').length,
            'Leave': list.filter((a) => a.status === 'leave').length,
            'Total Days': list.length,
          };
        }),
      });
    }
    case 'examinations': {
      let query = admin.from('examinations').select('name, exam_type, start_date, end_date, status, results_published, classes(name)').is('deleted_at', null);
      if (classId) query = query.eq('class_id', classId);
      const { data } = await query.order('start_date', { ascending: false });
      return res.json({
        rows: (data || []).map((e: any) => ({
          'Examination': e.name,
          'Type': e.exam_type,
          'Class': e.classes?.name || '',
          'Start Date': e.start_date,
          'End Date': e.end_date,
          'Status': e.status,
          'Results': e.results_published ? 'Published' : 'Unpublished',
        })),
      });
    }
    case 'student_results':
    case 'class_results': {
      let query = admin.from('results').select('obtained_marks, total_marks, percentage, grade, status, position, examinations!inner(name, deleted_at), students!inner(student_code, full_name, deleted_at), classes(name)').is('examinations.deleted_at', null).is('students.deleted_at', null);
      if (classId) query = query.eq('class_id', classId);
      if (studentId) query = query.eq('student_id', studentId);
      const { data } = await query.order('position', { ascending: true });
      const rows = (data || [])
        .filter((r: any) => !q || r.students?.full_name?.toLowerCase().includes(q) || r.examinations?.name?.toLowerCase().includes(q))
        .map((r: any) => ({
          'Examination': r.examinations?.name || '',
          'Class': r.classes?.name || '',
          'Student ID': r.students?.student_code || '',
          'Student Name': r.students?.full_name || '',
          'Obtained': r.obtained_marks,
          'Total': r.total_marks,
          'Percentage (%)': r.percentage,
          'Grade': r.grade,
          'Result': String(r.status || '').toUpperCase(),
          'Rank': r.position,
        }));
      return res.json({ rows });
    }
    case 'homework': {
      let query = admin.from('homework').select('id, title, assigned_date, submission_deadline, classes(name), subjects(name), teachers(full_name), homework_submissions(id)').is('deleted_at', null);
      if (classId) query = query.eq('class_id', classId);
      const { data } = await query.order('created_at', { ascending: false });
      return res.json({
        rows: (data || []).map((h: any) => ({
          'Homework Title': h.title,
          'Class': h.classes?.name || '',
          'Subject': h.subjects?.name || '',
          'Teacher': h.teachers?.full_name || '',
          'Assigned Date': h.assigned_date,
          'Deadline': h.submission_deadline,
          'Submissions': (h.homework_submissions || []).length,
        })),
      });
    }
    case 'user_activity': {
      let query = admin.from('activity_logs').select('username, role_name, action, module, record_id, details, created_at');
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00Z`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59Z`);
      if (q) query = query.or(`username.ilike.%${q}%,action.ilike.%${q}%,details.ilike.%${q}%`);
      const { data } = await query.order('created_at', { ascending: false }).limit(200);
      return res.json({
        rows: (data || []).map((l: any) => ({
          'Username': l.username,
          'Role': l.role_name,
          'Action': l.action,
          'Module': l.module,
          'Record ID': l.record_id,
          'Details': l.details,
          'Timestamp': l.created_at,
        })),
      });
    }
    default:
      return res.json({ rows: [] });
  }
});

// ==================== ACTIVITY LOGS ====================
router.get('/activity-logs', requireAuth, requireRole('super_admin'), async (req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { search, module, action } = req.query as Record<string, string>;
  let q = admin.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(250);
  if (module) q = q.eq('module', module);
  if (action) q = q.eq('action', action);
  if (search) {
    const s = sanitizeOrTerm(search);
    if (s) q = q.or(`username.ilike.%${s}%,details.ilike.%${s}%,action.ilike.%${s}%,record_id.ilike.%${s}%`);
  }
  const { data } = await q;
  return res.json({ logs: data || [] });
});

// ==================== NOTIFICATIONS ====================
router.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    admin.from('notifications').select('*').eq('user_id', req.user!.id).order('created_at', { ascending: false }).limit(40),
    admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', req.user!.id).eq('is_read', false),
  ]);
  return res.json({
    notifications: (notifications || []).map((n: any) => ({ ...n, is_read: n.is_read ? 1 : 0 })),
    unreadCount: unreadCount || 0,
  });
});

router.post('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  await admin.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user!.id);
  return res.json({ success: true });
});

router.post('/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  await admin.from('notifications').update({ is_read: true }).eq('user_id', req.user!.id);
  return res.json({ success: true });
});

export default router;
