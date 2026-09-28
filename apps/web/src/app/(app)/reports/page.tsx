import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { ReportsScreen } from '@/modules/reports/ReportsScreen';

export const metadata: Metadata = { title: 'Reports' };

export default function Page() {
  return (
    <RequirePermission permission="crm.reports.read">
      <ReportsScreen />
    </RequirePermission>
  );
}
