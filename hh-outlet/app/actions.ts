'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { readCart, writeCart } from '@/lib/cart';
import { getProductsByIds } from '@/lib/products';
import { CheckoutError, createOrder, payOrder } from '@/lib/checkout';

const int = (v: FormDataEntryValue | null) => Number.parseInt(String(v ?? ''), 10);

export async function addToBag(form: FormData) {
  const productId = int(form.get('productId'));
  const qty = Math.max(1, int(form.get('qty')) || 1);
  const [p] = await getProductsByIds([productId]);
  if (!p || p.available < 1) redirect('/cart?notice=sold-out');
  const lines = await readCart();
  const line = lines.find((l) => l.productId === productId);
  const want = Math.min((line?.qty ?? 0) + qty, p.available);
  await writeCart(line ? lines.map((l) => (l.productId === productId ? { ...l, qty: want } : l)) : [...lines, { productId, qty: want }]);
  redirect('/cart?added=' + productId);
}

export async function setQty(form: FormData) {
  const productId = int(form.get('productId'));
  const qty = int(form.get('qty'));
  const lines = await readCart();
  await writeCart(lines.map((l) => (l.productId === productId ? { ...l, qty: Number.isFinite(qty) ? qty : l.qty } : l)));
  revalidatePath('/cart');
}

export async function removeFromBag(form: FormData) {
  const productId = int(form.get('productId'));
  await writeCart((await readCart()).filter((l) => l.productId !== productId));
  revalidatePath('/cart');
}

const checkoutSchema = z.discriminatedUnion('fulfillment', [
  z.object({ fulfillment: z.literal('pickup') }),
  z.object({
    fulfillment: z.literal('ship'),
    address1: z.string().trim().min(3, 'Write the street address.').max(120),
    address2: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2, 'Write the city.').max(80),
    state: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Write the two-letter state, like TX.'),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Write a 5-digit ZIP code.'),
  }),
]).and(z.object({
  name: z.string().trim().min(2, 'Write your name.').max(100),
  email: z.string().trim().email('Write an email address with an @, like name@example.com.').max(200),
  phone: z.string().trim().max(30).optional(),
}));

export type CheckoutState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> };

export async function startCheckout(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const values = Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]));
  const parsed = checkoutSchema.safeParse({ ...values, phone: values.phone || undefined, address2: values.address2 || undefined });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, values, message: `Please fix ${Object.keys(errors).length === 1 ? 'the field' : `the ${Object.keys(errors).length} fields`} marked below.` };
  }
  const d = parsed.data;
  const lines = await readCart();
  let order: { id: string; token: string };
  try {
    order = await createOrder({
      lines,
      customer: { name: d.name, email: d.email, phone: d.phone },
      fulfillment: d.fulfillment,
      address: d.fulfillment === 'ship' ? { address1: d.address1, address2: d.address2, city: d.city, state: d.state.toUpperCase(), zip: d.zip } : undefined,
    });
  } catch (e) {
    if (e instanceof CheckoutError && e.code === 'unavailable') {
      // Trim the bag to what is really left, so the buyer sees the change on the bag page.
      const short = e.detail as { productId: number; available: number }[];
      await writeCart(lines.map((l) => { const s = short.find((x) => x.productId === l.productId); return s ? { ...l, qty: s.available } : l; }));
      redirect('/cart?notice=changed');
    }
    if (e instanceof CheckoutError) return { values, message: e.message };
    throw e;
  }
  redirect(`/checkout/pay/${order.id}?t=${order.token}`);
}

export async function pay(orderId: string, token: string, sourceId: string): Promise<{ error: string } | undefined> {
  try {
    await payOrder(orderId, token, sourceId);
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    console.error('payment failed', e);
    return { error: 'Something went wrong on our side. Please try again. Trying again never charges your card twice.' };
  }
  // Paid: empty the bag of what was bought.
  await writeCart([]);
  redirect(`/order/${orderId}?t=${token}`);
}
