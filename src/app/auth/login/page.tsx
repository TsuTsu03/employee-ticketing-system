'use client';

import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { createBrowserSupabase } from '@/lib/supabase-browser';

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
      setMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-aurora flex min-h-screen flex-col">
      <header className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-xl font-bold">
            S
          </div>
          <span className="text-lg font-semibold tracking-tight">ShiftDesk</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground mt-2">Sign in to continue to your workspace.</p>
          </div>

          <form
            onSubmit={onSubmit}
            className="bg-card space-y-5 rounded-2xl border p-6 shadow-sm sm:p-8"
            aria-label="Sign in form"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  autoFocus
                  className="h-11 pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
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
                  className="h-11 px-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {capsLock && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Caps Lock is on.</p>
              )}
            </div>

            {msg && (
              <div
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border px-3 py-2 text-sm"
              >
                {msg}
              </div>
            )}

            <Button type="submit" disabled={pending} className="h-11 w-full gap-2">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>

            <p className="text-muted-foreground text-center text-sm">
              Need an account? Ask your administrator to invite you.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
