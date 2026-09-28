import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { LeadsScreen } from '@/modules/leads/LeadsScreen';

export const metadata: Metadata = { title: 'Leads' };

export default function Page() {
  return (
    <RequirePermission permission="crm.leads.read">
      <LeadsScreen />
    </RequirePermission>
  );
}
