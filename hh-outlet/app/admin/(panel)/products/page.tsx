import type { Metadata } from 'next';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { thumb } from '@/lib/images';
import { BulkTable, type Row } from './BulkTable';

export const metadata: Metadata = { title: 'Stock' };

const statuses = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Live' }, { value: 'draft', label: 'Drafts' },
  { value: 'low', label: 'Low stock' }, { value: 'sold_out', label: 'Sold out' }, { value: 'archived', label: 'Archived' },
];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; age?: string }> }) {
  const { q = '', status = 'all', age = '' } = await searchParams;
  const like = `%${q.trim().toLowerCase().replace(/[%_\\]/g, '\\$&')}%`;
  const ageDays = Number.parseInt(age, 10);
  const rows = await sql<Row[]>`
    select p.id, p.name, p.sku, p.image, p.price_cents, p.stock, p.status, p.condition, p.location, p.sell_on_ebay, p.category,
           extract(day from now() - p.added_at)::int as age_days, el.status as ebay_status,
           (select count(*)::int from product_events e where e.product_id = p.id and e.kind = 'view' and e.created_at > now() - interval '30 days') as views_30d
    from products p left join ebay_listings el on el.product_id = p.id
    where true
      ${q.trim() ? sql`and lower(concat_ws(' ', p.name, p.sku, p.upc, p.brand, p.model, p.location)) like ${like}` : sql``}
      ${status === 'active' ? sql`and p.status = 'active' and p.stock > 0` : sql``}
      ${status === 'draft' ? sql`and p.status = 'draft'` : sql``}
      ${status === 'archived' ? sql`and p.status = 'archived'` : sql``}
      ${status === 'sold_out' ? sql`and p.status = 'active' and p.stock = 0` : sql``}
      ${status === 'low' ? sql`and p.status = 'active' and p.stock between 1 and 2` : sql``}
      ${status === 'all' ? sql`and p.status <> 'archived'` : sql``}
      ${Number.isFinite(ageDays) && ageDays > 0 ? sql`and p.added_at < now() - make_interval(days => ${ageDays}) and p.stock > 0` : sql``}
    order by p.updated_at desc, p.id desc
    limit 300`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Stock</h1>
        <Link href="/admin/list" className="flex h-11 items-center rounded-lg bg-gold px-4 font-semibold text-ground hover:bg-gold-soft">List an item</Link>
      </div>
      <form className="mt-3 flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search stock</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name, SKU, barcode, shelf" className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[16px]" />
        <input type="hidden" name="status" value={status} />
        <button className="h-11 rounded-lg border border-line px-4 hover:border-gold">Search</button>
      </form>
      <nav aria-label="Filter" className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
        {statuses.map((s) => (
          <Link key={s.value} href={`/admin/products?status=${s.value}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${status === s.value && !age ? 'border-gold bg-gold font-semibold text-ground' : 'border-line'}`}>{s.label}</Link>
        ))}
        {[30, 60, 90].map((d) => (
          <Link key={d} href={`/admin/products?status=active&age=${d}`} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${age === String(d) ? 'border-gold bg-gold font-semibold text-ground' : 'border-line'}`}>Older than {d} days</Link>
        ))}
      </nav>
      <BulkTable rows={rows.map((r) => ({ ...r, image: r.image ? thumb(r.image) : '' }))} />
    </div>
  );
}
