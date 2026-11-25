import { timingSafeEqual } from 'node:crypto';
import { env } from './db.js';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function readBody(req, limit) {
  return new Promise((ok, fail) => {
    let b = '';
    req.setEncoding('utf8');
    req.on('data', c => { b += c; if (b.length > limit) { fail(new HttpError(413, 'Corpo da requisição grande demais.')); req.destroy(); } });
    req.on('end', () => ok(b));
    req.on('error', fail);
  });
}
export const form = async (req, limit = 64 * 1024) => new URLSearchParams(await readBody(req, limit));
// Atrás da Cloudflare, cf-connecting-ip é sobrescrito por ela e não dá para forjar. O primeiro item do X-Forwarded-For vem do cliente,
// então sem cf-connecting-ip vale o último salto (o proxy imediatamente antes de nós).
// Pelo Worker da borda (com o segredo), vale o IP que ele viu: senão todo acesso pelo Worker teria o IP da Cloudflare.
export const clientIp = req => edgeInfo(req.headers)?.ip || (env.TRUST_PROXY === '1' && (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',').at(-1).trim())) || req.socket.remoteAddress;
export const origin = req => env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;

export function send(r, status, body, headers = {}) {
  r.res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin',
    'x-robots-tag': 'noindex, nofollow', // o painel é privado: nenhuma página dele (login, convite, licença) deve aparecer em busca nem em IA

    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${r.nonce}'; img-src 'self' data: https://*.fbcdn.net; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    // Em produção (HTTPS), o navegador não aceita mais abrir o painel por HTTP, nem por um link adulterado.
    ...(env.COOKIE_SECURE === '1' && { 'strict-transport-security': 'max-age=31536000' }),
    ...headers,
  }).end(String(body?.s ?? body));
}
export const redirect = (r, location, headers = {}) => r.res.writeHead(303, { location, ...headers }).end();

/** Tabela de rotas. o = { auth=true, admin, site: 'view'|'edit', module: id de src/modules.js } */
export const routes = [];
export const route = (method, pattern, o, fn) =>
  routes.push({ method, o, fn, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$') });

export const sitePath = (site, p = '') => `/sites/${encodeURIComponent(site.id)}${p}`;

/**
 * Beacon repassado pelo Worker da borda (edge/worker.js): só confia nos cabeçalhos x-rastro-* com o segredo certo.
 * Retorna { rid, fbp, fbc, ip } ou null.
 */
const ID_RE = /^[\w-]{8,64}$/, FB_RE = /^fb\.\d\.\d{10,13}\.[\w.-]{1,255}$/;
const dec = v => { try { return decodeURIComponent(String(v || '')); } catch { return ''; } };
export function edgeInfo(h) {
  const want = Buffer.from(env.EDGE_SECRET || ''), got = Buffer.from(String(h['x-edge-secret'] || ''));
  if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) {
    if (h['x-rastro-rid'] || h['x-edge-secret']) console.warn('Beacon com cabeçalhos da borda e EDGE_SECRET inválido: confira o segredo no Worker e no painel.');
    return null;
  }
  const ok = (v, re) => re.test(v || '') ? v : null;
  return { rid: ok(h['x-rastro-rid'], ID_RE), fbp: ok(h['x-rastro-fbp'], FB_RE), fbc: ok(h['x-rastro-fbc'], FB_RE), ip: String(h['x-rastro-ip'] || '').slice(0, 64) || null,
    city: dec(h['x-rastro-city']).slice(0, 80), region: dec(h['x-rastro-region']).slice(0, 8) };
}

