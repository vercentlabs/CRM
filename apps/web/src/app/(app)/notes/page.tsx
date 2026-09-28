import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { NotesScreen } from '@/modules/notes/NotesScreen';

export const metadata: Metadata = { title: 'Notes' };

export default function Page() {
  return (
    <RequirePermission permission="crm.notes.read">
      <NotesScreen />
    </RequirePermission>
  );
}
