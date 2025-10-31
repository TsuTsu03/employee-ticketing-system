import { NextResponse } from 'next/server';
import { getCurrentUserRole } from '@/lib/get-role';

export const dynamic = 'force-dynamic';
export async function GET() {
  const info = await getCurrentUserRole();
  return NextResponse.json(info);
}
