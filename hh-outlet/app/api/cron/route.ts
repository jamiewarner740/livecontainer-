import { timingSafeEqual } from 'node:crypto';
import { runJobs } from '@/lib/worker';

// For hosts with scheduled requests instead of a worker process: call every minute with
// `Authorization: Bearer <CRON_SECRET>`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response('Unauthorized', { status: 401 });
  const done = await runJobs(25);
  return Response.json({ ran: done.length, failed: done.filter((d) => !d.ok).length });
}
