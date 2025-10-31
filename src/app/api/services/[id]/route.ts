import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jsonErr, jsonOk } from '@/lib/http';
async function sSvcId() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}
const SvcPatch = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = SvcPatch.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return jsonErr('Invalid payload', 422);
  const sb = await sSvcId();
  const { data, error } = await sb
    .from('services')
    .update(body.data)
    .eq('id', params.id)
    .select('*')
    .single();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = await sSvcId();
  const { error } = await sb.from('services').delete().eq('id', params.id);
  if (error) return jsonErr(error.message, 400);
  return jsonOk({ ok: true });
}
