export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024; // Strict 10 MB limit for videos & PDF/documents
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // Raw image limit before client-side compression

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogg|ogv)(?:[?#].*)?$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif|jfif|heic|heif)(?:[?#].*)?$/i;
const DOC_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|txt|csv)(?:[?#].*)?$/i;

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/ogg',
]);

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
]);

const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

export function isVideoUrl(url?: string | null, name?: string | null): boolean {
  const u = String(url || '').trim();
  const n = String(name || '').trim();
  if (!u && !n) return false;
  return VIDEO_EXT_RE.test(u) || VIDEO_EXT_RE.test(n) || u.includes('#video');
}

export function isImageUrl(url?: string | null, name?: string | null): boolean {
  const u = String(url || '').trim();
  const n = String(name || '').trim();
  if (!u && !n) return false;
  if (isVideoUrl(u, n)) return false;
  return IMAGE_EXT_RE.test(u) || IMAGE_EXT_RE.test(n) || u.includes('i.ibb.co');
}

export function isPdfUrl(url?: string | null, name?: string | null): boolean {
  const u = String(url || '').trim();
  const n = String(name || '').trim();
  return /\.pdf(?:[?#].*)?$/i.test(u) || /\.pdf$/i.test(n);
}

export function isVideoFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (ALLOWED_VIDEO_MIMES.has(mime) || mime.startsWith('video/')) {
    return ALLOWED_VIDEO_MIMES.has(mime) || VIDEO_EXT_RE.test(file.name || '');
  }
  return VIDEO_EXT_RE.test(file.name || '');
}

export function isImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/svg+xml' || /\.svg$/i.test(file.name || '')) return false;
  return ALLOWED_IMAGE_MIMES.has(mime) || IMAGE_EXT_RE.test(file.name || '');
}

export function isDocumentFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  return ALLOWED_DOC_MIMES.has(mime) || DOC_EXT_RE.test(file.name || '');
}

export function validateUploadFile(file: File): { ok: true; kind: 'image' | 'video' | 'document' } | { ok: false; error: string } {
  const name = file.name || 'file';
  const mime = (file.type || '').toLowerCase();

  if (mime === 'image/svg+xml' || /\.svg$/i.test(name)) {
    return { ok: false, error: 'SVG files are not allowed. Please upload JPG, PNG, WebP, MP4/WebM video, or PDF/document.' };
  }

  if (isVideoFile(file)) {
    if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
      return { ok: false, error: 'Video file is too large. Maximum allowed size is 10 MB.' };
    }
    return { ok: true, kind: 'video' };
  }

  if (isDocumentFile(file)) {
    if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
      return { ok: false, error: 'PDF / document is too large. Maximum allowed size is 10 MB.' };
    }
    return { ok: true, kind: 'document' };
  }

  if (isImageFile(file)) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      return { ok: false, error: 'Image is too large. Maximum allowed size is 10 MB.' };
    }
    return { ok: true, kind: 'image' };
  }

  return {
    ok: false,
    error: 'Unsupported file type. Only Images (JPG/PNG/WebP), Videos (MP4/WebM/MOV up to 10 MB), and PDF/Documents (up to 10 MB) are allowed.',
  };
}

export function isSafeExternalUrl(rawUrl?: string | null): boolean {
  const val = String(rawUrl || '').trim();
  if (!val) return false;
  if (val.startsWith('#') || val.startsWith('/')) return true;
  try {
    const parsed = new URL(val);
    return (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    );
  } catch {
    return false;
  }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
