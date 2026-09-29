import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { SettingsScreen } from '@/modules/settings/SettingsScreen';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return (
    <RequirePermission
      anyOf={[
        'settings.organization.manage',
        'settings.audit.read',
        'settings.integrations.manage',
      ]}
    >
      <SettingsScreen />
    </RequirePermission>
  );
}
