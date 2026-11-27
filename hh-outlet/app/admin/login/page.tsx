import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Staff sign in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentStaff()) redirect('/admin');
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <p className="font-display text-2xl font-semibold">H&amp;H <span className="text-gold">Outlet</span></p>
      <h1 className="mt-1 text-lg">Staff sign in</h1>
      <LoginForm next={next ?? '/admin'} />
    </main>
  );
}
