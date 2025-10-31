import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
export async function GET() {
  const jar = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { data: m } = await sb
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const q =
    m?.role === 'SUPER_ADMIN'
      ? sb.from('tickets').select('*')
      : sb.from('tickets').select('*').eq('org_id', m?.org_id);
  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 400 });
  const rows = (data ?? []).map((t: any) =>
    [t.id, t.org_id, t.employee_id, t.service_id, t.status, t.description, t.created_at]
      .map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = ['id,org_id,employee_id,service_id,status,description,created_at', ...rows].join(
    '\n'
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="tickets.csv"',
    },
  });
}
