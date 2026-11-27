import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Activity' };

export default async function Activity() {
  await requireStaff('owner');
  const rows = await sql<{ action: string; entity: string | null; entity_id: string | null; detail: unknown; created_at: Date; staff: string | null }[]>`
    select a.action, a.entity, a.entity_id, a.detail, a.created_at, s.name as staff from audit_log a left join staff s on s.id = a.staff_id
    order by a.created_at desc limit 300`;
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Activity</h1>
      <p className="text-sm text-muted">Every price change, stock change, sale, refund, sign-in and setting change, newest first.</p>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">
        {rows.map((r, i) => (
          <li key={i} className="p-3">
            <span className="font-medium">{r.action}</span> <span className="text-muted">{r.entity ? `${r.entity} ${r.entity_id}` : ''}</span>
            <span className="block text-xs text-muted">{r.staff ?? 'system'} · {r.created_at.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}{r.detail ? ` · ${JSON.stringify(r.detail).slice(0, 160)}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
