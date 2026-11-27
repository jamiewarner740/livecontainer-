import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { currentStaff } from '@/lib/auth';
import { authorizeUrl, ebayConfig } from '@/lib/ebay/client';

// Starts eBay's sign-in. The random state is checked on the way back so another site can't connect its account here.
export async function GET() {
  const staff = await currentStaff();
  if (!staff || staff.role !== 'owner') return new Response('Only the owner can connect eBay.', { status: 403 });
  if (!ebayConfig().configured) return new Response('eBay keys are not set up on the server yet.', { status: 400 });
  const state = randomBytes(24).toString('base64url');
  (await cookies()).set('hh_ebay_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/admin/ebay', maxAge: 600 });
  return Response.redirect(authorizeUrl(state), 302);
}
