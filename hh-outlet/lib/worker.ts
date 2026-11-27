import { claimJob, enqueue, failJob, finishJob, type Job } from './jobs';
import { EbayError, ebayConfig } from './ebay/client';
import { publishProduct, reportShipment, syncOrders, syncQuantity, withdrawProduct } from './ebay/sync';
import { sql } from './db';

async function run(job: Job) {
  const id = Number(job.payload.productId);
  switch (job.kind) {
    case 'ebay.publish': return publishProduct(id);
    case 'ebay.sync_quantity': return syncQuantity(id);
    case 'ebay.withdraw': return withdrawProduct(id);
    case 'ebay.sync_orders': return job.payload.shipOrder ? reportShipment(String(job.payload.shipOrder)) : syncOrders();
    default: throw new EbayError(`Unknown job ${job.kind}`, 400, true);
  }
}

/**
 * Runs up to `max` ready jobs and schedules the 5-minute eBay order check. Safe to run from several places at once:
 * jobs are claimed with SKIP LOCKED. eBay jobs wait (they stay queued) until eBay is set up.
 */
export async function runJobs(max = 20) {
  const done: { id: number; kind: string; ok: boolean; error?: string }[] = [];
  const ebayReady = ebayConfig().configured;
  if (ebayReady) {
    const [a] = await sql<{ connected: boolean; due: boolean }[]>`
      select connected_at is not null as connected, coalesce(last_order_sync_at < now() - interval '5 minutes', true) as due from ebay_account where id = 1`;
    if (a?.connected && a.due) await enqueue('ebay.sync_orders', {}, { dedupeKey: 'ebay.sync_orders' });
  }
  for (let i = 0; i < max; i++) {
    const job = await claimJob();
    if (!job) break;
    if (job.kind.startsWith('ebay.') && !ebayReady) {
      await sql`update jobs set status = 'queued', attempts = attempts - 1, run_after = now() + interval '1 hour' where id = ${job.id}`;
      continue;
    }
    try {
      await run(job);
      await finishJob(job.id);
      done.push({ id: job.id, kind: job.kind, ok: true });
    } catch (e) {
      const needsOwner = e instanceof EbayError && e.needsOwner;
      await failJob(job, (e as Error).message, needsOwner);
      done.push({ id: job.id, kind: job.kind, ok: false, error: (e as Error).message });
    }
  }
  return done;
}
