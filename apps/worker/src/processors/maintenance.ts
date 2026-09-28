import { isProviderError, safeMessage } from '@crm/integrations';
import * as store from '../db/files-webhooks.js';
import { prune } from '../db/outbox.js';
import type { JobContext, WorkerDeps } from '../jobs/context.js';
import { jobId, type JobPayload } from '../jobs/definitions.js';
import { PermanentJobError } from '../queue/types.js';

/**
 * Removes the provider object of a deleted file. Metadata was already marked
 * deleted by the API (so nothing references the object as healthy); this
 * step is idempotent and retried until the provider confirms.
 */
export async function deleteFileObject(
  deps: WorkerDeps,
  job: JobPayload<'file.delete_object'>,
  _ctx: JobContext,
) {
  const file = await store.pendingProviderDeletion(deps.db, job.organizationId, job.fileId);
  if (!file) return;
  if (file.provider !== deps.storage.provider) {
    if (file.provider === 'memory') {
      // In-process development storage does not survive restarts: nothing to delete.
      await store.markProviderDeleted(deps.db, job.organizationId, job.fileId);
      return;
    }
    throw new PermanentJobError(`No adapter for provider ${file.provider}`, 'PROVIDER_MISMATCH');
  }
  try {
    await deps.storage.delete(file.provider_file_id);
  } catch (error) {
    if (isProviderError(error) && error.permanent) {
      throw new PermanentJobError(safeMessage(error), error.code);
    }
    throw error;
  }
  await store.markProviderDeleted(deps.db, job.organizationId, job.fileId);
}

/**
 * Periodic housekeeping: expire unattached uploads, re-queue provider
 * deletions whose jobs gave up, and prune processed outbox events.
 */
export async function sweep(deps: WorkerDeps) {
  const expired = await store.expireUnattachedUploads(deps.db);
  const hour = Math.floor(Date.now() / 3_600_000);
  const stale = await store.staleProviderDeletions(deps.db, 60);
  for (const file of stale) {
    await deps.queue.enqueue({
      name: 'file.delete_object',
      payload: { organizationId: file.organization_id, fileId: file.id },
      id: jobId('file.delete_object', file.id, 'retry', hour),
    });
  }
  const pruned = await prune(deps.db, deps.config.outboxRetentionDays);
  if (expired + stale.length + pruned > 0) {
    deps.logger.info('maintenance_sweep', {
      expiredUploads: expired,
      requeuedDeletions: stale.length,
      prunedEvents: pruned,
    });
  }
}
