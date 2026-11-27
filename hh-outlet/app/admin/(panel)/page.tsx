import type { Metadata } from 'next';
import Link from 'next/link';
import { attentionCounts, inventorySummary, ordersToFulfill, recentlySold, salesSummary } from '@/lib/admin/reports';
import { channelLabel } from '@/lib/admin/labels';
import { money } from '@/lib/store';

export const metadata: Metadata = { title: 'Today' };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</div>;
}

export default async function Dashboard() {
  const [today, week, month, inv, todo, sold, attn] = await Promise.all([salesSummary(1), salesSummary(7), salesSummary(30), inventorySummary(), ordersToFulfill(), recentlySold(8), attentionCounts()]);
  const alerts = [
    todo.length && { href: '/admin/orders', text: `${todo.length} ${todo.length === 1 ? 'order' : 'orders'} to pack or hand over` },
    inv.drafts && { href: '/admin/products?status=draft', text: `${inv.drafts} ${inv.drafts === 1 ? 'draft' : 'drafts'} not published yet` },
    inv.no_condition && { href: '/admin/products?status=active', text: `${inv.no_condition} live ${inv.no_condition === 1 ? 'item has' : 'items have'} no condition set` },
    attn.ebay_needs_info && { href: '/admin/ebay', text: `${attn.ebay_needs_info} eBay ${attn.ebay_needs_info === 1 ? 'listing needs' : 'listings need'} details` },
    attn.failed_jobs && { href: '/admin/ebay', text: `${attn.failed_jobs} background ${attn.failed_jobs === 1 ? 'task' : 'tasks'} failed` },
    inv.aging90 && { href: '/admin/products?status=active&age=90', text: `${inv.aging90} ${inv.aging90 === 1 ? 'item has' : 'items have'} been in stock over 90 days` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Today</h1>
        <div className="flex gap-2"><Link href="/admin/list" className="flex h-11 items-center rounded-lg bg-gold px-4 font-semibold text-ground">List an item</Link><Link href="/admin/sell" className="flex h-11 items-center rounded-lg border border-line px-4">Sell</Link></div>
      </div>

      {alerts.length > 0 && (
        <section aria-labelledby="attn">
          <h2 id="attn" className="sr-only">Needs attention</h2>
          <ul className="space-y-2">{alerts.map((a) => <li key={a.href + a.text}><Link href={a.href} className="flex items-center justify-between rounded-lg border border-gold/50 bg-gold/5 p-3 text-sm hover:bg-gold/10"><span>{a.text}</span><span aria-hidden="true">→</span></Link></li>)}</ul>
        </section>
      )}

      <section aria-labelledby="sales">
        <h2 id="sales" className="mb-2 font-semibold">Sales</h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Today" value={money(today.total.revenue)} sub={`${today.total.units} items`} />
          <Stat label="7 days" value={money(week.total.revenue)} sub={`${week.total.units} items`} />
          <Stat label="30 days" value={money(month.total.revenue)} sub={`${month.total.units} items`} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          {(['web', 'store', 'ebay'] as const).map((c) => <div key={c} className="rounded-lg bg-surface p-2"><span className="text-xs text-muted">{channelLabel[c]}, 30 days</span><span className="block tabular-nums">{money(month[c].revenue)} · {month[c].units}</span></div>)}
        </div>
      </section>

      <section aria-labelledby="inv">
        <h2 id="inv" className="mb-2 font-semibold">Stock</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Live listings" value={String(inv.listings)} />
          <Stat label="Units on hand" value={String(inv.units)} />
          <Stat label="At listed prices" value={money(inv.value)} />
          <Stat label="Over 30 days old" value={String(inv.aging30)} sub={inv.aging30 ? 'Consider a price drop' : undefined} />
        </div>
      </section>

      <section aria-labelledby="sold">
        <h2 id="sold" className="mb-2 font-semibold">Just sold</h2>
        {sold.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {sold.map((s, i) => <li key={i} className="flex justify-between gap-3 p-3"><Link href={`/admin/products/${s.product_id}`} className="min-w-0 truncate hover:text-gold-soft">{s.qty} × {s.name}</Link><span className="shrink-0 text-muted">{channelLabel[s.channel]} · {money(s.price_cents * s.qty)}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
