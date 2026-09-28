import { redirect } from 'next/navigation';

/** Everyone starts on the dashboard; the (app) layout sends signed-out visitors to /login. */
export default function Home() {
  redirect('/dashboard');
}
