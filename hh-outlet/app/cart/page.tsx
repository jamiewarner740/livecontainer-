import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { readCart } from '@/lib/cart';
import { getProductsByIds } from '@/lib/products';
import { money, store } from '@/lib/store';
import { removeFromBag, setQty } from '@/app/actions';

export const metadata: Metadata = { title: 'Your bag', robots: { index: false } };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ added?: string; notice?: string }> }) {
  const { notice } = await searchParams;
  const lines = await readCart();
  const products = await getProductsByIds(lines.map((l) => l.productId));
  const rows = lines
    .map((l) => ({ line: l, p: products.find((p) => p.id === l.productId) }))
    .filter((r): r is { line: typeof r.line; p: NonNullable<typeof r.p> } => !!r.p);
  const subtotal = rows.reduce((s, r) => s + r.p.priceCents * Math.min(r.line.qty, r.p.available), 0);
  const retail = rows.reduce((s, r) => s + (r.p.retailCents ?? r.p.priceCents) * Math.min(r.line.qty, r.p.available), 0);
  const canCheckout = rows.some((r) => r.p.available > 0) && rows.every((r) => r.line.qty <= r.p.available);
  const toFree = store.freeShippingOverCents - subtotal;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Your bag</h1>
      {notice === 'changed' && <p role="status" className="mt-3 rounded-lg border border-gold/60 bg-gold/10 p-3 text-sm text-gold-soft">Some items sold while you were shopping, so we updated your bag. Check it before you continue.</p>}
      {notice === 'sold-out' && <p role="status" className="mt-3 rounded-lg border border-gold/60 bg-gold/10 p-3 text-sm text-gold-soft">That item just sold out.</p>}

      {rows.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-muted">Your bag is empty.</p>
          <Link href="/" className="mt-4 inline-flex h-12 items-center rounded-lg bg-gold px-8 font-semibold text-ground hover:bg-gold-soft">See what is in stock</Link>
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {rows.map(({ line, p }) => {
              const max = Math.min(p.available, 10);
              return (
                <li key={p.id} className="flex gap-3 py-4">
                  <Link href={`/products/${p.slug}`} className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-line bg-raised sm:size-24">
                    <Image src={p.image} alt={p.alt} fill sizes="96px" className="object-cover" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex justify-between gap-3">
                      <Link href={`/products/${p.slug}`} className="line-clamp-2 text-sm hover:text-gold-soft">{p.name}</Link>
                      <span className="font-semibold tabular-nums">{money(p.priceCents * Math.min(line.qty, p.available))}</span>
                    </div>
                    {p.available === 0 ? (
                      <p className="text-sm text-gold-soft">Sold out. Remove it to check out.</p>
                    ) : line.qty > p.available ? (
                      <p className="text-sm text-gold-soft">Only {p.available} left. Lower the quantity to check out.</p>
                    ) : null}
                    <div className="flex items-center gap-4">
                      {p.available > 0 && (
                        <form action={setQty} className="flex items-center gap-2">
                          <input type="hidden" name="productId" value={p.id} />
                          <label htmlFor={`qty-${p.id}`} className="text-sm text-muted">Qty</label>
                          <select id={`qty-${p.id}`} name="qty" defaultValue={Math.min(line.qty, max)} className="h-11 rounded-md border border-line bg-surface px-2 text-[16px]">
                            {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <button type="submit" className="h-11 rounded-md border border-line px-3 text-sm hover:border-gold">Update</button>
                        </form>
                      )}
                      <form action={removeFromBag}>
                        <input type="hidden" name="productId" value={p.id} />
                        <button type="submit" className="h-11 text-sm text-muted underline-offset-4 hover:text-gold-soft hover:underline">Remove</button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="text-base font-semibold tabular-nums">{money(subtotal)}</dd></div>
            {retail > subtotal && <div className="flex justify-between text-gold-soft"><dt>You save off retail</dt><dd className="tabular-nums">{money(retail - subtotal)}</dd></div>}
          </dl>
          <p className="mt-2 text-sm text-muted">
            Free pickup at the store. {toFree > 0 ? <>Add {money(toFree)} more for free shipping.</> : <>Your order ships free.</>}
          </p>
          {canCheckout ? (
            <Link href="/checkout" className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft">Check out</Link>
          ) : (
            <p className="mt-6 rounded-lg border border-line p-3 text-sm text-muted">Fix the items marked above to check out.</p>
          )}
          <p className="mt-3 text-center text-xs text-muted">No account needed. Items are held for {store.holdMinutes} minutes once you start checkout.</p>
        </>
      )}
    </div>
  );
}
