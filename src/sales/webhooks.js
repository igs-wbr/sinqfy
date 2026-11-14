// Recebe webhooks de plataformas de venda, normaliza para um formato único e grava em `sales`.
// Dados pessoais do comprador nunca são gravados; e-mail/telefone só seguem (em hash) para a Conversions API.
import { db, sites } from '../db.js';
import { localDate } from '../time.js';
import { sendCapi } from '../ads/meta.js';

export const PLATFORMS = { hotmart: 'Hotmart', kiwify: 'Kiwify', eduzz: 'Eduzz', generic: 'Genérico' };
export const STATUSES = { paid: 'Aprovada', pending: 'Pendente', refused: 'Recusada', refunded: 'Reembolsada', chargeback: 'Chargeback' };
export const METHODS = { pix: 'Pix', card: 'Cartão', boleto: 'Boleto', other: 'Outros' };

/** Número de payload ou CSV: aceita 1234.56, "1.234,56" e "10.000" (pt-BR), "1,234.56" e "R$ 97,90". */
export function num(v) {
  let n = Number(v);
  if (typeof v === 'string') {
    const s = v.replace(/[^\d,.-]/g, '');
    const br = /,\d{1,2}$/.test(s) || /^-?\d{1,3}(\.\d{3})+$/.test(s); // vírgula decimal, ou pontos só agrupando milhares
    n = Number(br ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  }
  return Number.isFinite(n) ? n : 0;
}
const str = (v, n = 200) => v == null ? '' : String(v).trim().slice(0, n);
function time(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(v)) { const n = Number(v); return n < 1e12 ? n * 1000 : n; }
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}
export const method = m => {
  m = String(m || '').toLowerCase();
  return /pix/.test(m) ? 'pix' : /card|cart|credit|cr[eé]dit|debit|d[eé]bito/.test(m) ? 'card' : /boleto|billet|bank_?slip|bankslip/.test(m) ? 'boleto' : 'other';
};
const utm = o => ({ source: str(o.source), medium: str(o.medium), campaign: str(o.campaign), content: str(o.content), term: str(o.term) });

/**
 * Parsers: payload da plataforma → venda normalizada, ou null para eventos que não são vendas.
 * { order_id, status, method, gross, net, currency, product, ts, utm, email, phone }
 */
export const PARSERS = {
  // Hotmart Webhook 2.0. A Hotmart só repassa `src` e `sck` do link de checkout:
  // o snippet copia utm_source → src e utm_campaign → sck.
  hotmart(b) {
    const status = {
      PURCHASE_APPROVED: 'paid', PURCHASE_COMPLETE: 'paid', PURCHASE_BILLET_PRINTED: 'pending', PURCHASE_DELAYED: 'pending',
      PURCHASE_CANCELED: 'refused', PURCHASE_EXPIRED: 'refused', PURCHASE_REFUNDED: 'refunded', PURCHASE_CHARGEBACK: 'chargeback',
    }[String(b.event || '').toUpperCase()];
    if (!status) return null;
    const d = b.data || {}, p = d.purchase || {}, o = p.origin || {};
    const gross = num(p.price?.value ?? p.full_price?.value);
    const producer = (d.commissions || []).find(c => /producer/i.test(c.source || ''));
    return {
      order_id: str(p.transaction), status, method: method(p.payment?.type), gross, net: producer ? num(producer.value) : gross,
      currency: str(p.price?.currency_value || 'BRL', 3), product: str(d.product?.name), ts: time(p.order_date),
      utm: utm({ source: o.src, campaign: o.sck }), email: d.buyer?.email, phone: d.buyer?.checkout_phone,
    };
  },
  // Kiwify: valores em centavos; UTMs completas em TrackingParameters.
  kiwify(b) {
    const status = { paid: 'paid', approved: 'paid', waiting_payment: 'pending', refused: 'refused', refunded: 'refunded', chargedback: 'chargeback' }[b.order_status];
    if (!status) return null;
    const c = b.Commissions || {}, t = b.TrackingParameters || {};
    const gross = num(c.charge_amount) / 100;
    return {
      order_id: str(b.order_id), status, method: method(b.payment_method), gross, net: c.my_commission != null ? num(c.my_commission) / 100 : gross,
      currency: str(c.currency || 'BRL', 3), product: str(b.Product?.product_name), ts: time(b.created_at),
      utm: utm({ source: t.utm_source || t.src, medium: t.utm_medium, campaign: t.utm_campaign || t.sck, content: t.utm_content, term: t.utm_term }),
      email: b.Customer?.email, phone: b.Customer?.mobile,
    };
  },
  // Eduzz: aceita o webhook novo (JSON com `data`) e o legado (form com trans_*). Valide com um pedido de teste.
  eduzz(b) {
    const d = b.data || b;
    const raw = String(b.event || d.status || d.trans_status || '').toLowerCase();
    const LEGACY = { 1: 'pending', 3: 'paid', 4: 'refused', 6: 'pending', 7: 'refunded', 9: 'chargeback', 11: 'pending' };
    const status = /^\d+$/.test(raw) ? LEGACY[raw]
      : /chargeback/.test(raw) ? 'chargeback' : /refund|reembols/.test(raw) ? 'refunded' : /paid|aprovad|approved/.test(raw) ? 'paid'
        : /cancel|expired|refused|recusad/.test(raw) ? 'refused' : /open|waiting|aguard|pending|created|aberta/.test(raw) ? 'pending' : null;
    if (!status) return null;
    const u = d.utm || d.tracker || {};
    const gross = num(d.price?.value ?? d.paid?.value ?? d.trans_value ?? d.trans_paid);
    return {
      order_id: str(d.id ?? d.trans_cod), status, method: method(d.paymentMethod ?? d.payment_method ?? d.trans_paymentmethod), gross,
      net: d.netGain?.value != null ? num(d.netGain.value) : gross, currency: str(d.price?.currency || 'BRL', 3),
      product: str(d.items?.[0]?.name ?? d.product?.name ?? d.content_title), ts: time(d.createdAt ?? d.trans_createdate),
      utm: utm({ source: u.source ?? d.utm_source, medium: u.medium ?? d.utm_medium, campaign: u.campaign ?? d.utm_campaign, content: u.content ?? d.utm_content, term: u.term ?? d.utm_term }),
      email: d.buyer?.email ?? d.customer?.email ?? d.cus_email, phone: d.buyer?.cellphone ?? d.cus_cel,
    };
  },
  // Formato próprio (docs/integracoes.md): use com Stripe/Zapier/Make ou qualquer outra plataforma.
  generic(b) {
    const s = String(b.status || '').toLowerCase();
    const status = Object.hasOwn(STATUSES, s) ? s : { approved: 'paid', aprovada: 'paid', pago: 'paid', reembolsada: 'refunded', recusada: 'refused', pendente: 'pending' }[s];
    if (!status) return null;
    const gross = num(b.amount);
    return {
      order_id: str(b.order_id), status, method: method(b.method), gross, net: b.net != null ? num(b.net) : gross,
      currency: str(b.currency || 'BRL', 3), product: str(b.product), ts: time(b.created_at),
      utm: utm({ source: b.utm_source, medium: b.utm_medium, campaign: b.utm_campaign, content: b.utm_content, term: b.utm_term }),
      email: b.email, phone: b.phone,
    };
  },
};

/** "Nome da campanha|123456" (template de UTM da Meta) → "123456"; senão o próprio valor. */
export const adKey = v => { const m = /\|\s*([\w-]+)\s*$/.exec(v || ''); return m ? m[1] : (v || '').trim(); };

const log = (site, platform, s, ok, message) => db.batch([
  ['INSERT INTO webhook_log(site, ts, platform, order_id, status, ok, message) VALUES (?,?,?,?,?,?,?)', [site, Date.now(), platform, s?.order_id || '', s?.status || '', ok ? 1 : 0, message]],
  ['DELETE FROM webhook_log WHERE site=? AND id NOT IN (SELECT id FROM webhook_log WHERE site=? ORDER BY id DESC LIMIT 50)', [site, site]],
]);

const UPSERT = `INSERT INTO sales(site, platform, order_id, status, method, gross, net, currency, product, ts, date, updated,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_key, adset_key, ad_key)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(site, platform, order_id) DO UPDATE SET status=excluded.status, updated=excluded.updated,
    method=CASE WHEN excluded.method<>'other' THEN excluded.method ELSE sales.method END,
    gross=CASE WHEN excluded.gross>0 THEN excluded.gross ELSE sales.gross END, net=CASE WHEN excluded.net>0 THEN excluded.net ELSE sales.net END,
    product=COALESCE(NULLIF(sales.product,''), excluded.product),
    utm_source=COALESCE(NULLIF(sales.utm_source,''), excluded.utm_source), utm_medium=COALESCE(NULLIF(sales.utm_medium,''), excluded.utm_medium),
    utm_campaign=COALESCE(NULLIF(sales.utm_campaign,''), excluded.utm_campaign), utm_content=COALESCE(NULLIF(sales.utm_content,''), excluded.utm_content),
    utm_term=COALESCE(NULLIF(sales.utm_term,''), excluded.utm_term), campaign_key=COALESCE(NULLIF(sales.campaign_key,''), excluded.campaign_key),
    adset_key=COALESCE(NULLIF(sales.adset_key,''), excluded.adset_key), ad_key=COALESCE(NULLIF(sales.ad_key,''), excluded.ad_key)`;

/** Processa um webhook. Retorna o status HTTP para a plataforma. `now` é injetável para testes. */
export async function handleWebhook(token, platform, raw, now = Date.now()) {
  const site = [...sites.values()].find(s => s.webhook_token && s.webhook_token === token);
  if (!site || !Object.hasOwn(PARSERS, platform)) return 404;
  let body;
  try { body = JSON.parse(raw); } catch { body = Object.fromEntries(new URLSearchParams(raw)); }
  let s;
  try { s = PARSERS[platform](body || {}); } catch { await log(site.id, platform, null, false, 'Payload em formato inesperado'); return 400; }
  if (!s) { await log(site.id, platform, null, true, 'Evento ignorado (não é venda)'); return 200; }
  if (!s.order_id) { await log(site.id, platform, s, false, 'Pedido sem identificador'); return 400; }

  const ts = s.ts ?? now;
  const before = await db.get('SELECT status FROM sales WHERE site=? AND platform=? AND order_id=?', [site.id, platform, s.order_id]);
  const u = s.utm;
  await db.run(UPSERT, [site.id, platform, s.order_id, s.status, s.method, Math.max(0, s.gross), Math.max(0, s.net), s.currency.toUpperCase() || site.currency,
    s.product, ts, localDate(ts, site.timezone), now, u.source, u.medium, u.campaign, u.content, u.term, adKey(u.campaign), adKey(u.medium), adKey(u.content)]);
  await log(site.id, platform, s, true, before ? `Atualizada: ${STATUSES[before.status]} → ${STATUSES[s.status]}` : 'Nova venda');

  // Aguardado antes de responder: em serverless a função pode congelar logo após a resposta.
  if (s.status === 'paid' && before?.status !== 'paid' && site.meta_pixel && site.meta_capi_token) {
    try {
      if (await sendCapi(site, { ...s, ts, platform }, { email: s.email, phone: s.phone }, now)) await log(site.id, platform, s, true, 'Enviada para a Conversions API da Meta');
    } catch (e) { await log(site.id, platform, s, false, `Conversions API: ${e.message}`); }
  }
  return 200;
}
