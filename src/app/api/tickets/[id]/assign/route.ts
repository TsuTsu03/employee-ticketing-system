import { z } from 'zod';

import { getUser, isOrgAdmin, jsonErr, jsonOk, routeClient } from '@/lib/api-auth';

const Body = z.object({ assignee_id: z.string().uuid().nullable() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonErr('Invalid assignee', 422);

  const supabase = await routeClient();
  const user = await getUser(supabase);
  if (!user) return jsonErr('Unauthorized', 401);

  const { data: ticket, error: tErr } = await supabase
    .from('tickets')
    .select('id, org_id')
    .eq('id', id)
    .maybeSingle();
  if (tErr) return jsonErr(tErr.message, 400);
  if (!ticket) return jsonErr('Ticket not found', 404);

  if (!(await isOrgAdmin(supabase, user.id, ticket.org_id))) {
    return jsonErr('Forbidden', 403);
  }

  // If assigning someone, make sure they belong to the same org.
  if (parsed.data.assignee_id) {
    const { data: mem } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('user_id', parsed.data.assignee_id)
      .eq('org_id', ticket.org_id)
      .maybeSingle();
    if (!mem) return jsonErr('Assignee is not a member of this organization', 422);
  }

  const { data, error } = await supabase
    .from('tickets')
    .update({ assignee_id: parsed.data.assignee_id })
    .eq('id', id)
    .select('id, assignee_id, updated_at')
    .maybeSingle();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
