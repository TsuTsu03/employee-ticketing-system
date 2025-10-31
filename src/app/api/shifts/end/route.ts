import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

type EndBody = { shift_id?: string; lat: number; lng: number };

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => jar.get(n)?.value,
        set: (n, v, o) => {
          try {
            jar.set({ name: n, value: v, ...o });
          } catch {}
        },
        remove: (n, o) => {
          try {
            jar.set({ name: n, value: '', ...o });
          } catch {}
        },
      },
    }
  );

  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<EndBody>;
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return NextResponse.json({ error: 'Invalid geolocation' }, { status: 422 });
  }

  // End the newest open shift for this user (or the provided one)
  const base = supabase.from('shifts');
  const openQuery = body.shift_id
    ? base.select('id').eq('id', body.shift_id).eq('user_id', user.id).is('end_at', null).single()
    : base
        .select('id')
        .eq('user_id', user.id)
        .is('end_at', null)
        .order('start_at', { ascending: false })
        .limit(1)
        .maybeSingle();

  const { data: openShift, error: openErr } = await openQuery;
  if (openErr) return NextResponse.json({ error: openErr.message }, { status: 400 });
  if (!openShift) return NextResponse.json({ error: 'No active shift' }, { status: 400 });

  const { data: upd, error: updErr } = await supabase
    .from('shifts')
    .update({
      end_at: new Date().toISOString(),
      end_geo: { lat: body.lat, lng: body.lng },
    })
    .eq('id', openShift.id)
    .eq('user_id', user.id)
    .select('id')
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({ data: upd });
}
