// lib/get-role.ts
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';

const ROLES = new Set<Role>(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);
const PRECEDENCE: Record<Role, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  EMPLOYEE: 1,
};

function normalizeRole(v: unknown): Role | null {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  return ROLES.has(s as Role) ? (s as Role) : null;
}

// why: metadata shape may vary; keep extractor safe
function readMetaRole(u: User | null): string | null {
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const r = meta.role;
  return typeof r === 'string' ? r : null;
}

export async function getCurrentUserRole(): Promise<{
  user: { id: string; email?: string | null } | null;
  role: Role | null;
}> {
  // IMPORTANT: in your Next version cookies() is async-typed → await it
  const jar = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value;
        },
        set(name: string, value: string, options?: CookieOptions) {
          // why: allow Supabase to refresh/clear cookies on SSR
          jar.set({ name, value, ...(options ?? {}) });
        },
        remove(name: string, options?: CookieOptions) {
          jar.set({ name, value: '', ...(options ?? {}), maxAge: 0 });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, role: null };

  const user = data?.user ?? null;
  if (!user) return { user: null, role: null };

  // 1) try metadata
  const metaRole = normalizeRole(readMetaRole(user));
  if (metaRole) {
    return { user: { id: user.id, email: user.email }, role: metaRole };
  }

  // 2) fall back to memberships (your schema source of truth)
  type MembershipRow = { role: string | null };
  const { data: memberships } = (await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)) as unknown as { data: MembershipRow[] | null };

  if (!memberships || memberships.length === 0) {
    return { user: { id: user.id, email: user.email }, role: null };
  }

  const best =
    memberships
      .map((m) => normalizeRole(m.role))
      .filter((r): r is Role => !!r)
      .sort((a, b) => PRECEDENCE[b] - PRECEDENCE[a])[0] ?? null;

  return { user: { id: user.id, email: user.email }, role: best };
}
