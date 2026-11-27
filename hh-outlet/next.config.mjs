/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { formats: ['image/avif', 'image/webp'], deviceSizes: [390, 640, 828, 1080, 1440], imageSizes: [160, 240, 320, 480] },
  // Quick List sends several phone photos in one form (they are shrunk in the browser first).
  experimental: { serverActions: { bodySizeLimit: '30mb' } },
};
export default nextConfig;
