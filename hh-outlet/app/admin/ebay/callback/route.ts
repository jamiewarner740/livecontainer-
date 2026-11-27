import { cookies } from 'next/headers';
import { currentStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { connectWithCode } from '@/lib/ebay/client';

// eBay sends the owner back here after they approve access. Set this URL as the "auth accepted URL" of the RuName.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (msg: string) => Response.redirect(new URL(`/admin/ebay?msg=${encodeURIComponent(msg)}`, url), 302);
  const staff = await currentStaff();
  if (!staff || staff.role !== 'owner') return new Response('Sign in as the owner first.', { status: 403 });
  const jar = await cookies();
  const expected = jar.get('hh_ebay_state')?.value;
  jar.delete('hh_ebay_state');
  if (!expected || url.searchParams.get('state') !== expected) return back('The eBay sign-in could not be verified. Try connecting again.');
  const code = url.searchParams.get('code');
  if (!code) return back('eBay did not grant access.');
  try {
    await connectWithCode(code);
    await audit(staff.id, 'ebay.connect', 'ebay', '1');
    return back('eBay connected. Now choose your policies and ship-from location.');
  } catch (e) {
    return back((e as Error).message);
  }
}
