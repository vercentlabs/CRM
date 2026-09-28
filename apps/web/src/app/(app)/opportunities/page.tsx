import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { OpportunitiesScreen } from '@/modules/opportunities/OpportunitiesScreen';

export const metadata: Metadata = { title: 'Opportunities' };

export default function Page() {
  return (
    <RequirePermission permission="crm.opportunities.read">
      <OpportunitiesScreen />
    </RequirePermission>
  );
}
