import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function POST(req: Request) {
  const jar = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => jar.get(n)?.value,
        set(name: string, value: string, options: CookieOptions) {
          jar.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          jar.set({ name, value: '', ...options, maxAge: 0 });
        },
      },
    }
  );
  await supabase.auth.signOut();

  const base =
    process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || 'http://localhost:3000';
  return NextResponse.redirect(new URL('/auth/login', base));
}
