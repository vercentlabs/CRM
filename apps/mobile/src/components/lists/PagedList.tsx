import type { PaginationMeta } from '@crm/types';
import { Feather } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import type { QueryKeyPart } from '../../lib/query';
import { useQueryKey } from '../../providers/SessionProvider';
import { useColors } from '../../theme/ThemeProvider';
import { ErrorState, LoadingState } from '../ui/states';
import { Text } from '../ui/Text';

export interface Page<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Infinite list over a v1 paginated endpoint: pages load as the user scrolls,
 * using the server's pagination metadata (never the whole tenant dataset).
 * Keys are organization-scoped through useQueryKey.
 */
export function usePagedQuery<T>(
  key: QueryKeyPart[],
  fetchPage: (page: number) => Promise<Page<T>>,
  enabled = true,
) {
  const scoped = useQueryKey();
  const query = useInfiniteQuery({
    queryKey: scoped(...key, 'paged'),
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    enabled,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.pagination.total;
  return { ...query, items, total };
}

type PagedQuery<T> = ReturnType<typeof usePagedQuery<T>>;

/** FlatList with pull-to-refresh, load-more, and standard loading/empty/error states. */
export function PagedList<T>({
  query,
  renderItem,
  keyExtractor,
  empty,
  header,
}: {
  query: PagedQuery<T>;
  renderItem: (item: T) => ReactElement;
  keyExtractor: (item: T) => string | number;
  empty: ReactElement;
  header?: ReactElement;
}) {
  const c = useColors();
  if (query.isPending) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <LoadingState />
      </View>
    );
  }
  if (query.isError && query.items.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </View>
    );
  }
  return (
    <FlatList
      testID="paged-list"
      data={query.items}
      keyExtractor={(item) => String(keyExtractor(item))}
      renderItem={({ item }) => renderItem(item)}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: c.border }]} />
      )}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
          tintColor={c.primary}
        />
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <ActivityIndicator
            style={{ padding: 16 }}
            color={c.primary}
            accessibilityLabel="Loading more"
          />
        ) : query.isError ? (
          <Text color="danger" style={{ padding: 16, textAlign: 'center' }}>
            Could not load more. Pull to refresh.
          </Text>
        ) : null
      }
      contentContainerStyle={query.items.length === 0 ? { flexGrow: 1 } : { paddingBottom: 32 }}
    />
  );
}

/** A tappable list row: title, subtitle, optional leading and trailing content. */
export function ListRow({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  onPress,
  accessibilityHint,
}: {
  title: string;
  subtitle?: string | null | undefined;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  const c = useColors();
  const content = (
    <>
      {leading}
      <View style={styles.rowBody}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {typeof meta === 'string' || typeof meta === 'number' ? (
          meta === '' ? null : (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {meta}
            </Text>
          )
        ) : (
          (meta ?? null)
        )}
      </View>
      {trailing}
      {onPress ? <Feather name="chevron-right" size={18} color={c.muted} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.surfaceMuted : c.surface },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, { backgroundColor: c.surface }]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowBody: { flex: 1, gap: 3 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
