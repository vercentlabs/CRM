import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { CalendarScreen } from '@/modules/tasks/CalendarScreen';

export const metadata: Metadata = { title: 'Calendar' };

export default function Page() {
  return (
    <RequirePermission permission="crm.tasks.read">
      <CalendarScreen />
    </RequirePermission>
  );
}
