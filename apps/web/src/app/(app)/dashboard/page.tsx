import type { Metadata } from 'next';
import { DashboardScreen } from '@/modules/dashboard/DashboardScreen';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Page() {
  return <DashboardScreen />;
}
