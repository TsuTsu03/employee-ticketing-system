import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jsonErr, jsonOk } from '@/lib/http';
async function sOrgId() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}
const OrgPatch = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = OrgPatch.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return jsonErr('Invalid payload', 422);
  const sb = await sOrgId();
  const { data, error } = await sb
    .from('organizations')
    .update(body.data)
    .eq('id', params.id)
    .select('*')
    .single();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = await sOrgId();
  const { error } = await sb.from('organizations').delete().eq('id', params.id);
  if (error) return jsonErr(error.message, 400);
  return jsonOk({ ok: true });
}
