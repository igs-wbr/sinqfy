// Eventos de produto enviados pelo backend do site (cadastro, primeiro app, aplicativo publicado).
// São as etapas do funil self-serve: o navegador vê a visita, o backend vê o que a pessoa fez depois de entrar.
// Idempotente por usuário e evento; o clique do anúncio é casado pelo rid ou, sem ele, pelo contato do CRM.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../db.js';
import { localDate } from '../time.js';
import { enqueue, metaReady, ga4Ready, metaProductEvent, ga4WebEvent } from '../dispatch.js';
import { matchSale, siteByToken, secretsOf, RID_RE, adKey } from './webhooks.js';
import { upsertContact } from '../crm.js';
import { piiReady, sha } from '../pii.js';
import { channel, parseUA } from '../tracking/ingest.js';
import { SESSION_GAP } from '../tracking/stats.js';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const ID_RE = /^[\w.:-]{1,64}$/;
const RESERVED = new Set(['purchase']); // Purchase continua exclusivo do webhook de vendas
// Grafias aceitas do backend viram o nome que o script e a Meta usam.
const CANON = { completeregistration: 'CompleteRegistration', complete_registration: 'CompleteRegistration', first_build: 'first_build', firstbuild: 'first_build',
  app_published: 'app_published', apppublished: 'app_published' };
const EMPTY_UTM = { source: '', medium: '', campaign: '', content: '', term: '' };
const str = (v, n = 200) => v == null ? '' : String(v).trim().slice(0, n);

/** Nome do evento aceito, ou null (identificador inválido ou Purchase, que é do webhook de vendas). */
export function productEventName(v) {
  const raw = str(v, 40);
  if (!NAME_RE.test(raw) || RESERVED.has(raw.toLowerCase())) return null;
  return CANON[raw.toLowerCase()] || raw;
}

/** X-Rastro-Signature = sha256=HMAC-SHA256 do corpo, igual ao webhook de leads. */
function hmacOk(secret, raw, header) {
  const want = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex')), got = Buffer.from(String(header || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

function propsOf(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const entries = Object.entries(v).slice(0, 20).map(([k, x]) => [String(k).slice(0, 50), String(x).slice(0, 200)]);
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
}

function timeOf(v, now) {
  if (v == null || v === '') return now;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) { const n = Number(v); return Math.min(now, n < 1e12 ? n * 1000 : n); }
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isFinite(t) ? Math.min(now, t) : now;
}

const logEvent = (site, eventId, eventName, message, now) => db.batch([
  ['INSERT INTO webhook_log(site, ts, platform, order_id, status, ok, message) VALUES (?,?,?,?,?,?,?)', [site, now, 'events', eventId, eventName, 1, message]],
  ['DELETE FROM webhook_log WHERE site=? AND id NOT IN (SELECT id FROM webhook_log WHERE site=? ORDER BY id DESC LIMIT 50)', [site, site]],
]);

/**
 * Recebe { event_name, user_id, rid, email, phone, name, url, created_at, props }: grava em events (para a aba Eventos e
 * os funis), completa o contato no CRM e enfileira a Meta e o GA4. Retorna o status HTTP e o corpo da resposta.
 */
export async function handleProductEvent(token, raw, now = Date.now(), req = { headers: {} }) {
  const site = siteByToken(token, 'events');
  if (!site) return { status: 404, body: { ok: false } };
  const secret = secretsOf(site).events;
  if (secret && !hmacOk(secret, raw, req.headers?.['x-rastro-signature'])) return { status: 401, body: { ok: false } };

  let b;
  try { b = JSON.parse(raw); } catch { b = null; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { status: 400, body: { ok: false, error: 'Envie um objeto JSON.' } };
  const eventName = productEventName(b.event_name);
  if (!eventName) return { status: 400, body: { ok: false, error: 'event_name inválido. Use CompleteRegistration, first_build, app_published ou outro nome próprio (Purchase é do webhook de vendas).' } };

  const userId = str(b.user_id, 64), givenId = ID_RE.test(str(b.event_id, 64)) ? str(b.event_id, 64) : null;
  if (userId && !ID_RE.test(userId)) return { status: 400, body: { ok: false, error: 'user_id inválido.' } };
  const eventId = givenId || (userId ? `${eventName.toLowerCase()}_${userId}` : null);
  if (!eventId) return { status: 400, body: { ok: false, error: 'Informe user_id (ou event_id) para o evento ser idempotente.' } };

  // Mesmo usuário e evento já registrados e já enfileirados (reenvio do backend): responde 200 sem duplicar.
  // Evento gravado sem entrega (falha entre as duas escritas) segue o fluxo: o enfileiramento é idempotente e repara.
  const existing = await db.get('SELECT 1 AS x FROM events WHERE site=? AND event_id=? LIMIT 1', [site.id, eventId]);
  if (existing && await db.get('SELECT 1 FROM deliveries WHERE site=? AND event_id=? LIMIT 1', [site.id, eventId]))
    return { status: 200, body: { ok: true, duplicate: true, event_id: eventId } };

  const email = str(b.email, 254), phone = str(b.phone, 40), person = str(b.name, 120);
  const rid = RID_RE.test(str(b.rid, 64)) ? str(b.rid, 64) : null;
  const fbclid = /^[\w.-]{1,255}$/.test(str(b.fbclid, 255)) ? str(b.fbclid, 255) : null;
  const ua = str(b.ua, 300), ts = timeOf(b.created_at, now);
  let url = null, host = null, page = '/';
  try {
    const u = new URL(str(b.url, 1000));
    if (/^https?:$/.test(u.protocol)) {
      url = u.origin + u.pathname; host = u.host.slice(0, 253);
      try { page = decodeURI(u.pathname).slice(0, 512) || '/'; } catch { page = u.pathname.slice(0, 512) || '/'; }
    }
  } catch {}
  const ip = /^[\da-f:.]{3,45}$/i.test(str(b.ip, 45)) ? str(b.ip, 45) : null; // só no payload pendente, nunca no banco

  // rid primeiro; sem ele, o contato do CRM pelo e-mail ou telefone (outro dispositivo) devolve o clique original.
  const m = await matchSale(site, { email, phone, rid, ts, utm: EMPTY_UTM, fbclid, ua, url });
  const click = m.click && ip ? { ...m.click, ip } : m.click;

  const u = m.utm;
  if (piiReady()) await upsertContact(site, { email, phone, name: person, rid: click?.rid || rid, fbc: click?.fbc, fbp: click?.fbp, source: 'webhook',
    utm: u, campaign_key: adKey(u.campaign), adset_key: adKey(u.medium), ad_key: adKey(u.content) }, ts);

  const visitor = click?.rid || rid || sha(`${site.id}|${userId || eventId}`).slice(0, 16);
  // Continua a visita em andamento (≤ 30 min) para os funis por sessão, o filtro por evento e as tabelas da Visão geral
  // (navegador, tela, referência) herdarem a sessão do navegador, sem criar uma sessão vazia "session=NULL".
  const last = await db.get('SELECT ts, session, referrer, channel, screen, browser, os FROM events WHERE site=? AND visitor=? AND ts<=? ORDER BY ts DESC LIMIT 1', [site.id, visitor, ts + 60e3]);
  const session = last?.session && ts - last.ts <= SESSION_GAP ? last.session : null;
  const parsed = (click?.ua || ua) ? parseUA(click?.ua || ua) : { browser: '', os: '' };
  const referrer = last?.referrer || '';
  const ch = last?.channel && !u.campaign && !u.source ? last.channel : channel({ referrer, utm_source: u.source, utm_medium: u.medium, utm_campaign: u.campaign });
  const screen = last?.screen || '??', browser = last?.browser || parsed.browser, os = last?.os || parsed.os;

  const { rowCount } = await db.run(`INSERT INTO events(site,date,ts,visitor,session,name,path,referrer,channel,
      utm_source,utm_medium,utm_campaign,utm_term,utm_content,screen,browser,os,country,props,rid,event_id,fbc,fbp,ua,host,ga_cid)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    WHERE NOT EXISTS (SELECT 1 FROM events WHERE site=? AND event_id=?)`,
  [site.id, localDate(ts, site.timezone), ts, visitor, session, eventName, page, referrer, ch,
    u.source, u.medium, u.campaign, u.term, u.content, screen, browser, os, /^[A-Z]{2}$/.test(click?.country || '') && click.country !== 'XX' ? click.country : '??',
    propsOf(b.props), click?.rid || rid, eventId, click?.fbc || null, click?.fbp || null, click?.ua || ua || null, host, click?.gaCid || null,
    site.id, eventId]);

  const pageUrl = url || click?.url || null;
  if (metaReady(site)) {
    const ev = metaProductEvent(site, { name: eventName, eventId, ts, url: pageUrl, email, phone, person, click, rid: click?.rid || rid });
    if (ev) await enqueue(site.id, 'meta', eventId, eventName, ev, now);
  }
  if (ga4Ready(site) && pageUrl) {
    const g = ga4WebEvent(site, { name: eventName, ts, rid: click?.rid || rid, visitor }, { url: pageUrl, clientId: click?.gaCid });
    await enqueue(site.id, 'ga4', eventId, eventName, g, now);
  }

  await logEvent(site.id, eventId, eventName, `${eventName}${rowCount ? '' : ' (repetido)'}${click ? (click.rid ? ' · clique casado (rid)' : ' · clique casado (fbclid)') : ' · sem clique do anúncio'}`, now);
  return { status: 200, body: { ok: true, ...(rowCount ? {} : { duplicate: true }), event_id: eventId } };
}
