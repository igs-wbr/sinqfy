import { createHash, randomBytes } from 'node:crypto';
import { db, sites } from '../db.js';
import { localDate } from '../time.js';
import { SESSION_GAP } from './stats.js';

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

export function parseUA(ua) {
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Outro';
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

const INSERT = `INSERT INTO events(site,date,ts,visitor,session,name,path,referrer,channel,${UTM},screen,browser,os,country,props,revenue)
  VALUES (${Array(20).fill('?')})`;

/** Grava um beacon. Retorna o status HTTP. `now` é injetável para testes. */
export async function record({ body, ua, ip, country }, now = Date.now()) {
  let e;
  try { e = JSON.parse(body); } catch { return 400; }
  const site = typeof e?.s === 'string' && sites.get(e.s);
  if (!site) return 400;
  if (!ua || BOT_RE.test(ua)) return 202; // bots são descartados em silêncio
  let url;
  try { url = new URL(e.u); } catch { return 400; }
  const name = e.n == null || e.n === 'pageview' ? 'pageview' : String(e.n).trim().slice(0, 64);
  if (!name) return 400;

  const visitor = createHash('sha256').update(await dailySalt(new Date(now).toISOString().slice(0, 10)))
    .update(`${site.id}|${ip}|${ua}`).digest('hex').slice(0, 16);
  // Sessão: continua se o último evento do visitante foi há ≤ 30 min, herdando a origem da visita.
  const last = await db.get('SELECT * FROM events WHERE visitor=? ORDER BY ts DESC LIMIT 1', [visitor]);
  let s = last && now - last.ts <= SESSION_GAP ? last : null;
  if (!s) {
    let referrer = '';
    try { if (e.r) referrer = new URL(e.r).hostname.replace(/^www\./, '').slice(0, 253); } catch {}
    s = { session: randomBytes(8).toString('hex'), referrer };
    for (const k of UTM) s[k] = (url.searchParams.get(k) || '').trim().slice(0, 100);
    s.channel = channel(s);
  }

  let path = url.pathname; // query string nunca é gravada (só as UTMs acima)
  try { path = decodeURI(path); } catch {}
  let props = null;
  if (e.p && typeof e.p === 'object' && !Array.isArray(e.p)) {
    const entries = Object.entries(e.p).slice(0, 20).map(([k, v]) => [String(k).slice(0, 50), String(v).slice(0, 200)]);
    if (entries.length) props = JSON.stringify(Object.fromEntries(entries));
  }
  const v = typeof e.v === 'number' || (typeof e.v === 'string' && e.v.trim()) ? Number(e.v) : NaN;
  const { browser, os } = parseUA(ua);
  await db.run(INSERT, [site.id, localDate(now, site.timezone), now, visitor, s.session, name, path.slice(0, 512), s.referrer, s.channel,
    ...UTM.map(k => s[k]), screenClass(Number(e.w)), browser, os,
    /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : '??', props, v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : null]);
  return 202;
}
