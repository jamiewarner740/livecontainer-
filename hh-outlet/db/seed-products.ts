// The 9 real items from the current site (docs/rebuild/current-site/products.json), with the owner's own photos.
// Loaded into the database by `npm run db:seed`. Prices are in cents. Condition stays empty until the owner records it.
import type { SeedProduct } from './types';

export const seedProducts: SeedProduct[] = [
  { id: 13, slug: 'faux-leather-leggings-l', name: 'Crz Yoga faux leather leggings, size L', priceCents: 500, retailCents: 3499, stock: 50, category: 'clothing', image: '/products/leggings.jpg', alt: 'Black Crz Yoga leggings in their bag', addedAt: '2026-08-04T18:19:23Z' },
  { id: 12, slug: 'portable-car-heater', name: 'Portable car heater, 150 W', priceCents: 500, retailCents: 1800, stock: 20, category: 'gadgets', image: '/products/car-heater.jpg', alt: 'A 150 W car heater fan in its box', addedAt: '2026-08-04T18:05:38Z' },
  { id: 11, slug: 'attachable-cat-bed', name: 'Attachable cat bed', priceCents: 2000, retailCents: 4400, stock: 4, category: 'pets', image: '/products/cat-bed.jpg', alt: 'A cat resting in a hammock bed clamped to a table', addedAt: '2026-08-04T18:03:20Z' },
  { id: 10, slug: 'bonnyco-pink-light-box', name: 'Bonnyco pink light box', priceCents: 800, retailCents: 1799, stock: 6, category: 'home', image: '/products/bonnyco-light-box.jpg', alt: 'A pink Bonnyco letter light box in its box', addedAt: '2026-08-04T18:00:17Z' },
  { id: 9, slug: 'fall-wreath-20-inch', name: 'Fall decorative wreath, 20 inch', priceCents: 1000, retailCents: 2500, stock: 10, category: 'home', image: '/products/fall-wreath.jpg', alt: 'An autumn wreath of leaves and white pumpkins', addedAt: '2026-08-04T17:57:31Z' },
  { id: 8, slug: 'wine-chiller-bucket', name: 'Concrete wine chiller bucket', priceCents: 1000, retailCents: 2500, stock: 6, category: 'home', image: '/products/wine-chiller.jpg', alt: 'A concrete-look wine chiller bucket in its packaging', addedAt: '2026-08-04T17:53:55Z' },
  { id: 7, slug: 'recipe-binder', name: 'Recipe binder', priceCents: 500, retailCents: 3000, stock: 10, category: 'home', image: '/products/recipe-binder.jpg', alt: 'A white recipe binder in its box', addedAt: '2026-08-04T17:42:31Z' },
  { id: 6, slug: 'mini-karaoke-machine', name: 'Mini wireless karaoke machine', priceCents: 500, retailCents: 3000, stock: 39, category: 'gadgets', image: '/products/karaoke-machine.jpg', alt: 'A mini wireless karaoke machine in its box', addedAt: '2026-08-04T17:38:28Z' },
  { id: 5, slug: 'kids-gloves-age-8-10', name: 'Kids snow gloves, age 8 to 10', priceCents: 500, retailCents: 1799, stock: 30, category: 'clothing', image: '/products/kids-gloves.jpg', alt: 'Blue camouflage kids snow gloves with their tag', addedAt: '2026-08-03T16:54:56Z' },
];
