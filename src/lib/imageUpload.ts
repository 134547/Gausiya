export interface SafeJsonResult<T = any> {
  data: T | null;
  rawText: string;
}

export async function safeReadJson<T = any>(res: Response): Promise<SafeJsonResult<T>> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    return { data: null, rawText: '' };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return { data: null, rawText };
  }

  try {
    return { data: JSON.parse(trimmed) as T, rawText };
  } catch {
    return { data: null, rawText };
  }
}

export function formatHttpErrorMessage(
  status: number,
  data: any,
  rawText: string,
  fallback = 'Request failed'
): string {
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
    if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  }

  if (status === 413) {
    return 'File is too large for upload (max 4 MB). Please select a smaller photo or wait for automatic compression.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Server is temporarily busy or timed out. Please try again in a moment.';
  }
  if (status === 404) {
    return 'Requested endpoint was not found (404).';
  }

  const trimmed = (rawText || '').trim();
  if (trimmed && !trimmed.startsWith('<') && trimmed.length < 220) {
    return trimmed;
  }

  return `${fallback} (${status})`;
}

const MAX_UPLOAD_BYTES = 3.8 * 1024 * 1024; // Stay safely under Vercel's 4.5MB serverless payload limit

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or unreadable image file.'));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

function replaceFileExt(name: string, newExt: string): string {
  const clean = (name || 'photo').replace(/\.[^/.]+$/, '');
  return `${clean || 'photo'}.${newExt}`;
}

export async function compressImageForUpload(
  file: File,
  options?: { maxDimension?: number; targetBytes?: number }
): Promise<File> {
  const name = file.name || 'upload';
  const type = (file.type || '').toLowerCase();
  const isSvgOrGif = type === 'image/svg+xml' || type === 'image/gif' || /\.(svg|gif)$/i.test(name);
  const isImage =
    type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|avif|jfif|heic|heif)$/i.test(name);

  if (!isImage || isSvgOrGif) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('File is too large (max 3.8 MB). Please upload a smaller file.');
    }
    return file;
  }

  // Tiny images already well under threshold don't need re-encoding unless huge dimensions
  if (file.size <= 160 * 1024) {
    return file;
  }

  const maxDimension = options?.maxDimension || 1400;
  const targetBytes = options?.targetBytes || 900 * 1024;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await Promise.race([
      loadImageElement(objectUrl),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('Image decoding timed out')), 6000)
      ),
    ]);

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    if (!origW || !origH) {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('Image is too large (max 3.8 MB). Please upload a smaller JPG or PNG image.');
      }
      return file;
    }

    const scale = Math.min(1, maxDimension / Math.max(origW, origH));
    let outW = Math.max(1, Math.round(origW * scale));
    let outH = Math.max(1, Math.round(origH * scale));

    // Preserve alpha transparency for PNG logos/graphics via WebP when supported; otherwise use white-backed JPEG
    const isPng = type === 'image/png' || /\.png$/i.test(name);
    let outputMime = isPng ? 'image/webp' : 'image/jpeg';
    let outputExt = isPng ? 'webp' : 'jpg';

    const drawAndEncode = async (w: number, h: number, mime: string, quality: number): Promise<Blob | null> => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      return canvasToBlob(canvas, mime, quality);
    };

    let blob = await drawAndEncode(outW, outH, outputMime, 0.82);

    // Fallback to JPEG if browser cannot encode WebP
    if (!blob || (outputMime === 'image/webp' && blob.type !== 'image/webp')) {
      outputMime = 'image/jpeg';
      outputExt = 'jpg';
      blob = await drawAndEncode(outW, outH, outputMime, 0.82);
    }

    // If still larger than targetBytes, run one more downscaled pass for fast mobile uploads
    if (blob && blob.size > targetBytes) {
      const shrinkScale = Math.min(1, 1080 / Math.max(outW, outH));
      outW = Math.max(1, Math.round(outW * shrinkScale));
      outH = Math.max(1, Math.round(outH * shrinkScale));
      const smallerBlob = await drawAndEncode(outW, outH, 'image/jpeg', 0.68);
      if (smallerBlob && smallerBlob.size < blob.size) {
        blob = smallerBlob;
        outputMime = 'image/jpeg';
        outputExt = 'jpg';
      }
    }

    if (blob && (blob.size < file.size || file.size > MAX_UPLOAD_BYTES || scale < 1)) {
      if (blob.size > MAX_UPLOAD_BYTES) {
        throw new Error('Compressed image still exceeds 3.8 MB. Please select a smaller photo.');
      }
      return new File([blob], replaceFileExt(name, outputExt), {
        type: outputMime,
        lastModified: Date.now(),
      });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('Image is too large (max 3.8 MB). Please upload a smaller JPG or PNG image.');
    }
    return file;
  } catch (err: any) {
    // If decoding failed (e.g. unsupported codec like HEIC on Chrome) but file is small enough, let server decide; otherwise block nicely
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        err?.message && err.message.includes('3.8 MB')
          ? err.message
          : 'Photo is too large (max 3.8 MB). Please choose a smaller JPG or PNG photo.'
      );
    }
    if (/\.(heic|heif)$/i.test(name)) {
      throw new Error('HEIC photos are not supported by all browsers. Please select a JPG or PNG image.');
    }
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
