'use client';

import type { Permission } from '@crm/permissions';
import { PERMISSION_DESCRIPTIONS } from '@crm/permissions';
import { Badge, Button, Card, DescriptionList, PageHeader, useToast } from '@crm/ui';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';

/** The signed-in user's identity, membership and access (read-only), plus preferences. */
export function AccountScreen() {
  const { user, organization, membership, permissions, organizations } = useSession();
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const reset = useMutation({
    mutationFn: () => api().v1.auth.forgotPassword(user!.email),
    onSuccess: () => toast.success('Check your inbox', 'We sent a link to change your password.'),
    onError: (error) => toast.error('Could not send the link', errorMessage(error)),
  });
  const granted = Object.entries(permissions).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <DescriptionList
            items={[
              { label: 'Name', value: user?.name },
              { label: 'Email', value: user?.email },
              { label: 'Organization', value: organization?.name },
              { label: 'Role', value: membership?.role.name },
              {
                label: 'Organizations',
                value: organizations.filter((o) => o.status === 'active').length,
              },
            ]}
          />
          <p className="mt-4 text-xs text-muted">
            Ask an administrator to change your name or email.
          </p>
        </Card>
        <Card title="Security and preferences">
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium">Password</p>
              <p className="mb-2 text-muted">
                We&apos;ll email you a secure link to set a new password. Other sessions are signed
                out when it changes.
              </p>
              <Button onClick={() => reset.mutate()} loading={reset.isPending}>
                Email me a password link
              </Button>
            </div>
            <div>
              <p className="font-medium">Theme</p>
              <Button className="mt-1" onClick={toggle}>
                Use {theme === 'dark' ? 'light' : 'dark'} theme
              </Button>
            </div>
          </div>
        </Card>
        <Card title="What you can do in this organization" className="lg:col-span-2">
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {granted.map(([permission, scope]) => (
              <li key={permission} className="flex items-center justify-between gap-2">
                <span>{PERMISSION_DESCRIPTIONS[permission as Permission] ?? permission}</span>
                <Badge tone={scope === 'organization' ? 'primary' : 'neutral'}>
                  {scope === 'organization' ? 'Everyone' : 'Own records'}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
