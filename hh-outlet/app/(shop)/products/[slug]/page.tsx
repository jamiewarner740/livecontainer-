import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/ProductCard';
import { getProduct, recordEvent, relatedProducts, savings } from '@/lib/products';
import { packagingLabels, testedLabels } from '@/lib/conditions';
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
  await recordEvent([p.id], 'view', null);
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
        <div>
          <ul aria-label="Photos" className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-line bg-raised">
            {p.images.map((img, i) => (
              <li key={img.path} className="relative aspect-square w-full shrink-0 snap-center">
                <Image src={img.path} alt={i === 0 ? p.alt : `${p.alt}, photo ${i + 1}`} fill priority={i === 0} sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
              </li>
            ))}
          </ul>
          {p.images.length > 1 && <p className="mt-2 text-center text-xs text-muted">{p.images.length} photos, swipe to see them all</p>}
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
            {p.tested && <><dt className="text-muted">Testing</dt><dd>{testedLabels[p.tested]}</dd></>}
            {p.packaging && <><dt className="text-muted">Packaging</dt><dd>{packagingLabels[p.packaging]}</dd></>}
            {p.included && <><dt className="text-muted">Included</dt><dd>{p.included}</dd></>}
            {p.missing && <><dt className="text-muted">Missing</dt><dd>{p.missing}</dd></>}
            {p.defects && <><dt className="text-muted">Known issues</dt><dd>{p.defects}</dd></>}
            {p.brand && <><dt className="text-muted">Brand</dt><dd>{p.brand}{p.model ? `, model ${p.model}` : ''}</dd></>}
            <dt className="text-muted">Pickup</dt><dd>Free at the store</dd>
            <dt className="text-muted">Shipping</dt><dd>{p.pickupOnly ? 'Pickup only: too large to ship' : <>USPS, UPS or FedEx, free over {money(store.freeShippingOverCents)}</>}</dd>
            <dt className="text-muted">Returns</dt><dd>Within {store.returnDays} days of delivery, unused, in the original packaging</dd>
          </dl>
        </div>
      </div>
      {p.description && (
        <section aria-labelledby="about" className="max-w-2xl pt-8">
          <h2 id="about" className="mb-2 font-display text-xl font-semibold">About this item</h2>
          <p className="whitespace-pre-line text-ink/90">{p.description}</p>
        </section>
      )}
      {more.length > 0 && (
        <section aria-labelledby="more" className="pt-12">
          <h2 id="more" className="mb-3 font-display text-2xl font-semibold">More finds like this</h2>
          <ProductGrid items={more} />
        </section>
      )}
    </div>
  );
}
