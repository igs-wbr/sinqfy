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
export const clientIp = req => (env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;
export const origin = req => env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;

export function send(r, status, body, headers = {}) {
  r.res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin',
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${r.nonce}'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    ...headers,
  }).end(String(body?.s ?? body));
}
export const redirect = (r, location, headers = {}) => r.res.writeHead(303, { location, ...headers }).end();

/** Tabela de rotas. o = { auth=true, admin, site: 'view'|'edit' } */
export const routes = [];
export const route = (method, pattern, o, fn) =>
  routes.push({ method, o, fn, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$') });

export const sitePath = (site, p = '') => `/sites/${encodeURIComponent(site.id)}${p}`;
