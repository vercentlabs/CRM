import type { Lead } from '@crm/types';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';
import { useColors } from '../../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { SelectField, type SelectOption } from '../ui/fields';
import { Text } from '../ui/Text';

/** Active members of the organization as options (needs settings.users.read). */
export function useMemberOptions(enabled = true) {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('members', 'options'),
    queryFn: async () => {
      const page = await api().v1.organizations.members({ page: 1, limit: 100 });
      return page.items
        .filter((m) => m.membership_status === 'active')
        .map<SelectOption>((m) => ({
          value: String(m.id),
          label: m.full_name,
          description: m.email,
        }));
    },
    enabled: enabled && can('settings.users.read'),
    staleTime: 5 * 60_000,
  });
}

export function MemberSelect({
  label = 'Assigned to',
  value,
  onChange,
  error,
  clearLabel = 'Unassigned',
}: {
  label?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  error?: string | undefined;
  clearLabel?: string;
}) {
  const members = useMemberOptions();
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={members.data ?? []}
      allowClear
      clearLabel={clearLabel}
      searchable
      loading={members.isPending}
      error={error}
      placeholder={clearLabel}
    />
  );
}

const leadOption = (
  lead: Pick<Lead, 'id' | 'full_name' | 'mobile_number' | 'email'>,
): SelectOption => ({
  value: String(lead.id),
  label: lead.full_name,
  description: [lead.mobile_number, lead.email].filter(Boolean).join(' · '),
});

/** Server-searched lead picker (debounced; only leads visible to the viewer are returned). */
export function LeadSelect({
  value,
  onChange,
  error,
  initial,
}: {
  value: string | null | undefined;
  onChange: (value: string | null, lead?: SelectOption) => void;
  error?: string | undefined;
  initial?: Pick<Lead, 'id' | 'full_name' | 'mobile_number' | 'email'> | undefined;
}) {
  const key = useQueryKey();
  const [text, setText] = useState('');
  const search = useDebouncedValue(text.trim(), 300);
  const [picked, setPicked] = useState<SelectOption | null>(initial ? leadOption(initial) : null);
  const results = useQuery({
    queryKey: key('leads', 'picker', search),
    queryFn: () =>
      api().v1.leads.list({ limit: 20, sort: '-updated_at', ...(search ? { search } : {}) }),
  });
  const options = (results.data?.items ?? []).map(leadOption);
  const withPicked =
    picked && !options.some((o) => o.value === picked.value) ? [picked, ...options] : options;
  return (
    <SelectField
      label="Lead"
      required
      value={value}
      options={withPicked}
      onSearch={setText}
      loading={results.isFetching}
      error={error}
      placeholder="Choose a lead"
      onChange={(next) => {
        const option = withPicked.find((o) => o.value === next) ?? null;
        setPicked(option);
        onChange(next, option ?? undefined);
      }}
    />
  );
}

/** Form footer: primary submit (pending + duplicate-submit safe) and cancel. */
export function FormActions({
  submitLabel,
  onSubmit,
  saving,
  onCancel,
  extra,
}: {
  submitLabel: string;
  onSubmit: () => void;
  saving: boolean;
  onCancel?: () => void;
  extra?: ReactNode;
}) {
  return (
    <View style={styles.actions}>
      {extra}
      {onCancel ? (
        <Button label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
      ) : null}
      <Button
        label={submitLabel}
        variant="primary"
        onPress={onSubmit}
        loading={saving}
        style={{ flex: 2 }}
        testID="form-submit"
      />
    </View>
  );
}

/** Form-level error banner (server errors not tied to a field). */
export function FormError({ message }: { message: string | null | undefined }) {
  const c = useColors();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.banner, { backgroundColor: c.dangerSoft, borderColor: c.danger }]}
    >
      <Text color="danger">{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  banner: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
