# H&H Outlet

The store's website and back office in one Next.js app with a Postgres database. It covers:

- **The shop:** online shopping with pickup or shipping.
- **Selling:** a phone-friendly listing tool, counter sales and orders.
- **The business:** pallets and profit, insights, and eBay cross-listing.

All of it runs on one stock count.

## What's built, and what's waiting on accounts

| Part | Status |
| --- | --- |
| Storefront: home, categories, search, product pages, bag, guest checkout, order page | Built and tested |
| Stock holds during checkout, so the last unit can't sell twice | Built and tested (a 10-buyer race test) |
| Staff login, audit log of every change | Built and tested |
| Quick List (phone camera photos, barcode scan, condition, price, publish) | Built and tested in a phone browser |
| Barcode scanning with the camera | Chrome on Android. Safari on iPhone has no camera barcode support; type the number there |
| Barcode lookup | Built. Uses UPCitemdb's free tier (about 100 lookups a day) unless `UPCITEMDB_KEY` is set |
| "Fill in from photos" assistant (Claude) | Built and compiles. **Needs `ANTHROPIC_API_KEY`; not yet run against the API** |
| Stock list, bulk publish, price %, category, shelf, eBay on/off | Built and tested |
| Counter sales, orders, fulfillment steps, refunds | Built and tested. Refunds call Square, so they **need Square keys** |
| Pallets with cost, sales by channel and profit | Built and tested |
| Today dashboard, insights (missed searches, low-exposure items), activity log | Built |
| Card payments (Square) | Built. **Needs the owner's Square keys; not yet run against Square** |
| eBay: connect, publish, quantity sync, order import, shipment tracking, importing old listings | Built and tested against a fake eBay server. **Needs eBay developer keys; not yet run against eBay's sandbox** |
| Shipping rates | Flat rate under $150 (`SHIPPING_FLAT_RATE_CENTS`), free from $150. Live carrier rates (Shippo) are not built |
| Order emails, SMS alerts, saved searches, marketing graphics | Not built |

## Run it locally

1. Postgres 16 and Node 22.
2. `cp .env.example .env.local` and fill it in (see below).
3. `npm install`
4. `npm run db:setup`: creates the tables and loads the 9 items from the old site. It's safe to rerun.
5. `STAFF_PASSWORD='a long password' npm run staff:create -- you@example.com "Your Name" owner`
6. `npm run build && npm start` for the site, and `npm run worker` in a second terminal for background jobs.
7. Shop: http://localhost:3000. Admin: http://localhost:3000/admin.

To run the tests:

1. Create a separate database: `createdb hh_outlet_test`.
2. Set it up once: `DATABASE_URL=postgres://…/hh_outlet_test npx tsx scripts/migrate.ts`.
3. Run `npm test`.

There are 43 tests. They cover:

- checkout holds and the race for the last unit
- payments, retries and refunds
- counter sales
- bulk edits
- pallet maths
- eBay order import, oversells and cancellations
- the eBay publish sequence
- the job queue

## Settings (`.env.local`)

| Setting | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Everything | Postgres connection string |
| `SITE_URL` | eBay photos, links | e.g. `https://www.hisnhersllc.com`. eBay loads listing photos from here |
| `APP_SECRET` | eBay | 32+ random characters. Encrypts the stored eBay tokens. Never change it once eBay is connected |
| `UPLOAD_DIR` | Photos | Folder for uploaded photos (default `./uploads`). Must survive restarts: use a persistent disk |
| `SQUARE_ENVIRONMENT`, `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, `SQUARE_ACCESS_TOKEN` | Card payments, refunds | From an app in the owner's Square Developer account. Use `sandbox` first |
| `SHIPPING_FLAT_RATE_CENTS` | Shipping under $150 | Empty means pickup only below $150 |
| `TAX_RATE_BPS` | Sales tax | 700 = 7%. Ask the owner or their accountant |
| `EBAY_ENVIRONMENT`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME` | eBay | From developer.ebay.com. Set the RuName's "auth accepted URL" to `SITE_URL/admin/ebay/callback` |
| `CRON_SECRET` | Hosts without a worker process | Call `GET /api/cron` every minute with `Authorization: Bearer <secret>` |
| `ANTHROPIC_API_KEY` | Photo assistant | Optional. Without it, the button is hidden |
| `UPCITEMDB_KEY` | More barcode lookups | Optional |
| `PAYMENTS_PROVIDER=test` | Trying checkout | Fake payments. Refused in production unless `ALLOW_TEST_PAYMENTS` is also set. **Never on the live site** |

## How the important parts work

- **One stock count.** `products.stock` is what's on the shelf. Every change is a row in `inventory_events`, recording why it happened, who did it and which order it belongs to. Changes come from listing, adjustments, returns and sales on all three channels.
- **No double-selling within the site.** Online checkout, counter sales and stock adjustments all lock the product row. They all respect "holds" from shoppers who are paying right now.
- **eBay is a separate system, so it's kept in step:**
  - **Quantity:** after any sale or stock change here, the eBay quantity is updated within about 15 seconds by the worker.
  - **Orders:** eBay orders are pulled every 5 minutes, and their stock is taken here.
  - **Remaining risk:** an item can still sell in both places inside that gap. When that happens, it's recorded on the eBay page as "sold on both channels" for the owner to sort out. Stock never goes below zero.
- **Background jobs** (eBay) are retried with growing waits. Problems only the owner can fix are shown with eBay's message and a retry button. Examples: a missing policy, or a condition eBay doesn't allow in that category.

## Deploying

The app needs:

- a Node server
- Postgres
- a persistent folder for photos
- the worker process, or a scheduler calling `/api/cron`

A small VPS or a platform with persistent disks (Render, Railway, Fly.io) fits. A serverless host would also need photo storage moved to S3, R2 or similar; `lib/images.ts` is the only file that would change.

Before switching the domain over from the old Replit site:

1. Export any customers and orders from the Replit app.
2. Keep the old product URLs working. Old links look like `/products/13`; the new ones look like `/products/<slug>`. A redirect from old to new can be added.
3. Set real hours and the store address. They're shown nowhere until the owner provides them.

## Running costs (as of late 2026; check current prices)

| Service | Cost |
| --- | --- |
| Hosting with Postgres and disk | Roughly $10 to $30 a month |
| Square online card payments | About 2.9% + 30¢ per payment |
| Square in-person card payments | About 2.6% + 15¢ |
| eBay final value fees | Roughly 13 to 15% of the sale in most categories. Set a markup on the eBay page to cover them |
| UPCitemdb | Free for about 100 lookups a day; paid plans for more |
| Claude photo assistant | Optional. A few cents per listing |
