// Integração com a Meta: leitura de campanhas/gastos (Marketing API) e envio de compras (Conversions API).
// Somente leitura nas contas de anúncio: o token precisa apenas de `ads_read`.
import { createHash } from 'node:crypto';
import { db, env, sites } from '../db.js';
import { localDate, addDays } from '../time.js';

const graph = () => `https://graph.facebook.com/${env.META_API_VERSION || 'v23.0'}`;
const hash = v => createHash('sha256').update(v).digest('hex');

async function getAll(url) {
  const out = [];
  for (let next = url, page = 0; next && page < 50; page++) {
    const res = await fetch(next);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error?.message || `HTTP ${res.status}`);
    out.push(...(j.data || []));
    next = j.paging?.next;
  }
  return out;
}

// A Meta reporta a mesma compra em vários action_types (omni_purchase agrega site + app + loja; purchase;
// offsite_conversion.fb_pixel_purchase). Usa o primeiro presente, na ordem, para não contar duas vezes.
const PURCHASE = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];
const LEAD = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
export function action(list, types) {
  for (const t of types) { const a = (list || []).find(x => x.action_type === t); if (a) return Number(a.value) || 0; }
  return 0;
}

const budget = e => e.daily_budget ? Number(e.daily_budget) / 100 : e.lifetime_budget ? Number(e.lifetime_budget) / 100 : null; // centavos

/**
 * Sincroniza campanhas, conjuntos, anúncios, gasto diário e as conversões que a Meta reporta (compras, valor, leads,
 * na janela de atribuição configurada na conta). 30 dias na primeira vez, depois os últimos 3.
 */
export async function syncMeta(acc, days = acc.last_sync ? 3 : 30) {
  const site = sites.get(acc.site);
  const until = localDate(Date.now(), site.timezone), since = addDays(until, -(days - 1));
  const act = acc.account_id.replace(/^act_/, '');
  const url = (path, params = {}) => `${graph()}/act_${act}${path}?` + new URLSearchParams({ limit: '500', ...params, access_token: acc.token });
  try {
    const info = await fetch(url('', { fields: 'name,currency' })).then(r => r.json());
    if (info.error) throw new Error(info.error.message);
    const [campaigns, adsets, ads, insights] = await Promise.all([
      getAll(url('/campaigns', { fields: 'id,name,effective_status,daily_budget,lifetime_budget' })),
      getAll(url('/adsets', { fields: 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget' })),
      getAll(url('/ads', { fields: 'id,name,adset_id,effective_status' })),
      getAll(url('/insights', {
        level: 'ad', time_increment: '1', time_range: JSON.stringify({ since, until }),
        fields: 'date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values',
      })),
    ]);
    const ENT = `INSERT INTO ad_entities(site, platform, level, id, name, parent, status, budget) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(site, platform, level, id) DO UPDATE SET name=excluded.name, parent=excluded.parent, status=excluded.status, budget=excluded.budget`;
    const SPEND = `INSERT INTO ad_spend(site, platform, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, impressions, clicks,
      meta_purchases, meta_purchase_value, meta_leads, source) VALUES (?,'meta',?,?,?,?,?,?,?,?,?,?,?,?,?,'api')
      ON CONFLICT(site, platform, date, campaign_id, adset_id, ad_id) DO UPDATE SET campaign_name=excluded.campaign_name, adset_name=excluded.adset_name,
      ad_name=excluded.ad_name, spend=excluded.spend, impressions=excluded.impressions, clicks=excluded.clicks, meta_purchases=excluded.meta_purchases,
      meta_purchase_value=excluded.meta_purchase_value, meta_leads=excluded.meta_leads, source=excluded.source`;
    await db.batch([ // uma transação: ou grava tudo ou nada
      ...campaigns.map(c => [ENT, [site.id, 'meta', 'campaign', c.id, c.name || '', '', c.effective_status || '', budget(c)]]),
      ...adsets.map(a => [ENT, [site.id, 'meta', 'adset', a.id, a.name || '', a.campaign_id || '', a.effective_status || '', budget(a)]]),
      ...ads.map(a => [ENT, [site.id, 'meta', 'ad', a.id, a.name || '', a.adset_id || '', a.effective_status || '', null]]),
      ...insights.map(i => [SPEND, [site.id, i.date_start, i.campaign_id || '', i.campaign_name || '', i.adset_id || '', i.adset_name || '', i.ad_id || '', i.ad_name || '',
        Number(i.spend) || 0, Number(i.impressions) || 0, Number(i.clicks) || 0,
        action(i.actions, PURCHASE), action(i.action_values, PURCHASE), action(i.actions, LEAD)]]),
      ['UPDATE ad_accounts SET last_sync=?, last_error=NULL, name=?, currency=? WHERE id=?', [Date.now(), info.name || '', info.currency || '', acc.id]],
    ]);
    return { campaigns: campaigns.length, rows: insights.length };
  } catch (e) {
    await db.run('UPDATE ad_accounts SET last_error=? WHERE id=?', [e.message.slice(0, 300), acc.id]);
    throw e;
  }
}

/**
 * Envia uma compra aprovada para a Conversions API (rastreamento server-side).
 * E-mail/telefone chegam do webhook, são normalizados e enviados só em SHA-256; nada disso é gravado.
 * Retorna false quando não há identificador do comprador (a Meta exige ao menos um).
 */
export async function sendCapi(site, sale, { email, phone } = {}, now = Date.now()) {
  const user_data = {};
  if (email) user_data.em = [hash(String(email).trim().toLowerCase())];
  if (phone) user_data.ph = [hash(String(phone).replace(/\D/g, ''))];
  if (!Object.keys(user_data).length) return false;
  const ts = now - sale.ts > 6 * 864e5 ? now : sale.ts; // a Meta recusa eventos com mais de 7 dias
  const body = {
    data: [{
      event_name: 'Purchase', event_time: Math.floor(ts / 1000), event_id: `${sale.platform}-${sale.order_id}`, action_source: 'website',
      user_data, custom_data: { currency: sale.currency || site.currency, value: sale.gross, content_name: sale.product || undefined, order_id: sale.order_id },
    }],
  };
  const res = await fetch(`${graph()}/${encodeURIComponent(site.meta_pixel)}/events?access_token=${encodeURIComponent(site.meta_capi_token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

export const STATUS_PT = s => /^ACTIVE$/.test(s) ? 'Ativo' : /PAUSED/.test(s) ? 'Pausado' : /DELETED|ARCHIVED/.test(s) ? 'Arquivado'
  : /ISSUES|DISAPPROVED/.test(s) ? 'Com problema' : /IN_PROCESS|PENDING/.test(s) ? 'Em análise' : s ? s.toLowerCase() : '—';
