'use client';
import { useActionState } from 'react';
import { savePalletAction, type FormState } from '../../actions';
import { Field, inputCls } from '../ui';

export type PalletValues = { label: string; supplier: string | null; purchased_on: string | null; cost_cents: number; freight_cents: number; other_cents: number; manifest_retail_cents: number | null; notes: string | null };
const d = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));

export function PalletForm({ id, v }: { id: number | null; v?: PalletValues }) {
  const [s, action, pending] = useActionState(savePalletAction.bind(null, id), {} as FormState);
  return (
    <form action={action} className="space-y-4">
      {s.message && <p role="status" className={`rounded-lg border p-3 text-sm ${s.ok ? 'border-gold/60 bg-gold/10 text-gold-soft' : 'border-red-400/60 bg-red-400/10 text-red-200'}`}>{s.message}</p>}
      <Field id="label" label="Name"><input id="label" name="label" defaultValue={v?.label} placeholder="e.g. Target home goods, June" className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="supplier" label="Supplier"><input id="supplier" name="supplier" defaultValue={v?.supplier ?? ''} className={inputCls} /></Field>
        <Field id="purchasedOn" label="Bought on"><input id="purchasedOn" name="purchasedOn" type="date" defaultValue={v?.purchased_on ?? ''} className={inputCls} /></Field>
        <Field id="cost" label="Price paid $"><input id="cost" name="cost" inputMode="decimal" defaultValue={d(v?.cost_cents)} className={inputCls} /></Field>
        <Field id="freight" label="Freight $"><input id="freight" name="freight" inputMode="decimal" defaultValue={d(v?.freight_cents)} className={inputCls} /></Field>
        <Field id="other" label="Other costs $"><input id="other" name="other" inputMode="decimal" defaultValue={d(v?.other_cents)} className={inputCls} /></Field>
        <Field id="manifestRetail" label="Manifest retail $ (optional)"><input id="manifestRetail" name="manifestRetail" inputMode="decimal" defaultValue={d(v?.manifest_retail_cents)} className={inputCls} /></Field>
      </div>
      <Field id="notes" label="Notes"><textarea id="notes" name="notes" rows={2} defaultValue={v?.notes ?? ''} className={`${inputCls} h-auto py-2`} /></Field>
      <button disabled={pending} className="h-12 w-full rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60">{pending ? 'Saving…' : id ? 'Save' : 'Add pallet'}</button>
    </form>
  );
}
