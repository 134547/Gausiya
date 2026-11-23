import path from 'node:path';
import { isTursoConfigured, uploadBufferToTurso } from './turso.ts';

export function getImgbbApiKey(): string {
  return (process.env.IMGBB_API_KEY || '').trim();
}

export function isImgbbConfigured(): boolean {
  return Boolean(getImgbbApiKey());
}

export interface UploadedAssetResult {
  url: string;
  storedRef: string;
  provider: 'imgbb' | 'turso';
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.jfif', '.heic', '.heif']);
const LARGE_FILE_TURSO_THRESHOLD_BYTES = 1.5 * 1024 * 1024; // Files > 1.5 MB always go to Turso

function isImageAsset(mimetype: string, originalName: string): boolean {
  const mime = (mimetype || '').toLowerCase();
  if (mime === 'image/svg+xml' || /\.svg$/i.test(originalName || '')) return false;
  if (mime.startsWith('image/')) return true;
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
  uploadedBy?: string;
}): Promise<UploadedAssetResult> {
  const {
    buffer,
    originalName,
    mimetype,
    bucket = 'madrasa-assets',
    folder = 'general',
    uploadedBy = '',
  } = options;

  const isImg = isImageAsset(mimetype, originalName);
  const isLarge = buffer.length > LARGE_FILE_TURSO_THRESHOLD_BYTES;

  // Lightweight images (<= 1.5 MB) use ImgBB when configured, falling back to Turso
  if (isImg && !isLarge) {
    if (isImgbbConfigured()) {
      try {
        const imgbb = await uploadImageToImgbb(buffer, originalName, mimetype);
        return {
          url: imgbb.url,
          storedRef: imgbb.url,
          provider: 'imgbb',
        };
      } catch (imgbbErr: any) {
        if (isTursoConfigured()) {
          console.warn('ImgBB upload fallback to Turso media DB:', imgbbErr?.message || imgbbErr);
          const tursoRes = await uploadBufferToTurso({
            buffer,
            originalName,
            mimetype,
            bucket,
            folder,
            uploadedBy,
          });
          return {
            url: tursoRes.resolvedUrl,
            storedRef: tursoRes.storedRef,
            provider: 'turso',
          };
        }
        throw imgbbErr;
      }
    }
  }

  // ALL Videos, PDFs, Documents, and Large Files (> 1.5 MB) are stored strictly in Turso (never Supabase Storage)
  if (!isTursoConfigured()) {
    const err: any = new Error(
      'Turso database is not configured yet for PDF, video & large file storage. Please add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to Secrets / .env.'
    );
    err.status = 503;
    throw err;
  }

  const tursoRes = await uploadBufferToTurso({
    buffer,
    originalName,
    mimetype,
    bucket,
    folder,
    uploadedBy,
  });
  return {
    url: tursoRes.resolvedUrl,
    storedRef: tursoRes.storedRef,
    provider: 'turso',
  };
}
