import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { CheckoutError, createOrder, getOrder, payOrder } from '@/lib/checkout';
import { getProductsByIds, listProducts } from '@/lib/products';
import { parseCart } from '@/lib/cart';
import { seedProducts } from '@/db/seed-products';

const customer = { name: 'Test Buyer', email: 'buyer@example.com' };
const CAT_BED = 11; // stock 4, $20.00
const WREATH = 9; // stock 10, $10.00

async function reset() {
  await sql`truncate payment_attempts, inventory_events, reservations, order_items, orders restart identity cascade`;
  await sql`delete from products`;
  for (const p of seedProducts) {
    await sql`insert into products (id, slug, name, price_cents, retail_cents, stock, category, image, alt, added_at)
              values (${p.id}, ${p.slug}, ${p.name}, ${p.priceCents}, ${p.retailCents ?? null}, ${p.stock}, ${p.category}, ${p.image}, ${p.alt}, ${p.addedAt})`;
  }
}
const available = async (id: number) => (await getProductsByIds([id]))[0].available;
const stock = async (id: number) => (await sql<{ stock: number }[]>`select stock from products where id = ${id}`)[0].stock;
const setStock = (id: number, n: number) => sql`update products set stock = ${n} where id = ${id}`;

beforeEach(async () => {
  await reset();
  delete process.env.SHIPPING_FLAT_RATE_CENTS;
  delete process.env.TAX_RATE_BPS;
});
afterAll(async () => { await sql.end(); });

describe('holding stock at checkout', () => {
  it('holds the items so the storefront shows fewer available, without touching stock on hand', async () => {
    await createOrder({ lines: [{ productId: CAT_BED, qty: 3 }], customer, fulfillment: 'pickup' });
    expect(await available(CAT_BED)).toBe(1);
    expect(await stock(CAT_BED)).toBe(4);
  });

  it('refuses more than is available and says how many are left', async () => {
    await createOrder({ lines: [{ productId: CAT_BED, qty: 3 }], customer, fulfillment: 'pickup' });
    const err = await createOrder({ lines: [{ productId: CAT_BED, qty: 2 }], customer, fulfillment: 'pickup' }).catch((e) => e);
    expect(err).toBeInstanceOf(CheckoutError);
    expect(err.code).toBe('unavailable');
    expect(err.detail).toEqual([{ productId: CAT_BED, name: 'Attachable cat bed', available: 1 }]);
  });

  it('lets exactly one of 10 buyers racing for the last unit get it', async () => {
    await setStock(CAT_BED, 1);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => createOrder({ lines: [{ productId: CAT_BED, qty: 1 }], customer: { ...customer, email: `b${i}@example.com` }, fulfillment: 'pickup' })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && (r.reason as CheckoutError).code === 'unavailable')).toHaveLength(9);
    expect(await available(CAT_BED)).toBe(0);
  });

  it('frees the stock again when a hold expires, with no cleanup job', async () => {
    const o = await createOrder({ lines: [{ productId: CAT_BED, qty: 4 }], customer, fulfillment: 'pickup' });
    expect(await available(CAT_BED)).toBe(0);
    await sql`update reservations set expires_at = now() - interval '1 second' where order_id = ${o.id}`;
    expect(await available(CAT_BED)).toBe(4);
  });

  it('hides sold-out items from the storefront list', async () => {
    await createOrder({ lines: [{ productId: CAT_BED, qty: 4 }], customer, fulfillment: 'pickup' });
    expect((await listProducts()).map((p) => p.id)).not.toContain(CAT_BED);
  });

  it('prices the order from the database and merges repeated lines', async () => {
    const o = await createOrder({ lines: [{ productId: WREATH, qty: 1 }, { productId: WREATH, qty: 2 }, { productId: CAT_BED, qty: 1 }], customer, fulfillment: 'pickup' });
    const order = await getOrder(o.id, o.token);
    expect(order!.subtotal_cents).toBe(3 * 1000 + 2000);
    expect(order!.total_cents).toBe(5000);
    expect(order!.items.find((i) => i.product_id === WREATH)!.qty).toBe(3);
  });

  it('rejects an empty bag', async () => {
    await expect(createOrder({ lines: [], customer, fulfillment: 'pickup' })).rejects.toMatchObject({ code: 'empty' });
  });
});

describe('shipping and tax', () => {
  const address = { address1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' };

  it('offers pickup only until the owner sets a shipping rate', async () => {
    await expect(createOrder({ lines: [{ productId: WREATH, qty: 1 }], customer, fulfillment: 'ship', address })).rejects.toMatchObject({ code: 'shipping_unavailable' });
  });

  it('charges the flat rate under $150 and ships free from $150', async () => {
    process.env.SHIPPING_FLAT_RATE_CENTS = '899';
    const small = await createOrder({ lines: [{ productId: WREATH, qty: 1 }], customer, fulfillment: 'ship', address });
    expect((await getOrder(small.id, small.token))!.shipping_cents).toBe(899);
    const big = await createOrder({ lines: [{ productId: WREATH, qty: 7 }, { productId: CAT_BED, qty: 4 }], customer, fulfillment: 'ship', address });
    const b = await getOrder(big.id, big.token);
    expect(b!.subtotal_cents).toBe(15000);
    expect(b!.shipping_cents).toBe(0);
  });

  it('adds tax at the configured rate and none by default', async () => {
    const none = await createOrder({ lines: [{ productId: WREATH, qty: 1 }], customer, fulfillment: 'pickup' });
    expect((await getOrder(none.id, none.token))!.tax_cents).toBe(0);
    process.env.TAX_RATE_BPS = '825';
    const taxed = await createOrder({ lines: [{ productId: WREATH, qty: 1 }], customer, fulfillment: 'pickup' });
    const t = await getOrder(taxed.id, taxed.token);
    expect(t!.tax_cents).toBe(83); // 8.25% of $10.00, rounded
    expect(t!.total_cents).toBe(1083);
  });
});

describe('paying', () => {
  it('turns the hold into a sale: stock goes down, the change is logged and the order is paid', async () => {
    const o = await createOrder({ lines: [{ productId: CAT_BED, qty: 2 }], customer, fulfillment: 'pickup' });
    const r = await payOrder(o.id, o.token, 'test-ok');
    expect(r.status).toBe('paid');
    expect(await stock(CAT_BED)).toBe(2);
    expect(await available(CAT_BED)).toBe(2);
    const events = await sql`select delta, reason from inventory_events where order_id = ${o.id}`;
    expect(events).toEqual([{ delta: -2, reason: 'sale_web' }]);
    expect((await getOrder(o.id, o.token))!.status).toBe('paid');
  });

  it('keeps the hold and the stock after a decline, then succeeds on retry', async () => {
    const o = await createOrder({ lines: [{ productId: CAT_BED, qty: 1 }], customer, fulfillment: 'pickup' });
    await expect(payOrder(o.id, o.token, 'test-decline')).rejects.toMatchObject({ code: 'declined' });
    expect(await stock(CAT_BED)).toBe(4);
    expect(await available(CAT_BED)).toBe(3);
    await payOrder(o.id, o.token, 'test-ok');
    expect(await stock(CAT_BED)).toBe(3);
    const attempts = await sql`select status from payment_attempts where order_id = ${o.id} order by created_at`;
    expect(attempts.map((a) => a.status)).toEqual(['failed', 'succeeded']);
  });

  it('never charges twice for an order that is already paid', async () => {
    const o = await createOrder({ lines: [{ productId: CAT_BED, qty: 1 }], customer, fulfillment: 'pickup' });
    await payOrder(o.id, o.token, 'test-ok');
    await payOrder(o.id, o.token, 'test-ok');
    expect(await sql`select id from payment_attempts where order_id = ${o.id} and status = 'succeeded'`).toHaveLength(1);
    expect(await stock(CAT_BED)).toBe(3);
  });

  it('re-takes an expired hold when the stock is still free', async () => {
    const o = await createOrder({ lines: [{ productId: CAT_BED, qty: 1 }], customer, fulfillment: 'pickup' });
    await sql`update reservations set expires_at = now() - interval '1 minute' where order_id = ${o.id}`;
    await payOrder(o.id, o.token, 'test-ok');
    expect(await stock(CAT_BED)).toBe(3);
  });

  it('does not charge when the item sold to someone else after the hold expired', async () => {
    await setStock(CAT_BED, 1);
    const slow = await createOrder({ lines: [{ productId: CAT_BED, qty: 1 }], customer, fulfillment: 'pickup' });
    await sql`update reservations set expires_at = now() - interval '1 minute' where order_id = ${slow.id}`;
    const fast = await createOrder({ lines: [{ productId: CAT_BED, qty: 1 }], customer: { ...customer, email: 'fast@example.com' }, fulfillment: 'pickup' });
    await payOrder(fast.id, fast.token, 'test-ok');
    await expect(payOrder(slow.id, slow.token, 'test-ok')).rejects.toMatchObject({ code: 'sold_out' });
    expect(await sql`select id from payment_attempts where order_id = ${slow.id}`).toHaveLength(0);
    expect((await getOrder(slow.id, slow.token))!.status).toBe('expired');
    expect(await stock(CAT_BED)).toBe(0);
  });

  it('refuses a wrong order link', async () => {
    const o = await createOrder({ lines: [{ productId: CAT_BED, qty: 1 }], customer, fulfillment: 'pickup' });
    expect(await getOrder(o.id, 'wrong-token')).toBeNull();
    await expect(payOrder(o.id, 'wrong-token', 'test-ok')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('the bag cookie', () => {
  it('reads valid lines and drops anything else', () => {
    expect(parseCart('[[11,2],[9,1]]')).toEqual([{ productId: 11, qty: 2 }, { productId: 9, qty: 1 }]);
    expect(parseCart('[[11,-1],["x",2],[9,1.5],[5,500]]')).toEqual([{ productId: 5, qty: 99 }]);
    expect(parseCart('not json')).toEqual([]);
    expect(parseCart(undefined)).toEqual([]);
  });
});
