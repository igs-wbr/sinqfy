// Vendas: resumo (página inicial do site), campanhas, pedidos, integrações e o endpoint público de webhooks.
import { db, env, newToken, loadSites, awaitAll } from '../db.js';
import { period } from '../time.js';
import { route, send, redirect, form, readBody, origin, sitePath, HttpError } from '../http.js';
import { siteCtx } from '../auth.js';
import * as S from '../sales/stats.js';
import { edgeUrlFor } from '../cloudflare.js';
import { handleWebhook, handleSheet, SIGNED, CUSTOM_FIELDS, CUSTOM_STATUSES, parseCustom, secretsOf } from '../sales/webhooks.js';
import { syncMeta } from '../ads/meta.js';
import { compareFunnel } from '../sales/funnel.js';
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
    marks: p.days > 1 && p.days <= 92 ? S.campaignMarks(site, p) : [],
    methods: S.byMethod(site, p, f), campaigns: S.topSales(site, p, f, 'utm_campaign'), sources: S.topSales(site, p, f, 'utm_source'),
    productsTop: S.topSales(site, p, f, 'product'), platformsTop: S.topSales(site, p, f, 'platform'),
  });
  send(r, 200, V.salesPage(d.ctx, p, f, d));
});

route('GET', '/sites/:id/campaigns', { site: 'view' }, async r => {
  const p = period(r.q, r.site.timezone);
  const level = Object.hasOwn(S.LEVEL_PT, r.q.get('level') || '') ? r.q.get('level') : 'campaign';
  const fc = /^[\w-]{1,40}$/.test(r.q.get('fc') || '') ? r.q.get('fc') : null; // campanha do funil (vazio = todas)
  const [c, rows, ls, funnel, before] = await Promise.all([siteCtx(r, '/campaigns'), S.campaigns(r.site, p, level), lastSync(r.site.id),
    S.adFunnel(r.site, p, fc), p.prev && S.adFunnel(r.site, p.prev, fc)]);
  compareFunnel(funnel.stages, before?.stages); // gargalo contra a própria campanha no período anterior, nunca contra média de mercado
  send(r, 200, V.campaignsPage(c, p, level, rows, ls, { ...funnel, fc, prev: p.prev, options: level === 'campaign' ? rows : await S.campaigns(r.site, p) }));
});

route('GET', '/sites/:id/orders', { site: 'view' }, async r => {
  const [p, f] = range(r), page = Math.max(0, Math.min(1000, Number(r.q.get('page')) || 0));
  const [c, d] = await Promise.all([siteCtx(r, '/orders'), S.orders(r.site, p, f, page)]);
  send(r, 200, V.ordersPage(c, p, f, d, page));
});

// --- integrações ---
const MSG = {
  rotate: 'Novo token gerado. Atualize a URL do webhook nas plataformas.', meta_add: 'Conta conectada e sincronizada.',
  meta_sync: 'Sincronização concluída.', meta_remove: 'Conta removida (os gastos já importados foram mantidos).', capi: 'Conversions API salva.', ga4: 'GA4 salvo.', meta_test: 'Conexão com a Meta conferida.', secrets: 'Segredos dos webhooks salvos.', custom_map: 'Mapa do webhook personalizado salvo.',
};
async function integrationsView(r, msg, err, extra = {}) {
  const d = await awaitAll({
    accounts: db.all("SELECT id, account_id, name, currency, last_sync, last_error FROM ad_accounts WHERE site=? AND platform='meta' ORDER BY id", [r.site.id]),
    logs: S.lastWebhooks(r.site.id), edgeUrl: edgeUrlFor(r.site, origin(r.req)), // domínio do cliente na borda, quando ativo
    // Saúde da fila nas últimas 24 h, por destino (etapa 2).
    deliveries: db.all(`SELECT dest, COUNT(*) FILTER (WHERE status='sent') sent, COUNT(*) FILTER (WHERE status='failed') failed,
      COUNT(*) FILTER (WHERE status IN ('pending','sending')) pending, MAX(sent_at) last_sent FROM deliveries WHERE site=? AND created>? GROUP BY dest`, [r.site.id, Date.now() - 864e5]),
  });
  send(r, err ? 400 : 200, V.integrationsPage(await siteCtx(r, '/integrations'), origin(r.req), { ...d, ...extra }, msg, err));
}
route('GET', '/sites/:id/integrations', { site: 'edit' }, r => integrationsView(r, Object.hasOwn(MSG, r.q.get('ok') || '') ? MSG[r.q.get('ok')] : null));
route('POST', '/sites/:id/integrations', { site: 'edit' }, async r => {
  const f = await form(r.req), action = f.get('action'), site = r.site;
  const done = () => redirect(r, f.get('back') === 'setup' ? sitePath(site, '/setup') : sitePath(site, `/integrations?ok=${action}#${Object.hasOwn(V.INTEG_SECTION, action) ? V.INTEG_SECTION[action] : ''}`));
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
      const test = (f.get('test_code') || '').trim();
      if (test && !/^TEST\w{1,40}$/.test(test)) return integrationsView(r, null, 'Código de teste inválido (começa com TEST, copie do Gerenciador de Eventos).');
      if (pixel) await db.run('UPDATE sites SET meta_pixel=?, meta_capi_token=COALESCE(?, meta_capi_token), meta_test_code=?, meta_checked=CASE WHEN meta_pixel=? AND ?::text IS NULL THEN meta_checked END WHERE id=?', [pixel, token || null, test || null, pixel, token || null, site.id]);
      else await db.run('UPDATE sites SET meta_pixel=NULL, meta_capi_token=NULL, meta_test_code=NULL WHERE id=?', [site.id]);
      await loadSites();
      return done();
    }
    case 'ga4': {
      const id = (f.get('ga4_id') || '').trim().toUpperCase(), secret = (f.get('ga4_secret') || '').trim();
      if (id && !/^G-[A-Z0-9]{4,20}$/.test(id)) return integrationsView(r, null, 'ID de medição inválido (formato G-XXXXXXX).');
      if (id && !secret && !site.ga4_secret) return integrationsView(r, null, 'Informe o segredo da API do Measurement Protocol.');
      if (id) await db.run('UPDATE sites SET ga4_id=?, ga4_secret=COALESCE(?, ga4_secret) WHERE id=?', [id, secret || null, site.id]);
      else await db.run('UPDATE sites SET ga4_id=NULL, ga4_secret=NULL WHERE id=?', [site.id]);
      await loadSites();
      return done();
    }
    case 'secrets': { // segredos de assinatura por plataforma; campo vazio mantém o atual, "-" apaga
      const cur = secretsOf(site);
      for (const k of Object.keys(SIGNED)) {
        const v = (f.get('secret_' + k) || '').trim();
        if (v === '-') delete cur[k]; else if (v) cur[k] = v.slice(0, 200);
      }
      await db.run('UPDATE sites SET hook_secrets=? WHERE id=?', [Object.keys(cur).length ? JSON.stringify(cur) : null, site.id]);
      await loadSites();
      return done();
    }
    case 'custom_map': case 'custom_preview': {
      const map = { fields: {}, status: {}, cents: f.get('cents') === '1' };
      for (const k of Object.keys(CUSTOM_FIELDS)) { const v = (f.get('f_' + k) || '').trim().slice(0, 200); if (v) map.fields[k] = v; }
      for (const k of CUSTOM_STATUSES) { const v = (f.get('s_' + k) || '').trim().slice(0, 300); if (v) map.status[k] = v; }
      if (!map.fields.order_id || !map.fields.amount) return integrationsView(r, null, 'Informe pelo menos onde estão o id do pedido e o valor.', { customDraft: map });
      if (action === 'custom_preview') {
        let sample, parsed = null, error = null;
        try { sample = JSON.parse(f.get('sample') || ''); } catch (e) { error = `O exemplo não é um JSON válido (${String(e.message).replace(/^.*?JSON[^:]*: ?/, '').slice(0, 120)}).`; }
        if (sample) { parsed = parseCustom(sample, map); if (!parsed) error = 'Com esse mapa, o exemplo não vira venda (confira o campo e os valores de status).'; }
        return integrationsView(r, null, null, { customDraft: map, preview: { sample: f.get('sample') || '', parsed, error } });
      }
      await db.run('UPDATE sites SET custom_map=? WHERE id=?', [JSON.stringify(map), site.id]);
      await loadSites();
      return done();
    }
    case 'meta_test': { // confere pixel e token na Graph API: o pixel existe e o token tem acesso a ele
      if (!site.meta_pixel || !site.meta_capi_token) return integrationsView(r, null, 'Salve o ID do pixel e o token antes de testar.');
      try {
        const res = await fetch(`https://graph.facebook.com/${env.META_API_VERSION || 'v23.0'}/${encodeURIComponent(site.meta_pixel)}?fields=id,name`,
          { headers: { authorization: `Bearer ${site.meta_capi_token}` }, signal: AbortSignal.timeout(10e3) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(j.error?.message || `HTTP ${res.status}`);
        await db.run('UPDATE sites SET meta_checked=?, meta_pixel_name=? WHERE id=?', [Date.now(), String(j.name || '').slice(0, 120), site.id]);
      } catch (e) {
        await db.run('UPDATE sites SET meta_checked=NULL WHERE id=?', [site.id]);
        await loadSites();
        const m = `A Meta recusou: ${e.message}. Confira se o token é da Conversions API deste pixel.`;
        return f.get('back') === 'setup' ? redirect(r, sitePath(site, '/setup?meta=erro')) : integrationsView(r, null, m);
      }
      await loadSites();
      return done();
    }
    default: throw new HttpError(400, 'Ação inválida.');
  }
});

// --- webhooks das plataformas (público; o token na URL identifica o site) ---
route('POST', '/hooks/:token/sheets', { auth: false }, async r => { // Apps Script da planilha (lote de linhas)
  const out = await handleSheet(r.params.token, await readBody(r.req, 1024 * 1024));
  r.res.writeHead(out.status, { 'content-type': 'application/json' }).end(JSON.stringify(out.body || { ok: out.status === 200 }));
});
route('POST', '/hooks/:token/:platform', { auth: false }, async r => {
  const status = await handleWebhook(r.params.token, r.params.platform, await readBody(r.req, 256 * 1024), Date.now(), { headers: r.req.headers });
  r.res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: status === 200 }));
});
