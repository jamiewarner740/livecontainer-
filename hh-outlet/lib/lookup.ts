import { sql } from './db';
import { categories } from './store';

export type LookupResult = {
  code: string;
  existing: { id: number; name: string; stock: number; status: string; condition: string | null; priceCents: number }[];
  suggestion: null | { title: string; brand?: string; model?: string; description?: string; category?: string; retailCents?: number; source: string };
  note?: string;
};

const cache = new Map<string, { at: number; value: LookupResult['suggestion'] }>();

/**
 * Looks a barcode up in our own stock first (so a second unit becomes "add one more", not a duplicate listing),
 * then in UPCitemdb. UPCitemdb's free trial allows about 100 lookups a day; with UPCITEMDB_KEY set it uses the
 * paid plan. A match is only a suggestion: the same barcode can be a different color, size or bundle, so the
 * owner confirms the details before anything is saved.
 */
export async function lookupBarcode(raw: string): Promise<LookupResult> {
  const code = raw.replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return { code, existing: [], suggestion: null, note: 'A barcode is 8 to 14 digits.' };

  const existing = (await sql<{ id: number; name: string; stock: number; status: string; condition: string | null; price_cents: number }[]>`
    select id, name, stock, status, condition, price_cents from products where upc = ${code} order by id desc limit 5`)
    .map((r) => ({ id: r.id, name: r.name, stock: r.stock, status: r.status, condition: r.condition, priceCents: r.price_cents }));

  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return { code, existing, suggestion: hit.value };

  const key = process.env.UPCITEMDB_KEY;
  const url = key ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${code}` : `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...(key ? { user_key: key, key_type: '3scale' } : {}) },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 429) return { code, existing, suggestion: null, note: 'The free barcode lookup limit for today is used up. Type the details, or add a lookup key.' };
    if (!res.ok) return { code, existing, suggestion: null, note: 'The barcode lookup service did not answer. Type the details.' };
    const body = (await res.json()) as { items?: { title?: string; brand?: string; model?: string; description?: string; category?: string; highest_recorded_price?: number }[] };
    const item = body.items?.[0];
    const suggestion = item?.title
      ? { title: tidyTitle(item.title), brand: item.brand || undefined, model: item.model || undefined, description: item.description || undefined, category: guessCategory(`${item.category ?? ''} ${item.title}`), source: 'UPCitemdb' }
      : null;
    cache.set(code, { at: Date.now(), value: suggestion });
    return { code, existing, suggestion, note: suggestion ? undefined : 'No match for this barcode. Type the details.' };
  } catch {
    return { code, existing, suggestion: null, note: 'The barcode lookup service could not be reached. Type the details.' };
  }
}

function tidyTitle(t: string) {
  return t.replace(/\s+/g, ' ').trim().slice(0, 120);
}

const keywords: Record<string, string[]> = {
  home: ['home', 'kitchen', 'decor', 'furniture', 'bath', 'bedding', 'garden', 'patio', 'lighting', 'wreath', 'binder', 'wine'],
  gadgets: ['electronics', 'computer', 'phone', 'audio', 'camera', 'video game', 'speaker', 'heater', 'tool', 'automotive', 'karaoke'],
  clothing: ['apparel', 'clothing', 'shoes', 'accessories', 'jewelry', 'gloves', 'leggings', 'shirt', 'jacket', 'bag'],
  pets: ['pet', 'dog', 'cat', 'aquarium', 'bird'],
};

export function guessCategory(text: string) {
  const t = text.toLowerCase();
  let best: string | undefined;
  let score = 0;
  for (const c of categories) {
    const s = (keywords[c.slug] ?? []).filter((k) => t.includes(k)).length;
    if (s > score) { score = s; best = c.slug; }
  }
  return best;
}
