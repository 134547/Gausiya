import crypto from 'node:crypto';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

export const TURSO_CHUNK_SIZE_BYTES = 512 * 1024; // 512 KB chunks for reliable 10 MB uploads & Range video streaming
export const TURSO_MAX_FILE_BYTES = 10 * 1024 * 1024; // Strict 10 MB maximum for PDFs, videos & large files

const PUBLIC_TURSO_BUCKETS = new Set([
  'teacher-photos',
  'notices',
  'programs',
  'feed-images',
  'madrasa-assets',
]);

let cachedClient: Client | null = null;
let cachedClientKey = '';
let schemaInitPromise: Promise<void> | null = null;
let schedulesSchemaInitPromise: Promise<void> | null = null;

export function getTursoUrl(): string {
  return (process.env.TURSO_DATABASE_URL || '').trim();
}

export function getTursoAuthToken(): string {
  return (process.env.TURSO_AUTH_TOKEN || '').trim();
}

export function isTursoConfigured(): boolean {
  return Boolean(getTursoUrl() && getTursoAuthToken());
}

function getSigningSecret(): string {
  return (
    process.env.TURSO_AUTH_TOKEN ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.IMGBB_API_KEY ||
    'madrasa-turso-media-signing-key'
  );
}

export function getTursoClient(): Client {
  const url = getTursoUrl();
  const authToken = getTursoAuthToken();
  if (!url || !authToken) {
    const err: any = new Error(
      'Turso database is not configured yet. Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Secrets / .env.'
    );
    err.status = 503;
    throw err;
  }

  const key = `${url}::${authToken.slice(0, 12)}`;
  if (!cachedClient || cachedClientKey !== key) {
    cachedClient = createClient({ url, authToken });
    cachedClientKey = key;
    schemaInitPromise = null;
    schedulesSchemaInitPromise = null;
  }
  return cachedClient;
}

export async function ensureTursoMediaSchema(): Promise<void> {
  if (!isTursoConfigured()) return;
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      const client = getTursoClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS turso_media_files (
          id TEXT PRIMARY KEY,
          original_name TEXT NOT NULL,
          mimetype TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          bucket TEXT NOT NULL,
          folder TEXT NOT NULL DEFAULT 'general',
          is_public INTEGER NOT NULL DEFAULT 1,
          uploaded_by TEXT NOT NULL DEFAULT '',
          chunk_size INTEGER NOT NULL DEFAULT 524288,
          chunk_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'ready',
          created_at TEXT NOT NULL
        )
      `);
      await client.execute(`
        CREATE TABLE IF NOT EXISTS turso_media_chunks (
          file_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          data BLOB NOT NULL,
          PRIMARY KEY (file_id, chunk_index)
        )
      `);
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_turso_media_files_created
        ON turso_media_files (created_at DESC)
      `);
    })().catch((err) => {
      schemaInitPromise = null;
      throw err;
    });
  }
  return schemaInitPromise;
}

export async function ensureTursoSchedulesSchema(): Promise<void> {
  if (!isTursoConfigured()) return;
  if (!schedulesSchemaInitPromise) {
    schedulesSchemaInitPromise = (async () => {
      const client = getTursoClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS turso_schedules (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'Daily Timetable',
          target_audience TEXT NOT NULL DEFAULT 'student',
          target_audiences_json TEXT NOT NULL DEFAULT '["student"]',
          target_class_id TEXT NOT NULL DEFAULT '',
          target_class_name TEXT NOT NULL DEFAULT '',
          start_date TEXT NOT NULL DEFAULT '',
          end_date TEXT NOT NULL DEFAULT '',
          effective_days TEXT NOT NULL DEFAULT 'Mon - Sat',
          status TEXT NOT NULL DEFAULT 'draft',
          is_pinned INTEGER NOT NULL DEFAULT 0,
          attachment_url TEXT NOT NULL DEFAULT '',
          attachment_name TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL,
          created_by_name TEXT NOT NULL DEFAULT 'Super Admin',
          published_at TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await client.execute(`
        CREATE TABLE IF NOT EXISTS turso_schedule_items (
          id TEXT PRIMARY KEY,
          schedule_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          day_label TEXT NOT NULL DEFAULT 'Daily',
          start_time TEXT NOT NULL DEFAULT '',
          end_time TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL,
          details TEXT NOT NULL DEFAULT '',
          assigned_to TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          FOREIGN KEY (schedule_id) REFERENCES turso_schedules(id) ON DELETE CASCADE
        )
      `);
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_turso_schedules_status_updated
        ON turso_schedules (status, is_pinned DESC, updated_at DESC)
      `);
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_turso_schedules_audience
        ON turso_schedules (target_audience)
      `);
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_turso_schedule_items_schedule
        ON turso_schedule_items (schedule_id, sort_order ASC)
      `);
    })().catch((err) => {
      schedulesSchemaInitPromise = null;
      throw err;
    });
  }
  return schedulesSchemaInitPromise;
}

export async function ensureAllTursoSchemas(): Promise<void> {
  if (!isTursoConfigured()) return;
  await Promise.all([ensureTursoMediaSchema(), ensureTursoSchedulesSchema()]);
}

export async function getTursoTablesStatus(): Promise<{
  configured: boolean;
  tables: string[];
}> {
  if (!isTursoConfigured()) {
    return { configured: false, tables: [] };
  }
  await ensureAllTursoSchemas();
  const client = getTursoClient();
  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'turso_%' ORDER BY name ASC`
  );
  return {
    configured: true,
    tables: (res.rows as any[]).map((r) => String(r.name || '')).filter(Boolean),
  };
}

export function sanitizeMediaFilename(originalName: string): string {
  const ext = path.extname(originalName || '').replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
  const base = path
    .basename(originalName || 'file', path.extname(originalName || ''))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
  return `${base || 'file'}${ext}`;
}

export function buildTursoStoredRef(id: string, originalName: string, isPublic: boolean): string {
  const safeName = sanitizeMediaFilename(originalName);
  const visibility = isPublic ? 'pub' : 'priv';
  return `turso://${visibility}/${id}/${safeName}`;
}

export function parseTursoStoredRef(
  value: string | null | undefined
): { id: string; filename: string; isPublic: boolean } | null {
  if (!value || !value.startsWith('turso://')) return null;
  const rest = value.slice('turso://'.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length >= 3 && (parts[0] === 'pub' || parts[0] === 'priv')) {
    return {
      isPublic: parts[0] === 'pub',
      id: parts[1],
      filename: parts.slice(2).join('/'),
    };
  }
  if (parts.length === 2) {
    return {
      isPublic: true,
      id: parts[0],
      filename: parts[1],
    };
  }
  if (parts.length === 1) {
    return {
      isPublic: true,
      id: parts[0],
      filename: 'file',
    };
  }
  return null;
}

export function signTursoMediaToken(fileId: string, ttlSeconds = 7200): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${fileId}:${exp}`)
    .digest('hex');
  return { exp, sig };
}

export function verifyTursoMediaToken(fileId: string, expRaw: unknown, sigRaw: unknown): boolean {
  const exp = Number(expRaw);
  const sig = String(sigRaw || '').trim();
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000) || !sig) return false;
  const expected = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${fileId}:${exp}`)
    .digest('hex');
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function resolveTursoMediaUrl(value: string): string {
  const parsed = parseTursoStoredRef(value);
  if (!parsed) return value;
  const encodedName = encodeURIComponent(parsed.filename || 'file');
  const basePath = `/api/media/${encodeURIComponent(parsed.id)}/${encodedName}`;
  if (parsed.isPublic) {
    return basePath;
  }
  const { exp, sig } = signTursoMediaToken(parsed.id, 7200);
  return `${basePath}?exp=${exp}&sig=${sig}`;
}

export function normalizeTursoMediaUrlToRef(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('turso://')) return url;
  const match = url.match(/\/api\/media\/([a-zA-Z0-9_-]+)(?:\/([^?#]+))?(?:\?([^#]*))?/);
  if (!match) return null;
  const id = match[1];
  const filename = match[2] ? decodeURIComponent(match[2]) : 'file';
  const query = match[3] || '';
  const isPrivate = /(?:^|&)sig=/.test(query);
  return buildTursoStoredRef(id, filename, !isPrivate);
}

export async function uploadBufferToTurso(options: {
  buffer: Buffer;
  originalName: string;
  mimetype: string;
  bucket: string;
  folder?: string;
  uploadedBy?: string;
}): Promise<{ id: string; storedRef: string; resolvedUrl: string }> {
  const { buffer, originalName, mimetype, bucket, folder = 'general', uploadedBy = '' } = options;
  if (buffer.length > TURSO_MAX_FILE_BYTES) {
    const err: any = new Error('Uploaded file is too large. Maximum allowed size is 10 MB.');
    err.status = 413;
    throw err;
  }

  await ensureTursoMediaSchema();
  const client = getTursoClient();
  const id = crypto.randomUUID().replace(/-/g, '');
  const safeName = sanitizeMediaFilename(originalName);
  const isPublic = PUBLIC_TURSO_BUCKETS.has(bucket);
  const chunkCount = Math.max(1, Math.ceil(buffer.length / TURSO_CHUNK_SIZE_BYTES));
  const nowIso = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO turso_media_files
        (id, original_name, mimetype, size_bytes, bucket, folder, is_public, uploaded_by, chunk_size, chunk_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)
    `,
    args: [
      id,
      safeName,
      mimetype || 'application/octet-stream',
      buffer.length,
      bucket || 'madrasa-assets',
      folder,
      isPublic ? 1 : 0,
      uploadedBy,
      TURSO_CHUNK_SIZE_BYTES,
      chunkCount,
      nowIso,
    ],
  });

  try {
    for (let i = 0; i < chunkCount; i++) {
      const start = i * TURSO_CHUNK_SIZE_BYTES;
      const end = Math.min(buffer.length, start + TURSO_CHUNK_SIZE_BYTES);
      const slice = new Uint8Array(buffer.subarray(start, end));
      await client.execute({
        sql: `INSERT INTO turso_media_chunks (file_id, chunk_index, data) VALUES (?, ?, ?)`,
        args: [id, i, slice],
      });
    }

    await client.execute({
      sql: `UPDATE turso_media_files SET status = 'ready' WHERE id = ?`,
      args: [id],
    });
  } catch (err) {
    // Clean up partial chunks on failure
    await client.execute({ sql: `DELETE FROM turso_media_chunks WHERE file_id = ?`, args: [id] }).catch(() => {});
    await client.execute({ sql: `DELETE FROM turso_media_files WHERE id = ?`, args: [id] }).catch(() => {});
    throw err;
  }

  const storedRef = buildTursoStoredRef(id, safeName, isPublic);
  return {
    id,
    storedRef,
    resolvedUrl: resolveTursoMediaUrl(storedRef),
  };
}

export async function initTursoChunkedUpload(options: {
  originalName: string;
  mimetype: string;
  sizeBytes: number;
  bucket: string;
  folder?: string;
  uploadedBy: string;
}): Promise<{ fileId: string; chunkSize: number; chunkCount: number; safeName: string; isPublic: boolean }> {
  const { originalName, mimetype, sizeBytes, bucket, folder = 'general', uploadedBy } = options;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    const err: any = new Error('Invalid file size.');
    err.status = 400;
    throw err;
  }
  if (sizeBytes > TURSO_MAX_FILE_BYTES) {
    const err: any = new Error('Uploaded file is too large. Maximum allowed size is 10 MB.');
    err.status = 413;
    throw err;
  }

  await ensureTursoMediaSchema();
  const client = getTursoClient();
  const id = crypto.randomUUID().replace(/-/g, '');
  const safeName = sanitizeMediaFilename(originalName);
  const isPublic = PUBLIC_TURSO_BUCKETS.has(bucket);
  const chunkCount = Math.max(1, Math.ceil(sizeBytes / TURSO_CHUNK_SIZE_BYTES));

  await client.execute({
    sql: `
      INSERT INTO turso_media_files
        (id, original_name, mimetype, size_bytes, bucket, folder, is_public, uploaded_by, chunk_size, chunk_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)
    `,
    args: [
      id,
      safeName,
      mimetype || 'application/octet-stream',
      sizeBytes,
      bucket || 'madrasa-assets',
      folder,
      isPublic ? 1 : 0,
      uploadedBy,
      TURSO_CHUNK_SIZE_BYTES,
      chunkCount,
      new Date().toISOString(),
    ],
  });

  return { fileId: id, chunkSize: TURSO_CHUNK_SIZE_BYTES, chunkCount, safeName, isPublic };
}

export async function saveTursoUploadChunk(options: {
  fileId: string;
  chunkIndex: number;
  buffer: Buffer;
  uploadedBy: string;
}): Promise<void> {
  const { fileId, chunkIndex, buffer, uploadedBy } = options;
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    const err: any = new Error('Invalid chunk index');
    err.status = 400;
    throw err;
  }
  if (buffer.length > TURSO_CHUNK_SIZE_BYTES + 64 * 1024) {
    const err: any = new Error('Chunk exceeds maximum chunk size');
    err.status = 413;
    throw err;
  }

  await ensureTursoMediaSchema();
  const client = getTursoClient();
  const metaRes = await client.execute({
    sql: `SELECT id, uploaded_by, status, chunk_count FROM turso_media_files WHERE id = ?`,
    args: [fileId],
  });
  const row = metaRes.rows[0] as any;
  if (!row) {
    const err: any = new Error('Upload session not found');
    err.status = 404;
    throw err;
  }
  if (String(row.uploaded_by) !== uploadedBy) {
    const err: any = new Error('Access denied for this upload session');
    err.status = 403;
    throw err;
  }
  if (String(row.status) !== 'uploading') {
    const err: any = new Error('Upload session is already finalized');
    err.status = 400;
    throw err;
  }
  if (chunkIndex >= Number(row.chunk_count)) {
    const err: any = new Error('Chunk index out of bounds');
    err.status = 400;
    throw err;
  }

  await client.execute({
    sql: `INSERT OR REPLACE INTO turso_media_chunks (file_id, chunk_index, data) VALUES (?, ?, ?)`,
    args: [fileId, chunkIndex, new Uint8Array(buffer)],
  });
}

export async function finalizeTursoChunkedUpload(options: {
  fileId: string;
  uploadedBy: string;
}): Promise<{
  id: string;
  storedRef: string;
  resolvedUrl: string;
  name: string;
  mimetype: string;
  size: number;
}> {
  const { fileId, uploadedBy } = options;
  await ensureTursoMediaSchema();
  const client = getTursoClient();

  const metaRes = await client.execute({
    sql: `SELECT id, original_name, mimetype, size_bytes, is_public, uploaded_by, chunk_count, status FROM turso_media_files WHERE id = ?`,
    args: [fileId],
  });
  const row = metaRes.rows[0] as any;
  if (!row) {
    const err: any = new Error('Upload session not found');
    err.status = 404;
    throw err;
  }
  if (String(row.uploaded_by) !== uploadedBy) {
    const err: any = new Error('Access denied for this upload session');
    err.status = 403;
    throw err;
  }

  const countRes = await client.execute({
    sql: `SELECT COUNT(*) as cnt, COALESCE(SUM(LENGTH(data)), 0) as total_bytes FROM turso_media_chunks WHERE file_id = ?`,
    args: [fileId],
  });
  const cnt = Number((countRes.rows[0] as any)?.cnt || 0);
  const totalBytes = Number((countRes.rows[0] as any)?.total_bytes || 0);

  if (cnt < Number(row.chunk_count)) {
    const err: any = new Error(`Upload incomplete (${cnt}/${row.chunk_count} chunks received). Please retry.`);
    err.status = 400;
    throw err;
  }
  if (totalBytes > TURSO_MAX_FILE_BYTES) {
    await client.execute({ sql: `DELETE FROM turso_media_chunks WHERE file_id = ?`, args: [fileId] }).catch(() => {});
    await client.execute({ sql: `DELETE FROM turso_media_files WHERE id = ?`, args: [fileId] }).catch(() => {});
    const err: any = new Error('Uploaded file exceeds the strict 10 MB maximum limit.');
    err.status = 413;
    throw err;
  }

  await client.execute({
    sql: `UPDATE turso_media_files SET status = 'ready', size_bytes = ? WHERE id = ?`,
    args: [totalBytes, fileId],
  });

  const isPublic = Number(row.is_public) === 1;
  const safeName = String(row.original_name || 'file');
  const storedRef = buildTursoStoredRef(fileId, safeName, isPublic);
  return {
    id: fileId,
    storedRef,
    resolvedUrl: resolveTursoMediaUrl(storedRef),
    name: safeName,
    mimetype: String(row.mimetype || 'application/octet-stream'),
    size: totalBytes,
  };
}

export interface TursoMediaMeta {
  id: string;
  original_name: string;
  mimetype: string;
  size_bytes: number;
  bucket: string;
  is_public: boolean;
  chunk_size: number;
  chunk_count: number;
  created_at: string;
}

export async function getTursoMediaMeta(fileId: string): Promise<TursoMediaMeta | null> {
  if (!isTursoConfigured()) return null;
  await ensureTursoMediaSchema();
  const client = getTursoClient();
  const res = await client.execute({
    sql: `SELECT id, original_name, mimetype, size_bytes, bucket, is_public, chunk_size, chunk_count, created_at FROM turso_media_files WHERE id = ? AND status = 'ready'`,
    args: [fileId],
  });
  const row = res.rows[0] as any;
  if (!row) return null;
  return {
    id: String(row.id),
    original_name: String(row.original_name || 'file'),
    mimetype: String(row.mimetype || 'application/octet-stream'),
    size_bytes: Number(row.size_bytes || 0),
    bucket: String(row.bucket || 'madrasa-assets'),
    is_public: Number(row.is_public) === 1,
    chunk_size: Number(row.chunk_size || TURSO_CHUNK_SIZE_BYTES),
    chunk_count: Number(row.chunk_count || 0),
    created_at: String(row.created_at || ''),
  };
}

export async function readTursoMediaByteRange(
  meta: TursoMediaMeta,
  startByte: number,
  endByte: number
): Promise<Buffer> {
  const client = getTursoClient();
  const chunkSize = meta.chunk_size || TURSO_CHUNK_SIZE_BYTES;
  const startChunk = Math.floor(startByte / chunkSize);
  const endChunk = Math.floor(endByte / chunkSize);

  const res = await client.execute({
    sql: `
      SELECT chunk_index, data
      FROM turso_media_chunks
      WHERE file_id = ? AND chunk_index >= ? AND chunk_index <= ?
      ORDER BY chunk_index ASC
    `,
    args: [meta.id, startChunk, endChunk],
  });

  const buffers: Buffer[] = [];
  for (const row of res.rows as any[]) {
    const raw = row.data;
    const chunkBuf =
      Buffer.isBuffer(raw)
        ? raw
        : raw instanceof Uint8Array
          ? Buffer.from(raw)
          : raw instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(raw))
            : Buffer.from(String(raw || ''), 'binary');

    const cIdx = Number(row.chunk_index);
    const chunkStartGlobal = cIdx * chunkSize;
    const sliceStart = Math.max(0, startByte - chunkStartGlobal);
    const sliceEnd = Math.min(chunkBuf.length, endByte - chunkStartGlobal + 1);
    if (sliceEnd > sliceStart) {
      buffers.push(chunkBuf.subarray(sliceStart, sliceEnd));
    }
  }

  return Buffer.concat(buffers);
}
