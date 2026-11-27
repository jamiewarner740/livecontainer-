import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from './db';
import { audit } from './audit';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const COOKIE = 'hh_staff';
const SESSION_DAYS = 30;
const PARAMS = { N: 16384, r: 8, p: 1 };

export type Staff = { id: number; email: string; name: string; role: 'owner' | 'staff' };

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, PARAMS);
  return timingSafeEqual(actual, expected);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Checks the password and opens a session. Locks an email out for 15 minutes after 8 failed tries. */
export async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from audit_log where action = 'login.failed' and entity_id = ${e} and created_at > now() - interval '15 minutes'`;
  if (n >= 8) return { ok: false, error: 'Too many tries. Wait 15 minutes and try again.' };
  const [s] = await sql<{ id: number; password_hash: string; disabled: boolean }[]>`select id, password_hash, disabled from staff where email = ${e}`;
  // Hash a dummy password when the account is unknown, so response time doesn't reveal which emails exist.
  const ok = s ? await verifyPassword(password, s.password_hash) : (await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '=='), false);
  if (!s || !ok || s.disabled) {
    await audit(null, 'login.failed', 'staff', e);
    return { ok: false, error: 'That email and password do not match.' };
  }
  const token = randomBytes(32).toString('base64url');
  await sql`insert into sessions (token_hash, staff_id, expires_at) values (${sha(token)}, ${s.id}, now() + make_interval(days => ${SESSION_DAYS}))`;
  await audit(s.id, 'login.ok', 'staff', String(s.id));
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400 });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql`delete from sessions where token_hash = ${sha(token)}`;
  jar.delete(COOKIE);
}

export async function currentStaff(): Promise<Staff | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [s] = await sql<Staff[]>`
    select st.id, st.email, st.name, st.role from sessions se join staff st on st.id = se.staff_id
    where se.token_hash = ${sha(token)} and se.expires_at > now() and not st.disabled`;
  return s ?? null;
}

/** Every admin page and admin action calls this first. */
export async function requireStaff(role?: 'owner'): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect('/admin/login');
  if (role === 'owner' && s.role !== 'owner') redirect('/admin?denied=1');
  return s;
}

export async function createStaff(email: string, name: string, password: string, role: 'owner' | 'staff') {
  if (password.length < 10) throw new Error('Use a password of at least 10 characters.');
  const [s] = await sql<{ id: number }[]>`
    insert into staff (email, name, password_hash, role) values (${email.trim().toLowerCase()}, ${name.trim()}, ${await hashPassword(password)}, ${role})
    returning id`;
  return s.id;
}
