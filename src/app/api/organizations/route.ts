import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jsonErr, jsonOk } from '@/lib/http';
async function sOrg() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}
const OrgBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  is_active: z.boolean().optional(),
});
export async function GET() {
  const supabase = await sOrg();
  const { data, error } = await supabase.from('organizations').select('*').order('name');
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data ?? []);
}
export async function POST(req: Request) {
  const body = OrgBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return jsonErr('Invalid payload', 422);
  const supabase = await sOrg();
  const { data, error } = await supabase
    .from('organizations')
    .insert(body.data)
    .select('*')
    .single();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
