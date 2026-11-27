import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readCart } from '@/lib/cart';
import { getProductsByIds } from '@/lib/products';
import { flatRateCents } from '@/lib/shipping';
import { money, store } from '@/lib/store';
import { CheckoutForm } from './CheckoutForm';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage() {
  const lines = await readCart();
  const products = await getProductsByIds(lines.map((l) => l.productId));
  const rows = lines.map((l) => ({ qty: l.qty, p: products.find((p) => p.id === l.productId) })).filter((r) => r.p);
  if (!rows.length || rows.some((r) => r.qty > r.p!.available)) redirect('/cart');
  const subtotal = rows.reduce((s, r) => s + r.p!.priceCents * r.qty, 0);
  const freeShip = subtotal >= store.freeShippingOverCents;
  const flat = flatRateCents();
  const shipCents = freeShip ? 0 : flat;

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-4 sm:px-6 md:grid-cols-[1fr_20rem]">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Checkout</h1>
        <p className="mt-1 text-sm text-muted">No account needed. Your items are held for {store.holdMinutes} minutes once you continue to payment.</p>
        <CheckoutForm shipCents={shipCents} />
      </div>
      <aside aria-labelledby="summary" className="h-fit rounded-xl border border-line bg-surface p-4 md:sticky md:top-36">
        <h2 id="summary" className="font-semibold">Order summary</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map(({ qty, p }) => (
            <li key={p!.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{qty} × {p!.name}</span><span className="tabular-nums">{money(p!.priceCents * qty)}</span></li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold"><span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
        <p className="mt-1 text-xs text-muted">Shipping and any tax are shown on the next step.</p>
      </aside>
    </div>
  );
}
