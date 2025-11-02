import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat,lng required' }, { status: 400 });
  }

  // Free OpenStreetMap Nominatim (be nice: add a UA + cache on your side if heavy use)
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'saas-tickets/1.0 (admin@example.com)' },
    // optional: revalidate every 1 day on Vercel
    next: { revalidate: 86400 },
  });

  if (!res.ok) return NextResponse.json({ error: `Geocoder ${res.status}` }, { status: 502 });
  const json = await res.json();

  const a = json.address ?? {};
  // Barangay often appears as suburb/neighbourhood/quarter/village in PH
  const barangay = a.suburb || a.neighbourhood || a.quarter || a.village || a.barangay || null;
  const city = a.city || a.town || a.municipality || a.county || null;
  const state = a.state || null;
  const country = a.country || null;

  const label = [barangay, city, state, country].filter(Boolean).join(', ');

  return NextResponse.json({
    data: { barangay, city, state, country, label },
  });
}
