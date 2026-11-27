import { cookies } from 'next/headers';

// The bag lives in a cookie: no account needed, and it survives closing the browser for 30 days.
// It only holds product ids and quantities; names, prices and stock are always read fresh from the database.
export type CartLine = { productId: number; qty: number };
const NAME = 'hh_bag';
const MAX_LINES = 50;
const MAX_QTY = 99;

export function parseCart(raw: string | undefined): CartLine[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((l) => Array.isArray(l) && Number.isInteger(l[0]) && Number.isInteger(l[1]) && l[1] > 0)
      .slice(0, MAX_LINES)
      .map(([productId, qty]: [number, number]) => ({ productId, qty: Math.min(qty, MAX_QTY) }));
  } catch {
    return [];
  }
}

export async function readCart() {
  return parseCart((await cookies()).get(NAME)?.value);
}

export async function writeCart(lines: CartLine[]) {
  const clean = lines.filter((l) => l.qty > 0).slice(0, MAX_LINES).map((l) => [l.productId, Math.min(l.qty, MAX_QTY)]);
  (await cookies()).set(NAME, JSON.stringify(clean), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.qty, 0);
