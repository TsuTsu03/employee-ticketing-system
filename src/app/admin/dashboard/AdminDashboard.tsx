// File: app/admin/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import PageHeader from '@/components/ui/PageHeader';

/* shadcn/ui */
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

/* icons */
import {
  DollarSign,
  Users2,
  TrendingUp,
  Activity,
  Download,
  CalendarDays,
  Shield,
  LogOut,
} from 'lucide-react';

/* ---------- Tipi ---------- */
const RoleEnum = z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);
type Role = z.infer<typeof RoleEnum>;

const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
type Org = z.infer<typeof OrgSchema>;

/** Righe restituite dall'RPC: get_members(p_org_id uuid) */
const RpcMemberRowSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  role: RoleEnum,
  email: z.string().email().nullable(),
  full_name: z.string().nullable(),
});
type RpcMemberRow = z.infer<typeof RpcMemberRowSchema>;

/** Accetta RFC3339 con fuso orario (es. +00:00) */
const ShiftRowSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  user_id: z.string().uuid(),
  start_at: z.string().datetime({ offset: true }).nullable(),
  end_at: z.string().datetime({ offset: true }).nullable(),
});
type ShiftRow = z.infer<typeof ShiftRowSchema>;

type ApiResult<T> = { data?: T; error?: string };

/* ---------- Util ---------- */
function cn(...cls: Array<string | false | undefined>) {
  return cls.filter(Boolean).join(' ');
}
const fmtNumber = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);

/* ---------- Componente ---------- */
export default function AdminDashboard() {
  const sb = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState('');
  const [members, setMembers] = useState<RpcMemberRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: 'EMPLOYEE' as Role,
    invite: true,
  });

  const onlyOneOrg = orgs.length === 1;

  /* Auto-dismiss banner dopo 5s */
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(id);
  }, [msg]);

  function parseApi<T>(u: unknown): ApiResult<T> {
    if (typeof u === 'object' && u !== null && ('data' in u || 'error' in u)) {
      const r = u as ApiResult<T>;
      return { data: r.data, error: r.error };
    }
    return { error: 'Risposta non valida' };
  }

  const duration = (s: ShiftRow) => {
    if (!s.start_at) return '-';
    const end = s.end_at ? new Date(s.end_at).getTime() : Date.now();
    const ms = end - new Date(s.start_at).getTime();
    const h = Math.floor(ms / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    return `${h}h ${m}m`;
  };

  /* Carica organizzazioni via RPC (my_org_rows) */
  useEffect(() => {
    (async () => {
      setMsg(null);
      try {
        const { data, error } = await sb.rpc('my_org_rows');
        if (error) throw new Error(error.message);
        const list = z.array(OrgSchema).parse(data ?? []);
        setOrgs(list);
        setOrgId((prev) => prev || list[0]?.id || '');
      } catch (e) {
        const m = e instanceof Error ? e.message : 'Impossibile caricare le organizzazioni';
        console.error('Errore caricamento org:', m);
        setMsg(`Impossibile caricare le organizzazioni: ${m}`);
        setOrgs([]);
        setOrgId('');
      }
    })();
  }, [sb]);

  /* Carica membri + turni dell’organizzazione selezionata */
  useEffect(() => {
    if (!orgId) return;
    const ac = new AbortController();
    (async () => {
      try {
        const memRes = await sb.rpc('get_members', { p_org_id: orgId }).abortSignal(ac.signal);
        if (memRes.error) throw new Error(memRes.error.message);
        const rows = z.array(RpcMemberRowSchema).parse(memRes.data ?? []);
        setMembers(rows);

        const fromIso = new Date(from).toISOString();
        const toIso = new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString();
        const shRes = await sb
          .from('shifts')
          .select('id, org_id, user_id, start_at, end_at')
          .eq('org_id', orgId)
          .gte('start_at', fromIso)
          .lte('start_at', toIso)
          .order('start_at', { ascending: false })
          .abortSignal(ac.signal);
        if (shRes.error) throw new Error(shRes.error.message);
        setShifts(z.array(ShiftRowSchema).parse(shRes.data ?? []));
      } catch (e) {
        if (!ac.signal.aborted) {
          const m = e instanceof Error ? e.message : 'Impossibile caricare i dati';
          console.error('Errore membri/turni:', m);
          setMsg(m);
        }
      }
    })();
    return () => ac.abort();
  }, [sb, orgId, from, to]);

  /* Azioni */
  async function refreshMembers() {
    const res = await sb.rpc('get_members', { p_org_id: orgId });
    if (res.error) {
      setMsg(res.error.message);
      return;
    }
    const rows = z.array(RpcMemberRowSchema).parse(res.data ?? []);
    setMembers(rows);
  }

  async function createUser() {
    if (!orgId) return setMsg('Seleziona un’organizzazione.');
    if (!form.email.trim()) return setMsg('Email obbligatoria.');
    const EmailSchema = z.string().email();
    if (!EmailSchema.safeParse(form.email.trim()).success)
      return setMsg('Inserisci un’email valida.');

    setPending(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          email: form.email.trim(),
          full_name: form.full_name || null,
          role: form.role,
          invite: form.invite,
        }),
      });
      const { error } = parseApi<unknown>(await res.json());
      if (error) setMsg(error);
      else {
        await refreshMembers();
        setForm({ email: '', full_name: '', role: 'EMPLOYEE', invite: true });
        setMsg('Utente creato.');
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Operazione non riuscita');
    } finally {
      setPending(false);
    }
  }

  async function updateRole(user_id: string, role: Role) {
    setMsg(null);
    const res = await fetch('/api/admin/memberships', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, org_id: orgId, role }),
    });
    const { error } = parseApi<{ ok: true }>(await res.json());
    if (error) setMsg(error);
    else setMembers((ms) => ms.map((m) => (m.user_id === user_id ? { ...m, role } : m)));
  }

  async function handleSignOut() {
    try {
      setSigningOut(true);
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      router.push('/auth/login');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Disconnessione non riuscita');
    } finally {
      setSigningOut(false);
    }
  }

  /* Placeholder KPI derivati */
  const activeNow = Math.max(0, shifts.filter((s) => s.start_at && !s.end_at).length);
  const subscriptions = members.length;
  const salesCount = Math.round(shifts.length * 1.2); // placeholder
  const totalRevenue = salesCount * 37; // placeholder

  return (
    <div className="p-3 sm:p-4">
      <PageHeader title="Admin — Dashboard" />

      {/* Banner di stato */}
      {msg && (
        <div
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            'border-white/20 bg-white/5 text-white'
          )}
          role="status"
          aria-live="polite"
        >
          {msg}
        </div>
      )}

      {/* Tabs e azioni (stack su mobile) */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-9 self-start bg-transparent">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-black data-[state=active]:text-white"
            >
              Panoramica
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="data-[state=active]:bg-white data-[state=active]:text-black"
            >
              Analisi
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              className="data-[state=active]:bg-white data-[state=active]:text-black"
            >
              Report
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="data-[state=active]:bg-white data-[state=active]:text-black"
            >
              Notifiche
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={orgId}
              onValueChange={(v) => setOrgId(v)}
              disabled={onlyOneOrg || orgs.length === 0}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Seleziona organizzazione" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Scarica
              </Button>

              {/* Esci */}
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? 'Disconnessione…' : 'Esci'}
              </Button>
            </div>
          </div>
        </div>

        {/* KPI cards (1 col su mobile) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ricavi Totali</CardTitle>
              <DollarSign className="h-4 w-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtCurrency(totalRevenue)}</div>
              <p className="text-xs opacity-70">+20.1% rispetto al mese scorso</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Iscrizioni</CardTitle>
              <Users2 className="h-4 w-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{fmtNumber(subscriptions)}</div>
              <p className="text-xs opacity-70">+180.1% rispetto al mese scorso</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vendite</CardTitle>
              <TrendingUp className="h-4 w-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{fmtNumber(salesCount)}</div>
              <p className="text-xs opacity-70">+19% rispetto al mese scorso</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Attivi Ora</CardTitle>
              <Activity className="h-4 w-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{fmtNumber(activeNow)}</div>
              <p className="text-xs opacity-70">+201 dall’ultima ora</p>
            </CardContent>
          </Card>
        </div>

        {/* Griglia principale (1 col su mobile; 2 + rail su desktop) */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4 lg:col-span-2">
            {/* Crea utente */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Crea account dipendente</CardTitle>
                <CardDescription>Invita o aggiungi un utente con un ruolo.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-5">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="email">Email di lavoro</Label>
                  <Input
                    id="email"
                    placeholder="nome@azienda.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="full_name">Nome completo (opzionale)</Label>
                  <Input
                    id="full_name"
                    placeholder="Mario Rossi"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Ruolo</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona ruolo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMPLOYEE">EMPLOYEE</SelectItem>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-1 md:col-span-4">
                  <input
                    id="invite"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.invite}
                    onChange={(e) => setForm((f) => ({ ...f, invite: e.target.checked }))}
                  />
                  <Label htmlFor="invite" className="text-sm">
                    Invia email di invito (l’utente imposta la password)
                  </Label>
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <Button onClick={createUser} disabled={pending || !orgId} className="gap-2">
                  <Shield className="h-4 w-4" />
                  {pending ? 'Creazione…' : 'Crea'}
                </Button>
              </CardFooter>
            </Card>

            {/* Membri (tabella scrollabile su mobile) */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Membri</CardTitle>
                <CardDescription>Gestisci i ruoli per membro.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left">Utente</TableHead>
                        <TableHead className="text-left">Email</TableHead>
                        <TableHead className="w-[170px]">Ruolo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.user_id}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback>
                                  {(m.full_name || '??')
                                    .split(' ')
                                    .map((p) => p[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span>{m.full_name ?? m.user_id.slice(0, 8)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{m.email ?? '—'}</TableCell>
                          <TableCell>
                            <Select
                              value={m.role}
                              onValueChange={(v) => updateRole(m.user_id, v as Role)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="EMPLOYEE">EMPLOYEE</SelectItem>
                                <SelectItem value="ADMIN">ADMIN</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {members.length === 0 && (
                  <div className="p-8 text-center text-sm opacity-70">Ancora nessun membro.</div>
                )}
              </CardContent>
            </Card>

            {/* Turni (tabella scrollabile + filtri compatti) */}
            <Card className="shadow-lg">
              <CardHeader className="space-y-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Turni (entrata/uscita)</CardTitle>
                    <CardDescription>Timbrature tracciate per l’intervallo scelto.</CardDescription>
                  </div>
                  <div className="xs:flex-row flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute top-2.5 left-2 h-4 w-4 opacity-70" />
                      <Input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="w-[11.25rem] pl-8"
                      />
                    </div>
                    <span className="hidden opacity-70 sm:inline">—</span>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute top-2.5 left-2 h-4 w-4 opacity-70" />
                      <Input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="w-[11.25rem] pl-8"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[720px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left">Utente</TableHead>
                        <TableHead>Inizio</TableHead>
                        <TableHead>Fine</TableHead>
                        <TableHead>Durata</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shifts.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">
                            {members.find((m) => m.user_id === s.user_id)?.full_name ??
                              s.user_id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.start_at ? new Date(s.start_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.end_at ? new Date(s.end_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-sm">{duration(s)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {shifts.length === 0 && (
                  <div className="p-8 text-center text-sm opacity-70">
                    Nessun turno nell’intervallo.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Rail destro: Attività recente */}
          <div className="grid gap-4">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Attività recente</CardTitle>
                <CardDescription>
                  Hai registrato {fmtNumber(shifts.length)} turni in questo intervallo.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <ScrollArea className="h-[420px] px-6">
                  <div className="space-y-4">
                    {members.slice(0, 8).map((m, i) => (
                      <div key={m.user_id}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {(m.full_name || '??')
                                  .split(' ')
                                  .map((p) => p[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-0.5">
                              <div className="text-sm leading-none font-medium">
                                {m.full_name ?? m.user_id.slice(0, 8)}
                              </div>
                              <div className="text-xs opacity-70">{m.email ?? '—'}</div>
                            </div>
                          </div>
                          <Badge variant="outline">+{fmtNumber((i + 1) * 39)}</Badge>
                        </div>
                        <Separator className="my-4" />
                      </div>
                    ))}
                    {members.length === 0 && (
                      <div className="py-6 text-center text-sm opacity-70">Nessuna attività.</div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
