import { z } from 'zod';

import { getUser, isOrgAdmin, jsonErr, jsonOk, routeClient } from '@/lib/api-auth';
import { TICKET_STATUSES } from '@/lib/tickets';

const Body = z.object({ status: z.enum(TICKET_STATUSES) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonErr('Invalid status', 422);

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

  const { data, error } = await supabase
    .from('tickets')
    .update({ status: parsed.data.status })
    .eq('id', id)
    .select('id, status, updated_at, resolved_at')
    .maybeSingle();
  if (error) return jsonErr(error.message, 400);
  return jsonOk(data);
}
