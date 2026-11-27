export type SeedProduct = {
  id: number; slug: string; name: string; priceCents: number; retailCents?: number; stock: number;
  category: string; image: string; alt: string; condition?: string; addedAt: string;
};
