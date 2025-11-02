// src/app/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase-server';

// IMPORTANT: ensure this route runs on Node so cookies can be mutated
export const runtime = 'nodejs';

// redirect helper (absolute URL is safest for NextResponse.redirect in routes)
function redirectToLogin() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_URL || // if you set it
    'http://localhost:3000';
  return NextResponse.redirect(new URL('/auth/login', base));
}

export async function GET() {
  const supabase = await serverClient();
  // ignore any error; we just want to drop session cookies
  await supabase.auth.signOut();
  return redirectToLogin();
}

export async function POST() {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  return redirectToLogin();
}
