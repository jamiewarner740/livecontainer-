import { sql, type Db } from './db';

type Tx = Db;
export type JobKind = 'ebay.publish' | 'ebay.sync_quantity' | 'ebay.withdraw' | 'ebay.sync_orders' | 'ebay.import';

/**
 * Queues background work. A dedupe key collapses repeats while one is still waiting (ten stock changes to one
 * product make one eBay quantity update, not ten).
 */
export async function enqueue(kind: JobKind, payload: object, opts: { dedupeKey?: string; delaySeconds?: number; tx?: Tx } = {}) {
  const tx = opts.tx ?? sql;
  await tx`
    insert into jobs (kind, payload, dedupe_key, run_after)
    values (${kind}, ${tx.json(payload as never)}, ${opts.dedupeKey ?? null}, now() + make_interval(secs => ${opts.delaySeconds ?? 0}))
    on conflict (dedupe_key) where dedupe_key is not null and status in ('queued','processing') do nothing`;
}

export type Job = { id: number; kind: JobKind; payload: Record<string, unknown>; attempts: number; max_attempts: number };

/** Claims the next ready job; SKIP LOCKED lets several workers run without taking the same job. */
export async function claimJob(): Promise<Job | null> {
  const [j] = await sql<Job[]>`
    update jobs set status = 'processing', attempts = attempts + 1, updated_at = now()
    where id = (select id from jobs where status = 'queued' and run_after <= now() order by run_after, id for update skip locked limit 1)
    returning id, kind, payload, attempts, max_attempts`;
  return j ?? null;
}

export async function finishJob(id: number) {
  await sql`update jobs set status = 'completed', last_error = null, updated_at = now() where id = ${id}`;
}

/**
 * A failure is retried with a growing wait (1, 4, 9, 16 minutes ...) until max_attempts.
 * `needsOwner` failures (missing details, eBay policy problems) stop at once and wait for the owner.
 */
export async function failJob(job: Job, error: string, needsOwner = false) {
  const giveUp = needsOwner || job.attempts >= job.max_attempts;
  await sql`
    update jobs set status = ${giveUp ? (needsOwner ? 'attention' : 'failed') : 'queued'}, last_error = ${error.slice(0, 2000)},
      run_after = now() + make_interval(mins => ${job.attempts * job.attempts}), updated_at = now()
    where id = ${job.id}`;
}

export async function retryJob(id: number) {
  await sql`update jobs set status = 'queued', run_after = now(), attempts = 0, updated_at = now() where id = ${id} and status in ('failed','attention')`;
}
