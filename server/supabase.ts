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
  ''
).trim();

export const isSupabaseServerConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

export const supabaseAdmin: SupabaseClient | null = isSupabaseServerConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export function createSupabaseAuthClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
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

export async function resolveStorageUrl(value: string | null | undefined): Promise<string> {
  if (!value) return '';
  if (!value.startsWith('supabase://') || !supabaseAdmin) return value;
  const rest = value.slice('supabase://'.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx <= 0) return value;
  const bucket = rest.slice(0, slashIdx);
  const objectPath = rest.slice(slashIdx + 1);
  if (PUBLIC_BUCKETS.has(bucket)) {
    return supabaseAdmin.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
  }
  const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(objectPath, 3600);
  return data?.signedUrl || value;
}

export async function resolveStorageUrlsInRows<T extends Record<string, any>>(
  rows: T[],
  fields: string[] = ['photo_url', 'attachment_url', 'featured_photo', 'logo_url']
): Promise<T[]> {
  if (!rows.length || !supabaseAdmin) return rows;
  return Promise.all(
    rows.map(async (row) => {
      const next = { ...row };
      for (const f of fields) {
        if (typeof next[f] === 'string' && next[f].startsWith('supabase://')) {
          (next as any)[f] = await resolveStorageUrl(next[f]);
        }
      }
      return next;
    })
  );
}
