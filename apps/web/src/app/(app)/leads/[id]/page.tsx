import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RequirePermission } from '@/components/auth/PermissionGate';
import { LeadDetailScreen } from '@/modules/leads/LeadDetailScreen';

export const metadata: Metadata = { title: 'Lead' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId) || leadId <= 0) notFound();
  return (
    <RequirePermission permission="crm.leads.read">
      <LeadDetailScreen id={leadId} />
    </RequirePermission>
  );
}
