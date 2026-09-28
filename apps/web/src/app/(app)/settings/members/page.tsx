import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { MembersScreen } from '@/modules/organization/MembersScreen';

export const metadata: Metadata = { title: 'Members' };

export default function Page() {
  return (
    <RequirePermission permission="settings.users.read">
      <MembersScreen />
    </RequirePermission>
  );
}
