import { randomBytes } from 'node:crypto';
import { sql } from '../db';
import { audit } from '../audit';
import { enqueueEbayQuantity } from './catalog';
import { refundPayment } from '../payments';
import type { Staff } from '../auth';

export class SaleError extends Error {
  constructor(message: string, public detail?: unknown) { super(message); }
}

export type SaleLine = { productId: number; qty: number; priceCents?: number };

/**
 * Records a sale made at the counter. Same safety as online checkout: product rows are locked and units held in
 * someone's online checkout are not sold twice. Stock goes down at once and eBay is told.
 * `priceCents` lets the owner give a counter price that differs from the listed one; each change is audited.
 */
export async function recordStoreSale(lines: SaleLine[], paymentMethod: 'cash' | 'card' | 'other', staff: Staff, note?: string) {
  const merged = new Map<number, SaleLine>();
  for (const l of lines) {
    if (!Number.isInteger(l.productId) || !Number.isInteger(l.qty) || l.qty < 1) continue;
    const prev = merged.get(l.productId);
    merged.set(l.productId, { productId: l.productId, qty: (prev?.qty ?? 0) + l.qty, priceCents: l.priceCents ?? prev?.priceCents });
  }
  const items = [...merged.values()].sort((a, b) => a.productId - b.productId);
  if (!items.length) throw new SaleError('Add at least one item.');

  return sql.begin(async (tx) => {
    const ids = items.map((i) => i.productId);
    const rows = await tx<{ id: number; name: string; price_cents: number; stock: number }[]>`
      select id, name, price_cents, stock from products where id = any(${ids}) order by id for update`;
    const held = await tx<{ product_id: number; qty: number }[]>`
      select product_id, sum(qty)::int as qty from reservations where product_id = any(${ids}) and status = 'active' and expires_at > now() group by product_id`;
    const priced = items.map((i) => {
      const p = rows.find((r) => r.id === i.productId);
      if (!p) throw new SaleError('An item in the sale no longer exists.');
      const available = p.stock - (held.find((h) => h.product_id === p.id)?.qty ?? 0);
      if (available < i.qty) throw new SaleError(`Only ${Math.max(0, available)} of "${p.name}" can be sold${held.length ? ' (some are in an online checkout right now)' : ''}.`);
      const price = i.priceCents ?? p.price_cents;
      if (!Number.isInteger(price) || price < 0) throw new SaleError(`Enter a valid price for "${p.name}".`);
      return { ...i, name: p.name, listPrice: p.price_cents, price };
    });
    const total = priced.reduce((s, i) => s + i.price * i.qty, 0);
    const [order] = await tx<{ id: string; number: string }[]>`
      insert into orders (access_token, channel, status, fulfillment, fulfillment_status, payment_method, staff_id, notes,
                          subtotal_cents, shipping_cents, tax_cents, total_cents, paid_at)
      values (${randomBytes(24).toString('base64url')}, 'store', 'paid', 'in_store', 'picked_up', ${paymentMethod}, ${staff.id}, ${note ?? null},
              ${total}, 0, 0, ${total}, now())
      returning id, number`;
    for (const i of priced) {
      await tx`insert into order_items (order_id, product_id, name, price_cents, qty) values (${order.id}, ${i.productId}, ${i.name}, ${i.price}, ${i.qty})`;
      await tx`update products set stock = stock - ${i.qty}, updated_at = now() where id = ${i.productId}`;
      await tx`insert into inventory_events (product_id, delta, reason, order_id, staff_id) values (${i.productId}, ${-i.qty}, 'sale_store', ${order.id}, ${staff.id})`;
      if (i.price !== i.listPrice) await audit(staff.id, 'sale.price_override', 'product', String(i.productId), { list: i.listPrice, sold: i.price, order: order.number }, tx);
      await enqueueEbayQuantity(tx, i.productId);
    }
    await audit(staff.id, 'sale.store', 'order', order.id, { number: order.number, total, paymentMethod }, tx);
    return { id: order.id, number: order.number, totalCents: total };
  });
}

export type FulfillmentStep = 'ready' | 'picked_up' | 'shipped' | 'delivered';

const allowed: Record<string, FulfillmentStep[]> = {
  pickup: ['ready', 'picked_up'],
  ship: ['shipped', 'delivered'],
  in_store: [],
};

/** Moves a paid order along: ready for pickup, picked up, shipped (with tracking), delivered. */
export async function advanceFulfillment(orderId: string, step: FulfillmentStep, staff: Staff, tracking?: { carrier: string; number: string }) {
  const [o] = await sql<{ status: string; fulfillment: string; fulfillment_status: string; channel: string }[]>`
    select status, fulfillment, fulfillment_status, channel from orders where id = ${orderId}`;
  if (!o) throw new SaleError('Order not found.');
  if (o.status !== 'paid') throw new SaleError('Only paid orders can be fulfilled.');
  if (!allowed[o.fulfillment]?.includes(step)) throw new SaleError('That step does not apply to this order.');
  if (step === 'shipped' && (!tracking?.number || !tracking.carrier)) throw new SaleError('Enter the carrier and tracking number.');
  await sql.begin(async (tx) => {
    await tx`update orders set fulfillment_status = ${step}, tracking_carrier = coalesce(${tracking?.carrier ?? null}, tracking_carrier),
             tracking_number = coalesce(${tracking?.number ?? null}, tracking_number) where id = ${orderId}`;
    await audit(staff.id, `order.${step}`, 'order', orderId, tracking, tx);
    if (o.channel === 'ebay' && step === 'shipped') {
      await tx`insert into jobs (kind, payload, dedupe_key) values ('ebay.sync_orders', ${tx.json({ shipOrder: orderId } as never)}, ${'ebay.ship:' + orderId}) on conflict do nothing`;
    }
  });
}

/**
 * Cancels a paid order and refunds it in full (web orders through Square), and puts the items back in stock.
 * A refund that fails stops everything, so stock and money never disagree.
 */
export async function cancelAndRefund(orderId: string, staff: Staff, reason: string) {
  const [o] = await sql<{ status: string; channel: string; total_cents: number; payment_id: string | null; payment_provider: string | null; number: string }[]>`
    select status, channel, total_cents, payment_id, payment_provider, number::text from orders where id = ${orderId}`;
  if (!o) throw new SaleError('Order not found.');
  if (o.status !== 'paid') throw new SaleError('Only paid orders can be refunded.');
  if (o.channel === 'ebay') throw new SaleError('Refund eBay orders in eBay; the stock comes back when the cancellation syncs.');
  if (o.channel === 'web' && o.payment_id) {
    const r = await refundPayment(o.payment_provider, o.payment_id, o.total_cents, `refund-${orderId}`, reason);
    if (!r.ok) throw new SaleError(r.error);
  }
  await sql.begin(async (tx) => {
    const items = await tx<{ product_id: number; qty: number }[]>`select product_id, qty from order_items where order_id = ${orderId} order by product_id`;
    for (const i of items) {
      await tx`update products set stock = stock + ${i.qty}, updated_at = now() where id = ${i.product_id}`;
      await tx`insert into inventory_events (product_id, delta, reason, order_id, staff_id, note) values (${i.product_id}, ${i.qty}, 'cancel', ${orderId}, ${staff.id}, ${reason})`;
      await enqueueEbayQuantity(tx, i.product_id);
    }
    await tx`update orders set status = 'cancelled', fulfillment_status = 'refunded' where id = ${orderId}`;
    await audit(staff.id, 'order.refund', 'order', orderId, { number: o.number, amount: o.total_cents, reason }, tx);
  });
}
