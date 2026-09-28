import type { Opportunity, OpportunityStage } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import { Badge, Button, Chip, EmptyState, IconButton, Screen, Text } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatNumber } from '../../lib/format';
import { STAGE_OPTIONS, STAGE_TONE } from '../../lib/labels';
import { useSession } from '../../providers/SessionProvider';

export function OpportunitiesScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const [stage, setStage] = useState<OpportunityStage | null>(null);
  const list = usePagedQuery<Opportunity>(['opportunities', 'list', { stage }], (page) =>
    api().v1.opportunities.list({
      page,
      limit: 20,
      sort: '-updated_at',
      ...(stage ? { stage } : {}),
    }),
  );
  const canCreate = can('crm.opportunities.create') && can('crm.leads.read');

  return (
    <Screen
      title="Opportunities"
      subtitle={list.total !== undefined ? `${list.total} opportunities` : undefined}
      actions={
        canCreate ? (
          <IconButton
            icon="plus"
            label="New opportunity"
            onPress={() => navigation.navigate('OpportunityForm', {})}
          />
        ) : null
      }
    >
      <PagedList
        query={list}
        keyExtractor={(o) => o.id}
        header={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip label="All stages" selected={!stage} onPress={() => setStage(null)} />
            {STAGE_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={stage === o.value}
                onPress={() => setStage(o.value)}
              />
            ))}
          </ScrollView>
        }
        empty={
          <EmptyState
            title={stage ? `No opportunities in ${stage}` : 'No opportunities yet'}
            message="Opportunities track potential deals on a lead."
            action={
              !stage && canCreate ? (
                <Button
                  label="New opportunity"
                  variant="primary"
                  icon="plus"
                  onPress={() => navigation.navigate('OpportunityForm', {})}
                />
              ) : undefined
            }
          />
        }
        renderItem={(o) => (
          <ListRow
            title={o.title}
            subtitle={[
              o.lead_name ?? `Lead #${o.lead_id}`,
              o.assigned_to_name ?? 'Unassigned',
            ].join(' · ')}
            meta={
              o.expected_close_date
                ? `Expected close ${formatDate(o.expected_close_date)}`
                : undefined
            }
            onPress={() => navigation.navigate('OpportunityForm', { id: o.id })}
            trailing={
              <View style={styles.trailing}>
                <Badge label={o.stage} tone={STAGE_TONE[o.stage]} />
                {o.value !== null ? (
                  <Text variant="label">{formatNumber(Number(o.value))}</Text>
                ) : null}
                {o.probability !== null ? (
                  <Text variant="caption" color="muted">
                    {o.probability}%
                  </Text>
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
  chips: { gap: 8, padding: 16, paddingBottom: 8 },
  trailing: { alignItems: 'flex-end', gap: 4 },
});
