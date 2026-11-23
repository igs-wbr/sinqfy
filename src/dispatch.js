// Etapa 2: fila de envio server-side para a Meta (Conversions API), o GA4 (Measurement Protocol) e o Google Ads (Data Manager API, ADR 0024).
// Ingestão e webhooks só enfileiram (enqueue); dispatch() envia em lotes, com reenvio e espera crescente.
// IP e user agent só existem no payload enquanto o envio está pendente (ADR 0014): ao terminar, saem do banco.
import { createHash, createSign } from 'node:crypto';
import { db, env, sites } from './db.js';
import { metaEmail, metaPhone, normEmail, normPhone, open } from './pii.js';

const graph = () => `https://graph.facebook.com/${env.META_API_VERSION || 'v23.0'}`;
const sha = v => createHash('sha256').update(v).digest('hex');
export const BACKOFF = [60e3, 5 * 60e3, 30 * 60e3, 6 * 3600e3]; // 4 reenvios; o 5º erro encerra
const MAX_AGE = 7 * 864e5; // a Meta recusa eventos com mais de 7 dias

export const metaReady = s => !!(s.meta_pixel && s.meta_capi_token);
export const ga4Ready = s => !!(s.ga4_id && s.ga4_secret);
export const gadsReady = s => !!(s.gads_customer && s.gads_key && s.gads_actions);
/** Ação de conversão do Google Ads para o nome do evento (mapa salvo em Integrações), ou null. */
export function gadsAction(s, name) {
  try { const m = JSON.parse(s.gads_actions || '{}'); return Object.hasOwn(m, name) ? m[name] : null; } catch { return null; }
}
/** Chave JSON da conta de serviço: cifrada com a DATA_KEY quando ela existe. */
export const gadsKey = s => { try { return JSON.parse(s.gads_key?.startsWith('{') ? s.gads_key : open(s.gads_key)); } catch { return null; } };

// ---------- montagem dos eventos ----------
const GA4_NAMES = { pageview: 'page_view', Purchase: 'purchase', Lead: 'generate_lead', InitiateCheckout: 'begin_checkout', AddToCart: 'add_to_cart',
  ViewContent: 'view_item', CompleteRegistration: 'sign_up', Search: 'search', AddPaymentInfo: 'add_payment_info' };
export const ga4Name = n => GA4_NAMES[n] || (n.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^[^A-Za-z]+/, '').toLowerCase().slice(0, 40) || 'evento');
export const metaName = n => n === 'pageview' ? 'PageView' : n;

// Normalização da Meta antes do hash: nome só com letras em minúsculas; cidade sem acento nem espaço; UF e país em 2 letras.
const letters = v => String(v || '').toLowerCase().replace(/[^\p{L}]/gu, '');
const city = v => letters(String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')).replace(/[^a-z]/g, '');
const code2 = v => /^[A-Za-z]{2}$/.test(v || '') && !/^xx$/i.test(v) ? v.toLowerCase() : '';
/** Acrescenta ao user_data, em SHA-256, só os campos que vieram. */
function addHashed(user_data, fields) { for (const [k, v] of Object.entries(fields)) if (v) user_data[k] = [sha(v)]; }
/** Primeiro e último nome, só letras em minúsculas. */
const names = name => { const p = String(name || '').trim().split(/\s+/).map(letters).filter(Boolean); return { fn: p[0], ln: p.length > 1 && p.at(-1) }; };

/** Evento do site para a Conversions API. `ctx` traz ip, ua e a URL da página (sem query string). */
export function metaWebEvent(site, ev, ctx) {
  const { ip, ua, url } = ctx;
  const user_data = { client_user_agent: ua };
  if (ip) user_data.client_ip_address = ip;
  if (ev.fbc) user_data.fbc = ev.fbc;
  if (ev.fbp) user_data.fbp = ev.fbp;
  if (ev.rid) user_data.external_id = [sha(ev.rid)];
  // Local aproximado pelo IP (Cloudflare): país, UF e cidade. Não fica no banco, só no payload pendente.
  addHashed(user_data, { country: code2(ev.country), st: code2(ctx.region), ct: city(ctx.city) });
  // Quem preencheu o formulário agora ou já é contato (pelo rid): e-mail, telefone e nome só em SHA-256, só no payload pendente.
  const p = ctx.person;
  if (p) {
    const em = metaEmail(p.email), ph = metaPhone(p.phone);
    if (em) user_data.em = [em];
    if (ph) user_data.ph = [ph];
    addHashed(user_data, names(p.name));
  }
  const out = { event_name: metaName(ev.name), event_time: Math.floor(ev.ts / 1000), event_id: ev.event_id, action_source: 'website', event_source_url: url, user_data };
  if (ev.revenue != null) out.custom_data = { value: ev.revenue, currency: site.currency };
  return out;
}

/**
 * Compra aprovada vinda do webhook. E-mail e telefone chegam aqui e só seguem em SHA-256.
 * Com o clique casado (etapa 3: rid do link de checkout), vai como 'website' com fbc, fbp, user agent e a página;
 * sem ele, como 'other' (sem user agent a Meta recusa 'website').
 */
export function metaPurchase(site, sale, { email, phone, name, click } = {}, now = Date.now()) {
  const user_data = {};
  if (email) user_data.em = [sha(String(email).trim().toLowerCase())];
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d; // a Meta exige o DDI
  if (d) user_data.ph = [sha(d)];
  if (click?.fbc) user_data.fbc = click.fbc;
  if (click?.fbp) user_data.fbp = click.fbp;
  if (click?.rid) user_data.external_id = [sha(click.rid)];
  if (!Object.keys(user_data).length) return null; // a Meta exige ao menos um identificador (nome e país sozinhos não bastam)
  // Nome e país só reforçam a correspondência: a Meta não casa ninguém só com eles.
  // Endereço do comprador (Hotmart: buyer.address) vale mais que o local do IP; cobre também a venda sem clique.
  const a = sale.addr || {};
  addHashed(user_data, { ...names(name), country: code2(a.country_iso) || code2(click?.country) || (d.startsWith('55') && d.length >= 12 ? 'br' : ''),
    st: code2(a.state) || code2(click?.region), ct: city(a.city) || city(click?.city), zp: String(a.zipcode || '').replace(/\W/g, '').toLowerCase() });
  if (click?.ip) user_data.client_ip_address = click.ip; // do clique no checkout (ADR 0020)
  const web = !!(click?.ua && click?.url);
  if (web) user_data.client_user_agent = click.ua;
  // Venda antiga não chega aqui (LATE_PURCHASE em webhooks.js): nunca trocar a data por "agora", a Meta a contaria como compra de hoje.
  return {
    event_name: 'Purchase', event_time: Math.floor(Math.min(sale.ts, now) / 1000), event_id: `${sale.platform}-${sale.order_id}`,
    action_source: web ? 'website' : 'other', ...(web && { event_source_url: click.url }), user_data,
    custom_data: { currency: sale.currency || site.currency, value: sale.gross, content_name: sale.product || undefined, order_id: sale.order_id },
  };
}

/** Compra para o GA4: só com o clique casado (sem client_id do navegador, a venda viraria um usuário inventado). */
export function ga4Purchase(site, sale, click, now = Date.now()) {
  if (!click?.rid) return null;
  const ts = now - sale.ts > 71 * 3600e3 ? now : sale.ts; // o GA4 descarta eventos com mais de 72 h
  return { client_id: click.gaCid || click.rid, timestamp_micros: ts * 1000, events: [{ name: 'purchase', params: {
    transaction_id: `${sale.platform}-${sale.order_id}`, value: sale.gross, currency: sale.currency || site.currency, engagement_time_msec: 1,
    items: [{ item_name: sale.product || 'Produto' }] } }] };
}

/** Evento do site para o GA4. client_id vem do cookie _ga (campo `g` do snippet); sem ele, do visitante. */
export function ga4WebEvent(site, ev, { url, clientId }) {
  const params = { page_location: url, engagement_time_msec: 1 };
  if (ev.revenue != null) Object.assign(params, { value: ev.revenue, currency: site.currency });
  if (ev.name === 'pageview') params.page_path = new URL(url).pathname;
  return { client_id: clientId || ev.rid || ev.visitor, timestamp_micros: ev.ts * 1000, events: [{ name: ga4Name(ev.name), params }] };
}

// Normalização do Google: e-mail em minúsculas (Gmail sem pontos antes do @), telefone em E.164 com +.
const gEmail = e => { const v = normEmail(e); if (!v) return null; const [u, d] = v.split('@'); return sha(/^(gmail|googlemail)\.com$/.test(d) ? `${u.replace(/\./g, '')}@${d}` : v); };
const gPhone = p => { const v = normPhone(p); return v && sha('+' + v); };
/**
 * Conversão para a Data Manager API. Precisa de um identificador: clique do anúncio (gclid, gbraid, wbraid)
 * ou e-mail/telefone em SHA-256 (conversões otimizadas para leads). Sem nenhum, não vai.
 */
export function gadsEvent({ ts, value, currency, id, click, email, phone, web }) {
  const ad = {}, ids = [];
  for (const k of ['gclid', 'gbraid', 'wbraid']) if (click?.[k]) ad[k] = click[k];
  const em = gEmail(email), ph = gPhone(phone);
  if (em) ids.push({ emailAddress: em });
  if (ph) ids.push({ phoneNumber: ph });
  if (!Object.keys(ad).length && !ids.length) return null;
  const ev = { eventTimestamp: new Date(ts).toISOString(), eventSource: web ? 'WEB' : 'OTHER', transactionId: id };
  if (Object.keys(ad).length) ev.adIdentifiers = ad;
  if (ids.length) ev.userData = { userIdentifiers: ids };
  if (value != null) Object.assign(ev, { conversionValue: value, currency });
  return ev;
}

// ---------- fila ----------
export const enqueue = (site, dest, eventId, name, payload, now = Date.now()) => db.run(
  `INSERT INTO deliveries(site, dest, event_id, name, status, attempts, next_at, created, payload) VALUES (?,?,?,?,'pending',0,?,?,?)
   ON CONFLICT(site, dest, event_id) DO NOTHING`,
  [site, dest, eventId, name, now, now, JSON.stringify(payload)]);

/**
 * Compra única por checkout: produto, order bump e upsell da mesma pessoa são UMA conversão na Meta, com o valor somado.
 * O Purchase espera PURCHASE_HOLD na fila; o que chega do mesmo comprador nesse tempo soma no mesmo evento (mesmo
 * event_id). O que chega depois do envio, até PURCHASE_GROUP, não vira outra conversão. Comprador = e-mail, telefone
 * ou rid em hash, o que vier no evento. O lock por comprador evita dois eventos quando os webhooks chegam juntos.
 * Retorna { action: 'new' | 'merged' | 'skipped', eventId }.
 */
export const PURCHASE_HOLD = 5 * 60e3; // order bump chega junto e upsell de 1 clique em poucos minutos; mais que isso atrasa a otimização
export const PURCHASE_GROUP = 2 * 3600e3;
export async function enqueuePurchase(siteId, ev, now = Date.now()) {
  const u = ev.user_data, buyer = u.em?.[0] || u.ph?.[0] || u.external_id?.[0];
  const oid = String(ev.custom_data.order_id ?? ev.event_id), since = now - PURCHASE_GROUP, cd = `payload::jsonb #> '{custom_data}'`;
  ev.custom_data = { ...ev.custom_data, order_ids: [oid], num_items: 1 };
  await db.batch([
    ['SELECT pg_advisory_xact_lock(hashtext(?))', [`${siteId}|${buyer}`]],
    [`UPDATE deliveries SET payload = jsonb_set(payload::jsonb, '{custom_data}', ${cd} || jsonb_build_object(
        'value', round((${cd} ->> 'value')::numeric + ?::numeric, 2),
        'num_items', COALESCE((${cd} ->> 'num_items')::int, 1) + 1,
        'order_ids', COALESCE(${cd} -> 'order_ids', '[]'::jsonb) || jsonb_build_array(?::text),
        'content_name', left(concat_ws(' + ', NULLIF(${cd} ->> 'content_name', ''), NULLIF(?::text, '')), 300)))::text
      WHERE site=? AND dest='meta' AND name='Purchase' AND buyer=? AND status='pending' AND attempts=0 AND created>?
        AND NOT COALESCE(${cd} -> 'order_ids', '[]'::jsonb) @> jsonb_build_array(?::text)`,
    [ev.custom_data.value || 0, oid, ev.custom_data.content_name || '', siteId, buyer, since, oid]],
    [`INSERT INTO deliveries(site, dest, event_id, name, status, attempts, next_at, created, payload, buyer)
      SELECT ?, 'meta', ?, 'Purchase', 'pending', 0, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM deliveries WHERE site=? AND dest='meta' AND name='Purchase' AND buyer=? AND created>?)
      ON CONFLICT(site, dest, event_id) DO NOTHING`,
    [siteId, ev.event_id, now + PURCHASE_HOLD, now, JSON.stringify(ev), buyer, siteId, buyer, since]],
  ]);
  const first = await db.get(`SELECT event_id, payload FROM deliveries WHERE site=? AND dest='meta' AND name='Purchase' AND buyer=? AND created>? ORDER BY id LIMIT 1`, [siteId, buyer, since]);
  if (!first) return { action: 'skipped', eventId: null };
  if (first.event_id === ev.event_id) return { action: 'new', eventId: first.event_id };
  const ids = first.payload ? JSON.parse(first.payload).custom_data?.order_ids || [] : [];
  return { action: ids.includes(oid) ? 'merged' : 'skipped', eventId: first.event_id };
}

/**
 * Mesma regra de compra única por checkout (ADR 0019) para o Google Ads: o Purchase espera PURCHASE_HOLD, order bump
 * e upsell do mesmo comprador somam no valor dele (mesmo transactionId) e o que chega depois do envio, até PURCHASE_GROUP,
 * não vira outra conversão. Os pedidos somados ficam em `order_ids`, fora do evento (o Google recusa campo desconhecido).
 * Retorna { action: 'new' | 'merged' | 'skipped', eventId }.
 */
export async function enqueueGadsPurchase(siteId, buyer, action, ev, now = Date.now()) {
  const oid = ev.transactionId, p = 'payload::jsonb', since = now - PURCHASE_GROUP;
  if (!buyer) { await enqueue(siteId, 'gads', oid, 'Purchase', { action, event: ev, order_ids: [oid] }, now); return { action: 'new', eventId: oid }; }
  await db.batch([
    ['SELECT pg_advisory_xact_lock(hashtext(?))', [`${siteId}|gads|${buyer}`]],
    [`UPDATE deliveries SET payload = jsonb_set(jsonb_set(${p}, '{event,conversionValue}', to_jsonb(round((${p} #>> '{event,conversionValue}')::numeric + ?::numeric, 2))),
        '{order_ids}', COALESCE(${p} -> 'order_ids', '[]'::jsonb) || jsonb_build_array(?::text))::text
      WHERE site=? AND dest='gads' AND name='Purchase' AND buyer=? AND status='pending' AND attempts=0 AND created>?
        AND NOT COALESCE(${p} -> 'order_ids', '[]'::jsonb) @> jsonb_build_array(?::text)`,
    [ev.conversionValue || 0, oid, siteId, buyer, since, oid]],
    [`INSERT INTO deliveries(site, dest, event_id, name, status, attempts, next_at, created, payload, buyer)
      SELECT ?, 'gads', ?, 'Purchase', 'pending', 0, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM deliveries WHERE site=? AND dest='gads' AND name='Purchase' AND buyer=? AND created>?)
      ON CONFLICT(site, dest, event_id) DO NOTHING`,
    [siteId, oid, now + PURCHASE_HOLD, now, JSON.stringify({ action, event: ev, order_ids: [oid] }), buyer, siteId, buyer, since]],
  ]);
  const first = await db.get(`SELECT event_id, payload FROM deliveries WHERE site=? AND dest='gads' AND name='Purchase' AND buyer=? AND created>? ORDER BY id LIMIT 1`, [siteId, buyer, since]);
  if (!first) return { action: 'skipped', eventId: null };
  if (first.event_id === oid) return { action: 'new', eventId: oid };
  const ids = first.payload ? JSON.parse(first.payload).order_ids || [] : [];
  return { action: ids.includes(oid) ? 'merged' : 'skipped', eventId: first.event_id };
}

/** Enfileira um evento do site para os destinos configurados. */
export async function enqueueWeb(site, ev, ctx, now = Date.now()) {
  if (metaReady(site)) await enqueue(site.id, 'meta', ev.event_id, ev.name, metaWebEvent(site, ev, ctx), now);
  // page_view não vai ao GA4: o gtag do site já conta, e o GA4 não deduplica. Só eventos de conversão.
  if (ga4Ready(site) && ev.name !== 'pageview') await enqueue(site.id, 'ga4', ev.event_id, ev.name, ga4WebEvent(site, ev, ctx), now);
  // Google Ads: só os eventos com ação de conversão mapeada, com o último clique de anúncio do visitante (90 dias).
  const action = gadsReady(site) && gadsAction(site, ev.name);
  if (action) {
    const [col, key] = ev.rid ? ['rid', ev.rid] : ['visitor', ev.visitor];
    const click = await db.get(`SELECT gclid, gbraid, wbraid FROM events WHERE site=? AND ${col}=? AND ts>? AND (gclid IS NOT NULL OR gbraid IS NOT NULL OR wbraid IS NOT NULL)
      ORDER BY ts DESC LIMIT 1`, [site.id, key, now - 90 * 864e5]);
    const event = gadsEvent({ ts: ev.ts, value: ev.revenue, currency: site.currency, id: ev.event_id, click, email: ctx.person?.email, phone: ctx.person?.phone, web: true });
    if (event) await enqueue(site.id, 'gads', ev.event_id, ev.name, { action, event }, now);
  }
}

class SendError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
/** 4xx (menos 429) não melhora tentando de novo: token inválido, parâmetro errado. */
const permanent = e => e.status >= 400 && e.status < 500 && e.status !== 429;
const TIMEOUT = 10e3;

/** Token de acesso da conta de serviço (JWT assinado com a chave dela). ponytail: cache por instância, 1 h. */
const tokens = new Map();
async function googleToken(key) {
  const c = tokens.get(key.client_email);
  if (c && c.exp > Date.now() + 60e3) return c.token;
  const iat = Math.floor(Date.now() / 1000), b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const aud = 'https://oauth2.googleapis.com/token'; // fixo: nunca o token_uri da chave colada
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/datamanager', aud, iat, exp: iat + 3600 })}`;
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')}`;
  const res = await fetch(aud, { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }), signal: AbortSignal.timeout(TIMEOUT) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new SendError(`Login da conta de serviço recusado: ${j.error_description || j.error || `HTTP ${res.status}`}`, res.ok ? 400 : res.status);
  tokens.set(key.client_email, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}

const SENDERS = {
  async meta(site, payloads) {
    const body = { data: payloads, access_token: site.meta_capi_token }; // no corpo, não na URL (não vaza em log de proxy)
    if (site.meta_test_code) body.test_event_code = site.meta_test_code;
    const res = await fetch(`${graph()}/${encodeURIComponent(site.meta_pixel)}/events`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new SendError(j.error?.error_user_msg || j.error?.message || `HTTP ${res.status}`, res.ok ? 400 : res.status);
    return `recebidos: ${j.events_received ?? payloads.length}${j.fbtrace_id ? ` · fbtrace_id ${j.fbtrace_id}` : ''}`;
  },
  async ga4(site, [payload]) { // o Measurement Protocol aceita um client_id por requisição
    const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(site.ga4_id)}&api_secret=${encodeURIComponent(site.ga4_secret)}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) throw new SendError(`HTTP ${res.status}`, res.status); // o GA4 responde 2xx mesmo para evento inválido; validar com o endpoint de debug
    return 'aceito pelo GA4';
  },
  async gads(site, [{ action, event }]) {
    const key = gadsKey(site);
    if (!key?.private_key) throw new SendError('Chave da conta de serviço ilegível (DATA_KEY trocada?)', 400);
    const account = id => ({ accountType: 'GOOGLE_ADS', accountId: id });
    const body = { destinations: [{ operatingAccount: account(site.gads_customer), ...(site.gads_login && { loginAccount: account(site.gads_login) }), productDestinationId: String(action) }],
      encoding: 'HEX', events: [event] };
    const res = await fetch('https://datamanager.googleapis.com/v1/events:ingest', { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT),
      headers: { authorization: `Bearer ${await googleToken(key)}`, 'x-goog-user-project': key.project_id, 'content-type': 'application/json' } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new SendError(j.error?.details?.find(d => d.fieldViolations)?.fieldViolations?.[0]?.description || j.error?.message || `HTTP ${res.status}`, res.status);
    // ponytail: erros apurados depois do aceite (diagnósticos do requestStatus.retrieve) não voltam para cá.
    return `aceito pelo Google Ads${j.requestId ? ` · requestId ${j.requestId}` : ''}`;
  },
};
const READY = { meta: metaReady, ga4: ga4Ready, gads: gadsReady };

const strip = p => { const o = JSON.parse(p); if (o.user_data) { delete o.user_data.client_ip_address; delete o.user_data.client_user_agent; } return JSON.stringify(o); };

async function finish(rows, err, now, giveUp) {
  const stmts = rows.map(r => {
    if (!err) return ["UPDATE deliveries SET status='sent', attempts=attempts+1, sent_at=?, payload=NULL, response=? WHERE id=?", [now, r.response, r.id]];
    return isFinal(r, now, giveUp)
      ? ["UPDATE deliveries SET status='failed', attempts=attempts+1, payload=?, response=? WHERE id=?", [strip(r.payload), err.slice(0, 300), r.id]]
      : ["UPDATE deliveries SET status='pending', attempts=attempts+1, next_at=?, response=? WHERE id=?", [now + BACKOFF[r.attempts], err.slice(0, 300), r.id]];
  });
  await db.batch(stmts);
}
const isFinal = (r, now, giveUp) => giveUp || r.attempts + 1 > BACKOFF.length || now - r.created > MAX_AGE;

/**
 * Envia um grupo (lote da Meta ou um evento do GA4 ou do Google Ads). Se a Meta recusar o lote por causa de um evento (4xx),
 * reparte em envios de um evento, para o erro ficar só no evento ruim; 4xx num evento sozinho falha na hora.
 */
async function sendGroup(list, now, out) {
  const { site: id, dest } = list[0], site = sites.get(id);
  let err = null, giveUp = false, response;
  try {
    if (!site || !READY[dest](site)) throw new SendError('Destino não configurado', 0);
    response = await SENDERS[dest](site, list.map(r => JSON.parse(r.payload)));
  } catch (e) {
    if (permanent(e) && list.length > 1) { for (const r of list) await sendGroup([r], now, out); return; }
    err = e.name === 'TimeoutError' ? 'Sem resposta em 10 s' : e.message || String(e);
    giveUp = permanent(e);
  }
  for (const r of list) r.response = response;
  await finish(list, err, now, giveUp);
  for (const r of list) out[!err ? 'sent' : isFinal(r, now, giveUp) ? 'failed' : 'retry']++;
}

/**
 * Envia o que está pendente. Cada linha é "alugada" por 2 min (status sending), então duas instâncias não
 * enviam a mesma coisa, e uma linha presa por queda volta sozinha. Retorna { sent, failed, retry }.
 */
let running = null;
export async function dispatch(opts) {
  if (running && !opts) return running; // o ciclo de 5 s não empilha rodadas
  while (running) await running.catch(() => {}); // chamada com opções (cron, testes) espera e roda a sua
  running = run(opts).finally(() => { running = null; });
  return running;
}
async function run({ now = Date.now(), limit = 500 } = {}) {
  const rows = await db.all(`UPDATE deliveries SET status='sending', next_at=? WHERE id IN (SELECT id FROM deliveries
    WHERE status IN ('pending','sending') AND next_at<=? ORDER BY next_at LIMIT ${Number(limit)} FOR UPDATE SKIP LOCKED) RETURNING *`, [now + 120e3, now]);
  rows.sort((a, b) => a.id - b.id); // RETURNING não garante ordem; envia na ordem de chegada
  const out = { sent: 0, failed: 0, retry: 0 };
  const groups = new Map();
  for (const r of rows) {
    const k = r.dest === 'meta' ? `${r.site}
meta` : `${r.site}
${r.dest}
${r.id}`; // Meta em lote; GA4 e Google Ads um por requisição
    (groups.get(k) || groups.set(k, []).get(k)).push(r);
  }
  const queue = [...groups.values()];
  const worker = async () => { while (queue.length) await sendGroup(queue.shift(), now, out); };
  await Promise.all(Array.from({ length: 6 }, worker)); // até 6 envios em paralelo
  return out;
}

/** Reenvio manual de uma entrega que falhou (botão no inspetor do evento). */
export const retry = (site, id, now = Date.now()) => db.run(
  "UPDATE deliveries SET status='pending', attempts=0, next_at=?, created=? WHERE id=? AND site=? AND status='failed' AND payload IS NOT NULL", [now, now, id, site]);

/** Entregas por evento, para a aba Eventos. */
export async function deliveriesFor(site, eventIds) {
  if (!eventIds.length) return new Map();
  const rows = await db.all('SELECT id, event_id, dest, status, attempts, response, sent_at FROM deliveries WHERE site=? AND event_id = ANY(?::text[])', [site, eventIds]);
  const m = new Map();
  for (const r of rows) (m.get(r.event_id) || m.set(r.event_id, []).get(r.event_id)).push(r);
  return m;
}
