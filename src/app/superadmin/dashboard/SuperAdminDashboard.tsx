'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import PageHeader from '@/components/ui/PageHeader';

type Org = { id: string; name: string; slug: string; is_active?: boolean };
type Service = { id: string; org_id: string; name: string; description: string | null };
type Ticket = {
  id: string;
  org_id: string;
  status: string;
  description: string | null;
  created_at: string;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export default function SuperAdminDashboard() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' });
  const [svc, setSvc] = useState({ org_id: '', name: '', description: '' });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
        setTickets((t as Ticket[]) ?? []);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Failed to load data');
      }
    })();
  }, [supabase]);

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
      const { data, error } = (await res.json()) as { data?: Org; error?: string };
      if (error) return setMsg(error);
      if (data) {
        setOrgs((x) => [data, ...x]);
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
          description: svc.description.trim() || null,
        }),
      });
      const { data, error } = (await res.json()) as { data?: Service; error?: string };
      if (error) return setMsg(error);
      if (data) {
        setServices((x) => [data, ...x]);
        setSvc({ org_id: '', name: '', description: '' });
      }
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
      const { data, error } = (await res.json()) as { data?: { status: string }; error?: string };
      if (error || !data) throw new Error(error || 'Update failed');
    } catch (e) {
      setTickets(prev);
      setMsg(e instanceof Error ? e.message : 'Update status failed');
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="SuperAdmin — Dashboard"
        subtitle="Manage organizations, services and tickets across the platform."
        right={
          <a href="/api/export/tickets" className="btn btn--ghost">
            Export CSV
          </a>
        }
      />

      {/* Organizations */}
      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Organizations</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            className="input sm:col-span-2"
            placeholder="Organization name"
            value={newOrg.name}
            onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="slug"
            value={newOrg.slug}
            onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
          />
          <button className="btn btn--primary" onClick={createOrg}>
            Create
          </button>
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {orgs.map((o) => (
            <li key={o.id} className="rounded-xl border border-[rgb(var(--border))] px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{o.name}</span>
                <span className="text-xs text-[rgb(var(--muted))]">/{o.slug}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Services */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Services</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <select
            className="input"
            value={svc.org_id}
            onChange={(e) => setSvc({ ...svc, org_id: e.target.value })}
          >
            <option value="">Org…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Service name"
            value={svc.name}
            onChange={(e) => setSvc({ ...svc, name: e.target.value })}
          />
          <input
            className="input sm:col-span-1"
            placeholder="Description"
            value={svc.description}
            onChange={(e) => setSvc({ ...svc, description: e.target.value })}
          />
          <button className="btn btn--primary" onClick={createService}>
            Add
          </button>
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {services.slice(0, 9).map((s) => (
            <li key={s.id} className="rounded-xl border border-[rgb(var(--border))] px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-[rgb(var(--muted))]">
                  {orgs.find((o) => o.id === s.org_id)?.name ?? s.org_id.slice(0, 8)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Tickets */}
      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">All Tickets</h2>
        </div>
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
          <table className="table">
            <thead>
              <tr>
                <th>Org</th>
                <th>Ticket</th>
                <th>Status</th>
                <th className="text-left">Notes</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="text-xs text-[rgb(var(--muted))]">{t.org_id.slice(0, 8)}…</td>
                  <td className="font-mono text-xs">{t.id.slice(0, 8)}…</td>
                  <td>
                    <select
                      className="input"
                      value={t.status}
                      onChange={(e) => setStatus(t.id, e.target.value)}
                    >
                      <option>OPEN</option>
                      <option>IN_PROGRESS</option>
                      <option>COMPLETED</option>
                      <option>CLOSED</option>
                    </select>
                  </td>
                  <td className="text-sm">{t.description}</td>
                  <td className="text-sm">{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tickets.length === 0 && (
            <div className="p-8 text-center text-sm text-[rgb(var(--muted))]">No tickets yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
