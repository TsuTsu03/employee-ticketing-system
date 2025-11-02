// File: app/auth/verify/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

        const tokenHash = search.get('token_hash') ?? undefined; // new flow
        const token = search.get('token') ?? undefined; // legacy flow
        const email = search.get('email') ?? undefined;

        if (tokenHash) {
          const payload = {
            type,
            token_hash: tokenHash,
          } satisfies Parameters<typeof supabase.auth.verifyOtp>[0];

          const { error } = await supabase.auth.verifyOtp(payload);
          if (error) throw error;
          setStep('set-password');
          return;
        }

        if (token && email) {
          const payload = {
            type,
            token,
            email,
          } satisfies Parameters<typeof supabase.auth.verifyOtp>[0];

          const { error } = await supabase.auth.verifyOtp(payload);
          if (error) throw error;
          setStep('set-password');
          return;
        }

        throw new Error('Only token_hash (new) OR token+email (legacy) should be provided.');
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
      setMsg('Password set. Redirecting…');
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
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">Account verification</h1>

      {msg && (
        <div
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            step === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
          role="status"
          aria-live="polite"
        >
          {msg}
        </div>
      )}

      {step === 'verifying' && <p>Verifying…</p>}

      {step === 'set-password' && (
        <div className="grid gap-3">
          <input
            type="password"
            className="input"
            placeholder="Set your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setNewPassword()}
          />
          <button className="btn btn--primary" onClick={setNewPassword} disabled={pending}>
            {pending ? 'Saving…' : 'Save password'}
          </button>
        </div>
      )}

      {step === 'done' && <p>All set! Redirecting…</p>}

      {step === 'error' && (
        <p className="text-sm text-[rgb(var(--muted))]">
          Your link might be invalid or expired. Please ask your admin to resend an invite.
        </p>
      )}
    </div>
  );
}
