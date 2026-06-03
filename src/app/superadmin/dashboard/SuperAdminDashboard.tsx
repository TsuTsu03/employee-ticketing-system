'use client';

import { Building2, Download, Inbox, Loader2, Plus, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { StatCard } from '@/components/app/stat-card';
import { PriorityBadge, StatusBadge } from '@/components/app/ticket-badges';
import { Topbar } from '@/components/app/topbar';
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
import { fmtRelative } from '@/lib/format';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import {
  STATUS_LABEL,
  TICKET_STATUSES,
  normalizePriority,
  normalizeStatus,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets';

type Org = { id: string; name: string; slug: string; is_active?: boolean };
type Service = { id: string; org_id: string; name: string; description: string | null };
type TicketRow = {
  id: string;
  org_id: string;
  title: string | null;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export default function SuperAdminDashboard({ email }: { email: string | null }) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' });
  const [svc, setSvc] = useState({ org_id: '', name: '', description: '' });
  const [pending, setPending] = useState(false);

  const orgNameById = useMemo(
    () => Object.fromEntries(orgs.map((o) => [o.id, o.name] as const)),
    [orgs]
  );

  useEffect(() => {
    (async () => {
      try {
        const [{ data: o }, { data: s }, { data: t }] = await Promise.all([
          supabase.from('organizations').select('*').order('name'),
          supabase.from('services').select('*').order('name'),
          supabase
            .from('tickets')
            .select('id, org_id, title, description, status, priority, created_at')
            .order('created_at', { ascending: false }),
        ]);
        setOrgs((o as Org[]) ?? []);
        setServices((s as Service[]) ?? []);
        setTickets(
          ((t as TicketRow[]) ?? []).map((row) => ({
            ...row,
            status: normalizeStatus(row.status),
            priority: normalizePriority(row.priority),
          }))
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  async function createOrg() {
    if (!newOrg.name.trim()) return toast.error('Organization name is required');
    setPending(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOrg.name.trim(),
          slug: (newOrg.slug || slugify(newOrg.name)).trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error || !json.data) throw new Error(json.error ?? `HTTP ${res.status}`);
      setOrgs((x) => [json.data as Org, ...x]);
      setNewOrg({ name: '', slug: '' });
      toast.success('Organization created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create organization');
    } finally {
      setPending(false);
    }
  }

  async function createService() {
    if (!svc.org_id) return toast.error('Select an organization');
    if (!svc.name.trim()) return toast.error('Service name is required');
    setPending(true);
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: svc.org_id,
          name: svc.name.trim(),
          description: svc.description.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error || !json.data) throw new Error(json.error ?? `HTTP ${res.status}`);
      setServices((x) => [json.data as Service, ...x]);
      setSvc({ org_id: '', name: '', description: '' });
      toast.success('Service added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add service');
    } finally {
      setPending(false);
    }
  }

  async function setStatus(id: string, status: TicketStatus) {
    const prev = tickets;
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/tickets/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setTickets(prev);
      toast.error(e instanceof Error ? e.message : 'Could not update status');
    }
  }

  const openTickets = tickets.filter((t) => t.status === 'OPEN').length;
  const newThisWeek = tickets.filter(
    (t) => Date.now() - new Date(t.created_at).getTime() < 7 * 864e5
  ).length;

  return (
    <div className="bg-muted/30 min-h-screen">
      <Topbar title="ShiftDesk" badge="Super Admin" email={email} />

      <main className="container-page py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
          <p className="text-muted-foreground text-sm">
            Manage organizations, services, and tickets across ShiftDesk.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Organizations" value={orgs.length} icon={Building2} />
          <StatCard label="Services" value={services.length} icon={Wrench} accent="sky" />
          <StatCard label="Open tickets" value={openTickets} icon={Inbox} accent="amber" />
          <StatCard label="New this week" value={newThisWeek} icon={Plus} accent="emerald" />
        </div>

        <Tabs defaultValue="tickets" className="mt-6">
          <TabsList>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
          </TabsList>

          {/* Tickets */}
          <TabsContent value="tickets" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All tickets</CardTitle>
                    <CardDescription>Manage statuses platform-wide.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild className="gap-2">
                    <a href="/api/export/tickets">
                      <Download className="size-4" /> CSV
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead className="w-[160px]">Status</TableHead>
                        <TableHead className="text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tickets.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="max-w-[280px]">
                            <div className="truncate font-medium">{t.title || 'Ticket'}</div>
                            <div className="text-muted-foreground truncate text-xs">
                              {t.description}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {orgNameById[t.org_id] ?? `${t.org_id.slice(0, 8)}…`}
                          </TableCell>
                          <TableCell>
                            <PriorityBadge priority={t.priority} />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={t.status}
                              onValueChange={(v) => setStatus(t.id, v as TicketStatus)}
                            >
                              <SelectTrigger className="h-8 w-full">
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
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right text-xs">
                            {fmtRelative(t.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {!loading && tickets.length === 0 && (
                  <div className="text-muted-foreground p-10 text-center text-sm">
                    No tickets yet.
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

          {/* Organizations */}
          <TabsContent value="organizations" className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>New organization</CardTitle>
                <CardDescription>Create a tenant workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">Name</Label>
                  <Input
                    id="org-name"
                    placeholder="Acme Corp"
                    value={newOrg.name}
                    onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-slug">Slug</Label>
                  <Input
                    id="org-slug"
                    placeholder="acme"
                    value={newOrg.slug}
                    onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
                  />
                </div>
                <Button onClick={createOrg} disabled={pending} className="w-full gap-2">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Create
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Organizations</CardTitle>
                <CardDescription>{orgs.length} total.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[420px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Slug</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgs.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-sm font-medium">{o.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">/{o.slug}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {orgs.length === 0 && (
                  <div className="text-muted-foreground p-10 text-center text-sm">
                    No organizations yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Services */}
          <TabsContent value="services" className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>New service</CardTitle>
                <CardDescription>A category employees raise tickets against.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Organization</Label>
                  <Select value={svc.org_id} onValueChange={(v) => setSvc({ ...svc, org_id: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-name">Name</Label>
                  <Input
                    id="svc-name"
                    placeholder="On-site support"
                    value={svc.name}
                    onChange={(e) => setSvc({ ...svc, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-desc">Description</Label>
                  <Input
                    id="svc-desc"
                    placeholder="Short description"
                    value={svc.description}
                    onChange={(e) => setSvc({ ...svc, description: e.target.value })}
                  />
                </div>
                <Button onClick={createService} disabled={pending} className="w-full gap-2">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Add service
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Services</CardTitle>
                <CardDescription>{services.length} across all organizations.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[480px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Organization</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm font-medium">{s.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {orgNameById[s.org_id] ?? s.org_id.slice(0, 8)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {services.length === 0 && (
                  <div className="text-muted-foreground p-10 text-center text-sm">
                    No services yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
