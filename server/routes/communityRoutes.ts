import { Router } from 'express';
import multer from 'multer';
import {
  ALLOWED_BUCKETS,
  requireSupabaseAdmin,
  resolveStorageUrl,
  resolveStorageUrlsInRows,
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

    const [{ data: contactsRaw }, { data: myPartRows }] = await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name, username, mobile, photo_url, roles!inner(name, slug)')
        .neq('id', uid)
        .eq('status', 'active')
        .is('deleted_at', null)
        .in('roles.slug', allowedRoles)
        .order('full_name', { ascending: true }),
      admin.from('conversation_participants').select('conversation_id, last_read_at').eq('user_id', uid),
    ]);

    const contactsResolved = await resolveStorageUrlsInRows(contactsRaw || [], ['photo_url']);
    const contacts = contactsResolved.map((c: any) => ({
      id: c.id,
      full_name: c.full_name,
      username: c.username,
      mobile: c.mobile || '',
      role_name: c.roles?.name || '',
      role_slug: c.roles?.slug || '',
      photo_url: c.photo_url || '',
    }));

    const convIds = (myPartRows || []).map((p) => p.conversation_id);
    if (!convIds.length) return res.json({ conversations: [], contacts });

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
        const msgs = (recentMsgs || []).filter((m) => m.conversation_id === conv.id);
        const lastMsg = msgs[0];
        const lastRead = myLastReadMap.get(conv.id) || '1970-01-01';
        const unread_count = msgs.filter((m) => m.sender_id !== uid && m.created_at > lastRead).length;
        const convParts = participants.filter((p) => p.conversation_id === conv.id);
        const other = convParts.find((p) => p.user_id !== uid);
        const is_personal_channel = convParts.length === 1 && convParts[0]?.user_id === uid;
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
          other_user: other || null,
          last_message: lastMsg?.content || (lastMsg?.attachment_name ? `📎 ${lastMsg.attachment_name}` : ''),
          last_message_at: lastMsg?.created_at || conv.created_at,
          unread_count,
          participants: convParts,
          display_title,
        };
      })
      .sort((a: any, b: any) => String(b.last_message_at).localeCompare(String(a.last_message_at)));

    return res.json({ conversations, contacts });
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

    const [, { data: msgsRaw }, { data: metaRows }] = await Promise.all([
      admin.from('conversation_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', convId).eq('user_id', uid),
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
    ]);

    const metaMap = new Map<string, ChatMsgMeta>();
    for (const row of metaRows || []) {
      if (row.file_type) {
        metaMap.set(row.file_type, parseMsgMeta(row.file_url));
      }
    }

    const resolved = await resolveStorageUrlsInRows(msgsRaw || [], ['attachment_url']);
    const messages = resolved.map((m: any) => {
      const meta = metaMap.get(m.id) || { edited_at: null, reactions: {} };
      return {
        ...m,
        sender_name: m.profiles?.full_name || '',
        sender_role: m.profiles?.roles?.name || '',
        edited_at: meta.edited_at,
        reactions: formatReactionsList(meta.reactions, uid),
      };
    });

    return res.json({ messages });
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

    if (type === 'private' && otherIds.length === 1) {
      const otherId = otherIds[0];
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
            await admin.from('messages').insert({ conversation_id: existingPriv.id, sender_id: uid, content: initial_message });
            await createNotification(otherId, 'message', 'New Message', `${req.user!.full_name}: ${initial_message.slice(0, 80)}`, 'chats', existingPriv.id);
          }
          return res.json({ id: existingPriv.id });
        }
      }
    }

    const dbType = type === 'group' ? 'group' : 'private';
    const { data: createdConv, error: convErr } = await admin
      .from('conversations')
      .insert({ title: cleanTitle, type: dbType, created_by: uid })
      .select('id')
      .single();
    if (convErr || !createdConv) return res.status(500).json({ error: 'Failed to create conversation' });

    await admin.from('conversation_participants').insert(uniqueIds.map((pid) => ({ conversation_id: createdConv.id, user_id: pid })));
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

    const { data: others } = await admin.from('conversation_participants').select('user_id').eq('conversation_id', convId).neq('user_id', uid);
    for (const o of others || []) {
      await createNotification(o.user_id, 'message', 'New Message', `${req.user!.full_name}: ${(content || attachment_name || 'Attachment').slice(0, 80)}`, 'chats', convId);
    }
    return res.status(201).json({ id: createdMsg.id });
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
    if (!emoji || emoji.length > 16) {
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
      admin.from('conversations').select('id, created_by').eq('id', convId).maybeSingle(),
      admin.from('conversation_participants').select('user_id').eq('conversation_id', convId),
    ]);

    if (!conv) return res.status(404).json({ error: 'Channel not found' });
    const isPersonal = (parts || []).length === 1 && parts?.[0]?.user_id === uid && conv.created_by === uid;
    if (!isPersonal) {
      return res.status(403).json({ error: 'Only your own Personal Channel can be deleted.' });
    }

    await admin
      .from('documents')
      .delete()
      .eq('entity_type', 'general')
      .eq('entity_id', convId)
      .eq('title', 'CHAT_MSG_META');

    const { error } = await admin.from('conversations').delete().eq('id', convId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to delete channel' });
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
router.get('/programs', requireAuth, async (_req, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const { data } = await admin.from('programs').select('*').is('deleted_at', null).order('program_date', { ascending: false });
  const resolved = await resolveStorageUrlsInRows(data || [], ['featured_photo']);
  const programs = await Promise.all(
    resolved.map(async (p: any) => {
      let rawGallery: string[] = [];
      try {
        rawGallery = typeof p.gallery_json === 'string' ? JSON.parse(p.gallery_json || '[]') : Array.isArray(p.gallery_json) ? p.gallery_json : [];
      } catch {
        rawGallery = [];
      }
      const resolvedGallery = await Promise.all(rawGallery.map((u) => resolveStorageUrl(u)));
      return {
        ...p,
        gallery_json: JSON.stringify(resolvedGallery),
      };
    })
  );
  return res.json({ programs });
});

router.post('/programs', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const { title, description, program_date, start_time, venue, category, featured_photo, gallery_images, status } = req.body;
    if (!title || !program_date) return res.status(400).json({ error: 'Program title and date are required.' });
    const { data: created, error } = await admin
      .from('programs')
      .insert({
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
      })
      .select('id')
      .single();

    if (error || !created) return res.status(400).json({ error: error?.message || 'Failed to create program' });
    await notifyRoles(['super_admin', 'teacher', 'parent', 'student', 'committee_member'], 'program', 'Upcoming Madrasa Program', `${title} on ${program_date}`, 'programs', created.id);
    await logActivity(req.user!, 'PROGRAM_CREATED', 'programs', created.id, `Created program: ${title}`, req.ip);
    return res.status(201).json({ id: created.id });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create program' });
  }
});

router.put('/programs/:id', requireAuth, requireRole('super_admin', 'committee_member'), async (req: AuthRequest, res) => {
  const admin = requireSupabaseAdmin(res);
  if (!admin) return;
  const id = req.params.id;
  const { title, description, program_date, start_time, venue, category, featured_photo, gallery_images, status } = req.body;
  const payload: Record<string, any> = {};
  if (title !== undefined) payload.title = title;
  if (description !== undefined) payload.description = description;
  if (program_date !== undefined) payload.program_date = program_date;
  if (start_time !== undefined) payload.start_time = start_time;
  if (venue !== undefined) payload.venue = venue;
  if (category !== undefined) payload.category = category;
  if (featured_photo !== undefined) payload.featured_photo = normalizeStorageRef(featured_photo);
  if (gallery_images !== undefined) {
    payload.gallery_json = Array.isArray(gallery_images) ? gallery_images.map((u: string) => normalizeStorageRef(u)).filter(Boolean) : [];
  }
  if (status !== undefined) payload.status = status;

  const { error } = await admin.from('programs').update(payload).eq('id', id).is('deleted_at', null);
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user!, 'PROGRAM_UPDATED', 'programs', id, `Updated program ${id}`, req.ip);
  return res.json({ success: true });
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
          'Results': e.results_published ? 'Published' : 'Draft',
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
