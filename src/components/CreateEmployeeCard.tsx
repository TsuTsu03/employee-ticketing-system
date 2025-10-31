'use client';

import { useState } from 'react';

export default function CreateEmployeeCard() {
  const [employeeId, setEmployeeId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setPending(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, fullName, email }),
      });
      const json = (await res.json()) as { data?: unknown; error?: string };
      if (!res.ok) setMsg(json.error ?? 'Failed');
      else {
        setMsg('✅ Invitation sent and membership created.');
        setEmployeeId('');
        setFullName('');
        setEmail('');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border p-4">
      <h3 className="text-lg font-semibold">Create employee</h3>
      <input
        className="w-full rounded border p-2"
        placeholder="Employee ID"
        value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)}
        required
      />
      <input
        className="w-full rounded border p-2"
        placeholder="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />
      <input
        className="w-full rounded border p-2"
        type="email"
        placeholder="Work email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {msg && <p className="text-sm">{msg}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
