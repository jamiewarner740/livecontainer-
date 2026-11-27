import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { adjustStock, bulkUpdate, createListing, ListingError, type ListingInput } from '@/lib/admin/catalog';
import { createOrder } from '@/lib/checkout';
import { hashPassword, verifyPassword } from '@/lib/auth';
import type { Staff } from '@/lib/auth';

let staff: Staff;
const photo = { path: '/uploads/00000000-0000-0000-0000-000000000000-1200.webp', width: 1200, height: 1200 };
const base: ListingInput = { name: 'Cordless drill', category: 'gadgets', priceCents: 4999, retailCents: 14999, quantity: 1, condition: 'New, open box', status: 'active' };

beforeEach(async () => {
  await sql`truncate payment_attempts, inventory_events, reservations, order_items, orders, product_images, ebay_listings, jobs, audit_log, sessions restart identity cascade`;
  await sql`delete from products`;
  await sql`delete from staff`;
  const [s] = await sql<{ id: number }[]>`insert into staff (email, name, password_hash, role) values ('o@example.com', 'Owner', 'x', 'owner') returning id`;
  staff = { id: s.id, email: 'o@example.com', name: 'Owner', role: 'owner' };
});
afterAll(async () => { await sql.end(); });

describe('listing an item', () => {
  it('creates the product, its photos, a stock event and an audit entry', async () => {
    const id = await createListing({ ...base, quantity: 3 }, [photo], staff);
    const [p] = await sql`select sku, stock, status, image from products where id = ${id}`;
    expect(p).toMatchObject({ sku: `HH-${id}`, stock: 3, status: 'active', image: photo.path });
    expect(await sql`select delta, reason from inventory_events where product_id = ${id}`).toEqual([{ delta: 3, reason: 'listed' }]);
    expect((await sql`select action from audit_log where entity_id = ${String(id)}`).map((r) => r.action)).toContain('product.create');
  });

  it('refuses to publish without a condition or photo, and explains each problem', async () => {
    const err = await createListing({ ...base, condition: null }, [], staff).catch((e) => e);
    expect(err).toBeInstanceOf(ListingError);
    expect(Object.keys(err.fields).sort()).toEqual(['condition', 'photos']);
  });

  it('saves a draft with no photo or condition', async () => {
    const id = await createListing({ ...base, condition: null, status: 'draft' }, [], staff);
    expect((await sql`select status from products where id = ${id}`)[0].status).toBe('draft');
  });

  it('rejects a retail price at or under the selling price', async () => {
    await expect(createListing({ ...base, retailCents: 4999 }, [photo], staff)).rejects.toMatchObject({ fields: { retail: expect.any(String) } });
  });

  it('queues an eBay publish only when asked', async () => {
    const a = await createListing(base, [photo], staff);
    const b = await createListing({ ...base, sellOnEbay: true }, [photo], staff);
    const jobs = await sql`select kind, payload from jobs order by id`;
    expect(jobs).toEqual([{ kind: 'ebay.publish', payload: { productId: b } }]);
    expect(a).not.toBe(b);
  });
});

describe('adjusting stock', () => {
  it('logs the change with who and why', async () => {
    const id = await createListing({ ...base, quantity: 2 }, [photo], staff);
    expect(await adjustStock(id, 3, 'adjust', 'found more', staff)).toBe(5);
    const [e] = await sql`select delta, reason, note, staff_id from inventory_events where product_id = ${id} and reason = 'adjust'`;
    expect(e).toEqual({ delta: 3, reason: 'adjust', note: 'found more', staff_id: staff.id });
  });

  it('cannot remove units that a buyer is holding in checkout', async () => {
    const id = await createListing({ ...base, quantity: 2 }, [photo], staff);
    await createOrder({ lines: [{ productId: id, qty: 2 }], customer: { name: 'B', email: 'b@example.com' }, fulfillment: 'pickup' });
    await expect(adjustStock(id, -1, 'adjust', null, staff)).rejects.toMatchObject({ fields: { delta: expect.stringContaining('checkout') } });
    expect((await sql`select stock from products where id = ${id}`)[0].stock).toBe(2);
  });
});

describe('bulk changes', () => {
  it('applies to every listing it can and reports the ones it skipped', async () => {
    const good = await createListing({ ...base, status: 'draft' }, [photo], staff);
    const noCondition = await createListing({ ...base, condition: null, status: 'draft' }, [photo], staff);
    const res = await bulkUpdate([good, noCondition], { kind: 'publish' }, staff);
    expect(res).toEqual([{ id: good, ok: true }, { id: noCondition, ok: false, error: 'Needs a condition before it can be published.' }]);
    expect((await sql`select status from products where id = ${good}`)[0].status).toBe('active');
    expect((await sql`select status from products where id = ${noCondition}`)[0].status).toBe('draft');
  });

  it('changes prices by a percentage and records the old and new price', async () => {
    const id = await createListing(base, [photo], staff);
    await bulkUpdate([id], { kind: 'price_percent', percent: -20 }, staff);
    expect((await sql`select price_cents from products where id = ${id}`)[0].price_cents).toBe(3999);
    const [a] = await sql`select detail from audit_log where action = 'product.price' and entity_id = ${String(id)}`;
    expect(a.detail).toMatchObject({ from: 4999, to: 3999 });
  });
});

describe('passwords', () => {
  it('verifies the right password and rejects others', async () => {
    const h = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(h).not.toContain('correct');
  });
});

import { cancelAndRefund, recordStoreSale } from '@/lib/admin/orders';
import { palletReports, savePallet } from '@/lib/admin/reports';
import { payOrder } from '@/lib/checkout';

describe('in-store sales', () => {
  it('records the sale, lowers stock and logs it as a store sale', async () => {
    const id = await createListing({ ...base, quantity: 3 }, [photo], staff);
    const sale = await recordStoreSale([{ productId: id, qty: 2 }], 'cash', staff);
    expect(sale.totalCents).toBe(2 * 4999);
    expect((await sql`select stock from products where id = ${id}`)[0].stock).toBe(1);
    expect(await sql`select delta, reason from inventory_events where product_id = ${id} and reason = 'sale_store'`).toEqual([{ delta: -2, reason: 'sale_store' }]);
    expect((await sql`select channel, status, fulfillment, payment_method from orders where id = ${sale.id}`)[0]).toEqual({ channel: 'store', status: 'paid', fulfillment: 'in_store', payment_method: 'cash' });
  });

  it('will not sell a unit someone is paying for online', async () => {
    const id = await createListing({ ...base, quantity: 1 }, [photo], staff);
    await createOrder({ lines: [{ productId: id, qty: 1 }], customer: { name: 'B', email: 'b@example.com' }, fulfillment: 'pickup' });
    await expect(recordStoreSale([{ productId: id, qty: 1 }], 'card', staff)).rejects.toThrow(/online checkout/);
  });

  it('accepts a counter price and audits the difference', async () => {
    const id = await createListing(base, [photo], staff);
    const sale = await recordStoreSale([{ productId: id, qty: 1, priceCents: 4000 }], 'cash', staff);
    expect(sale.totalCents).toBe(4000);
    const [a] = await sql`select detail from audit_log where action = 'sale.price_override'`;
    expect(a.detail).toMatchObject({ list: 4999, sold: 4000 });
  });
});

describe('refunds', () => {
  it('refunds a paid web order and puts the stock back', async () => {
    const id = await createListing({ ...base, quantity: 2 }, [photo], staff);
    const o = await createOrder({ lines: [{ productId: id, qty: 2 }], customer: { name: 'B', email: 'b@example.com' }, fulfillment: 'pickup' });
    await payOrder(o.id, o.token, 'test-ok');
    expect((await sql`select stock from products where id = ${id}`)[0].stock).toBe(0);
    await cancelAndRefund(o.id, staff, 'changed mind');
    expect((await sql`select stock from products where id = ${id}`)[0].stock).toBe(2);
    expect((await sql`select status, fulfillment_status from orders where id = ${o.id}`)[0]).toEqual({ status: 'cancelled', fulfillment_status: 'refunded' });
    await expect(cancelAndRefund(o.id, staff, 'again')).rejects.toThrow(/Only paid orders/);
  });
});

describe('pallet report', () => {
  it('adds up cost, units and what was sold on each channel', async () => {
    const pallet = await savePallet(null, { label: 'Test pallet', costCents: 20000, freightCents: 5000, otherCents: 0 }, staff);
    const a = await createListing({ ...base, quantity: 3, palletId: pallet }, [photo], staff);
    await createListing({ ...base, name: 'Lamp', priceCents: 1500, retailCents: null, quantity: 2, palletId: pallet }, [photo], staff);
    await recordStoreSale([{ productId: a, qty: 2 }], 'cash', staff);
    const [r] = await palletReports(pallet);
    expect(r).toMatchObject({ total_cost: 25000, items: 2, units_listed: 5, units_sold: 2, units_left: 3, revenue: 9998, sold_store: 2, sold_web: 0 });
    expect(r.left_value).toBe(4999 + 2 * 1500);
  });
});
