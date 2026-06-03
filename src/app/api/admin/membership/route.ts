import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

import { getUser, isOrgAdmin, routeClient } from '@/lib/api-auth';
import type { ApiResult } from '@/types/db';

const srv = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PatchBody = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] as const),
});

export async function PATCH(req: Request) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>({ error: 'Invalid payload' }, { status: 422 });
  }
  const { user_id, org_id, role } = parsed.data;

  // AuthZ: only an admin of this org (or any super admin) may change roles.
  const supabase = await routeClient();
  const me = await getUser(supabase);
  if (!me) return NextResponse.json<ApiResult<never>>({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isOrgAdmin(supabase, me.id, org_id))) {
    return NextResponse.json<ApiResult<never>>({ error: 'Forbidden' }, { status: 403 });
  }
  // Only super admins can grant the SUPER_ADMIN role.
  if (role === 'SUPER_ADMIN') {
    const { data } = await supabase.from('memberships').select('role').eq('user_id', me.id);
    const isSuper = (data ?? []).some((m) => (m as { role: string }).role === 'SUPER_ADMIN');
    if (!isSuper)
      return NextResponse.json<ApiResult<never>>({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { error } = await srv
      .from('memberships')
      .upsert({ user_id, org_id, role }, { onConflict: 'user_id,org_id' });
    if (error) throw new Error(error.message);

    return NextResponse.json<ApiResult<{ ok: true }>>({ data: { ok: true } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json<ApiResult<never>>({ error: msg }, { status: 400 });
  }
}
