import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { thumb } from '@/lib/images';
import { money } from '@/lib/store';
import { addPhotosAction, mainPhotoAction, removePhotoAction } from '../../../actions';
import { EditForm, StockForm, type EditValues } from './forms';

export const metadata: Metadata = { title: 'Edit listing' };

const reasonLabel: Record<string, string> = {
  seed: 'Imported', listed: 'Listed', sale_web: 'Sold online', sale_ebay: 'Sold on eBay', sale_store: 'Sold in store', adjust: 'Adjusted', return: 'Returned', cancel: 'Order cancelled',
};

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) notFound();
  const [p] = await sql<(EditValues & { id: number; slug: string; sku: string; stock: number; image: string; added_at: Date })[]>`
    select id, slug, sku, name, category, price_cents, retail_cents, stock, condition, tested, packaging, description, brand, model, upc,
           included, missing, defects, location, pallet_id, cost_cents, weight_oz, pickup_only, sell_on_web, sell_on_ebay, status, image, added_at
    from products where id = ${id}`;
  if (!p) notFound();
  const [{ held }] = await sql<{ held: number }[]>`select coalesce(sum(qty), 0)::int as held from reservations where product_id = ${id} and status = 'active' and expires_at > now()`;
  const images = await sql<{ id: number; path: string }[]>`select id, path from product_images where product_id = ${id} order by position, id`;
  const events = await sql<{ delta: number; reason: string; note: string | null; created_at: Date; staff: string | null; order_number: string | null }[]>`
    select e.delta, e.reason, e.note, e.created_at, s.name as staff, o.number::text as order_number
    from inventory_events e left join staff s on s.id = e.staff_id left join orders o on o.id = e.order_id
    where e.product_id = ${id} order by e.created_at desc limit 50`;
  const pallets = await sql<{ id: number; label: string }[]>`select id, label from pallets order by created_at desc limit 100`;
  const [ebay] = await sql<{ status: string; listing_id: string | null; last_error: string | null }[]>`select status, listing_id, last_error from ebay_listings where product_id = ${id}`;
  const [stats] = await sql<{ views: number; adds: number }[]>`
    select count(*) filter (where kind = 'view')::int as views, count(*) filter (where kind = 'add_to_bag')::int as adds
    from product_events where product_id = ${id}`;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/products" className="text-sm text-muted hover:text-gold-soft">← Stock</Link>
        <h1 className="mt-1 font-display text-2xl font-semibold">{p.name}</h1>
        <p className="text-sm text-muted">
          {p.sku} · listed {p.added_at.toLocaleDateString('en-US')} · {stats.views} views · {stats.adds} added to bag
          {p.status === 'active' && <> · <Link className="underline" href={`/products/${p.slug}`}>View in store</Link></>}
        </p>
      </div>

      <section aria-labelledby="stock" className="rounded-xl border border-line p-4">
        <h2 id="stock" className="font-semibold">Stock: {p.stock} on hand{held ? `, ${held} held in checkout` : ''}</h2>
        <StockForm id={id} />
      </section>

      <section aria-labelledby="photos" className="space-y-2">
        <h2 id="photos" className="font-semibold">Photos</h2>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(images.length ? images : p.image ? [{ id: 0, path: p.image }] : []).map((img, i) => (
            <li key={img.id || img.path} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb(img.path)} alt="" className="aspect-square w-full rounded-lg border border-line object-cover" />
              {img.id > 0 && (
                <div className="flex gap-1 text-xs">
                  {i > 0 && <form action={mainPhotoAction.bind(null, id, img.id)}><button className="h-9 rounded border border-line px-2">Make main</button></form>}
                  <form action={removePhotoAction.bind(null, id, img.id)}><button className="h-9 rounded border border-line px-2">Remove</button></form>
                </div>
              )}
            </li>
          ))}
        </ul>
        <form action={addPhotosAction.bind(null, id)} className="flex flex-wrap items-center gap-2">
          <label htmlFor="more-photos" className="sr-only">Add photos</label>
          <input id="more-photos" type="file" name="photos" accept="image/*" multiple className="text-sm" />
          <button className="h-10 rounded-md border border-line px-3 hover:border-gold">Upload</button>
        </form>
      </section>

      {p.sell_on_ebay && (
        <section aria-labelledby="ebay" className="rounded-xl border border-line p-4 text-sm">
          <h2 id="ebay" className="font-semibold">eBay</h2>
          <p className="mt-1">{ebay ? `Status: ${ebay.status}` : 'Waiting to be sent to eBay.'}{ebay?.listing_id ? ` · listing ${ebay.listing_id}` : ''}</p>
          {ebay?.last_error && <p className="mt-1 text-red-300">{ebay.last_error}</p>}
        </section>
      )}

      <section aria-labelledby="details">
        <h2 id="details" className="mb-3 font-semibold">Details</h2>
        <EditForm id={id} values={p} pallets={pallets} />
      </section>

      <section aria-labelledby="history">
        <h2 id="history" className="mb-2 font-semibold">Stock history</h2>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {events.map((e, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span>{reasonLabel[e.reason] ?? e.reason}{e.order_number ? ` · order ${e.order_number}` : ''}{e.note ? ` · ${e.note}` : ''}{e.staff ? ` · ${e.staff}` : ''}</span>
              <span className="tabular-nums text-muted">{e.delta > 0 ? '+' : ''}{e.delta} · {e.created_at.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </li>
          ))}
          {!events.length && <li className="px-3 py-2 text-muted">No changes yet.</li>}
        </ul>
        <p className="mt-2 text-xs text-muted">Price {money(p.price_cents)}{p.cost_cents ? ` · cost ${money(p.cost_cents)}` : ''}</p>
      </section>
    </div>
  );
}
