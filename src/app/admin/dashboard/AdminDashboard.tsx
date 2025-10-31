'use client';

import PageHeader from '@/components/ui/PageHeader';
import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import { z } from 'zod';

const RoleEnum = z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);
type Role = z.infer<typeof RoleEnum>;
const OrgSchema = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });
type Org = z.infer<typeof OrgSchema>;
const UserSchema = z.object({ id: z.string().uuid(), email: z.string().email().nullable() });
const ProfileSchema = z.object({ full_name: z.string().nullable() });
const MembershipJoinedSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  role: RoleEnum,
  user: UserSchema,
  profile: ProfileSchema.nullable().optional(),
});
type MembershipJoined = z.infer<typeof MembershipJoinedSchema>;
const ShiftRowSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  user_id: z.string().uuid(),
  start_at: z.string().datetime().nullable(),
  end_at: z.string().datetime().nullable(),
});
type ShiftRow = z.infer<typeof ShiftRowSchema>;
const RpcMyOrgsRowSchema = z.object({ org_id: z.string().uuid(), role: RoleEnum });

type ApiResult<T> = { data?: T; error?: string };

export default function AdminDashboard() {
  const sb = useMemo(() => createBrowserSupabase(), []);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState('');
  const [members, setMembers] = useState<MembershipJoined[]>([]);
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

  useEffect(() => {
    (async () => {
      const { data: rpcs } = await sb.rpc('my_orgs');
      const rpc = z.array(RpcMyOrgsRowSchema).safeParse(rpcs ?? []);
      const ids = rpc.success ? rpc.data.map((r) => r.org_id) : [];
      if (!ids.length) return;
      const { data: orgRows } = await sb.from('organizations').select('id,name,slug').in('id', ids);
      const orgParsed = z.array(OrgSchema).safeParse(orgRows ?? []);
      const list = orgParsed.success ? orgParsed.data : [];
      setOrgs(list);
      setOrgId((p) => p || list[0]?.id || '');
    })();
  }, [sb]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data: mem } = await sb
        .from('memberships')
        .select(
          'user_id, org_id, role, user:users!inner(id, email), profile:profiles!left(full_name)'
        )
        .eq('org_id', orgId);
      const m = z.array(MembershipJoinedSchema).safeParse(mem ?? []);
      setMembers(m.success ? m.data : []);

      const fromIso = new Date(from).toISOString();
      const toIso = new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString();
      const { data: sh } = await sb
        .from('shifts')
        .select('id, org_id, user_id, start_at, end_at')
        .eq('org_id', orgId)
        .gte('start_at', fromIso)
        .lte('start_at', toIso)
        .order('start_at', { ascending: false });
      const s = z.array(ShiftRowSchema).safeParse(sh ?? []);
      setShifts(s.success ? s.data : []);
    })();
  }, [sb, orgId, from, to]);

  function parseApi<T>(u: unknown): ApiResult<T> {
    if (typeof u === 'object' && u !== null && ('data' in u || 'error' in u)) {
      const r = u as ApiResult<T>;
      return { data: r.data, error: r.error };
    }
    return { error: 'Invalid response' };
  }

  async function refreshMembers() {
    const { data: mem } = await sb
      .from('memberships')
      .select(
        'user_id, org_id, role, user:users!inner(id, email), profile:profiles!left(full_name)'
      )
      .eq('org_id', orgId);
    const m = z.array(MembershipJoinedSchema).safeParse(mem ?? []);
    setMembers(m.success ? m.data : []);
  }

  async function createUser() {
    if (!orgId) return setMsg('Select an organization.');
    if (!form.email.trim()) return setMsg('Email required.');
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, ...form, full_name: form.full_name || null }),
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

  const duration = (s: ShiftRow) => {
    if (!s.start_at) return '-';
    const end = s.end_at ? new Date(s.end_at).getTime() : Date.now();
    const ms = end - new Date(s.start_at).getTime();
    const h = Math.floor(ms / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    return `${h}h ${m}m`;
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Admin — Dashboard"
        subtitle="Invite employees, manage roles, and review time-in/out."
      />

      {/* Org Picker */}
      <section className="card p-6">
        <div className="flex items-center gap-3">
          <span className="font-medium">Organization</span>
          <select
            className="input max-w-sm"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
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
        {msg && (
          <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400">
            {msg}
          </p>
        )}
      </section>

      {/* Members */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Members & roles</h2>
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
                  <td className="text-sm">{m.profile?.full_name ?? m.user_id.slice(0, 8)}</td>
                  <td className="text-sm">{m.user?.email ?? '—'}</td>
                  <td>
                    <select
                      className="input"
                      value={m.role}
                      onChange={(e) => updateRole(m.user_id, e.target.value as Role)}
                    >
                      <option value="EMPLOYEE">EMPLOYEE</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPER_ADMIN" disabled>
                        SUPER_ADMIN
                      </option>
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
                    {members.find((m) => m.user_id === s.user_id)?.profile?.full_name ??
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
