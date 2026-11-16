import { db, awaitAll } from '../db.js';
import { localDate, tzOffset, addDays, buckets } from '../time.js';

export const SESSION_GAP = 30 * 60e3;

// ---------- filtros ----------
export const FILTERS = {
  path: 'Página', name: 'Evento', referrer: 'Referência', channel: 'Canal', utm_source: 'Fonte', utm_medium: 'Mídia',
  utm_campaign: 'Campanha', utm_content: 'Conteúdo', utm_term: 'Termo', country: 'País', screen: 'Dispositivo',
  browser: 'Navegador', os: 'Sistema',
};
export function filtersFrom(q) {
  const f = {};
  for (const k in FILTERS) if (q.has('f_' + k)) f[k] = q.get('f_' + k).slice(0, 512);
  return f;
}
/** WHERE para site + intervalo + filtros. Evento filtra visitas que dispararam o evento. */
function scope(site, { from, to }, f) {
  let sql = 'site=? AND date BETWEEN ? AND ?';
  const args = [site, from, to];
  for (const k in f) {
    if (k === 'name') { sql += ' AND session IN (SELECT session FROM events WHERE site=? AND date BETWEEN ? AND ? AND name=?)'; args.push(site, from, to, f[k]); }
    else { sql += ` AND ${k}=?`; args.push(f[k]); } // k vem da whitelist FILTERS
  }
  return [sql, args];
}
const all = db.all;
const PV = "name='pageview'";

// ---------- visão geral ----------
export async function totals(site, range, f = {}) {
  const [w, a] = scope(site, range, f);
  const [[t], [s], [r]] = await Promise.all([all(`SELECT COUNT(DISTINCT visitor) visitors, COUNT(*) pageviews FROM events WHERE ${w} AND ${PV}`, a),
    all(`SELECT COUNT(*) visits, COALESCE(SUM(CASE WHEN n = 1 THEN 1 ELSE 0 END), 0) bounces, COALESCE(SUM(d), 0) dur
    FROM (SELECT COUNT(*) n, MAX(ts) - MIN(ts) d FROM events WHERE ${w} AND ${PV} GROUP BY session)`, a),
    all(`SELECT COALESCE(SUM(revenue), 0) revenue FROM events WHERE ${w} AND revenue IS NOT NULL`, a)]);
  return {
    visitors: t.visitors, pageviews: t.pageviews, visits: s.visits,
    bounce: s.visits ? s.bounces / s.visits : null,
    duration: s.visits ? s.dur / s.visits / 1000 : null,
    revenue: r.revenue,
  };
}

export function top(site, range, f, col, { limit = 10, nonEmpty = false } = {}) {
  const [w, a] = scope(site, range, f);
  return all(`SELECT ${col} k, COUNT(DISTINCT visitor) v, COUNT(*) n FROM events WHERE ${w} AND ${PV}${nonEmpty ? ` AND ${col}<>''` : ''}
    GROUP BY k ORDER BY v DESC, n DESC LIMIT ${limit}`, a);
}

/** Páginas de entrada (ASC) ou saída (DESC); n = visitas */
function ends(site, range, f, dir) {
  const [w, a] = scope(site, range, f);
  return all(`SELECT path k, COUNT(DISTINCT visitor) v, COUNT(*) n FROM (SELECT path, visitor,
    ROW_NUMBER() OVER (PARTITION BY session ORDER BY ts ${dir}) r FROM events WHERE ${w} AND ${PV}) WHERE r = 1
    GROUP BY k ORDER BY n DESC LIMIT 10`, a);
}

function events(site, range, f) {
  const [w, a] = scope(site, range, f);
  return all(`SELECT name k, COUNT(DISTINCT visitor) v, COUNT(*) n, SUM(revenue) rev FROM events WHERE ${w} AND name<>'pageview'
    GROUP BY k ORDER BY n DESC LIMIT 20`, a);
}

function props(site, range, f) {
  const [w, a] = scope(site, range, f);
  return all(`SELECT j.key || ' = ' || j.value k, COUNT(DISTINCT x.visitor) v, COUNT(*) n
    FROM (SELECT visitor, props FROM events WHERE ${w} AND name=?) x, jsonb_each_text(x.props::jsonb) j GROUP BY k ORDER BY n DESC LIMIT 20`, [...a, f.name]);
}

/** Visitantes e visualizações por hora (1 dia), dia (≤92 dias) ou mês. */
export async function series(site, range, f, days) {
  const [w, a] = scope(site.id, range, f);
  let rows;
  if (days === 1) {
    const off = tzOffset(Date.parse(range.from) + 12 * 3600e3, site.timezone);
    rows = await all(`SELECT CAST((ts + ?) / 3600000 AS INTEGER) % 24 k, COUNT(DISTINCT visitor) v, COUNT(*) n FROM events WHERE ${w} AND ${PV} GROUP BY k`, [off, ...a]);
  } else {
    rows = await all(`SELECT ${days <= 92 ? 'date' : 'substr(date, 1, 7)'} k, COUNT(DISTINCT visitor) v, COUNT(*) n FROM events WHERE ${w} AND ${PV} GROUP BY k`, a);
  }
  const keys = buckets(range.from, range.to, days);
  const byKey = new Map(rows.map(r => [r.k, r]));
  return keys.map(([k, label]) => ({ k: String(k), label, v: byKey.get(k)?.v || 0, n: byKey.get(k)?.n || 0 }));
}

export async function online(site, now = Date.now()) {
  return (await all('SELECT COUNT(DISTINCT visitor) n FROM events WHERE site=? AND date>=? AND ts>=?',
    [site.id, addDays(localDate(now, site.timezone), -1), now - 5 * 60e3]))[0].n;
}

export function overview(site, p, f) {
  const t = (col, o) => top(site.id, p, f, col, o);
  return awaitAll({
    cur: totals(site.id, p, f), prev: p.prev && totals(site.id, p.prev, f),
    series: series(site, p, f, p.days), prevSeries: p.prev && series(site, p.prev, f, p.days),
    pages: t('path'), entry: ends(site.id, p, f, 'ASC'), exit: ends(site.id, p, f, 'DESC'),
    referrers: t('referrer'), channels: t('channel'),
    utm_source: t('utm_source', { nonEmpty: true }), utm_medium: t('utm_medium', { nonEmpty: true }),
    utm_campaign: t('utm_campaign', { nonEmpty: true }), utm_content: t('utm_content', { nonEmpty: true }),
    countries: t('country'), screens: t('screen'), browsers: t('browser'), oss: t('os'),
    events: events(site.id, p, f), props: f.name ? props(site.id, p, f) : null,
    online: online(site),
  });
}

export async function eventNames(site, range) {
  return (await all("SELECT DISTINCT name FROM events WHERE site=? AND date BETWEEN ? AND ? AND name<>'pageview' ORDER BY name", [site, range.from, range.to])).map(r => r.name);
}

// ---------- tempo real ----------
export async function realtime(site, now = Date.now()) {
  const since = now - 30 * 60e3, args = [site.id, addDays(localDate(now, site.timezone), -1), since];
  const W = 'site=? AND date>=? AND ts>=?';
  const perMin = new Map((await all(`SELECT CAST((ts - ?) / 60000 AS INTEGER) k, COUNT(*) n FROM events WHERE ${W} AND ${PV} GROUP BY k`, [since, ...args])).map(r => [r.k, r.n]));
  const g = col => all(`SELECT ${col} k, COUNT(DISTINCT visitor) v, COUNT(*) n FROM events WHERE ${W} AND ${PV} GROUP BY k ORDER BY v DESC LIMIT 8`, args);
  return awaitAll({
    online: online(site, now),
    visitors30: all(`SELECT COUNT(DISTINCT visitor) n FROM events WHERE ${W}`, args).then(r => r[0].n),
    perMin: Array.from({ length: 30 }, (_, i) => perMin.get(i) || 0),
    feed: all(`SELECT ts, name, path, referrer, country, screen, browser FROM events WHERE ${W} ORDER BY ts DESC LIMIT 25`, args),
    pages: g('path'), referrers: g('referrer'), countries: g('country'),
  });
}

// ---------- eventos (auditoria) ----------
/** Últimos eventos com os identificadores que vão para as plataformas de anúncio. */
export const recentEvents = (site, limit = 100) => all(`SELECT ts, name, path, channel, referrer, utm_source, utm_campaign, utm_content,
  visitor, rid, event_id, fbc, fbp, gclid, gbraid, wbraid, ttclid, revenue FROM events WHERE site=? ORDER BY ts DESC LIMIT ${limit}`, [site]);

// ---------- funis ----------
const globRe = g => new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
export function parseSteps(text) {
  return String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 10)
    .map(s => /^(evento|event):/i.test(s) ? { event: s.replace(/^\w+:\s*/, '').slice(0, 64) } : { path: s.slice(0, 512) });
}
/** Quantas visitas completaram cada passo, em ordem, dentro da mesma visita. */
export async function funnel(site, range, f, steps) {
  const [w, a] = scope(site, range, f);
  // ponytail: varre os eventos do período em JS; ok para tráfego pessoal, migrar para SQL se ficar lento.
  const rows = await all(`SELECT session, name, path FROM events WHERE ${w} ORDER BY session, ts`, a);
  const match = steps.map(s => {
    if (s.event) return r => r.name === s.event;
    const re = globRe(s.path);
    return r => r.name === 'pageview' && re.test(r.path);
  });
  const counts = steps.map(() => 0);
  let cur = null, i = 0;
  const flush = () => { for (let k = 0; k < i; k++) counts[k]++; };
  for (const r of rows) {
    if (r.session !== cur) { flush(); cur = r.session; i = 0; }
    if (i < steps.length && match[i](r)) i++;
  }
  flush();
  return counts;
}

// ---------- jornadas ----------
export const OTHER = '(outras)';
export async function journeys(site, range, f, depth = 5, width = 6) {
  const [w, a] = scope(site, range, f);
  const seqs = new Map();
  for (const r of await all(`SELECT session, path FROM events WHERE ${w} AND ${PV} ORDER BY session, ts`, a)) {
    const s = seqs.get(r.session) || seqs.set(r.session, []).get(r.session);
    if (s.length < depth && s.at(-1) !== r.path) s.push(r.path);
  }
  const cols = Array.from({ length: depth }, () => new Map());
  const paths = new Map();
  for (const s of seqs.values()) {
    s.forEach((p, i) => cols[i].set(p, (cols[i].get(p) || 0) + 1));
    const key = s.join(' → ');
    paths.set(key, (paths.get(key) || 0) + 1);
  }
  const keep = cols.map(m => new Set([...m].sort((x, y) => y[1] - x[1]).slice(0, width).map(e => e[0])));
  const nodes = Array.from({ length: depth }, () => new Map());
  const links = new Map();
  for (const s of seqs.values()) {
    const folded = s.map((p, i) => keep[i].has(p) ? p : OTHER);
    folded.forEach((p, i) => {
      nodes[i].set(p, (nodes[i].get(p) || 0) + 1);
      if (i) { const k = `${i - 1}\n${folded[i - 1]}\n${p}`; links.set(k, (links.get(k) || 0) + 1); }
    });
  }
  return {
    visits: seqs.size,
    cols: nodes.filter(m => m.size).map(m => [...m].map(([k, n]) => ({ k, n })).sort((x, y) => (x.k === OTHER) - (y.k === OTHER) || y.n - x.n)),
    links: [...links].map(([k, n]) => { const [i, from, to] = k.split('\n'); return { i: +i, from, to, n }; }),
    paths: [...paths].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, n]) => ({ k, n })),
  };
}

// ---------- atribuição ----------
export const ATTR_DIMS = { channel: 'Canal', referrer: 'Referência', utm_source: 'Fonte', utm_medium: 'Mídia', utm_campaign: 'Campanha' };
/**
 * Atribui cada conversão (evento) à origem da primeira visita do visitante no dia (primeiro clique)
 * e à última visita não-direta antes da conversão (último clique). O hash diário limita a janela a um dia.
 */
export async function attribution(site, range, f, event, dim) {
  const [w, a] = scope(site, range, f);
  const [sessions, conv, [t]] = await Promise.all([all(`SELECT * FROM (SELECT DISTINCT ON (session) visitor, session, ts start, ${dim} k, channel FROM events WHERE ${w} ORDER BY session, ts) x ORDER BY visitor, start`, a),
    all(`SELECT visitor, ts, revenue FROM events WHERE ${w} AND name=?`, [...a, event]),
    all(`SELECT COUNT(DISTINCT visitor) n FROM events WHERE ${w}`, a)]);
  const byVisitor = new Map();
  for (const s of sessions) (byVisitor.get(s.visitor) || byVisitor.set(s.visitor, []).get(s.visitor)).push(s);
  const first = new Map(), last = new Map();
  const add = (m, k, rev) => { const e = m.get(k) || m.set(k, { k, n: 0, rev: 0 }).get(k); e.n++; e.rev += rev || 0; };
  for (const c of conv) {
    const list = (byVisitor.get(c.visitor) || []).filter(s => s.start <= c.ts);
    if (!list.length) continue;
    add(first, list[0].k, c.revenue);
    add(last, (list.findLast(s => s.channel !== 'Direto') || list.at(-1)).k, c.revenue);
  }
  const sorted = m => [...m.values()].sort((x, y) => y.n - x.n || y.rev - x.rev);
  return {
    conversions: conv.length, revenue: conv.reduce((s, c) => s + (c.revenue || 0), 0),
    converters: new Set(conv.map(c => c.visitor)).size, visitors: t.n,
    first: sorted(first), last: sorted(last),
  };
}
