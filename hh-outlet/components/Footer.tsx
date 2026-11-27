import Link from 'next/link';
import { categories, money, store } from '@/lib/store';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="font-display text-xl font-semibold">H&amp;H <span className="text-gold">Outlet</span></p>
          <p className="mt-2 max-w-xs text-sm text-muted">Returned and overstock goods at a fraction of retail, in store and online.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Shop</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link className="hover:text-gold-soft" href="/c/under-10">Under $10</Link></li>
            {categories.map((c) => <li key={c.slug}><Link className="hover:text-gold-soft" href={`/c/${c.slug}`}>{c.name}</Link></li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Pickup and shipping</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Free pickup at the store</li>
            <li>Shipping by USPS, UPS or FedEx</li>
            <li>Free shipping over {money(store.freeShippingOverCents).replace('.00', '')}</li>
            <li>Returns within {store.returnDays} days of delivery</li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Follow new arrivals</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><a className="hover:text-gold-soft" href={store.instagram}>Instagram</a></li>
            <li><a className="hover:text-gold-soft" href={store.facebook}>Facebook</a></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-4 py-4 text-center text-xs text-muted">© {new Date().getFullYear()} {store.legalName}</p>
    </footer>
  );
}
