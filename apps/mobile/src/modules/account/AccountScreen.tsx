import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Detail,
  Screen,
  Segmented,
  Text,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { useSession } from '../../providers/SessionProvider';
import { useTheme, type ThemePreference } from '../../theme/ThemeProvider';

/** Personal account: profile, organizations, password, theme and sign-out. */
export function AccountScreen() {
  const { user, organization, membership, organizations, switchOrganization, logout } =
    useSession();
  const { mode, setMode } = useTheme();
  const toast = useToast();
  const [switching, setSwitching] = useState<string | null>(null);
  const passwordLink = useMutation({
    mutationFn: () => api().v1.auth.forgotPassword(user!.email),
    onSuccess: () => toast.success('Check your inbox', 'We sent a link to change your password.'),
    onError: (error) => toast.error('Could not send the link', errorMessage(error)),
  });

  const onSwitch = async (id: string, name: string) => {
    setSwitching(id);
    try {
      await switchOrganization(id);
      toast.success(`Switched to ${name}`);
    } catch (error) {
      toast.error('Could not switch organization', errorMessage(error));
    } finally {
      setSwitching(null);
    }
  };

  return (
    <Screen title="My account" scroll>
      <Card>
        <View style={styles.profile}>
          <Avatar name={user?.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{user?.name}</Text>
            <Text color="muted">{user?.email}</Text>
          </View>
        </View>
        <Detail label="Organization" value={organization?.name} />
        <Detail label="Role" value={membership?.role.name} />
      </Card>

      {organizations.length > 1 ? (
        <Card title="Organizations">
          {organizations.map((o) => {
            const current = o.organization.id === organization?.id;
            return (
              <View key={o.organization.id} style={styles.org}>
                <View style={{ flex: 1 }}>
                  <Text variant="label">{o.organization.name}</Text>
                  <Text variant="caption" color="muted">
                    {o.role.name}
                  </Text>
                </View>
                {current ? (
                  <Badge label="Current" tone="success" />
                ) : o.status === 'active' ? (
                  <Button
                    label="Switch"
                    onPress={() => void onSwitch(o.organization.id, o.organization.name)}
                    loading={switching === o.organization.id}
                    disabled={switching !== null}
                  />
                ) : (
                  <Badge label={o.status === 'invited' ? 'Invited' : 'Suspended'} tone="neutral" />
                )}
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card title="Password">
        <Text color="muted" style={styles.gap}>
          We will email you a secure link to set a new password. Other sessions are signed out when
          it changes.
        </Text>
        <Button
          label="Email me a password link"
          icon="mail"
          onPress={() => passwordLink.mutate()}
          loading={passwordLink.isPending}
        />
      </Card>

      <Card title="Appearance">
        <Segmented<ThemePreference>
          label="Theme"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Card>

      <Button label="Sign out" variant="danger" icon="log-out" onPress={() => void logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  org: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  gap: { marginBottom: 8 },
});
