import crypto from 'node:crypto';
import { Router } from 'express';
import {
  AuthRequest,
  getParentIdForUser,
  getParentStudentIds,
  getStudentIdForUser,
  getTeacherAssignedClassIds,
  getTeacherIdForUser,
  logActivity,
  notifyRoles,
  requireAuth,
  requireRole,
} from '../auth.ts';
import { resolveStorageUrl, supabaseAdmin } from '../supabase.ts';
import {
  ensureAllTursoSchemas,
  ensureTursoSchedulesSchema,
  getTursoClient,
  getTursoTablesStatus,
  isTursoConfigured,
} from '../turso.ts';
import { normalizeStorageRef } from './publicRoutes.ts';

const router = Router();

const ALLOWED_AUDIENCE_SLUGS = ['student', 'teacher', 'parent', 'super_admin'] as const;
type AudienceSlug = (typeof ALLOWED_AUDIENCE_SLUGS)[number];

const ALLOWED_CATEGORIES = new Set([
  'Daily Timetable',
  'Weekly Routine',
  'Exam Schedule',
  'Teacher Duty',
  'Parents Meeting',
  'Admin Plan',
  'Ramzan / Special',
  'Other',
]);

export interface ScheduleSlotInput {
  id?: string;
  day_label?: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  details?: string;
  assigned_to?: string;
  location?: string;
}

function sanitizeSafeUrl(raw: unknown): string {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (val.startsWith('turso://') || val.startsWith('supabase://') || val.startsWith('/api/media/')) {
    return normalizeStorageRef(val);
  }
  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return normalizeStorageRef(val);
    }
  } catch {
    // Reject malformed or dangerous schemes (e.g. javascript:, data:)
  }
  return '';
}

function normalizeTargetAudiences(
  targetAudienceRaw: unknown,
  targetAudiencesRaw: unknown
): { primaryAudience: string; audiences: AudienceSlug[] } {
  const list: AudienceSlug[] = [];
  if (Array.isArray(targetAudiencesRaw)) {
    for (const item of targetAudiencesRaw) {
      const slug = String(item || '').trim().toLowerCase();
      if (slug === 'all') {
        return { primaryAudience: 'all', audiences: [...ALLOWED_AUDIENCE_SLUGS] };
      }
      if ((ALLOWED_AUDIENCE_SLUGS as readonly string[]).includes(slug) && !list.includes(slug as AudienceSlug)) {
        list.push(slug as AudienceSlug);
      }
    }
  }

  const single = String(targetAudienceRaw || '').trim().toLowerCase();
  if (list.length === 0) {
    if (single === 'all') {
      return { primaryAudience: 'all', audiences: [...ALLOWED_AUDIENCE_SLUGS] };
    }
    if ((ALLOWED_AUDIENCE_SLUGS as readonly string[]).includes(single)) {
      list.push(single as AudienceSlug);
    }
  }

  if (list.length === 0) {
    return { primaryAudience: 'student', audiences: ['student'] };
  }

  if (list.length === ALLOWED_AUDIENCE_SLUGS.length) {
    return { primaryAudience: 'all', audiences: [...ALLOWED_AUDIENCE_SLUGS] };
  }

  const primaryAudience = list.length === 1 ? list[0] : 'custom';
  return { primaryAudience, audiences: list };
}

function sanitizeSlots(raw: unknown): Array<{
  id: string;
  sort_order: number;
  day_label: string;
  start_time: string;
  end_time: string;
  title: string;
  details: string;
  assigned_to: string;
  location: string;
}> {
  if (!Array.isArray(raw)) return [];
  const slots: Array<{
    id: string;
    sort_order: number;
    day_label: string;
    start_time: string;
    end_time: string;
    title: string;
    details: string;
    assigned_to: string;
    location: string;
  }> = [];

  for (let i = 0; i < Math.min(raw.length, 80); i++) {
    const item = (raw[i] || {}) as ScheduleSlotInput;
    const title = String(item.title || '').trim().slice(0, 180);
    const startTime = String(item.start_time || '').trim().slice(0, 40);
    const endTime = String(item.end_time || '').trim().slice(0, 40);
    const dayLabel = String(item.day_label || 'Daily').trim().slice(0, 60) || 'Daily';
    const details = String(item.details || '').trim().slice(0, 500);
    const assignedTo = String(item.assigned_to || '').trim().slice(0, 120);
    const location = String(item.location || '').trim().slice(0, 120);
    if (!title && !startTime && !details) continue;
    slots.push({
      id: crypto.randomUUID().replace(/-/g, ''),
      sort_order: slots.length,
      day_label: dayLabel,
      start_time: startTime,
      end_time: endTime,
      title: title || 'Scheduled Activity',
      details,
      assigned_to: assignedTo,
      location,
    });
  }
  return slots;
}

function parseAudiencesJson(raw: unknown, fallbackPrimary: string): AudienceSlug[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed
        .map((x) => String(x || '').trim().toLowerCase())
        .filter((x): x is AudienceSlug => (ALLOWED_AUDIENCE_SLUGS as readonly string[]).includes(x));
      if (valid.length > 0) return valid;
    }
  } catch {
    // ignore malformed json
  }
  if (fallbackPrimary === 'all') return [...ALLOWED_AUDIENCE_SLUGS];
  if ((ALLOWED_AUDIENCE_SLUGS as readonly string[]).includes(fallbackPrimary)) {
    return [fallbackPrimary as AudienceSlug];
  }
  return ['student'];
}

async function resolveUserAllowedClassIds(req: AuthRequest): Promise<Set<string> | null> {
  const user = req.user!;
  if (user.role_slug === 'super_admin' || user.role_slug === 'committee_member') return null; // unrestricted
  if (!supabaseAdmin) return new Set<string>();

  if (user.role_slug === 'student') {
    const sid = await getStudentIdForUser(user);
    if (!sid) return new Set<string>();
    const { data } = await supabaseAdmin.from('students').select('class_id').eq('id', sid).maybeSingle();
    return new Set(data?.class_id ? [String(data.class_id)] : []);
  }

  if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    if (!pid) return new Set<string>();
    const studentIds = await getParentStudentIds(pid);
    if (!studentIds.length) return new Set<string>();
    const { data } = await supabaseAdmin.from('students').select('class_id').in('id', studentIds);
    return new Set((data || []).map((r: any) => String(r.class_id || '')).filter(Boolean));
  }

  if (user.role_slug === 'teacher') {
    const tid = await getTeacherIdForUser(user);
    if (!tid) return new Set<string>();
    const classIds = await getTeacherAssignedClassIds(tid);
    return new Set(classIds.map(String));
  }

  return new Set<string>();
}

function canUserViewSchedule(
  roleSlug: string,
  allowedClassIds: Set<string> | null,
  schedule: {
    status: string;
    target_audience: string;
    target_audiences: AudienceSlug[];
    target_class_id: string;
  }
): boolean {
  if (roleSlug === 'super_admin') return true;
  if (schedule.status !== 'published') return false;

  const isForAll = schedule.target_audience === 'all';
  if (roleSlug === 'committee_member') {
    return isForAll;
  }

  const targetedToRole =
    isForAll || schedule.target_audiences.includes(roleSlug as AudienceSlug);
  if (!targetedToRole) return false;

  if (schedule.target_class_id && allowedClassIds !== null) {
    return allowedClassIds.has(String(schedule.target_class_id));
  }
  return true;
}

async function resolveClassName(classId: string): Promise<string> {
  if (!classId || !supabaseAdmin) return '';
  const { data } = await supabaseAdmin
    .from('classes')
    .select('name')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.name ? String(data.name) : '';
}

async function hydrateSchedules(scheduleRows: any[]): Promise<any[]> {
  if (!scheduleRows.length) return [];
  const client = getTursoClient();
  const ids = scheduleRows.map((r) => String(r.id));
  const placeholders = ids.map(() => '?').join(', ');

  const itemsRes = await client.execute({
    sql: `
      SELECT id, schedule_id, sort_order, day_label, start_time, end_time, title, details, assigned_to, location
      FROM turso_schedule_items
      WHERE schedule_id IN (${placeholders})
      ORDER BY sort_order ASC
    `,
    args: ids,
  });

  const itemsBySchedule = new Map<string, any[]>();
  for (const row of itemsRes.rows as any[]) {
    const sid = String(row.schedule_id);
    if (!itemsBySchedule.has(sid)) itemsBySchedule.set(sid, []);
    itemsBySchedule.get(sid)!.push({
      id: String(row.id),
      schedule_id: sid,
      sort_order: Number(row.sort_order || 0),
      day_label: String(row.day_label || 'Daily'),
      start_time: String(row.start_time || ''),
      end_time: String(row.end_time || ''),
      title: String(row.title || ''),
      details: String(row.details || ''),
      assigned_to: String(row.assigned_to || ''),
      location: String(row.location || ''),
    });
  }

  return Promise.all(
    scheduleRows.map(async (row) => {
      const id = String(row.id);
      const targetAudience = String(row.target_audience || 'student');
      const targetAudiences = parseAudiencesJson(row.target_audiences_json, targetAudience);
      const attachmentRaw = String(row.attachment_url || '');
      const resolvedAttachment = attachmentRaw ? await resolveStorageUrl(attachmentRaw) : '';
      return {
        id,
        title: String(row.title || ''),
        description: String(row.description || ''),
        category: String(row.category || 'Daily Timetable'),
        target_audience: targetAudience,
        target_audiences: targetAudiences,
        target_class_id: String(row.target_class_id || ''),
        target_class_name: String(row.target_class_name || ''),
        start_date: String(row.start_date || ''),
        end_date: String(row.end_date || ''),
        effective_days: String(row.effective_days || 'Mon - Sat'),
        status: String(row.status || 'draft'),
        is_pinned: Number(row.is_pinned || 0) === 1,
        attachment_url: resolvedAttachment,
        attachment_name: String(row.attachment_name || ''),
        created_by: String(row.created_by || ''),
        created_by_name: String(row.created_by_name || 'Super Admin'),
        published_at: String(row.published_at || ''),
        created_at: String(row.created_at || ''),
        updated_at: String(row.updated_at || ''),
        items: itemsBySchedule.get(id) || [],
      };
    })
  );
}

async function dispatchScheduleNotifications(
  scheduleId: string,
  title: string,
  category: string,
  audiences: AudienceSlug[],
  targetClassName: string
) {
  const notifyRoleList = audiences.filter((slug) => slug !== 'super_admin');
  if (!notifyRoleList.length) return;
  const classNote = targetClassName ? ` (${targetClassName})` : '';
  await notifyRoles(
    notifyRoleList,
    'schedule',
    `New Schedule Posted: ${title}`,
    `${category}${classNote} has been posted by Super Admin. Open Schedules to view full timings.`,
    'schedules',
    scheduleId
  );
}

// Super Admin: Explicitly initialize / verify all Turso tables on demand
router.post('/schedules/init-tables', requireAuth, requireRole('super_admin'), async (_req: AuthRequest, res) => {
  if (!isTursoConfigured()) {
    return res.status(503).json({
      error: 'Turso database is not configured yet. Please add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Secrets / Environment Variables.',
      tursoConfigured: false,
    });
  }
  await ensureAllTursoSchemas();
  const status = await getTursoTablesStatus();
  return res.json({
    success: true,
    tursoConfigured: status.configured,
    tables: status.tables,
    message: `Turso tables verified & ready (${status.tables.length} tables).`,
  });
});

// GET /api/schedules — Role-scoped list of schedules stored in Turso
router.get('/schedules', requireAuth, async (req: AuthRequest, res) => {
  const user = req.user!;
  if (!isTursoConfigured()) {
    return res.json({
      schedules: [],
      tursoConfigured: false,
      tables: [],
      message: 'Turso database is not configured yet. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable Schedules.',
    });
  }

  await ensureTursoSchedulesSchema();
  const client = getTursoClient();

  const isSuperAdmin = user.role_slug === 'super_admin';
  const queryRes = await client.execute({
    sql: isSuperAdmin
      ? `SELECT * FROM turso_schedules ORDER BY is_pinned DESC, CASE status WHEN 'published' THEN 0 ELSE 1 END, updated_at DESC`
      : `SELECT * FROM turso_schedules WHERE status = 'published' ORDER BY is_pinned DESC, published_at DESC, updated_at DESC`,
    args: [],
  });

  const hydrated = await hydrateSchedules(queryRes.rows as any[]);
  const allowedClassIds = await resolveUserAllowedClassIds(req);

  const visible = hydrated.filter((s) =>
    canUserViewSchedule(user.role_slug, allowedClassIds, {
      status: s.status,
      target_audience: s.target_audience,
      target_audiences: s.target_audiences,
      target_class_id: s.target_class_id,
    })
  );

  const tableInfo = isSuperAdmin ? await getTursoTablesStatus() : { configured: true, tables: [] };

  return res.json({
    schedules: visible,
    tursoConfigured: true,
    tables: tableInfo.tables,
  });
});

// GET /api/schedules/:id — Single schedule detail with RBAC check
router.get('/schedules/:id', requireAuth, async (req: AuthRequest, res) => {
  const user = req.user!;
  if (!isTursoConfigured()) {
    return res.status(503).json({ error: 'Turso database is not configured yet.' });
  }
  const id = String(req.params.id || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid schedule ID' });
  }

  await ensureTursoSchedulesSchema();
  const client = getTursoClient();
  const rowRes = await client.execute({
    sql: `SELECT * FROM turso_schedules WHERE id = ?`,
    args: [id],
  });
  if (!rowRes.rows.length) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const [schedule] = await hydrateSchedules(rowRes.rows as any[]);
  const allowedClassIds = await resolveUserAllowedClassIds(req);
  if (
    !canUserViewSchedule(user.role_slug, allowedClassIds, {
      status: schedule.status,
      target_audience: schedule.target_audience,
      target_audiences: schedule.target_audiences,
      target_class_id: schedule.target_class_id,
    })
  ) {
    return res.status(403).json({ error: 'You do not have access to this schedule' });
  }

  return res.json({ schedule });
});

// POST /api/schedules — Super Admin ONLY: Prepare (draft) or Post (publish) a new schedule in Turso
router.post('/schedules', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  if (!isTursoConfigured()) {
    return res.status(503).json({
      error: 'Turso database is not configured yet. Please add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.',
    });
  }

  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 180);
  if (!title) {
    return res.status(400).json({ error: 'Schedule title is required' });
  }

  const description = String(b.description || '').trim().slice(0, 2000);
  const categoryRaw = String(b.category || 'Daily Timetable').trim();
  const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : 'Other';
  const { primaryAudience, audiences } = normalizeTargetAudiences(b.target_audience, b.target_audiences);
  const targetClassId = String(b.target_class_id || '').trim().slice(0, 64);
  const targetClassName = targetClassId
    ? (await resolveClassName(targetClassId)) || String(b.target_class_name || '').trim().slice(0, 120)
    : '';
  const startDate = String(b.start_date || '').trim().slice(0, 32);
  const endDate = String(b.end_date || '').trim().slice(0, 32);
  const effectiveDays = String(b.effective_days || 'Mon - Sat').trim().slice(0, 80);
  const status = String(b.status || 'draft').trim().toLowerCase() === 'published' ? 'published' : 'draft';
  const isPinned = b.is_pinned ? 1 : 0;
  const attachmentUrl = sanitizeSafeUrl(b.attachment_url);
  const attachmentName = attachmentUrl ? String(b.attachment_name || '').trim().slice(0, 180) : '';
  const slots = sanitizeSlots(b.items);

  await ensureTursoSchedulesSchema();
  const client = getTursoClient();

  const id = crypto.randomUUID().replace(/-/g, '');
  const nowIso = new Date().toISOString();
  const publishedAt = status === 'published' ? nowIso : '';

  await client.execute({
    sql: `
      INSERT INTO turso_schedules (
        id, title, description, category, target_audience, target_audiences_json,
        target_class_id, target_class_name, start_date, end_date, effective_days,
        status, is_pinned, attachment_url, attachment_name,
        created_by, created_by_name, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      title,
      description,
      category,
      primaryAudience,
      JSON.stringify(audiences),
      targetClassId,
      targetClassName,
      startDate,
      endDate,
      effectiveDays,
      status,
      isPinned,
      attachmentUrl,
      attachmentName,
      req.user!.id,
      req.user!.full_name || 'Super Admin',
      publishedAt,
      nowIso,
      nowIso,
    ],
  });

  for (const slot of slots) {
    await client.execute({
      sql: `
        INSERT INTO turso_schedule_items (
          id, schedule_id, sort_order, day_label, start_time, end_time, title, details, assigned_to, location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        slot.id,
        id,
        slot.sort_order,
        slot.day_label,
        slot.start_time,
        slot.end_time,
        slot.title,
        slot.details,
        slot.assigned_to,
        slot.location,
      ],
    });
  }

  if (status === 'published') {
    await dispatchScheduleNotifications(id, title, category, audiences, targetClassName);
  }

  await logActivity(
    req.user!,
    status === 'published' ? 'PUBLISH_SCHEDULE' : 'CREATE_SCHEDULE_DRAFT',
    'schedules',
    id,
    `${status === 'published' ? 'Posted' : 'Drafted'} schedule "${title}" for [${audiences.join(', ')}]`,
    req.ip || ''
  );

  const createdRes = await client.execute({ sql: `SELECT * FROM turso_schedules WHERE id = ?`, args: [id] });
  const [schedule] = await hydrateSchedules(createdRes.rows as any[]);
  return res.status(201).json({ schedule });
});

// PUT /api/schedules/:id — Super Admin ONLY: Update schedule details, slots, audience or publish state
router.put('/schedules/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  if (!isTursoConfigured()) {
    return res.status(503).json({ error: 'Turso database is not configured yet.' });
  }
  const id = String(req.params.id || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid schedule ID' });
  }

  await ensureTursoSchedulesSchema();
  const client = getTursoClient();

  const existingRes = await client.execute({ sql: `SELECT * FROM turso_schedules WHERE id = ?`, args: [id] });
  const existing = existingRes.rows[0] as any;
  if (!existing) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const b = req.body || {};
  const title = String(b.title ?? existing.title ?? '').trim().slice(0, 180);
  if (!title) {
    return res.status(400).json({ error: 'Schedule title is required' });
  }

  const description = String(b.description ?? existing.description ?? '').trim().slice(0, 2000);
  const categoryRaw = String(b.category ?? existing.category ?? 'Daily Timetable').trim();
  const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : 'Other';
  const { primaryAudience, audiences } = normalizeTargetAudiences(
    b.target_audience ?? existing.target_audience,
    b.target_audiences ?? parseAudiencesJson(existing.target_audiences_json, String(existing.target_audience || 'student'))
  );

  const targetClassId = String(b.target_class_id ?? existing.target_class_id ?? '').trim().slice(0, 64);
  const targetClassName = targetClassId
    ? (await resolveClassName(targetClassId)) || String(b.target_class_name ?? existing.target_class_name ?? '').trim().slice(0, 120)
    : '';

  const startDate = String(b.start_date ?? existing.start_date ?? '').trim().slice(0, 32);
  const endDate = String(b.end_date ?? existing.end_date ?? '').trim().slice(0, 32);
  const effectiveDays = String(b.effective_days ?? existing.effective_days ?? 'Mon - Sat').trim().slice(0, 80);

  const prevStatus = String(existing.status || 'draft');
  const nextStatus =
    b.status !== undefined
      ? String(b.status).trim().toLowerCase() === 'published'
        ? 'published'
        : 'draft'
      : prevStatus;

  const isPinned = b.is_pinned !== undefined ? (b.is_pinned ? 1 : 0) : Number(existing.is_pinned || 0);
  const attachmentUrl =
    b.attachment_url !== undefined ? sanitizeSafeUrl(b.attachment_url) : String(existing.attachment_url || '');
  const attachmentName = attachmentUrl
    ? String(b.attachment_name ?? existing.attachment_name ?? '').trim().slice(0, 180)
    : '';

  const nowIso = new Date().toISOString();
  const publishedAt =
    nextStatus === 'published'
      ? String(existing.published_at || '') || nowIso
      : '';

  await client.execute({
    sql: `
      UPDATE turso_schedules SET
        title = ?, description = ?, category = ?, target_audience = ?, target_audiences_json = ?,
        target_class_id = ?, target_class_name = ?, start_date = ?, end_date = ?, effective_days = ?,
        status = ?, is_pinned = ?, attachment_url = ?, attachment_name = ?,
        published_at = ?, updated_at = ?
      WHERE id = ?
    `,
    args: [
      title,
      description,
      category,
      primaryAudience,
      JSON.stringify(audiences),
      targetClassId,
      targetClassName,
      startDate,
      endDate,
      effectiveDays,
      nextStatus,
      isPinned,
      attachmentUrl,
      attachmentName,
      publishedAt,
      nowIso,
      id,
    ],
  });

  if (Array.isArray(b.items)) {
    const slots = sanitizeSlots(b.items);
    await client.execute({ sql: `DELETE FROM turso_schedule_items WHERE schedule_id = ?`, args: [id] });
    for (const slot of slots) {
      await client.execute({
        sql: `
          INSERT INTO turso_schedule_items (
            id, schedule_id, sort_order, day_label, start_time, end_time, title, details, assigned_to, location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          slot.id,
          id,
          slot.sort_order,
          slot.day_label,
          slot.start_time,
          slot.end_time,
          slot.title,
          slot.details,
          slot.assigned_to,
          slot.location,
        ],
      });
    }
  }

  const newlyPublished = prevStatus !== 'published' && nextStatus === 'published';
  if (newlyPublished) {
    await dispatchScheduleNotifications(id, title, category, audiences, targetClassName);
  }

  await logActivity(
    req.user!,
    newlyPublished ? 'PUBLISH_SCHEDULE' : 'UPDATE_SCHEDULE',
    'schedules',
    id,
    `Updated schedule "${title}" (${nextStatus})`,
    req.ip || ''
  );

  const updatedRes = await client.execute({ sql: `SELECT * FROM turso_schedules WHERE id = ?`, args: [id] });
  const [schedule] = await hydrateSchedules(updatedRes.rows as any[]);
  return res.json({ schedule });
});

// PATCH /api/schedules/:id/publish — Super Admin ONLY: One-click Post / Move to Draft
router.patch('/schedules/:id/publish', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  if (!isTursoConfigured()) {
    return res.status(503).json({ error: 'Turso database is not configured yet.' });
  }
  const id = String(req.params.id || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid schedule ID' });
  }

  await ensureTursoSchedulesSchema();
  const client = getTursoClient();

  const existingRes = await client.execute({ sql: `SELECT * FROM turso_schedules WHERE id = ?`, args: [id] });
  const existing = existingRes.rows[0] as any;
  if (!existing) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const nextStatus =
    String(req.body?.status || '').trim().toLowerCase() === 'draft' ? 'draft' : 'published';
  const nowIso = new Date().toISOString();
  const publishedAt = nextStatus === 'published' ? nowIso : '';

  await client.execute({
    sql: `UPDATE turso_schedules SET status = ?, published_at = ?, updated_at = ? WHERE id = ?`,
    args: [nextStatus, publishedAt, nowIso, id],
  });

  if (nextStatus === 'published' && String(existing.status) !== 'published') {
    const audiences = parseAudiencesJson(existing.target_audiences_json, String(existing.target_audience || 'student'));
    await dispatchScheduleNotifications(
      id,
      String(existing.title || 'Schedule'),
      String(existing.category || 'Timetable'),
      audiences,
      String(existing.target_class_name || '')
    );
  }

  await logActivity(
    req.user!,
    nextStatus === 'published' ? 'PUBLISH_SCHEDULE' : 'UNPUBLISH_SCHEDULE',
    'schedules',
    id,
    `Changed schedule "${existing.title}" to ${nextStatus}`,
    req.ip || ''
  );

  const updatedRes = await client.execute({ sql: `SELECT * FROM turso_schedules WHERE id = ?`, args: [id] });
  const [schedule] = await hydrateSchedules(updatedRes.rows as any[]);
  return res.json({ schedule });
});

// DELETE /api/schedules/:id — Super Admin ONLY
router.delete('/schedules/:id', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  if (!isTursoConfigured()) {
    return res.status(503).json({ error: 'Turso database is not configured yet.' });
  }
  const id = String(req.params.id || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid schedule ID' });
  }

  await ensureTursoSchedulesSchema();
  const client = getTursoClient();

  const existingRes = await client.execute({ sql: `SELECT id, title FROM turso_schedules WHERE id = ?`, args: [id] });
  const existing = existingRes.rows[0] as any;
  if (!existing) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  await client.execute({ sql: `DELETE FROM turso_schedule_items WHERE schedule_id = ?`, args: [id] });
  await client.execute({ sql: `DELETE FROM turso_schedules WHERE id = ?`, args: [id] });

  await logActivity(
    req.user!,
    'DELETE_SCHEDULE',
    'schedules',
    id,
    `Deleted schedule "${existing.title}"`,
    req.ip || ''
  );

  return res.json({ success: true });
});

export default router;
