'use client';

import { cn, IconButton, MenuIcon, XIcon } from '@crm/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useChatUnread } from '@/modules/chat/hooks';
import { useSession } from '@/providers/SessionProvider';
import { activeHref, visibleNavigation, type NavGroup } from './navigation';
import { Topbar } from './Topbar';

/** The authenticated application frame: sidebar (drawer on small screens) + top bar + content. */
export function AppShell({ children }: { children: ReactNode }) {
  const { canAny, organization } = useSession();
  const groups = useMemo(() => visibleNavigation(canAny), [canAny]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after navigating.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- close on route change
      setDrawerOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <Brand name={organization?.name} />
        <SidebarNav groups={groups} pathname={pathname} />
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="absolute inset-0 bg-overlay"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-2">
              <Brand name={organization?.name} />
              <IconButton label="Close navigation" onClick={() => setDrawerOpen(false)}>
                <XIcon />
              </IconButton>
            </div>
            <SidebarNav groups={groups} pathname={pathname} autoFocus />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          groups={groups}
          menuButton={
            <IconButton
              label="Open navigation"
              className="lg:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          }
        />
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-5 focus:outline-none sm:px-6"
        >
          <div className="mx-auto max-w-screen-2xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Brand({ name }: { name: string | undefined }) {
  return (
    <div className="flex h-14 items-center gap-2 px-4">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-fg"
      >
        C
      </span>
      <span className="truncate text-sm font-semibold" title={name}>
        {name ?? 'CRM'}
      </span>
    </div>
  );
}

function SidebarNav({
  groups,
  pathname,
  autoFocus,
}: {
  groups: NavGroup[];
  pathname: string;
  autoFocus?: boolean;
}) {
  const current = activeHref(pathname, groups);
  const unread = useChatUnread();
  const firstLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (autoFocus) firstLink.current?.focus();
  }, [autoFocus]);

  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-4">
      {groups.map((group, groupIndex) => (
        <div key={group.label} className="mt-4">
          <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {group.label}
          </p>
          <ul>
            {group.items.map((item, index) => {
              const active = item.href === current;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    ref={groupIndex === 0 && index === 0 ? firstLink : undefined}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                      active
                        ? 'bg-primary-soft font-medium text-primary'
                        : 'text-fg hover:bg-surface-muted',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.href === '/chat' && unread > 0 && (
                      <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
                        {unread > 99 ? '99+' : unread}
                        <span className="sr-only"> unread messages</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
