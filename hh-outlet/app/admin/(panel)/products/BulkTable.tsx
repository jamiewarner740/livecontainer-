'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { bulkAction } from '../../actions';
import { categories, money } from '@/lib/store';
import type { BulkAction } from '@/lib/admin/catalog';

export type Row = {
  id: number; name: string; sku: string | null; image: string; price_cents: number; stock: number; status: string; condition: string | null;
  location: string | null; sell_on_ebay: boolean; category: string; age_days: number; ebay_status: string | null; views_30d: number;
};

const statusLabel = (r: Row) => (r.status === 'draft' ? 'Draft' : r.status === 'archived' ? 'Archived' : r.stock === 0 ? 'Sold out' : 'Live');

export function BulkTable({ rows }: { rows: Row[] }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [report, setReport] = useState<string | null>(null);
  const [kind, setKind] = useState('publish');
  const [arg, setArg] = useState('');
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function run() {
    let action: BulkAction;
    if (kind === 'category') action = { kind, category: arg };
    else if (kind === 'price_percent') action = { kind, percent: Number(arg) };
    else if (kind === 'location') action = { kind, location: arg };
    else action = { kind } as BulkAction;
    start(async () => {
      const res = await bulkAction([...picked], action);
      const bad = res.filter((r) => !r.ok);
      const names = (id: number) => rows.find((r) => r.id === id)?.name ?? `#${id}`;
      setReport(`${res.length - bad.length} updated.` + (bad.length ? ` ${bad.length} skipped: ` + bad.map((b) => `${names(b.id)} (${b.error})`).join('; ') : ''));
      setPicked(new Set(bad.map((b) => b.id)));
    });
  }

  if (!rows.length) return <p className="mt-6 text-muted">Nothing matches.</p>;
  return (
    <div className="mt-3">
      {report && <p role="status" className="mb-3 rounded-lg border border-line bg-surface p-3 text-sm">{report}</p>}
      {picked.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gold/60 bg-ground p-2">
          <span className="text-sm font-semibold">{picked.size} selected</span>
          <label htmlFor="bulk" className="sr-only">Bulk action</label>
          <select id="bulk" value={kind} onChange={(e) => { setKind(e.target.value); setArg(''); }} className="h-11 rounded-md border border-line bg-surface px-2 text-[16px]">
            <option value="publish">Publish</option><option value="unpublish">Move to drafts</option><option value="archive">Archive</option>
            <option value="price_percent">Change price by %</option><option value="category">Set category</option><option value="location">Set shelf or bin</option>
            <option value="ebay_on">List on eBay</option><option value="ebay_off">Take off eBay</option>
          </select>
          {kind === 'category' && (
            <select aria-label="Category" value={arg} onChange={(e) => setArg(e.target.value)} className="h-11 rounded-md border border-line bg-surface px-2 text-[16px]">
              <option value="">Choose…</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          )}
          {kind === 'price_percent' && <input aria-label="Percent change, e.g. -20" inputMode="numeric" value={arg} onChange={(e) => setArg(e.target.value)} placeholder="-20" className="h-11 w-24 rounded-md border border-line bg-surface px-2 text-[16px]" />}
          {kind === 'location' && <input aria-label="Shelf or bin" value={arg} onChange={(e) => setArg(e.target.value)} placeholder="A3" className="h-11 w-28 rounded-md border border-line bg-surface px-2 text-[16px]" />}
          <button disabled={pending || ((kind === 'category' || kind === 'price_percent') && !arg)} onClick={run} className="h-11 rounded-md bg-gold px-4 font-semibold text-ground disabled:opacity-60">{pending ? 'Working…' : 'Apply'}</button>
          <button onClick={() => setPicked(new Set())} className="h-11 px-2 text-sm text-muted">Clear</button>
        </div>
      )}
      <ul className="divide-y divide-line rounded-xl border border-line">
        <li className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
          <input type="checkbox" aria-label="Select all" checked={picked.size === rows.length} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} className="size-5 accent-[var(--color-gold)]" />
          {rows.length} listings
        </li>
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2">
            <input type="checkbox" aria-label={`Select ${r.name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="size-5 shrink-0 accent-[var(--color-gold)]" />
            <div className="size-12 shrink-0 overflow-hidden rounded-md border border-line bg-raised">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.image && <img src={r.image} alt="" className="size-full object-cover" loading="lazy" />}
            </div>
            <Link href={`/admin/products/${r.id}`} className="min-w-0 flex-1 hover:text-gold-soft">
              <span className="line-clamp-1 text-sm font-medium">{r.name}</span>
              <span className="block text-xs text-muted">
                {r.sku} · {statusLabel(r)} · {r.stock} on hand{r.location ? ` · ${r.location}` : ''} · {r.age_days} d · {r.views_30d} views
                {r.sell_on_ebay ? ` · eBay ${r.ebay_status ?? 'queued'}` : ''}{!r.condition ? ' · no condition' : ''}
              </span>
            </Link>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{money(r.price_cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
