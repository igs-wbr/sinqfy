// Cliente: sites da mesma agência com o mesmo nome de cliente (um site por funil, produto ou faixa de preço).
// Cada site segue com o seu script, webhook e pixel. O cliente ganha uma visão somada (/sites/~chave) e
// divide o gasto da conta de anúncios entre os sites pelo nome da campanha (spend_rule).
import { sites } from './db.js';

export const clientKey = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Sites do mesmo cliente (o próprio site, se não tiver cliente). */
export const clientSites = site => site.client
  ? [...sites.values()].filter(s => s.agency_id === site.agency_id && clientKey(s.client) === clientKey(site.client)) : [site];

const terms = rule => String(rule || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
/** Site que fica com o gasto de uma campanha da conta ligada a `home`: o primeiro site do cliente cuja regra aparece no nome. */
export function spendSite(home, campaignName) {
  const n = String(campaignName || '').toLowerCase();
  return clientSites(home).find(s => s.id !== home.id && terms(s.spend_rule).some(t => n.includes(t)))?.id || home.id;
}

/**
 * Visão somada do cliente, só com os sites que o usuário vê. Site "virtual" com `ids`: as consultas de src/sales/stats.js
 * somam os sites e contam uma vez o pedido que chegou a dois deles. Moeda, fuso e imposto vêm do primeiro site.
 */
export function clientView(key, visible) {
  const list = visible.filter(s => s.client && clientKey(s.client) === key);
  if (list.length < 2) return null;
  const [a] = list;
  return { id: '~' + key, ids: list.map(s => s.id), members: list, name: `${a.client} (todos os funis)`, client: a.client, agency_id: a.agency_id,
    timezone: a.timezone, currency: a.currency, tax_rate: a.tax_rate, modules: a.modules }; // ponytail: imposto do 1º site; por site se os impostos divergirem
}

/** Seletor de sites: clientes (com os sites de cada um) e, depois, os sites sem cliente. `all`: liga a visão somada (dois sites ou mais). */
export function groupsOf(visible) {
  const by = new Map(), loose = [];
  for (const s of visible) if (s.client) { const k = clientKey(s.client); (by.get(k) || by.set(k, { key: k, name: s.client, sites: [] }).get(k)).sites.push(s); } else loose.push(s);
  return { clients: [...by.values()].map(c => ({ ...c, all: c.sites.length > 1 })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), loose };
}
