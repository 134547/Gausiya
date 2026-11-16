import { supabase } from './supabase.ts';

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

async function resolveAccessToken(): Promise<string | null> {
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
  return getStoredToken();
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
  }
  return data as T;
}

export async function uploadFile(
  file: File,
  bucket = 'madrasa-assets'
): Promise<{ url: string; storedRef?: string; name: string; mimetype: string; size: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const qs = bucket ? `?bucket=${encodeURIComponent(bucket)}` : '';
  return apiRequest(`/api/upload${qs}`, {
    method: 'POST',
    body: formData,
  });
}
