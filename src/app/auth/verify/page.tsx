'use client';

export const dynamic = 'force-dynamic';

import { CheckCircle2, Loader2, Lock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { createBrowserSupabase } from '@/lib/supabase-browser';

type Step = 'verifying' | 'set-password' | 'done' | 'error';
type OtpType = 'invite' | 'signup' | 'recovery' | 'magiclink' | 'email_change';

const OTP_TYPES: readonly OtpType[] = [
  'invite',
  'signup',
  'recovery',
  'magiclink',
  'email_change',
] as const;

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <VerifyClient />
    </Suspense>
  );
}

function VerifyClient() {
  const search = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [msg, setMsg] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('verifying');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      setMsg(null);
      try {
        const rawType = (search.get('type') ?? '').toLowerCase();
        if (!OTP_TYPES.includes(rawType as OtpType)) {
          throw new Error('Missing or unsupported verification type.');
        }
        const type = rawType as OtpType;
        const tokenHash = search.get('token_hash') ?? undefined;
        const token = search.get('token') ?? undefined;
        const email = search.get('email') ?? undefined;

        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          if (error) throw error;
          setStep('set-password');
          return;
        }
        if (token && email) {
          const { error } = await supabase.auth.verifyOtp({ type, token, email });
          if (error) throw error;
          setStep('set-password');
          return;
        }
        throw new Error('This verification link is incomplete.');
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Verification failed.');
        setStep('error');
      }
    })();
  }, [supabase, search]);

  async function setNewPassword() {
    try {
      if (!password || password.length < 8) {
        setMsg('Password must be at least 8 characters.');
        return;
      }
      setPending(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg('Password set. Redirecting to sign in…');
      setStep('done');
      setTimeout(() => router.replace('/auth/login'), 1200);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to set password.');
      setStep('error');
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
        <div className="bg-card w-full max-w-md rounded-2xl border p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Account verification</h1>

          {step === 'verifying' && (
            <div className="text-muted-foreground mt-6 flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Verifying your link…
            </div>
          )}

          {step === 'set-password' && (
            <div className="mt-6 space-y-4">
              <p className="text-muted-foreground text-sm">Choose a password to finish setup.</p>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    id="new-password"
                    type="password"
                    className="h-11 pl-9"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setNewPassword()}
                  />
                </div>
              </div>
              <Button onClick={setNewPassword} disabled={pending} className="h-11 w-full gap-2">
                {pending && <Loader2 className="size-4 animate-spin" />}
                {pending ? 'Saving…' : 'Save password'}
              </Button>
            </div>
          )}

          {step === 'done' && (
            <div className="mt-6 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-5" /> All set! Redirecting…
            </div>
          )}

          {step === 'error' && (
            <div className="mt-6 space-y-4">
              <div className="text-destructive flex items-center gap-2">
                <XCircle className="size-5" /> Verification failed
              </div>
              <p className="text-muted-foreground text-sm">
                Your link may be invalid or expired. Please ask your admin to resend the invite.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/login">Back to sign in</Link>
              </Button>
            </div>
          )}

          {msg && step !== 'done' && (
            <p
              className={`mt-4 text-sm ${step === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
              role="status"
              aria-live="polite"
            >
              {msg}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
