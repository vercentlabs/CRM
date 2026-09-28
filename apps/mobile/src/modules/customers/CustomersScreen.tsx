import type { Customer } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import { Avatar, Button, EmptyState, IconButton, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useSession } from '../../providers/SessionProvider';

export function CustomersScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const list = usePagedQuery<Customer>(['customers', 'list'], (page) =>
    api().v1.customers.list({ page, limit: 20, sort: '-created_at' }),
  );
  const canCreate = can('crm.customers.create');
  return (
    <Screen
      title="Customers"
      subtitle={list.total !== undefined ? `${list.total} customers` : undefined}
      actions={
        canCreate ? (
          <IconButton
            icon="plus"
            label="New customer"
            onPress={() => navigation.navigate('CustomerForm', {})}
          />
        ) : null
      }
    >
      <PagedList
        query={list}
        keyExtractor={(c) => c.id}
        empty={
          <EmptyState
            title="No customers yet"
            message="Customers are created here or when a lead is converted."
            action={
              canCreate ? (
                <Button
                  label="New customer"
                  variant="primary"
                  icon="plus"
                  onPress={() => navigation.navigate('CustomerForm', {})}
                />
              ) : undefined
            }
          />
        }
        renderItem={(c) => (
          <ListRow
            leading={<Avatar name={c.name} />}
            title={c.name}
            subtitle={[c.email, c.phone].filter(Boolean).join(' · ')}
            meta={`Added ${formatDate(c.created_at)}`}
            onPress={() => navigation.navigate('CustomerForm', { id: c.id })}
          />
        )}
      />
    </Screen>
  );
}
