import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { MessagesScreen } from '@/modules/messages/MessagesScreen';

export const metadata: Metadata = { title: 'Lead messages' };

export default function Page() {
  return (
    <RequirePermission anyOf={['crm.messages.read', 'crm.messages.send']}>
      <MessagesScreen />
    </RequirePermission>
  );
}
