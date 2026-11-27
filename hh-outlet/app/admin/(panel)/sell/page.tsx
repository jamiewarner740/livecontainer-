import type { Metadata } from 'next';
import { SellScreen } from './SellScreen';

export const metadata: Metadata = { title: 'Sell in store' };

export default function SellPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-semibold">Sell in store</h1>
      <p className="text-sm text-muted">Scan or search, check the price, record the sale. Stock and eBay update right away.</p>
      <SellScreen />
    </div>
  );
}
