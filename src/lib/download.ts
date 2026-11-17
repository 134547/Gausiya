export interface DownloadableFeedPost {
  id?: string;
  title?: string;
  content?: string;
  author_name?: string;
  author_role?: string;
  created_at?: string;
  images?: string[];
  institutionName?: string;
}

export function sanitizeFileName(raw: string, fallback = 'madrasa-file'): string {
  const cleaned = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

function extensionFromMime(mime: string, fallbackUrl = ''): string {
  const clean = mime.split(';')[0].trim().toLowerCase();
  if (clean === 'image/png') return 'png';
  if (clean === 'image/webp') return 'webp';
  if (clean === 'image/gif') return 'gif';
  if (clean === 'image/svg+xml') return 'svg';
  if (clean === 'image/jpeg' || clean === 'image/jpg') return 'jpg';
  const match = fallbackUrl.split('?')[0].match(/\.(png|jpe?g|webp|gif|svg)$/i);
  if (match) {
    return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  }
  return 'jpg';
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header?.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64Data || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function resolveImageDataUrl(url: string): Promise<string> {
  if (!url) throw new Error('Image URL is missing');
  if (url.startsWith('data:image/')) {
    return url;
  }

  const isLocalOrBlob =
    url.startsWith('blob:') ||
    url.startsWith('/') ||
    (typeof window !== 'undefined' && url.startsWith(window.location.origin));

  if (!isLocalOrBlob) {
    try {
      const proxyRes = await fetch(`/api/public/image-data?url=${encodeURIComponent(url)}`);
      if (proxyRes.ok) {
        const data = (await proxyRes.json().catch(() => null)) as { dataUrl?: string } | null;
        if (data?.dataUrl && data.dataUrl.startsWith('data:image/')) {
          return data.dataUrl;
        }
      }
    } catch {
      // Fall back to direct fetch if CORS allows it
    }
  }

  const directRes = await fetch(url);
  if (!directRes.ok) {
    throw new Error('Failed to fetch image for download');
  }
  const blob = await directRes.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read image bytes'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to convert image'));
    reader.readAsDataURL(blob);
  });
}

export async function downloadImageFile(url: string, baseName = 'madrasa-image'): Promise<void> {
  const dataUrl = await resolveImageDataUrl(url);
  const blob = dataUrlToBlob(dataUrl);
  const ext = extensionFromMime(blob.type, url);
  const fileName = `${sanitizeFileName(baseName, 'madrasa-image')}.${ext}`;
  triggerBlobDownload(blob, fileName);
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = String(text || '').split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        // Handle super long single tokens
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

export async function downloadFeedPostCard(
  post: DownloadableFeedPost,
  preferredImageIndex = 0
): Promise<void> {
  const width = 1200;
  const padX = 56;
  const innerWidth = width - padX * 2;
  const headerH = 156;
  const footerH = 92;

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = width;
  measureCanvas.height = 400;
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) {
    throw new Error('Canvas not supported in this browser');
  }

  const titleText = (post.title || '').trim();
  const contentText = (post.content || '').trim();

  mCtx.font = '700 34px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  const titleLines = titleText ? wrapCanvasLines(mCtx, titleText, innerWidth) : [];

  mCtx.font = '400 24px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  const contentLines = contentText ? wrapCanvasLines(mCtx, contentText, innerWidth) : [];

  // Load attached photo if available
  const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
  const chosenUrl = images[Math.min(preferredImageIndex, Math.max(0, images.length - 1))] || '';
  let loadedImg: HTMLImageElement | null = null;
  if (chosenUrl) {
    try {
      const dataUrl = await resolveImageDataUrl(chosenUrl);
      loadedImg = await loadHtmlImage(dataUrl);
    } catch {
      loadedImg = null;
    }
  }

  let drawImgW = 0;
  let drawImgH = 0;
  if (loadedImg && loadedImg.naturalWidth > 0 && loadedImg.naturalHeight > 0) {
    const maxImgW = innerWidth;
    const maxImgH = 720;
    const scale = Math.min(maxImgW / loadedImg.naturalWidth, maxImgH / loadedImg.naturalHeight, 1.8);
    drawImgW = Math.round(loadedImg.naturalWidth * scale);
    drawImgH = Math.round(loadedImg.naturalHeight * scale);
  }

  const authorBlockH = 96;
  const titleBlockH = titleLines.length > 0 ? titleLines.length * 46 + 18 : 0;
  const contentBlockH = contentLines.length > 0 ? contentLines.length * 36 + 24 : 0;
  const imgBlockH = drawImgH > 0 ? drawImgH + 40 : 0;
  const totalHeight = Math.max(
    520,
    headerH + 36 + authorBlockH + titleBlockH + contentBlockH + imgBlockH + 28 + footerH
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context unavailable');
  }

  // Background
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, width, totalHeight);

  // Header Banner
  const headerGrad = ctx.createLinearGradient(0, 0, width, headerH);
  headerGrad.addColorStop(0, '#3B0A0D');
  headerGrad.addColorStop(1, '#581115');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerH);

  // Top crimson accent bar
  ctx.fillStyle = '#DC1726';
  ctx.fillRect(0, 0, width, 8);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 32px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText(post.institutionName || 'Madrasa Ghausia Razvia', padX, 62);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '500 19px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText('Islamnagar, Ramgarh, Palamu, Jharkhand · Official Madrasa Feed', padX, 98);

  ctx.fillStyle = '#FCA5A5';
  ctx.font = '600 15px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText('COMMUNITY UPDATE & NOTICE', padX, 130);

  let y = headerH + 36;

  // Author row
  const authorName = post.author_name || 'Administration';
  const authorRole = post.author_role || 'Admin';
  const dateLabel = post.created_at
    ? new Date(post.created_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

  // Avatar circle
  ctx.fillStyle = '#DC1726';
  ctx.beginPath();
  ctx.arc(padX + 28, y + 28, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 24px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(authorName.charAt(0).toUpperCase(), padX + 28, y + 29);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#171717';
  ctx.font = '700 23px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText(authorName, padX + 74, y + 25);

  ctx.fillStyle = '#737373';
  ctx.font = '500 18px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText(`${authorRole}${dateLabel ? ` · ${dateLabel}` : ''}`, padX + 74, y + 52);

  y += authorBlockH;

  // Divider
  ctx.strokeStyle = '#E5E5E5';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, y - 18);
  ctx.lineTo(width - padX, y - 18);
  ctx.stroke();

  // Title
  if (titleLines.length > 0) {
    ctx.fillStyle = '#171717';
    ctx.font = '700 34px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
    for (const line of titleLines) {
      ctx.fillText(line, padX, y + 24);
      y += 46;
    }
    y += 14;
  }

  // Content
  if (contentLines.length > 0) {
    ctx.fillStyle = '#404040';
    ctx.font = '400 24px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
    for (const line of contentLines) {
      if (line) {
        ctx.fillText(line, padX, y + 18);
      }
      y += 36;
    }
    y += 18;
  }

  // Image frame
  if (loadedImg && drawImgW > 0 && drawImgH > 0) {
    const imgX = Math.round((width - drawImgW) / 2);
    const framePad = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#E5E5E5';
    ctx.lineWidth = 2;
    ctx.fillRect(imgX - framePad, y, drawImgW + framePad * 2, drawImgH + framePad * 2);
    ctx.strokeRect(imgX - framePad, y, drawImgW + framePad * 2, drawImgH + framePad * 2);
    ctx.drawImage(loadedImg, imgX, y + framePad, drawImgW, drawImgH);
    y += drawImgH + framePad * 2 + 16;
  }

  // Footer
  const footerY = totalHeight - footerH;
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(0, footerY, width, footerH);
  ctx.strokeStyle = '#E5E5E5';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, footerY);
  ctx.lineTo(width, footerY);
  ctx.stroke();

  ctx.fillStyle = '#171717';
  ctx.font = '600 18px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText('Founder: Dilshad Ansari S/o MD Ayub Ansari', padX, footerY + 38);

  ctx.fillStyle = '#737373';
  ctx.font = '500 17px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText('Contact: 7209629509 · 6202736648 · Email: dil.dil.a.1345@gmail.com', padX, footerY + 66);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Failed to generate feed image');
  }

  const fileSlug = sanitizeFileName(
    post.title || post.content?.slice(0, 32) || 'madrasa-feed-post',
    'madrasa-feed-post'
  );
  triggerBlobDownload(blob, `${fileSlug}.png`);
}

export interface DownloadableCredentials {
  institutionName?: string;
  student_name?: string;
  father_name?: string;
  reference_no?: string;
  official_admission_no?: string;
  student_code?: string;
  username?: string;
  temporary_password?: string;
  class_name?: string;
  admission_date?: string;
}

export async function downloadLoginCredentialsCard(creds: DownloadableCredentials): Promise<void> {
  const width = 1080;
  const height = 760;
  const pad = 48;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported in this browser');

  // Background
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, width, height);

  // Header
  const headerH = 148;
  const grad = ctx.createLinearGradient(0, 0, width, headerH);
  grad.addColorStop(0, '#141E30');
  grad.addColorStop(1, '#243B55');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, headerH);

  ctx.fillStyle = '#DC1726';
  ctx.fillRect(0, 0, width, 8);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 30px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText(creds.institutionName || 'Madrasa Ghausia Razvia', pad, 56);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '500 18px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText('Islamnagar, Ramgarh, Palamu, Jharkhand · Student Portal Credentials Slip', pad, 92);

  ctx.fillStyle = '#FCA5A5';
  ctx.font = '700 15px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText('STATUS: PENDING SUPER ADMIN APPROVAL', pad, 124);

  // Details Card
  let y = headerH + 34;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E5E5E5';
  ctx.lineWidth = 2;
  ctx.fillRect(pad, y, width - pad * 2, 230);
  ctx.strokeRect(pad, y, width - pad * 2, 230);

  const col1X = pad + 28;
  const col2X = width / 2 + 16;

  const drawField = (x: number, fy: number, label: string, val: string, color = '#171717') => {
    ctx.fillStyle = '#737373';
    ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(label.toUpperCase(), x, fy);
    ctx.fillStyle = color;
    ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(val || '—', x, fy + 26);
  };

  drawField(col1X, y + 40, 'Student Name', creds.student_name || '—');
  drawField(col2X, y + 40, 'Father Name', creds.father_name || '—');
  drawField(col1X, y + 112, 'Application Reference No', creds.reference_no || '—', '#DC1726');
  drawField(col2X, y + 112, 'Admission Number', creds.official_admission_no || 'Pending Approval');
  drawField(col1X, y + 184, 'Class / Course', creds.class_name || 'To be assigned');
  drawField(col2X, y + 184, 'Account Status', 'Pending Approval', '#D97706');

  // Credentials Box
  y += 256;
  ctx.fillStyle = '#FEF2F2';
  ctx.strokeStyle = '#DC1726';
  ctx.lineWidth = 2;
  ctx.fillRect(pad, y, width - pad * 2, 165);
  ctx.strokeRect(pad, y, width - pad * 2, 165);

  ctx.fillStyle = '#DC1726';
  ctx.font = '700 15px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('CONFIDENTIAL PORTAL LOGIN CREDENTIALS', pad + 28, y + 34);

  // Inner boxes
  const boxW = (width - pad * 2 - 80) / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FECACA';
  ctx.fillRect(pad + 28, y + 52, boxW, 88);
  ctx.strokeRect(pad + 28, y + 52, boxW, 88);
  ctx.fillRect(pad + 52 + boxW, y + 52, boxW, 88);
  ctx.strokeRect(pad + 52 + boxW, y + 52, boxW, 88);

  ctx.fillStyle = '#737373';
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('USERNAME', pad + 44, y + 80);
  ctx.fillText('TEMPORARY PASSWORD', pad + 68 + boxW, y + 80);

  ctx.fillStyle = '#171717';
  ctx.font = '700 24px monospace';
  ctx.fillText(creds.username || '—', pad + 44, y + 116);

  ctx.fillStyle = '#DC1726';
  ctx.fillText(creds.temporary_password || '—', pad + 68 + boxW, y + 116);

  // Notice + Footer
  y += 195;
  ctx.fillStyle = '#525252';
  ctx.font = '500 15px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Please save your username and password carefully. Login unlocks only after Super Admin approval.', pad, y);

  ctx.fillStyle = '#737373';
  ctx.font = '500 14px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Founder: Dilshad Ansari S/o MD Ayub Ansari · Contact: 7209629509 / 6202736648', pad, height - 30);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to generate credentials slip image');

  const slug = sanitizeFileName(`credentials-${creds.reference_no || creds.username || 'student'}`, 'student-credentials');
  triggerBlobDownload(blob, `${slug}.png`);
}
