'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * List state (page, sort, search, filters) kept in the URL so a view can be
 * refreshed, shared and navigated back to. Only the given keys are managed;
 * values are strings (empty = removed). Changing anything but `page` resets
 * paging to 1.
 */
export function useListParams<K extends string>(
  keys: readonly K[],
  defaults: Partial<Record<K | 'page' | 'sort', string>> = {},
) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const params = useMemo(() => {
    const values = {} as Record<K | 'page' | 'sort', string>;
    for (const key of [...keys, 'page', 'sort'] as Array<K | 'page' | 'sort'>) {
      values[key] = search.get(key) ?? defaults[key] ?? '';
    }
    return values;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults are static per screen
  }, [search, keys]);

  const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1);

  const setParams = useCallback(
    (changes: Partial<Record<K | 'page' | 'sort', string | number | null | undefined>>) => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      if (!('page' in changes)) next.delete('page');
      const query = next.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [search, router, pathname],
  );

  return { params, page, setParams };
}
