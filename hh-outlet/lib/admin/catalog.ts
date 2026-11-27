import { sql, type Db } from '../db';
import { audit } from '../audit';
import { enqueue } from '../jobs';
import { deleteProductPhoto } from '../images';
import { isCondition } from '../conditions';
import { categories } from '../store';
import type { Staff } from '../auth';

type Tx = Db;

export type ListingInput = {
  name: string;
  category: string;
  priceCents: number;
  retailCents?: number | null;
  quantity: number;
  condition?: string | null;
  tested?: 'works' | 'not_working' | 'untested' | null;
  packaging?: 'original' | 'damaged' | 'none' | null;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  upc?: string | null;
  included?: string | null;
  missing?: string | null;
  defects?: string | null;
  location?: string | null;
  palletId?: number | null;
  costCents?: number | null;
  weightOz?: number | null;
  pickupOnly?: boolean;
  sellOnWeb?: boolean;
  sellOnEbay?: boolean;
  status: 'draft' | 'active';
};

export class ListingError extends Error {
  constructor(public fields: Record<string, string>) {
    super(Object.values(fields)[0]);
  }
}

export function validateListing(i: ListingInput) {
  const f: Record<string, string> = {};
  if (!i.name || i.name.trim().length < 3) f.name = 'Write a name of at least 3 characters.';
  if (i.name && i.name.length > 120) f.name = 'Keep the name under 120 characters.';
  if (!categories.some((c) => c.slug === i.category)) f.category = 'Choose a category.';
  if (!Number.isInteger(i.priceCents) || i.priceCents <= 0) f.price = 'Enter a price above $0.';
  if (i.retailCents != null && i.retailCents <= i.priceCents) f.retail = 'Retail must be higher than your price, or leave it empty.';
  if (!Number.isInteger(i.quantity) || i.quantity < 0 || i.quantity > 9999) f.quantity = 'Enter a quantity from 0 to 9999.';
  if (i.status === 'active' && !i.condition) f.condition = 'Choose the condition before publishing.';
  if (i.condition && !isCondition(i.condition)) f.condition = 'Choose one of the listed conditions.';
  if (i.upc && !/^\d{8,14}$/.test(i.upc)) f.upc = 'A barcode is 8 to 14 digits.';
  return f;
}

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';

/** Creates a listing with its photos. Stock goes in as a 'listed' inventory event, so the history starts at the first unit. */
export async function createListing(input: ListingInput, photos: { path: string; width: number; height: number }[], staff: Staff) {
  const errors = validateListing(input);
  if (input.status === 'active' && photos.length === 0) errors.photos = 'Add at least one photo before publishing.';
  if (Object.keys(errors).length) throw new ListingError(errors);

  const id = await sql.begin(async (tx) => {
    const [{ id }] = await tx<{ id: number }[]>`select nextval('product_ids')::int as id`;
    const slug = `${slugify(input.name)}-${id}`;
    await tx`
      insert into products (id, slug, sku, name, price_cents, retail_cents, stock, category, image, alt, condition, tested, packaging,
        description, brand, model, upc, included, missing, defects, location, pallet_id, cost_cents, weight_oz, pickup_only,
        sell_on_web, sell_on_ebay, status, added_at)
      values (${id}, ${slug}, ${'HH-' + id}, ${input.name.trim()}, ${input.priceCents}, ${input.retailCents ?? null}, ${input.quantity},
        ${input.category}, ${photos[0]?.path ?? ''}, ${input.name.trim()}, ${input.condition ?? null}, ${input.tested ?? null},
        ${input.packaging ?? null}, ${input.description ?? null}, ${input.brand ?? null}, ${input.model ?? null}, ${input.upc ?? null},
        ${input.included ?? null}, ${input.missing ?? null}, ${input.defects ?? null}, ${input.location ?? null}, ${input.palletId ?? null},
        ${input.costCents ?? null}, ${input.weightOz ?? null}, ${input.pickupOnly ?? false}, ${input.sellOnWeb ?? true},
        ${input.sellOnEbay ?? false}, ${input.status}, now())`;
    for (const [i, p] of photos.entries()) {
      await tx`insert into product_images (product_id, path, width, height, position) values (${id}, ${p.path}, ${p.width}, ${p.height}, ${i})`;
    }
    if (input.quantity > 0) await tx`insert into inventory_events (product_id, delta, reason, staff_id) values (${id}, ${input.quantity}, 'listed', ${staff.id})`;
    await audit(staff.id, 'product.create', 'product', String(id), { name: input.name, price: input.priceCents, qty: input.quantity, status: input.status }, tx);
    if (input.status === 'active' && input.sellOnEbay) await enqueue('ebay.publish', { productId: id }, { dedupeKey: `ebay.publish:${id}`, tx });
    return id;
  });
  return id;
}

/** Edits a listing's details (not its stock: use adjustStock, which keeps the history). */
export async function updateListing(id: number, input: Omit<ListingInput, 'quantity'>, staff: Staff) {
  const errors = validateListing({ ...input, quantity: 0 });
  const [{ photos }] = await sql<{ photos: number }[]>`select count(*)::int as photos from product_images where product_id = ${id}`;
  const [{ legacy }] = await sql<{ legacy: boolean }[]>`select image <> '' as legacy from products where id = ${id}`;
  if (input.status === 'active' && photos === 0 && !legacy) errors.photos = 'Add at least one photo before publishing.';
  if (Object.keys(errors).length) throw new ListingError(errors);
  await sql.begin(async (tx) => {
    const [before] = await tx<{ price_cents: number; status: string; sell_on_ebay: boolean }[]>`select price_cents, status, sell_on_ebay from products where id = ${id} for update`;
    if (!before) throw new ListingError({ name: 'That listing no longer exists.' });
    await tx`
      update products set name = ${input.name.trim()}, alt = ${input.name.trim()}, category = ${input.category}, price_cents = ${input.priceCents},
        retail_cents = ${input.retailCents ?? null}, condition = ${input.condition ?? null}, tested = ${input.tested ?? null},
        packaging = ${input.packaging ?? null}, description = ${input.description ?? null}, brand = ${input.brand ?? null},
        model = ${input.model ?? null}, upc = ${input.upc ?? null}, included = ${input.included ?? null}, missing = ${input.missing ?? null},
        defects = ${input.defects ?? null}, location = ${input.location ?? null}, pallet_id = ${input.palletId ?? null},
        cost_cents = ${input.costCents ?? null}, weight_oz = ${input.weightOz ?? null}, pickup_only = ${input.pickupOnly ?? false},
        sell_on_web = ${input.sellOnWeb ?? true}, sell_on_ebay = ${input.sellOnEbay ?? false}, status = ${input.status}, updated_at = now()
      where id = ${id}`;
    if (before.price_cents !== input.priceCents) await audit(staff.id, 'product.price', 'product', String(id), { from: before.price_cents, to: input.priceCents }, tx);
    await audit(staff.id, 'product.update', 'product', String(id), { status: input.status }, tx);
    await syncEbayAfterChange(tx, id, { wasOnEbay: before.sell_on_ebay, nowOnEbay: !!input.sellOnEbay && input.status === 'active' });
  });
}

/**
 * Changes stock on hand by `delta` (found more, damaged, counted wrong). Refuses to go below what buyers are
 * holding in checkout right now, so an adjustment can't sell the same unit twice.
 */
export async function adjustStock(id: number, delta: number, reason: 'adjust' | 'return', note: string | null, staff: Staff) {
  if (!Number.isInteger(delta) || delta === 0) throw new ListingError({ delta: 'Enter a whole number other than 0.' });
  return sql.begin(async (tx) => {
    const [p] = await tx<{ stock: number }[]>`select stock from products where id = ${id} for update`;
    if (!p) throw new ListingError({ delta: 'That listing no longer exists.' });
    const [{ held }] = await tx<{ held: number }[]>`
      select coalesce(sum(qty), 0)::int as held from reservations where product_id = ${id} and status = 'active' and expires_at > now()`;
    if (p.stock + delta < held) throw new ListingError({ delta: `Only ${p.stock - held} can be removed: ${held} are in a buyer's checkout right now.` });
    await tx`update products set stock = stock + ${delta}, updated_at = now() where id = ${id}`;
    await tx`insert into inventory_events (product_id, delta, reason, staff_id, note) values (${id}, ${delta}, ${reason}, ${staff.id}, ${note})`;
    await audit(staff.id, 'inventory.adjust', 'product', String(id), { delta, reason, note }, tx);
    await enqueueEbayQuantity(tx, id);
    return p.stock + delta;
  });
}

export async function addPhotos(id: number, photos: { path: string; width: number; height: number }[], staff: Staff) {
  await sql.begin(async (tx) => {
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(position) + 1, 0)::int as next from product_images where product_id = ${id}`;
    for (const [i, p] of photos.entries()) {
      await tx`insert into product_images (product_id, path, width, height, position) values (${id}, ${p.path}, ${p.width}, ${p.height}, ${next + i})`;
    }
    await tx`update products set image = coalesce((select path from product_images where product_id = ${id} order by position limit 1), image), updated_at = now() where id = ${id}`;
    await audit(staff.id, 'product.photos_add', 'product', String(id), { count: photos.length }, tx);
  });
}

export async function removePhoto(id: number, imageId: number, staff: Staff) {
  const [img] = await sql<{ path: string }[]>`delete from product_images where id = ${imageId} and product_id = ${id} returning path`;
  if (!img) return;
  await sql`update products set image = coalesce((select path from product_images where product_id = ${id} order by position limit 1), ''), updated_at = now() where id = ${id}`;
  await deleteProductPhoto(img.path);
  await audit(staff.id, 'product.photo_remove', 'product', String(id));
}

export async function makeMainPhoto(id: number, imageId: number, staff: Staff) {
  await sql.begin(async (tx) => {
    await tx`update product_images set position = position + 1 where product_id = ${id}`;
    await tx`update product_images set position = 0 where id = ${imageId} and product_id = ${id}`;
    await tx`update products set image = (select path from product_images where id = ${imageId}), updated_at = now() where id = ${id}`;
    await audit(staff.id, 'product.photo_main', 'product', String(id), undefined, tx);
  });
}

export type BulkAction =
  | { kind: 'publish' } | { kind: 'unpublish' } | { kind: 'archive' }
  | { kind: 'category'; category: string }
  | { kind: 'price_percent'; percent: number } // -20 = 20% off
  | { kind: 'ebay_on' } | { kind: 'ebay_off' }
  | { kind: 'location'; location: string };

/**
 * Applies one change to many listings. Each listing is its own transaction, so one bad listing (say, missing a
 * condition) is reported and skipped while the rest go through.
 */
export async function bulkUpdate(ids: number[], action: BulkAction, staff: Staff) {
  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const id of ids.slice(0, 500)) {
    try {
      await sql.begin(async (tx) => {
        const [p] = await tx<{ id: number; condition: string | null; image: string; price_cents: number; sell_on_ebay: boolean; status: string }[]>`
          select id, condition, image, price_cents, sell_on_ebay, status from products where id = ${id} for update`;
        if (!p) throw new Error('Listing not found.');
        switch (action.kind) {
          case 'publish':
            if (!p.condition) throw new Error('Needs a condition before it can be published.');
            if (!p.image) throw new Error('Needs a photo before it can be published.');
            await tx`update products set status = 'active', updated_at = now() where id = ${id}`;
            if (p.sell_on_ebay) await enqueue('ebay.publish', { productId: id }, { dedupeKey: `ebay.publish:${id}`, tx });
            break;
          case 'unpublish':
          case 'archive':
            await tx`update products set status = ${action.kind === 'archive' ? 'archived' : 'draft'}, updated_at = now() where id = ${id}`;
            if (p.sell_on_ebay) await enqueue('ebay.withdraw', { productId: id }, { dedupeKey: `ebay.withdraw:${id}`, tx });
            break;
          case 'category':
            if (!categories.some((c) => c.slug === action.category)) throw new Error('Unknown category.');
            await tx`update products set category = ${action.category}, updated_at = now() where id = ${id}`;
            break;
          case 'price_percent': {
            if (!Number.isFinite(action.percent) || action.percent <= -95 || action.percent > 500) throw new Error('Use a change between -95% and +500%.');
            const next = Math.max(1, Math.round((p.price_cents * (100 + action.percent)) / 100));
            await tx`update products set price_cents = ${next}, updated_at = now() where id = ${id}`;
            await audit(staff.id, 'product.price', 'product', String(id), { from: p.price_cents, to: next, bulk: action.percent }, tx);
            await enqueueEbayQuantity(tx, id);
            break;
          }
          case 'ebay_on':
            await tx`update products set sell_on_ebay = true, updated_at = now() where id = ${id}`;
            if (p.status === 'active') await enqueue('ebay.publish', { productId: id }, { dedupeKey: `ebay.publish:${id}`, tx });
            break;
          case 'ebay_off':
            await tx`update products set sell_on_ebay = false, updated_at = now() where id = ${id}`;
            if (p.sell_on_ebay) await enqueue('ebay.withdraw', { productId: id }, { dedupeKey: `ebay.withdraw:${id}`, tx });
            break;
          case 'location':
            await tx`update products set location = ${action.location.trim() || null}, updated_at = now() where id = ${id}`;
            break;
        }
        await audit(staff.id, `bulk.${action.kind}`, 'product', String(id), action, tx);
      });
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

/** After any stock or price change, a listing that is on eBay gets its quantity and price pushed. */
export async function enqueueEbayQuantity(tx: Tx, productId: number) {
  const [l] = await tx<{ status: string }[]>`select status from ebay_listings where product_id = ${productId}`;
  if (l && l.status === 'published') await enqueue('ebay.sync_quantity', { productId }, { dedupeKey: `ebay.qty:${productId}`, tx });
}

async function syncEbayAfterChange(tx: Tx, id: number, s: { wasOnEbay: boolean; nowOnEbay: boolean }) {
  if (s.nowOnEbay) await enqueue('ebay.publish', { productId: id }, { dedupeKey: `ebay.publish:${id}`, tx });
  else if (s.wasOnEbay) await enqueue('ebay.withdraw', { productId: id }, { dedupeKey: `ebay.withdraw:${id}`, tx });
}
