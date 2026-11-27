import { sql } from '../db';
import { decrypt, encrypt } from '../crypto';

// eBay REST APIs through the owner's own account, connected with eBay's OAuth sign-in (the site never sees the
// eBay password). Set EBAY_ENVIRONMENT=sandbox while testing; nothing reaches the real store until it says production.
// NOTE: written against eBay's published Sell APIs (Inventory, Account, Fulfillment, Taxonomy, Metadata) but not yet
// run against eBay: it needs the owner's developer keys. Test it in the sandbox before switching to production.

export const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
];

export function ebayConfig() {
  const { EBAY_CLIENT_ID: clientId, EBAY_CLIENT_SECRET: clientSecret, EBAY_RUNAME: ruName, EBAY_ENVIRONMENT: env } = process.env;
  const production = env === 'production';
  return {
    configured: !!(clientId && clientSecret && ruName && process.env.APP_SECRET),
    clientId, clientSecret, ruName, production,
    api: production ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com',
    auth: production ? 'https://auth.ebay.com' : 'https://auth.sandbox.ebay.com',
  };
}

export class EbayError extends Error {
  constructor(message: string, public status: number, public needsOwner: boolean, public body?: unknown) { super(message); }
}

export function authorizeUrl(state: string) {
  const c = ebayConfig();
  const q = new URLSearchParams({ client_id: c.clientId!, redirect_uri: c.ruName!, response_type: 'code', scope: SCOPES.join(' '), state });
  return `${c.auth}/oauth2/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const c = ebayConfig();
  const res = await fetch(`${c.api}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}` },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new EbayError(`eBay sign-in failed: ${json.error_description ?? res.status}`, res.status, true);
  return json;
}

/** Finishes the OAuth sign-in: trades the one-time code for tokens and stores them encrypted. */
export async function connectWithCode(code: string) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: ebayConfig().ruName! });
  await sql`
    insert into ebay_account (id, access_token_enc, access_expires_at, refresh_token_enc, refresh_expires_at, connected_at)
    values (1, ${encrypt(t.access_token!)}, now() + make_interval(secs => ${t.expires_in ?? 7200}), ${encrypt(t.refresh_token!)},
            now() + make_interval(secs => ${t.refresh_token_expires_in ?? 47304000}), now())
    on conflict (id) do update set access_token_enc = excluded.access_token_enc, access_expires_at = excluded.access_expires_at,
      refresh_token_enc = excluded.refresh_token_enc, refresh_expires_at = excluded.refresh_expires_at, connected_at = now()`;
}

export async function disconnect() {
  await sql`update ebay_account set access_token_enc = null, refresh_token_enc = null, access_expires_at = null, refresh_expires_at = null, connected_at = null where id = 1`;
}

/** A valid access token, refreshed when it has under 5 minutes left. */
async function accessToken(force = false) {
  const [a] = await sql<{ access_token_enc: string | null; access_expires_at: Date | null; refresh_token_enc: string | null; refresh_expires_at: Date | null }[]>`
    select access_token_enc, access_expires_at, refresh_token_enc, refresh_expires_at from ebay_account where id = 1`;
  if (!a?.refresh_token_enc) throw new EbayError('eBay is not connected. Connect it on the eBay page.', 401, true);
  if (a.refresh_expires_at && a.refresh_expires_at < new Date()) throw new EbayError('The eBay connection expired. Connect eBay again.', 401, true);
  if (!force && a.access_token_enc && a.access_expires_at && a.access_expires_at.getTime() - Date.now() > 5 * 60_000) return decrypt(a.access_token_enc);
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(a.refresh_token_enc), scope: SCOPES.join(' ') });
  await sql`update ebay_account set access_token_enc = ${encrypt(t.access_token!)}, access_expires_at = now() + make_interval(secs => ${t.expires_in ?? 7200}) where id = 1`;
  return t.access_token!;
}

/**
 * Calls an eBay API. A 401 refreshes the token once. 429 and 5xx are thrown as retryable (the job queue backs off);
 * other 4xx errors are the owner's to fix (missing policy, bad category) and carry eBay's own message.
 */
export async function ebay<T = unknown>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}, retried = false): Promise<T> {
  const c = ebayConfig();
  const res = await fetch(`${c.api}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await accessToken(retried)}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
      Accept: 'application/json',
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 401 && !retried) return ebay<T>(path, init, true);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (res.ok) return body as T;
  const err = (body as { errors?: { message?: string; longMessage?: string; errorId?: number }[] } | undefined)?.errors?.[0];
  const msg = err?.longMessage || err?.message || `eBay returned ${res.status}`;
  throw new EbayError(msg, res.status, res.status >= 400 && res.status < 500 && res.status !== 429, body);
}

export async function account() {
  const [a] = await sql<{
    connected_at: Date | null; marketplace_id: string; fulfillment_policy_id: string | null; payment_policy_id: string | null; return_policy_id: string | null;
    location_key: string | null; location_postal: string | null; location_city: string | null; location_state: string | null; markup_bps: number; markup_cents: number;
    auto_list: boolean; last_order_sync_at: Date | null; refresh_expires_at: Date | null;
  }[]>`select connected_at, marketplace_id, fulfillment_policy_id, payment_policy_id, return_policy_id, location_key, location_postal, location_city, location_state,
              markup_bps, markup_cents, auto_list, last_order_sync_at, refresh_expires_at from ebay_account where id = 1`;
  return a ?? null;
}
