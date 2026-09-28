'use client';

import type { Lead } from '@crm/types';
import { Combobox, Select, type ComboboxOption } from '@crm/ui';
import { useQuery } from '@tanstack/react-query';
import { forwardRef, useState, type SelectHTMLAttributes } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { api } from '@/lib/api';
import { useMemberOptions } from '@/modules/organization/hooks';
import { useQueryKey } from '@/providers/SessionProvider';

/** Assignee select over the organization's active members. */
export const MemberSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }
>(function MemberSelect({ placeholder = 'Unassigned', ...props }, ref) {
  const members = useMemberOptions();
  return (
    <Select
      ref={ref}
      placeholder={members.isPending ? 'Loading members…' : placeholder}
      options={members.data ?? []}
      {...props}
    />
  );
});

export const leadOption = (
  lead: Pick<Lead, 'id' | 'full_name' | 'mobile_number' | 'email'>,
): ComboboxOption => ({
  value: lead.id,
  label: lead.full_name,
  description: [lead.mobile_number, lead.email].filter(Boolean).join(' · '),
});

/** Searchable lead picker (only leads visible to the viewer are returned by the API). */
export function LeadPicker({
  value,
  onChange,
  ...rest
}: {
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  id?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [text, setText] = useState('');
  const search = useDebouncedValue(text.trim(), 250);
  const key = useQueryKey();
  const results = useQuery({
    queryKey: key('leads', 'picker', search),
    queryFn: () =>
      api().v1.leads.list({ limit: 10, sort: '-updated_at', ...(search ? { search } : {}) }),
    staleTime: 15_000,
  });
  return (
    <Combobox
      {...rest}
      value={value}
      onChange={onChange}
      onSearch={setText}
      loading={results.isFetching && !results.data}
      options={(results.data?.items ?? []).map(leadOption)}
      placeholder="Search leads by name, phone or email"
      emptyText={search ? 'No leads match' : 'No leads yet'}
    />
  );
}
