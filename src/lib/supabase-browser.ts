// src/lib/supabase-browser.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/** Create or reuse a browser Supabase client. Never throws at import time. */
export function createBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;

  // why: Next can evaluate this file at build time; avoid immediate throws
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL || // fallback if you share one env
    '';

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!url || !anon) {
    // Delay the failure to runtime (when actually called), with a clear message
    throw new Error(
      'Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  browserClient = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return browserClient;
}
