import { supabase } from './supabase.ts';
import { compressImageForUpload, formatHttpErrorMessage, safeReadJson } from './imageUpload.ts';

const TOKEN_KEY = 'madrasa_auth_token';

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

function isTokenFresh(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64));
    if (typeof json?.exp === 'number') {
      return json.exp * 1000 - Date.now() > 60_000;
    }
    return true;
  } catch {
    return false;
  }
}

async function resolveAccessToken(): Promise<string | null> {
  const cached = getStoredToken();
  if (cached && isTokenFresh(cached)) {
    return cached;
  }
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        setStoredToken(data.session.access_token);
        return data.session.access_token;
      }
    } catch {
      // fall through to sessionStorage token
    }
  }
  return cached;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;
  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await resolveAccessToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const { data, rawText } = await safeReadJson(res);
  if (!res.ok) {
    const message = formatHttpErrorMessage(res.status, data, rawText, 'Request failed');
    throw new ApiError(message, res.status, data?.code, data || {});
  }
  if (data === null && rawText.trim()) {
    throw new ApiError('Server returned an unexpected non-JSON response. Please try again.', res.status);
  }
  return (data ?? {}) as T;
}

export async function uploadFile(
  file: File,
  bucket = 'madrasa-assets'
): Promise<{ url: string; storedRef?: string; name: string; mimetype: string; size: number }> {
  const preparedFile = await compressImageForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);
  const qs = bucket ? `?bucket=${encodeURIComponent(bucket)}` : '';
  return apiRequest(`/api/upload${qs}`, {
    method: 'POST',
    body: formData,
  });
}
