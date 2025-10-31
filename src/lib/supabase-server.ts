import 'server-only'; // prevents accidental client usage

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

interface CookieReader {
  get(name: string): { value: string } | undefined;
}
interface CookieWriter {
  set(opts: { name: string; value: string } & CookieOptions): void;
}
function isWriter(x: unknown): x is CookieWriter {
  return !!x && typeof (x as { set?: unknown }).set === 'function';
}

export async function createServerSupabase(): Promise<SupabaseClient> {
  const store = await cookies(); // your Next version exposes async cookies()
  const reader = store as unknown as CookieReader;
  const setFn = isWriter(store) ? store.set.bind(store) : undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return reader.get(name)?.value;
        },
        set(name: string, value: string, options?: CookieOptions) {
          if (!setFn) return; // read-only in some Edge contexts
          setFn({ name, value, ...(options ?? {}) });
        },
        remove(name: string, options?: CookieOptions) {
          if (!setFn) return;
          setFn({ name, value: '', ...(options ?? {}) });
        },
      },
    }
  );
}
