'use client';

import {
  Avatar,
  Badge,
  DropdownMenu,
  IconButton,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  useToast,
} from '@crm/ui';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { CommandPalette } from './CommandPalette';
import type { NavGroup } from './navigation';

export function Topbar({ groups, menuButton }: { groups: NavGroup[]; menuButton: ReactNode }) {
  const { user, membership, organization, organizations, logout, switchOrganization } =
    useSession();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const switchable = organizations.filter((entry) => entry.status === 'active');

  const onSwitch = async (organizationId: string, name: string) => {
    try {
      await switchOrganization(organizationId);
      router.push('/dashboard');
      toast.success(`Switched to ${name}`);
    } catch (error) {
      toast.error('Could not switch organization', errorMessage(error));
    }
  };

  return (
    <header
      data-app-topbar
      className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-4"
    >
      {menuButton}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-bg px-3 text-sm text-muted hover:border-border-strong sm:max-w-md"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <SearchIcon />
        <span className="truncate">Go to… or search leads</span>
        <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[11px] sm:inline">
          Ctrl K
        </kbd>
      </button>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={groups} />

      <div className="ml-auto flex items-center gap-1">
        {switchable.length > 1 && (
          <DropdownMenu
            label={`Organization: ${organization?.name ?? ''}. Switch organization`}
            trigger={
              <span className="hidden h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-surface-muted md:inline-flex">
                <span className="max-w-40 truncate">{organization?.name}</span>
                <Badge>{switchable.length}</Badge>
              </span>
            }
            items={switchable.map((entry) => ({
              label: `${entry.organization.name}${entry.organization.id === organization?.id ? ' (current)' : ''}`,
              disabled: entry.organization.id === organization?.id,
              onSelect: () => void onSwitch(entry.organization.id, entry.organization.name),
            }))}
          />
        )}
        <IconButton
          label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
          onClick={toggle}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </IconButton>
        <DropdownMenu
          label="Account menu"
          trigger={<Avatar name={user?.name} decorative />}
          header={
            <div className="min-w-0">
              <p className="truncate font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
              <p className="mt-1 text-xs text-muted">
                {membership?.role.name} · {organization?.name}
              </p>
            </div>
          }
          items={[
            ...(switchable.length > 1
              ? switchable
                  .filter((entry) => entry.organization.id !== organization?.id)
                  .map((entry) => ({
                    label: `Switch to ${entry.organization.name}`,
                    onSelect: () => void onSwitch(entry.organization.id, entry.organization.name),
                  }))
              : []),
            {
              label: 'My account',
              icon: <SettingsIcon />,
              onSelect: () => router.push('/account'),
            },
            {
              label: 'Sign out',
              icon: <LogOutIcon />,
              onSelect: () => {
                void logout().then(() => router.replace('/login'));
              },
            },
          ]}
        />
      </div>
    </header>
  );
}
