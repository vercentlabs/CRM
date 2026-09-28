import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { CustomersScreen } from '@/modules/customers/CustomersScreen';

export const metadata: Metadata = { title: 'Customers' };

export default function Page() {
  return (
    <RequirePermission permission="crm.customers.read">
      <CustomersScreen />
    </RequirePermission>
  );
}
