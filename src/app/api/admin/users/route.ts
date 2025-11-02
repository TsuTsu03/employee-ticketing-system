// File: app/api/admin/users/route.ts
// ============================================================================

export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSbClient } from '@supabase/supabase-js'; // alias to avoid duplicate identifier

// ---------- env ----------
function env() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('Missing SUPABASE_URL');
  if (!anon) throw new Error('Missing SUPABASE_ANON_KEY');
  if (!service) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return { url, anon, service };
}

// ---------- utils ----------
const Body = z.object({
  org_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().trim().optional().nullable(),
  role: z.enum(['EMPLOYEE', 'ADMIN']).default('EMPLOYEE'),
  invite: z.boolean().optional().default(true),
});

const ok = <T>(data: T, init: ResponseInit = {}) =>
  Response.json({ data }, { status: 200, ...init });

const err = (message: string, status = 400, init: ResponseInit = {}) =>
  Response.json({ error: message }, { status, ...init });

// ---------- cookie helpers ----------
type CookieValue = { value: string };
type ReadonlyJar = { get(name: string): CookieValue | undefined };
type MutableJar = ReadonlyJar & {
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string, options?: CookieOptions): void;
};
type CookieJar = ReadonlyJar | MutableJar;

const isPromiseLike = <T = unknown>(v: unknown): v is PromiseLike<T> =>
  typeof (v as { then?: unknown })?.then === 'function';
const hasSet = (jar: CookieJar): jar is MutableJar =>
  typeof (jar as Partial<MutableJar>).set === 'function';
const hasDelete = (jar: CookieJar): jar is MutableJar =>
  typeof (jar as Partial<MutableJar>).delete === 'function';

async function resolveCookies(): Promise<CookieJar> {
  const maybe = cookies() as unknown;
  return isPromiseLike<CookieJar>(maybe) ? await maybe : (maybe as CookieJar);
}

// ---------- clients ----------
async function authedFromCookies() {
  const { url, anon } = env();
  const jar = await resolveCookies();

  return createServerClient(url, anon, {
    cookies: {
      get: (name: string) => jar.get(name)?.value,
      set: (name: string, value: string, options?: CookieOptions) => {
        if (hasSet(jar)) jar.set(name, value, { path: '/', ...(options ?? {}) });
      },
      remove: (name: string, options?: CookieOptions) => {
        if (hasDelete(jar)) jar.delete(name, { path: '/', ...(options ?? {}) });
      },
    },
  });
}

// Full-power (bypasses RLS) for admin operations:
function serviceClient() {
  const { url, service } = env();
  return createSbClient(url, service); // alias used here
}

// ---------- handler ----------
export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return err('Invalid payload', 422);
    const { org_id, email, full_name, role, invite } = parsed.data;

    const supabase = await authedFromCookies();
    const svc = serviceClient();

    // 1) Who is calling?
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return err(authErr.message, 401);
    const me = auth.user;
    if (!me) return err('Unauthorized', 401);

    // 2) Authorization
    let allowed = false;

    const { data: memForOrg, error: memErr1 } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', me.id)
      .eq('org_id', org_id)
      .maybeSingle();
    if (memErr1) return err(memErr1.message, 400);
    if (memForOrg && (memForOrg.role === 'ADMIN' || memForOrg.role === 'SUPER_ADMIN')) {
      allowed = true;
    }

    if (!allowed) {
      const { data: anySuper, error: memErr2 } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', me.id)
        .eq('role', 'SUPER_ADMIN')
        .limit(1)
        .maybeSingle();
      if (memErr2) return err(memErr2.message, 400);
      if (anySuper) allowed = true;
    }

    if (!allowed) return err('Forbidden: Admins only for this org', 403);

    // 3) Create/invite the Auth user with the SERVICE client
    let userId: string | undefined;

    if (invite) {
      const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
        data: { full_name: full_name ?? undefined },
      });
      if (error) return err(error.message, 400);
      userId = data.user?.id;
    } else {
      const { data, error } = await svc.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { full_name: full_name ?? undefined },
      });
      if (error) return err(error.message, 400);
      userId = data.user?.id;
    }

    if (!userId) return err('Failed to create user', 500);

    // 4) Ensure profile exists
    const { error: upErr } = await svc
      .from('profiles')
      .upsert({ id: userId, full_name: full_name ?? null });
    if (upErr) return err(upErr.message, 400);

    // 5) Add membership
    const { error: mErr } = await svc.from('memberships').insert({ user_id: userId, org_id, role });
    if (mErr) return err(mErr.message, 400);

    return ok<{ user_id: string; org_id: string; role: 'EMPLOYEE' | 'ADMIN' }>({
      user_id: userId,
      org_id,
      role,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('POST /api/admin/users fatal:', msg);
    return err(`Server error: ${msg}`, 500);
  }
}
