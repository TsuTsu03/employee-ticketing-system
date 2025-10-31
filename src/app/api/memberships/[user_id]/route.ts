import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jsonErr, jsonOk } from '@/lib/http';
async function sMemId() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}
export async function DELETE(req: Request, { params }: { params: { user_id: string } }) {
  const url = new URL(req.url);
  const org_id = url.searchParams.get('org_id');
  if (!org_id) return jsonErr('org_id required', 422);
  const sb = await sMemId();
  const { error } = await sb
    .from('memberships')
    .delete()
    .eq('user_id', params.user_id)
    .eq('org_id', org_id);
  if (error) return jsonErr(error.message, 400);
  return jsonOk({ ok: true });
}
