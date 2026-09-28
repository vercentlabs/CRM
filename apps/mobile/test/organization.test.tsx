import { useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { api } from '../src/lib/api';
import { tokens } from '../src/lib/tokens';
import { AppProviders } from '../src/providers/AppProviders';
import {
  useQueryKey,
  useSession,
  type SessionContextValue,
} from '../src/providers/SessionProvider';
import { fakeServer, makeSession, ORG_A, ORG_B, testQueryClient, withTokens } from './helpers';

let current: SessionContextValue;

function LeadCount() {
  current = useSession();
  const key = useQueryKey();
  const leads = useQuery({
    queryKey: key('leads', 'list'),
    queryFn: () => api().v1.leads.list({ limit: 20 }),
  });
  return (
    <Text testID="leads">
      {current.organization?.slug}:
      {leads.data
        ? leads.data.items.map((l) => (l as { full_name: string }).full_name).join(',')
        : 'loading'}
    </Text>
  );
}

const orgBSession = () =>
  makeSession({
    organization: ORG_B,
    membership: { id: 80, role: { key: 'sales', name: 'Sales' } },
  });

describe('organization switching', () => {
  beforeEach(async () => {
    await tokens.store({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  test('switching clears tenant data, scopes keys by organization and stores the new tokens', async () => {
    let org = 'a';
    const server = fakeServer({
      'GET /leads': () => ({
        data: org === 'a' ? [{ full_name: 'Alpha Lead' }] : [{ full_name: 'Bravo Lead' }],
        meta: { pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
      }),
      'POST /auth/switch-organization': () => {
        org = 'b';
        return { data: withTokens(orgBSession(), 9) };
      },
    });
    const queryClient = testQueryClient();
    render(
      <AppProviders queryClient={queryClient} initialSession={makeSession()}>
        <LeadCount />
      </AppProviders>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('leads').props.children.join('')).toBe('acme:Alpha Lead'),
    );
    expect(queryClient.getQueryData(['org', ORG_A.id, 'leads', 'list'])).toBeDefined();

    await act(() => current.switchOrganization(ORG_B.id));

    expect(server.find('POST', '/auth/switch-organization')[0]!.body).toEqual({
      organizationId: ORG_B.id,
    });
    // Org A data is gone from the cache, not merely hidden.
    expect(queryClient.getQueryData(['org', ORG_A.id, 'leads', 'list'])).toBeUndefined();
    await waitFor(() =>
      expect(screen.getByTestId('leads').props.children.join('')).toBe('beta:Bravo Lead'),
    );
    expect(tokens.getAccessToken()).toBe('access-9');
    expect(current.membership?.role.key).toBe('sales');
  });

  test('switching cancels in-flight tenant requests', async () => {
    let resolveSlow: (() => void) | undefined;
    fakeServer({
      'GET /leads': () =>
        new Promise((resolve) => {
          resolveSlow = () =>
            resolve({
              data: [{ full_name: 'Late Alpha' }],
              meta: { pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
            });
        }),
      'POST /auth/switch-organization': { data: withTokens(orgBSession(), 2) },
    });
    const queryClient = testQueryClient();
    render(
      <AppProviders queryClient={queryClient} initialSession={makeSession()}>
        <LeadCount />
      </AppProviders>,
    );
    await waitFor(() => expect(resolveSlow).toBeDefined());
    await act(() => current.switchOrganization(ORG_B.id));
    resolveSlow?.();
    // The late org-A response never lands in the cache.
    expect(queryClient.getQueryData(['org', ORG_A.id, 'leads', 'list'])).toBeUndefined();
  });

  test('an invalid membership is refused and the current organization is kept', async () => {
    fakeServer({
      'GET /leads': {
        data: [],
        meta: { pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
      },
      'POST /auth/switch-organization': {
        status: 403,
        error: { code: 'FORBIDDEN', message: 'Not a member of this organization' },
      },
    });
    render(
      <AppProviders queryClient={testQueryClient()} initialSession={makeSession()}>
        <LeadCount />
      </AppProviders>,
    );
    await expect(
      act(() => current.switchOrganization('00000000-0000-4000-8000-0000000000ff')),
    ).rejects.toMatchObject({ status: 403 });
    expect(current.organization?.id).toBe(ORG_A.id);
    expect(current.status).toBe('signed-in');
    expect(tokens.getAccessToken()).toBe('access-1');
  });
});
