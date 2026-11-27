import { randomBytes } from 'node:crypto';
import { sql } from '../db';
import { audit } from '../audit';
import { enqueue } from '../jobs';
import { conditions } from '../conditions';
import { account, ebay, EbayError } from './client';

const siteUrl = () => (process.env.SITE_URL ?? 'https://www.hisnhersllc.com').replace(/\/$/, '');
const dollars = (c: number) => (c / 100).toFixed(2);

/** eBay price from the web price plus the owner's markup, unless the item has its own eBay price. */
export function ebayPrice(webCents: number, own: number | null, markupBps: number, markupCents: number) {
  if (own != null) return own;
  return Math.round(webCents * (1 + markupBps / 10000)) + markupCents;
}

type P = {
  id: number; sku: string; name: string; description: string | null; brand: string | null; model: string | null; upc: string | null;
  condition: string | null; defects: string | null; missing: string | null; included: string | null; tested: string | null; status: string;
  price_cents: number; ebay_price_cents: number | null; sell_on_ebay: boolean; pickup_only: boolean; weight_oz: number | null; available: number;
};

async function loadProduct(id: number) {
  const [p] = await sql<P[]>`
    select p.id, p.sku, p.name, p.description, p.brand, p.model, p.upc, p.condition, p.defects, p.missing, p.included, p.tested, p.status,
           p.price_cents, p.ebay_price_cents, p.sell_on_ebay, p.pickup_only, p.weight_oz,
           p.stock - coalesce((select sum(r.qty) from reservations r where r.product_id = p.id and r.status = 'active' and r.expires_at > now()), 0)::int as available
    from products p where p.id = ${id}`;
  return p ?? null;
}

async function setListing(productId: number, sku: string, patch: Record<string, unknown>) {
  await sql`insert into ebay_listings (product_id, sku) values (${productId}, ${sku}) on conflict (product_id) do nothing`;
  await sql`update ebay_listings set ${sql(patch)}, synced_at = now() where product_id = ${productId}`;
}

/** What eBay needs before anything is sent. Each problem is a sentence the owner can act on. */
export async function readiness(p: P) {
  const a = await account();
  const problems: string[] = [];
  if (!a?.connected_at) problems.push('Connect the eBay account.');
  if (a && (!a.fulfillment_policy_id || !a.payment_policy_id || !a.return_policy_id)) problems.push('Choose the shipping, payment and return policies on the eBay page.');
  if (a && !a.location_key) problems.push('Set the ship-from location on the eBay page.');
  if (!p.condition) problems.push('Choose the condition.');
  if (p.pickup_only) problems.push('Pickup-only items are not sent to eBay.');
  if (!p.weight_oz) problems.push('Add the weight, so eBay shipping can be calculated.');
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from product_images where product_id = ${p.id}`;
  if (n === 0) problems.push('Add a photo taken for this listing (eBay needs at least one).');
  return { problems, account: a };
}

function describe(p: P) {
  const lines = [p.description ?? p.name];
  if (p.condition) lines.push(`Condition: ${p.condition}.`);
  if (p.tested === 'works') lines.push('Tested and working.');
  if (p.tested === 'not_working') lines.push('Tested: does not work. Sold for parts or repair.');
  if (p.tested === 'untested') lines.push('Not tested.');
  if (p.included) lines.push(`Included: ${p.included}.`);
  if (p.missing) lines.push(`Missing: ${p.missing}.`);
  if (p.defects) lines.push(`Known issues: ${p.defects}.`);
  return lines.map((l) => `<p>${l.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</p>`).join('');
}

/**
 * Creates or updates the eBay listing for one product:
 *   inventory item (PUT, keyed by SKU, so retries never duplicate) -> category -> condition check -> required aspects
 *   -> offer (create once, then update) -> publish. Ids are saved after each step.
 * A listing that can't go up for a reason the owner must fix is marked needs_info with that reason.
 */
export async function publishProduct(productId: number) {
  const p = await loadProduct(productId);
  if (!p) return;
  if (!p.sell_on_ebay || p.status !== 'active') return withdrawProduct(productId);
  const { problems, account: a } = await readiness(p);
  if (problems.length) {
    await setListing(p.id, p.sku, { status: 'needs_info', last_error: problems.join(' ') });
    throw new EbayError(problems.join(' '), 400, true);
  }
  await setListing(p.id, p.sku, { status: 'publishing', last_error: null });
  const images = (await sql<{ path: string }[]>`select path from product_images where product_id = ${p.id} order by position limit 12`).map((i) => `${siteUrl()}${i.path}`);
  const [listing] = await sql<{ offer_id: string | null; listing_id: string | null; category_id: string | null }[]>`select offer_id, listing_id, category_id from ebay_listings where product_id = ${p.id}`;

  // Category: keep the one chosen before, else take eBay's first suggestion for the title.
  let categoryId = listing?.category_id ?? null;
  if (!categoryId) {
    const tree = await ebay<{ categoryTreeId: string }>(`/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${a!.marketplace_id}`);
    const sug = await ebay<{ categorySuggestions?: { category: { categoryId: string; categoryName: string } }[] }>(
      `/commerce/taxonomy/v1/category_tree/${tree.categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(p.name.slice(0, 80))}`);
    categoryId = sug.categorySuggestions?.[0]?.category.categoryId ?? null;
    if (!categoryId) {
      await setListing(p.id, p.sku, { status: 'needs_info', last_error: 'eBay suggested no category for this name. Make the name more specific.' });
      throw new EbayError('No eBay category found.', 400, true);
    }
    await setListing(p.id, p.sku, { category_id: categoryId });
  }

  // Condition must be one this category allows.
  const ebayCondition = conditions.find((c) => c.value === p.condition)!.ebay;
  const policy = await ebay<{ itemConditionPolicies?: { itemConditions?: { conditionId: string; conditionDescription: string }[] }[] }>(
    `/sell/metadata/v1/marketplace/${a!.marketplace_id}/get_item_condition_policies?filter=categoryIds:{${categoryId}}`);
  const allowedIds = new Set(policy.itemConditionPolicies?.[0]?.itemConditions?.map((c) => c.conditionId) ?? []);
  const conditionIds: Record<string, string> = { NEW: '1000', NEW_OTHER: '1500', LIKE_NEW: '2750', USED_GOOD: '3000', USED_ACCEPTABLE: '3000', FOR_PARTS_OR_NOT_WORKING: '7000' };
  if (allowedIds.size && !allowedIds.has(conditionIds[ebayCondition])) {
    await setListing(p.id, p.sku, { status: 'needs_info', last_error: `eBay does not allow "${p.condition}" in this category. Choose another condition or category.` });
    throw new EbayError('Condition not allowed in category.', 400, true);
  }

  // Required item specifics: fill what we know; name the rest.
  const tree = await ebay<{ categoryTreeId: string }>(`/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${a!.marketplace_id}`);
  const aspects = await ebay<{ aspects?: { localizedAspectName: string; aspectConstraint?: { aspectRequired?: boolean } }[] }>(
    `/commerce/taxonomy/v1/category_tree/${tree.categoryTreeId}/get_item_aspects_for_category?category_id=${categoryId}`);
  const known: Record<string, string | null> = { Brand: p.brand, MPN: p.model, Model: p.model, UPC: p.upc };
  const itemAspects: Record<string, string[]> = {};
  const missing: string[] = [];
  for (const asp of aspects.aspects ?? []) {
    const v = known[asp.localizedAspectName];
    if (v) itemAspects[asp.localizedAspectName] = [v];
    else if (asp.aspectConstraint?.aspectRequired) {
      if (['Brand'].includes(asp.localizedAspectName)) itemAspects.Brand = ['Unbranded'];
      else if (['MPN', 'Model'].includes(asp.localizedAspectName)) itemAspects[asp.localizedAspectName] = ['Does Not Apply'];
      else missing.push(asp.localizedAspectName);
    }
  }
  if (missing.length) {
    await setListing(p.id, p.sku, { status: 'needs_info', last_error: `eBay needs these details for this category: ${missing.join(', ')}. Add them to the description or ask to have them added as fields.` });
    throw new EbayError(`Missing item specifics: ${missing.join(', ')}`, 400, true);
  }

  const price = ebayPrice(p.price_cents, p.ebay_price_cents, a!.markup_bps, a!.markup_cents);
  const qty = Math.max(0, p.available);
  await ebay(`/sell/inventory/v1/inventory_item/${encodeURIComponent(p.sku)}`, {
    method: 'PUT',
    body: {
      availability: { shipToLocationAvailability: { quantity: qty } },
      condition: ebayCondition,
      ...(p.defects || p.missing ? { conditionDescription: [p.defects, p.missing && `Missing: ${p.missing}`].filter(Boolean).join('. ').slice(0, 1000) } : {}),
      product: { title: p.name.slice(0, 80), description: describe(p), imageUrls: images, aspects: itemAspects, ...(p.brand ? { brand: p.brand } : {}), ...(p.model ? { mpn: p.model } : {}), ...(p.upc ? { upc: [p.upc] } : {}) },
      packageWeightAndSize: { weight: { value: p.weight_oz, unit: 'OUNCE' } },
    },
  });

  const offerBody = {
    sku: p.sku, marketplaceId: a!.marketplace_id, format: 'FIXED_PRICE', availableQuantity: qty, categoryId,
    listingDescription: describe(p), merchantLocationKey: a!.location_key,
    listingPolicies: { fulfillmentPolicyId: a!.fulfillment_policy_id, paymentPolicyId: a!.payment_policy_id, returnPolicyId: a!.return_policy_id },
    pricingSummary: { price: { value: dollars(price), currency: 'USD' } },
  };
  let offerId = listing?.offer_id ?? null;
  if (!offerId) {
    // An offer may already exist from an earlier attempt that failed before saving its id: reuse it instead of duplicating.
    const existing = await ebay<{ offers?: { offerId: string }[] }>(`/sell/inventory/v1/offer?sku=${encodeURIComponent(p.sku)}&marketplace_id=${a!.marketplace_id}`).catch(() => ({ offers: [] }));
    offerId = existing.offers?.[0]?.offerId ?? (await ebay<{ offerId: string }>('/sell/inventory/v1/offer', { method: 'POST', body: offerBody })).offerId;
    await setListing(p.id, p.sku, { offer_id: offerId });
  } else {
    await ebay(`/sell/inventory/v1/offer/${offerId}`, { method: 'PUT', body: offerBody });
  }
  let listingId = listing?.listing_id ?? null;
  if (!listingId && qty > 0) listingId = (await ebay<{ listingId: string }>(`/sell/inventory/v1/offer/${offerId}/publish`, { method: 'POST' })).listingId;
  await setListing(p.id, p.sku, { status: 'published', listing_id: listingId, quantity: qty, price_cents: price, last_error: null });
}

/** Pushes the current available quantity and price to eBay in one call. 0 makes the listing show as sold out. */
export async function syncQuantity(productId: number) {
  const p = await loadProduct(productId);
  const [l] = await sql<{ offer_id: string | null; status: string }[]>`select offer_id, status from ebay_listings where product_id = ${productId}`;
  if (!p || !l?.offer_id || l.status !== 'published') return;
  const a = await account();
  const qty = p.status === 'active' && p.sell_on_ebay ? Math.max(0, p.available) : 0;
  const price = ebayPrice(p.price_cents, p.ebay_price_cents, a!.markup_bps, a!.markup_cents);
  const res = await ebay<{ responses?: { statusCode: number; errors?: { message: string }[] }[] }>('/sell/inventory/v1/bulk_update_price_quantity', {
    method: 'POST',
    body: { requests: [{ sku: p.sku, shipToLocationAvailability: { quantity: qty }, offers: [{ offerId: l.offer_id, availableQuantity: qty, price: { value: dollars(price), currency: 'USD' } }] }] },
  });
  const bad = res.responses?.find((r) => r.statusCode >= 400);
  if (bad) throw new EbayError(bad.errors?.[0]?.message ?? 'eBay rejected the quantity update.', bad.statusCode, bad.statusCode !== 429 && bad.statusCode < 500);
  await sql`update ebay_listings set quantity = ${qty}, price_cents = ${price}, synced_at = now() where product_id = ${productId}`;
}

export async function withdrawProduct(productId: number) {
  const [l] = await sql<{ offer_id: string | null; status: string }[]>`select offer_id, status from ebay_listings where product_id = ${productId}`;
  if (!l) return;
  if (l.offer_id && l.status === 'published') await ebay(`/sell/inventory/v1/offer/${l.offer_id}/withdraw`, { method: 'POST' });
  await sql`update ebay_listings set status = 'withdrawn', listing_id = null, synced_at = now() where product_id = ${productId}`;
}

type EbayOrder = {
  orderId: string; orderPaymentStatus: string; creationDate: string; cancelStatus?: { cancelState?: string };
  buyer?: { username?: string }; pricingSummary?: { total?: { value: string }; deliveryCost?: { value: string }; priceSubtotal?: { value: string } };
  totalMarketplaceFee?: { value: string };
  fulfillmentStartInstructions?: { shippingStep?: { shipTo?: { fullName?: string; contactAddress?: { addressLine1?: string; addressLine2?: string; city?: string; stateOrProvince?: string; postalCode?: string } } } }[];
  lineItems: { lineItemId: string; sku?: string; title: string; quantity: number; lineItemCost: { value: string } }[];
};
const toCents = (v?: string) => Math.round(Number(v ?? 0) * 100);

/**
 * Pulls eBay orders changed since the last sync (with a 10-minute overlap so none are missed) and records each paid
 * one as a sale here: stock goes down and the website stops selling what sold on eBay. Orders are keyed by eBay's
 * order id, so seeing one twice changes nothing. If an eBay sale needs more units than are left here (it sold on
 * both channels at once), the shortfall is recorded as an oversell for the owner instead of going below zero.
 */
export async function syncOrders() {
  const a = await account();
  if (!a?.connected_at) return { imported: 0 };
  const since = new Date((a.last_order_sync_at?.getTime() ?? Date.now() - 7 * 86400_000) - 10 * 60_000).toISOString();
  const started = new Date();
  let imported = 0;
  let offset = 0;
  for (;;) {
    const page = await ebay<{ orders?: EbayOrder[]; total?: number }>(`/sell/fulfillment/v1/order?filter=${encodeURIComponent(`lastmodifieddate:[${since}..]`)}&limit=50&offset=${offset}`);
    for (const o of page.orders ?? []) imported += (await recordEbayOrder(o)) ? 1 : 0;
    offset += 50;
    if (!page.orders?.length || offset >= (page.total ?? 0)) break;
  }
  await sql`update ebay_account set last_order_sync_at = ${started} where id = 1`;
  return { imported };
}

export async function recordEbayOrder(o: EbayOrder) {
  const [existing] = await sql<{ id: string; status: string }[]>`select id, status from orders where channel = 'ebay' and external_id = ${o.orderId}`;
  const cancelled = o.cancelStatus?.cancelState === 'CANCELED';
  if (existing) {
    if (cancelled && existing.status === 'paid') await restockCancelledEbayOrder(existing.id);
    return false;
  }
  if (o.orderPaymentStatus !== 'PAID' || cancelled) return false;
  // Match each line to a product by the SKU this system gave eBay (imported listings keep eBay's own SKU).
  const skus = o.lineItems.map((li) => li.sku ?? '').filter(Boolean);
  const known = skus.length ? await sql<{ sku: string; product_id: number }[]>`select sku, product_id from ebay_listings where sku = any(${skus})` : [];
  const lines = o.lineItems
    .map((li) => ({ li, productId: known.find((k) => k.sku === li.sku)?.product_id ?? /^HH-(\d+)$/.exec(li.sku ?? '')?.[1] }))
    .filter((x) => x.productId);
  if (!lines.length) return false; // not one of ours (listed outside this system)
  const ship = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
  const touched: number[] = [];
  await sql.begin(async (tx) => {
    const [ord] = await tx<{ id: string }[]>`
      insert into orders (access_token, channel, external_id, status, name, fulfillment, ship_address1, ship_address2, ship_city, ship_state, ship_zip,
                          subtotal_cents, shipping_cents, tax_cents, total_cents, fees_cents, payment_provider, paid_at, created_at)
      values (${randomBytes(24).toString('base64url')}, 'ebay', ${o.orderId}, 'paid', ${ship?.fullName ?? o.buyer?.username ?? null}, 'ship',
              ${ship?.contactAddress?.addressLine1 ?? null}, ${ship?.contactAddress?.addressLine2 ?? null}, ${ship?.contactAddress?.city ?? null},
              ${ship?.contactAddress?.stateOrProvince ?? null}, ${ship?.contactAddress?.postalCode ?? null},
              ${toCents(o.pricingSummary?.priceSubtotal?.value)}, ${toCents(o.pricingSummary?.deliveryCost?.value)}, 0, ${toCents(o.pricingSummary?.total?.value)},
              ${toCents(o.totalMarketplaceFee?.value)}, 'ebay', ${o.creationDate}, ${o.creationDate})
      on conflict (channel, external_id) where external_id is not null do nothing
      returning id`;
    if (!ord) return; // another sync got there first
    for (const { li, productId } of lines.sort((x, y) => Number(x.productId) - Number(y.productId))) {
      const id = Number(productId);
      const [p] = await tx<{ stock: number }[]>`select stock from products where id = ${id} for update`;
      if (!p) continue;
      const take = Math.min(p.stock, li.quantity);
      await tx`insert into order_items (order_id, product_id, name, price_cents, qty, external_line_id)
               values (${ord.id}, ${id}, ${li.title.slice(0, 200)}, ${Math.round(toCents(li.lineItemCost.value) / li.quantity)}, ${li.quantity}, ${li.lineItemId})`;
      if (take > 0) {
        await tx`update products set stock = stock - ${take}, updated_at = now() where id = ${id}`;
        await tx`insert into inventory_events (product_id, delta, reason, order_id) values (${id}, ${-take}, 'sale_ebay', ${ord.id})`;
      }
      if (take < li.quantity) await tx`insert into oversells (product_id, order_id, wanted, had) values (${id}, ${ord.id}, ${li.quantity}, ${p.stock})`;
      touched.push(id);
    }
    await audit(null, 'ebay.order_imported', 'order', ord.id, { ebayOrder: o.orderId }, tx);
  });
  for (const id of touched) await enqueue('ebay.sync_quantity', { productId: id }, { dedupeKey: `ebay.qty:${id}` });
  return true;
}

async function restockCancelledEbayOrder(orderId: string) {
  await sql.begin(async (tx) => {
    const items = await tx<{ product_id: number; delta: number }[]>`
      select product_id, -sum(delta)::int as delta from inventory_events where order_id = ${orderId} and reason = 'sale_ebay' group by product_id order by product_id`;
    for (const i of items) {
      await tx`update products set stock = stock + ${i.delta}, updated_at = now() where id = ${i.product_id}`;
      await tx`insert into inventory_events (product_id, delta, reason, order_id, note) values (${i.product_id}, ${i.delta}, 'cancel', ${orderId}, 'Cancelled on eBay')`;
    }
    await tx`update orders set status = 'cancelled', fulfillment_status = 'cancelled' where id = ${orderId}`;
    await audit(null, 'ebay.order_cancelled', 'order', orderId, undefined, tx);
  });
}

/** Tells eBay an order shipped, with its tracking number, so the buyer sees it and eBay releases the payout. */
export async function reportShipment(orderId: string) {
  const [o] = await sql<{ external_id: string; tracking_carrier: string | null; tracking_number: string | null }[]>`
    select external_id, tracking_carrier, tracking_number from orders where id = ${orderId} and channel = 'ebay'`;
  if (!o?.tracking_number) return;
  const lines = await sql<{ external_line_id: string; qty: number }[]>`select external_line_id, qty from order_items where order_id = ${orderId} and external_line_id is not null`;
  await ebay(`/sell/fulfillment/v1/order/${o.external_id}/shipping_fulfillment`, {
    method: 'POST',
    body: { lineItems: lines.map((l) => ({ lineItemId: l.external_line_id, quantity: l.qty })), shippedDate: new Date().toISOString(), shippingCarrierCode: o.tracking_carrier, trackingNumber: o.tracking_number },
  });
}

// Setup helpers for the eBay page ---------------------------------------------------------------------------------

export async function listPolicies() {
  const a = await account();
  const m = a?.marketplace_id ?? 'EBAY_US';
  const [f, p, r] = await Promise.all([
    ebay<{ fulfillmentPolicies?: { fulfillmentPolicyId: string; name: string }[] }>(`/sell/account/v1/fulfillment_policy?marketplace_id=${m}`),
    ebay<{ paymentPolicies?: { paymentPolicyId: string; name: string }[] }>(`/sell/account/v1/payment_policy?marketplace_id=${m}`),
    ebay<{ returnPolicies?: { returnPolicyId: string; name: string }[] }>(`/sell/account/v1/return_policy?marketplace_id=${m}`),
  ]);
  return {
    fulfillment: (f.fulfillmentPolicies ?? []).map((x) => ({ id: x.fulfillmentPolicyId, name: x.name })),
    payment: (p.paymentPolicies ?? []).map((x) => ({ id: x.paymentPolicyId, name: x.name })),
    returns: (r.returnPolicies ?? []).map((x) => ({ id: x.returnPolicyId, name: x.name })),
  };
}

/** Creates (or keeps) the ship-from location eBay requires on every offer. */
export async function saveLocation(postal: string, city: string, state: string) {
  const key = 'hh-store';
  await ebay(`/sell/inventory/v1/location/${key}`, {
    method: 'POST',
    body: { location: { address: { postalCode: postal, city, stateOrProvince: state, country: 'US' } }, name: 'H&H Outlet', merchantLocationStatus: 'ENABLED', locationTypes: ['STORE'] },
  }).catch((e) => { if (!(e instanceof EbayError && e.status === 409)) throw e; }); // 409: already exists
  await sql`update ebay_account set location_key = ${key}, location_postal = ${postal}, location_city = ${city}, location_state = ${state} where id = 1`;
}

/**
 * Brings listings made directly on eBay into this system. eBay requires them to be moved to its Inventory API first
 * (bulk_migrate_listing, up to 5 listing ids per call); each moved listing becomes a draft here for the owner to
 * check and publish on the website. Listings eBay refuses to move are reported with eBay's reason.
 */
export async function importListings(listingIds: string[]) {
  const results: { listingId: string; ok: boolean; message: string }[] = [];
  for (let i = 0; i < listingIds.length; i += 5) {
    const batch = listingIds.slice(i, i + 5);
    const res = await ebay<{ responses?: { listingId: string; statusCode: number; inventoryItems?: { sku: string; offerId: string }[]; errors?: { message: string }[] }[] }>(
      '/sell/inventory/v1/bulk_migrate_listing', { method: 'POST', body: { requests: batch.map((listingId) => ({ listingId })) } });
    for (const r of res.responses ?? []) {
      if (r.statusCode >= 400 || !r.inventoryItems?.length) { results.push({ listingId: r.listingId, ok: false, message: r.errors?.[0]?.message ?? 'eBay could not move this listing.' }); continue; }
      for (const it of r.inventoryItems) {
        const item = await ebay<{ product?: { title?: string; description?: string; brand?: string; mpn?: string; upc?: string[] }; availability?: { shipToLocationAvailability?: { quantity?: number } } }>(
          `/sell/inventory/v1/inventory_item/${encodeURIComponent(it.sku)}`);
        const offer = await ebay<{ pricingSummary?: { price?: { value: string } }; categoryId?: string }>(`/sell/inventory/v1/offer/${it.offerId}`);
        const [{ id }] = await sql<{ id: number }[]>`select nextval('product_ids')::int as id`;
        const name = (item.product?.title ?? `eBay listing ${r.listingId}`).slice(0, 120);
        await sql.begin(async (tx) => {
          await tx`
            insert into products (id, slug, sku, name, price_cents, stock, category, image, alt, description, brand, model, upc, status, sell_on_web, sell_on_ebay)
            values (${id}, ${'ebay-' + id}, ${'HH-' + id}, ${name}, ${toCents(offer.pricingSummary?.price?.value)}, ${item.availability?.shipToLocationAvailability?.quantity ?? 0},
                    'home', '', ${name}, ${item.product?.description?.replace(/<[^>]+>/g, ' ').slice(0, 4000) ?? null}, ${item.product?.brand ?? null}, ${item.product?.mpn ?? null},
                    ${item.product?.upc?.[0] ?? null}, 'draft', true, true)`;
          await tx`insert into ebay_listings (product_id, sku, offer_id, listing_id, category_id, status) values (${id}, ${it.sku}, ${it.offerId}, ${r.listingId}, ${offer.categoryId ?? null}, 'published')`;
          await tx`insert into inventory_events (product_id, delta, reason, note) values (${id}, ${item.availability?.shipToLocationAvailability?.quantity ?? 0}, 'listed', ${'Imported from eBay listing ' + r.listingId})`;
        });
        results.push({ listingId: r.listingId, ok: true, message: `Imported as draft "${name}". Add a photo and category, then publish.` });
      }
    }
  }
  return results;
}
