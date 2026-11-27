import Link from 'next/link';
import Image from 'next/image';
import { type Product, money, savings } from '@/lib/catalog';

export function ProductCard({ p, priority = false }: { p: Product; priority?: boolean }) {
  const s = savings(p);
  return (
    <Link href={`/products/${p.slug}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-gold/70">
      <div className="relative aspect-square overflow-hidden bg-raised">
        <Image src={p.image} alt={p.alt} fill priority={priority} sizes="(min-width: 1280px) 240px, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 48vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        {s && <span className="absolute left-2 top-2 rounded-md bg-gold px-1.5 py-0.5 text-xs font-bold text-ground">−{s.percent}%</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm leading-snug text-ink">{p.name}</h3>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
          <span className="text-lg font-bold tabular-nums">{money(p.price)}</span>
          {s && <span className="text-xs text-muted tabular-nums"><span className="sr-only">Retail </span><s>{money(p.retail!)}</s></span>}
        </div>
        {p.condition && <span className="text-xs text-muted">{p.condition}</span>}
        {p.stock <= 5 && <span className="text-xs font-medium text-gold-soft">Only {p.stock} left</span>}
      </div>
    </Link>
  );
}

export function ProductGrid({ items, eager = 0 }: { items: Product[]; eager?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((p, i) => <li key={p.id} className="flex"><ProductCard p={p} priority={i < eager} /></li>)}
    </ul>
  );
}
