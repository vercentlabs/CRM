import type { NextConfig } from 'next';
import { securityHeaders } from './security-headers';

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  // next/image is not used: disable the /_next/image optimizer endpoint entirely
  // (attack surface of several Next.js advisories; attachments are plain <img>).
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders({
          apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5000',
          production: process.env.NODE_ENV === 'production',
        }),
      },
    ];
  },
  // Old bookmarks: lead messaging moved to /messages (it previously showed team chat).
  async redirects() {
    return [
      { source: '/lead-messages', destination: '/messages', permanent: false },
      { source: '/lead-messages/bulk', destination: '/messages/bulk', permanent: false },
      { source: '/admin', destination: '/settings', permanent: false },
      { source: '/users', destination: '/settings/members', permanent: false },
      { source: '/audit', destination: '/settings/audit', permanent: false },
      { source: '/followups/overdue', destination: '/followups?view=overdue', permanent: false },
      { source: '/locations/executives', destination: '/locations?view=team', permanent: false },
      { source: '/unauthorized', destination: '/dashboard', permanent: false },
      { source: '/reports/conversion', destination: '/reports?tab=conversion', permanent: false },
      { source: '/reports/lead-aging', destination: '/reports?tab=aging', permanent: false },
      {
        source: '/reports/sales-performance',
        destination: '/reports?tab=performance',
        permanent: false,
      },
      {
        source: '/reports/sales-performance/:id',
        destination: '/reports?tab=performance&member=:id',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
