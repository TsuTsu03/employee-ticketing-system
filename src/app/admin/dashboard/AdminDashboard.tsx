'use client';

import {
  CheckCircle2,
  Clock3,
  Download,
  Inbox,
  Loader2,
  Search,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { StatCard } from '@/components/app/stat-card';
import { PriorityBadge, StatusBadge } from '@/components/app/ticket-badges';
import { Topbar } from '@/components/app/topbar';
import {
  TicketDetailSheet,
  type AdminTicket,
  type Member,
} from '@/components/app/ticket-detail-sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fmtDateTime, fmtDuration, fmtRelative } from '@/lib/format';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import {
  STATUS_LABEL,
  TICKET_STATUSES,
  normalizePriority,
  normalizeStatus,
  type TicketStatus,
} from '@/lib/tickets';

const OrgSchema = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });
type Org = z.infer<typeof OrgSchema>;

const MemberSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']),
  email: z.string().email().nullable(),
  full_name: z.string().nullable(),
});
type MemberRow = z.infer<typeof MemberSchema>;
type Role = MemberRow['role'];

type Service = { id: string; name: string };
type Shift = {
  id: string;
  user_id: string;
  start_at: string | null;
  end_at: string | null;
};

export default function AdminDashboard({ email }: { email: string | null }) {
  const sb = useMemo(() => createBrowserSupabase(), []);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  // ticket filters
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL');
  const [activeTicket, setActiveTicket] = useState<AdminTicket | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // invite form
  const [form, setForm] = useState({ email: '', full_name: '', role: 'EMPLOYEE' as Role });
  const [inviting, setInviting] = useState(false);

  const serviceName = useMemo(
    () => Object.fromEntries(services.map((s) => [s.id, s.name] as const)),
    [services]
  );
  const memberList: Member[] = members.map((m) => ({
    user_id: m.user_id,
    full_name: m.full_name,
    email: m.email,
  }));
  const nameFor = (id?: string | null) => {
    if (!id) return '—';
    const m = members.find((x) => x.user_id === id);
    return m?.full_name || m?.email || `${id.slice(0, 8)}…`;
  };

  /* load orgs */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await sb.rpc('my_org_rows');
        if (error) throw new Error(error.message);
        const list = z.array(OrgSchema).parse(data ?? []);
        setOrgs(list);
        setOrgId((p) => p || list[0]?.id || '');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load organizations');
      }
    })();
  }, [sb]);

  /* load org-scoped data */
  useEffect(() => {
    if (!orgId) return;
    const ac = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const memRes = await sb.rpc('get_members', { p_org_id: orgId }).abortSignal(ac.signal);
        if (memRes.error) throw new Error(memRes.error.message);
        setMembers(z.array(MemberSchema).parse(memRes.data ?? []));

        const svcRes = await sb
          .from('services')
          .select('id, name')
          .eq('org_id', orgId)
          .order('name')
          .abortSignal(ac.signal);
        if (svcRes.error) throw new Error(svcRes.error.message);
        setServices((svcRes.data as Service[]) ?? []);

        const tkRes = await sb
          .from('tickets')
          .select(
            'id, title, description, status, priority, service_id, employee_id, assignee_id, created_at'
          )
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .abortSignal(ac.signal);
        if (tkRes.error) throw new Error(tkRes.error.message);
        setTickets(
          (tkRes.data ?? []).map((t) => ({
            ...(t as AdminTicket),
            status: normalizeStatus((t as { status: unknown }).status),
            priority: normalizePriority((t as { priority: unknown }).priority),
          }))
        );
      } catch (e) {
        if (!ac.signal.aborted) {
          toast.error(e instanceof Error ? e.message : 'Failed to load data');
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [sb, orgId]);

  /* load shifts for range */
  useEffect(() => {
    if (!orgId) return;
    const ac = new AbortController();
    (async () => {
      const fromIso = new Date(from).toISOString();
      const toIso = new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString();
      const { data, error } = await sb
        .from('shifts')
        .select('id, user_id, start_at, end_at')
        .eq('org_id', orgId)
        .gte('start_at', fromIso)
        .lte('start_at', toIso)
        .order('start_at', { ascending: false })
        .abortSignal(ac.signal);
      if (!error) setShifts((data as Shift[]) ?? []);
    })();
    return () => ac.abort();
  }, [sb, orgId, from, to]);

  /* KPIs */
  const kpis = useMemo(() => {
    const open = tickets.filter((t) => t.status === 'OPEN').length;
    const inProgress = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
    const urgentOpen = tickets.filter(
      (t) => t.status === 'OPEN' && t.priority === 'URGENT'
    ).length;
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const resolvedToday = tickets.filter(
      (t) => t.status === 'RESOLVED' && new Date(t.created_at).getTime() >= startOfDay
    ).length;
    const onShift = shifts.filter((s) => s.start_at && !s.end_at).length;
    return { open, inProgress, urgentOpen, resolvedToday, onShift };
  }, [tickets, shifts]);

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (!q) return true;
      return `${t.title ?? ''} ${t.description ?? ''} ${nameFor(t.employee_id)}`
        .toLowerCase()
        .includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, query, statusFilter, members]);

  function openTicket(t: AdminTicket) {
    setActiveTicket(t);
    setSheetOpen(true);
  }
  function applyTicketPatch(patch: Partial<AdminTicket>) {
    setTickets((ts) =>
      ts.map((t) => (activeTicket && t.id === activeTicket.id ? { ...t, ...patch } : t))
    );
    setActiveTicket((t) => (t ? { ...t, ...patch } : t));
  }

  async function updateRole(user_id: string, role: Role) {
    const res = await fetch('/api/admin/membership', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, org_id: orgId, role }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      toast.error(json.error ?? 'Could not update role');
      return;
    }
    setMembers((ms) => ms.map((m) => (m.user_id === user_id ? { ...m, role } : m)));
    toast.success('Role updated');
  }

  async function inviteUser() {
    if (!form.email.trim()) return toast.error('Email is required');
    setInviting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          email: form.email.trim(),
          full_name: form.full_name || null,
          role: form.role,
          invite: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      const memRes = await sb.rpc('get_members', { p_org_id: orgId });
      if (!memRes.error) setMembers(z.array(MemberSchema).parse(memRes.data ?? []));
      setForm({ email: '', full_name: '', role: 'EMPLOYEE' });
      toast.success('Invitation sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not invite user');
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="bg-muted/30 min-h-screen">
      <Topbar title="ShiftDesk" badge="Admin" email={email}>
        {orgs.length > 1 && (
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Organization" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Topbar>

      <main className="container-page py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {orgs.find((o) => o.id === orgId)?.name ?? 'Your organization'} · overview & support
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open tickets" value={kpis.open} icon={Inbox} accent="sky" />
          <StatCard
            label="In progress"
            value={kpis.inProgress}
            icon={Clock3}
            accent="amber"
          />
          <StatCard
            label="Urgent & open"
            value={kpis.urgentOpen}
            icon={TriangleAlert}
            accent="red"
            hint="Needs attention"
          />
          <StatCard
            label="On shift now"
            value={kpis.onShift}
            icon={CheckCircle2}
            accent="emerald"
          />
        </div>

        <Tabs defaultValue="tickets" className="mt-6">
          <TabsList>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="shifts">Shifts</TabsTrigger>
          </TabsList>

          {/* ---------------- Tickets ---------------- */}
          <TabsContent value="tickets" className="mt-4">
            <Card>
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Support tickets</CardTitle>
                    <CardDescription>Assign, comment, and resolve.</CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative">
                      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search tickets…"
                        className="h-9 w-full pl-8 sm:w-56"
                      />
                    </div>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => setStatusFilter(v as TicketStatus | 'ALL')}
                    >
                      <SelectTrigger className="h-9 w-full sm:w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All statuses</SelectItem>
                        {TICKET_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Reporter</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assignee</TableHead>
                        <TableHead className="text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTickets.map((t) => (
                        <TableRow
                          key={t.id}
                          className="cursor-pointer"
                          onClick={() => openTicket(t)}
                        >
                          <TableCell className="max-w-[260px]">
                            <div className="truncate font-medium">{t.title || 'Ticket'}</div>
                            <div className="text-muted-foreground truncate text-xs">
                              {t.description}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{nameFor(t.employee_id)}</TableCell>
                          <TableCell className="text-sm">
                            {t.service_id ? serviceName[t.service_id] ?? '—' : '—'}
                          </TableCell>
                          <TableCell>
                            <PriorityBadge priority={t.priority} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={t.status} />
                          </TableCell>
                          <TableCell className="text-sm">
                            {t.assignee_id ? nameFor(t.assignee_id) : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right text-xs">
                            {fmtRelative(t.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {!loading && filteredTickets.length === 0 && (
                  <div className="text-muted-foreground p-10 text-center text-sm">
                    No tickets match your filters.
                  </div>
                )}
                {loading && (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 p-10 text-sm">
                    <Loader2 className="size-4 animate-spin" /> Loading…
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Team ---------------- */}
          <TabsContent value="team" className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Invite a member</CardTitle>
                <CardDescription>They&apos;ll get an email to set a password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-email">Email</Label>
                  <Input
                    id="inv-email"
                    placeholder="name@company.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-name">Full name (optional)</Label>
                  <Input
                    id="inv-name"
                    placeholder="Jane Doe"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMPLOYEE">Employee</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={inviteUser} disabled={inviting || !orgId} className="w-full gap-2">
                  {inviting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                  {inviting ? 'Inviting…' : 'Send invite'}
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Members</CardTitle>
                <CardDescription>{members.length} people in this organization.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[520px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="w-[150px]">Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.user_id}>
                          <TableCell className="text-sm font-medium">
                            {m.full_name ?? m.user_id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {m.email ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={m.role}
                              onValueChange={(v) => updateRole(m.user_id, v as Role)}
                              disabled={m.role === 'SUPER_ADMIN'}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="EMPLOYEE">Employee</SelectItem>
                                <SelectItem value="ADMIN">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {members.length === 0 && (
                  <div className="text-muted-foreground p-10 text-center text-sm">
                    No members yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Shifts ---------------- */}
          <TabsContent value="shifts" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Shifts</CardTitle>
                    <CardDescription>Clock in/out records for the selected range.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                    <span className="text-muted-foreground text-sm">—</span>
                    <Input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                    <Button variant="outline" size="sm" asChild className="gap-2">
                      <a href="/api/export/shifts">
                        <Download className="size-4" /> CSV
                      </a>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shifts.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{nameFor(s.user_id)}</TableCell>
                          <TableCell className="text-sm">{fmtDateTime(s.start_at)}</TableCell>
                          <TableCell className="text-sm">
                            {s.end_at ? fmtDateTime(s.end_at) : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {fmtDuration(s.start_at, s.end_at)}
                          </TableCell>
                          <TableCell>
                            {s.end_at ? (
                              <span className="text-muted-foreground text-xs">Ended</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                                <span className="size-1.5 rounded-full bg-emerald-500" /> Active
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {shifts.length === 0 && (
                  <div className="text-muted-foreground p-10 text-center text-sm">
                    No shifts in this range.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <TicketDetailSheet
        ticket={activeTicket}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        members={memberList}
        serviceName={activeTicket?.service_id ? serviceName[activeTicket.service_id] : undefined}
        canManage
        onChange={applyTicketPatch}
      />
    </div>
  );
}
