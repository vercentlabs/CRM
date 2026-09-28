'use client';

import type { ReportPeriod } from '@crm/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useQueryKey, useSession } from '@/providers/SessionProvider';

export function useDashboardSummary() {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('reports', 'summary'),
    queryFn: () => api().v1.reports.dashboardSummary(),
    enabled: can('crm.reports.read'),
  });
}

export function useLeadsOverTime(period: ReportPeriod) {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('reports', 'over-time', period),
    queryFn: () => api().v1.reports.leadsOverTime({ period }),
    enabled: can('crm.reports.read'),
    placeholderData: keepPreviousData,
  });
}

export function useConversion(query: { days?: number; user_id?: number }) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('reports', 'conversion', query),
    queryFn: () => api().v1.reports.conversion(query),
    placeholderData: keepPreviousData,
  });
}

export function useLeadAging() {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('reports', 'aging'),
    queryFn: () => api().v1.reports.leadAging(),
  });
}

/** Team performance (organization-wide report scope only). */
export function useSalesPerformance(query: { days: number; user_id?: number }, enabled = true) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('reports', 'performance', query),
    queryFn: () => api().v1.reports.salesPerformance(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}
