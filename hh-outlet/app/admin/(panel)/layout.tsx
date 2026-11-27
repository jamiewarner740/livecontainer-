import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { logoutAction } from '../actions';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s | H&H admin' }, robots: { index: false } };

const tabs = [
  { href: '/admin', label: 'Today', icon: 'M3 12h4l3 8 4-16 3 8h4' },
  { href: '/admin/list', label: 'List item', icon: 'M12 5v14M5 12h14' },
  { href: '/admin/sell', label: 'Sell', icon: 'M4 7h16l-1.5 12h-13L4 7Zm4 0V5a4 4 0 0 1 8 0v2' },
  { href: '/admin/orders', label: 'Orders', icon: 'M5 4h14v16H5zM9 9h6M9 13h6' },
  { href: '/admin/products', label: 'Stock', icon: 'M4 6h16M4 12h16M4 18h16' },
];
const more = [
  { href: '/admin/pallets', label: 'Pallets' },
  { href: '/admin/ebay', label: 'eBay' },
  { href: '/admin/insights', label: 'Insights' },
  { href: '/admin/activity', label: 'Activity' },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-ground/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="font-display text-lg font-semibold">H&amp;H <span className="text-gold">admin</span></Link>
          <nav aria-label="Admin" className="hidden gap-1 md:flex">
            {[...tabs, ...more].map((t) => <Link key={t.href} href={t.href} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink">{t.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/" className="text-muted hover:text-gold-soft">View store</Link>
            <span className="hidden text-muted sm:inline">{staff.name}</span>
            <form action={logoutAction}><button className="h-10 rounded-md border border-line px-3 hover:border-gold">Sign out</button></form>
          </div>
        </div>
        <nav aria-label="More" className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-2 md:hidden">
          {more.map((t) => <Link key={t.href} href={t.href} className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-sm">{t.label}</Link>)}
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-4">{children}</main>
      <nav aria-label="Main actions" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-ground pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="flex h-16 flex-col items-center justify-center gap-1 text-xs text-muted hover:text-gold-soft">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
