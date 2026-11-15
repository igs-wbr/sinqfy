// Handler HTTP único (painel + beacons + webhooks + cron). Usado pela função da Vercel (api/index.js)
// e pelo servidor local (src/server.js).
import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { ready, refreshSites, sites, env } from './db.js';
import { routes, readBody, send, redirect, clientIp, edgeInfo, HttpError } from './http.js';
import { ctx, currentUser, canView, canEdit } from './auth.js';
import { record } from './tracking/ingest.js';
import { messagePage } from './views/admin.js';
import './routes/auth.js';
import './routes/admin.js';
import './routes/traffic.js';
import './routes/whatsapp.js'; // antes de sales.js: /hooks/:token/whatsapp vem antes da rota genérica
import './routes/crm.js'; // antes de sales.js: /hooks/:token/leads vem antes da rota genérica
import './routes/sales.js';
import './routes/setup.js';

// ---------- arquivos públicos (na Vercel a CDN serve public/ antes de chegar aqui) ----------
const CORS = { 'access-control-allow-origin': '*' };
const STATIC = new Map();
try {
  const PUBLIC = new URL('../public/', import.meta.url);
  const add = (path, file, type, cache, extra = {}) => STATIC.set(path, [readFileSync(new URL(file, PUBLIC)), type, cache, extra]);
  add('/s.js', 's.js', 'application/javascript; charset=utf-8', 'public, max-age=3600', CORS);
  add('/favicon.svg', 'favicon.svg', 'image/svg+xml', 'public, max-age=86400');
  add('/manifest.webmanifest', 'manifest.webmanifest', 'application/manifest+json', 'public, max-age=86400');
  for (const f of readdirSync(new URL('fonts/', PUBLIC)).filter(f => f.endsWith('.woff2'))) add(`/fonts/${f}`, `fonts/${f}`, 'font/woff2', 'public, max-age=31536000, immutable');
} catch {}

async function handle(r) {
  const { req, res } = r;
  r.url = new URL(req.url, 'http://x');
  r.q = r.url.searchParams;
  const path = r.url.pathname;

  const file = req.method === 'GET' && STATIC.get(path);
  if (file) return res.writeHead(200, { 'content-type': file[1], 'cache-control': file[2], 'x-content-type-options': 'nosniff', ...file[3] }).end(file[0]);
  if (path === '/e' && req.method === 'OPTIONS') return res.writeHead(204, { ...CORS, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' }).end();

  await ready;
  await refreshSites();
  if (path === '/e' && req.method === 'POST') { // beacon do snippet
    const body = await readBody(req, 4096);
    const country = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country-code'] || '').toUpperCase();
    const edge = edgeInfo(req.headers);
    return res.writeHead(await record({ body, ua: req.headers['user-agent'] || '', ip: edge?.ip || clientIp(req), country, edge }), CORS).end();
  }
  // CSRF: além do cookie SameSite=Lax, recusa POSTs que o navegador marca como vindos de outro site.
  // (Webhooks vêm de servidores, que não enviam Sec-Fetch-Site.)
  const sfs = req.headers['sec-fetch-site'];
  if (req.method === 'POST' && sfs && sfs !== 'same-origin' && sfs !== 'none') throw new HttpError(403, 'Requisição de outra origem bloqueada.');

  r.user = await currentUser(req);
  for (const rt of routes) {
    if (rt.method !== req.method) continue;
    const m = rt.re.exec(path);
    if (!m) continue;
    r.params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
    if (rt.o.auth !== false && !r.user) return redirect(r, req.method === 'GET' ? '/login?next=' + encodeURIComponent(path + r.url.search) : '/login');
    if (rt.o.admin && r.user.role !== 'admin') throw new HttpError(403, 'Apenas admins podem fazer isso.');
    if (rt.o.site) {
      r.site = sites.get(r.params.id);
      if (!r.site || !await canView(r.user, r.site.id)) throw new HttpError(404, 'Site não encontrado.');
      r.canEdit = await canEdit(r.user, r.site.id);
      if (rt.o.site === 'edit' && !r.canEdit) throw new HttpError(403, 'Você não tem permissão para alterar este site.');
    }
    return await rt.fn(r);
  }
  throw new HttpError(404, 'Página não encontrada.');
}

export async function handler(req, res) {
  const r = { req, res, nonce: randomBytes(16).toString('base64'), q: new URLSearchParams() };
  try {
    await handle(r);
  } catch (e) {
    const status = e.status || (e instanceof URIError ? 400 : 500);
    if (status === 500) console.error(e);
    if (res.headersSent) return res.end();
    const title = { 400: 'Requisição inválida', 403: 'Sem permissão', 404: 'Não encontrado', 413: 'Grande demais' }[status] || 'Erro';
    send(r, status, messagePage(ctx(r), title, status === 500 ? 'Algo deu errado. Veja os logs do servidor.' : e.message));
  }
}
