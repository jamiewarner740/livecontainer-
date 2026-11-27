import { randomBytes } from 'node:crypto';
import { sql } from './db';
import { store } from './store';
import { getPaymentProvider } from './payments';
import { quoteShipping, type Fulfillment } from './shipping';

export type Line = { productId: number; qty: number };
export type Customer = { name: string; email: string; phone?: string };
export type Address = { address1: string; address2?: string; city: string; state: string; zip: string };

export class CheckoutError extends Error {
  constructor(public code: 'empty' | 'unavailable' | 'shipping_unavailable' | 'not_found' | 'not_payable' | 'sold_out' | 'declined', message: string, public detail?: unknown) {
    super(message);
  }
}

const taxRateBps = () => Number(process.env.TAX_RATE_BPS ?? 0); // basis points: 700 = 7%

/**
 * Creates an order and holds its stock in one transaction. Prices come from the database, never from the browser.
 * Product rows are locked in id order, so two buyers racing for the last unit are served one after the other:
 * the second sees the first one's hold and gets an "unavailable" error instead of a double sale.
 */
export async function createOrder(input: { lines: Line[]; customer: Customer; fulfillment: Fulfillment; address?: Address }) {
  const lines = mergeLines(input.lines);
  if (!lines.length) throw new CheckoutError('empty', 'Your bag is empty.');

  return sql.begin(async (tx) => {
    const ids = lines.map((l) => l.productId).sort((a, b) => a - b);
    const rows = await tx<{ id: number; name: string; price_cents: number; stock: number; active: boolean }[]>`
      select id, name, price_cents, stock, active from products where id = any(${ids}) order by id for update`;
    const held = await tx<{ product_id: number; qty: number }[]>`
      select product_id, sum(qty)::int as qty from reservations
      where product_id = any(${ids}) and status = 'active' and expires_at > now() group by product_id`;
    const heldBy = new Map(held.map((h) => [h.product_id, h.qty]));

    const problems: { productId: number; name?: string; available: number }[] = [];
    const items = lines.map((l) => {
      const p = rows.find((r) => r.id === l.productId);
      const available = p && p.active ? p.stock - (heldBy.get(p.id) ?? 0) : 0;
      if (!p || available < l.qty) problems.push({ productId: l.productId, name: p?.name, available: Math.max(0, available) });
      return { ...l, name: p?.name ?? '', priceCents: p?.price_cents ?? 0 };
    });
    if (problems.length) throw new CheckoutError('unavailable', 'Some items in your bag are no longer available in that quantity.', problems);

    const subtotal = items.reduce((s, i) => s + i.priceCents * i.qty, 0);
    const shipping = quoteShipping(input.fulfillment, subtotal);
    if (shipping == null) throw new CheckoutError('shipping_unavailable', 'Shipping is not set up yet. Choose free pickup at the store.');
    const tax = Math.round(((subtotal + shipping) * taxRateBps()) / 10000);
    const token = randomBytes(24).toString('base64url');
    const a = input.fulfillment === 'ship' ? input.address : undefined;

    const [order] = await tx<{ id: string; number: string }[]>`
      insert into orders (access_token, email, name, phone, fulfillment, ship_address1, ship_address2, ship_city, ship_state, ship_zip,
                          subtotal_cents, shipping_cents, tax_cents, total_cents)
      values (${token}, ${input.customer.email}, ${input.customer.name}, ${input.customer.phone ?? null}, ${input.fulfillment},
              ${a?.address1 ?? null}, ${a?.address2 ?? null}, ${a?.city ?? null}, ${a?.state ?? null}, ${a?.zip ?? null},
              ${subtotal}, ${shipping}, ${tax}, ${subtotal + shipping + tax})
      returning id, number`;
    for (const i of items) {
      await tx`insert into order_items (order_id, product_id, name, price_cents, qty) values (${order.id}, ${i.productId}, ${i.name}, ${i.priceCents}, ${i.qty})`;
      await tx`insert into reservations (order_id, product_id, qty, expires_at)
               values (${order.id}, ${i.productId}, ${i.qty}, now() + make_interval(mins => ${store.holdMinutes}))`;
    }
    return { id: order.id, token };
  });
}

export async function getOrder(id: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [o] = await sql<OrderRow[]>`select * from orders where id = ${id}`;
  if (!o || !safeEqual(o.access_token, token)) return null;
  const items = await sql<{ product_id: number; name: string; price_cents: number; qty: number; image: string; slug: string }[]>`
    select oi.product_id, oi.name, oi.price_cents, oi.qty, p.image, p.slug
    from order_items oi join products p on p.id = oi.product_id where oi.order_id = ${id} order by oi.name`;
  const [hold] = await sql<{ expires_at: Date | null }[]>`
    select min(expires_at) as expires_at from reservations where order_id = ${id} and status = 'active'`;
  return { ...o, items, holdExpiresAt: hold?.expires_at ?? null };
}

/**
 * Takes payment for a pending order. Steps:
 * 1. Re-confirm the hold (re-take it if it expired and the stock is still free) and extend it while the card is charged.
 * 2. Charge once, with the payment attempt's id as the idempotency key, so a retry never charges twice.
 * 3. On success, turn the holds into sales: stock goes down, each change is written to inventory_events.
 */
export async function payOrder(id: string, token: string, sourceId: string) {
  const order = await getOrder(id, token);
  if (!order) throw new CheckoutError('not_found', 'We could not find that order.');
  if (order.status === 'paid') return { status: 'paid' as const, number: order.number };
  if (order.status !== 'pending_payment') throw new CheckoutError('not_payable', 'This order can no longer be paid. Please start again from your bag.');

  const provider = getPaymentProvider();
  const attemptId = await sql.begin(async (tx) => {
    const lines = await tx<{ product_id: number; qty: number }[]>`select product_id, qty from order_items where order_id = ${id} order by product_id`;
    const ids = lines.map((l) => l.product_id);
    const stock = await tx<{ id: number; stock: number }[]>`select id, stock from products where id = any(${ids}) order by id for update`;
    const others = await tx<{ product_id: number; qty: number }[]>`
      select product_id, sum(qty)::int as qty from reservations
      where product_id = any(${ids}) and status = 'active' and expires_at > now() and order_id <> ${id} group by product_id`;
    for (const l of lines) {
      const onHand = stock.find((s) => s.id === l.product_id)?.stock ?? 0;
      const heldByOthers = others.find((o) => o.product_id === l.product_id)?.qty ?? 0;
      if (onHand - heldByOthers < l.qty) {
        await tx`update reservations set status = 'released' where order_id = ${id} and status = 'active'`;
        await tx`update orders set status = 'expired' where id = ${id}`;
        return null; // committed, then reported below, so the release is saved
      }
    }
    await tx`update reservations set expires_at = greatest(expires_at, now() + interval '10 minutes') where order_id = ${id} and status = 'active'`;
    const [a] = await tx<{ id: string }[]>`
      insert into payment_attempts (order_id, provider, amount_cents, status) values (${id}, ${provider.name}, ${order.total_cents}, 'started') returning id`;
    return a.id;
  });
  if (!attemptId) throw new CheckoutError('sold_out', 'Sorry, an item in this order sold while the hold was expired. You have not been charged.');

  const result = await provider.charge({ sourceId, amountCents: order.total_cents, idempotencyKey: attemptId, reference: `H&H order ${order.number}`, email: order.email });
  if (!result.ok) {
    await sql`update payment_attempts set status = 'failed', error = ${result.error} where id = ${attemptId}`;
    throw new CheckoutError('declined', result.error);
  }

  await sql.begin(async (tx) => {
    await tx`update payment_attempts set status = 'succeeded', provider_payment_id = ${result.paymentId} where id = ${attemptId}`;
    const holds = await tx<{ product_id: number; qty: number }[]>`
      update reservations set status = 'committed' where order_id = ${id} and status = 'active' returning product_id, qty`;
    for (const h of holds.sort((a, b) => a.product_id - b.product_id)) {
      await tx`update products set stock = stock - ${h.qty} where id = ${h.product_id}`;
      await tx`insert into inventory_events (product_id, delta, reason, order_id) values (${h.product_id}, ${-h.qty}, 'sale_web', ${id})`;
    }
    await tx`update orders set status = 'paid', paid_at = now(), payment_provider = ${provider.name}, payment_id = ${result.paymentId} where id = ${id}`;
  });
  return { status: 'paid' as const, number: order.number };
}

export type OrderRow = {
  id: string; number: string; access_token: string; status: string; email: string; name: string; phone: string | null;
  fulfillment: Fulfillment; ship_address1: string | null; ship_address2: string | null; ship_city: string | null; ship_state: string | null; ship_zip: string | null;
  subtotal_cents: number; shipping_cents: number; tax_cents: number; total_cents: number; created_at: Date; paid_at: Date | null;
};

function mergeLines(lines: Line[]) {
  const m = new Map<number, number>();
  for (const l of lines) if (Number.isInteger(l.productId) && Number.isInteger(l.qty) && l.qty > 0) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
  return [...m].map(([productId, qty]) => ({ productId, qty }));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
