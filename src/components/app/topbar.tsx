'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import { initials } from '@/lib/format';

export function Topbar({
  title,
  badge,
  email,
  children,
}: {
  title: string;
  badge?: string;
  email?: string | null;
  children?: ReactNode;
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace('/auth/login');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sign out failed');
      setSigningOut(false);
    }
  }

  return (
    <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg text-sm font-bold">
            S
          </div>
          <span className="truncate font-semibold tracking-tight">{title}</span>
          {badge && (
            <span className="bg-accent text-accent-foreground hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline">
              {badge}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {children}
          <ThemeToggle />
          {email && (
            <div className="bg-secondary text-secondary-foreground hidden size-8 place-items-center rounded-full text-xs font-semibold sm:grid" title={email}>
              {initials(email)}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={signOut} disabled={signingOut} className="gap-2">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
