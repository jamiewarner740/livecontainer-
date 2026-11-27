import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/ProductCard';
import { getProduct, relatedProducts, savings } from '@/lib/products';
import { getCategory, money, store } from '@/lib/store';
import { addToBag } from '@/app/actions';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return {};
  const s = savings(p);
  const description = `${p.name} for ${money(p.priceCents)}${s ? `, ${s.percent}% under the ${money(p.retailCents!)} retail price` : ''}. Pick up free in store or have it shipped.`;
  return { title: p.name, description, alternates: { canonical: `/products/${p.slug}` }, openGraph: { title: p.name, description, images: [p.image] } };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProduct((await params).slug);
  if (!p) notFound();
  const s = savings(p);
  const cat = getCategory(p.category);
  const more = await relatedProducts(p);
  const maxQty = Math.min(p.available, 10);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: p.image, sku: String(p.id),
    offers: { '@type': 'Offer', price: (p.priceCents / 100).toFixed(2), priceCurrency: 'USD', availability: p.available > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut' },
  };
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link href="/" className="hover:text-gold-soft">Home</Link>{cat && <> <span aria-hidden="true">/</span> <Link href={`/c/${cat.slug}`} className="hover:text-gold-soft">{cat.name}</Link></>}
      </nav>
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-raised">
          <Image src={p.image} alt={p.alt} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{p.name}</h1>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tabular-nums">{money(p.priceCents)}</span>
            {s && <span className="text-muted tabular-nums">Retail <s>{money(p.retailCents!)}</s></span>}
          </div>
          {s && <p className="mt-1 font-semibold text-gold-soft">You save {money(s.cents)} ({s.percent}%)</p>}

          {p.available > 0 ? (
            <form action={addToBag} className="mt-6 flex gap-3">
              <input type="hidden" name="productId" value={p.id} />
              {maxQty > 1 && (
                <div>
                  <label htmlFor="qty" className="sr-only">Quantity</label>
                  <select id="qty" name="qty" defaultValue={1} className="h-12 rounded-lg border border-line bg-surface px-3 text-[16px]">
                    {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
              <button type="submit" className="h-12 flex-1 rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft sm:flex-none sm:px-12">Add to bag</button>
            </form>
          ) : (
            <p className="mt-6 rounded-lg border border-line p-3 text-muted">Sold out. Most items are one of a kind; see similar finds below.</p>
          )}

          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-line py-4 text-sm">
            <dt className="text-muted">Available</dt><dd>{p.available > 0 ? (p.available <= 5 ? `Only ${p.available} left` : `${p.available} in stock`) : 'Sold out'}</dd>
            {p.condition && <><dt className="text-muted">Condition</dt><dd>{p.condition}</dd></>}
            <dt className="text-muted">Pickup</dt><dd>Free at the store</dd>
            <dt className="text-muted">Shipping</dt><dd>USPS, UPS or FedEx, free over {money(store.freeShippingOverCents)}</dd>
            <dt className="text-muted">Returns</dt><dd>Within {store.returnDays} days of delivery, unused, in the original packaging</dd>
          </dl>
        </div>
      </div>
      {more.length > 0 && (
        <section aria-labelledby="more" className="pt-12">
          <h2 id="more" className="mb-3 font-display text-2xl font-semibold">More finds like this</h2>
          <ProductGrid items={more} />
        </section>
      )}
    </div>
  );
}
