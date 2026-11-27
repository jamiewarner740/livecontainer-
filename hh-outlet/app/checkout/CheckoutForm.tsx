'use client';

import { useActionState, useState } from 'react';
import { startCheckout, type CheckoutState } from '@/app/actions';
import { money } from '@/lib/store';

const input = 'mt-1 h-12 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink focus:border-gold focus:outline-none aria-[invalid=true]:border-red-400';

function Field({ id, label, state, ...rest }: { id: string; label: string; state: CheckoutState } & React.InputHTMLAttributes<HTMLInputElement>) {
  const err = state.errors?.[id];
  return (
    <div>
      <label htmlFor={id} className="text-sm">{label}</label>
      <input id={id} name={id} defaultValue={state.values?.[id]} aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-err` : undefined} className={input} {...rest} />
      {err && <p id={`${id}-err`} className="mt-1 text-sm text-red-300">{err}</p>}
    </div>
  );
}

export function CheckoutForm({ shipCents }: { shipCents: number | null }) {
  const [state, action, pending] = useActionState(startCheckout, {} as CheckoutState);
  const [method, setMethod] = useState<'pickup' | 'ship'>((state.values?.fulfillment as 'pickup' | 'ship') ?? 'pickup');
  const canShip = shipCents != null;

  return (
    <form action={action} noValidate className="mt-5 space-y-6">
      {state.message && <p role="alert" className="rounded-lg border border-red-400/60 bg-red-400/10 p-3 text-sm text-red-200">{state.message}</p>}

      <fieldset className="space-y-3">
        <legend className="font-semibold">How do you want it?</legend>
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${method === 'pickup' ? 'border-gold bg-gold/5' : 'border-line'}`}>
          <input type="radio" name="fulfillment" value="pickup" checked={method === 'pickup'} onChange={() => setMethod('pickup')} className="mt-1 accent-[var(--color-gold)]" />
          <span><span className="block font-medium">Pick up at the store</span><span className="text-sm text-muted">Free. Bring your order number when you come in.</span></span>
        </label>
        <label className={`flex items-start gap-3 rounded-lg border p-3 ${!canShip ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${method === 'ship' ? 'border-gold bg-gold/5' : 'border-line'}`}>
          <input type="radio" name="fulfillment" value="ship" disabled={!canShip} checked={method === 'ship'} onChange={() => setMethod('ship')} className="mt-1 accent-[var(--color-gold)]" />
          <span>
            <span className="block font-medium">Ship it to me</span>
            <span className="text-sm text-muted">{!canShip ? 'Shipping is not available yet for orders under $150. Choose pickup.' : shipCents === 0 ? 'Free on this order. USPS, UPS or FedEx.' : `${money(shipCents)}. USPS, UPS or FedEx.`}</span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold">Your details</legend>
        <Field id="name" label="Full name" autoComplete="name" required state={state} />
        <Field id="email" label="Email" type="email" inputMode="email" autoComplete="email" required state={state} />
        <Field id="phone" label="Phone (optional)" type="tel" autoComplete="tel" state={state} />
      </fieldset>

      {method === 'ship' && (
        <fieldset className="space-y-3">
          <legend className="font-semibold">Shipping address</legend>
          <Field id="address1" label="Street address" autoComplete="address-line1" required state={state} />
          <Field id="address2" label="Apartment, suite (optional)" autoComplete="address-line2" state={state} />
          <div className="grid grid-cols-[1fr_5rem_7rem] gap-3">
            <Field id="city" label="City" autoComplete="address-level2" required state={state} />
            <Field id="state" label="State" autoComplete="address-level1" maxLength={2} required state={state} />
            <Field id="zip" label="ZIP" autoComplete="postal-code" inputMode="numeric" required state={state} />
          </div>
        </fieldset>
      )}

      <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60">
        {pending ? 'Holding your items…' : 'Continue to payment'}
      </button>
    </form>
  );
}
