import type { Metadata } from 'next';
import { LoginScreen } from '@/modules/auth/AuthScreens';

export const metadata: Metadata = { title: 'Sign in' };

export default function Page() {
  return <LoginScreen />;
}
