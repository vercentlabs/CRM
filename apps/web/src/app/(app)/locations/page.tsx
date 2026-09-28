import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { LocationsScreen } from '@/modules/locations/LocationsScreen';

export const metadata: Metadata = { title: 'Locations' };

export default function Page() {
  return (
    <RequirePermission anyOf={['crm.locations.read', 'crm.locations.checkin']}>
      <LocationsScreen />
    </RequirePermission>
  );
}
