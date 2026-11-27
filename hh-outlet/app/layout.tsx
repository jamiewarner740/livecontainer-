import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', weight: ['600', '700'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'https://www.hisnhersllc.com'),
  title: { default: 'H&H Outlet: discount home goods, gadgets and clothing', template: '%s | H&H Outlet' },
  description: 'Returned and overstock home goods, gadgets, clothing and more at a fraction of retail. Shop online or pick up in store.',
  openGraph: { siteName: 'H&H Outlet', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#0a0a0a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
