// src/app/api/shifts/route.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';

type MembershipRow = {
  org_id: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER' | string;
};

type ShiftRow = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  start_at: string | null;
  end_at: string | null;
  start_geo: unknown | null;
  end_geo: unknown | null;
};

function csvQuote(value: unknown): string {
  const s = String(value ?? '');
  return `"${s.replace(/"/g, '""')}"`; // escape quotes
}

export async function GET(): Promise<Response> {
  // IMPORTANT: in your setup cookies() returns a Promise
  const jar = await cookies();

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => jar.get(name)?.value,
      },
    }
  );

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const membershipRes: PostgrestSingleResponse<MembershipRow | null> = await sb
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipRes.error) {
    return new Response(membershipRes.error.message, { status: 400 });
  }
  const membership = membershipRes.data;

  const base = sb
    .from('shifts')
    .select('id, org_id, user_id, start_at, end_at, start_geo, end_geo');

  const query =
    membership?.role === 'SUPER_ADMIN'
      ? base
      : membership?.org_id
        ? base.eq('org_id', membership.org_id)
        : base.eq('org_id', '__no_org__'); // empty set fallback

  const { data, error }: PostgrestResponse<ShiftRow> = await query;
  if (error) return new Response(error.message, { status: 400 });

  const header = 'id,org_id,user_id,start_at,end_at,start_geo,end_geo';
  const rows = (data ?? []).map((s) =>
    [
      csvQuote(s.id),
      csvQuote(s.org_id),
      csvQuote(s.user_id),
      csvQuote(s.start_at),
      csvQuote(s.end_at),
      csvQuote(JSON.stringify(s.start_geo)),
      csvQuote(JSON.stringify(s.end_geo)),
    ].join(',')
  );

  const csv = [header, ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="shifts.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
