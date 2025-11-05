import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUserRole, type Role } from '@/lib/get-role';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROLE_ROUTES: Record<Role, string> = {
  SUPER_ADMIN: '/superadmin/dashboard',
  ADMIN: '/admin/dashboard',
  EMPLOYEE: '/app/dashboard',
};

export default async function Portal() {
  const { user, role } = await getCurrentUserRole();
  if (!user) redirect('/auth/login');
  redirect(ROLE_ROUTES[role ?? 'EMPLOYEE']);
}
