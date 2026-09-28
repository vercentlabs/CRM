import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
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
