'use client';
import { useActionState } from 'react';
import { importEbayAction, saveEbaySettingsAction, type FormState } from '../../actions';
import { Field, inputCls } from '../ui';

type Opt = { id: string; name: string };
type Acc = { fulfillment_policy_id: string | null; payment_policy_id: string | null; return_policy_id: string | null; location_postal: string | null; location_city: string | null; location_state: string | null; markup_bps: number; markup_cents: number; auto_list: boolean };

function Note({ s }: { s: FormState }) {
  return s.message ? <p role="status" className={`whitespace-pre-line rounded-lg border p-3 text-sm ${s.ok ? 'border-gold/60 bg-gold/10 text-gold-soft' : 'border-red-400/60 bg-red-400/10 text-red-200'}`}>{s.message}</p> : null;
}

function Pick({ id, label, options, value }: { id: string; label: string; options: Opt[] | undefined; value: string | null }) {
  return (
    <Field id={id} label={label}>
      <select id={id} name={id} defaultValue={value ?? ''} className={inputCls}>
        <option value="">{options?.length ? 'Choose…' : 'No policies found on eBay'}</option>
        {options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </Field>
  );
}

export function EbaySettingsForm({ account: a, policies }: { account: Acc; policies: { fulfillment: Opt[]; payment: Opt[]; returns: Opt[] } | null }) {
  const [s, action, pending] = useActionState(saveEbaySettingsAction, {} as FormState);
  return (
    <form action={action} className="space-y-4">
      <Note s={s} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Pick id="fulfillment" label="Shipping policy" options={policies?.fulfillment} value={a.fulfillment_policy_id} />
        <Pick id="payment" label="Payment policy" options={policies?.payment} value={a.payment_policy_id} />
        <Pick id="returns" label="Return policy" options={policies?.returns} value={a.return_policy_id} />
      </div>
      <p className="text-xs text-muted">Policies are created in eBay Seller Hub under Account, Business policies.</p>
      <fieldset className="grid grid-cols-[1fr_1fr_5rem] gap-3">
        <legend className="mb-1 text-sm">Ships from</legend>
        <Field id="city" label="City"><input id="city" name="city" defaultValue={a.location_city ?? ''} className={inputCls} /></Field>
        <Field id="postal" label="ZIP"><input id="postal" name="postal" inputMode="numeric" defaultValue={a.location_postal ?? ''} className={inputCls} /></Field>
        <Field id="state" label="State"><input id="state" name="state" maxLength={2} defaultValue={a.location_state ?? ''} className={inputCls} /></Field>
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-1 text-sm">eBay price = website price plus</legend>
        <Field id="markupPercent" label="Percent"><input id="markupPercent" name="markupPercent" inputMode="decimal" defaultValue={a.markup_bps / 100} className={inputCls} /></Field>
        <Field id="markupDollars" label="And dollars"><input id="markupDollars" name="markupDollars" inputMode="decimal" defaultValue={(a.markup_cents / 100).toFixed(2)} className={inputCls} /></Field>
      </fieldset>
      <p className="-mt-2 text-xs text-muted">eBay’s fees are usually around 13 to 15% of the sale; a markup can cover them. An item’s own eBay price, if set, wins.</p>
      <label className="flex items-center gap-3"><input type="checkbox" name="autoList" defaultChecked={a.auto_list} className="size-5 accent-[var(--color-gold)]" /> Tick “eBay” by default when listing a new item</label>
      <button disabled={pending} className="h-12 w-full rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60 sm:w-auto sm:px-8">{pending ? 'Saving…' : 'Save eBay settings'}</button>
    </form>
  );
}

export function ImportForm() {
  const [s, action, pending] = useActionState(importEbayAction, {} as FormState);
  return (
    <form action={action} className="mt-2 space-y-2">
      <Note s={s} />
      <label htmlFor="listingIds" className="sr-only">eBay item numbers</label>
      <textarea id="listingIds" name="listingIds" rows={3} placeholder="e.g. 285123456789 285123456790" className={`${inputCls} h-auto py-2`} />
      <button disabled={pending} className="h-11 rounded-lg border border-gold/70 px-4 text-gold-soft hover:bg-gold/10 disabled:opacity-60">{pending ? 'Importing…' : 'Import listings'}</button>
    </form>
  );
}
