// Catalog for the storefront preview. These are the 9 real items from the current site
// (docs/rebuild/current-site/products.json): names, prices, retail prices and stock as the owner entered them.
// The photos are the owner's own listing photos, squared and compressed.
// Condition is left empty until the owner records it; the site never shows a condition nobody entered.
// This module is replaced by the database in the next stage, keeping the same shape.

export type Category = { slug: string; name: string };

export type Product = {
  id: number;
  slug: string;
  name: string;
  price: number;
  retail?: number;
  stock: number;
  category: string;
  image: string;
  alt: string;
  condition?: string;
  addedAt: string;
};

export const categories: Category[] = [
  { slug: 'home', name: 'Home' },
  { slug: 'gadgets', name: 'Gadgets' },
  { slug: 'clothing', name: 'Clothing' },
  { slug: 'pets', name: 'Pets' },
];

export const products: Product[] = [
  { id: 13, slug: 'faux-leather-leggings-l', name: 'Crz Yoga faux leather leggings, size L', price: 5, retail: 34.99, stock: 50, category: 'clothing', image: '/products/leggings.jpg', alt: 'Black Crz Yoga leggings in their bag', addedAt: '2026-08-04T18:19:23Z' },
  { id: 12, slug: 'portable-car-heater', name: 'Portable car heater, 150 W', price: 5, retail: 18, stock: 20, category: 'gadgets', image: '/products/car-heater.jpg', alt: 'A 150 W car heater fan in its box', addedAt: '2026-08-04T18:05:38Z' },
  { id: 11, slug: 'attachable-cat-bed', name: 'Attachable cat bed', price: 20, retail: 44, stock: 4, category: 'pets', image: '/products/cat-bed.jpg', alt: 'A cat resting in a hammock bed clamped to a table', addedAt: '2026-08-04T18:03:20Z' },
  { id: 10, slug: 'bonnyco-pink-light-box', name: 'Bonnyco pink light box', price: 8, retail: 17.99, stock: 6, category: 'home', image: '/products/bonnyco-light-box.jpg', alt: 'A pink Bonnyco letter light box in its box', addedAt: '2026-08-04T18:00:17Z' },
  { id: 9, slug: 'fall-wreath-20-inch', name: 'Fall decorative wreath, 20 inch', price: 10, retail: 25, stock: 10, category: 'home', image: '/products/fall-wreath.jpg', alt: 'An autumn wreath of leaves and white pumpkins', addedAt: '2026-08-04T17:57:31Z' },
  { id: 8, slug: 'wine-chiller-bucket', name: 'Concrete wine chiller bucket', price: 10, retail: 25, stock: 6, category: 'home', image: '/products/wine-chiller.jpg', alt: 'A concrete-look wine chiller bucket in its packaging', addedAt: '2026-08-04T17:53:55Z' },
  { id: 7, slug: 'recipe-binder', name: 'Recipe binder', price: 5, retail: 30, stock: 10, category: 'home', image: '/products/recipe-binder.jpg', alt: 'A white recipe binder in its box', addedAt: '2026-08-04T17:42:31Z' },
  { id: 6, slug: 'mini-karaoke-machine', name: 'Mini wireless karaoke machine', price: 5, retail: 30, stock: 39, category: 'gadgets', image: '/products/karaoke-machine.jpg', alt: 'A mini wireless karaoke machine in its box', addedAt: '2026-08-04T17:38:28Z' },
  { id: 5, slug: 'kids-gloves-age-8-10', name: 'Kids snow gloves, age 8 to 10', price: 5, retail: 17.99, stock: 30, category: 'clothing', image: '/products/kids-gloves.jpg', alt: 'Blue camouflage kids snow gloves with their tag', addedAt: '2026-08-03T16:54:56Z' },
];

export const money = (n: number) => `$${n.toFixed(2)}`;

export function savings(p: Product) {
  if (!p.retail || p.retail <= p.price) return null;
  const amount = p.retail - p.price;
  return { amount, percent: Math.round((amount / p.retail) * 100) };
}

export const inStock = () => products.filter((p) => p.stock > 0);
export const newest = () => [...inStock()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
export const bySavings = () => [...inStock()].filter((p) => savings(p)).sort((a, b) => savings(b)!.percent - savings(a)!.percent);
export const under = (max: number) => newest().filter((p) => p.price <= max);
export const inCategory = (slug: string) => newest().filter((p) => p.category === slug);
export const getProduct = (slug: string) => products.find((p) => p.slug === slug);
export const getCategory = (slug: string) => categories.find((c) => c.slug === slug);
export const related = (p: Product, n = 8) => {
  const same = newest().filter((x) => x.category === p.category && x.id !== p.id);
  const near = newest().filter((x) => x.category !== p.category && Math.abs(x.price - p.price) <= 10);
  return [...same, ...near].slice(0, n);
};

export const store = {
  name: 'H&H Outlet',
  legalName: 'His & Hers LLC',
  instagram: 'https://instagram.com/hisnhersllc',
  facebook: 'https://www.facebook.com/share/g/1AYyATQxvK/',
  freeShippingOver: 150,
  returnDays: 14,
  liveStore: 'https://www.hisnhersllc.com',
};
