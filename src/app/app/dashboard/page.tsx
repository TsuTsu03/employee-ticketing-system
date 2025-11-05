// app/(employee)/employee-dashboard.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

import { ChatContainer, ChatForm } from '@/components/ui/chat';
import { MessageInput } from '@/components/ui/message-input';

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

// Message bubble (mobile-friendly width + soft rounding)
function MessageBubble({ role, children }: { role: MsgRole; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
          'max-w-[88%] sm:max-w-[75%]',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

// Quick Action chips – wrap on small screens so nothing gets cut
function QuickChips({ onAction }: { onAction: (a: ChatButton['action']) => void }) {
  const items: Array<{ label: string; action: ChatButton['action'] }> = [
    { label: 'Inizia Lavoro', action: 'start' },
    { label: 'Termina Lavoro', action: 'end' },
    { label: 'Vedi Segnalazioni', action: 'tickets' },
    { label: 'Invia Segnalazione', action: 'ticket' },
  ];
  return (
    <div className="px-2">
      <div className="flex w-full flex-wrap gap-2">
        {items.map((it) => (
          <Button
            key={it.label}
            size="sm"
            variant="secondary"
            className="rounded-full px-3 py-2 text-xs"
            onClick={() => onAction(it.action)}
          >
            {it.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Compact, truncating badge to prevent mobile overflow */
function ActiveBadge({
  startedAt,
  addr,
  geo,
}: {
  startedAt: string | null;
  addr: string | null;
  geo: Geo | null;
}) {
  const full = `Attivo • Entrato alle ${fmtTime(startedAt)}${
    addr ? ` @ ${addr}` : geo ? ` @ ${fmtGeo(geo)}` : ''
  }`;

  return (
    <Badge
      variant="secondary"
      title={full}
      className="max-w-[70vw] min-w-0 truncate rounded-full py-1 pr-3 pl-2 text-[11px] text-emerald-700 sm:max-w-none sm:text-xs"
    >
      <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
      {/* Short on mobile */}
      <span className="sm:hidden">Attivo • {fmtTime(startedAt)}</span>
      {/* Full on ≥sm */}
      <span className="hidden sm:inline">{full}</span>
    </Badge>
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
  }>({ serviceId: '', notes: '', sending: false });

  // Mobile: drawer Cronologia
  const [histOpen, setHistOpen] = useState(false);

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
        setSvcError(mErr?.message ?? 'Nessuna appartenenza trovata.');
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
    addAssistant('Ciao! Sono il tuo assistente di lavoro.');
    addAssistant('Cosa vuoi fare?', [
      { label: 'Inizia Lavoro', action: 'start' },
      { label: 'Termina Lavoro', action: 'end' },
      { label: 'Invia Segnalazione', action: 'ticket' },
      { label: 'Vedi Segnalazioni', action: 'tickets' },
    ]);
  }

  // Guard
  function requireActiveShift(): boolean {
    if (shiftId) return true;
    addAssistant(
      'Non sei timbrato. Tocca **Inizia Lavoro** per entrare, poi puoi inviare una segnalazione. Vuoi che ti timbri ora?',
      [
        { label: 'Inizia Lavoro', action: 'start' },
        { label: 'Vedi Segnalazioni', action: 'tickets' },
        { label: 'Annulla', action: 'cancel' },
      ]
    );
    return false;
  }

  // Device geo
  const getGeo = () =>
    new Promise<Geo>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocalizzazione non supportata'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => reject(new Error(err.message))
      );
    });

  // Actions
  async function startShift() {
    if (shiftId) {
      addAssistant(
        `Già attivo • Entrato alle ${fmtTime(activeStart)}${
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
        payload = { error: `JSON non valido (${res.status})` };
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
        `🟢 Turno iniziato alle ${fmtTime(startedAt)}${
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
      addAssistant('Non sei timbrato.');
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
        payload = { error: `JSON non valido (${res.status})` };
      }
      if (!res.ok || payload.error) addAssistant(`❌ ${payload.error ?? `HTTP ${res.status}`}`);
      else {
        const endedAt = new Date().toISOString();
        setShiftId(null);
        setActiveStart(null);
        setActiveGeo(null);
        setActiveAddr(null);
        addAssistant(`🔴 Turno terminato alle ${fmtTime(endedAt)}. Ottimo lavoro!`);
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
    addAssistant('Ricevuto. Compila e invierò la segnalazione.');
    setMessages((prev) => [
      ...prev,
      { id: uuid(), role: 'assistant', content: '', kind: 'ticket-composer', ts: Date.now() },
    ]);
  }

  async function sendTicket() {
    if (!requireActiveShift()) return;
    if (!canSendTicket) return addAssistant('❌ Scegli un servizio e aggiungi una nota prima.');
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
        payload = { error: `JSON non valido (${res.status})` };
      }
      if (!res.ok || payload.error || !payload.data)
        return addAssistant(`❌ ${payload.error ?? `HTTP ${res.status}`}`);
      setMyTickets((ts) => [payload.data!, ...ts]);
      addAssistant('✅ Segnalazione inviata. Ti aggiornerò sugli sviluppi.');
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
    addAssistant('Nessun problema — bozza annullata.');
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
        ? 'Inizia Lavoro'
        : action === 'end'
          ? 'Termina Lavoro'
          : action === 'ticket'
            ? 'Invia Segnalazione'
            : action === 'tickets'
              ? 'Vedi Segnalazioni'
              : action === 'sendTicket'
                ? 'Invia Segnalazione'
                : 'Annulla';
    addUser(label);
    if (action === 'start') return startShift();
    if (action === 'end') return endShift();
    if (action === 'ticket') return beginTicket();
    if (action === 'sendTicket') return sendTicket();
    if (action === 'tickets') return openTickets();
    if (action === 'cancel') return cancelTicket();
  }

  // ---------- TEXT → ACTION (fuzzy) ----------
  type QuickAction = 'start' | 'end' | 'ticket' | 'tickets';
  type Detected = { action: QuickAction; note?: string } | null;

  const CANON: Record<QuickAction, string[]> = {
    start: [
      'start',
      'start work',
      'clock in',
      'sign in',
      'pasok na',
      'mag start',
      'magstart',
      'inizia',
      'inizia lavoro',
      'entra',
      'timbratura inizio',
    ],
    end: [
      'end',
      'end work',
      'clock out',
      'sign out',
      'finish',
      'done',
      'tapos na',
      'uwi na',
      'fine',
      'fine lavoro',
      'esci',
      'timbratura fine',
    ],
    tickets: [
      'tickets',
      'my tickets',
      'view tickets',
      'tingnan tickets',
      'segnalazioni',
      'le mie segnalazioni',
      'vedi segnalazioni',
      'visualizza segnalazioni',
    ],
    ticket: [
      'send ticket',
      'ticket',
      'create ticket',
      'open ticket',
      'invia segnalazione',
      'segnalazione',
      'crea segnalazione',
      'apri segnalazione',
    ],
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
    const A = norm(input),
      B = norm(phrase);
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
    if (/\binizia\b/i.test(input) && /\blavoro\b/i.test(input)) return 'start';
    if (/\bfine\b/i.test(input) && /\blavoro\b/i.test(input)) return 'end';
    if (/\bsegnalazion/i.test(input) && /\b(vedi|visualizza|mie)\b/i.test(input)) return 'tickets';
    if (/\binvia\b/i.test(input) && /\bsegnalazion/i.test(input)) return 'ticket';
    if (/\bstart\b/i.test(input) && /\bwork\b/i.test(input)) return 'start';
    if (/\bend\b/i.test(input) && /\bwork\b/i.test(input)) return 'end';
    if (/\bticket(s)?\b/i.test(input) && /\b(view|tingnan|my)\b/i.test(input)) return 'tickets';
    if (/\bsend\b/i.test(input) && /\bticket(s)?\b/i.test(input)) return 'ticket';
    return null;
  }

  function detectQuickAction(raw: string): Detected {
    const ticketWithNote = raw.match(
      /^(?:\s*\/?\s*(?:ticket|segnalazione)|(?:send|invia)\s*(?:ticket|segnalazion[ei])s?)\s+(.+)$/i
    );
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
  // ---------- fine mapping ----------

  function replyDefault() {
    addAssistant(
      'Non ho capito. Puoi dire **inizia**, **fine**, **segnalazione &lt;nota&gt;**, oppure **segnalazioni**. Esempio: `segnalazione Stampante 2° piano inceppata`.'
    );
    showMenu();
  }

  function handleChatSubmit() {
    const raw = input.trim();
    if (!raw) return;

    if (composerVisible) {
      const low = raw.toLowerCase();
      if (/^(send|submit|invia)$/.test(low)) {
        setInput('');
        return sendTicket();
      }
      if (/^(cancel|annulla|cancella|wag na|huwag na)$/.test(low)) {
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

  // Sidebar reset chat
  function newChat() {
    setMessages([]);
    setInput('');
    setTicketDraft({ serviceId: '', notes: '', sending: false });
  }

  const router = useRouter();
  async function logout() {
    try {
      await supabase.auth.signOut();
    } catch {}
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {}
    router.replace('/auth/login?signout=1');
  }
  const initials = (userEmail ?? 'U').slice(0, 2).toUpperCase();

  return (
    <div className="bg-background min-h-[100svh] overflow-x-hidden">
      {/* Mobile-first grid; sidebar only on md+ */}
      <div className="mx-auto grid min-h-[100svh] w-full max-w-screen-sm grid-cols-1 md:max-w-none md:grid-cols-[300px_1fr]">
        {/* Sidebar (hidden on mobile) */}
        <aside className="hidden h-[100svh] flex-col border-r md:flex">
          <div className="flex items-center justify-between px-3 py-3">
            <div className="text-sm font-semibold">Cronologia</div>
            <Button size="sm" className="rounded-full text-xs" onClick={newChat}>
              Nuova
            </Button>
          </div>
          <Separator />
          <ScrollArea className="flex-1 px-2">
            <div className="py-2">
              <button
                onClick={newChat}
                className="hover:bg-muted w-full rounded-xl px-3 py-2 text-left text-sm"
              >
                Nuova chat
              </button>
            </div>
          </ScrollArea>
          <Separator />
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
                {initials}
              </div>
              <div className="max-w-[150px] truncate text-sm">{userEmail ?? 'Connesso'}</div>
            </div>
            <Button size="sm" variant="secondary" className="rounded-full text-xs" onClick={logout}>
              Esci
            </Button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex h-[100svh] max-h-[100svh] flex-col md:h-screen md:max-h-screen">
          {/* Header (compact padding, sticky) */}
          <header className="bg-background/80 sticky top-0 z-20 flex flex-col gap-2 border-b px-3 py-2 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2">
              {/* Mobile: open history */}
              <Sheet open={histOpen} onOpenChange={setHistOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="shrink-0 rounded-full md:hidden">
                    Menu
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-full max-w-xs p-0">
                  <div className="flex items-center justify-between px-3 py-3">
                    <div className="text-sm font-semibold">Cronologia</div>
                    <Button size="sm" className="rounded-full text-xs" onClick={newChat}>
                      Nuova
                    </Button>
                  </div>
                  <Separator />
                  <ScrollArea className="h-[70svh] px-2">
                    <div className="py-2">
                      <button
                        onClick={() => {
                          newChat();
                          setHistOpen(false);
                        }}
                        className="hover:bg-muted w-full rounded-xl px-3 py-2 text-left text-sm"
                      >
                        Nuova chat
                      </button>
                    </div>
                  </ScrollArea>
                  <Separator />
                  <div className="flex items-center justify-between gap-2 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
                        {initials}
                      </div>
                      <div className="max-w-[150px] truncate text-sm">
                        {userEmail ?? 'Connesso'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full text-xs"
                      onClick={logout}
                    >
                      Esci
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <h1 className="truncate text-sm font-semibold sm:text-base">
                Dipendenti — Workspace
              </h1>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <Sheet open={ticketsOpen} onOpenChange={(o) => (o ? openTickets() : closeTickets())}>
                <SheetTrigger asChild>
                  <Button
                    variant="secondary"
                    className="shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap sm:text-sm"
                  >
                    Le mie Segnalazioni
                  </Button>
                </SheetTrigger>
              </Sheet>

              {shiftId && <ActiveBadge startedAt={activeStart} addr={activeAddr} geo={activeGeo} />}
            </div>
          </header>

          {/* Chat area (independent scroll, roomy tap targets) */}
          <div className="flex-1 overflow-hidden">
            <ChatContainer className="h-full">
              {/* Empty: greeting + quick chips */}
              {isEmpty && (
                <div className="space-y-3 px-3 pt-3 sm:px-4 sm:pt-5">
                  <h2 className="text-base font-semibold sm:text-lg">
                    Ciao! Sono il tuo assistente di lavoro.
                  </h2>
                  <QuickChips onAction={handleQuickAction} />
                </div>
              )}

              {!isEmpty && (
                <div className="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
                  {messages.map((m) => (
                    <div key={m.id}>
                      {m.content && <MessageBubble role={m.role}>{m.content}</MessageBubble>}
                      {m.kind === 'ticket-composer' && (
                        <div className="bg-card mt-2 inline-block max-w-[96%] rounded-2xl border p-4 sm:max-w-[90%]">
                          <div className="text-muted-foreground mb-2 text-sm">
                            Crea segnalazione
                          </div>
                          {!shiftId && (
                            <div className="mb-2 rounded border border-yellow-600 bg-yellow-50 px-2 py-1 text-xs text-yellow-800">
                              Devi essere timbrato per inviare segnalazioni.
                            </div>
                          )}

                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="md:col-span-1">
                              <Label
                                htmlFor="svc"
                                className="text-muted-foreground mb-1 block text-xs"
                              >
                                Servizio
                              </Label>
                              <Select
                                value={ticketDraft.serviceId}
                                onValueChange={(v) =>
                                  setTicketDraft((d) => ({ ...d, serviceId: v }))
                                }
                                disabled={
                                  !shiftId ||
                                  svcLoading ||
                                  services.length === 0 ||
                                  ticketDraft.sending
                                }
                              >
                                <SelectTrigger id="svc" className="rounded-2xl">
                                  <SelectValue
                                    placeholder={svcLoading ? 'Caricamento…' : 'Seleziona servizio'}
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
                                Note
                              </Label>
                              <Input
                                id="notes"
                                className="rounded-2xl"
                                placeholder="Descrivi il problema…"
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
                                {ticketDraft.sending ? 'Invio…' : 'Invia Segnalazione'}
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                className="rounded-2xl"
                                onClick={cancelTicket}
                                disabled={ticketDraft.sending}
                              >
                                Annulla
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

              {/* ---- Spacer to keep content above the sticky input (important on empty chat) ---- */}
              <div className="h-[88px] sm:h-[72px]" aria-hidden />

              {/* Input (sticky, safe-area padding for iOS) */}
              <ChatForm
                className="bg-background sticky bottom-0 z-30 mt-auto border-t px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+12px)]"
                isPending={false}
                handleSubmit={handleChatSubmit}
              >
                {() => (
                  <MessageInput
                    className="min-h-[44px] rounded-2xl"
                    value={input}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setInput(e.target.value)
                    }
                    placeholder="Prova: inizia • fine • segnalazioni • segnalazione pc bloccato"
                    allowAttachments={false}
                    isGenerating={false}
                  />
                )}
              </ChatForm>
            </ChatContainer>
          </div>

          {/* Tickets Sheet (full-width on mobile) */}
          <Sheet open={ticketsOpen} onOpenChange={(o) => (o ? openTickets() : closeTickets())}>
            <SheetContent side="right" className="w-full max-w-[100vw] sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Le mie Segnalazioni</SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-3">
                <Input
                  className="w-full rounded-2xl text-sm"
                  placeholder="Cerca per descrizione o stato…"
                  value={ticketsQuery}
                  onChange={(e) => setTicketsQuery(e.target.value)}
                />
                <div className="rounded-2xl border">
                  <ScrollArea className="max-h-[70svh]">
                    <table className="w-full text-sm">
                      <thead className="bg-background sticky top-0">
                        <tr className="border-b text-left">
                          <th className="p-2 font-medium">Descrizione</th>
                          <th className="p-2 font-medium">Stato</th>
                          <th className="p-2 font-medium">Creato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ticketsLoading && (
                          <tr>
                            <td className="p-3" colSpan={3}>
                              Caricamento…
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
                              Nessuna segnalazione trovata.
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
                    Aggiorna
                  </Button>
                  <SheetClose asChild>
                    <Button className="rounded-full px-3 py-1 text-xs">Chiudi</Button>
                  </SheetClose>
                </div>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </main>
      </div>
    </div>
  );
}
