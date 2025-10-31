import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';
const RANK: Record<Role, number> = { SUPER_ADMIN: 3, ADMIN: 2, EMPLOYEE: 1 };

export async function getCurrentUserRole() {
  const jar = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { user: null, role: null as Role | null, orgId: null as string | null };

  // Prefer RPC (bypasses RLS but still checks auth.uid())
  const { data: rows, error } = await sb.rpc('my_orgs');
  if (error || !rows?.length) return { user, role: null, orgId: null };

  // Pick highest role across all orgs
  let best = rows[0];
  for (const r of rows) if (RANK[r.role as Role] > RANK[best.role as Role]) best = r;

  return { user, role: best.role as Role, orgId: best.org_id as string };
}
