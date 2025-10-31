'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import PageHeader from '@/components/ui/PageHeader';

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return setMsg(error.message);
      router.push('/portal'); // ✅ go through role-based router
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <PageHeader title="Welcome back" subtitle="Sign in to continue" />
      <form onSubmit={onSubmit} className="card p-6 sm:p-8">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {msg && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {msg}
            </p>
          )}
          <button type="submit" className="btn btn--primary h-10" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
      <p className="text-center text-sm text-[rgb(var(--muted))]">
        Need an account? Contact your admin to be invited.
      </p>
    </div>
  );
}
