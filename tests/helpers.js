// Sobe o servidor num schema temporário do Postgres (cada arquivo de teste roda em processo próprio no `node --test`).
// Banco: TEST_DATABASE_URL, ou o Postgres local do Docker (veja docs/deploy-oracle.md).
import { randomBytes } from 'node:crypto';

export const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
export const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
export const ADMIN = { email: 'admin@test.dev', password: 'admin-pass-123' };

export async function boot() {
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://rastro:rastro@127.0.0.1:55432/rastro', DATABASE_SCHEMA: 't_' + randomBytes(6).toString('hex'), PORT: '0', HOST: '127.0.0.1',
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, TRUST_PROXY: '1', PUBLIC_URL: '', CRON_SECRET: 'segredo-de-teste', EDGE_SECRET: 'segredo-da-borda', DISPATCH_EVERY: '0', DATA_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });
  const { server } = await import('../src/server.js');
  if (!server.listening) await new Promise(ok => server.once('listening', ok));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function req(path, { form, cookie, headers = {}, body, method } = {}) {
    const res = await fetch(base + path, {
      method: method || (form || body ? 'POST' : 'GET'), redirect: 'manual', body: form ? new URLSearchParams(form) : body,
      headers: { ...(form && { 'content-type': 'application/x-www-form-urlencoded' }), ...(cookie && { cookie }), ...headers },
    });
    return { status: res.status, location: res.headers.get('location'), headers: res.headers, cookie: res.headers.get('set-cookie')?.split(';')[0], text: await res.text() };
  }
  const login = async (email = ADMIN.email, password = ADMIN.password) => (await req('/login', { form: { email, password } })).cookie;
  const { db } = await import('../src/db.js');
  const close = async () => {
    await server.jobs; // tarefas da subida ainda rodando seguram tabelas: DROP SCHEMA no meio delas dá deadlock
    server.closeAllConnections(); server.close();
    await db.exec(`DROP SCHEMA ${process.env.DATABASE_SCHEMA} CASCADE`);
    await db.end();
  };
  return { server, base, req, login, close };
}

export const sleep = ms => new Promise(ok => setTimeout(ok, ms));
