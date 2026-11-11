import { env } from '../../config/env.js';
import { processDueRetries } from '../whatsapp/whatsapp.service.js';
import { queueRenewalNotices } from '../billing/billing.service.js';
import { evaluateSubscription } from '../billing/entitlement.service.js';
import { TenantSubscription } from '../billing/billing.model.js';
import { BackgroundJob } from './job.model.js';

let timer: NodeJS.Timeout | null = null;

export async function enqueueJob(type: string, idempotencyKey: string, tenantId: string | null): Promise<{ created: boolean; status: string }> {
  try {
    const job = await BackgroundJob.create({
      type,
      idempotencyKey,
      tenantId,
      status: 'PENDING',
      nextRunAt: new Date(),
    });
    return { created: true, status: job.status };
  } catch (error) {
    const existing = await BackgroundJob.findOne({ idempotencyKey });
    if (!existing) {
      throw error;
    }
    return { created: false, status: existing.status };
  }
}

async function handle(type: string, tenantId: string | null): Promise<void> {
  if (type === 'whatsapp.retry') {
    await processDueRetries(tenantId ?? undefined);
    return;
  }
  if (type === 'subscription.reminders') {
    await queueRenewalNotices();
    const subscriptions = await TenantSubscription.find({ status: { $in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } }).select('tenantId').limit(100);
    for (const subscription of subscriptions) {
      await evaluateSubscription(String(subscription.tenantId));
    }
    return;
  }
  throw new Error('unknown_job');
}

export async function runDueJobs(): Promise<number> {
  const due = await BackgroundJob.find({
    status: { $in: ['PENDING', 'FAILED'] },
    nextRunAt: { $lte: new Date() },
  }).sort({ nextRunAt: 1 }).limit(20);
  let ran = 0;
  for (const job of due) {
    if (job.attempts >= job.maxAttempts) {
      continue;
    }
    const claimed = await BackgroundJob.updateOne({ _id: job._id, status: job.status }, { $set: { status: 'RUNNING' } });
    if (claimed.modifiedCount !== 1) {
      continue;
    }
    try {
      await handle(job.type, job.tenantId ? String(job.tenantId) : null);
      job.status = 'SUCCEEDED';
      job.lastError = '';
      ran += 1;
    } catch {
      job.attempts += 1;
      job.lastError = 'job_failed';
      job.status = job.attempts >= job.maxAttempts ? 'FAILED' : 'PENDING';
      job.nextRunAt = new Date(Date.now() + (env.nodeEnv === 'test' ? 0 : 60_000));
    }
    await job.save();
  }
  return ran;
}

export function startJobWorker(): void {
  if (env.nodeEnv === 'test' || timer) {
    return;
  }
  timer = setInterval(() => {
    void runDueJobs().catch(() => {
      console.error('[enzo] Background job run failed.');
    });
  }, 60_000);
  timer.unref();
}
