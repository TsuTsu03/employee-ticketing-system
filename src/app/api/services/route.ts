import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase-server';

const Body = z.object({
  org_id: z.string().uuid(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
});

function ok<T>(data: T, init: ResponseInit = {}) {
  return Response.json({ data }, { status: 200, ...init });
}
function err(message: string, status = 400, init: ResponseInit = {}) {
  return Response.json({ error: message }, { status, ...init });
}

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return err('Invalid payload', 422);
    const { org_id, name, description } = parsed.data;

    const supabase = await serverClient();

    // 1) Auth
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return err(authErr.message, 401);
    const user = auth.user;
    if (!user) return err('Unauthorized', 401);

    // 2) Must be SUPER_ADMIN anywhere (no org_id restriction)
    const { data: sa, error: saErr } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'SUPER_ADMIN')
      .limit(1)
      .maybeSingle();

    if (saErr) return err(saErr.message, 400);
    if (!sa) return err('Forbidden: SuperAdmins only', 403);

    // 3) Insert service into *any* org
    const { data: inserted, error: insErr } = await supabase
      .from('services')
      .insert({ org_id, name, description: description ?? null })
      .select('id, org_id, name, description')
      .single();

    if (insErr) return err(insErr.message, 400);

    return ok(inserted);
  } catch (e) {
    console.error('POST /api/services fatal:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return err(`Server error: ${msg}`, 500);
  }
}
