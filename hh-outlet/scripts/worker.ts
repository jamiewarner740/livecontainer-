// Background worker: `npm run worker`. Runs queued jobs every 15 seconds and checks eBay for new orders every 5 minutes.
// On hosts without long-running processes, call GET /api/cron with the CRON_SECRET header from a scheduler instead.
import { runJobs } from '../lib/worker';

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
while (!stopping) {
  try {
    const done = await runJobs();
    for (const d of done) console.log(new Date().toISOString(), d.kind, d.ok ? 'ok' : `failed: ${d.error}`);
  } catch (e) {
    console.error('worker error', e);
  }
  await new Promise((r) => setTimeout(r, 15000));
}
process.exit(0);
