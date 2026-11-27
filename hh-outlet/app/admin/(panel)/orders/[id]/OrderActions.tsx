'use client';
import { useActionState } from 'react';
import { fulfillAction, refundAction, type FormState } from '../../../actions';
import { inputCls } from '../../ui';

function Note({ s }: { s: FormState }) {
  return s.message ? <p role="status" className={`rounded-lg border p-3 text-sm ${s.ok ? 'border-gold/60 bg-gold/10 text-gold-soft' : 'border-red-400/60 bg-red-400/10 text-red-200'}`}>{s.message}</p> : null;
}

function Step({ orderId, step, label, children }: { orderId: string; step: 'ready' | 'picked_up' | 'shipped' | 'delivered'; label: string; children?: React.ReactNode }) {
  const [s, action, pending] = useActionState(fulfillAction.bind(null, orderId, step), {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <Note s={s} />
      {children}
      <button disabled={pending} className="h-12 w-full rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60">{pending ? 'Saving…' : label}</button>
    </form>
  );
}

export function FulfillButtons({ orderId, fulfillment, step }: { orderId: string; fulfillment: string; step: string }) {
  if (fulfillment === 'pickup') {
    if (step === 'unfulfilled') return <Step orderId={orderId} step="ready" label="Mark ready for pickup" />;
    if (step === 'ready') return <Step orderId={orderId} step="picked_up" label="Mark picked up" />;
    return null;
  }
  if (step === 'unfulfilled') {
    return (
      <Step orderId={orderId} step="shipped" label="Mark shipped">
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <div><label htmlFor="carrier" className="text-sm">Carrier</label><select id="carrier" name="carrier" className={inputCls}><option>USPS</option><option>UPS</option><option>FedEx</option></select></div>
          <div><label htmlFor="tracking" className="text-sm">Tracking number</label><input id="tracking" name="tracking" autoComplete="off" className={inputCls} /></div>
        </div>
      </Step>
    );
  }
  if (step === 'shipped') return <Step orderId={orderId} step="delivered" label="Mark delivered" />;
  return null;
}

export function RefundForm({ orderId, total }: { orderId: string; total: string }) {
  const [s, action, pending] = useActionState(refundAction.bind(null, orderId), {} as FormState);
  return (
    <details className="rounded-xl border border-line p-3">
      <summary className="cursor-pointer font-semibold">Cancel and refund</summary>
      <form action={action} className="mt-3 space-y-2">
        <Note s={s} />
        <div><label htmlFor="reason" className="text-sm">Reason</label><input id="reason" name="reason" className={inputCls} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" className="size-5 accent-[var(--color-gold)]" /> Refund {total} and put the items back in stock</label>
        <button disabled={pending} className="h-12 w-full rounded-lg border border-red-400/70 text-red-200 hover:bg-red-400/10 disabled:opacity-60">{pending ? 'Refunding…' : 'Refund order'}</button>
      </form>
    </details>
  );
}
