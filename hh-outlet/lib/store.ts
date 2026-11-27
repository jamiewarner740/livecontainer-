export type Category = { slug: string; name: string };

export const categories: Category[] = [
  { slug: 'home', name: 'Home' },
  { slug: 'gadgets', name: 'Gadgets' },
  { slug: 'clothing', name: 'Clothing' },
  { slug: 'pets', name: 'Pets' },
];

export const store = {
  name: 'H&H Outlet',
  legalName: 'His & Hers LLC',
  instagram: 'https://instagram.com/hisnhersllc',
  facebook: 'https://www.facebook.com/share/g/1AYyATQxvK/',
  freeShippingOverCents: 15000,
  returnDays: 14,
  holdMinutes: 15,
};

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const getCategory = (slug: string) => categories.find((c) => c.slug === slug);
