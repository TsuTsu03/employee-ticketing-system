// app/(employee)/employee-dashboard.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

import { ChatContainer, ChatForm } from '@/components/ui/chat';
import { MessageInput } from '@/components/ui/message-input';
import { PromptSuggestions } from '@/components/ui/prompt-suggestions';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';

type Service = { id: string; name: string };
type Ticket = { id: string; description: string | null; status: string; created_at: string };
type Geo = { lat: number; lng: number };
type OpenShiftRow = {
  id: string;
  start_at: string | null;
  start_geo: Geo | null;
  start_address: string | null;
};
type ApiPayload<T> = { data?: T; error?: string };

type ChatButton = {
  label: string;
  action: 'start' | 'end' | 'ticket' | 'tickets' | 'cancel' | 'sendTicket';
};
type MsgRole = 'user' | 'assistant';
type ChatMsg = {
  id: string;
  role: MsgRole;
  content: string;
  buttons?: ChatButton[];
  ts: number;
  kind?: 'ticket-composer';
};

function fmtTime(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
function fmtGeo(g?: Geo | null) {
  return g ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : '';
}
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// reverse geocode cache
const addrCache = new Map<string, string>();
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (addrCache.has(key)) return addrCache.get(key)!;
  try {
    const url = new URL('/api/geocode', window.location.origin);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const label: string | undefined = json?.data?.label;
    if (label) {
      addrCache.set(key, label);
      return label;
    }
  } catch {}
  return null;
}

// Simple bubble renderer
function MessageBubble({ role, children }: { role: MsgRole; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

export default function EmployeeDashboard() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Data
  const [services, setServices] = useState<Service[]>([]);
  const [svcLoading, setSvcLoading] = useState(true);
  const [svcError, setSvcError] = useState<string | null>(null);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);

  // Tickets sheet
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsQuery, setTicketsQuery] = useState('');

  // Shift
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [activeStart, setActiveStart] = useState<string | null>(null);
  const [activeGeo, setActiveGeo] = useState<Geo | null>(null);
  const [activeAddr, setActiveAddr] = useState<string | null>(null);

  // Auth
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Chat model
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState<string>('');

  // Ticket composer
  const [ticketDraft, setTicketDraft] = useState<{
    serviceId: string;
    notes: string;
    sending: boolean;
  }>({
    serviceId: '',
    notes: '',
    sending: false,
  });

  const composerVisible = messages.some((m) => m.kind === 'ticket-composer');
  const canSendTicket =
    Boolean(shiftId && ticketDraft.serviceId && ticketDraft.notes.trim()) && !ticketDraft.sending;

  // Bootstrap
  useEffect(() => {
    (async () => {
      setSvcLoading(true);
      setSvcError(null);

      const { data: membership, error: mErr } = await supabase
        .from('memberships')
        .select('org_id')
        .limit(1)
        .maybeSingle();

      if (mErr || !membership?.org_id) {
        setSvcLoading(false);
        setSvcError(mErr?.message ?? 'No membership found.');
      } else {
        const { data: s, error: sErr } = await supabase
          .from('services')
          .select('id,name')
          .eq('org_id', membership.org_id)
          .order('name', { ascending: true });
        if (sErr) {
          setSvcLoading(false);
          setSvcError(sErr.message);
        } else {
          setServices((s as Service[]) ?? []);
          setSvcLoading(false);
        }
      }

      const { data: auth } = await supabase.auth.getUser();
      setUserEmail(auth.user?.email ?? null);

      const uid = auth.user?.id;
      if (uid) {
        const { data: t } = await supabase
          .from('tickets')
          .select('id, description, status, created_at')
          .eq('employee_id', uid)
          .order('created_at', { ascending: false });
        setMyTickets((t as Ticket[]) ?? []);
      }

      if (uid) {
        const { data: open } = await supabase
          .from('shifts')
          .select('id, start_at, start_geo, start_address')
          .eq('user_id', uid)
          .is('end_at', null)
          .order('start_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (open) {
          const r = open as OpenShiftRow;
          setShiftId(r.id);
          setActiveStart(r.start_at ?? null);
          setActiveGeo(r.start_geo ?? null);
          setActiveAddr(r.start_address ?? null);
          if (!r.start_address && r.start_geo) {
            const addr = await reverseGeocode(r.start_geo.lat, r.start_geo.lng);
            if (addr) {
              setActiveAddr(addr);
              await supabase.from('shifts').update({ start_address: addr }).eq('id', r.id);
            }
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Chat helpers
  function addAssistant(content: string, buttons?: ChatButton[]) {
    setMessages((prev) => [
      ...prev,
      { id: uuid(), role: 'assistant', content, ts: Date.now(), ...(buttons ? { buttons } : {}) },
    ]);
  }
  function addUser(content: string) {
    setMessages((prev) => [...prev, { id: uuid(), role: 'user', content, ts: Date.now() }]);
  }
  function showMenu() {
    addAssistant('What would you like to do?', [
      { label: 'Start Work', action: 'start' },
      { label: 'End Work', action: 'end' },
      { label: 'Send Ticket', action: 'ticket' },
      { label: 'View Tickets', action: 'tickets' },
    ]);
  }

  // Guard
  function requireActiveShift(): boolean {
    if (shiftId) return true;
    addAssistant(
      "You're not clocked in yet. Tap **Start Work** to clock in, then you can send a ticket. Want me to clock you in now?",
      [
        { label: 'Start Work', action: 'start' },
        { label: 'View Tickets', action: 'tickets' },
        { label: 'Cancel', action: 'cancel' },
      ]
    );
    return false;
  }

  // Device geo
  const getGeo = () =>
    new Promise<Geo>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => reject(new Error(err.message))
      );
    });

  // Actions
  async function startShift() {
    if (shiftId) {
      addAssistant(
        `Already active • In since ${fmtTime(activeStart)}${
          activeAddr ? ` @ ${activeAddr}` : activeGeo ? ` @ ${fmtGeo(activeGeo)}` : ''
        }`
      );
      return showMenu();
    }
    try {
      const geo = await getGeo();
      const res = await fetch('/api/shifts/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geo),
      });
      const raw = await res.text();
      let payload: ApiPayload<{ id: string }> = {};
      try {
        payload = JSON.parse(raw) as ApiPayload<{ id: string }>;
      } catch {
        payload = { error: `Invalid JSON (${res.status})` };
      }
      if (!res.ok || payload.error || !payload.data)
        return addAssistant(`❌ ${payload.error ?? `HTTP ${res.status}`}`);

      let startedAt = new Date().toISOString();
      let startedGeo: Geo | null = null;
      let startedAddr: string | null = null;
      const { data: row } = await supabase
        .from('shifts')
        .select('id,start_at,start_geo,start_address')
        .eq('id', payload.data.id)
        .single();
      if (row) {
        const r = row as OpenShiftRow;
        startedAt = r.start_at ?? startedAt;
        startedGeo = r.start_geo ?? null;
        startedAddr = r.start_address ?? null;
      }
      if (!startedAddr && startedGeo) {
        const url = await reverseGeocode(startedGeo.lat, startedGeo.lng);
        if (url) {
          startedAddr = url;
          await supabase.from('shifts').update({ start_address: url }).eq('id', payload.data.id);
        }
      }

      setShiftId(payload.data.id);
      setActiveStart(startedAt);
      setActiveGeo(startedGeo);
      setActiveAddr(startedAddr);
      addAssistant(
        `🟢 Shift started at ${fmtTime(startedAt)}${
          startedAddr ? ` @ ${startedAddr}` : startedGeo ? ` @ ${fmtGeo(startedGeo)}` : ''
        }`
      );
    } catch (e) {
      addAssistant(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      showMenu();
    }
  }

  async function endShift() {
    if (!shiftId) {
      addAssistant("You're not on the clock right now.");
      return showMenu();
    }
    try {
      const geo = await getGeo();
      const res = await fetch('/api/shifts/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shiftId, ...geo }),
      });
      const raw = await res.text();
      let payload: ApiPayload<unknown> = {};
      try {
        payload = JSON.parse(raw) as ApiPayload<unknown>;
      } catch {
        payload = { error: `Invalid JSON (${res.status})` };
      }
      if (!res.ok || payload.error) addAssistant(`❌ ${payload.error ?? `HTTP ${res.status}`}`);
      else {
        const endedAt = new Date().toISOString();
        setShiftId(null);
        setActiveStart(null);
        setActiveGeo(null);
        setActiveAddr(null);
        addAssistant(`🔴 Shift ended at ${fmtTime(endedAt)}. Nice work!`);
      }
    } catch (e) {
      addAssistant(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      showMenu();
    }
  }

  function beginTicket(prefill?: string) {
    if (!requireActiveShift()) return;
    setTicketDraft((d) => ({
      serviceId: services[0]?.id ?? d.serviceId ?? '',
      notes: prefill ?? '',
      sending: false,
    }));
    addAssistant('Got it. Fill this out and I’ll submit the ticket.');
    setMessages((prev) => [
      ...prev,
      { id: uuid(), role: 'assistant', content: '', kind: 'ticket-composer', ts: Date.now() },
    ]);
  }

  async function sendTicket() {
    if (!requireActiveShift()) return;
    if (!canSendTicket) return addAssistant('❌ Please pick a service and add a quick note first.');
    setTicketDraft((d) => ({ ...d, sending: true }));
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: ticketDraft.serviceId, description: ticketDraft.notes }),
      });
      const raw = await res.text();
      let payload: ApiPayload<Ticket> = {};
      try {
        payload = JSON.parse(raw) as ApiPayload<Ticket>;
      } catch {
        payload = { error: `Invalid JSON (${res.status})` };
      }
      if (!res.ok || payload.error || !payload.data)
        return addAssistant(`❌ ${payload.error ?? `HTTP ${res.status}`}`);
      setMyTickets((ts) => [payload.data!, ...ts]);
      addAssistant('✅ Ticket submitted. I’ll keep you posted on updates.');
    } catch (e) {
      addAssistant(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMessages((prev) => prev.filter((m) => m.kind !== 'ticket-composer'));
      setTicketDraft({ serviceId: '', notes: '', sending: false });
      showMenu();
    }
  }

  function cancelTicket() {
    setMessages((prev) => prev.filter((m) => m.kind !== 'ticket-composer'));
    setTicketDraft({ serviceId: '', notes: '', sending: false });
    addAssistant('No problem — canceled the ticket draft.');
    showMenu();
  }

  async function openTickets() {
    setTicketsOpen(true);
    setTicketsLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setMyTickets([]);
        return;
      }
      const { data } = await supabase
        .from('tickets')
        .select('id, description, status, created_at')
        .eq('employee_id', uid)
        .order('created_at', { ascending: false });
      setMyTickets((data as Ticket[]) ?? []);
    } finally {
      setTicketsLoading(false);
    }
  }
  function closeTickets() {
    setTicketsOpen(false);
    setTicketsQuery('');
  }

  // Quick buttons
  function handleQuickAction(action: ChatButton['action']) {
    const label =
      action === 'start'
        ? 'Start Work'
        : action === 'end'
          ? 'End Work'
          : action === 'ticket'
            ? 'Send Ticket'
            : action === 'tickets'
              ? 'View Tickets'
              : action === 'sendTicket'
                ? 'Send Ticket'
                : 'Cancel';
    addUser(label);
    if (action === 'start') return startShift();
    if (action === 'end') return endShift();
    if (action === 'ticket') return beginTicket();
    if (action === 'sendTicket') return sendTicket();
    if (action === 'tickets') return openTickets();
    if (action === 'cancel') return cancelTicket();
  }

  // ---------- FUZZY TEXT → ACTION ----------
  type QuickAction = 'start' | 'end' | 'ticket' | 'tickets';
  type Detected = { action: QuickAction; note?: string } | null;

  const CANON: Record<QuickAction, string[]> = {
    start: ['start', 'start work', 'clock in', 'sign in', 'pasok na', 'mag start', 'magstart'],
    end: ['end', 'end work', 'clock out', 'sign out', 'finish', 'done', 'tapos na', 'uwi na'],
    tickets: ['tickets', 'my tickets', 'view tickets', 'tingnan tickets'],
    ticket: ['send ticket', 'ticket', 'create ticket', 'open ticket'],
  };

  function norm(s: string): string {
    return s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a: string, b: string): number {
    const m = a.length,
      n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  function similarity(a: string, b: string): number {
    const d = levenshtein(a, b);
    const denom = Math.max(a.length, b.length) || 1;
    return 1 - d / denom;
  }

  function fuzzyHit(input: string, phrase: string): boolean {
    const A = norm(input);
    const B = norm(phrase);
    if (!A || !B) return false;
    if (A.includes(B) || B.includes(A)) return true;
    const sim = similarity(A, B);
    if (sim >= 0.78) return true;
    const dist = levenshtein(A, B);
    if (Math.max(A.length, B.length) <= 8 && dist <= 2) return true;
    return false;
  }

  function fuzzyAction(input: string): QuickAction | null {
    for (const [action, list] of Object.entries(CANON) as Array<[QuickAction, string[]]>) {
      if (list.some((p) => fuzzyHit(input, p))) return action;
    }
    if (/\bstart\b/i.test(input) && /\bwork\b/i.test(input)) return 'start';
    if (/\bend\b/i.test(input) && /\bwork\b/i.test(input)) return 'end';
    if (/\bticket(s)?\b/i.test(input) && /\b(view|tingnan|my)\b/i.test(input)) return 'tickets';
    if (/\bsend\b/i.test(input) && /\bticket(s)?\b/i.test(input)) return 'ticket';
    return null;
  }

  function detectQuickAction(raw: string): Detected {
    const ticketWithNote = raw.match(/^(?:\s*\/?\s*ticket|send\s*ticket(?:s)?)\s+(.+)$/i);
    if (ticketWithNote?.[1]?.trim()) return { action: 'ticket', note: ticketWithNote[1].trim() };
    const action = fuzzyAction(raw);
    if (action) return { action };
    return null;
  }

  function handleTextCommand(raw: string) {
    addUser(raw);
    const found = detectQuickAction(raw);
    if (!found) return replyDefault();
    switch (found.action) {
      case 'start':
        return startShift();
      case 'end':
        return endShift();
      case 'tickets':
        return openTickets();
      case 'ticket':
        return beginTicket(found.note);
    }
  }
  // ---------- end fuzzy mapping ----------

  function replyDefault() {
    addAssistant(
      "I didn't catch that. You can say **start**, **end**, **ticket <note>**, or **tickets**. For example: `ticket Printer on 2nd floor is jammed`."
    );
    showMenu();
  }

  function handleChatSubmit() {
    const raw = input.trim();
    if (!raw) return;

    if (composerVisible) {
      const low = raw.toLowerCase();
      if (/^(send|submit)$/.test(low)) {
        setInput('');
        return sendTicket();
      }
      if (/^(cancel|wag na|huwag na)$/.test(low)) {
        setInput('');
        return cancelTicket();
      }
      setTicketDraft((d) => ({ ...d, notes: d.notes ? `${d.notes} ${raw}` : raw }));
      setInput('');
      return;
    }

    setInput('');
    return handleTextCommand(raw);
  }

  const isEmpty = messages.length === 0;
  const lastAssistantWithButtons = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.buttons?.length);

  // Sidebar
  function newChat() {
    setMessages([]);
    setInput('');
    setTicketDraft({ serviceId: '', notes: '', sending: false });
  }

  const router = useRouter();
  async function logout() {
    // Best effort: clear client session (local memory / broadcast tabs)
    try {
      await supabase.auth.signOut();
    } catch {}

    // Critical: clear server cookies
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {}

    // Send user to login (and avoid a stale, cached page)
    router.replace('/auth/login?signout=1');
  }
  const initials = (userEmail ?? 'U').slice(0, 2).toUpperCase();

  return (
    <div className="grid h-screen grid-cols-1 md:grid-cols-[280px_1fr]">
      {/* Sidebar */}
      <aside className="flex h-screen flex-col border-r">
        <div className="flex items-center justify-between px-3 py-3">
          <div className="text-sm font-semibold">History</div>
          <Button size="sm" className="rounded-full text-xs" onClick={newChat}>
            New
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1 px-2">
          <div className="py-2">
            <button
              onClick={newChat}
              className="hover:bg-muted w-full rounded-xl px-3 py-2 text-left text-sm"
            >
              New chat
            </button>
          </div>
        </ScrollArea>
        <Separator />
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
              {initials}
            </div>
            <div className="max-w-[150px] truncate text-sm">{userEmail ?? 'Signed in'}</div>
          </div>
          <Button size="sm" variant="secondary" className="rounded-full text-xs" onClick={logout}>
            Logout
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex h-screen max-h-screen flex-col">
        {/* Header */}
        <header className="bg-background sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-base font-semibold">Employee — Workspace</h1>
          <div className="flex items-center gap-3">
            <Sheet open={ticketsOpen} onOpenChange={(o) => (o ? openTickets() : closeTickets())}>
              <SheetTrigger asChild>
                <Button variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  My Tickets
                </Button>
              </SheetTrigger>
            </Sheet>

            {shiftId && (
              <Badge
                variant="secondary"
                className="gap-2 rounded-full bg-emerald-500/15 py-1 pr-3 pl-2 text-xs text-emerald-700"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Active • In since {fmtTime(activeStart)}
                {activeAddr ? ` @ ${activeAddr}` : activeGeo ? ` @ ${fmtGeo(activeGeo)}` : ''}
              </Badge>
            )}
          </div>
        </header>

        {/* Chat area */}
        <div className="bg-background flex-1 overflow-hidden">
          <ChatContainer className="h-full">
            {isEmpty && (
              <div className="px-4 pt-8">
                <PromptSuggestions
                  label="Welcome! I'm your workspace assistant."
                  suggestions={['Start Work', 'End Work', 'View Tickets', 'Send Ticket']}
                  append={(message) => {
                    const v = message.content;
                    handleQuickAction(
                      v.startsWith('Start')
                        ? 'start'
                        : v.startsWith('End')
                          ? 'end'
                          : v.startsWith('View')
                            ? 'tickets'
                            : 'ticket'
                    );
                  }}
                />
              </div>
            )}

            {!isEmpty && (
              <div className="space-y-3 px-4 py-4">
                {messages.map((m) => (
                  <div key={m.id}>
                    {m.content && <MessageBubble role={m.role}>{m.content}</MessageBubble>}
                    {m.kind === 'ticket-composer' && (
                      <div className="bg-card mt-2 inline-block max-w-[90%] rounded-2xl border p-4">
                        <div className="text-muted-foreground mb-2 text-sm">Create a ticket</div>
                        {!shiftId && (
                          <div className="mb-2 rounded border border-yellow-600 bg-yellow-50 px-2 py-1 text-xs text-yellow-800">
                            You must be clocked in to send tickets.
                          </div>
                        )}

                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="md:col-span-1">
                            <Label
                              htmlFor="svc"
                              className="text-muted-foreground mb-1 block text-xs"
                            >
                              Service
                            </Label>
                            <Select
                              value={ticketDraft.serviceId}
                              onValueChange={(v) => setTicketDraft((d) => ({ ...d, serviceId: v }))}
                              disabled={
                                !shiftId ||
                                svcLoading ||
                                services.length === 0 ||
                                ticketDraft.sending
                              }
                            >
                              <SelectTrigger id="svc" className="rounded-2xl">
                                <SelectValue
                                  placeholder={svcLoading ? 'Loading…' : 'Select service'}
                                />
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

                          <div className="md:col-span-2">
                            <Label
                              htmlFor="notes"
                              className="text-muted-foreground mb-1 block text-xs"
                            >
                              Notes
                            </Label>
                            <Input
                              id="notes"
                              className="rounded-2xl"
                              placeholder="Describe the issue…"
                              value={ticketDraft.notes}
                              onChange={(e) =>
                                setTicketDraft((d) => ({ ...d, notes: e.target.value }))
                              }
                              disabled={!shiftId || ticketDraft.sending}
                            />
                          </div>

                          <div className="flex gap-2 md:col-span-3">
                            <Button
                              className="rounded-2xl"
                              disabled={!canSendTicket}
                              onClick={sendTicket}
                            >
                              {ticketDraft.sending ? 'Sending…' : 'Send Ticket'}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              className="rounded-2xl"
                              onClick={cancelTicket}
                              disabled={ticketDraft.sending}
                            >
                              Cancel
                            </Button>
                          </div>

                          {svcError && (
                            <div className="text-destructive text-sm md:col-span-3">
                              ⚠ {svcError}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {lastAssistantWithButtons && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {lastAssistantWithButtons.buttons!.map((b, i) => (
                      <Button
                        key={i}
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleQuickAction(b.action)}
                      >
                        {b.label}
                      </Button>
                    ))}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}

            {/* Input */}
            <ChatForm
              className="bg-background mt-auto border-t"
              isPending={false}
              handleSubmit={handleChatSubmit}
            >
              {() => (
                <MessageInput
                  className="rounded-2xl"
                  value={input}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                  placeholder="Try: start • end • tickets • ticket sira laptop ko"
                  allowAttachments={false}
                  isGenerating={false}
                />
              )}
            </ChatForm>
          </ChatContainer>
        </div>

        {/* Tickets Sheet */}
        <Sheet open={ticketsOpen} onOpenChange={(o) => (o ? openTickets() : closeTickets())}>
          <SheetContent side="right" className="w-full max-w-xl">
            <SheetHeader>
              <SheetTitle>My Tickets</SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-3">
              <Input
                className="w-full rounded-2xl text-sm"
                placeholder="Search description or status…"
                value={ticketsQuery}
                onChange={(e) => setTicketsQuery(e.target.value)}
              />
              <div className="rounded-2xl border">
                <ScrollArea className="max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-background sticky top-0">
                      <tr className="border-b text-left">
                        <th className="p-2 font-medium">Description</th>
                        <th className="p-2 font-medium">Status</th>
                        <th className="p-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketsLoading && (
                        <tr>
                          <td className="p-3" colSpan={3}>
                            Loading…
                          </td>
                        </tr>
                      )}
                      {!ticketsLoading &&
                        (ticketsQuery.trim()
                          ? myTickets.filter((t) =>
                              `${t.description ?? ''} ${t.status}`
                                .toLowerCase()
                                .includes(ticketsQuery.toLowerCase())
                            )
                          : myTickets
                        ).map((t) => (
                          <tr key={t.id} className="border-t">
                            <td className="p-2">{t.description}</td>
                            <td className="p-2">{t.status}</td>
                            <td className="p-2">{new Date(t.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      {!ticketsLoading && myTickets.length === 0 && (
                        <tr>
                          <td className="text-muted-foreground p-3" colSpan={3}>
                            No tickets found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </div>

            <SheetFooter className="mt-3">
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="rounded-full px-3 py-1 text-xs"
                  onClick={openTickets}
                >
                  Refresh
                </Button>
                <SheetClose asChild>
                  <Button className="rounded-full px-3 py-1 text-xs">Close</Button>
                </SheetClose>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}
