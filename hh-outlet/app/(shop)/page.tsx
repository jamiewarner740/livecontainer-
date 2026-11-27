import Link from 'next/link';
import Image from 'next/image';
import { ProductGrid } from '@/components/ProductCard';
import { recordEvent, listProducts, savings } from '@/lib/products';
import { categories, money, store } from '@/lib/store';

export default async function Home() {
  const items = await listProducts({ limit: 200 });
  await recordEvent(items.slice(0, 40).map((p) => p.id), 'impression', null);
  const best = Math.max(0, ...items.map((p) => savings(p)?.percent ?? 0));
  const cats = categories.map((c) => ({ ...c, items: items.filter((p) => p.category === c.slug) })).filter((c) => c.items.length > 0);
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <ul className="scrollbar-none -mx-4 flex gap-5 overflow-x-auto px-4 py-3 text-xs text-muted sm:mx-0 sm:px-0">
        <li className="whitespace-nowrap"><span className="text-gold">●</span> Free pickup in store</li>
        <li className="whitespace-nowrap"><span className="text-gold">●</span> Free shipping over {money(store.freeShippingOverCents).replace('.00', '')}</li>
        {best > 0 && <li className="whitespace-nowrap"><span className="text-gold">●</span> Up to {best}% off retail</li>}
      </ul>

      <section aria-labelledby="just-in" className="pt-1">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h1 id="just-in" className="font-display text-2xl font-semibold sm:text-3xl">Just in</h1>
          <span className="text-sm text-muted">{items.length} items</span>
        </div>
        {items.length ? <ProductGrid items={items} eager={4} /> : <p className="text-muted">Everything sold. New items go out as soon as they are checked.</p>}
      </section>

      {cats.length > 1 && (
        <section aria-labelledby="by-category" className="pt-12">
          <h2 id="by-category" className="mb-3 font-display text-2xl font-semibold">Shop by category</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {cats.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className="group relative block aspect-[4/3] overflow-hidden rounded-xl border border-line bg-raised">
                  <Image src={c.items[0].image} alt="" fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover opacity-70 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-90" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ground/95 to-transparent p-3 pt-8">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="text-xs text-muted">{c.items.length} {c.items.length === 1 ? 'item' : 'items'}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
