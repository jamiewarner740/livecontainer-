import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/ProductCard';
import { categories, getCategory, inCategory, under } from '@/lib/catalog';

const special: Record<string, { name: string; items: () => ReturnType<typeof under> }> = {
  'under-10': { name: 'Under $10', items: () => under(10) },
};

function resolve(slug: string) {
  if (special[slug]) return { name: special[slug].name, items: special[slug].items() };
  const c = getCategory(slug);
  return c ? { name: c.name, items: inCategory(slug) } : null;
}

export function generateStaticParams() { return [...Object.keys(special), ...categories.map((c) => c.slug)].map((slug) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = resolve((await params).slug);
  return r ? { title: r.name, description: `${r.name} at H&H Outlet: returned and overstock finds well under retail.` } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = resolve((await params).slug);
  if (!r) notFound();
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
