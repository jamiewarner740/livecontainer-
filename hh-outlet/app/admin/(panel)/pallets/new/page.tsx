import type { Metadata } from 'next';
import Link from 'next/link';
import { PalletForm } from '../PalletForm';
export const metadata: Metadata = { title: 'Add a pallet' };
export default function NewPallet() {
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/admin/pallets" className="text-sm text-muted hover:text-gold-soft">← Pallets</Link>
      <h1 className="mt-1 mb-4 font-display text-2xl font-semibold">Add a pallet</h1>
      <PalletForm id={null} />
    </div>
  );
}
