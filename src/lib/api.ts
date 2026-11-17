import { initSupabaseClient, supabase } from './supabase.ts';
import { compressImageForUpload, formatHttpErrorMessage, safeReadJson } from './imageUpload.ts';

const TOKEN_KEY = 'madrasa_auth_token';
const REFRESH_TOKEN_KEY = 'madrasa_refresh_token';

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export function setStoredSession(accessToken: string | null, refreshToken?: string | null) {
  setStoredToken(accessToken);
  if (refreshToken) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else if (accessToken === null) {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function clearStoredSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

function isTokenFresh(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const json = JSON.parse(atob(base64));
    if (typeof json?.exp === 'number') {
      return json.exp * 1000 - Date.now() > 45_000;
    }
    return true;
  } catch {
    return false;
  }
}

let activeRefreshPromise: Promise<string | null> | null = null;

export async function refreshAuthSession(forceRefresh = false): Promise<string | null> {
  if (activeRefreshPromise) return activeRefreshPromise;

  activeRefreshPromise = (async () => {
    if (!supabase) {
      await initSupabaseClient().catch(() => false);
    }

    // 1. Try browser Supabase client refresh if available
    if (supabase) {
      try {
        const { data: sessData } = await supabase.auth.getSession();
        if (!forceRefresh && sessData.session?.access_token && isTokenFresh(sessData.session.access_token)) {
          setStoredSession(sessData.session.access_token, sessData.session.refresh_token);
          return sessData.session.access_token;
        }
        if (sessData.session?.refresh_token) {
          const { data: refData } = await supabase.auth.refreshSession();
          if (refData.session?.access_token) {
            setStoredSession(refData.session.access_token, refData.session.refresh_token);
            return refData.session.access_token;
          }
        }
      } catch {
        // fall through to backend refresh
      }
    }

    // 2. Fallback: refresh via backend endpoint using stored refresh_token
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as {
        token?: string;
        session?: { access_token?: string; refresh_token?: string };
      } | null;
      const nextToken = data?.session?.access_token || data?.token || null;
      const nextRefresh = data?.session?.refresh_token || refreshToken;
      if (!nextToken) return null;

      setStoredSession(nextToken, nextRefresh);
      if (supabase && nextRefresh) {
        await supabase.auth
          .setSession({ access_token: nextToken, refresh_token: nextRefresh })
          .catch(() => {});
      }
      return nextToken;
    } catch {
      return null;
    }
  })().finally(() => {
    activeRefreshPromise = null;
  });

  return activeRefreshPromise;
}

async function resolveAccessToken(): Promise<string | null> {
  const cached = getStoredToken();
  if (cached && isTokenFresh(cached)) {
    return cached;
  }

  if (!supabase) {
    await initSupabaseClient().catch(() => false);
  }

  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token && isTokenFresh(data.session.access_token)) {
        setStoredSession(data.session.access_token, data.session.refresh_token);
        return data.session.access_token;
      }
    } catch {
      // try refresh next
    }
  }

  const refreshed = await refreshAuthSession(false);
  if (refreshed) return refreshed;

  return cached && isTokenFresh(cached) ? cached : null;
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

function isPublicAuthPath(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/setup-admin') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/me')
  );
}

export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const maxAttempts = 3;
  let retriedAfterRefresh = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const token = await resolveAccessToken();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
    } catch (networkErr: any) {
      if (method === 'GET' && attempt < maxAttempts) {
        await new Promise((r) => window.setTimeout(r, 650 * attempt));
        continue;
      }
      throw new ApiError(
        networkErr?.message || 'Unable to reach the server. Please check your connection and try again.',
        0
      );
    }

    const { data, rawText } = await safeReadJson(res);
    const trimmedRaw = rawText.trim();
    const looksLikeHtml = trimmedRaw.startsWith('<');

    if (!res.ok) {
      const isTransientGateway = res.status === 502 || res.status === 503 || res.status === 504;
      if ((isTransientGateway && (method === 'GET' || looksLikeHtml)) && attempt < maxAttempts) {
        await new Promise((r) => window.setTimeout(r, 650 * attempt));
        continue;
      }
      if (
        res.status === 401 &&
        !retriedAfterRefresh &&
        !url.includes('/api/auth/login') &&
        !url.includes('/api/auth/register') &&
        !url.includes('/api/auth/setup-admin') &&
        !url.includes('/api/auth/refresh')
      ) {
        retriedAfterRefresh = true;
        const freshToken = await refreshAuthSession(true);
        if (freshToken && freshToken !== token) {
          attempt = Math.max(0, attempt - 1);
          continue;
        }
      }
      if (
        res.status === 401 &&
        !url.includes('/api/auth/login') &&
        !url.includes('/api/auth/register') &&
        !url.includes('/api/auth/setup-admin')
      ) {
        clearStoredSession();
        if (supabase) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        if (!isPublicAuthPath(url) && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('madrasa:session-expired', {
              detail: { message: 'Your session has expired. Please sign in again.' },
            })
          );
        }
      }
      const message = formatHttpErrorMessage(res.status, data, rawText, 'Request failed');
      throw new ApiError(message, res.status, data?.code, data || {});
    }

    if (data === null && trimmedRaw) {
      // HTML on 2xx means a proxy/SPA splash responded before hitting our JSON API — safe to retry
      if (attempt < maxAttempts && (looksLikeHtml || method === 'GET')) {
        await new Promise((r) => window.setTimeout(r, 650 * attempt));
        continue;
      }
      console.warn('[apiRequest] Non-JSON 2xx response', {
        url,
        status: res.status,
        contentType: res.headers.get('content-type'),
        preview: trimmedRaw.slice(0, 140),
      });
      throw new ApiError(
        looksLikeHtml
          ? 'Server returned an HTML page instead of JSON. Please wait a moment and refresh the page.'
          : 'Server returned an unexpected non-JSON response. Please try again.',
        res.status
      );
    }

    return (data ?? {}) as T;
  }

  return {} as T;
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
