import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * next/navigation for component tests: a router whose calls are recorded and
 * whose URL (pathname + search) is controllable per test.
 */
export const navigation = {
  pathname: '/dashboard',
  search: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: navigation.push,
    replace: (href: string) => {
      navigation.replace(href);
      const url = new URL(href, 'http://app.test');
      if (url.pathname === navigation.pathname) navigation.search = url.searchParams;
    },
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.search,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef<HTMLAnchorElement, { href: string; children?: React.ReactNode }>(
      function Link({ href, children, ...rest }, ref) {
        return React.createElement('a', { href, ref, ...rest }, children);
      },
    ),
  };
});

afterEach(() => {
  cleanup();
  navigation.pathname = '/dashboard';
  navigation.search = new URLSearchParams();
  navigation.push.mockReset();
  navigation.replace.mockReset();
});
