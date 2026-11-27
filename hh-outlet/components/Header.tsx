import Link from 'next/link';
import Image from 'next/image';
import { categories } from '@/lib/catalog';

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ground/95 backdrop-blur supports-[backdrop-filter]:bg-ground/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-30 focus:bg-gold focus:px-3 focus:py-2 focus:text-ground">Skip to products</a>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="H&H Outlet home">
          <Image src="/brand/logo-64.png" alt="" width={36} height={36} priority className="rounded-md" />
          <span className="font-display text-xl font-semibold tracking-tight">H&amp;H <span className="text-gold">Outlet</span></span>
        </Link>
        <form action="/search" role="search" className="order-last w-full sm:order-none sm:ml-auto sm:w-auto sm:min-w-80">
          <label htmlFor="q" className="sr-only">Search the store</label>
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-gold">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0 text-muted"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="m14.5 14.5 3.5 3.5M16 9A7 7 0 1 1 2 9a7 7 0 0 1 14 0Z"/></svg>
            <input id="q" name="q" type="search" placeholder="Search drills, blenders, toys…" autoComplete="off" className="h-11 w-full bg-transparent text-[16px] text-ink placeholder:text-muted focus:outline-none" />
          </div>
        </form>
      </div>
      <nav aria-label="Categories" className="mx-auto max-w-7xl">
        <ul className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
          <li><Link href="/c/under-10" className="block whitespace-nowrap rounded-full border border-gold/60 px-3.5 py-1.5 text-sm font-medium text-gold-soft hover:bg-gold hover:text-ground">Under $10</Link></li>
          {categories.map((c) => (
            <li key={c.slug}><Link href={`/c/${c.slug}`} className="block whitespace-nowrap rounded-full border border-line px-3.5 py-1.5 text-sm text-ink hover:border-gold hover:text-gold-soft">{c.name}</Link></li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
