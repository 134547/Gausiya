import path from 'node:path';
import { isSupabaseServerConfigured, uploadFileToSupabaseStorage } from './supabase.ts';

export function getImgbbApiKey(): string {
  return (process.env.IMGBB_API_KEY || '').trim();
}

export function isImgbbConfigured(): boolean {
  return Boolean(getImgbbApiKey());
}

export interface UploadedAssetResult {
  url: string;
  storedRef: string;
  provider: 'imgbb' | 'supabase';
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.jfif', '.heic', '.heif']);

function isImageAsset(mimetype: string, originalName: string): boolean {
  if (mimetype.startsWith('image/')) return true;
  const ext = path.extname(originalName || '').toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export async function uploadImageToImgbb(
  buffer: Buffer,
  originalName: string,
  mimetype: string
): Promise<{ url: string; displayUrl: string; deleteUrl: string }> {
  const apiKey = getImgbbApiKey();
  if (!apiKey) {
    const err: any = new Error('IMGBB_API_KEY is not configured. Please add IMGBB_API_KEY to Secrets / .env.');
    err.status = 503;
    throw err;
  }

  if (!isImageAsset(mimetype, originalName)) {
    const err: any = new Error('ImgBB only supports image files.');
    err.status = 400;
    throw err;
  }

  const baseName = path
    .basename(originalName || 'image', path.extname(originalName || ''))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60);

  const formData = new FormData();
  formData.append('image', buffer.toString('base64'));
  if (baseName) {
    formData.append('name', `${baseName}_${Date.now()}`);
  }

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok || !payload?.success || !payload?.data) {
    const message =
      payload?.error?.message ||
      payload?.status_txt ||
      `ImgBB upload failed (${response.status})`;
    const err: any = new Error(message);
    err.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw err;
  }

  const directUrl = String(payload.data.url || payload.data.display_url || '');
  if (!directUrl) {
    throw new Error('ImgBB did not return an image URL.');
  }

  return {
    url: directUrl,
    displayUrl: String(payload.data.display_url || directUrl),
    deleteUrl: String(payload.data.delete_url || ''),
  };
}

export async function saveUploadedAsset(options: {
  buffer: Buffer;
  originalName: string;
  mimetype: string;
  bucket?: string;
  folder?: string;
}): Promise<UploadedAssetResult> {
  const { buffer, originalName, mimetype, bucket = 'madrasa-assets', folder = 'general' } = options;

  if (isImageAsset(mimetype, originalName)) {
    if (isImgbbConfigured()) {
      try {
        const imgbb = await uploadImageToImgbb(buffer, originalName, mimetype);
        return {
          url: imgbb.url,
          storedRef: imgbb.url,
          provider: 'imgbb',
        };
      } catch (imgbbErr: any) {
        if (isSupabaseServerConfigured) {
          console.warn('ImgBB upload fallback to Supabase Storage:', imgbbErr?.message || imgbbErr);
          const supa = await uploadFileToSupabaseStorage(bucket, buffer, originalName, mimetype, folder);
          return {
            url: supa.resolvedUrl,
            storedRef: supa.storedRef,
            provider: 'supabase',
          };
        }
        throw imgbbErr;
      }
    }

    if (isSupabaseServerConfigured) {
      const supa = await uploadFileToSupabaseStorage(bucket, buffer, originalName, mimetype, folder);
      return {
        url: supa.resolvedUrl,
        storedRef: supa.storedRef,
        provider: 'supabase',
      };
    }

    const err: any = new Error(
      'Image upload requires IMGBB_API_KEY (or Supabase Storage) configured in Secrets / .env.'
    );
    err.status = 503;
    throw err;
  }

  if (!isSupabaseServerConfigured) {
    const err: any = new Error(
      'Non-image attachments require Supabase Storage, or upload an image file (JPG/PNG/WebP) to save via ImgBB.'
    );
    err.status = 503;
    throw err;
  }

  const supa = await uploadFileToSupabaseStorage(bucket, buffer, originalName, mimetype, folder);
  return {
    url: supa.resolvedUrl,
    storedRef: supa.storedRef,
    provider: 'supabase',
  };
}
