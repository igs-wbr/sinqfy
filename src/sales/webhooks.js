// Recebe webhooks de plataformas de venda, normaliza para um formato único e grava em `sales`.
// Dados pessoais do comprador nunca são gravados; e-mail/telefone só seguem (em hash) para a Conversions API.
import { timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { db, sites } from '../db.js';
import { localDate } from '../time.js';
import { enqueue, enqueuePurchase, PURCHASE_HOLD, metaPurchase, metaReady, ga4Purchase, ga4Ready, gadsAction, gadsEvent, gadsReady, enqueueGadsPurchase } from '../dispatch.js';
import { findContact, saleToCrm, recentPurchase } from '../crm.js';
import { hashEmail, hashPhone, piiReady, open, metaEmail, metaPhone, sha } from '../pii.js';
import { trackPending } from '../recovery.js';

export const PLATFORMS = { hotmart: 'Hotmart', kiwify: 'Kiwify', eduzz: 'Eduzz', asaas: 'Asaas', shopify: 'Shopify', woocommerce: 'WooCommerce', stripe: 'Stripe', hubla: 'Hubla', pix: 'Pix (checkout próprio)', generic: 'Genérico', custom: 'Personalizado', sheets: 'Google Sheets', events: 'Eventos do produto' };
/** Plataformas que assinam o webhook: o segredo é configurado em Integrações (sem segredo, vale só o token da URL). */
export const SIGNED = { hotmart: 'Hottok (Webhook, Autenticação)', asaas: 'Token de autenticação do Webhook (asaas-access-token)', shopify: 'Segredo do webhook (Notificações)', woocommerce: 'Segredo do webhook', stripe: 'Segredo de assinatura (whsec_...)', hubla: 'Token do webhook (Integrações, Webhook)', events: 'Eventos do produto (X-Rastro-Signature)' };
export const ORDER_PLATFORMS = Object.fromEntries(Object.entries(PLATFORMS).filter(([k]) => k !== 'events'));
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
  return /pix/.test(m) ? 'pix' : /^cc|card|cart|credit|cr[eé]dit|debit|d[eé]bito/.test(m) ? 'card' : /boleto|billet|bank_?slip|bankslip/.test(m) ? 'boleto' : 'other';
};
/** UTM codificada duas vezes no anúncio ("SPEC+%7C+VENDAS") volta ao texto. Só sem espaços: "C1 + campeões" é um "+" de verdade. */
export const cleanUtm = v => {
  const t = String(v ?? '').trim();
  if (/\s/.test(t) || !/\+|%[0-9a-f]{2}/i.test(t)) return t;
  try { return decodeURIComponent(t.replace(/\+/g, ' ')).trim(); } catch { return t; }
};
const utm = o => ({ source: str(cleanUtm(o.source)), medium: str(cleanUtm(o.medium)), campaign: str(cleanUtm(o.campaign)), content: str(cleanUtm(o.content)), term: str(cleanUtm(o.term)) });
/**
 * `sck` de rastreadores anteriores com tudo junto: "origem|meio|campanha|anúncio|conjunto" (nomes ou ids da Meta).
 * Separador é o "|" sem espaço em volta; o " | " de dentro dos nomes fica. Vira o padrão da Sinqfy: conjunto em
 * utm_medium e anúncio em utm_content.
 */
const packed = v => {
  const p = String(v || '').split(/(?<=\S)\|(?=\S)/);
  return p.length === 5 ? utm({ source: p[0], medium: p[4], campaign: p[2], content: p[3] }) : null;
};
/** Id do visitante gravado pelo Worker (_rid, 16 bytes em base64url). O snippet o põe no link de checkout. */
export const RID_RE = /^[\w-]{22}$/;
const ridOf = v => RID_RE.test(String(v || '')) ? String(v) : null;
const qs = u => { try { return new URL(u, 'https://x.invalid').searchParams; } catch { return new URLSearchParams(); } };

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
      currency: str(p.price?.currency_value || 'BRL', 3), product: str(d.product?.name), ts: time(p.order_date), paid_at: time(p.approved_date),
      utm: packed(o.sck) || packed(o.src) || utm({ source: o.src, campaign: o.sck }), email: d.buyer?.email, phone: d.buyer?.checkout_phone, name: d.buyer?.name, addr: d.buyer?.address, rid: ridOf(o.xcod),
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
      currency: str(c.currency || 'BRL', 3), product: str(b.Product?.product_name), ts: time(b.created_at), paid_at: time(b.approved_date),
      utm: utm({ source: t.utm_source || t.src, medium: t.utm_medium, campaign: t.utm_campaign || (ridOf(t.sck) ? '' : t.sck), content: t.utm_content, term: t.utm_term }),
      email: b.Customer?.email, phone: b.Customer?.mobile, name: b.Customer?.full_name, rid: ridOf(t.rid) || ridOf(t.sck),
      addr: { city: b.Customer?.city, state: b.Customer?.state, zipcode: b.Customer?.zipcode },
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
      email: d.buyer?.email ?? d.customer?.email ?? d.cus_email, phone: d.buyer?.cellphone ?? d.cus_cel, name: d.buyer?.name ?? d.cus_name,
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
      email: b.email, phone: b.phone, name: b.name, rid: ridOf(b.rid),
      // Assinatura: 'subscription_create' e 'credits' são aquisição; 'subscription_cycle' é renovação (não vira Purchase na Meta).
      kind: str(b.kind || b.billing_reason, 40).toLowerCase(),
    };
  },
  // Pix do checkout próprio (src/checkout.js): o banco ou o painel confirmam no mesmo formato do genérico, com o id do pedido.
  pix: b => PARSERS.generic(b),
  // Shopify (webhooks orders/create, orders/paid, orders/updated). UTMs, fbclid e rid vêm do landing_site; o user agent, de client_details.
  shopify(b) {
    const fs = String(b.financial_status || '').toLowerCase();
    const status = { paid: 'paid', partially_paid: 'pending', pending: 'pending', authorized: 'pending', refunded: 'refunded', partially_refunded: 'paid', voided: 'refused' }[fs];
    if (!status || b.id == null) return null;
    const q = qs(b.landing_site);
    const gross = num(b.total_price);
    return {
      order_id: str(b.id), status, method: method(b.payment_gateway_names?.[0] || b.gateway), gross, net: gross, currency: str(b.currency || 'BRL', 3),
      product: str(b.line_items?.[0]?.title), ts: time(b.created_at),
      utm: utm({ source: q.get('utm_source'), medium: q.get('utm_medium'), campaign: q.get('utm_campaign'), content: q.get('utm_content'), term: q.get('utm_term') }),
      email: b.email || b.contact_email, phone: b.phone || b.billing_address?.phone || b.customer?.phone, rid: ridOf(q.get('rid')),
      fbclid: q.get('fbclid'), ua: b.client_details?.user_agent, url: (() => { try { return new URL(b.order_status_url).origin; } catch { return null; } })(),
    };
  },
  // WooCommerce (webhook de pedido). UTMs da atribuição nativa do WooCommerce (8.5+), em meta_data.
  woocommerce(b) {
    const status = { processing: 'paid', completed: 'paid', pending: 'pending', 'on-hold': 'pending', refunded: 'refunded', cancelled: 'refused', failed: 'refused' }[b.status];
    if (!status || b.id == null) return null;
    const meta = Object.fromEntries((b.meta_data || []).map(m => [m.key, m.value]));
    const a = k => meta[`_wc_order_attribution_${k}`];
    const gross = num(b.total);
    return {
      order_id: str(b.id), status, method: method(b.payment_method_title || b.payment_method), gross, net: gross, currency: str(b.currency || 'BRL', 3),
      product: str(b.line_items?.[0]?.name), ts: time(b.date_created_gmt ? b.date_created_gmt + 'Z' : b.date_created),
      utm: utm({ source: a('utm_source'), medium: a('utm_medium'), campaign: a('utm_campaign'), content: a('utm_content'), term: a('utm_term') }),
      email: b.billing?.email, phone: b.billing?.phone, name: [b.billing?.first_name, b.billing?.last_name].filter(Boolean).join(' '), rid: ridOf(meta.rastro_rid), ua: a('user_agent'),
    };
  },
  // Stripe (Checkout e Payment Links). O snippet põe o rid em client_reference_id; o pedido é o payment_intent.
  stripe(b) {
    const o = b.data?.object || {};
    // Assinatura: a cobrança do mês seguinte chega como fatura (invoice.paid), com o motivo em billing_reason.
    // 'subscription_cycle' é renovação, não aquisição: grava em sales, mas não vira Purchase novo na Meta.
    if (/^invoice\.(paid|payment_succeeded|payment_failed|voided)$/.test(String(b.type))) {
      if (!o.id) return null;
      const zero = /^(bif|clp|djf|gnf|jpy|kmf|krw|mga|pyg|rwf|ugx|vnd|vuv|xaf|xof|xpf)$/.test(String(o.currency).toLowerCase());
      const status = /payment_failed|voided/.test(String(b.type)) ? 'refused' : o.status === 'paid' ? 'paid' : 'pending';
      const gross = num(o.amount_paid ?? o.total ?? o.amount_due) / (zero ? 1 : 100), md = o.metadata || o.subscription_details?.metadata || {};
      return {
        order_id: str(o.id), status, method: method(o.payment_method_types?.[0] || o.payment_method_details?.type), gross, net: gross,
        currency: str(o.currency || 'brl', 3).toUpperCase(), product: str(md.product || o.lines?.data?.[0]?.description),
        ts: o.created ? o.created * 1000 : time(o.status_transitions?.paid_at),
        utm: utm({ source: md.utm_source, medium: md.utm_medium, campaign: md.utm_campaign, content: md.utm_content, term: md.utm_term }),
        email: o.customer_email || o.customer_details?.email, phone: o.customer_phone || o.customer_details?.phone,
        name: o.customer_name || o.customer_details?.name, rid: ridOf(o.client_reference_id || md.rid),
        kind: str(o.billing_reason || md.kind, 40).toLowerCase(),
      };
    }
    const status = { 'checkout.session.completed': o.payment_status === 'paid' ? 'paid' : 'pending', 'checkout.session.async_payment_succeeded': 'paid',
      'checkout.session.async_payment_failed': 'refused', 'charge.refunded': o.amount_refunded >= o.amount ? 'refunded' : null, 'charge.dispute.created': 'chargeback' }[b.type];
    const id = o.payment_intent || o.id;
    if (!status || !id) return null;
    const zero = /^(bif|clp|djf|gnf|jpy|kmf|krw|mga|pyg|rwf|ugx|vnd|vuv|xaf|xof|xpf)$/.test(String(o.currency).toLowerCase()); // moedas sem centavos
    const gross = num(o.amount_total ?? o.amount) / (zero ? 1 : 100), md = o.metadata || {};
    return {
      order_id: str(id), status, method: method(o.payment_method_types?.[0] || o.payment_method_details?.type), gross, net: gross,
      currency: str(o.currency || 'brl', 3).toUpperCase(), product: str(md.product), ts: o.created ? o.created * 1000 : null,
      utm: utm({ source: md.utm_source, medium: md.utm_medium, campaign: md.utm_campaign, content: md.utm_content, term: md.utm_term }),
      email: o.customer_details?.email || o.billing_details?.email, phone: o.customer_details?.phone || o.billing_details?.phone, name: o.customer_details?.name, rid: ridOf(o.client_reference_id || md.rid),
      kind: str(md.kind || o.billing_reason, 40).toLowerCase(),
    };
  },
  // Hubla (webhook 2.0, eventos invoice.*). O link pay.hub.la recebe o rid do snippet; UTMs e params ficam em paymentSession.
  hubla(b) {
    const inv = b.event?.invoice || {};
    const status = { paid: 'paid', unpaid: 'pending', overdue: 'pending', canceled: 'refused', refunded: 'refunded', chargeback: 'chargeback' }[inv.status];
    if (!String(b.type).startsWith('invoice.') || !status || !inv.id) return null;
    const ps = inv.paymentSession || {}, p = ps.params || {}, q = qs(ps.url), u = ps.utm || {}, buyer = b.event.user || inv.payer || {};
    const gross = inv.amount?.totalCents != null ? num(inv.amount.totalCents) / 100 : num(inv.amount?.total);
    const seller = (inv.receivers || []).find(r => r.role === 'seller');
    const sck = p.sck ?? p.SCK ?? q.get('sck');
    return {
      order_id: str(inv.parentInvoiceId || inv.id), status, method: method(inv.paymentMethod), gross, net: seller ? num(seller.totalCents) / 100 : gross,
      currency: str(inv.currency || 'BRL', 3), product: str(b.event.product?.name), ts: time(inv.saleDate || inv.createdAt),
      paid_at: time((inv.statusAt || []).find(x => x.status === 'paid')?.when),
      utm: utm({ source: u.source || q.get('utm_source'), medium: u.medium || q.get('utm_medium'), campaign: u.campaign || q.get('utm_campaign') || (ridOf(sck) ? '' : sck), content: u.content || q.get('utm_content'), term: u.term || q.get('utm_term') }),
      email: buyer.email, phone: buyer.phone, name: [buyer.firstName, buyer.lastName].filter(Boolean).join(' '), rid: ridOf(p.rid) || ridOf(q.get('rid')) || ridOf(sck),
      fbclid: ps.cookies?.fbclid, ua: ps.userAgent,
    };
  },
  // Asaas (webhook de cobranças, eventos PAYMENT_*). O backend grava o rid (ou e-mail) do comprador em externalReference
  // ao criar a cobrança ou assinatura. Para assinatura (payment.subscription), da 2ª cobrança paga em diante é renovação.
  asaas(b) {
    const p = b.payment || {}, ev = String(b.event || '').toUpperCase(), st = String(p.status || '').toUpperCase();
    const status = {
      PAYMENT_CONFIRMED: 'paid', PAYMENT_RECEIVED: 'paid', PAYMENT_APPROVED_BY_RISK_ANALYSIS: 'paid', PAYMENT_RECEIVED_IN_CASH: 'paid',
      PAYMENT_CREATED: 'pending', PAYMENT_UPDATED: 'pending', PAYMENT_OVERDUE: 'pending', PAYMENT_AWAITING_RISK_ANALYSIS: 'pending',
      PAYMENT_AUTHORIZED: 'pending', PAYMENT_RESTORED: 'pending',
      PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'refused', PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'refused', PAYMENT_DELETED: 'refused',
      PAYMENT_REFUNDED: 'refunded', PAYMENT_PARTIALLY_REFUNDED: 'refunded', PAYMENT_REFUND_IN_PROGRESS: 'refunded',
      PAYMENT_CHARGEBACK_REQUESTED: 'chargeback', PAYMENT_CHARGEBACK_DISPUTE: 'chargeback', PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'chargeback',
    }[ev] || {
      CONFIRMED: 'paid', RECEIVED: 'paid', RECEIVED_IN_CASH: 'paid', PENDING: 'pending', OVERDUE: 'pending', AWAITING_RISK_ANALYSIS: 'pending',
      REFUNDED: 'refunded', REFUND_REQUESTED: 'refunded', REFUND_IN_PROGRESS: 'refunded',
      CHARGEBACK_REQUESTED: 'chargeback', CHARGEBACK_DISPUTE: 'chargeback', AWAITING_CHARGEBACK_REVERSAL: 'chargeback',
    }[st];
    if (!status || !p.id) return null;
    const gross = num(p.value), net = p.netValue != null ? num(p.netValue) : gross;
    // externalReference é texto livre (até 100 chars): aceita o rid puro, um e-mail, query string ("rid=...&email=...") ou JSON.
    const ref = String(p.externalReference || '').trim();
    const refObj = ref.startsWith('{') ? (() => { try { return JSON.parse(ref) || {}; } catch { return {}; } })() : {};
    const refQs = /[=&]/.test(ref) ? new URLSearchParams(ref) : null;
    const tokens = ref.split(/[|;,\s]+/).filter(Boolean);
    const rid = ridOf(p.rid) || ridOf(refObj.rid) || ridOf(refQs?.get('rid')) || tokens.map(ridOf).find(Boolean) || null;
    const email = p.email || p.customerEmail || refObj.email || refQs?.get('email') || tokens.find(t => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) || undefined;
    const phone = p.phone || p.mobilePhone || refObj.phone || refQs?.get('phone') || undefined;
    const name = p.name || p.customerName || refObj.name || refQs?.get('name') || undefined;
    const kind = str(p.kind || refObj.kind || refQs?.get('kind') || tokens.find(t => /^(subscription_create|subscription_cycle|credits|renewal)$/i.test(t)), 40).toLowerCase();
    // Asaas manda "2024-06-12 16:45:03" em dateCreated do evento (horário de Brasília) e "YYYY-MM-DD" na cobrança.
    const dateOf = v => {
      if (!v) return null;
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T12:00:00-03:00`);
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return Date.parse(`${s.replace(' ', 'T')}-03:00`);
      return time(s);
    };
    const ts = dateOf(b.dateCreated) || dateOf(p.dateCreated);
    const paid_at = status === 'paid' ? (dateOf(p.confirmedDate) || dateOf(p.clientPaymentDate) || dateOf(p.paymentDate) || ts) : null;
    return {
      order_id: str(p.id), status, method: method(p.billingType), gross, net,
      currency: 'BRL', product: str(p.description), ts, paid_at,
      utm: utm({ source: refObj.utm_source || refQs?.get('utm_source'), medium: refObj.utm_medium || refQs?.get('utm_medium'),
        campaign: refObj.utm_campaign || refQs?.get('utm_campaign'), content: refObj.utm_content || refQs?.get('utm_content'), term: refObj.utm_term || refQs?.get('utm_term') }),
      email, phone, name, rid, kind, subscription_id: str(p.subscription, 64) || null,
    };
  },
};

// ---------- assinatura dos webhooks ----------
const eq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length > 0 && x.length === y.length && timingSafeEqual(x, y); };
const hmac = (alg, key, data, enc) => createHmac(alg, key).update(data).digest(enc);
/** Confere a assinatura quando o site tem segredo para a plataforma. Retorna null se ok, ou o motivo. */
export function verify(platform, secret, raw, h, now = Date.now()) {
  if (!secret) return null;
  if (platform === 'hotmart') return eq(h['x-hotmart-hottok'], secret) ? null : 'Hottok não confere';
  if (platform === 'asaas') return eq(h['asaas-access-token'], secret) ? null : 'Token do Asaas não confere';
  if (platform === 'hubla') return eq(h['x-hubla-token'], secret) ? null : 'Token da Hubla não confere';
  if (platform === 'shopify') return eq(h['x-shopify-hmac-sha256'], hmac('sha256', secret, raw, 'base64')) ? null : 'Assinatura da Shopify não confere';
  if (platform === 'woocommerce') return eq(h['x-wc-webhook-signature'], hmac('sha256', secret, raw, 'base64')) ? null : 'Assinatura do WooCommerce não confere';
  if (platform === 'stripe') {
    const parts = Object.fromEntries(String(h['stripe-signature'] || '').split(',').map(x => x.split('=')));
    const t = Number(parts.t);
    if (!t || Math.abs(now / 1000 - t) > 300) return 'Assinatura da Stripe ausente ou vencida';
    const want = hmac('sha256', secret, `${t}.${raw}`, 'hex');
    return String(h['stripe-signature']).split(',').some(x => x.startsWith('v1=') && eq(x.slice(3), want)) ? null : 'Assinatura da Stripe não confere';
  }
  return null;
}

// ---------- webhook personalizado (mapa de campos) ----------
export const CUSTOM_FIELDS = { order_id: 'Id do pedido', status: 'Status', amount: 'Valor pago', net: 'Valor líquido', currency: 'Moeda', method: 'Forma de pagamento',
  product: 'Produto', created_at: 'Data', email: 'E-mail', phone: 'Telefone', name: 'Nome do comprador', lastname: 'Sobrenome do comprador', rid: 'Id do visitante (rid)',
  kind: 'Tipo (subscription_create, subscription_cycle, credits)',
  utm_source: 'utm_source', utm_medium: 'utm_medium', utm_campaign: 'utm_campaign', utm_content: 'utm_content', utm_term: 'utm_term',
  city: 'Cidade do comprador', state: 'UF do comprador', zipcode: 'CEP do comprador', country: 'País do comprador' };
export const CUSTOM_STATUSES = ['paid', 'pending', 'refused', 'refunded', 'chargeback'];
/** Lê "data.items.0.name" de um objeto; também aceita "data.items[0].name". */
export const pick = (o, path) => !path ? undefined : String(path).replace(/\[(\d+)\]/g, '.$1').split('.').reduce((x, k) => x == null || !Object.hasOwn(Object(x), k) ? undefined : x[k], o);
export function parseCustom(b, map) {
  const f = map?.fields || {}, v = k => pick(b, f[k]);
  const raw = String(v('status') ?? '').trim().toLowerCase();
  const status = CUSTOM_STATUSES.find(st => String(map?.status?.[st] || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean).includes(raw))
    || (raw === '' && !f.status ? 'paid' : null);
  if (!status) return null;
  const k = map?.cents ? 100 : 1, gross = num(v('amount')) / k;
  return {
    order_id: str(v('order_id')), status, method: method(v('method')), gross, net: v('net') != null ? num(v('net')) / k : gross,
    currency: str(v('currency') || 'BRL', 3).toUpperCase(), product: str(v('product')), ts: time(v('created_at')),
    utm: utm({ source: v('utm_source'), medium: v('utm_medium'), campaign: v('utm_campaign'), content: v('utm_content'), term: v('utm_term') }),
    email: v('email'), phone: v('phone'), name: [v('name'), v('lastname')].filter(x => x != null && x !== '').join(' ') || undefined, rid: ridOf(v('rid')),
    kind: str(v('kind'), 40).toLowerCase(),
    // Sobrenome à parte (OnProfit V2: customer.lastname) completa o nome; país por extenso "Brasil" vira BR.
    addr: { city: v('city'), state: v('state'), zipcode: v('zipcode'), country_iso: /^bra[sz]il$/i.test(String(v('country') ?? '').trim()) ? 'BR' : v('country') },
  };
}

// ---------- Google Sheets (Apps Script envia as linhas; cabeçalho da planilha em português ou inglês) ----------
const norm = h => String(h).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const SHEET_COLS = {
  order_id: ['pedido', 'id_do_pedido', 'order_id', 'id', 'transacao', 'codigo'], status: ['status', 'situacao'], amount: ['valor', 'valor_pago', 'valor_bruto', 'total', 'amount'],
  net: ['liquido', 'valor_liquido', 'net', 'comissao'], currency: ['moeda', 'currency'], method: ['pagamento', 'forma_de_pagamento', 'metodo', 'method'],
  product: ['produto', 'product', 'oferta'], created_at: ['data', 'data_da_venda', 'created_at', 'date'], email: ['email', 'e_mail'], phone: ['telefone', 'celular', 'whatsapp', 'phone'],
  rid: ['rid'], utm_source: ['utm_source'], utm_medium: ['utm_medium'], utm_campaign: ['utm_campaign'], utm_content: ['utm_content'], utm_term: ['utm_term'],
};
const SHEET_STATUS = { paid: ['pago', 'paga', 'aprovado', 'aprovada', 'paid', 'confirmado', 'confirmada', 'concluido', 'concluida', ''], pending: ['pendente', 'aguardando', 'pending'],
  refunded: ['reembolsado', 'reembolsada', 'devolvido', 'refunded'], refused: ['cancelado', 'cancelada', 'recusado', 'recusada', 'refused'], chargeback: ['chargeback', 'contestado'] };
const DATE_BR = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/;
export function parseSheetRow(values) {
  const byNorm = Object.fromEntries(Object.entries(values || {}).map(([k, v]) => [norm(k), v]));
  const fields = {};
  for (const [f, names] of Object.entries(SHEET_COLS)) { const n = names.find(x => Object.hasOwn(byNorm, x)); if (n) fields[f] = n; }
  if (fields.status && String(byNorm[fields.status] ?? '').trim() === '') delete fields.status; // status vazio: a linha é uma venda paga
  const status = Object.fromEntries(Object.entries(SHEET_STATUS).map(([k, v]) => [k, v.join(',')]));
  const s = parseCustom(byNorm, { fields, status });
  const d = DATE_BR.exec(String(byNorm[fields.created_at] || ''));
  if (s && d) s.ts = Date.parse(`${d[3]}-${d[2]}-${d[1]}T${d[4] || '12'}:${d[5] || '00'}:00-03:00`);
  if (s && !(s.gross > 0)) return { error: 'Valor vazio' }; // linha ainda sendo digitada
  return s;
}

/** "Nome da campanha|123456" (template de UTM da Meta) → "123456"; senão o próprio valor. */
// Checkouts colam '::<código do clique>' depois do id da UTM ("Nome|id::PAZX..."): o que vem depois de '::' não é parte da chave.
// O template gruda o "|" no nome; "Rastreio | 08-11-2026" é só um nome com " | ", e a data não pode virar a chave.
export const adKey = v => { const t = String(v || '').split('::')[0]; const m = /\S\|\s*([\w-]+)\s*$/.exec(t); return m ? m[1] : t.trim(); };

const log = (site, platform, s, ok, message) => db.batch([
  ['INSERT INTO webhook_log(site, ts, platform, order_id, status, ok, message) VALUES (?,?,?,?,?,?,?)', [site, Date.now(), platform, s?.order_id || '', s?.status || '', ok ? 1 : 0, message]],
  ['DELETE FROM webhook_log WHERE site=? AND id NOT IN (SELECT id FROM webhook_log WHERE site=? ORDER BY id DESC LIMIT 50)', [site, site]],
]);

// Ordem de status: um evento atrasado (pendente depois de pago, pago depois de reembolso) não desfaz o que já aconteceu.
const RANK = c => `CASE ${c} WHEN 'chargeback' THEN 4 WHEN 'refunded' THEN 3 WHEN 'paid' THEN 2 ELSE 1 END`;
const UPSERT = `INSERT INTO sales(site, platform, order_id, status, method, gross, net, currency, product, ts, date, updated,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_key, adset_key, ad_key, rid, match_rule, ft_source, ft_medium, ft_campaign, ft_content, subscription_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(site, platform, order_id) DO UPDATE SET status=CASE WHEN ${RANK('excluded.status')} >= ${RANK('sales.status')} THEN excluded.status ELSE sales.status END, updated=excluded.updated,
    method=CASE WHEN excluded.method<>'other' THEN excluded.method ELSE sales.method END,
    gross=CASE WHEN excluded.gross>0 THEN excluded.gross ELSE sales.gross END, net=CASE WHEN excluded.net>0 THEN excluded.net ELSE sales.net END,
    product=COALESCE(NULLIF(sales.product,''), excluded.product),
    utm_source=COALESCE(NULLIF(sales.utm_source,''), excluded.utm_source), utm_medium=COALESCE(NULLIF(sales.utm_medium,''), excluded.utm_medium),
    utm_campaign=COALESCE(NULLIF(sales.utm_campaign,''), excluded.utm_campaign), utm_content=COALESCE(NULLIF(sales.utm_content,''), excluded.utm_content),
    utm_term=COALESCE(NULLIF(sales.utm_term,''), excluded.utm_term), campaign_key=COALESCE(NULLIF(sales.campaign_key,''), excluded.campaign_key),
    adset_key=COALESCE(NULLIF(sales.adset_key,''), excluded.adset_key), ad_key=COALESCE(NULLIF(sales.ad_key,''), excluded.ad_key),
    rid=COALESCE(sales.rid, excluded.rid), match_rule=CASE WHEN sales.match_rule IN ('rid','email') THEN sales.match_rule ELSE excluded.match_rule END,
    ft_source=CASE WHEN sales.ft_campaign<>'' THEN sales.ft_source ELSE excluded.ft_source END, ft_medium=CASE WHEN sales.ft_campaign<>'' THEN sales.ft_medium ELSE excluded.ft_medium END,
    ft_content=CASE WHEN sales.ft_campaign<>'' THEN sales.ft_content ELSE excluded.ft_content END, ft_campaign=COALESCE(NULLIF(sales.ft_campaign,''), excluded.ft_campaign),
    subscription_id=COALESCE(sales.subscription_id, excluded.subscription_id)
  RETURNING status`;

/** Processa um webhook. Retorna o status HTTP para a plataforma. `now` é injetável para testes. */
/**
 * Token da URL por plataforma, derivado do token do site: com a assinatura da Hotmart ligada, a URL da Hotmart
 * não serve para criar venda pelo /generic. "Gerar novo token" troca todos.
 */
export const hookToken = (site, platform) => createHash('sha256').update(`${site.webhook_token}:${platform}`).digest('base64url').slice(0, 32);
export const siteByToken = (token, platform) => {
  const t = Buffer.from(String(token));
  return [...sites.values()].find(x => { if (!x.webhook_token) return false; const w = Buffer.from(hookToken(x, platform)); return w.length === t.length && timingSafeEqual(w, t); });
};
const jsonOr = (v, d) => { try { return JSON.parse(v) ?? d; } catch { return d; } };
export const secretsOf = site => jsonOr(site.hook_secrets, {});

/**
 * Casa a venda com o clique (ordem: rid do link de checkout, depois UTMs). Com o rid, herda as UTMs da última visita
 * com campanha quando a venda chega sem elas, e traz fbc, fbp, user agent e a página para a compra ir à Meta como 'website'.
 */
export async function matchSale(site, s) {
  const out = { rule: 'none', click: null, utm: s.utm, first: null };
  // Sem rid no checkout: procura o lead pelo e-mail ou telefone (formulário antes do checkout) e usa o rid dele.
  let rid = s.rid, via = 'rid';
  if (!rid && (s.email || s.phone)) {
    const c = await findContact(site.id, { emailHash: hashEmail(s.email), phoneHash: hashPhone(s.phone) });
    if (c?.rid) { rid = c.rid; via = 'email'; }
  }
  s = { ...s, rid };
  if (s.rid) {
    // Só o que aconteceu até a venda, nos 30 dias anteriores: um remarketing clicado depois de comprar não leva o crédito.
    const W = 'site=? AND rid=? AND ts BETWEEN ? AND ?', a = [site.id, s.rid, s.ts - 30 * 864e5, s.ts + 60e3];
    const [last, fb, ga, paid, first, geo, gc] = await Promise.all([
      db.get(`SELECT ua, host, path, fbp, country FROM events WHERE ${W} ORDER BY ts DESC LIMIT 1`, a),
      db.get(`SELECT fbc FROM events WHERE ${W} AND fbc IS NOT NULL ORDER BY ts DESC LIMIT 1`, a),
      db.get(`SELECT ga_cid FROM events WHERE ${W} AND ga_cid IS NOT NULL ORDER BY ts DESC LIMIT 1`, a),
      db.get(`SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term FROM events WHERE ${W} AND utm_campaign<>'' ORDER BY ts DESC LIMIT 1`, a),
      // Primeiro toque pago (ADR 0018): o anúncio que abriu a porta, mesmo que a compra venha pela bio, recuperação ou direto.
      db.get(`SELECT utm_source, utm_medium, utm_campaign, utm_content FROM events WHERE ${W} AND utm_campaign<>'' ORDER BY ts ASC LIMIT 1`, a),
      db.get('SELECT ip_enc, city, region FROM checkout_clicks WHERE site=? AND rid=? AND ts BETWEEN ? AND ?', [site.id, s.rid, s.ts - 7 * 864e5, s.ts + 60e3]),
      db.get(`SELECT gclid, gbraid, wbraid, ts FROM events WHERE ${W} AND (gclid IS NOT NULL OR gbraid IS NOT NULL OR wbraid IS NOT NULL) ORDER BY ts DESC LIMIT 1`, a),
    ]);
    if (last) {
      out.rule = via;
      out.click = { rid: s.rid, fbc: fb?.fbc || null, fbp: last.fbp, ua: last.ua, country: last.country, gaCid: ga?.ga_cid || null, url: last.host ? `https://${last.host}${last.path}` : null,
        ip: open(geo?.ip_enc), city: geo?.city || null, region: geo?.region || null, gclid: gc?.gclid || null, gbraid: gc?.gbraid || null, wbraid: gc?.wbraid || null, gclickTs: gc ? Number(gc.ts) : 0 };
      // Sem campanha na venda (link da bio): completa com a última campanha da visita.
      if (!s.utm.campaign && paid) out.utm = utm({ source: s.utm.source || paid.utm_source, medium: s.utm.medium || paid.utm_medium, campaign: paid.utm_campaign,
        content: s.utm.content || paid.utm_content, term: s.utm.term || paid.utm_term });
      // Com campanha na venda, o clique vale mais: o `sck` da Hotmart costuma ser um rótulo fixo do produtor ("lp-ahsd-47"),
      // e a página sempre repassa ao checkout as UTMs da própria visita.
      else if (paid) out.utm = utm({ source: paid.utm_source, medium: paid.utm_medium, campaign: paid.utm_campaign, content: paid.utm_content, term: paid.utm_term });
      if (first) out.first = utm({ source: first.utm_source, medium: first.utm_medium, campaign: first.utm_campaign, content: first.utm_content });
    }
  }
  if (out.rule === 'none' && (out.utm.campaign || out.utm.source)) out.rule = 'utm';
  // Sem rid, mas a plataforma trouxe fbclid e user agent (Shopify): ainda dá para mandar o clique à Meta.
  if (!out.click && (s.fbclid || s.ua)) out.click = { fbc: /^[\w.-]{1,255}$/.test(s.fbclid || '') ? `fb.1.${s.ts ?? Date.now()}.${s.fbclid}` : null, ua: s.ua || null, url: s.url || null };
  return out;
}

export const MATCH_PT = { rid: 'Clique (rid)', email: 'Lead (e-mail ou telefone)', utm: 'UTM', none: 'Sem origem' };

/**
 * Plataforma do último clique quando a pessoa clicou em anúncio das duas: 'meta' ou 'gads'; senão null.
 * Clique da Meta = data de criação do fbc (fb.1.<ms>.<fbclid>); do Google = evento com gclid, gbraid ou wbraid na URL.
 */
export function lastClick(click) {
  let fb = Number(String(click?.fbc || '').split('.')[2]) || 0;
  if (fb && fb < 1e12) fb *= 1000; // fbc com a data em segundos
  const g = click?.gclickTs || 0;
  return fb && g ? (g > fb ? 'gads' : 'meta') : null;
}

/** Compra aprovada há mais que isso não vai à Meta, ao GA4 nem ao Google Ads (a Meta recusa eventos com mais de 7 dias). */
export const LATE_PURCHASE = 3 * 864e5;

/** Grava a venda normalizada, casa com o clique e enfileira a compra para Meta e GA4. */
export async function ingestSale(site, platform, s, now = Date.now()) {
  if (!s.order_id) { await log(site.id, platform, s, false, 'Pedido sem identificador'); return { ok: false, message: 'Pedido sem identificador' }; }
  // Confirmação sem dados do comprador (Pix do checkout próprio, banco ou botão do painel): usa o contato e o valor do pedido pendente.
  if (!s.email && !s.phone && piiReady()) {
    const p = await db.get(`SELECT p.product, p.gross, c.email_enc, c.phone_enc, c.name_enc FROM pending_orders p JOIN contacts c ON c.id=p.contact_id
      WHERE p.site=? AND p.platform=? AND p.order_id=?`, [site.id, platform, s.order_id]);
    if (p) s = { ...s, email: open(p.email_enc), phone: open(p.phone_enc), name: open(p.name_enc), product: s.product || p.product, gross: s.gross || p.gross, net: s.net || p.gross };
  }
  const ts = s.ts ?? now;
  const before = await db.get('SELECT status FROM sales WHERE site=? AND platform=? AND order_id=?', [site.id, platform, s.order_id]);
  // Assinatura no Asaas (payment.subscription): o webhook não traz billing_reason nem o rid nas cobranças geradas nos meses
  // seguintes. Se já houve cobrança paga da mesma assinatura com outro order_id, é renovação ('subscription_cycle') e herda
  // o rid da 1ª cobrança para manter o histórico do cliente sem disparar outro Purchase na Meta.
  if (s.subscription_id) {
    const prevSub = await db.get(`SELECT order_id, rid FROM sales WHERE site=? AND platform=? AND subscription_id=? AND order_id<>?
      AND status IN ('paid','refunded','chargeback') ORDER BY ts ASC LIMIT 1`, [site.id, platform, s.subscription_id, s.order_id]);
    if (prevSub) s = { ...s, rid: s.rid || prevSub.rid || null, kind: s.kind || 'subscription_cycle' };
  }
  const m = await matchSale(site, { ...s, ts }), u = m.utm;
  // Webhook sem e-mail nem telefone (Asaas manda só customer="cus_..."): se casou pelo rid e o contato já existe no CRM
  // (criado no CompleteRegistration ou num formulário), recupera e-mail, telefone e nome para a Conversions API e para mover o card.
  const matchedRid = s.rid || m.click?.rid || null;
  if (!s.email && !s.phone && matchedRid && piiReady()) {
    const c = await db.get('SELECT email_enc, phone_enc, name_enc FROM contacts WHERE site=? AND rid=? ORDER BY id LIMIT 1', [site.id, matchedRid]);
    if (c) s = { ...s, email: open(c.email_enc) || s.email, phone: open(c.phone_enc) || s.phone, name: open(c.name_enc) || s.name };
  }
  // Sem visita paga registrada, o único toque conhecido é o da própria venda: ele abriu e fechou.
  const ft = m.first || (u.campaign ? u : utm({}));
  const { rows: [saved] } = await db.run(UPSERT, [site.id, platform, s.order_id, s.status, s.method, Math.max(0, s.gross), Math.max(0, s.net), s.currency.toUpperCase() || site.currency,
    s.product, ts, localDate(ts, site.timezone), now, u.source, u.medium, u.campaign, u.content, u.term, adKey(u.campaign), adKey(u.medium), adKey(u.content), matchedRid, m.rule,
    ft.source, ft.medium, ft.campaign, ft.content, s.subscription_id || null]);
  const message = `${before ? `Atualizada: ${STATUSES[before.status]} → ${STATUSES[saved.status]}` : 'Nova venda'} · origem: ${MATCH_PT[m.rule]}`;
  await log(site.id, platform, s, true, message);
  await trackPending(site, platform, { ...s, status: saved.status, ts, utm: u, rid: s.rid || m.click?.rid || null }, now); // públicos e recuperação

  // Compra aprovada vai para a fila (src/dispatch.js), uma vez só.
  if (saved.status === 'paid' && before?.status !== 'paid' && s.gross > 0) {
    const sale = { ...s, ts, platform }, pii = piiReady() && (s.email || s.phone);
    // O mesmo pedido por outra fonte (ex.: webhook da Hotmart e a planilha): o event_id seria outro e a Meta contaria duas vezes.
    const twin = await db.get(`SELECT platform FROM sales WHERE site=? AND order_id=? AND platform<>? AND status IN ('paid','refunded','chargeback')
      AND abs(gross - ?) < 0.01 LIMIT 1`, [site.id, s.order_id, platform, s.gross]);
    // A compra já foi marcada à mão no quadro (coluna com Purchase) nos últimos 7 dias: o Purchase dela já saiu.
    const byCrm = !twin && pii && recentPurchase(await findContact(site.id, { emailHash: hashEmail(s.email), phoneHash: hashPhone(s.phone) }), now, 'crm');
    // Compra que só chega agora, dias depois de aprovada (ex.: PURCHASE_COMPLETE da Hotmart no fim da garantia, de venda
    // feita antes do webhook existir): não é conversão nova. Enviada, a Meta a contaria hoje e daria o crédito a um anúncio de hoje.
    const paidAt = s.paid_at ?? ts, late = now - paidAt > LATE_PURCHASE;
    // Renovação automática (Stripe invoice.paid, kind/billing_reason 'subscription_cycle'): é receita recorrente de cliente
    // antigo, não conversão de um anúncio de hoje. Fica em sales (LTV), mas não vai à Meta nem ao Google Ads.
    const renewal = /^(subscription_cycle|renewal|renewal_cycle|recurring)$/.test(String(s.kind || '').toLowerCase());
    let sent = false;
    // Último clique (ADR 0024): quem clicou em anúncio da Meta e do Google tem a compra enviada só para o clique mais recente.
    // Só com os dois destinos ativos: sem o Google Ads configurado, a compra não pode deixar de ir à Meta (e vice-versa).
    const last = metaReady(site) && gadsReady(site) && gadsAction(site, 'Purchase') ? lastClick(m.click) : null, skip = msg => log(site.id, platform, s, true, `Último clique no ${last === 'gads' ? 'Google Ads' : 'anúncio da Meta'}: ${msg}`);
    if (late) await log(site.id, platform, s, true, `Aprovada em ${localDate(paidAt, site.timezone)}, chegou ${Math.floor((now - paidAt) / 864e5)} dias depois: gravada, mas não enviada à Meta nem ao GA4`);
    else if (twin) await log(site.id, platform, s, true, `Compra já recebida por ${PLATFORMS[twin.platform] ?? twin.platform}: não reenviada à Meta nem ao GA4`);
    else if (byCrm) await log(site.id, platform, s, true, 'Purchase já enviado pelo quadro do CRM: não reenviado à Meta');
    else if (renewal) { await log(site.id, platform, s, true, 'Renovação automática: venda gravada, mas o Purchase não vai à Meta nem ao Google Ads (não é aquisição de anúncio)'); sent = true; }
    else if (last === 'gads' && metaReady(site)) { await skip('compra não enviada à Meta'); sent = true; } // sent: o quadro do CRM também não reenvia
    else if (metaReady(site)) {
      const ev = metaPurchase(site, sale, { email: s.email, phone: s.phone, name: s.name, click: m.click }, now);
      if (ev) {
        const q = await enqueuePurchase(site.id, ev, now); sent = true;
        // O IP do clique já está no payload da fila (apagado no envio): a cópia cifrada sai agora.
        if (m.click?.rid) await db.run('DELETE FROM checkout_clicks WHERE site=? AND rid=?', [site.id, m.click.rid]);
        await log(site.id, platform, s, true, q.action === 'new' ? `Na fila da Conversions API da Meta (${ev.action_source === 'website' ? 'com o clique' : 'sem o clique'}), sai em ${PURCHASE_HOLD / 60e3} min para somar order bump e upsell`
          : q.action === 'merged' ? `Somada à compra ${q.eventId} na Meta (mesmo comprador): uma conversão só`
            : `Parte da compra ${q.eventId}, já enviada à Meta: não vira outra conversão`);
      }
      else await log(site.id, platform, s, false, 'Conversions API: compra sem e-mail, telefone nem clique, não enviada');
    }
    const g = !twin && !late && ga4Ready(site) && ga4Purchase(site, sale, m.click, now);
    if (g) await enqueue(site.id, 'ga4', `${platform}-${s.order_id}`, 'Purchase', g, now);
    // Google Ads: uma conversão por checkout, como na Meta (order bump e upsell do mesmo comprador somam no valor).
    const action = !twin && !late && !renewal && gadsReady(site) && gadsAction(site, 'Purchase');
    if (action && last === 'meta') await skip('compra não enviada ao Google Ads');
    const ga = action && last !== 'meta' && gadsEvent({ ts: Math.min(ts, now), value: s.gross, currency: s.currency.toUpperCase() || site.currency, id: `${platform}-${s.order_id}`,
      click: m.click, email: s.email, phone: s.phone, web: !!m.click?.rid });
    if (ga) {
      const q = await enqueueGadsPurchase(site.id, metaEmail(s.email) || metaPhone(s.phone) || sha(m.click?.rid || s.rid), action, ga, now);
      if (q.action !== 'new') await log(site.id, platform, s, true, q.action === 'merged' ? `Somada à compra ${q.eventId} no Google Ads (mesmo comprador): uma conversão só`
        : `Parte da compra ${q.eventId}, já enviada ao Google Ads: não vira outra conversão`);
    }
    if (pii) await saleToCrm(site, { ...sale, utm: u }, m.click, now, { sent }); // comprador no CRM, coluna de ganho
  }
  return { ok: true, message };
}

/** Webhook de plataforma. Retorna o status HTTP. `req` = { headers } para conferir assinaturas. */
export async function handleWebhook(token, platform, raw, now = Date.now(), req = { headers: {} }) {
  if (!Object.hasOwn(PARSERS, platform) && platform !== 'custom') return 404;
  const site = siteByToken(token, platform);
  if (!site) return 404;
  const bad = verify(platform, secretsOf(site)[platform], raw, req.headers || {}, now);
  if (bad) { await log(site.id, platform, null, false, bad); return 401; }
  let body;
  try { body = JSON.parse(raw); } catch { body = Object.fromEntries(new URLSearchParams(raw)); }
  let s;
  try { s = platform === 'custom' ? parseCustom(body || {}, jsonOr(site.custom_map, null)) : PARSERS[platform](body || {}); }
  catch { await log(site.id, platform, null, false, 'Payload em formato inesperado'); return 400; }
  // O nome do evento no log mostra o que a plataforma está mandando à toa (ex.: abandono de carrinho, troca de plano).
  const kind = String((typeof body?.event === 'string' && body.event) || body?.type || body?.order_status || body?.status || '').replace(/[^\w.-]/g, '').slice(0, 60);
  if (!s) { await log(site.id, platform, null, true, `Evento ignorado (não é venda)${kind ? `: ${kind}` : ''}`); return 200; }
  return (await ingestSale(site, platform, s, now)).ok ? 200 : 400;
}

/** Linhas enviadas pelo Apps Script da planilha: { rows: [{ row, values: { cabeçalho: valor } }] }. Até 200 por chamada. */
export async function handleSheet(token, raw, now = Date.now()) {
  const site = siteByToken(token, 'sheets');
  if (!site) return { status: 404 };
  const rows = jsonOr(raw, {}).rows;
  if (!Array.isArray(rows) || rows.length > 200) return { status: 400, body: { error: 'Envie { rows: [...] } com até 200 linhas' } };
  const results = [];
  for (const r of rows) {
    const s = parseSheetRow(r?.values);
    if (!s || s.error) { results.push({ row: r?.row, ok: false, message: s?.error || 'Status não reconhecido' }); continue; }
    const out = await ingestSale(site, 'sheets', s, now);
    results.push({ row: r?.row, ok: out.ok, message: out.ok ? 'enviado' : out.message });
  }
  return { status: 200, body: { results } };
}
