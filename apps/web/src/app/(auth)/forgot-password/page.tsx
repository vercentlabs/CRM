import type { Metadata } from 'next';
import { ForgotPasswordScreen } from '@/modules/auth/AuthScreens';

export const metadata: Metadata = { title: 'Reset password' };

export default function Page() {
  return <ForgotPasswordScreen />;
}
