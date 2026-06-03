import 'server-only';
import { redirect } from 'next/navigation';

import { getCurrentUserRole } from '@/lib/get-role';
import EmployeeWorkspace from './EmployeeWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page() {
  const { user } = await getCurrentUserRole();
  if (!user) redirect('/auth/login');
  return <EmployeeWorkspace email={user.email ?? null} />;
}
