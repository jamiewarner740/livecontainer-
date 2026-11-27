import postgres from 'postgres';
import { seedProducts } from '../db/seed-products';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { onnotice: () => {} });

// Inserts the seed products once. Existing products are left alone so stock changes from sales are never undone.
let added = 0;
for (const p of seedProducts) {
  const r = await sql`
    insert into products (id, slug, name, price_cents, retail_cents, stock, category, image, alt, condition, added_at)
    values (${p.id}, ${p.slug}, ${p.name}, ${p.priceCents}, ${p.retailCents ?? null}, ${p.stock}, ${p.category}, ${p.image}, ${p.alt}, ${p.condition ?? null}, ${p.addedAt})
    on conflict (id) do nothing returning id`;
  if (r.length) {
    added++;
    await sql`insert into inventory_events (product_id, delta, reason) values (${p.id}, ${p.stock}, 'seed')`;
  }
}
console.log(`seeded ${added} new products (${seedProducts.length - added} already present)`);
await sql.end();
