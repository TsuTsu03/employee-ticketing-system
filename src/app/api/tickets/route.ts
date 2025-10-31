import { z } from 'zod';
import { cookies } from 'next/headers';
import { CookieOptions, createServerClient } from '@supabase/ssr';

const Body = z.object({
  service_id: z.string().uuid(),
  description: z.string().trim().min(1),
});

type TicketRow = {
  id: string;
  description: string | null;
  status: string;
  created_at: string;
};

function ok<T>(data: T, init: ResponseInit = {}) {
  return Response.json({ data }, { status: 200, ...init });
}
function err(message: string, status = 400, init: ResponseInit = {}) {
  return Response.json({ error: message }, { status, ...init });
}

export async function sb() {
  const jar = await cookies(); // async

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value;
        },
        set(_name: string, _value: string, _opts: CookieOptions) {},
        remove(_name: string, _opts: CookieOptions) {},
      },
    }
  );
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err('Invalid payload', 422);
  const { service_id, description } = parsed.data;

  const supabase = await sb();

  // 1) Auth
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return err('Unauthorized', 401);

  // 2) Membership (take first row deterministically)
  const { data: memRows, error: mErr } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .order('org_id', { ascending: true }) // any stable order
    .limit(1);

  if (mErr) return err(mErr.message, 400);
  const membership = Array.isArray(memRows) ? memRows[0] : memRows;
  if (!membership) return err('No membership', 403);

  // 3) Validate service belongs to same org
  const { data: svcRows, error: sErr } = await supabase
    .from('services')
    .select('id, org_id')
    .eq('id', service_id)
    .limit(1);

  if (sErr) return err(sErr.message, 400);
  const svc = Array.isArray(svcRows) ? svcRows[0] : svcRows;
  if (!svc || svc.org_id !== membership.org_id) {
    return err('Invalid service for your org', 403);
  }

  // 4) Insert ticket and read back the inserted row
  const { data: insertedRows, error: tErr } = await supabase
    .from('tickets')
    .insert({
      org_id: membership.org_id,
      employee_id: user.id,
      service_id,
      description,
      status: 'OPEN',
    })
    .select('id, description, status, created_at') // do NOT call .single()
    .limit(1); // just to be safe

  if (tErr) return err(tErr.message, 400);
  const inserted = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows;
  if (!inserted) return err('Insert failed (no row returned)', 500);

  return ok<TicketRow>(inserted as TicketRow);
}
