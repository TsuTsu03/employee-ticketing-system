import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUserRole } from '@/lib/get-role';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Portal() {
  const { user, role } = await getCurrentUserRole();
  if (!user) redirect('/auth/login');

  if (role === 'SUPER_ADMIN') redirect('/superadmin/dashboard');
  if (role === 'ADMIN') redirect('/admin/dashboard');
  redirect('/app/dashboard');
}
