import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
export default function NotFound() {
  return (
    <>
    <Header />
    <main id="main" className="mx-auto max-w-xl flex-1 px-4 py-20 text-center">
      <h1 className="font-display text-3xl font-semibold">This item is gone</h1>
      <p className="mt-3 text-muted">It may have sold, or the link is wrong. Most items are one of a kind.</p>
      <Link href="/" className="mt-6 inline-flex h-12 items-center rounded-lg bg-gold px-8 font-semibold text-ground hover:bg-gold-soft">See what is in stock</Link>
    </main>
    <Footer />
    </>
  );
}
