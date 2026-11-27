# H&H Outlet — site audit (hisnhersllc.com)

Audited 27 Nov 2026. Full styled version: [`audit.html`](audit.html) (also published at https://claude.ai/artifact/1rHTXMBiJuVdkTv7RrmN5p).
Screenshots of the current site: [`screenshots/`](screenshots/). Current catalog data: [`current-site/products.json`](current-site/products.json).

## Verdict

Rebuild the storefront. Keep the operations features. The admin side fits a liquidation store well. The shop side stops people from buying.

| Area | Grade | Why |
| --- | --- | --- |
| Conversion / checkout | F | Login wall through Replit, no guest checkout |
| Catalog & content | D | 9 items, no descriptions, no categories |
| Performance | D | ~13 MB product grid, 1.6 MB logo |
| SEO & local search | D | Empty HTML, no store address |
| Accessibility | C | Pinch-zoom blocked, unlabeled icon buttons |
| Brand & copy | C | Luxury-boutique voice for a $5 bargain store |
| Trust & legal | C | Policies exist, homepage claims don't hold |
| Back office | B | Strong feature set |

## Top 5 (must fix in the rebuild)

1. **Buying requires a Replit account.** Cart, checkout and favorites all need a sign-in through Replit. Add guest checkout.
2. **The homepage shows no products.** Featured is empty and Categories says "No Divisions Found."
3. **Product photos are screenshots of Amazon listings**, with Amazon's interface visible. Use real photos of the actual stock.
4. **No store address, hours, map or phone** anywhere, even though the site says "visit us in store."
5. **The copy promises a different business.** "Global Delivery", "Premium", "Exclusive drops" and "finalize your acquisition" don't fit liquidation stock.

## Other findings

- **Pricing:** every item is "SALE" with an unexplained compare-at price ($5 vs $34.99, "86% OFF"). Label it "Est. retail".
- **Condition:** there's no condition field (New / Open box / Like new / As-is).
- **Product names:** inconsistent, with trailing spaces and sizes in titles.
- **Images:** full-resolution phone photos (up to 3072×4080) are used as thumbnails. Serve resized WebP/AVIF with `srcset`.
- **Logo:** 1.6 MB PNG, loaded twice. Favicon is 199 KB and the share image is 765 KB.
- **Rendering:** client-rendered only, so search engines see an empty `<div id="root">`. Server-render or pre-render the pages.
- **Sitemap:** lists `/cart`, `/profile` and `/orders` but no products.
- **Meta tags:** the same description on every page, and some titles repeat the brand.
- **404s:** missing pages return HTTP 200 (soft 404).
- **Analytics:** none installed.
- **Zoom:** `maximum-scale=1` blocks zoom (fails WCAG 1.4.4). There are 11 unnamed icon buttons and low-contrast stock text.
- **Names:** three names in use (His & Hers / H&H Outlet / His & Hers LLC).
- **Contact email:** the public address is a personal-looking handle, and there's no phone number.
- **Mobile:** the "Add to Home Screen" popup covers the main CTA on mobile.
- **Footer:** the "New Arrivals" link uses `?sort=newest`, but the page reads `sortBy`, so the link has no effect.
- **Hosting:** everything is hosted on Replit (`his-and-hers-llc.replit.app`) with Replit Auth and Replit object storage.

## Current features (don't lose these)

| Area | Feature | Built on |
| --- | --- | --- |
| Payments | Card checkout, saved cards, refunds from admin | Square Web Payments |
| Shipping | Live rates, buy/reprint labels, free local pickup | Shippo |
| Listing tools | Barcode scanner, UPC lookup, photo item ID, camera upload | ZXing, UPCitemdb (trial), Open Food Facts |
| Inventory | Inline stock edits, low-stock list, featured flag, weight | Custom admin |
| Orders | Statuses through shipped / picked up / refunded, tracking | Custom admin |
| Reporting | Sales chart, revenue by category, subscribers | Recharts |
| Staff | Roles: Owner, Manager, Customer | Replit Auth (replace) |
| Email | Order confirmation and shipping notification | Gmail (move to Resend or Postmark) |
| Customer | Favorites, reviews, order history, newsletter, contact form | Custom |

## Rebuild priorities

**Must-have:**
- Guest checkout
- One brand name
- Address, hours and phone on every page
- Homepage led by this week's arrivals
- Real photos, condition badge and "Est. retail" price labels
- Resized images
- Server-rendered pages

**Next:**
- Structured data (Product, LocalBusiness)
- Product sitemap and real 404s
- Analytics
- Newsletter connected to an email tool
- Drop-day posts tied to Instagram and Facebook
- Phone-friendly scan-to-list flow

**Later:**
- Hold for pickup
- Bulk / pallet sales for resellers
- Review requests after purchase

## Method

Every public page was loaded in headless Chrome at 1440px and on iPhone 13. I recorded network traffic, console errors, page text, image sizes and basic accessibility checks, and read the public JS bundle. Nothing was purchased. Admin and account pages were only seen signed out.
