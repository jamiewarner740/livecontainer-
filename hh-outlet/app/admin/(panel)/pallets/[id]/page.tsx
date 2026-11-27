import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { palletReports } from '@/lib/admin/reports';
import { money } from '@/lib/store';
import { PalletForm, type PalletValues } from '../PalletForm';

export const metadata: Metadata = { title: 'Pallet' };

export default async function PalletPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) notFound();
  const [v] = await sql<PalletValues[]>`select label, supplier, to_char(purchased_on, 'YYYY-MM-DD') as purchased_on, cost_cents, freight_cents, other_cents, manifest_retail_cents, notes from pallets where id = ${id}`;
  if (!v) notFound();
  const [r] = await palletReports(id);
  const items = await sql<{ id: number; name: string; stock: number; price_cents: number; status: string; sold: number }[]>`
    select p.id, p.name, p.stock, p.price_cents, p.status,
           coalesce((select sum(oi.qty) from order_items oi join orders o on o.id = oi.order_id where oi.product_id = p.id and o.status = 'paid'), 0)::int as sold
    from products p where p.pallet_id = ${id} order by p.added_at desc`;
  const net = r.revenue - r.fees - r.total_cost;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pallets" className="text-sm text-muted hover:text-gold-soft">← Pallets</Link>
        <h1 className="mt-1 font-display text-2xl font-semibold">{v.label}</h1>
      </div>
      <section aria-labelledby="money" className="rounded-xl border border-line p-4">
        <h2 id="money" className="font-semibold">Money in and out</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-muted">Total cost</dt><dd className="text-lg tabular-nums">{money(r.total_cost)}</dd></div>
          <div><dt className="text-muted">Sold so far</dt><dd className="text-lg tabular-nums">{money(r.revenue)}</dd></div>
          <div><dt className="text-muted">Marketplace fees</dt><dd className="text-lg tabular-nums">{money(r.fees)}</dd></div>
          <div><dt className="text-muted">{net >= 0 ? 'Profit so far' : 'Still to earn back'}</dt><dd className={`text-lg tabular-nums ${net >= 0 ? 'text-gold-soft' : ''}`}>{money(Math.abs(net))}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-muted">
          {r.units_sold} of {r.units_listed} units sold ({r.sold_web} online, {r.sold_store} in store, {r.sold_ebay} on eBay) · {r.units_left} left.
          {' '}If the rest sells at today&apos;s prices it would bring about {money(r.left_value)} more (an estimate).
          {r.refunded > 0 && ` ${money(r.refunded)} was refunded.`}
        </p>
      </section>
      <section aria-labelledby="its">
        <h2 id="its" className="font-semibold">Items from this pallet</h2>
        {items.length === 0 ? <p className="mt-2 text-sm text-muted">None yet. Choose this pallet under “More details” when you list an item.</p> : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
            {items.map((i) => (
              <li key={i.id}><Link href={`/admin/products/${i.id}`} className="flex justify-between gap-3 p-3 hover:bg-surface"><span>{i.name}<span className="block text-xs text-muted">{i.sold} sold · {i.stock} left · {i.status}</span></span><span className="tabular-nums">{money(i.price_cents)}</span></Link></li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="ed"><h2 id="ed" className="mb-3 font-semibold">Details</h2><PalletForm id={id} v={v} /></section>
    </div>
  );
}
