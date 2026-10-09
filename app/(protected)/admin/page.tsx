import { redirect } from 'next/navigation';

import MonitoreoPanel from '@/components/admin/MonitoreoPanel';
import { esAdmin } from '@/lib/auth/requerirAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!(await esAdmin())) {
    redirect('/dashboard');
  }

  return <MonitoreoPanel />;
}
