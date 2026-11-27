import postgres from 'postgres';

declare global { var __hhSql: ReturnType<typeof postgres> | undefined; }

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  return postgres(url, { max: 10, idle_timeout: 20, onnotice: () => {} });
}

// One pool per process (Next.js dev reloads modules, so keep it on globalThis).
export const sql = globalThis.__hhSql ?? (globalThis.__hhSql = connect());
