'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { pay } from '@/app/actions';
import type { ClientConfig } from '@/lib/payments';

type SquareCard = { attach: (sel: string) => Promise<void>; tokenize: () => Promise<{ status: string; token?: string; errors?: { message: string }[] }>; destroy: () => Promise<void> };
declare global { interface Window { Square?: { payments: (appId: string, locationId: string) => { card: () => Promise<SquareCard> } } } }

export function PaymentForm({ orderId, token, totalLabel, config }: { orderId: string; token: string; totalLabel: string; config: ClientConfig }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(config.provider === 'test');
  const card = useRef<SquareCard | null>(null);

  useEffect(() => {
    if (config.provider !== 'square') return;
    let cancelled = false;
    const load = () => new Promise<void>((resolve, reject) => {
      if (window.Square) return resolve();
      const s = document.createElement('script');
      s.src = config.sdkUrl; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('sdk'));
      document.head.appendChild(s);
    });
    load()
      .then(async () => {
        const c = await window.Square!.payments(config.applicationId, config.locationId).card();
        if (cancelled) return c.destroy();
        await c.attach('#card-container');
        card.current = c; setReady(true);
      })
      .catch(() => setError('The card form could not load. Check your connection and reload the page.'));
    return () => { cancelled = true; card.current?.destroy(); };
  }, [config]);

  const submit = (sourceId: string) => start(async () => {
    setError(null);
    const r = await pay(orderId, token, sourceId);
    if (r?.error) setError(r.error);
  });

  async function payWithCard() {
    if (!card.current) return;
    const t = await card.current.tokenize();
    if (t.status === 'OK' && t.token) submit(t.token);
    else setError(t.errors?.[0]?.message ?? 'Check your card details and try again.');
  }

  if (config.provider === 'none') {
    return <p className="mt-4 rounded-lg border border-line p-4 text-sm">Online card payments are not switched on yet, so this order can't be paid here. Your items stay held until the time above, then go back on sale.</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      {config.provider === 'test' ? (
        <div className="rounded-lg border border-gold/60 bg-gold/10 p-4 text-sm text-gold-soft">
          <p className="font-semibold">Test mode: no real card is charged.</p>
          <p className="mt-1">Square is not connected yet. Use these buttons to try a successful or a declined payment.</p>
        </div>
      ) : (
        <div id="card-container" className="min-h-24 rounded-lg bg-white p-3" />
      )}
      {error && <p role="alert" className="rounded-lg border border-red-400/60 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      {config.provider === 'test' ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" disabled={pending} onClick={() => submit('test-ok')} className="h-12 rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60 sm:flex-1">{pending ? 'Paying…' : `Pay ${totalLabel} (test)`}</button>
          <button type="button" disabled={pending} onClick={() => submit('test-decline')} className="h-12 rounded-lg border border-line px-5 text-sm hover:border-gold disabled:opacity-60">Try a declined card</button>
        </div>
      ) : (
        <button type="button" disabled={!ready || pending} onClick={payWithCard} className="h-12 w-full rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60">{pending ? 'Paying…' : `Pay ${totalLabel}`}</button>
      )}
      <p className="text-xs text-muted">Card details go straight to Square. H&amp;H Outlet never sees or stores your card number.</p>
    </div>
  );
}
