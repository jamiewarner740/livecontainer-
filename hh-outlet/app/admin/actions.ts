'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { login, logout, requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { saveProductPhoto } from '@/lib/images';
import { lookupBarcode } from '@/lib/lookup';
import { draftFromPhotos, type ListingDraft } from '@/lib/assistant';
import { addPhotos, adjustStock, bulkUpdate, createListing, ListingError, makeMainPhoto, removePhoto, updateListing, type BulkAction, type ListingInput } from '@/lib/admin/catalog';

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string>; id?: number; values?: Record<string, string> };

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await login(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
  if (!r.ok) return { message: r.error, values: { email: String(form.get('email') ?? '') } };
  const next = String(form.get('next') ?? '/admin');
  redirect(next.startsWith('/admin') ? next : '/admin');
}

export async function logoutAction() {
  await logout();
  redirect('/admin/login');
}

const cents = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const text = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s || null; };
const int = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s ? Number.parseInt(s, 10) : null; };
const pick = <T extends string>(v: FormDataEntryValue | null, allowed: readonly T[]) => (allowed.includes(String(v) as T) ? (String(v) as T) : null);

function listingFrom(form: FormData): ListingInput {
  return {
    name: String(form.get('name') ?? '').trim(),
    category: String(form.get('category') ?? ''),
    priceCents: cents(form.get('price')) ?? NaN,
    retailCents: cents(form.get('retail')),
    quantity: int(form.get('quantity')) ?? 1,
    condition: text(form.get('condition')),
    tested: pick(form.get('tested'), ['works', 'not_working', 'untested'] as const),
    packaging: pick(form.get('packaging'), ['original', 'damaged', 'none'] as const),
    description: text(form.get('description')),
    brand: text(form.get('brand')),
    model: text(form.get('model')),
    upc: text(form.get('upc'))?.replace(/\D/g, '') || null,
    included: text(form.get('included')),
    missing: text(form.get('missing')),
    defects: text(form.get('defects')),
    location: text(form.get('location')),
    palletId: int(form.get('palletId')),
    costCents: cents(form.get('cost')),
    weightOz: int(form.get('weightOz')),
    pickupOnly: form.get('pickupOnly') === 'on',
    sellOnWeb: form.get('sellOnWeb') !== 'off',
    sellOnEbay: form.get('sellOnEbay') === 'on',
    status: form.get('intent') === 'draft' ? 'draft' : 'active',
  };
}

async function photosFrom(form: FormData) {
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 12);
  const saved = [];
  for (const f of files) saved.push(await saveProductPhoto(f));
  return saved;
}

export async function quickListAction(_: FormState, form: FormData): Promise<FormState> {
  const staff = await requireStaff();
  try {
    const input = listingFrom(form);
    // Validate before saving photos, so a mistake doesn't leave orphan files.
    const pre = (await import('@/lib/admin/catalog')).validateListing(input);
    const photoCount = form.getAll('photos').filter((f) => f instanceof File && f.size > 0).length;
    if (input.status === 'active' && photoCount === 0) pre.photos = 'Add at least one photo before publishing.';
    if (Object.keys(pre).length) return { errors: pre, message: 'Fix the fields marked below.' };
    const photos = await photosFrom(form);
    const id = await createListing(input, photos, staff);
    const ms = Number(form.get('elapsed'));
    if (ms > 0) await audit(staff.id, 'quicklist.timing', 'product', String(id), { seconds: Math.round(ms / 1000), photos: photos.length });
    revalidatePath('/admin/products');
    revalidatePath('/');
    return { ok: true, id, message: input.status === 'draft' ? 'Saved as a draft.' : 'Published.' };
  } catch (e) {
    if (e instanceof ListingError) return { errors: e.fields, message: 'Fix the fields marked below.' };
    return { message: (e as Error).message };
  }
}

export async function updateListingAction(id: number, _: FormState, form: FormData): Promise<FormState> {
  const staff = await requireStaff();
  try {
    const { quantity: _q, ...input } = listingFrom(form);
    await updateListing(id, input, staff);
    revalidatePath(`/admin/products/${id}`);
    revalidatePath('/');
    return { ok: true, message: 'Saved.' };
  } catch (e) {
    if (e instanceof ListingError) return { errors: e.fields, message: 'Fix the fields marked below.' };
    return { message: (e as Error).message };
  }
}

export async function adjustStockAction(id: number, _: FormState, form: FormData): Promise<FormState> {
  const staff = await requireStaff();
  try {
    const delta = int(form.get('delta')) ?? 0;
    const reason = form.get('reason') === 'return' ? 'return' : 'adjust';
    const now = await adjustStock(id, delta, reason, text(form.get('note')), staff);
    revalidatePath(`/admin/products/${id}`);
    return { ok: true, message: `Stock is now ${now}.` };
  } catch (e) {
    if (e instanceof ListingError) return { errors: e.fields, message: e.message };
    return { message: (e as Error).message };
  }
}

export async function addPhotosAction(id: number, form: FormData) {
  const staff = await requireStaff();
  const photos = await photosFrom(form);
  if (photos.length) await addPhotos(id, photos, staff);
  revalidatePath(`/admin/products/${id}`);
}

export async function removePhotoAction(id: number, imageId: number) {
  const staff = await requireStaff();
  await removePhoto(id, imageId, staff);
  revalidatePath(`/admin/products/${id}`);
}

export async function mainPhotoAction(id: number, imageId: number) {
  const staff = await requireStaff();
  await makeMainPhoto(id, imageId, staff);
  revalidatePath(`/admin/products/${id}`);
}

export async function bulkAction(ids: number[], action: BulkAction) {
  const staff = await requireStaff();
  const results = await bulkUpdate(ids, action, staff);
  revalidatePath('/admin/products');
  revalidatePath('/');
  return results;
}

export async function lookupAction(code: string) {
  await requireStaff();
  return lookupBarcode(code);
}

export async function assistantAction(form: FormData): Promise<{ draft?: ListingDraft; error?: string }> {
  await requireStaff();
  try {
    const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
    if (!files.length) return { error: 'Take at least one photo first.' };
    const photos = await Promise.all(files.map(async (f) => ({
      data: Buffer.from(await f.arrayBuffer()),
      mediaType: (['image/png', 'image/webp'].includes(f.type) ? f.type : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
    })));
    return { draft: await draftFromPhotos(photos, String(form.get('note') ?? '')) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
