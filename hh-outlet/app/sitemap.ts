import type { MetadataRoute } from 'next';
import { listProducts } from '@/lib/products';
import { categories } from '@/lib/store';

const base = 'https://www.hisnhersllc.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await listProducts();
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    ...categories.map((c) => ({ url: `${base}/c/${c.slug}`, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...items.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.addedAt, priority: 0.7 })),
  ];
}
