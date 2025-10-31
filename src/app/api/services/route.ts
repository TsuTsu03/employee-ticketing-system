import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jsonErr, jsonOk } from '@/lib/http';
async function sSvc() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}
const ServiceBody = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
});
export async function GET() {
  const sb = await sSvc();
  const { data, error } = await sb.from('services').select('*').order('name');
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data ?? []);
}
export async function POST(req: Request) {
  const body = ServiceBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return jsonErr('Invalid payload', 422);
  const sb = await sSvc();
  const { data, error } = await sb.from('services').insert(body.data).select('*').single();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
