'use client';

import { Loader2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PriorityBadge, StatusBadge } from '@/components/app/ticket-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fmtDateTime, fmtRelative, initials } from '@/lib/format';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  normalizePriority,
  normalizeStatus,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets';

export type AdminTicket = {
  id: string;
  title: string | null;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  service_id: string | null;
  employee_id: string;
  assignee_id: string | null;
  created_at: string;
};

export type Member = { user_id: string; full_name: string | null; email: string | null };

type Comment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export function TicketDetailSheet({
  ticket,
  open,
  onOpenChange,
  members,
  serviceName,
  canManage,
  onChange,
}: {
  ticket: AdminTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  serviceName?: string;
  canManage: boolean;
  onChange?: (patch: Partial<AdminTicket>) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameFor = (id?: string | null) => {
    if (!id) return 'Unassigned';
    const m = members.find((x) => x.user_id === id);
    return m?.full_name || m?.email || `${id.slice(0, 8)}…`;
  };

  useEffect(() => {
    if (!open || !ticket) return;
    setComments([]);
    setLoadingComments(true);
    (async () => {
      try {
        const res = await fetch(`/api/tickets/${ticket.id}/comments`);
        const json = await res.json();
        if (json.data) setComments(json.data as Comment[]);
      } catch {
        /* ignore */
      } finally {
        setLoadingComments(false);
      }
    })();
  }, [open, ticket]);

  async function patch(path: string, payload: unknown, patchLocal: Partial<AdminTicket>) {
    if (!ticket) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      onChange?.(patchLocal);
      toast.success('Ticket updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function postComment() {
    if (!ticket || !draft.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setComments((c) => [...c, json.data as Comment]);
      setDraft('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post comment');
    } finally {
      setPosting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        {ticket && (
          <>
            <SheetHeader className="border-b p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
              </div>
              <SheetTitle className="mt-1 text-lg leading-snug">
                {ticket.title || 'Ticket'}
              </SheetTitle>
              <p className="text-muted-foreground text-xs">
                {serviceName ? `${serviceName} · ` : ''}#{ticket.id.slice(0, 8)} ·{' '}
                {fmtDateTime(ticket.created_at)}
              </p>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-6 p-5">
                <section>
                  <Label className="text-muted-foreground text-xs">Reported by</Label>
                  <p className="mt-1 text-sm">{nameFor(ticket.employee_id)}</p>
                </section>

                <section>
                  <Label className="text-muted-foreground text-xs">Description</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    {ticket.description || 'No description provided.'}
                  </p>
                </section>

                {canManage && (
                  <section className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Status</Label>
                      <Select
                        value={ticket.status}
                        disabled={busy}
                        onValueChange={(v) =>
                          patch('status', { status: v }, { status: normalizeStatus(v) })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TICKET_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Priority</Label>
                      <Select
                        value={ticket.priority}
                        disabled={busy}
                        onValueChange={(v) =>
                          patch('priority', { priority: v }, { priority: normalizePriority(v) })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TICKET_PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {PRIORITY_LABEL[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Assignee</Label>
                      <Select
                        value={ticket.assignee_id ?? 'none'}
                        disabled={busy}
                        onValueChange={(v) =>
                          patch(
                            'assign',
                            { assignee_id: v === 'none' ? null : v },
                            { assignee_id: v === 'none' ? null : v }
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              {m.full_name || m.email || m.user_id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </section>
                )}

                <section>
                  <Label className="text-muted-foreground text-xs">
                    Activity {comments.length > 0 && `(${comments.length})`}
                  </Label>
                  <div className="mt-2 space-y-3">
                    {loadingComments && (
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Loader2 className="size-4 animate-spin" /> Loading…
                      </div>
                    )}
                    {!loadingComments && comments.length === 0 && (
                      <p className="text-muted-foreground text-sm">No activity yet.</p>
                    )}
                    {comments.map((c) => (
                      <div key={c.id} className="flex gap-2.5">
                        <div className="bg-secondary text-secondary-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
                          {initials(nameFor(c.author_id))}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium">{nameFor(c.author_id)}</span>
                            <span className="text-muted-foreground text-xs">
                              {fmtRelative(c.created_at)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </ScrollArea>

            <div className="flex items-center gap-2 border-t p-4">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    postComment();
                  }
                }}
                placeholder="Write a comment…"
                disabled={posting}
              />
              <Button size="icon" onClick={postComment} disabled={posting || !draft.trim()}>
                {posting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
