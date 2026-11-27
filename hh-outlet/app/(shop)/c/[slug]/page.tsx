import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/ProductCard';
import { recordEvent, listProducts } from '@/lib/products';
import { getCategory } from '@/lib/store';

async function resolve(slug: string) {
  if (slug === 'under-10') return { name: 'Under $10', items: await listProducts({ maxPriceCents: 1000 }) };
  const c = getCategory(slug);
  return c ? { name: c.name, items: await listProducts({ category: slug }) } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const name = slug === 'under-10' ? 'Under $10' : getCategory(slug)?.name;
  return name ? { title: name, description: `${name} at H&H Outlet: returned and overstock finds well under retail.` } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await resolve((await params).slug);
  if (!r) notFound();
  await recordEvent(r.items.slice(0, 40).map((p) => p.id), 'impression', null);
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{r.name}</h1>
        <span className="text-sm text-muted">{r.items.length} {r.items.length === 1 ? 'item' : 'items'}</span>
      </div>
      {r.items.length ? <ProductGrid items={r.items} eager={4} /> : <p className="text-muted">Nothing here right now. New items go out as soon as they are checked.</p>}
    </div>
  );
}
