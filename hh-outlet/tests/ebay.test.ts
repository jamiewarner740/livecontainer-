import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { ebayPrice, publishProduct, recordEbayOrder } from '@/lib/ebay/sync';
import { claimJob, enqueue, failJob } from '@/lib/jobs';
import { seedProducts } from '@/db/seed-products';

const CAT_BED = 11; // stock 4

beforeEach(async () => {
  await sql`truncate oversells, payment_attempts, inventory_events, reservations, order_items, orders, product_images, ebay_listings, jobs, audit_log, ebay_account restart identity cascade`;
  await sql`delete from products`;
  for (const p of seedProducts) {
    await sql`insert into products (id, slug, sku, name, price_cents, retail_cents, stock, category, image, alt, added_at)
              values (${p.id}, ${p.slug}, ${'HH-' + p.id}, ${p.name}, ${p.priceCents}, ${p.retailCents ?? null}, ${p.stock}, ${p.category}, ${p.image}, ${p.alt}, ${p.addedAt})`;
  }
});
afterAll(async () => { await sql.end(); });

const order = (id: string, sku: string, qty: number, extra: object = {}) => ({
  orderId: id, orderPaymentStatus: 'PAID', creationDate: new Date().toISOString(),
  pricingSummary: { priceSubtotal: { value: '40.00' }, deliveryCost: { value: '5.00' }, total: { value: '45.00' } },
  totalMarketplaceFee: { value: '6.10' },
  lineItems: [{ lineItemId: 'L1', sku, title: 'Attachable cat bed', quantity: qty, lineItemCost: { value: '40.00' } }],
  ...extra,
});

describe('eBay orders', () => {
  it('records a paid eBay order as a sale and lowers stock here', async () => {
    expect(await recordEbayOrder(order('E1', 'HH-11', 2))).toBe(true);
    expect((await sql`select stock from products where id = ${CAT_BED}`)[0].stock).toBe(2);
    const [o] = await sql`select channel, status, total_cents, fees_cents, fulfillment from orders where external_id = 'E1'`;
    expect(o).toEqual({ channel: 'ebay', status: 'paid', total_cents: 4500, fees_cents: 610, fulfillment: 'ship' });
    expect(await sql`select delta, reason from inventory_events where product_id = ${CAT_BED}`).toEqual([{ delta: -2, reason: 'sale_ebay' }]);
  });

  it('ignores the same order seen twice', async () => {
    await recordEbayOrder(order('E1', 'HH-11', 1));
    expect(await recordEbayOrder(order('E1', 'HH-11', 1))).toBe(false);
    expect((await sql`select stock from products where id = ${CAT_BED}`)[0].stock).toBe(3);
  });

  it('records an oversell instead of going below zero', async () => {
    await sql`update products set stock = 1 where id = ${CAT_BED}`;
    await recordEbayOrder(order('E2', 'HH-11', 3));
    expect((await sql`select stock from products where id = ${CAT_BED}`)[0].stock).toBe(0);
    expect(await sql`select wanted, had from oversells`).toEqual([{ wanted: 3, had: 1 }]);
  });

  it('puts stock back when eBay cancels the order', async () => {
    await recordEbayOrder(order('E3', 'HH-11', 2));
    await recordEbayOrder(order('E3', 'HH-11', 2, { cancelStatus: { cancelState: 'CANCELED' } }));
    expect((await sql`select stock from products where id = ${CAT_BED}`)[0].stock).toBe(4);
    expect((await sql`select status from orders where external_id = 'E3'`)[0].status).toBe('cancelled');
  });

  it('skips unpaid orders and items not listed from here', async () => {
    expect(await recordEbayOrder(order('E4', 'HH-11', 1, { orderPaymentStatus: 'PENDING' }))).toBe(false);
    expect(await recordEbayOrder(order('E5', 'SOMEONE-ELSE', 1))).toBe(false);
    expect((await sql`select stock from products where id = ${CAT_BED}`)[0].stock).toBe(4);
  });

  it('matches imported listings by the SKU eBay already had', async () => {
    await sql`insert into ebay_listings (product_id, sku, status) values (${CAT_BED}, 'OLD-SKU-7', 'published')`;
    await recordEbayOrder(order('E6', 'OLD-SKU-7', 1));
    expect((await sql`select stock from products where id = ${CAT_BED}`)[0].stock).toBe(3);
  });
});

describe('eBay pricing and readiness', () => {
  it('adds the markup to the web price unless the item has its own eBay price', () => {
    expect(ebayPrice(1000, null, 1500, 0)).toBe(1150);
    expect(ebayPrice(1000, null, 1000, 199)).toBe(1299);
    expect(ebayPrice(1000, 1400, 1500, 199)).toBe(1400);
  });

  it('does not send anything to eBay until setup and the listing are complete, and says what is missing', async () => {
    await sql`update products set sell_on_ebay = true where id = ${CAT_BED}`;
    await expect(publishProduct(CAT_BED)).rejects.toMatchObject({ needsOwner: true });
    const [l] = await sql`select status, last_error from ebay_listings where product_id = ${CAT_BED}`;
    expect(l.status).toBe('needs_info');
    expect(l.last_error).toContain('Connect the eBay account.');
    expect(l.last_error).toContain('Choose the condition.');
    expect(l.last_error).toContain('Add the weight');
  });
});

describe('job queue', () => {
  it('collapses repeated jobs with the same key while one is waiting', async () => {
    await enqueue('ebay.sync_quantity', { productId: 1 }, { dedupeKey: 'q:1' });
    await enqueue('ebay.sync_quantity', { productId: 1 }, { dedupeKey: 'q:1' });
    expect((await sql`select count(*)::int as n from jobs`)[0].n).toBe(1);
  });

  it('retries with a growing wait, and stops at once when the owner must act', async () => {
    await enqueue('ebay.publish', { productId: 1 });
    const j = (await claimJob())!;
    await failJob(j, 'eBay was down');
    const [r] = await sql`select status, attempts, run_after > now() as later from jobs where id = ${j.id}`;
    expect(r).toEqual({ status: 'queued', attempts: 1, later: true });
    await sql`update jobs set run_after = now() where id = ${j.id}`;
    const j2 = (await claimJob())!;
    await failJob(j2, 'Missing policy', true);
    expect((await sql`select status from jobs where id = ${j.id}`)[0].status).toBe('attention');
  });
});

import { vi } from 'vitest';
import { connectWithCode } from '@/lib/ebay/client';
import { syncQuantity } from '@/lib/ebay/sync';

describe('publishing to eBay (fake eBay server)', () => {
  it('connects, then sends inventory item, offer and publish in order, and saves the ids', async () => {
    process.env.EBAY_CLIENT_ID = 'cid'; process.env.EBAY_CLIENT_SECRET = 'sec'; process.env.EBAY_RUNAME = 'run'; process.env.EBAY_ENVIRONMENT = 'sandbox';
    process.env.APP_SECRET = 'x'.repeat(40);
    const calls: { method: string; path: string; body?: unknown }[] = [];
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const u = new URL(url);
      const path = u.pathname + u.search;
      calls.push({ method: init.method ?? 'GET', path, body: init.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : undefined });
      if (u.pathname === '/identity/v1/oauth2/token') return json({ access_token: 'AT', expires_in: 7200, refresh_token: 'RT', refresh_token_expires_in: 47304000 });
      if (u.pathname.endsWith('get_default_category_tree_id')) return json({ categoryTreeId: '0' });
      if (u.pathname.endsWith('get_category_suggestions')) return json({ categorySuggestions: [{ category: { categoryId: '20716', categoryName: 'Pet beds' } }] });
      if (u.pathname.endsWith('get_item_condition_policies')) return json({ itemConditionPolicies: [{ itemConditions: [{ conditionId: '1000' }, { conditionId: '1500' }, { conditionId: '3000' }] }] });
      if (u.pathname.endsWith('get_item_aspects_for_category')) return json({ aspects: [{ localizedAspectName: 'Brand', aspectConstraint: { aspectRequired: true } }, { localizedAspectName: 'Color' }] });
      if (u.pathname.startsWith('/sell/inventory/v1/inventory_item/')) return new Response(null, { status: 204 });
      if (u.pathname === '/sell/inventory/v1/offer' && (init.method ?? 'GET') === 'GET') return json({ offers: [] });
      if (u.pathname === '/sell/inventory/v1/offer') return json({ offerId: 'OF1' }, 201);
      if (u.pathname === '/sell/inventory/v1/offer/OF1/publish') return json({ listingId: '1234567890' });
      if (u.pathname === '/sell/inventory/v1/offer/OF1' && init.method === 'PUT') return new Response(null, { status: 204 });
      if (u.pathname === '/sell/inventory/v1/bulk_update_price_quantity') return json({ responses: [{ statusCode: 200 }] });
      return json({ errors: [{ message: `unexpected ${path}` }] }, 404);
    });
    try {
      await connectWithCode('CODE');
      await sql`update ebay_account set fulfillment_policy_id = 'F', payment_policy_id = 'P', return_policy_id = 'R', location_key = 'hh-store', markup_bps = 1500 where id = 1`;
      await sql`update products set sell_on_ebay = true, condition = 'New, open box', weight_oz = 48 where id = ${CAT_BED}`;
      await sql`insert into product_images (product_id, path, position) values (${CAT_BED}, '/uploads/00000000-0000-0000-0000-000000000000-1200.webp', 0)`;

      await publishProduct(CAT_BED);

      const [l] = await sql`select status, offer_id, listing_id, category_id, quantity, price_cents from ebay_listings where product_id = ${CAT_BED}`;
      expect(l).toEqual({ status: 'published', offer_id: 'OF1', listing_id: '1234567890', category_id: '20716', quantity: 4, price_cents: 2300 });
      const writes = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path.split('?')[0]}`);
      expect(writes).toEqual(['POST /identity/v1/oauth2/token', 'PUT /sell/inventory/v1/inventory_item/HH-11', 'POST /sell/inventory/v1/offer', 'POST /sell/inventory/v1/offer/OF1/publish']);
      const item = calls.find((c) => c.path.startsWith('/sell/inventory/v1/inventory_item/'))!.body as { condition: string; product: { aspects: Record<string, string[]> }; availability: unknown };
      expect(item.condition).toBe('NEW_OTHER');
      expect(item.product.aspects).toEqual({ Brand: ['Unbranded'] });
      const offer = calls.find((c) => c.method === 'POST' && c.path === '/sell/inventory/v1/offer')!.body as { pricingSummary: { price: { value: string } }; listingPolicies: unknown };
      expect(offer.pricingSummary.price.value).toBe('23.00'); // $20.00 + 15%
      expect(offer.listingPolicies).toEqual({ fulfillmentPolicyId: 'F', paymentPolicyId: 'P', returnPolicyId: 'R' });

      // Publishing again updates the same offer instead of creating a second listing.
      calls.length = 0;
      await publishProduct(CAT_BED);
      expect(calls.filter((c) => c.method === 'POST' && c.path === '/sell/inventory/v1/offer')).toHaveLength(0);
      expect(calls.some((c) => c.method === 'PUT' && c.path === '/sell/inventory/v1/offer/OF1')).toBe(true);

      // A sale here pushes the new quantity.
      await sql`update products set stock = 1 where id = ${CAT_BED}`;
      await syncQuantity(CAT_BED);
      const q = calls.find((c) => c.path === '/sell/inventory/v1/bulk_update_price_quantity')!.body as { requests: { offers: { availableQuantity: number }[] }[] };
      expect(q.requests[0].offers[0].availableQuantity).toBe(1);
      // Tokens are stored encrypted, never in plain text.
      const [tok] = await sql`select access_token_enc, refresh_token_enc from ebay_account`;
      expect(tok.access_token_enc).not.toContain('AT');
      expect(tok.refresh_token_enc.startsWith('v1.')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
