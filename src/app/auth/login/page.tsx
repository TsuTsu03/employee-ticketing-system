// app/auth/login/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import PageHeader from '@/components/ui/PageHeader';

/* Inline icons */
const MailIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path
      d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M4 7l8 6 8-6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const LockIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <rect x="3" y="10" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 10V7a5 5 0 1 1 10 0v3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const EyeIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path
      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const EyeOffIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path
      d="M10.6 5.1A11.1 11.1 0 0 1 12 5c6.5 0 10 7 10 7a18.8 18.8 0 0 1-3.2 3.9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M6.2 6.6A18.6 18.6 0 0 0 2 12s3.5 6 10 6c1.1 0 2.1-.2 3.1-.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path d="M9.2 9.3A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg(error.message);
        return;
      }
      router.push('/portal');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[radial-gradient(1200px_600px_at_80%_-10%,hsl(var(--primary)/0.12),transparent),radial-gradient(1000px_500px_at_-20%_110%,hsl(var(--accent)/0.12),transparent)]">
      <div className="mx-auto grid max-w-lg gap-6 px-4 py-12">
        <PageHeader title="Welcome back" subtitle="Sign in to continue" />

        <form onSubmit={onSubmit} className="card rounded-2xl p-6 sm:p-8">
          <div className="grid gap-5">
            {/* Email */}
            <div className="grid gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>

              {/* input shell */}
              <div
                className={[
                  'relative flex h-11 items-center rounded-xl border pl-3',
                  'border-[rgb(var(--border))]',
                ].join(' ')}
              >
                <span className="pointer-events-none absolute left-3 inline-flex items-center text-[rgb(var(--muted))]">
                  <MailIcon className="h-5 w-5" />
                </span>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  // IMPORTANT: override your global .input paddings
                  className="input !h-10 !border-0 !bg-transparent !pr-3 !pb-3 !pl-6 !ring-0 !outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <a
                  href="/auth/reset"
                  className="text-xs text-[rgb(var(--primary))] hover:underline"
                >
                  Forgot?
                </a>
              </div>

              {/* input shell */}
              <div
                className={[
                  'relative flex h-11 items-center rounded-xl border px-3',
                  'border-[rgb(var(--border))] transition',
                  'focus-within:border-[rgb(var(--primary))] focus-within:ring-2 focus-within:ring-[rgb(var(--primary))]',
                ].join(' ')}
              >
                <span className="pointer-events-none absolute left-3 inline-flex items-center text-[rgb(var(--muted))]">
                  <LockIcon className="h-5 w-5" />
                </span>

                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                  onKeyDown={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                  minLength={6}
                  autoComplete="current-password"
                  required
                  className="input h-10! w-full! border-0! !bg-transparent !pr-12 !pl-6 !ring-0 !outline-none"
                />

                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((s) => !s)}
                  className="hover:text-foreground absolute right-2 grid h-8 w-8 place-items-center rounded-md text-[rgb(var(--muted))] hover:bg-[rgb(var(--muted))/0.08]"
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>

              {capsLock && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Caps Lock is ON.</p>
              )}
            </div>

            {msg && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300"
              >
                {msg}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="btn relative h-11 rounded-xl border-2 border-black font-medium tracking-tight disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending && (
                <span
                  className="absolute left-3 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden
                />
              )}
              {pending ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-center text-sm text-[rgb(var(--muted))]">
              Need an account?{' '}
              <span className="text-foreground font-medium">Contact your admin to be invited.</span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
