import type { MetadataRoute } from 'next';
import { categories, products } from '@/lib/catalog';
const base = 'https://www.hisnhersllc.com';
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    ...categories.map((c) => ({ url: `${base}/c/${c.slug}`, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...products.filter((p) => p.stock > 0).map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.addedAt, priority: 0.7 })),
  ];
}
