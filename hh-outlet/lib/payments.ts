// Payment providers. Square is the store's processor. "test" exists only to exercise checkout before Square keys are
// added: it never moves money, is refused in a production build unless explicitly allowed, and the pay page says so.

export type ChargeInput = { sourceId: string; amountCents: number; idempotencyKey: string; reference: string; email: string };
export type ChargeResult = { ok: true; paymentId: string } | { ok: false; error: string };

export type ClientConfig =
  | { provider: 'square'; applicationId: string; locationId: string; sdkUrl: string }
  | { provider: 'test' }
  | { provider: 'none' };

type Provider = { name: string; charge: (i: ChargeInput) => Promise<ChargeResult> };

function squareEnv() {
  const { SQUARE_ACCESS_TOKEN: token, SQUARE_APPLICATION_ID: appId, SQUARE_LOCATION_ID: locationId, SQUARE_ENVIRONMENT: env } = process.env;
  if (!token || !appId || !locationId) return null;
  const sandbox = env !== 'production';
  return {
    token, appId, locationId,
    api: sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com',
    sdkUrl: sandbox ? 'https://sandbox.web.squarecdn.com/v1/square.js' : 'https://web.squarecdn.com/v1/square.js',
  };
}

export function testModeAllowed() {
  if (process.env.PAYMENTS_PROVIDER !== 'test') return false;
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_PAYMENTS === 'yes-this-is-not-the-live-site';
}

export function getClientConfig(): ClientConfig {
  const sq = squareEnv();
  if (sq && process.env.PAYMENTS_PROVIDER !== 'test') return { provider: 'square', applicationId: sq.appId, locationId: sq.locationId, sdkUrl: sq.sdkUrl };
  if (testModeAllowed()) return { provider: 'test' };
  return { provider: 'none' };
}

const square = (sq: NonNullable<ReturnType<typeof squareEnv>>): Provider => ({
  name: 'square',
  async charge(i) {
    try {
      const res = await fetch(`${sq.api}/v2/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sq.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: i.sourceId,
          idempotency_key: i.idempotencyKey,
          amount_money: { amount: i.amountCents, currency: 'USD' },
          location_id: sq.locationId,
          reference_id: i.reference.slice(0, 40),
          buyer_email_address: i.email,
          autocomplete: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { payment?: { id: string; status: string }; errors?: { code: string; detail?: string }[] };
      if (res.ok && body.payment && ['COMPLETED', 'APPROVED'].includes(body.payment.status)) return { ok: true, paymentId: body.payment.id };
      const e = body.errors?.[0];
      return { ok: false, error: friendlyDecline(e?.code) ?? 'The payment did not go through. Please check your card details or try another card.' };
    } catch {
      return { ok: false, error: 'We could not reach the payment service. You have not been charged. Please try again.' };
    }
  },
});

const test: Provider = {
  name: 'test',
  async charge(i) {
    if (i.sourceId === 'test-decline') return { ok: false, error: 'Test card declined. No money moved.' };
    if (i.sourceId !== 'test-ok') return { ok: false, error: 'Unknown test card.' };
    return { ok: true, paymentId: `test_${i.idempotencyKey}` };
  },
};

export function getPaymentProvider(): Provider {
  const cfg = getClientConfig();
  if (cfg.provider === 'square') return square(squareEnv()!);
  if (cfg.provider === 'test') return test;
  return { name: 'none', charge: async () => ({ ok: false, error: 'Online payments are not set up yet. Please pay at the store when you pick up.' }) };
}

function friendlyDecline(code?: string) {
  switch (code) {
    case 'CARD_DECLINED': case 'GENERIC_DECLINE': return 'Your card was declined. Please try another card.';
    case 'INSUFFICIENT_FUNDS': return 'Your card was declined for insufficient funds. Please try another card.';
    case 'CVV_FAILURE': return 'The security code did not match. Please check it and try again.';
    case 'ADDRESS_VERIFICATION_FAILURE': return 'The billing ZIP code did not match the card. Please check it and try again.';
    case 'INVALID_EXPIRATION': case 'CARD_EXPIRED': return 'The card has expired or the expiry date is wrong.';
    default: return null;
  }
}

/**
 * Refunds a payment in full or in part. The idempotency key makes a retried refund safe: Square returns the same
 * refund instead of sending the money twice.
 */
export async function refundPayment(provider: string | null, paymentId: string, amountCents: number, idempotencyKey: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (provider === 'test') return { ok: true };
  if (provider !== 'square') return { ok: false, error: 'This order was not paid online, so there is nothing to refund here.' };
  const sq = squareEnv();
  if (!sq) return { ok: false, error: 'Square is not connected, so the refund could not be sent. Refund it in the Square dashboard.' };
  try {
    const res = await fetch(`${sq.api}/v2/refunds`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sq.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotency_key: idempotencyKey.slice(0, 45), payment_id: paymentId, amount_money: { amount: amountCents, currency: 'USD' }, reason: reason.slice(0, 192) }),
    });
    const body = (await res.json().catch(() => ({}))) as { refund?: { status: string }; errors?: { detail?: string }[] };
    if (res.ok && body.refund && body.refund.status !== 'REJECTED' && body.refund.status !== 'FAILED') return { ok: true };
    return { ok: false, error: `Square did not accept the refund${body.errors?.[0]?.detail ? `: ${body.errors[0].detail}` : ''}.` };
  } catch {
    return { ok: false, error: 'Square could not be reached. Nothing was refunded; try again.' };
  }
}
