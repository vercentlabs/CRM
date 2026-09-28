import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { FollowupsScreen } from '@/modules/followups/FollowupsScreen';

export const metadata: Metadata = { title: 'Follow-ups' };

export default function Page() {
  return (
    <RequirePermission permission="crm.followups.read">
      <FollowupsScreen />
    </RequirePermission>
  );
}
