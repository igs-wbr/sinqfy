// Integração com a Meta: leitura de campanhas/gastos (Marketing API). O envio server-side fica em src/dispatch.js.
// Somente leitura nas contas de anúncio: o token precisa apenas de `ads_read`.
import { db, env, sites } from '../db.js';
import { localDate, addDays } from '../time.js';

const graph = () => `https://graph.facebook.com/${env.META_API_VERSION || 'v23.0'}`;

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
const LPV = ['omni_landing_page_view', 'landing_page_view'];
const ATC = ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'];
const CHECKOUT = ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'];
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
        fields: 'date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions,action_values',
      })),
    ]);
    const ENT = `INSERT INTO ad_entities(site, platform, level, id, name, parent, status, budget) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(site, platform, level, id) DO UPDATE SET name=excluded.name, parent=excluded.parent, status=excluded.status, budget=excluded.budget`;
    const SPEND = `INSERT INTO ad_spend(site, platform, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, impressions, clicks,
      meta_purchases, meta_purchase_value, meta_leads, meta_link_clicks, meta_lpv, meta_atc, meta_checkouts, source) VALUES (?,'meta',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'api')
      ON CONFLICT(site, platform, date, campaign_id, adset_id, ad_id) DO UPDATE SET campaign_name=excluded.campaign_name, adset_name=excluded.adset_name,
      ad_name=excluded.ad_name, spend=excluded.spend, impressions=excluded.impressions, clicks=excluded.clicks, meta_purchases=excluded.meta_purchases,
      meta_purchase_value=excluded.meta_purchase_value, meta_leads=excluded.meta_leads, meta_link_clicks=excluded.meta_link_clicks, meta_lpv=excluded.meta_lpv,
      meta_atc=excluded.meta_atc, meta_checkouts=excluded.meta_checkouts, source=excluded.source`;
    await db.batch([ // uma transação: ou grava tudo ou nada
      ...campaigns.map(c => [ENT, [site.id, 'meta', 'campaign', c.id, c.name || '', '', c.effective_status || '', budget(c)]]),
      ...adsets.map(a => [ENT, [site.id, 'meta', 'adset', a.id, a.name || '', a.campaign_id || '', a.effective_status || '', budget(a)]]),
      ...ads.map(a => [ENT, [site.id, 'meta', 'ad', a.id, a.name || '', a.adset_id || '', a.effective_status || '', null]]),
      ...insights.map(i => [SPEND, [site.id, i.date_start, i.campaign_id || '', i.campaign_name || '', i.adset_id || '', i.adset_name || '', i.ad_id || '', i.ad_name || '',
        Number(i.spend) || 0, Number(i.impressions) || 0, Number(i.clicks) || 0,
        action(i.actions, PURCHASE), action(i.action_values, PURCHASE), action(i.actions, LEAD),
        Number(i.inline_link_clicks) || 0, action(i.actions, LPV), action(i.actions, ATC), action(i.actions, CHECKOUT)]]),
      ['UPDATE ad_accounts SET last_sync=?, last_error=NULL, name=?, currency=? WHERE id=?', [Date.now(), info.name || '', info.currency || '', acc.id]],
    ]);
    return { campaigns: campaigns.length, rows: insights.length };
  } catch (e) {
    await db.run('UPDATE ad_accounts SET last_error=? WHERE id=?', [e.message.slice(0, 300), acc.id]);
    throw e;
  }
}

export const STATUS_PT = s => /^ACTIVE$/.test(s) ? 'Ativo' : /PAUSED/.test(s) ? 'Pausado' : /DELETED|ARCHIVED/.test(s) ? 'Arquivado'
  : /ISSUES|DISAPPROVED/.test(s) ? 'Com problema' : /IN_PROCESS|PENDING/.test(s) ? 'Em análise' : s ? s.toLowerCase() : "-";
