import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
let supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export let isSupabaseClientConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export let missingSupabaseClientEnv = [
  !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
].filter(Boolean) as string[];

function buildClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export let supabase: SupabaseClient | null = isSupabaseClientConfigured
  ? buildClient(supabaseUrl, supabaseAnonKey)
  : null;

let initPromise: Promise<boolean> | null = null;

export async function initSupabaseClient(): Promise<boolean> {
  if (supabase && isSupabaseClientConfigured) return true;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const res = await fetch('/api/public/config');
        if (!res.ok) return false;
        const data = (await res.json().catch(() => null)) as {
          supabaseUrl?: string;
          supabaseAnonKey?: string;
        } | null;
        const url = (data?.supabaseUrl || '').trim();
        const anonKey = (data?.supabaseAnonKey || '').trim();
        if (url && anonKey) {
          supabaseUrl = url;
          supabaseAnonKey = anonKey;
          isSupabaseClientConfigured = true;
          missingSupabaseClientEnv = [];
          supabase = buildClient(url, anonKey);
          return true;
        }
      } catch {
        // ignore network errors
      }
      return false;
    })();
  }
  return initPromise;
}
