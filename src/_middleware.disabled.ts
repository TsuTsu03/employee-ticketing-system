import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

function setResponseCookie(res: NextResponse, name: string, value: string, options: CookieOptions) {
  res.cookies.set({
    name,
    value,
    domain: options.domain,
    path: options.path ?? '/',
    maxAge: options.maxAge,
    expires: options.expires,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite as 'lax' | 'strict' | 'none' | undefined,
  });
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) =>
          setResponseCookie(res, name, value, options),
        remove: (name: string, options: CookieOptions) =>
          setResponseCookie(res, name, '', { ...options, maxAge: 0 }),
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  if (req.nextUrl.pathname === '/') {
    const { data: m } = await supabase
      .from('memberships')
      .select('role, org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const role = (m?.role ?? 'EMPLOYEE') as 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';
    const url = req.nextUrl.clone();
    if (role === 'SUPER_ADMIN') url.pathname = '/superadmin/dashboard';
    else if (role === 'ADMIN') url.pathname = '/admin/dashboard';
    else url.pathname = '/app/dashboard';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/((?!auth|api|_next/static|_next/image|favicon.ico).*)'],
};
