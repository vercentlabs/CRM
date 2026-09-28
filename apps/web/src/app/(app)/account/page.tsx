import type { Metadata } from 'next';
import { AccountScreen } from '@/modules/organization/AccountScreen';

export const metadata: Metadata = { title: 'My account' };

export default function Page() {
  return <AccountScreen />;
}
