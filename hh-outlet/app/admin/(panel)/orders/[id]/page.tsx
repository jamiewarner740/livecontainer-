import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/auth';
import { money } from '@/lib/store';
import { stepLabel } from '@/lib/admin/labels';
import { FulfillButtons, RefundForm } from './OrderActions';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [o] = await sql<{ id: string; number: string; channel: string; status: string; fulfillment: string; fulfillment_status: string; name: string | null; email: string | null; phone: string | null;
    ship_address1: string | null; ship_address2: string | null; ship_city: string | null; ship_state: string | null; ship_zip: string | null; subtotal_cents: number; shipping_cents: number; tax_cents: number;
    total_cents: number; payment_method: string | null; payment_provider: string | null; tracking_carrier: string | null; tracking_number: string | null; notes: string | null; created_at: Date; external_id: string | null }[]>`
    select *, number::text from orders where id = ${id}`;
  if (!o) notFound();
  const items = await sql<{ product_id: number; name: string; price_cents: number; qty: number; location: string | null; sku: string | null }[]>`
    select oi.product_id, oi.name, oi.price_cents, oi.qty, p.location, p.sku from order_items oi join products p on p.id = oi.product_id where oi.order_id = ${id}`;
  const history = await sql<{ action: string; created_at: Date; staff: string | null }[]>`
    select a.action, a.created_at, s.name as staff from audit_log a left join staff s on s.id = a.staff_id where a.entity = 'order' and a.entity_id = ${id} order by a.created_at`;
  const staff = await currentStaff();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="text-sm text-muted hover:text-gold-soft">← Orders</Link>
        <h1 className="mt-1 font-display text-2xl font-semibold">Order {o.number}</h1>
        <p className="text-sm text-muted">
          {o.channel === 'web' ? 'Website' : o.channel === 'store' ? 'In store' : `eBay ${o.external_id ?? ''}`} · {o.created_at.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
          {o.status === 'paid' ? stepLabel[o.fulfillment_status] : o.status.replace('_', ' ')}
        </p>
      </div>
      <section aria-labelledby="items">
        <h2 id="items" className="font-semibold">Items to pull</h2>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {items.map((i) => (
            <li key={i.product_id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span><Link href={`/admin/products/${i.product_id}`} className="hover:text-gold-soft">{i.qty} × {i.name}</Link><span className="block text-xs text-muted">{i.sku}{i.location ? ` · shelf ${i.location}` : ' · no shelf recorded'}</span></span>
              <span className="tabular-nums">{money(i.price_cents * i.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money(o.subtotal_cents)}</dd></div>
          {o.fulfillment === 'ship' && <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd>{o.shipping_cents ? money(o.shipping_cents) : 'Free'}</dd></div>}
          {o.tax_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{money(o.tax_cents)}</dd></div>}
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{money(o.total_cents)}</dd></div>
          <div className="flex justify-between text-muted"><dt>Paid with</dt><dd>{o.payment_method ?? o.payment_provider ?? '—'}</dd></div>
        </dl>
      </section>
      {(o.name || o.email) && (
        <section aria-labelledby="buyer" className="text-sm">
          <h2 id="buyer" className="font-semibold">Buyer</h2>
          <p className="mt-1">{o.name}{o.email ? ` · ${o.email}` : ''}{o.phone ? ` · ${o.phone}` : ''}</p>
          {o.fulfillment === 'ship' && <address className="mt-1 not-italic">{o.ship_address1}{o.ship_address2 ? `, ${o.ship_address2}` : ''}<br />{o.ship_city}, {o.ship_state} {o.ship_zip}</address>}
          {o.tracking_number && <p className="mt-1">Tracking: {o.tracking_carrier} {o.tracking_number}</p>}
        </section>
      )}
      {o.status === 'paid' && o.fulfillment !== 'in_store' && <FulfillButtons orderId={o.id} fulfillment={o.fulfillment} step={o.fulfillment_status} />}
      {o.status === 'paid' && o.channel !== 'ebay' && staff?.role === 'owner' && <RefundForm orderId={o.id} total={money(o.total_cents)} />}
      {history.length > 0 && (
        <section aria-labelledby="hist" className="text-sm">
          <h2 id="hist" className="font-semibold">History</h2>
          <ul className="mt-1 space-y-1 text-muted">{history.map((h, i) => <li key={i}>{h.action.replace('order.', '').replace('sale.', 'sale ')} · {h.staff ?? 'system'} · {h.created_at.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
