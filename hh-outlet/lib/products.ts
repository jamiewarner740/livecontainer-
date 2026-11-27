import { sql } from './db';

export type Product = {
  id: number;
  slug: string;
  name: string;
  priceCents: number;
  retailCents: number | null;
  available: number; // stock on hand minus active holds
  category: string;
  image: string;
  alt: string;
  condition: string | null;
  addedAt: string;
};

export function savings(p: Pick<Product, 'priceCents' | 'retailCents'>) {
  if (!p.retailCents || p.retailCents <= p.priceCents) return null;
  const cents = p.retailCents - p.priceCents;
  return { cents, percent: Math.round((cents / p.retailCents) * 100) };
}

type Row = {
  id: number; slug: string; name: string; price_cents: number; retail_cents: number | null; available: number;
  category: string; image: string; alt: string; condition: string | null; added_at: Date;
};

const toProduct = (r: Row): Product => ({
  id: r.id, slug: r.slug, name: r.name, priceCents: r.price_cents, retailCents: r.retail_cents, available: Number(r.available),
  category: r.category, image: r.image, alt: r.alt, condition: r.condition, addedAt: r.added_at.toISOString(),
});

// Available stock counts holds that have not expired; an expired hold frees its units without a cleanup job.
const base = sql`
  select p.id, p.slug, p.name, p.price_cents, p.retail_cents, p.category, p.image, p.alt, p.condition, p.added_at,
         p.stock - coalesce((select sum(r.qty) from reservations r
                             where r.product_id = p.id and r.status = 'active' and r.expires_at > now()), 0) as available
  from products p
  where p.active`;

export async function listProducts(opts: { category?: string; maxPriceCents?: number; inStockOnly?: boolean } = {}) {
  const rows = await sql<Row[]>`
    select * from (${base}) x
    where true
      ${opts.category ? sql`and category = ${opts.category}` : sql``}
      ${opts.maxPriceCents != null ? sql`and price_cents <= ${opts.maxPriceCents}` : sql``}
      ${opts.inStockOnly !== false ? sql`and available > 0` : sql``}
    order by added_at desc, id desc`;
  return rows.map(toProduct);
}

export async function getProduct(slug: string) {
  const rows = await sql<Row[]>`select * from (${base}) x where slug = ${slug}`;
  return rows[0] ? toProduct(rows[0]) : null;
}

export async function getProductsByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await sql<Row[]>`select * from (${base}) x where id = any(${ids})`;
  return rows.map(toProduct);
}

export async function searchProducts(q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const all = await listProducts();
  return all.filter((p) => words.every((w) => `${p.name} ${p.category}`.toLowerCase().includes(w.replace(/s$/, ''))));
}

export async function relatedProducts(p: Product, n = 8) {
  const all = (await listProducts()).filter((x) => x.id !== p.id);
  const same = all.filter((x) => x.category === p.category);
  const near = all.filter((x) => x.category !== p.category && Math.abs(x.priceCents - p.priceCents) <= 1000);
  return [...same, ...near].slice(0, n);
}
