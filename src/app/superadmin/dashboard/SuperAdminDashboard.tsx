// File: app/superadmin/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import PageHeader from '@/components/ui/PageHeader';

/* shadcn/ui */
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/* icons */
import { Building2, Cog, Ticket, Download, ShieldPlus, LogOut, TrendingUp } from 'lucide-react';

/* ---------- Types ---------- */
type Org = { id: string; name: string; slug: string; is_active?: boolean };
type Service = { id: string; org_id: string; name: string; description: string | null };
type TicketRow = {
  id: string;
  org_id: string;
  status: string;
  description: string | null;
  created_at: string;
};

/* ---------- Utils ---------- */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function cn(...cls: Array<string | false | undefined>) {
  return cls.filter(Boolean).join(' ');
}

/* ---------- Component ---------- */
export default function SuperAdminDashboard() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' });
  const [svc, setSvc] = useState({ org_id: '', name: '', description: '' });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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
          supabase.from('tickets').select('*').order('created_at', { ascending: false }),
        ]);
        setOrgs((o as Org[]) ?? []);
        setServices((s as Service[]) ?? []);
        setTickets((t as TicketRow[]) ?? []);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Failed to load data');
      }
    })();
  }, [supabase]);

  async function handleSignOut() {
    // Why: hard redirect after clearing session avoids stale UI
    try {
      setSigningOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push('/auth/login'); // adjust to your sign-in route
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to sign out');
    } finally {
      setSigningOut(false);
    }
  }

  async function createOrg() {
    if (!newOrg.name.trim()) return setMsg('Organization name is required.');
    const payload = {
      name: newOrg.name.trim(),
      slug: (newOrg.slug || slugify(newOrg.name)).trim(),
    };
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let body: { data?: Org; error?: string } = {};
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: `Invalid response (${res.status})` };
      }

      if (!res.ok || body.error) return setMsg(body.error ?? `HTTP ${res.status}`);
      if (body.data) {
        setOrgs((x) => [body.data!, ...x]);
        setNewOrg({ name: '', slug: '' });
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Create org failed');
    } finally {
      setPending(false);
    }
  }

  async function createService() {
    if (!svc.org_id) return setMsg('Select an organization.');
    if (!svc.name.trim()) return setMsg('Service name is required.');

    setPending(true);
    setMsg(null);

    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: svc.org_id,
          name: svc.name.trim(),
          description: svc.description.trim() ? svc.description.trim() : null,
        }),
      });

      const text = await res.text();
      let body: { data?: Service; error?: string } = {};
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: `Invalid response (${res.status})` };
      }

      if (!res.ok || body.error || !body.data) {
        return setMsg(body.error ?? `HTTP ${res.status}`);
      }

      setServices((x) => [body.data!, ...x]);
      setSvc({ org_id: '', name: '', description: '' });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Create service failed');
    } finally {
      setPending(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setMsg(null);
    const prev = tickets;
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/tickets/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const text = await res.text();
      let body: { data?: { status: string }; error?: string } = {};
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: `Invalid response (${res.status})` };
      }
      if (!res.ok || body.error || !body.data) throw new Error(body.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setTickets(prev);
      setMsg(e instanceof Error ? e.message : 'Update status failed');
    }
  }

  /* ---------- Derived KPI placeholders ---------- */
  const totalOrgs = orgs.length;
  const totalServices = services.length;
  const openTickets = tickets.filter((t) => t.status === 'OPEN').length;
  const newThisWeek = tickets.filter(
    (t) => Date.now() - new Date(t.created_at).getTime() < 7 * 864e5
  ).length;

  return (
    <div className="grid gap-6 p-4">
      <PageHeader title="SuperAdmin — Dashboard" />

      {/* Status banner */}
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

      {/* Top nav & actions */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-9 bg-transparent">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-black data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="organizations"
              className="data-[state=active]:bg-white data-[state=active]:text-black"
            >
              Organizations
            </TabsTrigger>
            <TabsTrigger
              value="services"
              className="data-[state=active]:bg-white data-[state=active]:text-black"
            >
              Services
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="data-[state=active]:bg-white data-[state=active]:text-black"
            >
              Tickets
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild className="gap-2">
              <a href="/api/export/tickets">
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Organizations</CardTitle>
              <Building2 className="h-4 w-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOrgs}</div>
              <p className="text-xs opacity-70">Total organizations</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Services</CardTitle>
              <Cog className="h-4 w-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalServices}</div>
              <p className="text-xs opacity-70">Across all orgs</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
              <Ticket className="h-4 w-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{openTickets}</div>
              <p className="text-xs opacity-70">Needing attention</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New this week</CardTitle>
              <TrendingUp className="h-4 w-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{newThisWeek}</div>
              <p className="text-xs opacity-70">Last 7 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Main grid */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* Organizations */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Organizations</CardTitle>
              <CardDescription>Create and list organizations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="org_name">Organization name</Label>
                  <Input
                    id="org_name"
                    placeholder="Acme Corp"
                    value={newOrg.name}
                    onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="org_slug">Slug</Label>
                  <Input
                    id="org_slug"
                    placeholder="acme"
                    value={newOrg.slug}
                    onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={createOrg} disabled={pending} className="w-full gap-2">
                    <ShieldPlus className="h-4 w-4" />
                    {pending ? 'Working…' : 'Create'}
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">Name</TableHead>
                      <TableHead>Slug</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgs.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-sm">{o.name}</TableCell>
                        <TableCell className="text-xs opacity-70">/{o.slug}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {orgs.length === 0 && (
                  <div className="p-8 text-center text-sm opacity-70">No organizations yet.</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Services */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Services</CardTitle>
              <CardDescription>Add a service and see recent ones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label>Organization</Label>
                  <Select value={svc.org_id} onValueChange={(v) => setSvc({ ...svc, org_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select org" />
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
                <div className="mr-2 space-y-1 sm:col-span-2">
                  <Label htmlFor="svc_name">Service name</Label>
                  <Input
                    id="svc_name"
                    placeholder="On-site support"
                    value={svc.name}
                    onChange={(e) => setSvc({ ...svc, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="svc_desc">Description</Label>
                  <Input
                    id="svc_desc"
                    placeholder="Short description"
                    value={svc.description}
                    onChange={(e) => setSvc({ ...svc, description: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={createService} disabled={pending} className="w-full">
                    {pending ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">Service</TableHead>
                      <TableHead>Organization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.slice(0, 9).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{s.name}</TableCell>
                        <TableCell className="text-xs opacity-70">
                          {orgNameById[s.org_id] ?? s.org_id.slice(0, 8)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {services.length === 0 && (
                  <div className="p-8 text-center text-sm opacity-70">No services yet.</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tickets */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>All Tickets</CardTitle>
              <CardDescription>Manage statuses across the platform.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Org</TableHead>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-left">Notes</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs opacity-70">
                          {orgNameById[t.org_id] ?? `${t.org_id.slice(0, 8)}…`}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{t.id.slice(0, 8)}…</TableCell>
                        <TableCell>
                          <Select value={t.status} onValueChange={(v) => setStatus(t.id, v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OPEN">OPEN</SelectItem>
                              <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
                              <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                              <SelectItem value="CLOSED">CLOSED</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm">{t.description}</TableCell>
                        <TableCell className="text-sm">
                          {new Date(t.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {tickets.length === 0 && (
                  <div className="p-8 text-center text-sm opacity-70">No tickets yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </Tabs>
    </div>
  );
}
