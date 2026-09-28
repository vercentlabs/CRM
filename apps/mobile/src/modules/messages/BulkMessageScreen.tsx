import type { Lead, LeadStatus } from '@crm/types';
import { bulkMessageSchema } from '@crm/validation';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { applyServerErrors, FormText, useZodForm } from '../../components/forms/form';
import { FormActions, FormError } from '../../components/forms/pickers';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import {
  Chip,
  EmptyState,
  Screen,
  Segmented,
  Text,
  TextField,
  useToast,
} from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { api } from '../../lib/api';
import { CHANNEL_OPTIONS, LEAD_STATUS_OPTIONS } from '../../lib/labels';
import { useMessageMutations } from './hooks';

const MAX = 500;

/** Pick leads (server search/filter, paged), then send one SMS/WhatsApp to all of them. */
export function BulkMessageScreen() {
  const navigation = useNavigation();
  const toast = useToast();
  const { sendBulk } = useMessageMutations();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | null>(null);
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [formError, setFormError] = useState<string | null>(null);
  const debounced = useDebouncedValue(search.trim(), 350);
  const leads = usePagedQuery<Lead>(['leads', 'bulk-picker', { debounced, status }], (page) =>
    api().v1.leads.list({
      page,
      limit: 30,
      sort: 'full_name',
      ...(debounced ? { search: debounced } : {}),
      ...(status ? { status } : {}),
    }),
  );
  const form = useZodForm(bulkMessageSchema, {
    defaultValues: { lead_ids: [], channel: 'sms', content: '' },
  });

  const toggle = (lead: Lead) => {
    const next = new Map(selected);
    if (next.has(lead.id)) next.delete(lead.id);
    else if (next.size < MAX) next.set(lead.id, lead.full_name);
    setSelected(next);
    form.setValue('lead_ids', [...next.keys()], { shouldValidate: form.formState.isSubmitted });
  };

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await sendBulk.mutateAsync(values);
      toast.success('Messages sent', `${result.count} leads`);
      navigation.goBack();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <Screen title="Bulk message" subtitle={`${selected.size} selected`} back keyboard>
      <PagedList
        query={leads}
        keyExtractor={(l) => l.id}
        header={
          <View style={styles.header}>
            <FormError
              message={formError ?? (form.formState.errors.lead_ids?.message as string | undefined)}
            />
            <Controller
              control={form.control}
              name="channel"
              render={({ field }) => (
                <Segmented
                  label="Channel"
                  value={String(field.value)}
                  onChange={field.onChange}
                  options={CHANNEL_OPTIONS}
                />
              )}
            />
            <FormText
              control={form.control}
              name="content"
              label="Message"
              required
              multiline
              maxLength={5000}
            />
            <FormActions
              submitLabel={`Send to ${selected.size}`}
              saving={sendBulk.isPending}
              onSubmit={() => void submit()}
            />
            <Text variant="label">Recipients</Text>
            <TextField
              label="Search leads"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Chip label="All" selected={!status} onPress={() => setStatus(null)} />
              {LEAD_STATUS_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={status === o.value}
                  onPress={() => setStatus(o.value)}
                />
              ))}
            </ScrollView>
          </View>
        }
        empty={<EmptyState title="No leads match" />}
        renderItem={(lead) => (
          <ListRow
            title={lead.full_name}
            subtitle={lead.mobile_number}
            onPress={() => toggle(lead)}
            accessibilityHint={
              selected.has(lead.id) ? 'Remove from recipients' : 'Add to recipients'
            }
            trailing={
              <Chip
                label={selected.has(lead.id) ? 'Selected' : 'Select'}
                selected={selected.has(lead.id)}
                onPress={() => toggle(lead)}
              />
            }
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, gap: 10 },
  chips: { gap: 8 },
});
