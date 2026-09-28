import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { BulkMessageScreen } from '@/modules/messages/BulkMessageScreen';

export const metadata: Metadata = { title: 'Bulk message' };

export default function Page() {
  return (
    <RequirePermission permission="crm.messages.send">
      <BulkMessageScreen />
    </RequirePermission>
  );
}
