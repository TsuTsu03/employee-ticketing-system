'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase-browser';

type Service = { id: string; name: string };
type Ticket = { id: string; description: string | null; status: string; created_at: string };
type OpenShiftRow = { id: string; start_at: string | null };
type ApiPayload<T> = { data?: T; error?: string };

function fmtTime(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function EmployeeDashboard() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  // UI state
  const [services, setServices] = useState<Service[]>([]);
  const [svcLoading, setSvcLoading] = useState(true);
  const [svcError, setSvcError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState<string>(''); // stores UUID (string)
  const [notes, setNotes] = useState<string>('');

  const [msgs, setMsgs] = useState<Array<{ role: 'user' | 'system'; text: string }>>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [activeStart, setActiveStart] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const canSend =
    Boolean(serviceId && notes.trim()) && !sending && !svcLoading && services.length > 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Load org → services, tickets, and open shift
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setSvcLoading(true);
      setSvcError(null);

      // 1) Get org from membership
      const { data: membership, error: mErr } = await supabase
        .from('memberships')
        .select('org_id')
        .limit(1)
        .maybeSingle();

      if (mErr) {
        setSvcLoading(false);
        setSvcError(mErr.message);
        setMsgs((m) => [...m, { role: 'system', text: `❌ ${mErr.message}` }]);
        return;
      }

      if (!membership?.org_id) {
        setSvcLoading(false);
        setServices([]);
        setSvcError('No membership found.');
        setMsgs((m) => [...m, { role: 'system', text: '❌ No membership' }]);
        return;
      }

      // 2) Load services for org
      const { data: s, error: sErr } = await supabase
        .from('services')
        .select('id,name')
        .eq('org_id', membership.org_id)
        .order('name', { ascending: true });

      if (sErr) {
        setSvcLoading(false);
        setSvcError(sErr.message);
        setServices([]);
        setMsgs((m) => [...m, { role: 'system', text: `❌ ${sErr.message}` }]);
      } else {
        const list = (s as Service[]) ?? [];
        setServices(list);
        setSvcLoading(false);
        // auto-select first option if none selected
        if (list.length > 0 && !serviceId) {
          setServiceId(String(list[0].id));
        }
      }

      // 3) Load my tickets
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (uid) {
        const { data: t, error: tErr } = await supabase
          .from('tickets')
          .select('id, description, status, created_at')
          .eq('employee_id', uid)
          .order('created_at', { ascending: false });

        if (tErr) {
          setMsgs((m) => [...m, { role: 'system', text: `❌ ${tErr.message}` }]);
        } else {
          setMyTickets((t as Ticket[]) ?? []);
        }

        // 4) Detect an open shift
        const { data: open, error: oErr } = await supabase
          .from('shifts')
          .select('id, start_at')
          .eq('user_id', uid)
          .is('end_at', null)
          .order('start_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!oErr && open) {
          setShiftId(open.id);
          setActiveStart(open.start_at ?? null);
        } else {
          setShiftId(null);
          setActiveStart(null);
        }
      }
    })();
  }, [supabase]); // run once

  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────
  const getGeo = () =>
    new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => reject(new Error(err.message))
      );
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────
  async function sendTicket() {
    if (!canSend) {
      if (!serviceId)
        setMsgs((m) => [...m, { role: 'system', text: '❌ Please select a service.' }]);
      else if (!notes.trim())
        setMsgs((m) => [...m, { role: 'system', text: '❌ Notes are required.' }]);
      return;
    }

    setSending(true);
    setMsgs((m) => [...m, { role: 'user', text: `Ticket: ${notes}` }]);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId, description: notes }),
      });

      const raw = await res.text();
      let payload: ApiPayload<Ticket> = {};
      try {
        payload = JSON.parse(raw) as ApiPayload<Ticket>;
      } catch {
        payload = { error: `Invalid JSON (${res.status})` };
      }

      if (!res.ok || payload.error || !payload.data) {
        setMsgs((m) => [
          ...m,
          { role: 'system', text: `❌ ${payload.error ?? `HTTP ${res.status}`}` },
        ]);
        return;
      }

      setMyTickets((ts) => [payload.data!, ...ts]);
      setMsgs((m) => [...m, { role: 'system', text: '✅ Ticket submitted' }]);
      setNotes('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMsgs((m) => [...m, { role: 'system', text: `❌ ${msg}` }]);
    } finally {
      setSending(false);
    }
  }

  async function startShift() {
    if (shiftId) {
      setMsgs((m) => [
        ...m,
        { role: 'system', text: `🟢 Already active • In since ${fmtTime(activeStart)}` },
      ]);
      return;
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

      if (!res.ok || payload.error || !payload.data) {
        setMsgs((m) => [
          ...m,
          { role: 'system', text: `❌ ${payload.error ?? `HTTP ${res.status}`}` },
        ]);
        return;
      }

      // Re-read exact start time
      let startedAt = new Date().toISOString();
      const { data: row } = await supabase
        .from('shifts')
        .select('id,start_at')
        .eq('id', payload.data.id)
        .single();
      startedAt = (row as OpenShiftRow | null)?.start_at ?? startedAt;

      setShiftId(payload.data.id);
      setActiveStart(startedAt);
      setMsgs((m) => [...m, { role: 'system', text: `🟢 Shift started at ${fmtTime(startedAt)}` }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMsgs((m) => [...m, { role: 'system', text: `❌ ${msg}` }]);
    }
  }

  async function endShift() {
    if (!shiftId) {
      setMsgs((m) => [...m, { role: 'system', text: 'No active shift.' }]);
      return;
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

      if (!res.ok || payload.error) {
        setMsgs((m) => [
          ...m,
          { role: 'system', text: `❌ ${payload.error ?? `HTTP ${res.status}`}` },
        ]);
      } else {
        const endedAt = new Date().toISOString();
        setShiftId(null);
        setActiveStart(null);
        setMsgs((m) => [...m, { role: 'system', text: `🔴 Shift ended at ${fmtTime(endedAt)}` }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMsgs((m) => [...m, { role: 'system', text: `❌ ${msg}` }]);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Employee — Workspace</h1>
        {shiftId && (
          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Active • In since {fmtTime(activeStart)}
          </span>
        )}
      </div>

      <section className="space-y-3 rounded border p-4">
        <h2 className="font-medium">Chat</h2>
        <div className="h-48 overflow-auto rounded border bg-gray-50 p-3">
          {msgs.map((m, i) => (
            <div key={i} className={`mb-1 text-sm ${m.role === 'user' ? 'text-right' : ''}`}>
              <span className="inline-block rounded border bg-white px-2 py-1">{m.text}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {/* Service dropdown fed by DB (with states) */}
          <select
            className="rounded border p-2"
            value={serviceId}
            onChange={(e) => setServiceId(String(e.target.value))}
            aria-label="Service"
            disabled={svcLoading || services.length === 0}
          >
            {svcLoading && <option value="">Loading services…</option>}

            {!svcLoading && services.length === 0 && (
              <option value="">No services available</option>
            )}

            {!svcLoading && services.length > 0 && (
              <>
                {/* Optional placeholder; remove if you auto-select */}
                <option value="" disabled>
                  Service…
                </option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </>
            )}
          </select>

          <input
            className="rounded border p-2 md:col-span-2"
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Notes"
          />

          <button
            type="button"
            className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
            disabled={!canSend}
            onClick={sendTicket}
            title={
              sending
                ? 'Sending…'
                : svcLoading
                  ? 'Loading services…'
                  : services.length === 0
                    ? 'No services available'
                    : !serviceId
                      ? 'Select a service'
                      : !notes.trim()
                        ? 'Enter a note'
                        : ''
            }
          >
            {sending ? 'Sending…' : 'Send'}
          </button>

          {svcError && <div className="text-sm text-red-600 md:col-span-4">⚠ {svcError}</div>}
        </div>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="font-medium">Shift</h2>
        <div className="flex gap-3">
          <button
            className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
            disabled={!!shiftId}
            onClick={startShift}
          >
            Start Work
          </button>
          <button
            className="rounded bg-gray-800 px-3 py-2 text-white disabled:opacity-60"
            disabled={!shiftId}
            onClick={endShift}
          >
            End Work
          </button>
        </div>
      </section>

      <section className="space-y-2 rounded border p-4">
        <h2 className="font-medium">My Tickets</h2>
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Ticket</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {myTickets.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.description}</td>
                <td className="p-2">{t.status}</td>
                <td className="p-2">{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
