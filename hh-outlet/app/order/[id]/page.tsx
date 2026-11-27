import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getOrder } from '@/lib/checkout';
import { money } from '@/lib/store';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t = '' } = await searchParams;
  const order = await getOrder(id, t);
  if (!order) notFound();
  if (order.status === 'pending_payment') redirect(`/checkout/pay/${id}?t=${t}`);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
      {order.status === 'paid' ? (
        <>
          <p className="text-sm font-semibold text-gold-soft">Order {order.number} is paid</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Thank you, {order.name.split(' ')[0]}</h1>
          <p className="mt-2 text-muted">
            {order.fulfillment === 'pickup'
              ? 'Your items are set aside at the store. Bring this order number when you pick up.'
              : `We will ship to ${order.ship_address1}, ${order.ship_city}, ${order.ship_state} ${order.ship_zip}.`}
          </p>
          <p className="mt-1 text-sm text-muted">Save this page&apos;s link to check your order later.</p>
        </>
      ) : (
        <h1 className="font-display text-3xl font-semibold">This order was not completed</h1>
      )}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {order.items.map((i) => (
          <li key={i.product_id} className="flex items-center gap-3 py-3">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-line bg-raised"><Image src={i.image} alt="" fill sizes="56px" className="object-cover" /></div>
            <span className="min-w-0 flex-1 text-sm">{i.qty} × {i.name}</span>
            <span className="tabular-nums">{money(i.price_cents * i.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(order.subtotal_cents)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{order.fulfillment === 'pickup' ? 'Pickup' : 'Shipping'}</dt><dd className="tabular-nums">{order.shipping_cents ? money(order.shipping_cents) : 'Free'}</dd></div>
        {order.tax_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tabular-nums">{money(order.tax_cents)}</dd></div>}
        <div className="flex justify-between text-base font-semibold"><dt>Total paid</dt><dd className="tabular-nums">{money(order.total_cents)}</dd></div>
      </dl>
      <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-lg border border-line px-6 hover:border-gold">Keep shopping</Link>
    </div>
  );
}
