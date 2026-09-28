
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute component for Next.js App Router
 * Redirects to /login if not authenticated
 * Blocks access if user's role is not in allowedRoles array
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render if authorized
 * @param {number[]} props.roles - Array of role IDs allowed to access the route
 * @param {number[]} [props.allowedRoles] - Back-compat alias for roles
 * @param {React.ReactNode} props.fallback - Optional fallback component to show while checking auth
 */
const ProtectedRoute = ({ 
  children, 
  roles,
  allowedRoles,
  fallback = <div>Loading...</div> 
}) => {
  const router = useRouter();
  const { user, isAuthenticated, loading } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const roleList = roles ?? allowedRoles ?? [];

  useEffect(() => {
    if (!loading) {
      // Check if user is authenticated
      if (!isAuthenticated) {
        router.push('/login');
        return;
      }

      // Check if user has required role
      if (roleList.length > 0) {
        const userRole = user?.roleId;
        if (!userRole || !roleList.includes(userRole)) {
          // Redirect Sales users (roleId: 3) to dashboard
          if (userRole === 3) {
            router.push('/dashboard');
          } else {
            router.push('/unauthorized');
          }
          return;
        }
      }

      // User is authenticated and authorized
      setIsAuthorized(true);
    }
  }, [isAuthenticated, user, roles, allowedRoles, loading, router, roleList]);

  if (loading || !isAuthorized) {
    return fallback;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
