import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { TasksScreen } from '@/modules/tasks/TasksScreen';

export const metadata: Metadata = { title: 'Tasks' };

export default function Page() {
  return (
    <RequirePermission permission="crm.tasks.read">
      <TasksScreen />
    </RequirePermission>
  );
}
