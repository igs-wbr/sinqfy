// Métricas de vendas e anúncios. Definições (iguais às de docs/SPEC.md):
//   faturamento líquido = soma de `net` das vendas aprovadas (o que a plataforma repassa)
//   imposto = faturamento bruto aprovado × alíquota do site
//   lucro = líquido − gastos com anúncios − imposto      margem = lucro / líquido
//   ROAS = líquido / gastos     ROI = lucro / gastos     CPA = gastos / vendas aprovadas
//   ROAS (Meta) = valor de compra reportado pela Meta / gastos   (atribuição da Meta, não vendas confirmadas)
import { db } from '../db.js';
import { tzOffset, buckets } from '../time.js';
import { STATUS_PT } from '../ads/meta.js';
import { buildFunnel, siteStages } from './funnel.js';
import { CHECKOUT_SQL } from '../tracking/stats.js';

export const SALE_FILTERS = { platform: 'Plataforma', product: 'Produto', utm_source: 'Fonte', status: 'Status', method: 'Pagamento' };
export function saleFiltersFrom(q) {
  const f = {};
  for (const k in SALE_FILTERS) if (q.get('f_' + k)) f[k] = q.get('f_' + k).slice(0, 200);
  return f;
}
function scope(site, { from, to }, f = {}, { status = true } = {}) {
  let sql = 'site=? AND date BETWEEN ? AND ?';
  const args = [site, from, to];
  for (const k in f) if (status || k !== 'status') { sql += ` AND ${k}=?`; args.push(f[k]); } // k vem da whitelist SALE_FILTERS
  return [sql, args];
}
const div = (a, b) => b ? a / b : null;

export const spendTotal = (site, { from, to }) =>
  db.get(`SELECT COALESCE(SUM(spend), 0) s, COALESCE(SUM(impressions), 0) i, COALESCE(SUM(clicks), 0) c, COALESCE(SUM(meta_purchases), 0) mp,
    COALESCE(SUM(meta_purchase_value), 0) mv, COALESCE(SUM(meta_leads), 0) ml FROM ad_spend WHERE site=? AND date BETWEEN ? AND ?`, [site, from, to]);

export async function salesTotals(site, range, f = {}) {
  const [w, a] = scope(site.id, range, f, { status: false });
  const [t, sp] = await Promise.all([db.get(`SELECT
      COUNT(CASE WHEN status='paid' THEN 1 END) paid, COALESCE(SUM(CASE WHEN status='paid' THEN gross END), 0) gross,
      COALESCE(SUM(CASE WHEN status='paid' THEN net END), 0) net,
      COUNT(CASE WHEN status='pending' THEN 1 END) pending, COALESCE(SUM(CASE WHEN status='pending' THEN gross END), 0) pending_value,
      COUNT(CASE WHEN status='refunded' THEN 1 END) refunded, COALESCE(SUM(CASE WHEN status='refunded' THEN gross END), 0) refunded_value,
      COUNT(CASE WHEN status='chargeback' THEN 1 END) chargeback, COUNT(CASE WHEN status='refused' THEN 1 END) refused, COUNT(*) total
    FROM sales WHERE ${w}`, a), spendTotal(site.id, range)]);
  const tax = t.gross * (site.tax_rate || 0) / 100, profit = t.net - sp.s - tax, closed = t.paid + t.refunded + t.chargeback;
  return {
    ...t, spend: sp.s, impressions: sp.i, clicks: sp.c, tax, profit,
    metaPurchases: sp.mp, metaValue: sp.mv, metaLeads: sp.ml, metaRoas: div(sp.mv, sp.s), metaCpa: div(sp.s, sp.mp),
    roas: div(t.net, sp.s), roi: div(profit, sp.s), margin: div(profit, t.net), cpa: div(sp.s, t.paid), ticket: div(t.net, t.paid),
    refund_rate: div(t.refunded, closed), chargeback_rate: div(t.chargeback, closed),
  };
}

/** Faturamento líquido (vendas aprovadas) e gastos por hora/dia/mês. Gastos não existem por hora. */
export async function salesSeries(site, range, f, days) {
  const [w, a] = scope(site.id, range, f, { status: false });
  let rev, spend = new Map();
  if (days === 1) {
    const off = tzOffset(Date.parse(range.from) + 12 * 3600e3, site.timezone);
    rev = await db.all(`SELECT CAST((ts + ?) / 3600000 AS INTEGER) % 24 k, SUM(net) v, COUNT(*) n FROM sales WHERE ${w} AND status='paid' GROUP BY k`, [off, ...a]);
  } else {
    const k = days <= 92 ? 'date' : 'substr(date, 1, 7)';
    const [r, s] = await Promise.all([
      db.all(`SELECT ${k} k, SUM(net) v, COUNT(*) n FROM sales WHERE ${w} AND status='paid' GROUP BY k`, a),
      db.all(`SELECT ${k} k, SUM(spend) v FROM ad_spend WHERE site=? AND date BETWEEN ? AND ? GROUP BY k`, [site.id, range.from, range.to]),
    ]);
    rev = r; spend = new Map(s.map(x => [x.k, x.v]));
  }
  const byKey = new Map(rev.map(r => [r.k, r]));
  return buckets(range.from, range.to, days).map(([k, label]) => ({ k: String(k), label, v: byKey.get(k)?.v || 0, n: byKey.get(k)?.n || 0, s: spend.get(k) || 0 }));
}

/** Marcações do gráfico: campanha que começou a gastar ou parou de gastar dentro do período (dias com gasto > 0). */
export async function campaignMarks(site, range) {
  const rows = await db.all(`SELECT MAX(campaign_name) name, MIN(date) a, MAX(date) b, (SELECT MAX(date) FROM ad_spend WHERE site=? AND spend>0) last
    FROM ad_spend WHERE site=? AND spend>0 GROUP BY campaign_id`, [site.id, site.id]);
  const out = [];
  for (const r of rows) {
    const name = r.name || 'campanha sem nome';
    if (r.a >= range.from && r.a <= range.to) out.push({ k: r.a, text: `Começou: ${name}` });
    if (r.b !== r.a && r.b >= range.from && r.b < range.to && r.b < r.last) out.push({ k: r.b, text: `Último dia com gasto: ${name}` });
  }
  return out;
}

// Chave da campanha numa UTM "Nome|id" (a do template); sem "|", o próprio texto. Mesma regra de adKey() dos webhooks.
const keyOf = col => `COALESCE(substring(split_part(${col}, '::', 1) from '\\|\\s*([A-Za-z0-9_-]+)\\s*$'), btrim(split_part(${col}, '::', 1)))`;const UTM_KEY = keyOf('utm_campaign');

/** Dados do funil dos anúncios da Meta (uma campanha ou todas), cruzando a Meta com os nossos eventos e vendas. Ver src/sales/funnel.js. */
export async function adFunnel(site, range, campaign = null) {
  const only = campaign ? ' AND campaign_id=?' : '';
  const base = [site.id, range.from, range.to, ...(campaign ? [campaign] : [])];
  const [meta, camps, tracking, webhooks] = await Promise.all([
    db.get(`SELECT SUM(impressions) imp, SUM(clicks) clicks, SUM(meta_link_clicks) link, SUM(meta_lpv) lpv, SUM(meta_checkouts) ic, SUM(meta_purchases) buy, SUM(spend) spend
      FROM ad_spend WHERE site=? AND platform='meta' AND date BETWEEN ? AND ?${only}`, base),
    db.all(`SELECT DISTINCT campaign_id, campaign_name FROM ad_spend WHERE site=? AND platform='meta' AND date BETWEEN ? AND ?${only}`, base),
    db.get('SELECT 1 FROM events WHERE site=? AND date BETWEEN ? AND ? LIMIT 1', [site.id, range.from, range.to]),
    db.get('SELECT 1 FROM sales WHERE site=? LIMIT 1', [site.id]),
  ]);
  // Venda e visita casam com a campanha pelo id da UTM ou, sem id, pelo nome.
  const keys = [...new Set(camps.flatMap(c => [c.campaign_id, c.campaign_name]).filter(Boolean))];
  const [own, sales] = keys.length ? await Promise.all([
    db.get(`SELECT COUNT(*) visits, COUNT(*) FILTER (WHERE pv > 1 OR ev > 0) engaged, COUNT(*) FILTER (WHERE co > 0) checkout
      FROM (SELECT visitor, COUNT(*) FILTER (WHERE name='pageview') pv, COUNT(*) FILTER (WHERE name<>'pageview') ev,
        COUNT(*) FILTER (WHERE ${CHECKOUT_SQL}) co
        FROM events WHERE site=? AND date BETWEEN ? AND ?
          AND visitor IN (SELECT visitor FROM events WHERE site=? AND date BETWEEN ? AND ? AND name='pageview' AND ${UTM_KEY} = ANY(?))
        GROUP BY visitor) x`, [site.id, range.from, range.to, site.id, range.from, range.to, keys]),
    db.get("SELECT COUNT(*) n FROM sales WHERE site=? AND date BETWEEN ? AND ? AND status='paid' AND campaign_key = ANY(?)", [site.id, range.from, range.to, keys]),
  ]) : [{}, {}];
  return { stages: buildFunnel(meta || {}, own, sales, { tracking: !!tracking, webhooks: !!webhooks }), spend: Number(meta?.spend) || 0 };
}

/** Funil completo do site no período (tela Funis). Ver siteStages em src/sales/funnel.js. */
export async function siteFunnel(site, range) {
  // Script instalado no meio do período: todas as etapas começam no primeiro dia com evento, senão a taxa mistura períodos.
  const first = (await db.get('SELECT min(date) d FROM events WHERE site=?', [site.id]))?.d;
  const since = first && first > range.from && first <= range.to ? first : null;
  const a = [site.id, since || range.from, range.to];
  const [meta, own, sales] = await Promise.all([
    db.get(`SELECT SUM(impressions) imp, SUM(clicks) clicks, SUM(meta_link_clicks) link, SUM(meta_purchases) buy, SUM(spend) spend
      FROM ad_spend WHERE site=? AND platform='meta' AND date BETWEEN ? AND ?`, a),
    db.get(`SELECT COUNT(*) visits, COUNT(*) FILTER (WHERE ad > 0) ads, COUNT(*) FILTER (WHERE pv > 1 OR ev > 0) engaged, COUNT(*) FILTER (WHERE co > 0) checkout
      FROM (SELECT visitor, COUNT(*) FILTER (WHERE name='pageview') pv, COUNT(*) FILTER (WHERE name<>'pageview') ev,
        COUNT(*) FILTER (WHERE ${CHECKOUT_SQL}) co, COUNT(*) FILTER (WHERE utm_campaign<>'') ad
        FROM events WHERE site=? AND date BETWEEN ? AND ? GROUP BY visitor) x`, a),
    db.get(`SELECT COUNT(DISTINCT COALESCE(rid, platform || '-' || order_id)) buyers, COUNT(*) orders, SUM(gross) revenue
      FROM sales WHERE site=? AND date BETWEEN ? AND ? AND status='paid'`, a),
  ]);
  return { ...siteStages(meta || {}, own || {}, sales || {}), since };
}

// ---------- sequência de anúncios até a compra (aba Atribuição) ----------
const DAY = 864e5, LOOKBACK = 30 * DAY, SAME_CHECKOUT = 2 * 3600e3;
/**
 * Para cada compra no período, os anúncios em que o mesmo visitante (rid) clicou nos 30 dias antes, na ordem do primeiro
 * clique em cada um; o anúncio da UTM da venda fecha a sequência. Impressão sem clique só a Meta vê, e não por pessoa:
 * ela entra só como total por anúncio. Order bump e upsell do mesmo rid em até 2 h são uma compra só.
 */
export async function adSequences(site, range) {
  const a = [site.id, range.from, range.to];
  const first = (await db.get('SELECT min(date) d FROM events WHERE site=?', [site.id]))?.d;
  const since = first && first > range.from && first <= range.to ? first : null;
  const [rows, ents, spend, seen] = await Promise.all([
    db.all(`SELECT x.id, x.ts, x.gross, x.rid, x.ad_key, t.k, t.at,
        EXISTS (SELECT 1 FROM events e WHERE e.site=x.site AND e.rid=x.rid AND e.ts BETWEEN x.ts - ${LOOKBACK} AND x.ts + 60000) tracked FROM sales x
      LEFT JOIN LATERAL (SELECT ${keyOf('e.utm_content')} k, MIN(e.ts) at FROM events e
        WHERE e.site=x.site AND e.rid=x.rid AND e.ts BETWEEN x.ts - ${LOOKBACK} AND x.ts + 60000 AND e.utm_content<>'' GROUP BY 1) t ON true
      WHERE x.site=? AND x.date BETWEEN ? AND ? AND x.status='paid' ORDER BY x.ts, x.id, t.at`, a),
    db.all("SELECT id, name, thumb FROM ad_entities WHERE site=? AND level='ad'", [site.id]),
    db.all("SELECT ad_id id, MAX(ad_name) name, SUM(impressions) imp FROM ad_spend WHERE site=? AND date BETWEEN ? AND ? AND ad_id<>'' GROUP BY ad_id", a),
    db.all(`SELECT ${keyOf('utm_content')} k, COUNT(DISTINCT COALESCE(rid, visitor)) n FROM events WHERE site=? AND date BETWEEN ? AND ? AND utm_content<>'' GROUP BY 1`, a),
  ]);
  const info = new Map();
  for (const e of ents) info.set(e.id, { name: e.name || e.id, thumb: e.thumb || null, imp: 0 });
  for (const s of spend) Object.assign(info.get(s.id) || info.set(s.id, { name: s.name || s.id, thumb: null }).get(s.id), { imp: Number(s.imp) || 0 });
  const isAd = k => !!k && (info.has(k) || /^\d{6,}$/.test(k)); // "link-bio" ou "{{ad.id}}" não são anúncios

  const sales = new Map();
  for (const r of rows) {
    const x = sales.get(r.id) || sales.set(r.id, { ts: Number(r.ts), gross: Number(r.gross) || 0, rid: r.rid, key: r.ad_key, tracked: !!r.tracked, seq: [] }).get(r.id);
    if (isAd(r.k)) x.seq.push({ k: r.k, at: Number(r.at) });
  }
  const buys = [], lastBy = new Map();
  for (const x of sales.values()) {
    const prev = x.rid && lastBy.get(x.rid);
    if (prev && x.ts - prev.ts < SAME_CHECKOUT) { prev.gross += x.gross; prev.orders++; continue; }
    const b = { ...x, orders: 1, via: !isAd(x.key) && x.key ? x.key : null };
    // Só há sequência se o script viu a pessoa antes (venda anterior ao script ou sem rid não tem caminho para mostrar).
    if (x.tracked && isAd(x.key) && b.seq.at(-1)?.k !== x.key) b.seq.push({ k: x.key, at: x.ts }); // voltou ou comprou pelo anúncio da UTM
    buys.push(b);
    if (x.rid) lastBy.set(x.rid, b);
  }

  const ads = new Map(), paths = new Map(), singles = new Map(); // singles: clicou num anúncio só e comprou
  const ad = k => ads.get(k) || ads.set(k, { k, imp: info.get(k)?.imp || 0, seen: 0, journeys: 0, first: 0, middle: 0, last: 0, revenue: 0 }).get(k);
  for (const s of seen) if (isAd(s.k)) ad(s.k).seen = Number(s.n);
  const withSeq = buys.filter(b => b.seq.length);
  for (const b of withSeq) {
    const keys = b.seq.map(s => s.k);
    for (const k of new Set(keys)) ad(k).journeys++;
    ad(keys[0]).first++;
    const end = ad(keys.at(-1)); end.last++; end.revenue += b.gross;
    for (const k of new Set(keys.slice(1, -1))) if (k !== keys[0] && k !== keys.at(-1)) ad(k).middle++;
    if (keys.length === 1) { const one = singles.get(keys[0]) || singles.set(keys[0], { k: keys[0], n: 0, revenue: 0, days: 0 }).get(keys[0]); one.n++; one.revenue += b.gross; one.days += (b.ts - b.seq[0].at) / DAY; continue; }
    const path = keys.slice(-6).join('>'), pa = paths.get(path) || paths.set(path, { keys: keys.slice(-6), n: 0, revenue: 0 }).get(path);
    pa.n++; pa.revenue += b.gross;
  }
  const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  return {
    purchases: buys.length, withSeq: withSeq.length, since,
    avgAds: mean(withSeq.map(b => b.seq.length)), avgDays: mean(withSeq.map(b => (b.ts - b.seq[0].at) / DAY)),
    single: withSeq.length ? withSeq.filter(b => b.seq.length === 1).length / withSeq.length : null,
    ads: [...ads.values()].filter(x => x.journeys || x.seen).sort((x, y) => y.last - x.last || y.journeys - x.journeys || y.seen - x.seen).slice(0, 40),
    paths: [...paths.values()].sort((x, y) => y.n - x.n || y.keys.length - x.keys.length || y.revenue - x.revenue).slice(0, 8),
    singles: [...singles.values()].sort((x, y) => y.n - x.n || y.revenue - x.revenue),
    multi: withSeq.filter(b => b.seq.length > 1).length,
    recent: withSeq.filter(b => b.seq.length > 1).slice(-25).reverse(),
    info: Object.fromEntries([...info].map(([k, v]) => [k, { name: v.name, thumb: v.thumb }])),
  };
}

export function byMethod(site, range, f) {
  const [w, a] = scope(site.id, range, f, { status: false });
  return db.all(`SELECT method k, COUNT(*) n, SUM(net) v FROM sales WHERE ${w} AND status='paid' GROUP BY method ORDER BY v DESC`, a);
}

export function topSales(site, range, f, col, limit = 8) {
  const [w, a] = scope(site.id, range, f, { status: false });
  return db.all(`SELECT ${col} k, COUNT(*) n, SUM(net) v FROM sales WHERE ${w} AND status='paid' GROUP BY k ORDER BY v DESC LIMIT ${limit}`, a);
}

export async function orders(site, range, f, page = 0, size = 50) {
  const [w, a] = scope(site.id, range, f);
  const [rows, products] = await Promise.all([
    db.all(`SELECT * FROM sales WHERE ${w} ORDER BY ts DESC LIMIT ${size + 1} OFFSET ${page * size}`, a),
    db.all("SELECT DISTINCT product FROM sales WHERE site=? AND product<>'' ORDER BY product", [site.id]),
  ]);
  return { rows, products: products.map(r => r.product) };
}

const LEVELS = { campaign: 'campaign', adset: 'adset', ad: 'ad' };
// Coluna da UTM de cada nível no template "Nome|id" (UTM_TEMPLATE): campanha, conjunto (medium) e anúncio (content).
const LEVEL_UTM = { campaign: 'campaign', adset: 'medium', ad: 'content' };
export const LEVEL_PT = { campaign: 'Campanhas', adset: 'Conjuntos', ad: 'Anúncios' };

/** Ids de conjuntos ou anúncios dentro de uma campanha ou conjunto: pela hierarquia da Meta e pelo gasto (cobre o que já saiu da conta). */
async function inScope(site, level, scope, campaign) {
  const [ents, spent] = await Promise.all([
    db.all("SELECT level, id, parent FROM ad_entities WHERE site=? AND platform='meta' AND level IN ('adset','ad')", [site]),
    db.all(`SELECT DISTINCT ${level}_id id FROM ad_spend WHERE site=? AND platform='meta' AND ${scope.col}=?`, [site, scope.id]),
  ]);
  const ids = new Set(spent.map(r => r.id));
  const sets = new Set(scope.col === 'adset_id' ? [scope.id] : ents.filter(e => e.level === 'adset' && e.parent === campaign).map(e => e.id));
  for (const e of ents) if (e.level === level && (level === 'adset' ? e.parent === scope.id : sets.has(e.parent))) ids.add(e.id);
  return ids;
}

/**
 * Tabela de campanhas/conjuntos/anúncios: gasto + entidades da Meta cruzados com as vendas aprovadas
 * pela chave da UTM (id do template "nome|id", ou o próprio nome).
 */
export async function campaigns(site, range, level = 'campaign', { campaign = null, adset = null } = {}) {
  const L = LEVELS[level] || 'campaign';
  // Navegação como na Meta: conjuntos da campanha escolhida, anúncios do conjunto (ou da campanha) escolhido.
  const scope = L === 'adset' ? (campaign ? { col: 'campaign_id', id: campaign } : null) : L === 'ad' ? (adset ? { col: 'adset_id', id: adset } : campaign ? { col: 'campaign_id', id: campaign } : null) : null;
  const allowed = scope && await inScope(site.id, L, scope, campaign);
  const U = LEVEL_UTM[L], W = "x.site=? AND x.date BETWEEN ? AND ? AND x.status='paid'", wa = [site.id, range.from, range.to];
  const [entities, spends, salesRows, firstRows, touchRows] = await Promise.all([
    db.all('SELECT * FROM ad_entities WHERE site=? AND level=?', [site.id, L]),
    db.all(`SELECT platform, ${L}_id id, MAX(${L}_name) name, SUM(spend) spend, SUM(impressions) imp, SUM(clicks) clicks,
        SUM(meta_purchases) mp, SUM(meta_purchase_value) mv, SUM(meta_leads) ml
      FROM ad_spend WHERE site=? AND date BETWEEN ? AND ? AND ${L}_id<>'' GROUP BY platform, ${L}_id`, [site.id, range.from, range.to]),
    db.all(`SELECT ${L}_key k, COUNT(*) n, SUM(net) net, SUM(gross) gross FROM sales WHERE site=? AND date BETWEEN ? AND ? AND status='paid' GROUP BY k`,
      [site.id, range.from, range.to]),
    // Abriu: a venda cujo primeiro toque pago foi este anúncio (ADR 0018).
    db.all(`SELECT ${keyOf('x.ft_' + U)} k, COUNT(*) n FROM sales x WHERE ${W} AND x.ft_campaign<>'' GROUP BY k`, wa),
    // Participou: o anúncio aparece em alguma visita do mesmo rid nos 30 dias antes da venda, ou é a origem da própria venda.
    db.all(`SELECT t.k, COUNT(*) n FROM sales x CROSS JOIN LATERAL (
        SELECT ${keyOf('e.utm_' + U)} k FROM events e WHERE e.site=x.site AND e.rid=x.rid AND e.ts BETWEEN x.ts - ${30 * 864e5} AND x.ts + 60000 AND e.utm_campaign<>''
        UNION SELECT x.${L}_key) t WHERE ${W} AND t.k<>'' GROUP BY t.k`, wa),
  ]);
  const rows = new Map();
  const row = (plat, id) => {
    const k = plat + '\n' + id;
    if (!rows.has(k)) rows.set(k, { platform: plat, id, name: id, status: '', budget: null, spend: 0, impressions: 0, clicks: 0, sales: 0, net: 0, gross: 0, metaPurchases: 0, metaValue: 0, metaLeads: 0 });
    return rows.get(k);
  };
  for (const e of entities) {
    if (/DELETED|ARCHIVED/.test(e.status)) continue;
    Object.assign(row(e.platform, e.id), { name: e.name || e.id, status: e.status, budget: e.budget, thumb: e.thumb || null, parent: e.parent || null });
  }
  for (const s of spends) {
    const r = row(s.platform, s.id);
    Object.assign(r, { spend: s.spend, impressions: s.imp, clicks: s.clicks, metaPurchases: s.mp, metaValue: s.mv, metaLeads: s.ml });
    if (r.name === r.id && s.name) r.name = s.name;
  }
  // Só mostra entidades com gasto no período ou ativas (pausadas sem gasto são ruído); com campanha ou conjunto escolhido, só os de dentro.
  for (const [k, r] of rows) if ((!r.spend && r.status !== 'ACTIVE') || (allowed && !allowed.has(r.id))) rows.delete(k);

  const byKey = new Map(salesRows.map(s => [s.k, s])), firstBy = new Map(firstRows.map(s => [s.k, s.n])), touchBy = new Map(touchRows.map(s => [s.k, s.n]));
  const used = new Set();
  for (const r of rows.values()) {
    const s = byKey.get(r.id) || byKey.get(r.name);
    if (s) { used.add(s.k); Object.assign(r, { sales: s.n, net: s.net, gross: s.gross }); }
    r.first = firstBy.get(r.id) ?? firstBy.get(r.name) ?? 0;
    r.touched = touchBy.get(r.id) ?? touchBy.get(r.name) ?? 0;
  }
  const out = [...rows.values()];
  for (const s of byKey.values()) {
    if (used.has(s.k) || allowed) continue; // venda sem anúncio conhecido não pertence a campanha nenhuma
    out.push({ platform: '', id: s.k, name: s.k || 'Sem UTM (orgânico, direto ou não rastreado)', unmatched: true, status: '', budget: null,
      spend: 0, impressions: 0, clicks: 0, sales: s.n, net: s.net, gross: s.gross, metaPurchases: 0, metaValue: 0, metaLeads: 0, first: firstBy.get(s.k) ?? 0, touched: touchBy.get(s.k) ?? 0 });
  }
  const rate = (site.tax_rate || 0) / 100;
  for (const r of out) {
    r.profit = r.net - r.spend - r.gross * rate;
    Object.assign(r, { cpa: r.spend ? div(r.spend, r.sales) : null, roas: div(r.net, r.spend), roi: div(r.profit, r.spend), ctr: div(r.clicks, r.impressions), metaRoas: div(r.metaValue, r.spend), statusPt: STATUS_PT(r.status) });
  }
  // Anúncios: os que mais venderam primeiro. Campanhas e conjuntos: os que mais gastaram.
  return out.sort(L === 'ad' ? (x, y) => y.sales - x.sales || y.net - x.net || y.spend - x.spend : (x, y) => y.spend - x.spend || y.net - x.net);
}

export const lastWebhooks = (site, limit = 8) => db.all('SELECT * FROM webhook_log WHERE site=? ORDER BY id DESC LIMIT ?', [site, limit]);
