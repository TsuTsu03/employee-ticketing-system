// File: app/admin/dashboard/page.tsx
'use client';

import PageHeader from '@/components/ui/PageHeader';
import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import { z } from 'zod';

/* ---------- Types ---------- */
const RoleEnum = z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);
type Role = z.infer<typeof RoleEnum>;

const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
type Org = z.infer<typeof OrgSchema>;

/** Rows returned by RPC: get_members(p_org_id uuid) */
const RpcMemberRowSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  role: RoleEnum,
  email: z.string().email().nullable(),
  full_name: z.string().nullable(),
});
type RpcMemberRow = z.infer<typeof RpcMemberRowSchema>;

/** Accepts RFC3339 with timezone offsets (e.g., +00:00) */
const ShiftRowSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  user_id: z.string().uuid(),
  start_at: z.string().datetime({ offset: true }).nullable(),
  end_at: z.string().datetime({ offset: true }).nullable(),
});
type ShiftRow = z.infer<typeof ShiftRowSchema>;

type ApiResult<T> = { data?: T; error?: string };

/* ---------- Component ---------- */
export default function AdminDashboard() {
  const sb = useMemo(() => createBrowserSupabase(), []);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState('');
  const [members, setMembers] = useState<RpcMemberRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: 'EMPLOYEE' as Role,
    invite: true,
  });

  const onlyOneOrg = orgs.length === 1;

  /* Auto-dismiss banner after 5s */
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
    return { error: 'Invalid response' };
  }

  const duration = (s: ShiftRow) => {
    if (!s.start_at) return '-';
    const end = s.end_at ? new Date(s.end_at).getTime() : Date.now();
    const ms = end - new Date(s.start_at).getTime();
    const h = Math.floor(ms / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    return `${h}h ${m}m`;
  };

  /* Load organizations via RPC (my_org_rows) */
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
        const m = e instanceof Error ? e.message : 'Failed to load organizations';
        console.error('Load orgs error:', m);
        setMsg(`Failed to load organizations: ${m}`);
        setOrgs([]);
        setOrgId('');
      }
    })();
  }, [sb]);

  /* Load members + shifts of selected org */
  useEffect(() => {
    if (!orgId) return;
    const ac = new AbortController();
    (async () => {
      try {
        // Members via RPC
        const memRes = await sb.rpc('get_members', { p_org_id: orgId }).abortSignal(ac.signal);
        if (memRes.error) throw new Error(memRes.error.message);
        const rows = z.array(RpcMemberRowSchema).parse(memRes.data ?? []);
        setMembers(rows);

        // Shifts via table select
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
          const m = e instanceof Error ? e.message : 'Failed to load data';
          console.error('Load members/shifts error:', m);
          setMsg(m);
        }
      }
    })();
    return () => ac.abort();
  }, [sb, orgId, from, to]);

  /* Actions */
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
    if (!orgId) return setMsg('Select an organization.');
    if (!form.email.trim()) return setMsg('Email required.');
    const EmailSchema = z.string().email();
    if (!EmailSchema.safeParse(form.email.trim()).success) return setMsg('Enter a valid email.');

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
        setMsg('User created.');
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed');
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

  /* ---------- UI ---------- */
  return (
    <div className="grid gap-6">
      <PageHeader title="Admin — Dashboard" />

      {msg && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            msg === 'User created.'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
          role="status"
          aria-live="polite"
        >
          {msg}
        </div>
      )}

      {/* Org Picker */}
      <section className="card p-6">
        <div className="flex items-center gap-3">
          <span className="font-medium">Organization</span>
          <select
            className="input max-w-sm"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            disabled={onlyOneOrg || orgs.length === 0}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {!orgs.length && <option value="">No organizations available</option>}
          </select>
        </div>
      </section>

      {/* Create User */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Create employee account</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="input md:col-span-2"
            placeholder="Work email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="input md:col-span-2"
            placeholder="Full name (optional)"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />
          <select
            className="input"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
          >
            <option value="EMPLOYEE">EMPLOYEE</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          <label className="col-span-full flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.invite}
              onChange={(e) => setForm((f) => ({ ...f, invite: e.target.checked }))}
            />
            Send invite email (user sets password)
          </label>

          <div className="md:col-start-5">
            <button
              className="btn btn--primary w-full"
              disabled={pending || !orgId}
              onClick={createUser}
            >
              {pending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </section>

      {/* Members */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Members</h2>
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
          <table className="table">
            <thead>
              <tr>
                <th className="text-left">User</th>
                <th className="text-left">Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td className="text-sm">{m.full_name ?? m.user_id.slice(0, 8)}</td>
                  <td className="text-sm">{m.email ?? '—'}</td>
                  <td>
                    <select
                      className="input"
                      value={m.role}
                      onChange={(e) => updateRole(m.user_id, e.target.value as Role)}
                    >
                      <option value="EMPLOYEE">EMPLOYEE</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.length === 0 && (
            <div className="p-8 text-center text-sm text-[rgb(var(--muted))]">No members yet.</div>
          )}
        </div>
      </section>

      {/* Shifts */}
      <section className="card p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Shifts (time-in/out)</h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-sm text-[rgb(var(--muted))]">—</span>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
          <table className="table">
            <thead>
              <tr>
                <th className="text-left">User</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="text-sm">
                    {members.find((m) => m.user_id === s.user_id)?.full_name ??
                      s.user_id.slice(0, 8)}
                  </td>
                  <td className="text-sm">
                    {s.start_at ? new Date(s.start_at).toLocaleString() : '—'}
                  </td>
                  <td className="text-sm">
                    {s.end_at ? new Date(s.end_at).toLocaleString() : '—'}
                  </td>
                  <td className="text-sm">{duration(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shifts.length === 0 && (
            <div className="p-8 text-center text-sm text-[rgb(var(--muted))]">
              No shifts in range.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
