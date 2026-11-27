import type { Metadata } from 'next';
import { ProductGrid } from '@/components/ProductCard';
import { categories, newest } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Search', robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? '';
  const results = words.length
    ? newest().filter((p) => { const hay = `${p.name} ${catName(p.category)}`.toLowerCase(); return words.every((w) => hay.includes(w.replace(/s$/, ''))); })
    : [];
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <h1 className="mb-3 font-display text-2xl font-semibold">{q ? <>Results for “{q}”</> : 'Search'}</h1>
      {results.length ? <ProductGrid items={results} eager={4} /> : q ? <p className="text-muted">Nothing matches “{q}” right now. Stock changes often, so check back soon.</p> : null}
    </div>
  );
}
