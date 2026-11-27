import type { Metadata } from 'next';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { account, ebayConfig } from '@/lib/ebay/client';
import { listPolicies } from '@/lib/ebay/sync';
import { disconnectEbayAction, republishAction, resolveOversellAction, retryJobAction } from '../../actions';
import { EbaySettingsForm, ImportForm } from './forms';

export const metadata: Metadata = { title: 'eBay' };

const statusLabel: Record<string, string> = { queued: 'Waiting', publishing: 'Sending', published: 'Live on eBay', needs_info: 'Needs details', failed: 'Failed', withdrawn: 'Not on eBay' };

export default async function EbayPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const staff = await requireStaff();
  const { msg } = await searchParams;
  const cfg = ebayConfig();
  const a = await account();
  const connected = !!a?.connected_at;
  let policies: Awaited<ReturnType<typeof listPolicies>> | null = null;
  let policyError: string | null = null;
  if (connected) policies = await listPolicies().catch((e) => { policyError = (e as Error).message; return null; });

  const listings = await sql<{ product_id: number; name: string; status: string; listing_id: string | null; last_error: string | null; quantity: number | null; synced_at: Date | null }[]>`
    select el.product_id, p.name, el.status, el.listing_id, el.last_error, el.quantity, el.synced_at
    from ebay_listings el join products p on p.id = el.product_id
    order by (el.status in ('needs_info','failed')) desc, el.synced_at desc nulls last limit 200`;
  const jobs = await sql<{ id: number; kind: string; status: string; attempts: number; last_error: string | null; updated_at: Date; product: string | null }[]>`
    select j.id, j.kind, j.status, j.attempts, j.last_error, j.updated_at, p.name as product
    from jobs j left join products p on p.id = (j.payload->>'productId')::int
    where j.status <> 'completed' or j.updated_at > now() - interval '1 day' order by j.updated_at desc limit 50`;
  const oversells = await sql<{ id: number; name: string; wanted: number; had: number; number: string | null; created_at: Date }[]>`
    select o.id, p.name, o.wanted, o.had, ord.number::text, o.created_at from oversells o join products p on p.id = o.product_id left join orders ord on ord.id = o.order_id
    where not o.resolved order by o.created_at desc`;

  const steps = [
    { done: cfg.configured, text: 'eBay developer keys added to the server settings (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RUNAME, APP_SECRET).' },
    { done: connected, text: 'eBay account connected.' },
    { done: !!(a?.fulfillment_policy_id && a.payment_policy_id && a.return_policy_id), text: 'Shipping, payment and return policies chosen.' },
    { done: !!a?.location_key, text: 'Ship-from location set.' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">eBay</h1>
        <p className="text-sm text-muted">{cfg.production ? 'Connected to the live eBay site.' : 'Sandbox mode: listings go to eBay’s test site, not the real store.'}</p>
      </div>
      {msg && <p role="status" className="rounded-lg border border-gold/60 bg-gold/10 p-3 text-sm text-gold-soft">{msg}</p>}

      <section aria-labelledby="setup">
        <h2 id="setup" className="font-semibold">Setup</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {steps.map((s, i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className={s.done ? 'text-gold' : 'text-muted'}>{s.done ? '✓' : '○'}</span><span className={s.done ? '' : 'text-muted'}>{s.text}</span></li>)}
        </ol>
        {cfg.configured && staff.role === 'owner' && (
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/admin/ebay/connect" className="flex h-11 items-center rounded-lg bg-gold px-4 font-semibold text-ground hover:bg-gold-soft">{connected ? 'Reconnect eBay' : 'Connect eBay'}</a>
            {connected && <form action={disconnectEbayAction}><button className="h-11 rounded-lg border border-line px-4 hover:border-gold">Disconnect</button></form>}
          </div>
        )}
        {a?.refresh_expires_at && <p className="mt-2 text-xs text-muted">eBay asks for a fresh sign-in by {a.refresh_expires_at.toLocaleDateString('en-US')}.</p>}
      </section>

      {connected && staff.role === 'owner' && (
        <section aria-labelledby="settings">
          <h2 id="settings" className="mb-2 font-semibold">Settings</h2>
          {policyError && <p className="mb-2 rounded-lg border border-red-400/60 bg-red-400/10 p-3 text-sm text-red-200">Could not load your eBay policies: {policyError}</p>}
          <EbaySettingsForm account={a!} policies={policies} />
        </section>
      )}

      {oversells.length > 0 && (
        <section aria-labelledby="over" className="rounded-xl border border-red-400/60 p-4">
          <h2 id="over" className="font-semibold text-red-200">Sold on both channels at once</h2>
          <p className="text-sm text-muted">eBay sold more than was left here. Contact the eBay buyer, then mark it handled.</p>
          <ul className="mt-2 space-y-2 text-sm">
            {oversells.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2"><span>{o.name}: eBay order {o.number} wanted {o.wanted}, only {o.had} left</span><form action={resolveOversellAction.bind(null, o.id)}><button className="h-9 rounded border border-line px-3">Mark handled</button></form></li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby="lst">
        <h2 id="lst" className="font-semibold">Listings</h2>
        {listings.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing sent to eBay yet. Tick “eBay” when you list an item, or use “List on eBay” in Stock.</p> : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
            {listings.map((l) => (
              <li key={l.product_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="min-w-0"><Link href={`/admin/products/${l.product_id}`} className="hover:text-gold-soft">{l.name}</Link>
                  <span className="block text-xs text-muted">{statusLabel[l.status] ?? l.status}{l.listing_id ? ` · item ${l.listing_id}` : ''}{l.quantity != null ? ` · ${l.quantity} listed` : ''}</span>
                  {l.last_error && <span className="block text-xs text-red-300">{l.last_error}</span>}
                </span>
                {['needs_info', 'failed'].includes(l.status) && <form action={republishAction.bind(null, l.product_id)}><button className="h-9 rounded border border-line px-3">Try again</button></form>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="jobs">
        <h2 id="jobs" className="font-semibold">Background tasks</h2>
        {jobs.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing running.</p> : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="min-w-0">{j.kind.replace('ebay.', '').replace('_', ' ')}{j.product ? ` · ${j.product}` : ''}
                  <span className="block text-xs text-muted">{j.status === 'attention' ? 'Needs you' : j.status} · try {j.attempts} · {j.updated_at.toLocaleString('en-US', { timeStyle: 'short', dateStyle: 'short' })}</span>
                  {j.last_error && <span className="block text-xs text-red-300">{j.last_error}</span>}
                </span>
                {['failed', 'attention'].includes(j.status) && <form action={retryJobAction.bind(null, j.id)}><button className="h-9 rounded border border-line px-3">Retry</button></form>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {connected && staff.role === 'owner' && (
        <section aria-labelledby="imp">
          <h2 id="imp" className="font-semibold">Bring in listings you made on eBay</h2>
          <p className="text-sm text-muted">Paste their item numbers. eBay moves each one to the system that lets this site manage it, then it appears here as a draft to check. eBay can refuse some (for example, auctions or listings with variations); you will see why.</p>
          <ImportForm />
        </section>
      )}
    </div>
  );
}
