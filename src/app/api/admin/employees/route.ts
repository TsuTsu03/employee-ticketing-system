import { z } from 'zod';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminSupabase } from '@/lib/supabase-admin';

const Body = z.object({
  employeeId: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
});

function ok<T>(data: T, init: ResponseInit = {}) {
  return Response.json({ data }, { status: 200, ...init });
}
function err(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function anon() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err('Invalid payload', 422);
  const { employeeId, fullName, email } = parsed.data;

  // caller must be authenticated + ADMIN/SUPER_ADMIN
  const sb = await anon();
  const {
    data: { user },
    error: aerr,
  } = await sb.auth.getUser();
  if (aerr || !user) return err('Unauthorized', 401);

  const { data: mem, error: merr } = await sb
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (merr) return err(merr.message, 400);
  if (!mem) return err('Admin has no membership', 403);
  if (!(mem.role === 'SUPER_ADMIN' || mem.role === 'ADMIN')) return err('Forbidden', 403);

  // invite user (email with set-password link)
  const admin = createAdminSupabase();
  const { data: invited, error: iErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, employee_id: employeeId },
  });
  if (iErr) return err(`Invite failed: ${iErr.message}`, 409);

  // create membership as EMPLOYEE (service role bypasses RLS)
  const { data: membership, error: mInsErr } = await admin
    .from('memberships')
    .insert({ org_id: mem.org_id, user_id: invited.user.id, role: 'EMPLOYEE' })
    .select('org_id, user_id, role')
    .single();
  if (mInsErr) return err(mInsErr.message, 400);

  return ok({ ...membership, invited: true });
}
