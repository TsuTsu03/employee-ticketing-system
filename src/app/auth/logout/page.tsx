import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';

export const runtime = 'nodejs'; // we need Node to mutate cookies
export const dynamic = 'force-dynamic'; // ensure fresh execution

export default async function LogoutPage() {
  const supabase = await serverClient();
  // ignore any error; we just want to clear the session
  await supabase.auth.signOut();

  redirect('/auth/login');
}
