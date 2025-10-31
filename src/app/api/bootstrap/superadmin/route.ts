// src/app/api/bootstrap/superadmin/route.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';

type Json<T> = { data?: T; error?: string };
const ok = <T>(data: T, init: ResponseInit = {}) =>
  Response.json({ data } as Json<T>, { status: 200, ...init });
const err = (message: string, status = 400) =>
  Response.json({ error: message } as Json<never>, { status });

// App-specific metadata stored in Supabase Auth user.user_metadata
interface AppUserMeta {
  full_name?: string;
  employee_id?: string;
}

function fullNameFromMeta(user: User): string | undefined {
  const meta = (user.user_metadata ?? {}) as Partial<AppUserMeta>;
  return meta.full_name;
}

async function s() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}

export async function POST(): Promise<Response> {
  const sb = await s();

  const {
    data: { user },
    error: aerr,
  } = await sb.auth.getUser();
  if (aerr || !user) return err('Unauthorized', 401);

  const { count, error: cErr } = await sb
    .from('memberships')
    .select('*', { count: 'exact', head: true });
  if (cErr) return err(cErr.message, 400);
  if ((count ?? 0) > 0) return err('Already initialized', 403);

  const { data: existing, error: mErr } = await sb
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (mErr) return err(mErr.message, 400);
  if (existing) return ok(existing);

  // ✅ No "any" here
  const orgName = fullNameFromMeta(user) ?? user.email ?? 'My Organization';

  const { data: org, error: oErr } = await sb
    .from('organizations')
    .insert({ name: orgName })
    .select('id')
    .single();
  if (oErr) return err(oErr.message, 400);

  const { data: mem, error: iErr } = await sb
    .from('memberships')
    .insert({ org_id: org.id, user_id: user.id, role: 'SUPER_ADMIN' })
    .select('org_id, role')
    .single();
  if (iErr) return err(iErr.message, 400);

  return ok(mem);
}
