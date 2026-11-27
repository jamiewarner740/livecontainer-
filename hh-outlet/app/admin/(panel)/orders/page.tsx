import type { Metadata } from 'next';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { money } from '@/lib/store';
import { channelLabel, stepLabel } from '@/lib/admin/labels';

export const metadata: Metadata = { title: 'Orders' };

const filters = [
  { value: 'todo', label: 'To fulfill' }, { value: 'all', label: 'All paid' }, { value: 'web', label: 'Website' },
  { value: 'store', label: 'In store' }, { value: 'ebay', label: 'eBay' }, { value: 'refunded', label: 'Refunded' }, { value: 'unpaid', label: 'Not paid' },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = 'todo' } = await searchParams;
  const rows = await sql<{ id: string; number: string; channel: string; status: string; fulfillment: string; fulfillment_status: string; name: string | null; total_cents: number; created_at: Date; items: number }[]>`
    select o.id, o.number::text, o.channel, o.status, o.fulfillment, o.fulfillment_status, o.name, o.total_cents, o.created_at,
           (select coalesce(sum(qty), 0) from order_items where order_id = o.id)::int as items
    from orders o
    where ${f === 'todo' ? sql`o.status = 'paid' and o.fulfillment_status in ('unfulfilled','ready') and o.fulfillment <> 'in_store'`
      : f === 'refunded' ? sql`o.status = 'cancelled'`
      : f === 'unpaid' ? sql`o.status in ('pending_payment','expired')`
      : ['web', 'store', 'ebay'].includes(f) ? sql`o.status = 'paid' and o.channel = ${f}`
      : sql`o.status = 'paid'`}
    order by o.created_at desc limit 200`;
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Orders</h1>
      <nav aria-label="Filter" className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
        {filters.map((x) => <Link key={x.value} href={`/admin/orders?f=${x.value}`} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${f === x.value ? 'border-gold bg-gold font-semibold text-ground' : 'border-line'}`}>{x.label}</Link>)}
      </nav>
      {rows.length === 0 ? <p className="mt-6 text-muted">{f === 'todo' ? 'Nothing to pack or hand over right now.' : 'No orders here.'}</p> : (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 p-3 hover:bg-surface">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">Order {o.number} · {channelLabel[o.channel]}{o.name ? ` · ${o.name}` : ''}</span>
                  <span className="block text-xs text-muted">{o.items} {o.items === 1 ? 'item' : 'items'} · {o.fulfillment === 'ship' ? 'Ship' : o.fulfillment === 'pickup' ? 'Pickup' : 'Counter'} · {o.status === 'paid' ? stepLabel[o.fulfillment_status] : o.status.replace('_', ' ')} · {o.created_at.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </span>
                <span className="font-semibold tabular-nums">{money(o.total_cents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
