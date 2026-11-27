# Project notes

## H&H Outlet rebuild (branch `his-and-hers`)

We are rebuilding https://www.hisnhersllc.com/ (H&H Outlet, a pallet-liquidation store run by His & Hers LLC) for a friend.

Before working on the rebuild, read:
- `docs/rebuild/AUDIT.md`: audit of the current site, with problems, the feature inventory and priorities
- `docs/rebuild/BRIEF.md`: the owner's business details and decisions. Use only real details from here. Ask about anything marked `?` or left blank instead of inventing it.
- `docs/rebuild/current-site/`: current product data, manifest and original logo
- `docs/rebuild/screenshots/`: how the current site looks

Storefront: `hh-outlet/` is a Next.js app in the original site's black and gold theme (near-black #0a0a0a, gold #d6a32b, Playfair Display headings, Inter text). It is product-first: items show on the first phone screen. The owner chose this over the taste skill's one-section-per-screen layout, so don't apply that skill's page-layout rules or gate to the store.
Use the store's real address, phone and email from `BRIEF.md` once given; never invent hours, contacts or product conditions.
