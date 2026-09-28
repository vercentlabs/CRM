import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { FormActions, FormError } from '../../components/forms/pickers';
import { ListRow } from '../../components/lists/PagedList';
import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  Screen,
  SelectField,
  Text,
  TextField,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

/** Settings values are stored JSON-encoded; older rows may be raw strings. */
const decode = (value: string | undefined): string => {
  if (value === undefined) return '';
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'string' || typeof parsed === 'number' ? String(parsed) : value;
  } catch {
    return value;
  }
};

type Field = {
  key: string;
  label: string;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
};
const FIELDS: Field[] = [
  { key: 'site_name', label: 'Display name', hint: 'Shown in emails and exports.' },
  { key: 'timezone', label: 'Time zone', hint: 'IANA name, e.g. Asia/Kolkata.' },
  {
    key: 'date_format',
    label: 'Date format',
    options: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].map((v) => ({ value: v, label: v })),
  },
  {
    key: 'time_format',
    label: 'Time format',
    options: [
      { value: '12h', label: '12-hour' },
      { value: '24h', label: '24-hour' },
    ],
  },
  {
    key: 'items_per_page',
    label: 'Default rows per page',
    options: ['10', '20', '50', '100'].map((v) => ({ value: v, label: v })),
  },
];

/** Organization-wide settings (tenant preferences only). Personal preferences live in My account. */
export function SettingsScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const canManage = can('settings.organization.manage');
  return (
    <Screen title="Settings" subtitle="Organization" scroll>
      {canManage ? <OrganizationSettings /> : null}
      {canManage ? <EmailCheck /> : null}
      {can('settings.audit.read') ? (
        <Card>
          <ListRow
            title="Audit log"
            subtitle="Who changed what, and when"
            onPress={() => navigation.navigate('Audit')}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function OrganizationSettings() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const settings = useQuery({ queryKey: key('settings'), queryFn: () => api().v1.settings.get() });
  if (settings.isPending) return <LoadingState />;
  if (settings.error)
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return (
    <SettingsForm
      initial={Object.fromEntries(FIELDS.map((f) => [f.key, decode(settings.data[f.key])]))}
      onSaved={(data) => {
        queryClient.setQueryData(key('settings'), data);
        toast.success('Settings saved');
      }}
    />
  );
}

function SettingsForm({
  initial,
  onSaved,
}: {
  initial: Record<string, string>;
  onSaved: (data: Record<string, string>) => void;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (next: Record<string, string>) => api().v1.settings.update(next),
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });
  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));
  return (
    <Card title="Organization">
      <FormError message={error} />
      {FIELDS.map((f) =>
        f.options ? (
          <SelectField
            key={f.key}
            label={f.label}
            value={values[f.key] || null}
            options={f.options}
            onChange={(v) => set(f.key, v ?? '')}
          />
        ) : (
          <TextField
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={values[f.key] ?? ''}
            onChangeText={(v) => set(f.key, v)}
            autoCapitalize="none"
          />
        ),
      )}
      <FormActions
        submitLabel="Save settings"
        saving={save.isPending}
        onSubmit={() => {
          setError(null);
          save.mutate(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
        }}
      />
    </Card>
  );
}

/** Checks the server's email delivery; SMTP configuration itself is server-side only. */
function EmailCheck() {
  const toast = useToast();
  const [to, setTo] = useState('');
  const verify = useMutation({
    mutationFn: () => api().v1.settings.verifyEmail(),
    onSuccess: () => toast.success('Email connection verified'),
    onError: (err) => toast.error('Email connection failed', errorMessage(err)),
  });
  const test = useMutation({
    mutationFn: () => api().v1.settings.sendTestEmail(to.trim() || undefined),
    onSuccess: () => toast.success('Test email sent'),
    onError: (err) => toast.error('Could not send test email', errorMessage(err)),
  });
  return (
    <Card title="Email delivery">
      <Text color="muted" style={styles.gap}>
        Check that the server can send email (password links and invitations).
      </Text>
      <Button
        label="Verify connection"
        onPress={() => verify.mutate()}
        loading={verify.isPending}
      />
      <TextField
        label="Send a test email to"
        placeholder="Defaults to your email"
        value={to}
        onChangeText={setTo}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Button label="Send test email" onPress={() => test.mutate()} loading={test.isPending} />
    </Card>
  );
}

const styles = StyleSheet.create({ gap: { marginBottom: 8 } });
