import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Cookie-bound Supabase client for route handlers (respects RLS as the user). */
export async function routeClient(): Promise<SupabaseClient> {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => jar.get(name)?.value,
        set: (name: string, value: string, options?: CookieOptions) => {
          try {
            jar.set({ name, value, ...(options ?? {}) });
          } catch {}
        },
        remove: (name: string, options?: CookieOptions) => {
          try {
            jar.set({ name, value: '', ...(options ?? {}), maxAge: 0 });
          } catch {}
        },
      },
    }
  );
}

export function jsonOk<T>(data: T, init: ResponseInit = {}) {
  return Response.json({ data }, { status: 200, ...init });
}
export function jsonErr(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function getUser(supabase: SupabaseClient): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';

/** True if the user is ADMIN/SUPER_ADMIN of the given org (or SUPER_ADMIN anywhere). */
export async function isOrgAdmin(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('memberships')
    .select('role, org_id')
    .eq('user_id', userId);
  const rows = (data ?? []) as Array<{ role: Role; org_id: string }>;
  return rows.some(
    (m) =>
      m.role === 'SUPER_ADMIN' || (m.role === 'ADMIN' && m.org_id === orgId)
  );
}
