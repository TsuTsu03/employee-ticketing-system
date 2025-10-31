import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { ApiResult, Role } from '@/types/db';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

const Body = z.object({
  org_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().trim().min(0).max(200).nullable(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] as const),
  invite: z.boolean(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json<ApiResult<never>>({ error: 'Invalid payload' }, { status: 422 });
  }
  const { org_id, email, full_name, role, invite } = parsed.data;

  try {
    let userId: string;
    if (invite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name },
      });
      if (error || !data?.user?.id) throw new Error(error?.message ?? 'Invite failed');
      userId = data.user.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (error || !data?.user?.id) throw new Error(error?.message ?? 'Create failed');
      userId = data.user.id;
    }

    const { error: insErr } = await admin.from('memberships').insert({
      user_id: userId,
      org_id,
      role,
    });
    if (insErr) throw new Error(insErr.message);

    return NextResponse.json<ApiResult<{ user_id: string }>>({ data: { user_id: userId } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json<ApiResult<never>>({ error: msg }, { status: 400 });
  }
}
