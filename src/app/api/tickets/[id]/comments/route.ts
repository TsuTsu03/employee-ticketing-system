import { z } from 'zod';

import { getUser, jsonErr, jsonOk, routeClient } from '@/lib/api-auth';

const Body = z.object({ body: z.string().trim().min(1).max(4000) });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await routeClient();
  const user = await getUser(supabase);
  if (!user) return jsonErr('Unauthorized', 401);

  // RLS restricts visibility to members of the ticket's org.
  const { data, error } = await supabase
    .from('ticket_comments')
    .select('id, ticket_id, author_id, body, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data ?? []);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonErr('Comment cannot be empty', 422);

  const supabase = await routeClient();
  const user = await getUser(supabase);
  if (!user) return jsonErr('Unauthorized', 401);

  const { data, error } = await supabase
    .from('ticket_comments')
    .insert({ ticket_id: id, author_id: user.id, body: parsed.data.body })
    .select('id, ticket_id, author_id, body, created_at')
    .maybeSingle();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
