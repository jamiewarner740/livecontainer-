import Link from 'next/link';
export default function AdminHome() {
  return <div><h1 className="font-display text-2xl font-semibold">Today</h1><p className="mt-2 text-muted">Dashboard coming next. <Link className="underline" href="/admin/list">List an item</Link>.</p></div>;
}
