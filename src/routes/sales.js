// Vendas: resumo (página inicial do site), campanhas, pedidos, integrações e o endpoint público de webhooks.
import { db, newToken, loadSites, awaitAll } from '../db.js';
import { period } from '../time.js';
import { route, send, redirect, form, readBody, origin, sitePath, HttpError } from '../http.js';
import { siteCtx } from '../auth.js';
import * as S from '../sales/stats.js';
import { handleWebhook } from '../sales/webhooks.js';
import { syncMeta } from '../ads/meta.js';
import * as V from '../views/sales.js';

const range = r => [period(r.q, r.site.timezone), S.saleFiltersFrom(r.q)];
const lastSync = async site => (await db.get("SELECT MAX(last_sync) t FROM ad_accounts WHERE site=? AND platform='meta'", [site]))?.t;

route('GET', '/sites/:id', { site: 'view' }, async r => {
  const [p, f] = range(r), site = r.site;
  const distinct = async col => (await db.all(`SELECT DISTINCT ${col} k FROM sales WHERE site=? AND ${col}<>'' ORDER BY k`, [site.id])).map(x => x.k);
  const d = await awaitAll({
    ctx: siteCtx(r, ''), lastSync: lastSync(site.id),
    hasData: Promise.all([db.get('SELECT 1 FROM sales WHERE site=? LIMIT 1', [site.id]), db.get('SELECT 1 FROM ad_spend WHERE site=? LIMIT 1', [site.id])]).then(x => x.some(Boolean)),
    platforms: distinct('platform'), products: distinct('product'),
    cur: S.salesTotals(site, p, f), prev: p.prev && S.salesTotals(site, p.prev, f),
    series: S.salesSeries(site, p, f, p.days), prevSeries: p.prev && S.salesSeries(site, p.prev, f, p.days),
    methods: S.byMethod(site, p, f), campaigns: S.topSales(site, p, f, 'utm_campaign'), sources: S.topSales(site, p, f, 'utm_source'),
    productsTop: S.topSales(site, p, f, 'product'), platformsTop: S.topSales(site, p, f, 'platform'),
  });
  send(r, 200, V.salesPage(d.ctx, p, f, d));
});

route('GET', '/sites/:id/campaigns', { site: 'view' }, async r => {
  const p = period(r.q, r.site.timezone);
  const level = Object.hasOwn(S.LEVEL_PT, r.q.get('level') || '') ? r.q.get('level') : 'campaign';
  const [c, rows, ls] = await Promise.all([siteCtx(r, '/campaigns'), S.campaigns(r.site, p, level), lastSync(r.site.id)]);
  send(r, 200, V.campaignsPage(c, p, level, rows, ls));
});

route('GET', '/sites/:id/orders', { site: 'view' }, async r => {
  const [p, f] = range(r), page = Math.max(0, Math.min(1000, Number(r.q.get('page')) || 0));
  const [c, d] = await Promise.all([siteCtx(r, '/orders'), S.orders(r.site, p, f, page)]);
  send(r, 200, V.ordersPage(c, p, f, d, page));
});

// --- integrações ---
const MSG = {
  rotate: 'Novo token gerado. Atualize a URL do webhook nas plataformas.', meta_add: 'Conta conectada e sincronizada.',
  meta_sync: 'Sincronização concluída.', meta_remove: 'Conta removida (os gastos já importados foram mantidos).', capi: 'Conversions API salva.',
};
async function integrationsView(r, msg, err) {
  const d = await awaitAll({
    accounts: db.all("SELECT id, account_id, name, currency, last_sync, last_error FROM ad_accounts WHERE site=? AND platform='meta' ORDER BY id", [r.site.id]),
    logs: S.lastWebhooks(r.site.id),
  });
  send(r, err ? 400 : 200, V.integrationsPage(await siteCtx(r, '/integrations'), origin(r.req), d, msg, err));
}
route('GET', '/sites/:id/integrations', { site: 'edit' }, r => integrationsView(r, Object.hasOwn(MSG, r.q.get('ok') || '') ? MSG[r.q.get('ok')] : null));
route('POST', '/sites/:id/integrations', { site: 'edit' }, async r => {
  const f = await form(r.req), action = f.get('action'), site = r.site;
  const done = () => redirect(r, sitePath(site, `/integrations?ok=${action}`));
  const account = async () => {
    const a = await db.get('SELECT * FROM ad_accounts WHERE id=? AND site=?', [Number(f.get('account')) || 0, site.id]);
    if (!a) throw new HttpError(404, 'Conta não encontrada.');
    return a;
  };
  switch (action) {
    case 'rotate':
      await db.run('UPDATE sites SET webhook_token=? WHERE id=?', [newToken(), site.id]);
      await loadSites();
      return done();
    case 'meta_add': {
      const id = (f.get('account_id') || '').trim().replace(/^act_/, ''), token = (f.get('token') || '').trim();
      if (!/^\d{5,25}$/.test(id) || !token) return integrationsView(r, null, 'Informe o ID numérico da conta (act_…) e o token.');
      await db.run(`INSERT INTO ad_accounts(site, platform, account_id, token) VALUES (?, 'meta', ?, ?)
        ON CONFLICT(site, platform, account_id) DO UPDATE SET token=excluded.token, last_error=NULL`, [site.id, id, token]);
      const acc = await db.get("SELECT * FROM ad_accounts WHERE site=? AND platform='meta' AND account_id=?", [site.id, id]);
      try { await syncMeta(acc); } catch (e) { return integrationsView(r, null, `Conta salva, mas a sincronização falhou: ${e.message}`); }
      return done();
    }
    case 'meta_sync': {
      const acc = await account();
      try { await syncMeta(acc); } catch (e) { return integrationsView(r, null, `A sincronização falhou: ${e.message}`); }
      return done();
    }
    case 'meta_remove':
      await db.run('DELETE FROM ad_accounts WHERE id=?', [(await account()).id]);
      return done();
    case 'capi': {
      const pixel = (f.get('pixel') || '').trim(), token = (f.get('capi_token') || '').trim();
      if (pixel && !/^\d{5,25}$/.test(pixel)) return integrationsView(r, null, 'ID de pixel inválido.');
      if (pixel) await db.run('UPDATE sites SET meta_pixel=?, meta_capi_token=COALESCE(?, meta_capi_token) WHERE id=?', [pixel, token || null, site.id]);
      else await db.run('UPDATE sites SET meta_pixel=NULL, meta_capi_token=NULL WHERE id=?', [site.id]);
      await loadSites();
      return done();
    }
    default: throw new HttpError(400, 'Ação inválida.');
  }
});

// --- webhooks das plataformas (público; o token na URL identifica o site) ---
route('POST', '/hooks/:token/:platform', { auth: false }, async r => {
  const status = await handleWebhook(r.params.token, r.params.platform, await readBody(r.req, 256 * 1024));
  r.res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: status === 200 }));
});
