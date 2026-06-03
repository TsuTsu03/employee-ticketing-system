'use client';

import {
  Clock,
  LogIn,
  LogOut,
  MapPin,
  Send,
  Ticket as TicketIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PriorityBadge, StatusBadge } from '@/components/app/ticket-badges';
import { Topbar } from '@/components/app/topbar';
import {
  TicketDetailSheet,
  type AdminTicket,
} from '@/components/app/ticket-detail-sheet';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { fmtRelative, fmtTime } from '@/lib/format';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import {
  PRIORITY_LABEL,
  TICKET_PRIORITIES,
  normalizePriority,
  normalizeStatus,
  type TicketPriority,
} from '@/lib/tickets';

type Service = { id: string; name: string };
type Geo = { lat: number; lng: number };
type ChatAction = 'start' | 'end' | 'ticket' | 'tickets';
type ChatMsg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  buttons?: { label: string; action: ChatAction }[];
};

const uuid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const addrCache = new Map<string, string>();
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (addrCache.has(key)) return addrCache.get(key)!;
  try {
    const url = new URL('/api/geocode', window.location.origin);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const label: string | undefined = json?.data?.label;
    if (label) addrCache.set(key, label);
    return label ?? null;
  } catch {
    return null;
  }
}

function getGeo(): Promise<Geo> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new Error(err.message))
    );
  });
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default function EmployeeWorkspace({ email }: { email: string | null }) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const endRef = useRef<HTMLDivElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [startedAddr, setStartedAddr] = useState<string | null>(null);
  const [busyShift, setBusyShift] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', serviceId: '', priority: 'MEDIUM' as TicketPriority, notes: '' });
  const [sending, setSending] = useState(false);

  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [activeTicket, setActiveTicket] = useState<AdminTicket | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, composerOpen]);

  /* bootstrap */
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;

      const { data: mem } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', uid)
        .limit(1)
        .maybeSingle();
      const org = mem?.org_id ?? null;
      setOrgId(org);

      if (org) {
        const { data: svc } = await supabase
          .from('services')
          .select('id, name')
          .eq('org_id', org)
          .order('name');
        setServices((svc as Service[]) ?? []);
      }

      await refreshTickets(uid);

      const { data: open } = await supabase
        .from('shifts')
        .select('id, start_at, start_geo, start_address')
        .eq('user_id', uid)
        .is('end_at', null)
        .order('start_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open) {
        setShiftId(open.id);
        setStartedAt(open.start_at ?? null);
        setStartedAddr(open.start_address ?? null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshTickets(uid: string | null = userId) {
    if (!uid) return;
    const { data } = await supabase
      .from('tickets')
      .select('id, title, description, status, priority, service_id, employee_id, assignee_id, created_at')
      .eq('employee_id', uid)
      .order('created_at', { ascending: false });
    setTickets(
      ((data as AdminTicket[]) ?? []).map((t) => ({
        ...t,
        status: normalizeStatus(t.status),
        priority: normalizePriority(t.priority),
      }))
    );
  }

  function assistant(content: string, buttons?: ChatMsg['buttons']) {
    setMessages((m) => [...m, { id: uuid(), role: 'assistant', content, buttons }]);
  }
  function user(content: string) {
    setMessages((m) => [...m, { id: uuid(), role: 'user', content }]);
  }

  async function startShift() {
    if (shiftId) {
      assistant(`You're already clocked in since ${fmtTime(startedAt)}.`);
      return;
    }
    setBusyShift(true);
    try {
      const geo = await getGeo();
      const res = await fetch('/api/shifts/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geo),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error || !json.data) throw new Error(json.error ?? `HTTP ${res.status}`);

      const id = json.data.id as string;
      setShiftId(id);
      const now = new Date().toISOString();
      setStartedAt(now);
      const addr = await reverseGeocode(geo.lat, geo.lng);
      if (addr) {
        setStartedAddr(addr);
        await supabase.from('shifts').update({ start_address: addr }).eq('id', id);
      }
      assistant(`🟢 Clocked in at ${fmtTime(now)}${addr ? ` · ${addr}` : ''}. Have a great shift!`);
      toast.success('Clocked in');
    } catch (e) {
      assistant(`❌ ${e instanceof Error ? e.message : 'Could not clock in'}`);
    } finally {
      setBusyShift(false);
    }
  }

  async function endShift() {
    if (!shiftId) {
      assistant("You're not clocked in.");
      return;
    }
    setBusyShift(true);
    try {
      const geo = await getGeo();
      const res = await fetch('/api/shifts/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shiftId, ...geo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setShiftId(null);
      setStartedAt(null);
      setStartedAddr(null);
      assistant(`🔴 Clocked out at ${fmtTime(new Date().toISOString())}. Nice work!`);
      toast.success('Clocked out');
    } catch (e) {
      assistant(`❌ ${e instanceof Error ? e.message : 'Could not clock out'}`);
    } finally {
      setBusyShift(false);
    }
  }

  function beginTicket(prefill?: string) {
    if (!shiftId) {
      assistant('You need to be clocked in to raise a ticket.', [
        { label: 'Clock in', action: 'start' },
      ]);
      return;
    }
    setDraft({
      title: prefill ?? '',
      serviceId: services[0]?.id ?? '',
      priority: 'MEDIUM',
      notes: prefill ?? '',
    });
    setComposerOpen(true);
  }

  async function sendTicket() {
    if (!draft.serviceId || !draft.notes.trim()) {
      toast.error('Pick a service and describe the issue');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: draft.serviceId,
          title: draft.title.trim() || draft.notes.trim().slice(0, 80),
          description: draft.notes.trim(),
          priority: draft.priority,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error || !json.data) throw new Error(json.error ?? `HTTP ${res.status}`);
      setComposerOpen(false);
      setDraft({ title: '', serviceId: '', priority: 'MEDIUM', notes: '' });
      await refreshTickets();
      assistant('✅ Ticket submitted. Your admin will take it from here.');
      toast.success('Ticket submitted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit ticket');
    } finally {
      setSending(false);
    }
  }

  function runAction(a: ChatAction, label?: string) {
    if (label) user(label);
    if (a === 'start') return startShift();
    if (a === 'end') return endShift();
    if (a === 'ticket') return beginTicket();
    if (a === 'tickets') {
      refreshTickets();
      return setTicketsOpen(true);
    }
  }

  function detectAction(raw: string): ChatAction | null {
    const t = raw.toLowerCase();
    if (/\b(clock in|start|sign in|pasok|inizia)\b/.test(t)) return 'start';
    if (/\b(clock out|end|finish|done|sign out|uwi|tapos)\b/.test(t)) return 'end';
    if (/\b(my tickets|view tickets|tickets)\b/.test(t)) return 'tickets';
    if (/\b(new ticket|raise|report|issue|ticket)\b/.test(t)) return 'ticket';
    return null;
  }

  function submitInput() {
    const raw = input.trim();
    if (!raw) return;
    setInput('');
    user(raw);
    const a = detectAction(raw);
    if (a === 'ticket') return beginTicket(raw.replace(/^(new ticket|raise|report|ticket)\s*/i, ''));
    if (a) return runAction(a);
    assistant(
      'I can help you clock in/out or raise a ticket. Try the buttons below.',
      [
        { label: 'Clock in', action: 'start' },
        { label: 'Clock out', action: 'end' },
        { label: 'New ticket', action: 'ticket' },
        { label: 'My tickets', action: 'tickets' },
      ]
    );
  }

  const quickActions: { label: string; action: ChatAction; icon: typeof LogIn }[] = [
    { label: 'Clock in', action: 'start', icon: LogIn },
    { label: 'Clock out', action: 'end', icon: LogOut },
    { label: 'New ticket', action: 'ticket', icon: TicketIcon },
    { label: 'My tickets', action: 'tickets', icon: Clock },
  ];

  const lastButtons = [...messages].reverse().find((m) => m.buttons?.length)?.buttons;

  return (
    <div className="bg-muted/30 flex h-[100svh] flex-col">
      <Topbar title="ShiftDesk" badge="Employee" email={email}>
        {shiftId && (
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 sm:inline-flex dark:text-emerald-300">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            On shift · {fmtTime(startedAt)}
          </span>
        )}
        <Sheet open={ticketsOpen} onOpenChange={setTicketsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => refreshTickets()}>
              My tickets
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b p-5">
              <SheetTitle>My tickets</SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-4">
                {tickets.length === 0 && (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    You haven&apos;t raised any tickets yet.
                  </p>
                )}
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTicket(t);
                      setDetailOpen(true);
                      setTicketsOpen(false);
                    }}
                    className="hover:bg-muted w-full rounded-xl border p-3 text-left transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{t.title || 'Ticket'}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <PriorityBadge priority={t.priority} />
                      <span className="text-muted-foreground text-xs">
                        {fmtRelative(t.created_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </Topbar>

      {/* Chat */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4">
        <ScrollArea className="flex-1">
          <div className="space-y-4 py-6">
            {messages.length === 0 && (
              <div className="space-y-5 py-6 text-center">
                <div className="bg-primary/10 text-primary mx-auto grid size-14 place-items-center rounded-2xl">
                  <MapPin className="size-7" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Hi! I&apos;m your work assistant.</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Clock in or out, and raise tickets — all from here.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {quickActions.map((q) => (
                    <Button
                      key={q.action}
                      variant="secondary"
                      size="sm"
                      className="gap-1.5 rounded-full"
                      disabled={busyShift}
                      onClick={() => runAction(q.action, q.label)}
                    >
                      <q.icon className="size-4" />
                      {q.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.content}
              </Bubble>
            ))}

            {lastButtons && !composerOpen && (
              <div className="flex flex-wrap gap-2">
                {lastButtons.map((b, i) => (
                  <Button
                    key={i}
                    size="sm"
                    className="rounded-full"
                    disabled={busyShift}
                    onClick={() => runAction(b.action, b.label)}
                  >
                    {b.label}
                  </Button>
                ))}
              </div>
            )}

            {composerOpen && (
              <div className="bg-card space-y-3 rounded-2xl border p-4">
                <div className="text-sm font-medium">New ticket</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="Short summary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Service</Label>
                    <Select
                      value={draft.serviceId}
                      onValueChange={(v) => setDraft((d) => ({ ...d, serviceId: v }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Priority</Label>
                    <Select
                      value={draft.priority}
                      onValueChange={(v) =>
                        setDraft((d) => ({ ...d, priority: v as TicketPriority }))
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
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={draft.notes}
                      onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                      placeholder="Describe the problem…"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={sendTicket} disabled={sending}>
                    {sending ? 'Submitting…' : 'Submit ticket'}
                  </Button>
                  <Button variant="ghost" onClick={() => setComposerOpen(false)} disabled={sending}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="bg-background/80 sticky bottom-0 flex items-center gap-2 border-t py-3 backdrop-blur">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitInput()}
            placeholder="Try: clock in · new ticket · my tickets"
            className="h-11 rounded-xl"
          />
          <Button size="icon" className="size-11 shrink-0 rounded-xl" onClick={submitInput}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>

      <TicketDetailSheet
        ticket={activeTicket}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        members={userId ? [{ user_id: userId, full_name: null, email }] : []}
        serviceName={
          activeTicket?.service_id
            ? services.find((s) => s.id === activeTicket.service_id)?.name
            : undefined
        }
        canManage={false}
      />
    </div>
  );
}
