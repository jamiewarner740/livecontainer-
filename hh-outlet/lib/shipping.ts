import { store } from './store';

export type Fulfillment = 'pickup' | 'ship';

/** Flat shipping rate in cents from SHIPPING_FLAT_RATE_CENTS, or null when the owner has not set one. */
export function flatRateCents() {
  const v = process.env.SHIPPING_FLAT_RATE_CENTS;
  return v && /^\d+$/.test(v) ? Number(v) : null;
}

/**
 * Pickup is always free. Shipping is free over the threshold; under it, the owner's flat rate.
 * Returns null when shipping can't be quoted (no rate set yet), so checkout offers pickup only.
 * Live carrier rates (Shippo) replace the flat rate once the owner connects an account.
 */
export function quoteShipping(method: Fulfillment, subtotalCents: number): number | null {
  if (method === 'pickup') return 0;
  if (subtotalCents >= store.freeShippingOverCents) return 0;
  return flatRateCents();
}

export const shippingAvailable = () => flatRateCents() != null;
