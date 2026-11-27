import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getOrder } from '@/lib/checkout';
import { getClientConfig } from '@/lib/payments';
import { money } from '@/lib/store';
import { PaymentForm } from './PaymentForm';

export const metadata: Metadata = { title: 'Payment', robots: { index: false } };

export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t = '' } = await searchParams;
  const order = await getOrder(id, t);
  if (!order) notFound();
  if (order.status === 'paid') redirect(`/order/${id}?t=${t}`);
  const expired = order.status !== 'pending_payment';
  const config = getClientConfig();

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-4 sm:px-6 md:grid-cols-[1fr_20rem]">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Payment</h1>
        {expired ? (
          <div className="mt-4 rounded-lg border border-line p-4">
            <p>This checkout has expired and the items were released.</p>
            <Link href="/cart" className="mt-3 inline-flex h-11 items-center rounded-lg bg-gold px-6 font-semibold text-ground">Back to your bag</Link>
          </div>
        ) : (
          <>
            {order.holdExpiresAt && <p className="mt-1 text-sm text-muted">Your items are held until {order.holdExpiresAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} Eastern.</p>}
            <PaymentForm orderId={id} token={t} totalLabel={money(order.total_cents)} config={config} />
          </>
        )}
      </div>
      <aside aria-labelledby="summary" className="h-fit rounded-xl border border-line bg-surface p-4">
        <h2 id="summary" className="font-semibold">Order {order.number}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {order.items.map((i) => <li key={i.product_id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{i.qty} × {i.name}</span><span className="tabular-nums">{money(i.price_cents * i.qty)}</span></li>)}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(order.subtotal_cents)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">{order.fulfillment === 'pickup' ? 'Pickup' : 'Shipping'}</dt><dd className="tabular-nums">{order.shipping_cents ? money(order.shipping_cents) : 'Free'}</dd></div>
          {order.tax_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tabular-nums">{money(order.tax_cents)}</dd></div>}
          <div className="flex justify-between pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(order.total_cents)}</dd></div>
        </dl>
      </aside>
    </div>
  );
}
