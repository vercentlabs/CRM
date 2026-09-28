import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { ChatScreen } from '@/modules/chat/ChatScreen';

export const metadata: Metadata = { title: 'Team chat' };

export default function Page() {
  return (
    <RequirePermission permission="crm.chat.use">
      <ChatScreen />
    </RequirePermission>
  );
}
