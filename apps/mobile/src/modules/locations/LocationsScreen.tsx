import type { SalesLocation } from '@crm/types';
import { checkInSchema, createLocationSchema } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { applyServerErrors, FormText, useZodForm } from '../../components/forms/form';
import { FormActions, FormError, MemberSelect } from '../../components/forms/pickers';
import { ListRow } from '../../components/lists/PagedList';
import {
  Button,
  Card,
  confirm,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  Segmented,
  Sheet,
  Text,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatRelative } from '../../lib/format';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

type Tab = 'branches' | 'team';

/** Branches (manage with crm.locations.manage), team last-known locations, and my check-in. */
export function LocationsScreen() {
  const { can } = useSession();
  const canRead = can('crm.locations.read');
  const [tab, setTab] = useState<Tab>('branches');
  const [checkingIn, setCheckingIn] = useState(false);
  return (
    <Screen
      title="Locations"
      actions={
        can('crm.locations.checkin') ? (
          <IconButton icon="map-pin" label="Check in" onPress={() => setCheckingIn(true)} />
        ) : null
      }
    >
      {canRead ? (
        <>
          <View style={styles.tabs}>
            <Segmented
              label="Locations view"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'branches', label: 'Branches' },
                { value: 'team', label: 'Team' },
              ]}
            />
          </View>
          {tab === 'branches' ? <Branches /> : <Team />}
        </>
      ) : (
        <View style={styles.content}>
          <EmptyState
            icon="map-pin"
            title="Share your location"
            message="Check in so your team knows where you are working."
            action={
              <Button label="Check in" variant="primary" onPress={() => setCheckingIn(true)} />
            }
          />
        </View>
      )}
      {checkingIn ? <CheckInSheet onClose={() => setCheckingIn(false)} /> : null}
    </Screen>
  );
}

function useLocationsMutations() {
  const key = useQueryKey();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: key('locations') });
  return {
    create: useMutation({ mutationFn: api().v1.locations.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: number;
        input: Parameters<ReturnType<typeof api>['v1']['locations']['update']>[1];
      }) => api().v1.locations.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: api().v1.locations.remove, onSuccess: invalidate }),
    checkIn: useMutation({ mutationFn: api().v1.locations.checkIn, onSuccess: invalidate }),
  };
}

function Branches() {
  const key = useQueryKey();
  const { can } = useSession();
  const canManage = can('crm.locations.manage');
  const list = useQuery({
    queryKey: key('locations', 'branches'),
    queryFn: () => api().v1.locations.list(),
  });
  const [editing, setEditing] = useState<SalesLocation | 'new' | null>(null);
  if (list.isPending) return <LoadingState />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
      }
    >
      {canManage ? (
        <View style={styles.content}>
          <Button label="Add branch" icon="plus" onPress={() => setEditing('new')} />
        </View>
      ) : null}
      {list.data.length === 0 ? <EmptyState icon="map" title="No branches yet" /> : null}
      {list.data.map((l) => (
        <ListRow
          key={l.id}
          title={l.name}
          subtitle={
            [l.address, l.city, l.state, l.pin_code].filter(Boolean).join(', ') || undefined
          }
          meta={
            [l.manager_name ? `Manager: ${l.manager_name}` : null, l.contact_phone]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          onPress={canManage ? () => setEditing(l) : undefined}
        />
      ))}
      {editing ? (
        <BranchSheet
          location={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ScrollView>
  );
}

function BranchSheet({
  location,
  onClose,
}: {
  location?: SalesLocation | undefined;
  onClose: () => void;
}) {
  const { create, update, remove } = useLocationsMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createLocationSchema, {
    defaultValues: {
      name: location?.name ?? '',
      address: location?.address ?? '',
      city: location?.city ?? '',
      state: location?.state ?? '',
      country: location?.country ?? 'India',
      pin_code: location?.pin_code ?? '',
      contact_phone: location?.contact_phone ?? '',
      manager_id: location?.manager_id == null ? '' : String(location.manager_id),
    },
  });
  const saving = create.isPending || update.isPending;
  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (location) await update.mutateAsync({ id: location.id, input: values });
      else await create.mutateAsync(values);
      toast.success(location ? 'Branch updated' : 'Branch added', values.name);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });
  const onDelete = () =>
    location &&
    confirm({
      title: 'Delete branch?',
      message: `${location.name} will be removed. Leads linked to it keep their data.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await remove.mutateAsync(location.id);
          toast.success('Branch deleted', location.name);
          onClose();
        } catch (error) {
          toast.error('Could not delete branch', errorMessage(error));
        }
      },
    });
  const { control } = form;
  return (
    <Sheet visible onClose={onClose} title={location ? 'Edit branch' : 'Add branch'} busy={saving}>
      <FormError message={formError} />
      <FormText control={control} name="name" label="Name" required />
      <FormText control={control} name="address" label="Address" multiline />
      <FormText control={control} name="city" label="City" />
      <FormText control={control} name="state" label="State" />
      <FormText control={control} name="country" label="Country" />
      <FormText control={control} name="pin_code" label="PIN code" keyboardType="number-pad" />
      <FormText
        control={control}
        name="contact_phone"
        label="Contact phone"
        keyboardType="phone-pad"
      />
      <Controller
        control={control}
        name="manager_id"
        render={({ field }) => (
          <MemberSelect
            label="Manager"
            clearLabel="No manager"
            value={field.value ? String(field.value) : null}
            onChange={(v) => field.onChange(v ?? '')}
          />
        )}
      />
      <FormActions
        submitLabel={location ? 'Save' : 'Add branch'}
        saving={saving}
        onSubmit={() => void submit()}
        onCancel={onClose}
      />
      {location ? (
        <Button
          label="Delete branch"
          variant="danger"
          icon="trash-2"
          onPress={onDelete}
          loading={remove.isPending}
        />
      ) : null}
    </Sheet>
  );
}

function Team() {
  const key = useQueryKey();
  const list = useQuery({
    queryKey: key('locations', 'executives'),
    queryFn: () => api().v1.locations.executives(),
  });
  if (list.isPending) return <LoadingState />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
      }
    >
      {list.data.length === 0 ? <EmptyState icon="users" title="No check-ins yet" /> : null}
      {list.data.map((e) => {
        const has = e.latitude && e.longitude;
        const where =
          e.address ||
          (has
            ? `${Number(e.latitude).toFixed(5)}, ${Number(e.longitude).toFixed(5)}`
            : 'No location shared');
        return (
          <ListRow
            key={e.id}
            title={e.full_name}
            subtitle={where}
            meta={e.updated_at ? `Updated ${formatRelative(e.updated_at)}` : undefined}
            onPress={
              has
                ? () =>
                    void Linking.openURL(
                      `https://www.openstreetmap.org/?mlat=${encodeURIComponent(e.latitude!)}&mlon=${encodeURIComponent(e.longitude!)}#map=16/${encodeURIComponent(e.latitude!)}/${encodeURIComponent(e.longitude!)}`,
                    )
                : undefined
            }
            accessibilityHint={has ? 'Opens the location in a map' : undefined}
          />
        );
      })}
    </ScrollView>
  );
}

/** Manual check-in (coordinates and address); device GPS capture is not part of this app yet. */
function CheckInSheet({ onClose }: { onClose: () => void }) {
  const { checkIn } = useLocationsMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(checkInSchema, {
    defaultValues: { latitude: '', longitude: '', address: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await checkIn.mutateAsync(values);
      toast.success('Checked in');
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Check in"
      subtitle="Share where you are working"
      busy={checkIn.isPending}
    >
      <FormError message={formError} />
      <Card>
        <FormText
          control={form.control}
          name="latitude"
          label="Latitude"
          required
          keyboardType="numbers-and-punctuation"
        />
        <FormText
          control={form.control}
          name="longitude"
          label="Longitude"
          required
          keyboardType="numbers-and-punctuation"
        />
        <FormText control={form.control} name="address" label="Address" multiline />
      </Card>
      <Text variant="caption" color="muted">
        Your team sees your latest check-in.
      </Text>
      <FormActions
        submitLabel="Check in"
        saving={checkIn.isPending}
        onSubmit={() => void submit()}
        onCancel={onClose}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tabs: { padding: 16, paddingBottom: 8 },
  content: { padding: 16 },
});
