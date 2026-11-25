// Venda do Pro pela Hubla (ADR 0025): o webhook avisa o pagamento, esta instalação assina a chave e o comprador a pega em /licenca.
// Só existe onde LICENSE_ISSUER_KEY, LICENSE_CERT e HUBLA_TOKEN estão definidos (a instalação de quem vende). Nas outras, as rotas dão 404.
// A chave aqui é uma emissora certificada pela raiz, que fica só com o autor: se vazar, a próxima versão a revoga.
import { createPrivateKey, timingSafeEqual } from 'node:crypto';
import { db, env } from '../db.js';
import { route, readBody, send, form, clientIp, HttpError } from '../http.js';
import { ctx, blocked, failed, clearFails } from '../auth.js';
import { issueWith } from '../license.js';
import { seal, open, hashEmail } from '../pii.js';
import { redeemPage } from '../views/admin.js';

const on = () => { if (!env.LICENSE_ISSUER_KEY || !env.LICENSE_CERT || !env.HUBLA_TOKEN) throw new HttpError(404, 'Página não encontrada.'); };
let pk = null;
const priv = () => (pk?.src === env.LICENSE_ISSUER_KEY ? pk : pk = { src: env.LICENSE_ISSUER_KEY, key: createPrivateKey({ key: Buffer.from(env.LICENSE_ISSUER_KEY, 'base64'), format: 'der', type: 'pkcs8' }) }).key;
const LOST = new Set(['refunded', 'chargeback', 'disputed']);
const text = (r, status, msg) => send(r, status, msg, { 'content-type': 'text/plain; charset=utf-8' });

// Hubla: token fixo no cabeçalho (sem HMAC), 2xx só depois de gravar (5xx ela reenvia), pedidos repetidos e fora de ordem.
route('POST', '/hooks/hubla', { auth: false }, async r => {
  on();
  const want = Buffer.from(env.HUBLA_TOKEN), got = Buffer.from(String(r.req.headers['x-hubla-token'] || ''));
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'Token inválido.');
  let body;
  try { body = JSON.parse(await readBody(r.req, 256 * 1024)); } catch { throw new HttpError(400, 'JSON inválido.'); }
  if (r.req.headers['x-hubla-sandbox'] === 'true') return text(r, 200, 'teste ignorado');
  const ev = body?.event, inv = ev?.invoice;
  if (!String(body?.type).startsWith('invoice.') || !inv?.id) return text(r, 200, 'ignorado');
  // Mesma conta com outros produtos: só os ids de HUBLA_PRODUCTS (oferta ou produto) geram chave.
  const only = String(env.HUBLA_PRODUCTS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (only.length && ![ev.product?.id, ...(ev.products || []).map(p => p?.id)].some(id => only.includes(String(id)))) return text(r, 200, 'outro produto');

  const id = String(inv.id).slice(0, 80), now = Date.now();
  if (inv.status === 'paid') {
    const u = ev.user || {}, p = inv.payer || {}, order = String(inv.orderId || '').slice(0, 80);
    const emails = [...new Set([u.email, p.email].map(hashEmail).filter(Boolean))].join(' ');
    const to = [u.firstName || p.firstName, u.lastName || p.lastName].filter(Boolean).join(' ');
    // Repetido ou disputa ganha: volta a "paid". Reembolso é final: um "paid" atrasado (a Hubla não garante ordem) não o desfaz.
    // Pedido gravado antes pelo reembolso, sem chave, ganha e-mails e chave mas continua bloqueado.
    await db.run(`INSERT INTO license_orders(id, order_id, emails, license, status, created, updated) VALUES (?, ?, ?, ?, 'paid', ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=CASE WHEN license_orders.status='refunded' THEN 'refunded' ELSE 'paid' END,
        order_id=excluded.order_id, emails=excluded.emails, license=COALESCE(license_orders.license, excluded.license), updated=excluded.updated`,
    [id, order, emails, seal(issueWith(priv(), { to, order: order || id }, now, env.LICENSE_CERT)), now, now]);
  } else if (LOST.has(inv.status)) {
    await db.run(`INSERT INTO license_orders(id, order_id, status, created, updated) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=CASE WHEN license_orders.status='refunded' THEN 'refunded' ELSE excluded.status END, updated=excluded.updated`,
    [id, String(inv.orderId || '').slice(0, 80), inv.status, now, now]);
  }
  text(r, 200, 'ok');
});

route('GET', '/licenca', { auth: false }, r => { on(); send(r, 200, redeemPage(ctx(r))); });
route('POST', '/licenca', { auth: false }, async r => {
  on();
  const f = await form(r.req), ip = 'l:' + clientIp(r.req), email = (f.get('email') || '').trim().slice(0, 254), order = (f.get('order') || '').trim().slice(0, 80);
  const page = (status, extra) => send(r, status, redeemPage(ctx(r), { email, order, ...extra }));
  if (await blocked(ip)) return page(429, { err: 'Muitas tentativas. Tente de novo em 15 minutos.' });
  const row = order && await db.get('SELECT * FROM license_orders WHERE id=? OR order_id=? LIMIT 1', [order, order]), h = hashEmail(email);
  if (!row || !h || !row.emails.split(' ').includes(h)) {
    await failed(ip);
    return page(404, { err: 'Não achamos uma compra com esse e-mail e esse número de pedido. Confira os dois no e-mail de confirmação da Hubla.' });
  }
  if (row.status !== 'paid') return page(410, { err: 'Esta compra foi reembolsada ou contestada, por isso a chave não está disponível.' });
  await clearFails(ip);
  let key = open(row.license);
  if (!key.endsWith('.' + env.LICENSE_CERT)) {
    // Emissora trocada (vazou ou foi renovada): reemite com os mesmos dados e datas, assinada pela emissora atual.
    const p = JSON.parse(Buffer.from(key.split('.')[0], 'base64url').toString('utf8'));
    key = issueWith(priv(), p, p.issued, env.LICENSE_CERT);
    await db.run('UPDATE license_orders SET license=? WHERE id=?', [seal(key), row.id]);
  }
  page(200, { key });
});
