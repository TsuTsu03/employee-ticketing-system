import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jsonErr, jsonOk } from '@/lib/http';

async function server2() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => jar.get(n)?.value } }
  );
}
const Body = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED']) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await server2();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonErr('Unauthorized', 401);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonErr('Invalid payload', 422);

  const { data, error } = await supabase
    .from('tickets')
    .update({ status: parsed.data.status })
    .eq('id', params.id)
    .select('*')
    .single();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
