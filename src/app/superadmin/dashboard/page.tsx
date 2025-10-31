import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUserRole } from '@/lib/get-role';
import SuperAdminDashboard from './SuperAdminDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page() {
  const { user, role } = await getCurrentUserRole();
  if (!user) redirect('/auth/login');
  if (role !== 'SUPER_ADMIN') redirect('/portal');
  return <SuperAdminDashboard />;
}
