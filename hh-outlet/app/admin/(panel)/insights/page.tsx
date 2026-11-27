import type { Metadata } from 'next';
import Link from 'next/link';
import { categoryPerformance, lowExposure, searchInsights, viewedNotBought } from '@/lib/admin/reports';
import { getCategory, money } from '@/lib/store';

export const metadata: Metadata = { title: 'Insights' };

export default async function Insights() {
  const [low, viewed, search, cats] = await Promise.all([lowExposure(), viewedNotBought(), searchInsights(), categoryPerformance()]);
  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold">Insights</h1>

      <section aria-labelledby="missed">
        <h2 id="missed" className="font-semibold">What shoppers searched for and didn&apos;t find</h2>
        <p className="text-sm text-muted">Last 60 days. Useful when choosing the next pallet.</p>
        {search.missed.length ? <ul className="mt-2 flex flex-wrap gap-2">{search.missed.map((m) => <li key={m.q} className="rounded-full border border-line px-3 py-1 text-sm">{m.q} <span className="text-muted">×{m.times}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted">No missed searches yet.</p>}
      </section>

      <section aria-labelledby="cats">
        <h2 id="cats" className="font-semibold">Categories, last 30 days</h2>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
          {cats.map((c) => <li key={c.category} className="flex justify-between gap-3 p-3"><span>{getCategory(c.category)?.name ?? c.category}<span className="block text-xs text-muted">{c.in_stock} in stock{c.avg_days_to_sell != null ? ` · sells in ${c.avg_days_to_sell} days on average` : ''}</span></span><span className="tabular-nums">{c.sold_30d} sold · {money(c.revenue_30d)}</span></li>)}
        </ul>
      </section>

      <section aria-labelledby="low">
        <h2 id="low" className="font-semibold">Items shoppers aren&apos;t seeing</h2>
        <p className="text-sm text-muted">In stock for over a week with the fewest views in 30 days. Better photos, a clearer name or a lower price can help.</p>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
          {low.map((p) => <li key={p.id}><Link href={`/admin/products/${p.id}`} className="flex justify-between gap-3 p-3 hover:bg-surface"><span>{p.name}<span className="block text-xs text-muted">{p.impressions} times in a grid · {p.views} views · {p.age_days} days</span></span><span className="tabular-nums">{money(p.price_cents)}</span></Link></li>)}
          {!low.length && <li className="p-3 text-muted">Nothing yet. This fills in once items are a week old.</li>}
        </ul>
      </section>

      <section aria-labelledby="vnb">
        <h2 id="vnb" className="font-semibold">Viewed often, not selling</h2>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
          {viewed.map((p) => <li key={p.id}><Link href={`/admin/products/${p.id}`} className="flex justify-between gap-3 p-3 hover:bg-surface"><span>{p.name}<span className="block text-xs text-muted">{p.views} views · {p.adds} added to bag · {p.sold} sold</span></span><span className="tabular-nums">{money(p.price_cents)}</span></Link></li>)}
          {!viewed.length && <li className="p-3 text-muted">Nothing yet. An item shows here after 5 views in 30 days.</li>}
        </ul>
      </section>

      <section aria-labelledby="top">
        <h2 id="top" className="font-semibold">Most searched</h2>
        {search.top.length ? <ul className="mt-2 flex flex-wrap gap-2">{search.top.map((m) => <li key={m.q} className="rounded-full border border-line px-3 py-1 text-sm">{m.q} <span className="text-muted">×{m.times}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted">No searches yet.</p>}
      </section>
    </div>
  );
}
