import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jsonErr, jsonOk } from '@/lib/http';
async function sMem() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}
const MemPost = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
});
export async function GET(req: Request) {
  const url = new URL(req.url);
  const org_id = url.searchParams.get('org_id');
  const sb = await sMem();
  const query = org_id
    ? sb.from('memberships').select('user_id, org_id, role').eq('org_id', org_id)
    : sb.from('memberships').select('user_id, org_id, role');
  const { data, error } = await query;
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data ?? []);
}
export async function POST(req: Request) {
  const body = MemPost.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return jsonErr('Invalid payload', 422);
  const sb = await sMem();
  const { data, error } = await sb.from('memberships').insert(body.data).select('*').single();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
