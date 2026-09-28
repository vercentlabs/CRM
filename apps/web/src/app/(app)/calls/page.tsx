import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { CallsScreen } from '@/modules/calls/CallsScreen';

export const metadata: Metadata = { title: 'Calls' };

export default function Page() {
  return (
    <RequirePermission permission="crm.calls.read">
      <CallsScreen />
    </RequirePermission>
  );
}
