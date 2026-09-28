import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted">The page you are looking for does not exist.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
