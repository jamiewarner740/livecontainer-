# H&H Outlet store

Next.js storefront with a Postgres database for products, stock, orders and payments.

## Run it locally

1. Postgres 16 running, and an empty database.
2. `cp .env.example .env.local` and set `DATABASE_URL`.
3. `npm install`
4. `npm run db:setup` creates the tables and loads the 9 current items. It is safe to run again: existing products and their stock are left alone.
5. `npm run build && npm start`, then open http://localhost:3000.

Tests use a separate database (`hh_outlet_test` by default, or set `TEST_DATABASE_URL`). Run `DATABASE_URL=<test db> npx tsx scripts/migrate.ts` once, then `npm test`.

## How buying works

- **Bag:** kept in a cookie, no account needed. Names, prices and stock are always read fresh from the database.
- **Checkout:** creates the order and holds the stock for 15 minutes in one transaction. Product rows are locked, so two buyers can't take the last unit.
- **Expired holds:** these free their stock automatically, with no cleanup job.
- **Payment:** first re-checks the hold, then charges once (a retry never charges twice). Only then does stock go down, and every change is logged in `inventory_events`.

## Settings (`.env.local`)

| Setting | What it does | Status |
| --- | --- | --- |
| `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT` | Card payments through the owner's Square account. Use `sandbox` keys first. | **Needed from the owner** |
| `SHIPPING_FLAT_RATE_CENTS` | Shipping price under $150. Empty means pickup only, except orders of $150 or more, which ship free. | **Needed from the owner** |
| `TAX_RATE_BPS` | Sales tax in basis points (700 = 7%). | **Needed from the owner**; 0 until confirmed |
| `PAYMENTS_PROVIDER=test` | Fake payments for trying checkout. No money moves. | Never on the live site |

## Not built yet

- Order emails.
- Live carrier rates (Shippo).
- The admin side (listing items, orders, in-store sales).
- eBay sync.
