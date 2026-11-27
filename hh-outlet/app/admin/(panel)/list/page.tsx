import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { assistantEnabled } from '@/lib/assistant';
import { QuickListForm } from './QuickListForm';

export const metadata: Metadata = { title: 'List an item' };

export default async function QuickListPage() {
  const pallets = await sql<{ id: number; label: string }[]>`select id, label from pallets order by created_at desc limit 50`;
  const locations = (await sql<{ location: string }[]>`
    select location from products where location is not null group by location order by max(updated_at) desc limit 30`).map((r) => r.location);
  const [ebay] = await sql<{ connected: boolean }[]>`select (refresh_token_enc is not null) as connected from ebay_account where id = 1`;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-semibold">List an item</h1>
      <p className="text-sm text-muted">Photos, condition, price, publish. Fields under “More details” are optional.</p>
      <QuickListForm pallets={pallets} locations={locations} assistant={assistantEnabled()} ebayConnected={!!ebay?.connected} />
    </div>
  );
}
