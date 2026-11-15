// Checkout com Pix próprio (src/checkout.js): página pública do produto, pedido com Pix copia e cola e QR,
// e no painel os produtos, os pedidos e o botão "Marcar como pago".
import { db, sites } from '../db.js';
import { route, send, redirect, form, origin, sitePath, HttpError } from '../http.js';
import { ctx, siteCtx } from '../auth.js';
import { enabled } from '../modules.js';
import { normEmail, normPhone, piiReady } from '../pii.js';
import { ingestSale, hookToken, RID_RE } from '../sales/webhooks.js';
import { brCode, qrSvg, newOrderId, pixKey, ascii } from '../checkout.js';
import { newSlug } from '../whatsapp.js';
import * as V from '../views/checkout.js';

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
async function product(slug) {
  const p = await db.get('SELECT * FROM products WHERE slug=?', [slug]);
  const site = p && sites.get(p.site);
  if (!site || !p.active || !enabled(site, 'checkout') || !piiReady()) throw new HttpError(404, 'Produto não encontrado.');
  return { p, site };
}

// ---------- página pública ----------
route('GET', '/p/:slug', { auth: false }, async r => {
  const { p, site } = await product(r.params.slug);
  // rid (link com data-rastro-rid) e UTMs da página que trouxe a pessoa seguem no formulário para casar a venda com o clique.
  const keep = [['rid', RID_RE.test(r.q.get('rid') || '') ? r.q.get('rid') : ''], ...UTM.map(k => [k, (r.q.get(k) || '').slice(0, 100)])].filter(([, v]) => v);
  send(r, 200, V.productPage(ctx(r), site, p, keep));
});
route('POST', '/p/:slug', { auth: false }, async r => {
  const { p, site } = await product(r.params.slug), f = await form(r.req, 8 * 1024);
  const name = (f.get('name') || '').trim().slice(0, 120), email = normEmail(f.get('email')), phone = normPhone(f.get('phone'));
  const keep = [['rid', RID_RE.test(f.get('rid') || '') ? f.get('rid') : ''], ...UTM.map(k => [k, (f.get(k) || '').slice(0, 100)])].filter(([, v]) => v);
  if (!name || !email || !phone) return send(r, 400, V.productPage(ctx(r), site, p, keep, 'Preencha nome, e-mail e WhatsApp com DDD.'));
  // Teto de pedidos por site: um robô não enche o painel de pedidos falsos.
  if ((await db.get("SELECT COUNT(*) n FROM sales WHERE site=? AND platform='pix' AND ts>?", [site.id, Date.now() - 10 * 60e3])).n >= 60)
    return send(r, 429, V.productPage(ctx(r), site, p, keep, 'Muitos pedidos agora. Tente de novo em alguns minutos.'));
  const order = newOrderId(), u = Object.fromEntries(keep);
  await ingestSale(site, 'pix', { order_id: order, status: 'pending', method: 'pix', gross: p.price, net: p.price, currency: site.currency, product: p.name,
    ts: Date.now(), utm: { source: u.utm_source || '', medium: u.utm_medium || '', campaign: u.utm_campaign || '', content: u.utm_content || '', term: u.utm_term || '' },
    email, phone, name, rid: u.rid || null });
  redirect(r, `/p/${encodeURIComponent(p.slug)}/${order}`);
});
route('GET', '/p/:slug/:order', { auth: false }, async r => {
  const { p, site } = await product(r.params.slug);
  const sale = /^PX[A-Z2-9]{10}$/.test(r.params.order) && await db.get("SELECT * FROM sales WHERE site=? AND platform='pix' AND order_id=? AND product=?", [site.id, r.params.order, p.name]);
  if (!sale) throw new HttpError(404, 'Pedido não encontrado.');
  const code = brCode({ key: p.pix_key, name: p.pix_name, city: p.pix_city, amount: sale.gross, txid: sale.order_id });
  send(r, 200, V.payPage(ctx(r), site, p, sale, code, qrSvg(code)), {});
});

// ---------- painel ----------
async function panel(r, msg, err) {
  const [products, orders] = await Promise.all([db.all('SELECT * FROM products WHERE site=? ORDER BY id', [r.site.id]),
    db.all("SELECT * FROM sales WHERE site=? AND platform='pix' ORDER BY ts DESC LIMIT 50", [r.site.id])]);
  send(r, err ? 400 : 200, V.panelPage(await siteCtx(r, '/checkout'), products, orders, { base: origin(r.req), hook: `${origin(r.req)}/hooks/${hookToken(r.site, 'pix')}/pix`, pii: piiReady() }, msg, err));
}
const OK = { product: 'Produto criado.', toggle: 'Produto atualizado.', paid: 'Pedido marcado como pago.' };
route('GET', '/sites/:id/checkout', { site: 'view', module: 'checkout' }, r => panel(r, Object.hasOwn(OK, r.q.get('ok') || '') ? OK[r.q.get('ok')] : null));
route('POST', '/sites/:id/checkout', { site: 'edit', module: 'checkout' }, async r => {
  const f = await form(r.req), s = r.site, action = f.get('action'), audit = a => db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [s.id, Date.now(), r.user.email, a]);
  if (action === 'product') {
    const name = (f.get('name') || '').trim().slice(0, 120), price = Math.round(Number(String(f.get('price') || '').replace(',', '.')) * 100) / 100;
    const key = pixKey(f.get('pix_key')), holder = ascii(f.get('pix_name'), 25), city = ascii(f.get('pix_city'), 15);
    if (!name || !(price >= 1 && price <= 100000)) return panel(r, null, 'Dê um nome ao produto e um preço entre R$ 1 e R$ 100.000.');
    if (!key) return panel(r, null, 'Chave Pix inválida. Use e-mail, CPF, CNPJ, chave aleatória ou telefone com +55.');
    if (!holder || !city) return panel(r, null, 'Informe o nome do recebedor e a cidade, como aparecem no banco.');
    if ((await db.get('SELECT COUNT(*) n FROM products WHERE site=?', [s.id])).n >= 50) return panel(r, null, 'Limite de 50 produtos por site.');
    for (let i = 0; i < 5; i++) { const { rowCount } = await db.run('INSERT INTO products(site, slug, name, price, pix_key, pix_name, pix_city, created) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', [s.id, newSlug(), name, price, key, holder, city, Date.now()]); if (rowCount) break; }
    await audit(`produto do checkout criado: ${name}`);
  } else if (action === 'toggle') {
    await db.run('UPDATE products SET active=1-active WHERE id=? AND site=?', [Number(f.get('product')) || 0, s.id]);
    await audit('produto do checkout ligado/desligado');
  } else if (action === 'paid') {
    const sale = await db.get("SELECT * FROM sales WHERE site=? AND platform='pix' AND order_id=?", [s.id, String(f.get('order') || '')]);
    if (!sale) throw new HttpError(404, 'Pedido não encontrado.');
    // Mesmo caminho do webhook: compra para a Meta e o GA4, contato no CRM em Ganhou e a recuperação para.
    await ingestSale(s, 'pix', { order_id: sale.order_id, status: 'paid', method: 'pix', gross: sale.gross, net: sale.net, currency: sale.currency, product: sale.product,
      ts: sale.ts, utm: { source: '', medium: '', campaign: '', content: '', term: '' } });
    await audit(`pedido ${sale.order_id} marcado como pago`);
  } else throw new HttpError(400, 'Ação inválida.');
  redirect(r, sitePath(s, `/checkout?ok=${action}`));
});
