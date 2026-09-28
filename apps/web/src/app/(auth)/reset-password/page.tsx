import type { Metadata } from 'next';
import { ResetPasswordScreen } from '@/modules/auth/AuthScreens';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function Page() {
  return <ResetPasswordScreen />;
}
