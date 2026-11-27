import type { Metadata } from 'next';
import Link from 'next/link';
import { palletReports } from '@/lib/admin/reports';
import { money } from '@/lib/store';

export const metadata: Metadata = { title: 'Pallets' };

export default async function PalletsPage() {
  const pallets = await palletReports();
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Pallets</h1>
        <Link href="/admin/pallets/new" className="flex h-11 items-center rounded-lg bg-gold px-4 font-semibold text-ground hover:bg-gold-soft">Add a pallet</Link>
      </div>
      <p className="mt-1 text-sm text-muted">What each pallet cost and what its items have brought in so far. Pick the pallet when you list an item to track it here.</p>
      {pallets.length === 0 ? <p className="mt-6 text-muted">No pallets yet.</p> : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {pallets.map((p) => {
            const net = p.revenue - p.fees - p.total_cost;
            const covered = p.total_cost ? Math.round(((p.revenue - p.fees) / p.total_cost) * 100) : null;
            return (
              <li key={p.id}>
                <Link href={`/admin/pallets/${p.id}`} className="block rounded-xl border border-line p-4 hover:border-gold/70">
                  <p className="font-semibold">{p.label}</p>
                  <p className="text-xs text-muted">{p.supplier ?? 'No supplier'}{p.purchased_on ? ` · bought ${p.purchased_on.toLocaleDateString('en-US')}` : ''}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-muted">Cost</dt><dd className="tabular-nums">{money(p.total_cost)}</dd></div>
                    <div><dt className="text-xs text-muted">Sold</dt><dd className="tabular-nums">{money(p.revenue)}</dd></div>
                    <div><dt className="text-xs text-muted">{net >= 0 ? 'Profit so far' : 'Still to earn'}</dt><dd className={`tabular-nums ${net >= 0 ? 'text-gold-soft' : ''}`}>{money(Math.abs(net))}</dd></div>
                  </dl>
                  <p className="mt-2 text-xs text-muted">{p.units_sold} of {p.units_listed} units sold · {p.units_left} left{covered != null ? ` · ${covered}% of cost covered` : ''}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
