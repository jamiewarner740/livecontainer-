'use client';

import { useCallback, useState, useTransition } from 'react';
import { findForSale, recordSaleAction, type SellItem } from '../../actions';
import { money } from '@/lib/store';
import { BarcodeScanner } from '../BarcodeScanner';
import { inputCls } from '../ui';

type Line = SellItem & { qty: number; price: string };

export function SellScreen() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SellItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<'cash' | 'card' | 'other'>('cash');
  const [note, setNote] = useState('');
  const [scan, setScan] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const search = useCallback(async (text: string) => {
    const r = await findForSale(text);
    setResults(r);
    const exact = r.find((x) => x.sku?.toUpperCase() === text.trim().toUpperCase());
    if (exact && r.length === 1) add(exact);
  }, []);

  function add(item: SellItem) {
    setMsg(null);
    setLines((ls) => {
      const found = ls.find((l) => l.id === item.id);
      if (found) return ls.map((l) => (l.id === item.id ? { ...l, qty: Math.min(l.qty + 1, item.available) } : l));
      return [...ls, { ...item, qty: 1, price: (item.price_cents / 100).toFixed(2) }];
    });
    setResults([]); setQ('');
  }

  const toCents = (s: string) => Math.round(Number(s.replace(/[$,]/g, '')) * 100);
  const total = lines.reduce((s, l) => s + (Number.isFinite(toCents(l.price)) ? toCents(l.price) : 0) * l.qty, 0);

  function record() {
    start(async () => {
      const r = await recordSaleAction(lines.map((l) => ({ productId: l.id, qty: l.qty, priceCents: toCents(l.price) })), method, note);
      if (r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: `Sale ${r.number} recorded: ${money(r.totalCents!)} ${method}.` }); setLines([]); setNote(''); }
    });
  }

  return (
    <div className="mt-4 space-y-5">
      {msg && <p role="status" className={`rounded-lg border p-3 text-sm ${msg.ok ? 'border-gold/60 bg-gold/10 text-gold-soft' : 'border-red-400/60 bg-red-400/10 text-red-200'}`}>{msg.text}</p>}
      <form onSubmit={(e) => { e.preventDefault(); search(q); }} className="flex gap-2" role="search">
        <label htmlFor="find" className="sr-only">SKU, barcode or name</label>
        <input id="find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU, barcode or name" autoComplete="off" className={inputCls} />
        <button className="h-12 rounded-lg border border-line px-4 hover:border-gold">Find</button>
        <button type="button" onClick={() => setScan(true)} className="h-12 rounded-lg border border-line px-4 hover:border-gold">Scan</button>
      </form>
      {scan && <BarcodeScanner onClose={() => setScan(false)} onCode={(c) => { setScan(false); setQ(c); search(c); }} />}
      {results.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" disabled={r.available < 1} onClick={() => add(r)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface disabled:opacity-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.image ? <img src={r.image} alt="" className="size-12 rounded-md object-cover" /> : <span className="size-12 rounded-md bg-raised" />}
                <span className="min-w-0 flex-1"><span className="line-clamp-1 text-sm">{r.name}</span><span className="text-xs text-muted">{r.sku} · {r.available} available{r.location ? ` · ${r.location}` : ''}</span></span>
                <span className="font-semibold tabular-nums">{money(r.price_cents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="sale">
        <h2 id="sale" className="font-semibold">This sale</h2>
        {lines.length === 0 ? <p className="mt-2 text-sm text-muted">No items yet.</p> : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {lines.map((l) => (
              <li key={l.id} className="grid grid-cols-[1fr_auto] gap-2 p-3">
                <span className="text-sm">{l.name}<span className="block text-xs text-muted">{l.sku} · listed at {money(l.price_cents)}</span></span>
                <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="h-9 self-start text-sm text-muted underline">Remove</button>
                <div className="col-span-2 flex items-center gap-2">
                  <label htmlFor={`qty-${l.id}`} className="text-sm text-muted">Qty</label>
                  <select id={`qty-${l.id}`} value={l.qty} onChange={(e) => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, qty: Number(e.target.value) } : x)))} className="h-11 rounded-md border border-line bg-surface px-2 text-[16px]">
                    {Array.from({ length: Math.max(1, Math.min(l.available, 20)) }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
                  </select>
                  <label htmlFor={`price-${l.id}`} className="ml-2 text-sm text-muted">Price each $</label>
                  <input id={`price-${l.id}`} inputMode="decimal" value={l.price} onChange={(e) => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, price: e.target.value } : x)))} className="h-11 w-24 rounded-md border border-line bg-surface px-2 text-[16px]" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lines.length > 0 && (
        <>
          <fieldset>
            <legend className="mb-1 text-sm">Paid by</legend>
            <div className="flex gap-2">
              {(['cash', 'card', 'other'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className={`h-11 flex-1 rounded-full border text-sm capitalize ${method === m ? 'border-gold bg-gold font-semibold text-ground' : 'border-line'}`}>{m}</button>
              ))}
            </div>
            {method === 'card' && <p className="mt-1 text-xs text-muted">Take the card on your Square reader as usual; this records the sale and updates stock.</p>}
          </fieldset>
          <div><label htmlFor="note" className="text-sm">Note (optional)</label><input id="note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></div>
          <button type="button" disabled={pending} onClick={record} className="h-12 w-full rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60">{pending ? 'Recording…' : `Record sale · ${money(total)}`}</button>
        </>
      )}
    </div>
  );
}
