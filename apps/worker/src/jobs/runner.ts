import { ZodError } from 'zod';
import { errorInfo } from '../logger.js';
import { jobDuration, jobFailures, jobRetries } from '../metrics.js';
import * as communications from '../processors/communications.js';
import * as maintenance from '../processors/maintenance.js';
import * as notifications from '../processors/notifications.js';
import * as webhooks from '../processors/webhooks.js';
import { PermanentJobError, type JobRunner, type RunningJob } from '../queue/types.js';
import type { JobContext, WorkerDeps } from './context.js';
import { isJobName, parseJob, type JobName, type JobPayload } from './definitions.js';

type Handler<N extends JobName> = (
  deps: WorkerDeps,
  payload: JobPayload<N>,
  ctx: JobContext,
) => Promise<void>;

/** Every job name maps to exactly one processor (checked by the compiler). */
export const HANDLERS: { [N in JobName]: Handler<N> } = {
  'message.send': communications.sendMessage,
  'email.password_reset': communications.sendPasswordReset,
  'email.member_invitation': communications.sendMemberInvitation,
  'notification.event': (deps, payload) => notifications.notifyFromEvent(deps, payload),
  'webhook.fanout': (deps, payload) => webhooks.fanOut(deps, payload),
  'webhook.deliver': webhooks.deliver,
  'file.delete_object': maintenance.deleteFileObject,
  'reminders.scan': (deps) => notifications.scanReminders(deps),
  'maintenance.sweep': async (deps) => {
    await maintenance.sweep(deps);
  },
};

/**
 * Validates and runs one job with structured observability: job id, queue
 * job name, organization, entity ids, attempt, duration, outcome and a safe
 * error code. Payloads are parsed (never evaluated); invalid ones fail
 * permanently.
 */
export function createJobRunner(deps: WorkerDeps): JobRunner {
  return async (job: RunningJob) => {
    const started = Date.now();
    const base = {
      jobId: job.id,
      job: job.name,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
    };
    if (!isJobName(job.name)) {
      deps.logger.error('job_unknown', base);
      throw new PermanentJobError(`Unknown job ${job.name}`, 'UNKNOWN_JOB');
    }
    let payload: JobPayload<JobName>;
    try {
      payload = parseJob(job.name, job.data);
    } catch (error) {
      deps.logger.error('job_invalid_payload', {
        ...base,
        issues: error instanceof ZodError ? error.issues.map((i) => i.path.join('.')) : undefined,
      });
      throw new PermanentJobError('Invalid job payload', 'INVALID_PAYLOAD');
    }
    const fields = { ...base, ...payload };
    const ctx: JobContext = {
      id: job.id,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      finalAttempt: job.attempt >= job.maxAttempts,
    };
    try {
      await (HANDLERS[job.name] as Handler<JobName>)(deps, payload, ctx);
      jobDuration.observe({ job_name: job.name, result: 'ok' }, (Date.now() - started) / 1000);
      deps.logger.info('job_completed', {
        ...fields,
        durationMs: Date.now() - started,
        result: 'ok',
      });
    } catch (error) {
      const permanent = error instanceof PermanentJobError;
      const terminal = permanent || ctx.finalAttempt;
      jobDuration.observe(
        { job_name: job.name, result: terminal ? 'failed' : 'retry' },
        (Date.now() - started) / 1000,
      );
      if (terminal) jobFailures.inc({ job_name: job.name });
      else jobRetries.inc({ job_name: job.name });
      deps.logger[permanent || ctx.finalAttempt ? 'error' : 'warn']('job_failed', {
        ...fields,
        durationMs: Date.now() - started,
        result: permanent ? 'failed_permanent' : ctx.finalAttempt ? 'failed_final' : 'retrying',
        code: permanent ? error.code : undefined,
        ...errorInfo(error),
      });
      throw error;
    }
  };
}
