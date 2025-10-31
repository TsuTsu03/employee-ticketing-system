import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
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
