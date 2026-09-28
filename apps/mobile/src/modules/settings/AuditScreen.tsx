import type { AuditLogEntry } from '@crm/types';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import { Badge, EmptyState, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { humanizeCode } from '../../lib/labels';

const ACTION_TONE: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
};

/** Read-only audit trail of the active organization (settings.audit.read). */
export function AuditScreen() {
  const list = usePagedQuery<AuditLogEntry>(['audit', 'list'], (page) =>
    api().v1.audit.list({ page, limit: 30 }),
  );
  return (
    <Screen
      title="Audit log"
      subtitle={list.total !== undefined ? `${list.total} entries` : undefined}
      back
    >
      <PagedList
        query={list}
        keyExtractor={(e) => e.id}
        empty={<EmptyState icon="shield" title="No audit entries" />}
        renderItem={(e) => (
          <ListRow
            title={`${humanizeCode(e.table_name)}${e.record_id !== null ? ` #${e.record_id}` : ''}`}
            subtitle={[e.user_email ?? 'System', formatDateTime(e.created_at)].join(' · ')}
            meta={e.request_id ? `Request ${e.request_id}` : undefined}
            trailing={
              <Badge
                label={humanizeCode(e.action)}
                tone={ACTION_TONE[e.action.toUpperCase()] ?? 'neutral'}
              />
            }
          />
        )}
      />
    </Screen>
  );
}
