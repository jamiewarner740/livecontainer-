import { sql } from '../db';
import { audit } from '../audit';
import type { Staff } from '../auth';

// Everything here reads real orders, stock and events. No figure is estimated unless its name says so.

export async function salesSummary(days: number) {
  const rows = await sql<{ channel: string; orders: number; units: number; revenue: number }[]>`
    select o.channel, count(distinct o.id)::int as orders, coalesce(sum(oi.qty), 0)::int as units, coalesce(sum(oi.price_cents * oi.qty), 0)::int as revenue
    from orders o join order_items oi on oi.order_id = o.id
    where o.status = 'paid' and o.paid_at > now() - make_interval(days => ${days})
    group by o.channel`;
  const by = (c: string) => rows.find((r) => r.channel === c) ?? { channel: c, orders: 0, units: 0, revenue: 0 };
  return { web: by('web'), store: by('store'), ebay: by('ebay'), total: rows.reduce((s, r) => ({ orders: s.orders + r.orders, units: s.units + r.units, revenue: s.revenue + r.revenue }), { orders: 0, units: 0, revenue: 0 }) };
}

export async function inventorySummary() {
  const [r] = await sql<{ listings: number; units: number; value: number; drafts: number; no_condition: number; aging30: number; aging90: number }[]>`
    select count(*) filter (where status = 'active' and stock > 0)::int as listings,
           coalesce(sum(stock) filter (where status = 'active'), 0)::int as units,
           coalesce(sum(stock * price_cents) filter (where status = 'active'), 0)::bigint::int as value,
           count(*) filter (where status = 'draft')::int as drafts,
           count(*) filter (where status = 'active' and condition is null)::int as no_condition,
           count(*) filter (where status = 'active' and stock > 0 and added_at < now() - interval '30 days')::int as aging30,
           count(*) filter (where status = 'active' and stock > 0 and added_at < now() - interval '90 days')::int as aging90
    from products`;
  return r;
}

export async function ordersToFulfill() {
  return sql<{ id: string; number: string; channel: string; fulfillment: string; fulfillment_status: string; name: string | null; total_cents: number; paid_at: Date }[]>`
    select id, number::text, channel, fulfillment, fulfillment_status, name, total_cents, paid_at from orders
    where status = 'paid' and fulfillment_status in ('unfulfilled','ready') and fulfillment <> 'in_store'
    order by paid_at limit 50`;
}

export async function recentlySold(limit = 10) {
  return sql<{ name: string; qty: number; price_cents: number; channel: string; paid_at: Date; product_id: number }[]>`
    select oi.name, oi.qty, oi.price_cents, o.channel, o.paid_at, oi.product_id from order_items oi join orders o on o.id = oi.order_id
    where o.status = 'paid' order by o.paid_at desc limit ${limit}`;
}

export async function attentionCounts() {
  const [r] = await sql<{ failed_jobs: number; ebay_needs_info: number; unpaid_old: number }[]>`
    select (select count(*) from jobs where status in ('failed','attention'))::int as failed_jobs,
           (select count(*) from ebay_listings where status in ('needs_info','failed'))::int as ebay_needs_info,
           (select count(*) from orders where status = 'pending_payment' and created_at < now() - interval '1 day')::int as unpaid_old`;
  return r;
}

/** Products shoppers aren't finding: in stock, listed over a week, few impressions or views in 30 days. */
export async function lowExposure(limit = 20) {
  return sql<{ id: number; name: string; price_cents: number; impressions: number; views: number; age_days: number }[]>`
    select p.id, p.name, p.price_cents,
           count(e.*) filter (where e.kind = 'impression')::int as impressions,
           count(e.*) filter (where e.kind = 'view')::int as views,
           extract(day from now() - p.added_at)::int as age_days
    from products p left join product_events e on e.product_id = p.id and e.created_at > now() - interval '30 days'
    where p.status = 'active' and p.stock > 0 and p.added_at < now() - interval '7 days'
    group by p.id order by views, impressions limit ${limit}`;
}

/** Viewed a lot but not bought: price, photos or description may need work. */
export async function viewedNotBought(limit = 20) {
  return sql<{ id: number; name: string; price_cents: number; views: number; adds: number; sold: number }[]>`
    select p.id, p.name, p.price_cents,
           count(e.*) filter (where e.kind = 'view')::int as views,
           count(e.*) filter (where e.kind = 'add_to_bag')::int as adds,
           coalesce((select sum(oi.qty) from order_items oi join orders o on o.id = oi.order_id
                     where oi.product_id = p.id and o.status = 'paid' and o.paid_at > now() - interval '30 days'), 0)::int as sold
    from products p join product_events e on e.product_id = p.id and e.created_at > now() - interval '30 days'
    where p.status = 'active' and p.stock > 0
    group by p.id having count(e.*) filter (where e.kind = 'view') >= 5
    order by sold, views desc limit ${limit}`;
}

export async function searchInsights() {
  const missed = await sql<{ q: string; times: number }[]>`
    select lower(q) as q, count(*)::int as times from search_log where results = 0 and created_at > now() - interval '60 days'
    group by lower(q) order by times desc limit 25`;
  const top = await sql<{ q: string; times: number; avg_results: number }[]>`
    select lower(q) as q, count(*)::int as times, round(avg(results))::int as avg_results from search_log where created_at > now() - interval '60 days'
    group by lower(q) order by times desc limit 25`;
  return { missed, top };
}

export async function categoryPerformance() {
  return sql<{ category: string; in_stock: number; sold_30d: number; revenue_30d: number; avg_days_to_sell: number | null }[]>`
    with sales as (
      select p.category, oi.qty, oi.price_cents, extract(epoch from o.paid_at - p.added_at) / 86400 as days
      from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
      where o.status = 'paid' and o.paid_at > now() - interval '30 days')
    select c.category, c.in_stock, coalesce(sum(s.qty), 0)::int as sold_30d, coalesce(sum(s.qty * s.price_cents), 0)::int as revenue_30d,
           round(avg(s.days)::numeric, 1)::float as avg_days_to_sell
    from (select category, sum(stock)::int as in_stock from products where status = 'active' group by category) c
    left join sales s on s.category = c.category
    group by c.category, c.in_stock order by revenue_30d desc`;
}

// Pallets --------------------------------------------------------------------------------------------------------

export type PalletInput = { label: string; supplier?: string | null; purchasedOn?: string | null; costCents: number; freightCents: number; otherCents: number; manifestRetailCents?: number | null; notes?: string | null };

export async function savePallet(id: number | null, p: PalletInput, staff: Staff) {
  if (!p.label.trim()) throw new Error('Give the pallet a name, like "Target home goods #12".');
  for (const v of [p.costCents, p.freightCents, p.otherCents]) if (!Number.isInteger(v) || v < 0) throw new Error('Costs must be dollar amounts of 0 or more.');
  if (id) {
    await sql`update pallets set label = ${p.label.trim()}, supplier = ${p.supplier ?? null}, purchased_on = ${p.purchasedOn ?? null}, cost_cents = ${p.costCents},
              freight_cents = ${p.freightCents}, other_cents = ${p.otherCents}, manifest_retail_cents = ${p.manifestRetailCents ?? null}, notes = ${p.notes ?? null} where id = ${id}`;
    await audit(staff.id, 'pallet.update', 'pallet', String(id), p);
    return id;
  }
  const [r] = await sql<{ id: number }[]>`
    insert into pallets (label, supplier, purchased_on, cost_cents, freight_cents, other_cents, manifest_retail_cents, notes)
    values (${p.label.trim()}, ${p.supplier ?? null}, ${p.purchasedOn ?? null}, ${p.costCents}, ${p.freightCents}, ${p.otherCents}, ${p.manifestRetailCents ?? null}, ${p.notes ?? null})
    returning id`;
  await audit(staff.id, 'pallet.create', 'pallet', String(r.id), p);
  return r.id;
}

export type PalletReport = {
  id: number; label: string; supplier: string | null; purchased_on: Date | null; total_cost: number;
  items: number; units_listed: number; units_sold: number; units_left: number; revenue: number; refunded: number; fees: number;
  left_value: number; sold_web: number; sold_store: number; sold_ebay: number;
};

/**
 * Money in and out per pallet. Revenue is what buyers actually paid for items from the pallet (refunds removed).
 * "Left value" is what the remaining stock would bring at today's prices: an estimate, labeled as one on screen.
 */
export async function palletReports(id?: number) {
  return sql<PalletReport[]>`
    select pa.id, pa.label, pa.supplier, pa.purchased_on, (pa.cost_cents + pa.freight_cents + pa.other_cents) as total_cost,
      count(distinct p.id)::int as items,
      coalesce((select sum(e.delta) from inventory_events e join products px on px.id = e.product_id where px.pallet_id = pa.id and e.reason in ('listed','seed')), 0)::int as units_listed,
      coalesce(sum(s.qty) filter (where s.status = 'paid'), 0)::int as units_sold,
      coalesce((select sum(px.stock) from products px where px.pallet_id = pa.id and px.status <> 'archived'), 0)::int as units_left,
      coalesce(sum(s.qty * s.price_cents) filter (where s.status = 'paid'), 0)::int as revenue,
      coalesce(sum(s.qty * s.price_cents) filter (where s.status = 'cancelled'), 0)::int as refunded,
      coalesce((select sum(o.fees_cents) from orders o where o.id in (select oi.order_id from order_items oi join products px on px.id = oi.product_id where px.pallet_id = pa.id)), 0)::int as fees,
      coalesce((select sum(px.stock * px.price_cents) from products px where px.pallet_id = pa.id and px.status = 'active'), 0)::int as left_value,
      coalesce(sum(s.qty) filter (where s.channel = 'web' and s.status = 'paid'), 0)::int as sold_web,
      coalesce(sum(s.qty) filter (where s.channel = 'store' and s.status = 'paid'), 0)::int as sold_store,
      coalesce(sum(s.qty) filter (where s.channel = 'ebay' and s.status = 'paid'), 0)::int as sold_ebay
    from pallets pa
    left join products p on p.pallet_id = pa.id
    left join lateral (
      select oi.qty, oi.price_cents, o.status, o.channel from order_items oi join orders o on o.id = oi.order_id
      where oi.product_id = p.id and o.status in ('paid','cancelled')) s on true
    where ${id ? sql`pa.id = ${id}` : sql`true`}
    group by pa.id order by pa.purchased_on desc nulls last, pa.id desc`;
}
