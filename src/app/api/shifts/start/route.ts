import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

type StartBody = { lat: number; lng: number };

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

  // Parse body
  const body = (await req.json().catch(() => ({}))) as Partial<StartBody>;
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return NextResponse.json({ error: 'Invalid geolocation' }, { status: 422 });
  }

  // Find one membership (any role) for this user
  const { data: mem, error: memErr } = await supabase
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', user.id)
    .order('role', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!mem) return NextResponse.json({ error: 'No membership' }, { status: 403 });

  // Start new shift (end any previously open shifts defensively)
  await supabase
    .from('shifts')
    .update({ end_at: new Date().toISOString(), end_geo: { lat: body.lat, lng: body.lng } })
    .eq('user_id', user.id)
    .is('end_at', null);

  const { data: ins, error: insErr } = await supabase
    .from('shifts')
    .insert({
      org_id: mem.org_id,
      user_id: user.id,
      start_at: new Date().toISOString(),
      start_geo: { lat: body.lat, lng: body.lng },
      end_at: null,
      end_geo: null,
    })
    .select('id')
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  return NextResponse.json({ data: ins });
}
