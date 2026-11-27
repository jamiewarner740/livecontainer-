'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { assistantAction, lookupAction, quickListAction, type FormState } from '../../actions';
import { conditions } from '@/lib/conditions';
import { categories } from '@/lib/store';
import type { LookupResult } from '@/lib/lookup';
import { BarcodeScanner } from '../BarcodeScanner';
import { shrinkPhoto } from '../shrinkPhoto';
import { Chips, ErrorText, Field, inputCls } from '../ui';

type Sticky = { category?: string; location?: string; palletId?: string };
const STICKY_KEY = 'hh-quicklist-defaults';

export function QuickListForm({ pallets, locations, assistant, ebayConnected, ebayDefault }: { pallets: { id: number; label: string }[]; locations: string[]; assistant: boolean; ebayConnected: boolean; ebayDefault: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [assistBusy, setAssistBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastSeconds, setLastSeconds] = useState<number | null>(null);
  const fresh = (): Record<string, string> => ({ quantity: '1', ...(ebayDefault ? { sellOnEbay: 'on' } : {}) });
  const [v, setV] = useState<Record<string, string>>(fresh);
  const set = (k: string, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    // A corrected field drops its error at once instead of waiting for the next submit.
    setState((st) => (st.errors?.[k] ? { ...st, errors: Object.fromEntries(Object.entries(st.errors).filter(([f]) => f !== k)) } : st));
  };

  // Remember category, shelf and pallet between listings: items from one pallet usually share them.
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(STICKY_KEY) ?? '{}') as Sticky; setV((x) => ({ ...x, ...s })); } catch {}
  }, []);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setStartedAt((t) => t ?? Date.now());
    const shrunk = await Promise.all([...list].slice(0, 12 - photos.length).map(shrinkPhoto));
    setPhotos((p) => [...p, ...shrunk.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    setState((st) => (st.errors?.photos ? { ...st, errors: { ...st.errors, photos: '' } } : st));
  }

  async function runLookup(code: string) {
    if (code.replace(/\D/g, '').length < 8) return;
    setStartedAt((t) => t ?? Date.now());
    const r = await lookupAction(code);
    setLookup(r);
    if (r.suggestion) {
      const s = r.suggestion;
      setV((x) => ({ ...x, upc: r.code, name: x.name || s.title, brand: x.brand || s.brand || '', model: x.model || s.model || '', category: x.category || s.category || '' }));
    } else setV((x) => ({ ...x, upc: r.code }));
  }

  async function fillFromPhotos() {
    if (!photos.length) { setState({ message: 'Take at least one photo first.' }); return; }
    setAssistBusy(true);
    const fd = new FormData();
    photos.slice(0, 4).forEach((p) => fd.append('photos', p.file));
    fd.append('note', v.note ?? '');
    const r = await assistantAction(fd);
    setAssistBusy(false);
    if (r.error || !r.draft) { setState({ message: r.error }); return; }
    const d = r.draft;
    setV((x) => ({
      ...x,
      name: d.title, brand: d.brand ?? x.brand ?? '', model: d.model ?? x.model ?? '', upc: d.barcode ?? x.upc ?? '',
      category: d.category, condition: d.condition ?? x.condition ?? '', tested: d.tested ?? x.tested ?? '', packaging: d.packaging ?? x.packaging ?? '',
      description: d.description, included: d.included ?? '', missing: d.missing ?? '', defects: d.visible_damage ?? '',
      price: d.price_dollars != null ? String(d.price_dollars) : x.price ?? '',
    }));
    setState({ message: 'Draft filled in from the photos. Check every field before publishing.' });
  }

  function submit(intent: 'publish' | 'draft') {
    const form = formRef.current!;
    const fd = new FormData(form);
    fd.set('intent', intent);
    fd.delete('photos');
    photos.forEach((p) => fd.append('photos', p.file));
    start(async () => {
      const r = await quickListAction({}, fd);
      setState(r);
      if (r.ok) {
        const secs = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;
        setLastSeconds(secs);
        const sticky: Sticky = { category: v.category, location: v.location, palletId: v.palletId };
        try { localStorage.setItem(STICKY_KEY, JSON.stringify(sticky)); } catch {}
        photos.forEach((p) => URL.revokeObjectURL(p.url));
        setPhotos([]); setLookup(null); setStartedAt(null);
        setV({ ...fresh(), ...sticky });
        window.scrollTo({ top: 0 });
      } else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  const e = state.errors ?? {};
  return (
    <form ref={formRef} onSubmit={(ev) => { ev.preventDefault(); submit('publish'); }} noValidate className="mt-4 space-y-6">
      {state.message && (
        <div role="status" className={`rounded-lg border p-3 text-sm ${state.ok ? 'border-gold/60 bg-gold/10 text-gold-soft' : 'border-red-400/60 bg-red-400/10 text-red-200'}`}>
          {state.message}{state.ok && state.id && <> <Link className="underline" href={`/admin/products/${state.id}`}>Open it</Link>.</>}
          {state.ok && lastSeconds != null && <span className="block text-xs opacity-80">Listed in {lastSeconds} {lastSeconds === 1 ? 'second' : 'seconds'}.</span>}
        </div>
      )}

      <section aria-labelledby="ph" className="space-y-2">
        <h2 id="ph" className="font-semibold">Photos</h2>
        <div className="grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
              {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-gold px-1 text-[11px] font-bold text-ground">Main</span>}
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-ground/80 text-sm">✕</button>
            </div>
          ))}
          {photos.length < 12 && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gold/70 text-center text-xs text-gold-soft">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
              {photos.length ? 'Add photo' : 'Take photos'}
              <input type="file" name="photos" accept="image/*" capture="environment" multiple className="sr-only" onChange={(ev) => { addFiles(ev.target.files); ev.target.value = ''; }} />
            </label>
          )}
        </div>
        <ErrorText msg={e.photos} />
        <p className="text-xs text-muted">Show any damage clearly. Photos are only resized, never retouched.</p>
      </section>

      <section aria-labelledby="bc" className="space-y-2">
        <h2 id="bc" className="font-semibold">Barcode <span className="text-sm font-normal text-muted">(optional)</span></h2>
        <div className="flex gap-2">
          <input aria-label="Barcode number" name="upc" inputMode="numeric" value={v.upc ?? ''} onChange={(ev) => set('upc', ev.target.value)} onBlur={(ev) => runLookup(ev.target.value)} placeholder="UPC or EAN" className={inputCls} />
          <button type="button" onClick={() => setScanning(true)} className="h-12 shrink-0 rounded-lg border border-line px-4 hover:border-gold">Scan</button>
        </div>
        <ErrorText msg={e.upc} />
        {scanning && <BarcodeScanner onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); set('upc', c); runLookup(c); }} />}
        {lookup?.existing.length ? (
          <div className="rounded-lg border border-gold/60 bg-gold/10 p-3 text-sm">
            <p className="font-medium text-gold-soft">Already in your stock with this barcode:</p>
            <ul className="mt-1 space-y-1">{lookup.existing.map((x) => <li key={x.id}><Link className="underline" href={`/admin/products/${x.id}`}>{x.name}</Link> · {x.stock} on hand · {x.condition ?? 'no condition'}</li>)}</ul>
            <p className="mt-1 text-xs text-muted">Same condition? Open it and add stock instead of making a new listing.</p>
          </div>
        ) : null}
        {lookup?.suggestion && <p className="text-xs text-muted">Name filled from {lookup.suggestion.source}. A barcode match can be a different color, size or bundle, so check it.</p>}
        {lookup?.note && <p className="text-xs text-muted">{lookup.note}</p>}
      </section>

      {assistant && (
        <section aria-labelledby="ai" className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <h2 id="ai" className="font-semibold">Fill in from the photos</h2>
          <div className="flex gap-2">
            <textarea aria-label="Note for the assistant" value={v.note ?? ''} onChange={(ev) => set('note', ev.target.value)} rows={2} placeholder="e.g. open box coffee maker, tested and works, missing the manual, $40" className={`${inputCls} h-auto py-2`} />
            <Dictate onText={(t) => set('note', `${v.note ? v.note + ' ' : ''}${t}`)} />
          </div>
          <button type="button" disabled={assistBusy} onClick={fillFromPhotos} className="h-11 w-full rounded-lg border border-gold/70 text-gold-soft hover:bg-gold/10 disabled:opacity-60">{assistBusy ? 'Reading the photos…' : 'Fill in from photos'}</button>
          <p className="text-xs text-muted">It only uses what the photos and your note show. Check every field.</p>
        </section>
      )}

      <Field id="name" label="Name" error={e.name}>
        <input id="name" name="name" value={v.name ?? ''} onChange={(ev) => set('name', ev.target.value)} placeholder="Brand, item, size" className={inputCls} />
      </Field>

      <Chips label="Category" name="category" value={v.category} onChange={(x) => set('category', x)} options={categories.map((c) => ({ value: c.slug, label: c.name }))} error={e.category} />
      <Chips label="Condition" name="condition" value={v.condition} onChange={(x) => set('condition', x)} options={conditions.map((c) => ({ value: c.value, label: c.value }))} error={e.condition} />
      <Chips label="Tested?" name="tested" value={v.tested} onChange={(x) => set('tested', x)} options={[{ value: 'works', label: 'Works' }, { value: 'not_working', label: 'Does not work' }, { value: 'untested', label: 'Not tested' }]} />

      <div className="grid grid-cols-3 gap-3">
        <Field id="price" label="Price" error={e.price}><input id="price" name="price" inputMode="decimal" value={v.price ?? ''} onChange={(ev) => set('price', ev.target.value)} placeholder="$" className={inputCls} /></Field>
        <Field id="retail" label="Retail (optional)" error={e.retail}><input id="retail" name="retail" inputMode="decimal" value={v.retail ?? ''} onChange={(ev) => set('retail', ev.target.value)} placeholder="$" className={inputCls} /></Field>
        <Field id="quantity" label="Quantity" error={e.quantity}><input id="quantity" name="quantity" inputMode="numeric" value={v.quantity ?? '1'} onChange={(ev) => set('quantity', ev.target.value)} className={inputCls} /></Field>
      </div>
      <p className="-mt-3 text-xs text-muted">Only enter a retail price you can back up: printed on the box, or the maker&apos;s price.</p>

      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer font-semibold">More details</summary>
        <div className="mt-3 space-y-4">
          <Chips label="Packaging" name="packaging" value={v.packaging} onChange={(x) => set('packaging', x)} options={[{ value: 'original', label: 'Original' }, { value: 'damaged', label: 'Damaged' }, { value: 'none', label: 'None' }]} />
          <div className="grid grid-cols-2 gap-3">
            <Field id="brand" label="Brand"><input id="brand" name="brand" value={v.brand ?? ''} onChange={(ev) => set('brand', ev.target.value)} className={inputCls} /></Field>
            <Field id="model" label="Model"><input id="model" name="model" value={v.model ?? ''} onChange={(ev) => set('model', ev.target.value)} className={inputCls} /></Field>
          </div>
          <Field id="description" label="Description"><textarea id="description" name="description" rows={3} value={v.description ?? ''} onChange={(ev) => set('description', ev.target.value)} className={`${inputCls} h-auto py-2`} /></Field>
          <Field id="included" label="What's included"><input id="included" name="included" value={v.included ?? ''} onChange={(ev) => set('included', ev.target.value)} className={inputCls} /></Field>
          <Field id="missing" label="Missing parts"><input id="missing" name="missing" value={v.missing ?? ''} onChange={(ev) => set('missing', ev.target.value)} className={inputCls} /></Field>
          <Field id="defects" label="Known defects or damage"><input id="defects" name="defects" value={v.defects ?? ''} onChange={(ev) => set('defects', ev.target.value)} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="location" label="Shelf or bin">
              <input id="location" name="location" list="locations" value={v.location ?? ''} onChange={(ev) => set('location', ev.target.value)} className={inputCls} />
              <datalist id="locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
            </Field>
            <Field id="palletId" label="From pallet">
              <select id="palletId" name="palletId" value={v.palletId ?? ''} onChange={(ev) => set('palletId', ev.target.value)} className={inputCls}>
                <option value="">None</option>
                {pallets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <Field id="cost" label="Your cost (optional)"><input id="cost" name="cost" inputMode="decimal" value={v.cost ?? ''} onChange={(ev) => set('cost', ev.target.value)} placeholder="$" className={inputCls} /></Field>
            <Field id="weightOz" label="Weight, oz (for shipping)"><input id="weightOz" name="weightOz" inputMode="numeric" value={v.weightOz ?? ''} onChange={(ev) => set('weightOz', ev.target.value)} className={inputCls} /></Field>
          </div>
          <label className="flex items-center gap-3"><input type="checkbox" name="pickupOnly" checked={v.pickupOnly === 'on'} onChange={(ev) => set('pickupOnly', ev.target.checked ? 'on' : '')} className="size-5 accent-[var(--color-gold)]" /> Pickup only (too big or heavy to ship)</label>
        </div>
      </details>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Sell on</legend>
        <label className="flex items-center gap-3"><input type="checkbox" checked readOnly disabled className="size-5 accent-[var(--color-gold)]" /> Website</label>
        <label className={`flex items-center gap-3 ${!ebayConnected ? 'opacity-60' : ''}`}>
          <input type="checkbox" name="sellOnEbay" disabled={!ebayConnected} checked={v.sellOnEbay === 'on'} onChange={(ev) => set('sellOnEbay', ev.target.checked ? 'on' : '')} className="size-5 accent-[var(--color-gold)]" />
          eBay {!ebayConnected && <Link href="/admin/ebay" className="text-sm text-gold-soft underline">connect eBay first</Link>}
        </label>
      </fieldset>

      <div className="sticky bottom-20 z-10 grid grid-cols-[1fr_auto] gap-2 bg-ground py-2 md:bottom-0">
        <button type="submit" disabled={pending} className="h-12 rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60">{pending ? 'Saving…' : 'Publish'}</button>
        <button type="button" disabled={pending} onClick={() => submit('draft')} className="h-12 rounded-lg border border-line px-4 hover:border-gold disabled:opacity-60">Save draft</button>
      </div>
      <input type="hidden" name="elapsed" value={startedAt ? String(Date.now() - startedAt) : ''} />
    </form>
  );
}

type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void };

/** Speak a note instead of typing it, where the browser supports speech recognition (Chrome, Safari). */
function Dictate({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  useEffect(() => { const w = window as unknown as Record<string, unknown>; setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition)); }, []);
  if (!supported) return null;
  return (
    <button type="button" aria-pressed={on} aria-label={on ? 'Stop dictating' : 'Dictate a note'} onClick={() => {
      if (on) { rec.current?.stop(); return; }
      const w = window as unknown as Record<string, new () => SpeechRec>;
      const r = new (w.SpeechRecognition || w.webkitSpeechRecognition)();
      r.lang = 'en-US'; r.interimResults = false;
      r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(' '));
      r.onend = () => setOn(false);
      rec.current = r; r.start(); setOn(true);
    }} className={`flex size-12 shrink-0 items-center justify-center rounded-lg border ${on ? 'border-red-400 text-red-300' : 'border-line'}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    </button>
  );
}
