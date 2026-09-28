'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    // If authentication is still loading, don't redirect yet
    if (loading) return;

    // If user is not authenticated, redirect to login
    if (!user) {
      const loginTimer = setTimeout(() => {
        router.push('/login');
      }, 5000);
      return () => clearTimeout(loginTimer);
    }

    // If user is authenticated, redirect based on role after 5 seconds
    const redirectTimer = setTimeout(() => {
      switch (user.roleId) {
        case ROLE_ADMIN:
          router.push('/admin');
          break;
        case ROLE_MANAGER:
          router.push('/dashboard');
          break;
        case ROLE_SALES:
          router.push('/leads');
          break;
        default:
          // Fallback to dashboard for any unknown role
          router.push('/dashboard');
      }
    }, 5000);

    return () => clearTimeout(redirectTimer);
  }, [user, loading, router]);

  // Show a loading state while redirecting
  // Use a consistent structure for both server and client rendering
  return (
    <div className="flex min-h-screen items-center justify-center auth-gradient font-sans">
      <main className="flex min-h-screen w-full max-w-5xl flex-col items-center justify-center py-12 px-4 sm:px-6 md:px-8 lg:py-24">
        {/* Logo/Icon Section */}
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>

        {/* Title Section */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-3 sm:mb-4 text-center">
          CRM Enterprise
        </h1>
        <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-300 text-center max-w-md px-4">
          Customer Relationship Management System
        </p>

        {/* Loading Animation */}
        <div className="mt-8 sm:mt-10 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 rounded-full blur-lg opacity-20 animate-pulse"></div>
            <div className="relative animate-spin rounded-full h-12 w-12 sm:h-14 sm:w-14 border-4 border-indigo-100 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-500"></div>
          </div>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 animate-pulse">
            Loading your workspace...
          </p>
        </div>

        {/* Additional Info */}
        <div className="mt-12 sm:mt-16 flex flex-col sm:flex-row gap-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Secure & Reliable</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Fast & Efficient</span>
          </div>
        </div>
      </main>
    </div>
  );
}
