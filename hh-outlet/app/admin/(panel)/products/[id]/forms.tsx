'use client';

import { useActionState, useState } from 'react';
import { adjustStockAction, updateListingAction, type FormState } from '../../../actions';
import { conditions } from '@/lib/conditions';
import { categories } from '@/lib/store';
import { Chips, Field, inputCls } from '../../ui';

export type EditValues = {
  name: string; category: string; price_cents: number; retail_cents: number | null; condition: string | null; tested: string | null;
  packaging: string | null; description: string | null; brand: string | null; model: string | null; upc: string | null; included: string | null;
  missing: string | null; defects: string | null; location: string | null; pallet_id: number | null; cost_cents: number | null; weight_oz: number | null;
  pickup_only: boolean; sell_on_web: boolean; sell_on_ebay: boolean; status: string;
};

const dollars = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));

function Notice({ s }: { s: FormState }) {
  if (!s.message) return null;
  return <p role="status" className={`rounded-lg border p-3 text-sm ${s.ok ? 'border-gold/60 bg-gold/10 text-gold-soft' : 'border-red-400/60 bg-red-400/10 text-red-200'}`}>{s.message}</p>;
}

export function StockForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(adjustStockAction.bind(null, id), {} as FormState);
  return (
    <form action={action} className="mt-3 space-y-3">
      <Notice s={state} />
      <div className="grid grid-cols-[6rem_1fr] gap-3 sm:grid-cols-[6rem_10rem_1fr_auto] sm:items-end">
        <Field id="delta" label="Change" error={state.errors?.delta}><input id="delta" name="delta" inputMode="numeric" placeholder="+2 or -1" className={inputCls} /></Field>
        <Field id="reason" label="Why"><select id="reason" name="reason" className={inputCls}><option value="adjust">Count or damage</option><option value="return">Customer return</option></select></Field>
        <Field id="note" label="Note (optional)"><input id="note" name="note" className={inputCls} /></Field>
        <button disabled={pending} className="col-span-2 h-12 rounded-lg border border-gold/70 px-4 text-gold-soft hover:bg-gold/10 sm:col-span-1">{pending ? 'Saving…' : 'Update stock'}</button>
      </div>
    </form>
  );
}

export function EditForm({ id, values: p, pallets }: { id: number; values: EditValues; pallets: { id: number; label: string }[] }) {
  const [state, action, pending] = useActionState(updateListingAction.bind(null, id), {} as FormState);
  const [v, setV] = useState({ category: p.category, condition: p.condition ?? '', tested: p.tested ?? '', packaging: p.packaging ?? '' });
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <Notice s={state} />
      <Field id="name" label="Name" error={e.name}><input id="name" name="name" defaultValue={p.name} className={inputCls} /></Field>
      <Chips label="Category" name="category" value={v.category} onChange={(x) => setV({ ...v, category: x })} options={categories.map((c) => ({ value: c.slug, label: c.name }))} error={e.category} />
      <Chips label="Condition" name="condition" value={v.condition} onChange={(x) => setV({ ...v, condition: x })} options={conditions.map((c) => ({ value: c.value, label: c.value }))} error={e.condition} />
      <Chips label="Tested?" name="tested" value={v.tested} onChange={(x) => setV({ ...v, tested: x })} options={[{ value: 'works', label: 'Works' }, { value: 'not_working', label: 'Does not work' }, { value: 'untested', label: 'Not tested' }]} />
      <Chips label="Packaging" name="packaging" value={v.packaging} onChange={(x) => setV({ ...v, packaging: x })} options={[{ value: 'original', label: 'Original' }, { value: 'damaged', label: 'Damaged' }, { value: 'none', label: 'None' }]} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field id="price" label="Price" error={e.price}><input id="price" name="price" inputMode="decimal" defaultValue={dollars(p.price_cents)} className={inputCls} /></Field>
        <Field id="retail" label="Retail" error={e.retail}><input id="retail" name="retail" inputMode="decimal" defaultValue={dollars(p.retail_cents)} className={inputCls} /></Field>
        <Field id="cost" label="Your cost"><input id="cost" name="cost" inputMode="decimal" defaultValue={dollars(p.cost_cents)} className={inputCls} /></Field>
        <Field id="weightOz" label="Weight, oz"><input id="weightOz" name="weightOz" inputMode="numeric" defaultValue={p.weight_oz ?? ''} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field id="brand" label="Brand"><input id="brand" name="brand" defaultValue={p.brand ?? ''} className={inputCls} /></Field>
        <Field id="model" label="Model"><input id="model" name="model" defaultValue={p.model ?? ''} className={inputCls} /></Field>
        <Field id="upc" label="Barcode" error={e.upc}><input id="upc" name="upc" inputMode="numeric" defaultValue={p.upc ?? ''} className={inputCls} /></Field>
        <Field id="location" label="Shelf or bin"><input id="location" name="location" defaultValue={p.location ?? ''} className={inputCls} /></Field>
      </div>
      <Field id="description" label="Description"><textarea id="description" name="description" rows={4} defaultValue={p.description ?? ''} className={`${inputCls} h-auto py-2`} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="included" label="What's included"><input id="included" name="included" defaultValue={p.included ?? ''} className={inputCls} /></Field>
        <Field id="missing" label="Missing parts"><input id="missing" name="missing" defaultValue={p.missing ?? ''} className={inputCls} /></Field>
        <Field id="defects" label="Known defects"><input id="defects" name="defects" defaultValue={p.defects ?? ''} className={inputCls} /></Field>
      </div>
      <Field id="palletId" label="From pallet">
        <select id="palletId" name="palletId" defaultValue={p.pallet_id ?? ''} className={inputCls}><option value="">None</option>{pallets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
      </Field>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2"><input type="checkbox" name="pickupOnly" defaultChecked={p.pickup_only} className="size-5 accent-[var(--color-gold)]" /> Pickup only</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="sellOnWeb" value="on" defaultChecked={p.sell_on_web} onChange={(ev) => { const h = ev.currentTarget.form?.elements.namedItem('sellOnWebOff') as HTMLInputElement | null; if (h) h.disabled = ev.currentTarget.checked; }} className="size-5 accent-[var(--color-gold)]" /> Sell on website</label>
        <input type="hidden" name="sellOnWeb" value="off" id="sellOnWebOff" disabled={p.sell_on_web} />
        <label className="flex items-center gap-2"><input type="checkbox" name="sellOnEbay" defaultChecked={p.sell_on_ebay} className="size-5 accent-[var(--color-gold)]" /> Sell on eBay</label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button name="intent" value="publish" disabled={pending} className="h-12 rounded-lg bg-gold px-6 font-semibold text-ground hover:bg-gold-soft disabled:opacity-60">{p.status === 'active' ? 'Save' : 'Save and publish'}</button>
        <button name="intent" value="draft" disabled={pending} className="h-12 rounded-lg border border-line px-6 hover:border-gold disabled:opacity-60">{p.status === 'active' ? 'Unpublish' : 'Save draft'}</button>
      </div>
    </form>
  );
}
