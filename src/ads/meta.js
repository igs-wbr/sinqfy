// Integração com a Meta: leitura de campanhas/gastos (Marketing API). O envio server-side fica em src/dispatch.js.
// Somente leitura nas contas de anúncio: o token precisa apenas de `ads_read`.
import { db, env, sites } from '../db.js';
import { clientSites, spendSite } from '../clients.js';
import { localDate, addDays } from '../time.js';

const graph = () => `https://graph.facebook.com/${env.META_API_VERSION || 'v23.0'}`;

async function getAll(url) {
  const out = [];
  for (let next = url, page = 0; next && page < 50; page++) {
    const res = await fetch(next);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      // Código 1 ("An unknown error occurred" / "reduce the amount of data") é a Meta recusando página grande demais:
      // conta com muitos anúncios ou 90 dias por anúncio. Repete a mesma página com limit menor (500 → 125 → 31).
      const u = new URL(next), lim = Number(u.searchParams.get('limit')) || 0;
      if (j.error?.code === 1 && lim > 40) { u.searchParams.set('limit', String(lim >> 2)); next = u.href; page--; continue; }
      throw Object.assign(new Error(`${u.pathname.split('/').pop()}: ${j.error?.message || `HTTP ${res.status}`}${j.error?.code ? ` (código ${j.error.code})` : ''}`), { code: j.error?.code });
    }
    out.push(...(j.data || []));
    next = j.paging?.next;
  }
  return out;
}

// A Meta reporta a mesma compra em vários action_types (omni_purchase agrega site + app + loja; purchase;
// offsite_conversion.fb_pixel_purchase). Usa o primeiro presente, na ordem, para não contar duas vezes.
const PURCHASE = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];
const LEAD = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
// Funil self-serve: CompleteRegistration é evento padrão; first_build e app_published são personalizados.
const REGISTRATION = ['omni_complete_registration', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration'];
const FIRST_BUILD = ['offsite_conversion.fb_pixel_custom.first_build', 'first_build'];
const APP_PUBLISHED = ['offsite_conversion.fb_pixel_custom.app_published', 'app_published'];
const LPV = ['omni_landing_page_view', 'landing_page_view'];
const ATC = ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'];
const CHECKOUT = ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'];
export function action(list, types) {
  for (const t of types) { const a = (list || []).find(x => x.action_type === t); if (a) return Number(a.value) || 0; }
  return 0;
}

// Limite de chamadas da Meta (app, usuário ou conta de anúncio). Tentar de novo a cada 5 min só gasta o limite e prolonga o bloqueio.
const LIMITED = e => [4, 17, 32, 613].includes(e.code) || (e.code >= 80000 && e.code <= 80014) || /too many calls|request limit/i.test(e.message);
export const PAUSE = 3600e3;

const budget = e => e.daily_budget ? Number(e.daily_budget) / 100 : e.lifetime_budget ? Number(e.lifetime_budget) / 100 : null; // centavos

const FIELDS = {
  campaign: 'id,name,effective_status,daily_budget,lifetime_budget',
  adset: 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget',
  ad: 'id,name,adset_id,effective_status,creative.thumbnail_width(160).thumbnail_height(160){thumbnail_url,image_url}',
  adBare: 'id,name,adset_id,effective_status', // completa: miniatura é o mais pesado e só importa nos ativos (vem na leve)
};
const ONLY_ACTIVE = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]);
export const FULL_EVERY = 864e5;

/**
 * Sincroniza campanhas, conjuntos, anúncios, gasto diário e as conversões que a Meta reporta (compras, valor, leads,
 * na janela de atribuição configurada na conta).
 * Completa (1x por dia, e na primeira vez com 90 dias): todas as entidades e 7 dias de gasto, para pegar os ajustes da Meta.
 * Leve (as outras rodadas de 5 min): só entidades ativas, as que deixaram de ser, e o gasto de hoje e ontem. Uma conta
 * com milhares de anúncios pausados estourava o limite da Meta baixando tudo a cada 5 min.
 */
export async function syncMeta(acc, { full = !acc.last_full || Date.now() - Number(acc.last_full) > FULL_EVERY } = {}) {
  const wait = Number(acc.sync_after) - Date.now();
  if (wait > 0) throw new Error(`A Meta limitou as chamadas desta conta. Nova tentativa em ${Math.ceil(wait / 60e3)} min.`);
  const site = sites.get(acc.site), days = !acc.last_sync ? 90 : full ? 7 : 2;
  const until = localDate(Date.now(), site.timezone), since = addDays(until, -(days - 1));
  const act = acc.account_id.replace(/^act_/, '');
  const group = clientSites(site).map(s => s.id); // a conta é de um site, mas o gasto de cada campanha vai para o site do cliente que ela atende
  const url = (path, params = {}) => `${graph()}/act_${act}${path}?` + new URLSearchParams({ limit: '500', ...params, access_token: acc.token });
  const entities = async (level, path) => {
    const list = await getAll(url(path, { fields: FIELDS[full && level === 'ad' ? 'adBare' : level], ...(!full && { filtering: ONLY_ACTIVE }) }));
    if (full) return list;
    // Deixou de ser ativo desde a última rodada (pausado, reprovado): busca só esses pelo id, para o status não ficar velho.
    const seen = new Set(list.map(e => e.id));
    const gone = (await db.all("SELECT id FROM ad_entities WHERE site = ANY(?::text[]) AND platform='meta' AND level=? AND status='ACTIVE'", [group, level]))
      .map(r => r.id).filter(id => !seen.has(id));
    for (let i = 0; i < gone.length; i += 50) {
      const res = await fetch(`${graph()}/?` + new URLSearchParams({ ids: gone.slice(i, i + 50).join(','), fields: FIELDS[level], access_token: acc.token }));
      const j = await res.json().catch(() => ({}));
      if (j.error && LIMITED(j.error)) throw Object.assign(new Error(`ids: ${j.error.message}`), { code: j.error.code });
      if (!j.error) list.push(...Object.values(j)); // id apagado na Meta: fica para a sincronização completa
    }
    return list;
  };
  try {
    const info = await fetch(url('', { fields: 'name,currency' })).then(r => r.json());
    if (info.error) throw Object.assign(new Error(info.error.message), { code: info.error.code });
    const [campaigns, adsets, ads, insights] = await Promise.all([
      entities('campaign', '/campaigns'),
      entities('adset', '/adsets'),
      entities('ad', '/ads'),
      getAll(url('/insights', {
        level: 'ad', time_increment: '1', time_range: JSON.stringify({ since, until }),
        fields: 'date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions,action_values',
      })),
    ]);
    const ENT = `INSERT INTO ad_entities(site, platform, level, id, name, parent, status, budget, thumb) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(site, platform, level, id) DO UPDATE SET name=excluded.name, parent=excluded.parent, status=excluded.status, budget=excluded.budget, thumb=COALESCE(excluded.thumb, ad_entities.thumb)`; // a completa vem sem miniatura
    // Só imagem da CDN da Meta (é o que a CSP do painel libera).
    const thumb = a => [a.creative?.thumbnail_url, a.creative?.image_url].find(u => /^https:\/\/[\w.-]+\.fbcdn\.net\//.test(u || '')) || null;
    const SPEND = `INSERT INTO ad_spend(site, platform, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, impressions, clicks,
      meta_purchases, meta_purchase_value, meta_leads, meta_link_clicks, meta_lpv, meta_atc, meta_checkouts, meta_registrations, meta_first_builds, meta_app_published, source)
      VALUES (?,'meta',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'api')
      ON CONFLICT(site, platform, date, campaign_id, adset_id, ad_id) DO UPDATE SET campaign_name=excluded.campaign_name, adset_name=excluded.adset_name,
      ad_name=excluded.ad_name, spend=excluded.spend, impressions=excluded.impressions, clicks=excluded.clicks, meta_purchases=excluded.meta_purchases,
      meta_purchase_value=excluded.meta_purchase_value, meta_leads=excluded.meta_leads, meta_link_clicks=excluded.meta_link_clicks, meta_lpv=excluded.meta_lpv,
      meta_atc=excluded.meta_atc, meta_checkouts=excluded.meta_checkouts, meta_registrations=excluded.meta_registrations,
      meta_first_builds=excluded.meta_first_builds, meta_app_published=excluded.meta_app_published, source=excluded.source`;
    // Site de cada campanha (regra pelo nome), conjunto e anúncio. A rodada leve só traz o ativo: nomes e hierarquia já gravados completam.
    const known = group.length > 1 ? await db.all("SELECT level, id, name, parent FROM ad_entities WHERE site = ANY(?::text[]) AND platform='meta' AND level IN ('campaign','adset')", [group]) : [];
    const campName = new Map(known.filter(e => e.level === 'campaign').map(e => [e.id, e.name])), setParent = new Map(known.filter(e => e.level === 'adset').map(e => [e.id, e.parent]));
    for (const c of campaigns) campName.set(c.id, c.name || '');
    for (const a of adsets) setParent.set(a.id, a.campaign_id || '');
    const to = (campaignId, name) => spendSite(site, campName.get(campaignId) ?? name);
    const rows = [
      ...campaigns.map(c => [to(c.id), 'campaign', c.id, [ENT, [to(c.id), 'meta', 'campaign', c.id, c.name || '', '', c.effective_status || '', budget(c), null]]]),
      ...adsets.map(a => [to(a.campaign_id), 'adset', a.id, [ENT, [to(a.campaign_id), 'meta', 'adset', a.id, a.name || '', a.campaign_id || '', a.effective_status || '', budget(a), null]]]),
      ...ads.map(a => { const t = to(setParent.get(a.adset_id)); return [t, 'ad', a.id, [ENT, [t, 'meta', 'ad', a.id, a.name || '', a.adset_id || '', a.effective_status || '', null, thumb(a)]]]; }),
    ];
    // Campanha que mudou de site (regra nova ou editada): sai dos outros sites do cliente no mesmo período/entidade, sem duplicar gasto.
    const moves = [];
    if (group.length > 1) {
      const by = new Map(), add = (k, v) => (by.get(k) || by.set(k, []).get(k)).push(v);
      for (const [t, level, id] of rows) add(`${t}\n${level}`, id);
      for (const [k, list] of by) { const [t, level] = k.split('\n'); moves.push(["DELETE FROM ad_entities WHERE site = ANY(?::text[]) AND site<>? AND platform='meta' AND level=? AND id = ANY(?::text[])", [group, t, level, list]]); }
      const spendBy = new Map();
      for (const i of insights) { const t = to(i.campaign_id, i.campaign_name); (spendBy.get(t) || spendBy.set(t, new Set()).get(t)).add(i.campaign_id || ''); }
      for (const [t, list] of spendBy) moves.push(["DELETE FROM ad_spend WHERE site = ANY(?::text[]) AND site<>? AND platform='meta' AND date BETWEEN ? AND ? AND campaign_id = ANY(?::text[])", [group, t, since, until, [...list]]]);
    }
    await db.batch([ // uma transação: ou grava tudo ou nada
      ...moves, ...rows.map(x => x[3]),
      ...insights.map(i => [SPEND, [to(i.campaign_id, i.campaign_name), i.date_start, i.campaign_id || '', i.campaign_name || '', i.adset_id || '', i.adset_name || '', i.ad_id || '', i.ad_name || '',
        Number(i.spend) || 0, Number(i.impressions) || 0, Number(i.clicks) || 0,
        action(i.actions, PURCHASE), action(i.action_values, PURCHASE), action(i.actions, LEAD),
        Number(i.inline_link_clicks) || 0, action(i.actions, LPV), action(i.actions, ATC), action(i.actions, CHECKOUT),
        action(i.actions, REGISTRATION), action(i.actions, FIRST_BUILD), action(i.actions, APP_PUBLISHED)]]),
      ['UPDATE ad_accounts SET last_sync=?, last_full=COALESCE(?, last_full), last_error=NULL, sync_after=NULL, name=?, currency=? WHERE id=?',
        [Date.now(), full ? Date.now() : null, info.name || '', info.currency || '', acc.id]],
    ]);
    return { campaigns: campaigns.length, rows: insights.length, full };
  } catch (e) {
    const limited = LIMITED(e);
    if (limited) e.message += ' Nova tentativa em 1 hora.';
    await db.run('UPDATE ad_accounts SET last_error=?, sync_after=? WHERE id=?', [e.message.slice(0, 300), limited ? Date.now() + PAUSE : null, acc.id]);
    throw e;
  }
}

export const STATUS_PT = s => /^ACTIVE$/.test(s) ? 'Ativo' : /PAUSED/.test(s) ? 'Pausado' : /DELETED|ARCHIVED/.test(s) ? 'Arquivado'
  : /ISSUES|DISAPPROVED/.test(s) ? 'Com problema' : /IN_PROCESS|PENDING/.test(s) ? 'Em análise' : s ? s.toLowerCase() : "-";
