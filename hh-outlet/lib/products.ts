import { sql } from './db';
import { thumb } from './images';

export type Product = {
  id: number;
  slug: string;
  name: string;
  priceCents: number;
  retailCents: number | null;
  available: number; // stock on hand minus active holds
  category: string;
  image: string; // main photo at product-page size
  thumb: string; // main photo at grid size
  alt: string;
  condition: string | null;
  pickupOnly: boolean;
  addedAt: string;
};

export type ProductDetail = Product & {
  description: string | null; brand: string | null; model: string | null;
  tested: 'works' | 'not_working' | 'untested' | null; packaging: 'original' | 'damaged' | 'none' | null;
  included: string | null; missing: string | null; defects: string | null;
  images: { path: string; width: number | null; height: number | null }[];
};

export function savings(p: Pick<Product, 'priceCents' | 'retailCents'>) {
  if (!p.retailCents || p.retailCents <= p.priceCents) return null;
  const cents = p.retailCents - p.priceCents;
  return { cents, percent: Math.round((cents / p.retailCents) * 100) };
}

type Row = {
  id: number; slug: string; name: string; price_cents: number; retail_cents: number | null; available: number;
  category: string; image: string; alt: string; condition: string | null; pickup_only: boolean; added_at: Date;
};

const toProduct = (r: Row): Product => ({
  id: r.id, slug: r.slug, name: r.name, priceCents: r.price_cents, retailCents: r.retail_cents, available: Number(r.available),
  category: r.category, image: r.image, thumb: thumb(r.image), alt: r.alt, condition: r.condition, pickupOnly: r.pickup_only,
  addedAt: r.added_at.toISOString(),
});

// What shoppers can see: published, for sale on the website, with a photo. Available stock counts holds that have not
// expired; an expired hold frees its units without a cleanup job.
const base = sql`
  select p.id, p.slug, p.name, p.price_cents, p.retail_cents, p.category, p.image, p.alt, p.condition, p.pickup_only, p.added_at,
         p.stock - coalesce((select sum(r.qty) from reservations r
                             where r.product_id = p.id and r.status = 'active' and r.expires_at > now()), 0) as available
  from products p
  where p.active and p.status = 'active' and p.sell_on_web and p.image <> ''`;

export async function listProducts(opts: { category?: string; maxPriceCents?: number; inStockOnly?: boolean; limit?: number } = {}) {
  const rows = await sql<Row[]>`
    select * from (${base}) x
    where true
      ${opts.category ? sql`and category = ${opts.category}` : sql``}
      ${opts.maxPriceCents != null ? sql`and price_cents <= ${opts.maxPriceCents}` : sql``}
      ${opts.inStockOnly !== false ? sql`and available > 0` : sql``}
    order by added_at desc, id desc
    ${opts.limit ? sql`limit ${opts.limit}` : sql``}`;
  return rows.map(toProduct);
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  const rows = await sql<Row[]>`select * from (${base}) x where slug = ${slug}`;
  if (!rows[0]) return null;
  const [d] = await sql<Omit<ProductDetail, keyof Product | 'images'>[]>`
    select description, brand, model, tested, packaging, included, missing, defects from products where id = ${rows[0].id}`;
  const images = await sql<{ path: string; width: number | null; height: number | null }[]>`
    select path, width, height from product_images where product_id = ${rows[0].id} order by position, id`;
  const p = toProduct(rows[0]);
  return { ...p, ...d, images: images.length ? images : [{ path: p.image, width: null, height: null }] };
}

export async function getProductsByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await sql<Row[]>`select * from (${base}) x where id = any(${ids})`;
  return rows.map(toProduct);
}

/**
 * Matches every word against the name, brand, model, barcode, category and description. A trailing "s" is
 * dropped so "toys" finds "toy". Every search is logged, so the owner can see what people look for and don't find.
 */
export async function searchProducts(q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8).map((w) => w.replace(/s$/, ''));
  if (!words.length) return [];
  const filters = words.reduce(
    (acc, w) => sql`${acc} and lower(concat_ws(' ', p.name, p.brand, p.model, p.upc, p.category, p.description)) like ${'%' + w.replace(/[%_\\]/g, '\\$&') + '%'}`,
    sql``,
  );
  const rows = await sql<Row[]>`
    select x.* from (${base}) x join products p using (id)
    where x.available > 0 ${filters}
    order by x.added_at desc limit 200`;
  const results = rows.map(toProduct);
  await sql`insert into search_log (q, results) values (${q.slice(0, 100)}, ${results.length})`.catch(() => {});
  return results;
}

export async function relatedProducts(p: Product, n = 8) {
  const all = (await listProducts({ limit: 200 })).filter((x) => x.id !== p.id);
  const same = all.filter((x) => x.category === p.category);
  const near = all.filter((x) => x.category !== p.category && Math.abs(x.priceCents - p.priceCents) <= 1000);
  return [...same, ...near].slice(0, n);
}

export async function recordEvent(productIds: number[], kind: 'impression' | 'view' | 'add_to_bag', visitor: string | null) {
  if (!productIds.length) return;
  await sql`insert into product_events (product_id, kind, visitor) select unnest(${productIds}::int[]), ${kind}, ${visitor}`.catch(() => {});
}
