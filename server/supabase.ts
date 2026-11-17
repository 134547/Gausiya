import 'dotenv/config';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Response } from 'express';

export const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).trim();
export const SUPABASE_ANON_KEY = (
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  ''
).trim();
export const SUPABASE_SERVICE_ROLE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ''
).trim();

export const isSupabaseServerConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

function isTransientFetchError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || err?.cause?.code || '').toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('network') ||
    code === 'econnreset' ||
    code === 'etimedout' ||
    code === 'und_err_socket' ||
    code === 'und_err_connect_timeout' ||
    code === 'epipe'
  );
}

const resilientSupabaseFetch: typeof fetch = async (input, init) => {
  const isStreamBody =
    init?.body &&
    typeof ReadableStream !== 'undefined' &&
    init.body instanceof ReadableStream;
  const maxAttempts = isStreamBody ? 1 : 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    try {
      let signal = init?.signal;
      if (!signal) {
        controller = new AbortController();
        signal = controller.signal;
        timeoutId = setTimeout(() => controller?.abort(), 25000);
      }

      const response = await fetch(input, { ...init, signal });
      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 250));
        continue;
      }
      return response;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts && (isTransientFetchError(err) || err?.name === 'AbortError')) {
        await new Promise((r) => setTimeout(r, attempt * 250));
        continue;
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Database connection failed');
}

export const supabaseAdmin: SupabaseClient | null = isSupabaseServerConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: resilientSupabaseFetch },
    })
  : null;

export function createSupabaseAuthClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: resilientSupabaseFetch },
  });
}

export function requireSupabaseAdmin(res: Response): SupabaseClient | null {
  if (!supabaseAdmin) {
    res.status(503).json({
      error: 'Supabase is not configured. Please set SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in Secrets / .env.',
      code: 'SUPABASE_NOT_CONFIGURED',
    });
    return null;
  }
  return supabaseAdmin;
}

export const PUBLIC_BUCKETS = new Set([
  'teacher-photos',
  'notices',
  'programs',
  'feed-images',
  'madrasa-assets',
]);

export const PRIVATE_BUCKETS = new Set([
  'student-photos',
  'admission-documents',
  'student-documents',
  'chat-attachments',
]);

export const ALLOWED_BUCKETS = new Set([...PUBLIC_BUCKETS, ...PRIVATE_BUCKETS]);

export async function uploadFileToSupabaseStorage(
  bucket: string,
  buffer: Buffer,
  originalName: string,
  mimetype: string,
  folder = 'general'
): Promise<{ storedRef: string; resolvedUrl: string; bucket: string; path: string }> {
  if (!supabaseAdmin) throw new Error('Supabase storage is not configured');
  const targetBucket = ALLOWED_BUCKETS.has(bucket) ? bucket : 'madrasa-assets';
  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '');
  const objectPath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(targetBucket)
    .upload(objectPath, buffer, { contentType: mimetype || 'application/octet-stream', upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  if (PUBLIC_BUCKETS.has(targetBucket)) {
    const { data } = supabaseAdmin.storage.from(targetBucket).getPublicUrl(objectPath);
    return { storedRef: data.publicUrl, resolvedUrl: data.publicUrl, bucket: targetBucket, path: objectPath };
  }

  const storedRef = `supabase://${targetBucket}/${objectPath}`;
  const { data: signed } = await supabaseAdmin.storage.from(targetBucket).createSignedUrl(objectPath, 3600);
  return {
    storedRef,
    resolvedUrl: signed?.signedUrl || storedRef,
    bucket: targetBucket,
    path: objectPath,
  };
}

const SIGNED_URL_CACHE_TTL_MS = 45 * 60 * 1000;
const MAX_SIGNED_URL_CACHE_SIZE = 2000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function getCachedSignedUrl(key: string): string | null {
  const hit = signedUrlCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    signedUrlCache.delete(key);
    return null;
  }
  return hit.url;
}

function setCachedSignedUrl(key: string, url: string) {
  if (signedUrlCache.size >= MAX_SIGNED_URL_CACHE_SIZE) {
    const firstKey = signedUrlCache.keys().next().value;
    if (firstKey) signedUrlCache.delete(firstKey);
  }
  signedUrlCache.set(key, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_TTL_MS });
}

function parseSupabaseStorageRef(value: string): { bucket: string; objectPath: string } | null {
  if (!value.startsWith('supabase://')) return null;
  const rest = value.slice('supabase://'.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx <= 0) return null;
  return {
    bucket: rest.slice(0, slashIdx),
    objectPath: rest.slice(slashIdx + 1),
  };
}

export async function resolveStorageUrl(value: string | null | undefined): Promise<string> {
  if (!value) return '';
  if (!value.startsWith('supabase://') || !supabaseAdmin) return value;
  const parsed = parseSupabaseStorageRef(value);
  if (!parsed) return value;

  if (PUBLIC_BUCKETS.has(parsed.bucket)) {
    return supabaseAdmin.storage.from(parsed.bucket).getPublicUrl(parsed.objectPath).data.publicUrl;
  }

  const cached = getCachedSignedUrl(value);
  if (cached) return cached;

  const { data } = await supabaseAdmin.storage.from(parsed.bucket).createSignedUrl(parsed.objectPath, 3600);
  if (data?.signedUrl) {
    setCachedSignedUrl(value, data.signedUrl);
    return data.signedUrl;
  }
  return value;
}

export async function resolveStorageUrlsInRows<T extends Record<string, any>>(
  rows: T[],
  fields: string[] = ['photo_url', 'attachment_url', 'featured_photo', 'logo_url']
): Promise<T[]> {
  if (!rows.length || !supabaseAdmin) return rows;

  const resolvedMap = new Map<string, string>();
  const pendingByBucket = new Map<string, Set<string>>();

  for (const row of rows) {
    for (const f of fields) {
      const val = row?.[f];
      if (typeof val !== 'string' || !val.startsWith('supabase://')) continue;
      if (resolvedMap.has(val)) continue;

      const parsed = parseSupabaseStorageRef(val);
      if (!parsed) continue;

      if (PUBLIC_BUCKETS.has(parsed.bucket)) {
        resolvedMap.set(
          val,
          supabaseAdmin.storage.from(parsed.bucket).getPublicUrl(parsed.objectPath).data.publicUrl
        );
        continue;
      }

      const cached = getCachedSignedUrl(val);
      if (cached) {
        resolvedMap.set(val, cached);
        continue;
      }

      if (!pendingByBucket.has(parsed.bucket)) {
        pendingByBucket.set(parsed.bucket, new Set());
      }
      pendingByBucket.get(parsed.bucket)!.add(parsed.objectPath);
    }
  }

  if (pendingByBucket.size > 0) {
    await Promise.all(
      Array.from(pendingByBucket.entries()).map(async ([bucket, pathSet]) => {
        const paths = Array.from(pathSet);
        try {
          const { data } = await supabaseAdmin!.storage.from(bucket).createSignedUrls(paths, 3600);
          for (const item of data || []) {
            if (item?.path && item?.signedUrl) {
              const refKey = `supabase://${bucket}/${item.path}`;
              setCachedSignedUrl(refKey, item.signedUrl);
              resolvedMap.set(refKey, item.signedUrl);
            }
          }
        } catch {
          // fallback leaves original ref or resolves individually later
        }
      })
    );
  }

  return rows.map((row) => {
    let changed = false;
    const next: Record<string, any> = { ...row };
    for (const f of fields) {
      const val = next[f];
      if (typeof val === 'string' && resolvedMap.has(val)) {
        next[f] = resolvedMap.get(val);
        changed = true;
      }
    }
    return (changed ? next : row) as T;
  });
}
