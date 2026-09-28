import type { Lead, LeadStatus } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  IconButton,
  Screen,
  TextField,
} from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { api } from '../../lib/api';
import { formatRelative, isPast } from '../../lib/format';
import { LEAD_STATUS_OPTIONS, LEAD_STATUS_TONE } from '../../lib/labels';
import { useSession } from '../../providers/SessionProvider';

export function LeadsScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | null>(null);
  const debounced = useDebouncedValue(search.trim(), 350);

  const leads = usePagedQuery<Lead>(['leads', 'list', { search: debounced, status }], (page) =>
    api().v1.leads.list({
      page,
      limit: 20,
      sort: '-created_at',
      ...(debounced ? { search: debounced } : {}),
      ...(status ? { status } : {}),
    }),
  );
  const filtered = Boolean(debounced || status);

  return (
    <Screen
      title="Leads"
      subtitle={leads.total !== undefined ? `${leads.total} leads` : undefined}
      actions={
        can('crm.leads.create') ? (
          <IconButton
            icon="plus"
            label="New lead"
            onPress={() => navigation.navigate('LeadForm')}
          />
        ) : null
      }
    >
      <PagedList
        query={leads}
        keyExtractor={(lead) => lead.id}
        header={
          <View style={styles.filters}>
            <TextField
              label="Search leads"
              placeholder="Name, email or phone"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              autoCapitalize="none"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Chip label="All" selected={!status} onPress={() => setStatus(null)} />
              {LEAD_STATUS_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={status === option.value}
                  onPress={() => setStatus(option.value)}
                />
              ))}
            </ScrollView>
          </View>
        }
        empty={
          <EmptyState
            title={filtered ? 'No leads match' : 'No leads yet'}
            message={
              filtered
                ? 'Try a different search or status.'
                : 'Leads you create or are assigned will appear here.'
            }
            action={
              !filtered && can('crm.leads.create') ? (
                <Button
                  label="New lead"
                  variant="primary"
                  icon="plus"
                  onPress={() => navigation.navigate('LeadForm')}
                />
              ) : undefined
            }
          />
        }
        renderItem={(lead) => (
          <ListRow
            title={lead.full_name}
            subtitle={[lead.mobile_number, lead.assigned_user_name ?? 'Unassigned'].join(' · ')}
            onPress={() => navigation.navigate('LeadDetail', { id: lead.id })}
            trailing={
              <View style={styles.trailing}>
                <Badge label={lead.status} tone={LEAD_STATUS_TONE[lead.status]} />
                {lead.next_call_at ? (
                  <Badge
                    label={`${isPast(lead.next_call_at) ? 'Overdue · ' : ''}${formatRelative(lead.next_call_at)}`}
                    tone={isPast(lead.next_call_at) ? 'danger' : 'neutral'}
                  />
                ) : null}
              </View>
            }
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { padding: 16, paddingBottom: 8, gap: 10 },
  chips: { gap: 8 },
  trailing: { alignItems: 'flex-end', gap: 4 },
});
