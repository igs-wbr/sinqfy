import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db, sites } from '../db.js';
import { localDate } from '../time.js';
import { SESSION_GAP } from './stats.js';
import { enqueueWeb, metaReady, gadsReady } from '../dispatch.js';
import { upsertContact, reveal } from '../crm.js';
import { piiReady, seal } from '../pii.js';
import { adKey, cleanUtm } from '../sales/webhooks.js';
import { enabled } from '../modules.js';

export const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|curl|wget|python|java\/|go-http|axios|node-fetch|okhttp|preview|monitor|scan|phantom|puppeteer|playwright|selenium/i;
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

// Um salt aleatório por dia UTC; os anteriores são apagados, então hashes antigos não podem ser recalculados.
// Instâncias concorrentes convergem: ON CONFLICT DO NOTHING garante um único salt por dia.
let salt = { day: '', value: null };
async function dailySalt(day) {
  if (salt.day === day) return salt.value;
  await db.batch([['INSERT INTO salts VALUES (?,?) ON CONFLICT DO NOTHING', [day, randomBytes(32).toString('hex')]], ['DELETE FROM salts WHERE date<>?', [day]]]);
  return (salt = { day, value: (await db.get('SELECT salt FROM salts WHERE date=?', [day])).salt }).value;
}

export const screenClass = w => !(w > 0) ? '??' : w < 576 ? 'mobile' : w < 992 ? 'tablet' : w < 1440 ? 'laptop' : 'desktop';

// Navegador embutido de app (in-app): o anúncio abre aqui, não no Safari ou Chrome. A ordem importa: o Threads também traz "Instagram".
const IN_APP_UA = [[/Barcelona/, 'Threads'], [/Instagram/, 'Instagram'], [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'], [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
  [/LinkedInApp/, 'LinkedIn'], [/Pinterest/, 'Pinterest'], [/Snapchat/, 'Snapchat'], [/Twitter/, 'X (Twitter)'], [/\bGSA\//, 'Google'], [/; wv\)|WebView/, 'WebView']];
export function parseUA(ua) {
  const app = IN_APP_UA.find(([re]) => re.test(ua))?.[1];
  const browser = app || (/Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Outro');
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Outro';
  return { browser, os };
}

const SEARCH_HOST = /^(.+\.)?(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|qwant|startpage)\.[a-z.]+$|^search\.brave\.com$/;
const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'instagram.com', 't.co', 'twitter.com', 'x.com', 'linkedin.com', 'lnkd.in', 'reddit.com',
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com', 'threads.net', 'bsky.app', 'whatsapp.com', 'wa.me', 't.me', 'telegram.org', 'mastodon.social'];
const SEARCH_SRC = /^(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia)$/;
const SOCIAL_SRC = /^(facebook|fb|instagram|ig|twitter|x|linkedin|reddit|youtube|tiktok|pinterest|threads|whatsapp|telegram|bluesky)$/;

/** Canal de aquisição a partir da referência + UTMs (estilo GA4, simplificado). */
export function channel({ referrer: ref, utm_source, utm_medium, utm_campaign }) {
  const src = utm_source.toLowerCase(), med = utm_medium.toLowerCase();
  const search = SEARCH_HOST.test(ref) || SEARCH_SRC.test(src);
  const social = SOCIAL_HOSTS.some(d => ref === d || ref.endsWith('.' + d)) || SOCIAL_SRC.test(src);
  if (/^(cpc|ppc|cpm|cpv|cpa|paid|paid[-_ ]?(search|social|media)|ads?|display|banner)$/.test(med))
    return social || /social/.test(med) ? 'Social pago' : search || /search/.test(med) ? 'Busca paga' : 'Mídia paga';
  if (/e-?mail|newsletter/.test(med) || /e-?mail|newsletter/.test(src)) return 'E-mail';
  if (/affiliate|afiliad/.test(med)) return 'Afiliados';
  if (social || /social/.test(med)) return 'Social';
  if (search || med === 'organic') return 'Busca orgânica';
  if (ref) return 'Referência';
  if (src || med || utm_campaign) return 'Outras campanhas';
  return 'Direto';
}

const CLICKS = ['gclid', 'gbraid', 'wbraid', 'ttclid'];
/** Domínios do site ("loja.com.br, outra.com"): aceita o domínio e os subdomínios. Vazio aceita qualquer um. */
export function allowedHost(site, host) {
  const list = String(site.domains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.some(d => host === d || host.endsWith('.' + d));
}
const INSERT = `INSERT INTO events(site,date,ts,visitor,session,name,path,referrer,channel,${UTM},screen,browser,os,country,props,revenue,rid,event_id,fbc,fbp,${CLICKS},ua,host,ga_cid)
  VALUES (${Array(31).fill('?')})`;
const CLICK_RE = /^[\w.-]{1,255}$/;
export const fbcOf = (fbclid, now) => CLICK_RE.test(fbclid || '') ? `fb.1.${now}.${fbclid}` : '';

/**
 * Grava um beacon. Retorna o status HTTP. `now` é injetável para testes.
 * `edge` vem do Worker da borda (ADR 0011/0012): { rid, fbp, fbc } lidos ou criados nos cookies do domínio do cliente.
 * Com `rid`, o visitante é o cookie (atribuição entre dias); sem ele, o hash diário de IP + navegador (ADR 0002).
 */
export async function record({ body, ua, ip, country, edge, geo }, now = Date.now()) {
  let e;
  try { e = JSON.parse(body); } catch { return 400; }
  const site = typeof e?.s === 'string' && sites.get(e.s);
  if (!site) return 400;
  if (!ua || BOT_RE.test(ua)) return 202; // bots são descartados em silêncio
  let url;
  try { url = new URL(e.u); } catch { return 400; }
  if (!allowedHost(site, url.hostname)) return 403; // beacon de um domínio que não é do site
  if (Array.isArray(e.k)) return behavior(site, e, url, now);
  const name = e.n == null || e.n === 'pageview' ? 'pageview' : String(e.n).trim().slice(0, 64);
  if (!name) return 400;
  if (/^video_\d+$/.test(name) && !enabled(site, 'video')) return 202; // retenção de vídeo desligada: o snippet manda, o painel ignora

  const visitor = (e.c !== 0 && edge?.rid) || createHash('sha256').update(await dailySalt(new Date(now).toISOString().slice(0, 10)))
    .update(`${site.id}|${ip}|${ua}`).digest('hex').slice(0, 16);
  // Sessão: continua se o último evento do visitante foi há ≤ 30 min, herdando a origem da visita.
  const last = await db.get('SELECT * FROM events WHERE site=? AND visitor=? ORDER BY ts DESC LIMIT 1', [site.id, visitor]);
  let s = last && now - last.ts <= SESSION_GAP ? last : null;
  if (!s) {
    let referrer = '';
    try { if (e.r) referrer = new URL(e.r).hostname.replace(/^www\./, '').slice(0, 253); } catch {}
    s = { session: randomBytes(8).toString('hex'), referrer };
    for (const k of UTM) s[k] = cleanUtm(url.searchParams.get(k)).slice(0, 100);
    s.channel = channel(s);
  }

  const path = pathOf(url);
  let props = null;
  if (e.p && typeof e.p === 'object' && !Array.isArray(e.p)) {
    const entries = Object.entries(e.p).slice(0, 20).map(([k, v]) => [String(k).slice(0, 50), String(v).slice(0, 200)]);
    if (entries.length) props = JSON.stringify(Object.fromEntries(entries));
  }
  const v = typeof e.v === 'number' || (typeof e.v === 'string' && e.v.trim()) ? Number(e.v) : NaN;
  const { browser, os } = parseUA(ua);
  const q = url.searchParams, click = k => CLICK_RE.test(q.get(k) || '') ? q.get(k) : null;
  const eventId = typeof e.i === 'string' && /^[\w-]{8,64}$/.test(e.i) ? e.i : randomUUID();
  // Sem consentimento (snippet com data-consent="required" e c:0): só a estatística, sem IDs de anúncio e sem envio a terceiros.
  const consent = e.c !== 0;
  const clientId = typeof e.g === 'string' && /^\d{1,12}\.\d{1,12}$/.test(e.g) ? e.g : null; // cookie _ga, lido pelo snippet
  const ev = { name, ts: now, rid: consent && edge?.rid || null, visitor, event_id: eventId,
    fbc: consent && (edge?.fbc || fbcOf(q.get('fbclid'), now)) || null, fbp: consent && edge?.fbp || null,
    revenue: v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : null, country };
  await db.run(INSERT, [site.id, localDate(now, site.timezone), now, visitor, s.session, name, path, s.referrer, s.channel,
    ...UTM.map(k => s[k]), screenClass(Number(e.w)), browser, os,
    /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : '??', props, ev.revenue, ev.rid, eventId, ev.fbc, ev.fbp, ...CLICKS.map(k => consent ? click(k) : null),
    consent ? ua.slice(0, 300) : null, url.host.slice(0, 253), consent ? clientId : null]);
  // Formulário com e-mail ou telefone (campo `l` do snippet). Nunca entra no evento gravado.
  const l = consent && e.l && typeof e.l === 'object' ? { email: String(e.l.e || '').slice(0, 254), phone: String(e.l.p || '').slice(0, 40), name: String(e.l.n || '').slice(0, 120) } : null;
  // Envio server-side (etapa 2): IP e user agent seguem só no payload da fila, até o envio terminar (ADR 0014).
  // Compra pelo navegador não vai para a CAPI: qualquer um pode forjar um beacon; a compra real vem do webhook.
  // Retenção de vídeo fica só no painel (funis): não vira evento personalizado na Meta nem no GA4.
  if (consent && name !== 'Purchase' && !/^video_\d+$/.test(name)) {
    // Quem já é contato pelo rid (formulário, pedido pendente, compra, WhatsApp) leva e-mail, telefone e nome em hash à Meta.
    const person = l || (ev.rid && (metaReady(site) || gadsReady(site)) && piiReady()
      ? reveal(await db.get('SELECT name_enc, email_enc, phone_enc FROM contacts WHERE site=? AND rid=? ORDER BY id LIMIT 1', [site.id, ev.rid])) : null);
    await enqueueWeb(site, ev, { ip, ua, url: url.origin + url.pathname, clientId, person, ...geo }, now);
    // Clique no checkout: IP (cifrado), cidade e UF esperam o webhook da compra para o Purchase (ADR 0020).
    if (name === 'InitiateCheckout' && ev.rid && metaReady(site) && piiReady()) await db.run(
      `INSERT INTO checkout_clicks(site, rid, ts, ip_enc, city, region) VALUES (?,?,?,?,?,?)
       ON CONFLICT(site, rid) DO UPDATE SET ts=EXCLUDED.ts, ip_enc=EXCLUDED.ip_enc, city=EXCLUDED.city, region=EXCLUDED.region`,
      [site.id, ev.rid, now, seal(ip), geo?.city || null, geo?.region || null]);
  }
  // Contato do CRM, cifrado. Só pela borda (EDGE_SECRET): o /e direto é público e o id do site também. Limite de 30 leads por minuto por site.
  if (edge && l && (await db.get("SELECT COUNT(*) n FROM contacts WHERE site=? AND source='site' AND created>?", [site.id, now - 60e3])).n < 30) {
    await upsertContact(site, { ...l, rid: ev.rid, fbc: ev.fbc, fbp: ev.fbp, source: 'site', utm: { source: s.utm_source, campaign: s.utm_campaign },
      campaign_key: adKey(s.utm_campaign), adset_key: adKey(s.utm_medium), ad_key: adKey(s.utm_content), note: 'Formulário do site' }, now);
  }
  return 202;
}

/** Caminho sem query string (nunca gravada; só as UTMs vão para o evento). */
function pathOf(url) {
  let path = url.pathname;
  try { path = decodeURI(path); } catch {}
  return path.slice(0, 512);
}

// ---------- comportamento (ADR 0025): rolagem, tempo ativo e cliques, só em somas ----------
const int = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.trunc(Number(v)) || 0));
/** Texto do botão ou link, sem nada que pareça e-mail ou telefone. */
export const clickLabel = t => typeof t !== 'string' ? '' : t.replace(/\s+/g, ' ').trim().replace(/\S+@\S+/g, '…').replace(/\+?\(?\d[\d\s().-]{6,}\d/g, '…').slice(0, 60);
/** Destino do link sem query string; e-mail, telefone e WhatsApp só pelo tipo, nunca o endereço ou o número. */
export function clickDest(href) {
  if (typeof href !== 'string' || !href) return '';
  if (/^mailto:/i.test(href)) return 'e-mail';
  if (/^tel:/i.test(href)) return 'telefone';
  try {
    const u = new URL(href);
    if (!/^https?:$/.test(u.protocol)) return '';
    const host = u.hostname.replace(/^www\./, '');
    if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(host)) return 'WhatsApp';
    let p = u.pathname;
    try { p = decodeURI(p); } catch {}
    return (host + (p === '/' ? '' : p)).slice(0, 200);
  } catch { return ''; }
}
const NAME_RE = /^[\w-]{1,40}$/;
/** Seletor curto: tag mais #id ou .classe, se passarem no filtro. */
export function clickSel(tag, id, cls) {
  if (typeof tag !== 'string' || !/^[a-z][a-z0-9-]{0,19}$/i.test(tag)) return '';
  return tag.toLowerCase() + (typeof id === 'string' && NAME_RE.test(id) ? '#' + id : typeof cls === 'string' && NAME_RE.test(cls) ? '.' + cls : '');
}
/**
 * Beacon de comportamento, que o snippet manda quando a aba some ou a rota muda:
 * { d: [faixa já enviada (-1 na primeira vez), faixa máxima 0..4], a: ms com a aba visível, k: [[x%, y%, tag, id, classe, texto, destino], …] }.
 * Vira só somas por dia, página e aparelho: nada por visitante, então vale com ou sem consentimento.
 */
async function behavior(site, e, url, now) {
  const path = pathOf(url), w = Number(e.w), key = [site.id, localDate(now, site.timezone), path, w > 0 && w < 768 ? 'm' : 'd'], ops = [];
  const [from, to] = Array.isArray(e.d) ? [int(e.d[0], -1, 4), int(e.d[1], 0, 4)] : [0, 0];
  const hit = t => from < t && t <= to ? 1 : 0, ms = int(e.a, 0, 30 * 60e3), views = from < 0 ? 1 : 0;
  if (views || ms || to > from) ops.push([`INSERT INTO page_reads(site, date, path, device, views, active_ms, d25, d50, d75, d100) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(site, date, path, device) DO UPDATE SET views=page_reads.views+EXCLUDED.views, active_ms=page_reads.active_ms+EXCLUDED.active_ms,
    d25=page_reads.d25+EXCLUDED.d25, d50=page_reads.d50+EXCLUDED.d50, d75=page_reads.d75+EXCLUDED.d75, d100=page_reads.d100+EXCLUDED.d100`, [...key, views, ms, hit(1), hit(2), hit(3), hit(4)]]);
  const cells = new Map(), targets = new Map(), add = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const c of e.k.slice(0, 200)) { // o snippet manda o resumo antes de 2500 bytes de cliques: até ~100 cliques curtos
    if (!Array.isArray(c)) continue;
    add(cells, `${int(c[0], 0, 99) / 5 | 0},${int(c[1], 0, 99) / 2 | 0}`); // grade de 20 colunas (5% da largura) por 50 linhas (2% da altura)
    const label = clickLabel(c[5]), dest = clickDest(c[6]); // só a, button ou [role=button] sem data-rastro trazem texto ou destino
    if (label || dest) add(targets, JSON.stringify([clickSel(c[2], c[3], c[4]), label, dest]));
  }
  for (const [k, n] of cells) ops.push(['INSERT INTO click_cells(site, date, path, device, x, y, n) VALUES (?,?,?,?,?,?,?) ON CONFLICT(site, date, path, device, x, y) DO UPDATE SET n=click_cells.n+EXCLUDED.n', [...key, ...k.split(',').map(Number), n]]);
  for (const [k, n] of targets) ops.push(['INSERT INTO click_targets(site, date, path, device, sel, label, dest, n) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(site, date, path, device, sel, label, dest) DO UPDATE SET n=click_targets.n+EXCLUDED.n', [...key, ...JSON.parse(k), n]]);
  if (ops.length) await db.batch(ops);
  return 202;
}
