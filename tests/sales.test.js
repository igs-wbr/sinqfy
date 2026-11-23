// Vendas e anúncios: webhooks, Conversions API, sync da Meta (fetch simulado), métricas e campanhas.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { boot, kv } from './helpers.js';

// A Graph API da Meta é simulada; todo o resto do fetch é real (servidor local).
const graphCalls = [], capiBodies = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.host !== 'graph.facebook.com') return realFetch(url, opts);
  graphCalls.push(u);
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.pathname.endsWith('/events')) { capiBodies.push(JSON.parse(opts.body)); return json({ events_received: 1 }); }
  if (u.searchParams.get('access_token') === 'LIMIT') return json({ error: { message: 'There have been too many calls to this ad-account. Wait a bit and try again.', code: 80004 } }, 400);
  if (u.searchParams.get('access_token') === 'BAD') return json({ error: { message: 'Invalid OAuth access token' } }, 400);
  if (u.searchParams.has('ids')) return json(Object.fromEntries(u.searchParams.get('ids').split(',').map(id => [id, { id, name: 'Pausado', adset_id: 's1', effective_status: 'PAUSED' }])));
  const p = u.pathname.replace(/^\/v[\d.]+\/act_12345/, '');
  if (p === '') return json({ name: 'Conta X', currency: 'BRL' });
  if (p === '/campaigns' && !u.searchParams.has('after')) return json({ data: [{ id: 'c1', name: 'Black Friday', effective_status: 'ACTIVE', daily_budget: '10000' }], paging: { next: u.href + '&after=2' } });
  if (p === '/campaigns') return json({ data: [{ id: 'c2', name: 'Antiga', effective_status: 'PAUSED' }] });
  if (p === '/adsets') return json({ data: [{ id: 's1', name: 'Lookalike', campaign_id: 'c1', effective_status: 'ACTIVE', daily_budget: '5000' }] });
  if (p === '/ads' && Number(u.searchParams.get('limit')) > 200) return json({ error: { message: 'An unknown error occurred', code: 1 } }, 500);
  if (p === '/ads') return json({ data: [{ id: 'a1', name: 'Video 1', adset_id: 's1', effective_status: 'ACTIVE', creative: { thumbnail_url: 'https://scontent.xx.fbcdn.net/v/t45/thumb1.jpg?oh=1' } },
    { id: 'a2', name: 'Ruim', adset_id: 's1', effective_status: 'ACTIVE', creative: { thumbnail_url: 'javascript:alert(1)' } }] });
  if (p === '/insights') {
    const day = JSON.parse(u.searchParams.get('time_range')).until;
    return json({ data: [{ date_start: day, campaign_id: 'c1', campaign_name: 'Black Friday', adset_id: 's1', adset_name: 'Lookalike', ad_id: 'a1', ad_name: 'Video 1', spend: '100.50', impressions: '1000', clicks: '50',
      actions: [{ action_type: 'link_click', value: '50' }, { action_type: 'omni_purchase', value: '3' }, { action_type: 'purchase', value: '3' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' }, { action_type: 'lead', value: '5' }],
      action_values: [{ action_type: 'omni_purchase', value: '591' }, { action_type: 'purchase', value: '591' }] }] });
  }
  return json({ error: { message: 'rota não simulada ' + p } }, 404);
};

const { req, login, close } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const W = await import('../src/sales/webhooks.js');
const S = await import('../src/sales/stats.js');
const D = await import('../src/dispatch.js');
const { period, localDate, addDays } = await import('../src/time.js');
const { action } = await import('../src/ads/meta.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'loja', name: 'Loja', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
await req('/sites/loja/settings', { cookie: admin, form: { action: 'save', name: 'Loja', timezone: 'America/Sao_Paulo', currency: 'BRL', tax_rate: '6' } });
const token = (await db.get("SELECT webhook_token FROM sites WHERE id='loja'")).webhook_token;
const hook = (platform, body, t) => req(`/hooks/${t ?? W.hookToken(DB.sites.get('loja'), platform)}/${platform}`, { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' } });
const sale = id => db.get("SELECT * FROM sales WHERE site='loja' AND order_id=?", [id]);
const today = localDate(Date.now(), 'America/Sao_Paulo'), p = { from: today, to: today };
const hotmart = (tx, extra = {}) => ({
  event: 'PURCHASE_APPROVED', data: {
    product: { name: 'Curso' }, buyer: { email: 'Comprador@Exemplo.com ', checkout_phone: '+55 (11) 99999-0000' },
    purchase: { transaction: tx, order_date: Date.now(), price: { value: 197, currency_value: 'BRL' }, payment: { type: 'PIX' }, origin: { src: 'FB', sck: 'Black Friday|c1' } }, ...extra,
  },
});

test('webhooks: Hotmart, Kiwify, Eduzz (legado) e genérico', async () => {
  assert.equal((await hook('hotmart', hotmart('HP1', { commissions: [{ value: 180.5, source: 'PRODUCER' }] }))).status, 200);
  assert.equal((await hook('kiwify', {
    order_id: 'K1', order_status: 'paid', payment_method: 'credit_card', Product: { product_name: 'Ebook' }, Customer: { email: 'k@k.com' },
    Commissions: { charge_amount: '9700', my_commission: '8900', currency: 'BRL' }, created_at: new Date().toISOString(),
    TrackingParameters: { utm_source: 'FB', utm_medium: 'Lookalike|s1', utm_campaign: 'Black Friday|c1', utm_content: 'Video 1|a1' },
  })).status, 200);
  assert.equal((await hook('kiwify', { order_id: 'K1', order_status: 'refunded', Commissions: {} })).status, 200);
  assert.equal((await hook('eduzz', 'trans_cod=E1&trans_status=3&trans_value=47%2C00&trans_paymentmethod=boleto&content_title=Mentoria')).status, 200);
  assert.equal((await hook('generic', { order_id: 'G1', status: 'pending', amount: 'R$ 1.234,56', method: 'pix' })).status, 200);
  assert.equal((await hook('hotmart', { event: 'PURCHASE_PROTEST', data: {} })).status, 200, 'evento ignorado responde 200');
  assert.equal((await hook('generic', { status: 'paid', amount: 1 })).status, 400);
  assert.equal((await hook('hotmart', hotmart('X'), 'token-errado')).status, 404);
  assert.equal((await hook('naoexiste', {})).status, 404);

  const [hp, k, e, g] = await Promise.all(['HP1', 'K1', 'E1', 'G1'].map(sale));
  assert.deepEqual([hp.status, hp.method, hp.gross, hp.net, hp.utm_source, hp.campaign_key, hp.product], ['paid', 'pix', 197, 180.5, 'FB', 'c1', 'Curso']);
  assert.deepEqual([k.status, k.method, k.gross, k.net, k.adset_key, k.ad_key, k.product], ['refunded', 'card', 97, 89, 's1', 'a1', 'Ebook'], 'reembolso preserva valores e UTMs');
  assert.deepEqual([e.status, e.method, e.gross, e.product], ['paid', 'boleto', 47, 'Mentoria']);
  assert.deepEqual([g.status, g.gross], ['pending', 1234.56]);
  assert.equal((await db.get("SELECT COUNT(*) n FROM sales WHERE site='loja'")).n, 4);
  assert.ok(!JSON.stringify(await db.all('SELECT * FROM sales')).includes('@'), 'nenhum e-mail gravado');
  assert.equal(W.adKey('Nome da campanha|120200'), '120200');
  assert.equal(W.adKey('EI-027 | VID|120251927159870053::PAZXh0bgNhZW0'), '120251927159870053', 'código do clique colado pelo checkout não entra na chave');
  assert.equal(W.adKey('Rastreio R$97 | C1 | 08-11-2026'), 'Rastreio R$97 | C1 | 08-11-2026', 'nome com " | " não vira chave pela data');
  assert.deepEqual(['SPEC+%7C+VENDAS+%7C+CBO%7C123', 'AG+|+VENDAS', 'C1 + campeões', 'Brasil18+ aberto', 'x%ZZ'].map(W.cleanUtm),
    ['SPEC | VENDAS | CBO|123', 'AG | VENDAS', 'C1 + campeões', 'Brasil18+ aberto', 'x%ZZ'], 'UTM codificada duas vezes');
  assert.equal((await hook('hotmart', hotmart('HPK', { purchase: { transaction: 'HPK', order_date: Date.now(), price: { value: 47 },
    origin: { sck: 'ig|paid|120249043042700473|120249043068330473|120249043064750473' } } }))).status, 200);
  const hk = await sale('HPK');
  assert.deepEqual([hk.utm_source, hk.campaign_key, hk.adset_key, hk.ad_key], ['ig', '120249043042700473', '120249043064750473', '120249043068330473'], 'sck "origem|meio|campanha|anúncio|conjunto"');
  await db.run("DELETE FROM sales WHERE order_id='HPK'");
  assert.deepEqual(['1.234,56', '1,234.56', '10.000', 'R$ 97,90', '1.5', 10].map(W.num), [1234.56, 1234.56, 10000, 97.9, 1.5, 10]);
});

test('Conversions API: compra aprovada vai em hash, uma vez só', async () => {
  assert.equal(capiBodies.length, 0, 'sem pixel configurado, nada é enviado');
  assert.equal((await req('/sites/loja/integrations', { cookie: admin, form: { action: 'capi', pixel: '555001', capi_token: 'CAPI' } })).status, 303);
  await hook('hotmart', hotmart('HP2'));
  await hook('hotmart', hotmart('HP2')); // reenvio do mesmo evento
  assert.equal(capiBodies.length, 0, 'webhook só enfileira');
  await D.dispatch({ now: Date.now() + D.PURCHASE_HOLD }); // o Purchase espera a janela do order bump
  assert.equal(capiBodies.length, 1);
  const ev = capiBodies[0].data[0];
  assert.deepEqual([ev.event_name, ev.event_id, ev.custom_data.value, ev.action_source], ['Purchase', 'hotmart-HP2', 197, 'other']);
  assert.equal(ev.user_data.em[0], createHash('sha256').update('comprador@exemplo.com').digest('hex'));
  assert.equal(ev.user_data.ph[0], createHash('sha256').update('5511999990000').digest('hex'));
  assert.ok(!JSON.stringify(capiBodies).includes('Comprador@'), 'e-mail só em hash');
  assert.ok(graphCalls.at(-1).pathname.endsWith('/555001/events'));
  assert.ok((await S.lastWebhooks('loja')).some(l => l.message.includes('Conversions API')));

  // Endereço do comprador da Hotmart reforça a correspondência (em hash), mesmo sem clique.
  const h = v => createHash('sha256').update(v).digest('hex');
  const addr = W.PARSERS.hotmart({ ...hotmart('HPA'), data: { ...hotmart('HPA').data, buyer: { email: 'a@b.com', address: { city: 'São Paulo', state: 'SP', zipcode: '01310-100', country_iso: 'BR' } } } });
  const ud = D.metaPurchase(DB.sites.get('loja'), { ...addr, platform: 'hotmart' }, { email: addr.email }).user_data;
  assert.deepEqual([ud.ct[0], ud.st[0], ud.zp[0], ud.country[0]], [h('saopaulo'), h('sp'), h('01310100'), h('br')]);

  // PURCHASE_COMPLETE (fim da garantia) de venda aprovada antes do webhook: grava, mas não vira compra de hoje na Meta.
  const old = Date.now() - 8 * 864e5;
  await hook('hotmart', { ...hotmart('HPOLD'), event: 'PURCHASE_COMPLETE', data: { ...hotmart('HPOLD').data, purchase: { ...hotmart('HPOLD').data.purchase, order_date: old, approved_date: old } } });
  assert.equal((await sale('HPOLD')).status, 'paid');
  await D.dispatch({ now: Date.now() + D.PURCHASE_HOLD });
  assert.equal(capiBodies.length, 1, 'venda antiga não é enviada');
  assert.ok(!(await db.get("SELECT 1 FROM deliveries WHERE event_id='hotmart-HPOLD'")));
});

test('Meta: sincroniza contas, entidades e gasto (com paginação) e registra erros', async () => {
  const bad = await req('/sites/loja/integrations', { cookie: admin, form: { action: 'meta_add', account_id: 'act_99999', token: 'BAD' } });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /Invalid OAuth access token/);
  assert.equal((await req('/sites/loja/integrations', { cookie: admin, form: { action: 'meta_add', account_id: 'act_12345', token: 'TOKEN' } })).status, 303);
  const acc = await db.get("SELECT * FROM ad_accounts WHERE account_id='12345'");
  assert.ok(acc.last_sync && !acc.last_error);
  assert.deepEqual([acc.name, acc.currency], ['Conta X', 'BRL']);
  assert.equal((await db.get("SELECT COUNT(*) n FROM ad_entities WHERE site='loja' AND level='campaign'")).n, 2, 'duas páginas de campanhas');
  assert.equal((await db.get("SELECT budget FROM ad_entities WHERE id='c1'")).budget, 100);
  assert.deepEqual(await db.get("SELECT date, spend, clicks, meta_purchases, meta_purchase_value, meta_leads FROM ad_spend WHERE platform='meta'"),
    { date: today, spend: 100.5, clicks: 50, meta_purchases: 3, meta_purchase_value: 591, meta_leads: 5 }, 'conversões da Meta sem contar a mesma compra 3x');
  assert.equal(action([{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' }], ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']), 2, 'cai para o tipo do pixel');
  assert.equal(action(undefined, ['lead']), 0);
  assert.ok(!(await req('/sites/loja/integrations', { cookie: admin })).text.includes('TOKEN'), 'token nunca é exibido');
});

test('Meta: rodada leve só traz o ativo e o gasto de 2 dias; a completa, 1x por dia, traz tudo', async () => {
  const { syncMeta } = await import('../src/ads/meta.js');
  const acc = () => db.get("SELECT * FROM ad_accounts WHERE account_id='12345'");
  assert.ok((await acc()).last_full, 'a primeira sincronização é completa');
  await db.run("INSERT INTO ad_entities(site, platform, level, id, name, parent, status) VALUES ('loja','meta','ad','zz','Velho','s1','ACTIVE')");
  const from = graphCalls.length;
  assert.equal((await syncMeta(await acc())).full, false);
  const calls = graphCalls.slice(from), path = c => c.pathname.replace(/^\/v[\d.]+(\/act_12345)?/, '');
  for (const p of ['/campaigns', '/adsets', '/ads']) assert.ok(calls.filter(c => path(c) === p).every(c => /ACTIVE/.test(c.searchParams.get('filtering'))), `${p} só ativos`);
  const tr = JSON.parse(calls.find(c => path(c) === '/insights').searchParams.get('time_range'));
  assert.equal(tr.since, addDays(tr.until, -1), 'gasto de hoje e ontem');
  assert.ok(calls.some(c => c.searchParams.get('ids') === 'zz'), 'busca pelo id o que saiu de ativo');
  assert.equal((await db.get("SELECT status FROM ad_entities WHERE id='zz'")).status, 'PAUSED');
  await db.run("UPDATE ad_accounts SET last_full=? WHERE account_id='12345'", [Date.now() - 865e5]);
  const n = graphCalls.length;
  assert.equal((await syncMeta(await acc())).full, true, 'depois de 24 h volta a ser completa');
  assert.ok(!graphCalls.slice(n).some(c => c.searchParams.has('filtering')), 'completa sem filtro');
});

test('Meta: no limite de chamadas, a conta para por 1 hora sem gastar mais chamadas', async () => {
  const { syncMeta } = await import('../src/ads/meta.js'), { runJobs } = await import('../src/jobs.js');
  await db.run("INSERT INTO ad_accounts(site, platform, account_id, token) VALUES ('loja', 'meta', '777', 'LIMIT')");
  const acc = () => db.get("SELECT * FROM ad_accounts WHERE account_id='777'");
  await assert.rejects(syncMeta(await acc()), /too many calls/);
  const a = await acc();
  assert.ok(Number(a.sync_after) > Date.now() + 59 * 60e3 && /Nova tentativa em 1 hora/.test(a.last_error));
  const calls = graphCalls.length;
  await assert.rejects(syncMeta(a), /Nova tentativa em 60 min/, 'Sincronizar agora não chama a Meta');
  await runJobs();
  assert.ok(!graphCalls.slice(calls).some(u => u.searchParams.get('access_token') === 'LIMIT'), 'o job pula a conta pausada');
  await db.run("DELETE FROM ad_accounts WHERE account_id='777'");
});

test('métricas: faturamento líquido, imposto, lucro, ROAS, reembolso', async () => {
  const t = await S.salesTotals(DB.sites.get('loja'), p);
  // aprovadas: HP1 (197 / 180,50), HP2 (197 / 197), E1 (47 / 47); K1 reembolsada; G1 pendente; gasto Meta 100,50
  assert.deepEqual([t.paid, t.gross, t.net, t.spend, t.pending_value, t.refunded], [3, 441, 424.5, 100.5, 1234.56, 1]);
  assert.equal(Math.round(t.tax * 100), 2646);
  assert.equal(Math.round(t.profit * 100), Math.round((424.5 - 100.5 - 26.46) * 100));
  assert.equal(t.roas.toFixed(4), (424.5 / 100.5).toFixed(4));
  assert.equal(t.refund_rate, 0.25);
  assert.equal(t.cpa, 33.5);
  assert.deepEqual([t.metaPurchases, t.metaValue, t.metaLeads, t.metaRoas.toFixed(4)], [3, 591, 5, (591 / 100.5).toFixed(4)]);
  const m = await S.byMethod(DB.sites.get('loja'), p, {});
  assert.deepEqual(m.map(x => [x.k, x.n]), [['pix', 2], ['boleto', 1]]);
});

test('campanhas: gasto × vendas pela chave da UTM', async () => {
  const rows = await S.campaigns(DB.sites.get('loja'), p, 'campaign');
  const bf = rows.find(r => r.id === 'c1'), none = rows.find(r => r.unmatched);
  assert.deepEqual([bf.name, bf.spend, bf.sales, bf.net, bf.statusPt, bf.budget, bf.roas], ['Black Friday', 100.5, 2, 377.5, 'Ativo', 100, 377.5 / 100.5]);
  assert.deepEqual([bf.metaPurchases, bf.metaValue, bf.metaLeads, bf.metaRoas], [3, 591, 5, 591 / 100.5], 'Meta diz 3 compras; webhooks confirmam 2');
  assert.deepEqual([none.sales, none.net], [1, 47], 'venda sem UTM aparece separada');
  assert.ok(!rows.some(r => r.id === 'c2'), 'pausada e sem gasto não aparece');
  const ads = (await S.campaigns(DB.sites.get('loja'), p, 'ad')).filter(r => !r.unmatched);
  assert.deepEqual(ads.map(r => [r.id, r.spend, r.sales]), [['a1', 100.5, 0], ['a2', 0, 0]], 'K1 foi reembolsada; ativo sem gasto aparece');
  // Venda cuja UTM veio com '::<código>' casa com o anúncio e o anúncio que mais vendeu sobe para o topo.
  await db.run(`INSERT INTO sales(site, platform, order_id, status, gross, net, ts, date, updated, utm_content, ad_key) VALUES ('loja','generic','ADX','paid',90,90,?,?,?,'Ruim|a2::PAZXh0','a2')`,
    [Date.now(), p.to, Date.now()]);
  const sorted = (await S.campaigns(DB.sites.get('loja'), p, 'ad')).filter(r => !r.unmatched);
  assert.deepEqual(sorted.map(r => [r.id, r.sales]), [['a2', 1], ['a1', 0]], 'anúncios em ordem de vendas');
  await db.run("DELETE FROM sales WHERE order_id='ADX'");
});

test('páginas de vendas: números, auto-refresh a cada 5 minutos e indicador do sync', async () => {
  const dash = await req('/sites/loja', { cookie: admin });
  assert.equal(dash.status, 200);
  assert.match(kv(dash.text, "net"), /^R\$\s?424,50$/);
  assert.match(dash.text, /Vendas por pagamento/);
  assert.match(kv(dash.text, "meta-purchases"), /^3$/);
  assert.match(kv(dash.text, "meta-leads"), /^5$/);
  assert.match(dash.text, /<meta http-equiv="refresh" content="300">/, 'recarrega a cada 5 minutos');
  assert.match(dash.text, /Meta atualizada às \d{2}:\d{2}/);
  assert.match(kv((await req('/sites/loja?f_platform=hotmart', { cookie: admin })).text, "net"), /^R\$\s?377,50$/);
  assert.match((await req('/sites/loja/campaigns', { cookie: admin })).text, /Black Friday/);
  assert.match((await req('/sites/loja/campaigns?level=adset', { cookie: admin })).text, /Lookalike/);
  const ads = (await req('/sites/loja/campaigns?level=ad', { cookie: admin })).text;
  assert.ok(ads.includes('src="https://scontent.xx.fbcdn.net/v/t45/thumb1.jpg?oh=1"') && !ads.includes('javascript:alert'), 'imagem do criativo só da CDN da Meta');
  const refunded = await req('/sites/loja/orders?f_status=refunded', { cookie: admin });
  assert.ok(refunded.text.includes('K1') && !refunded.text.includes('HP1'));
  assert.match((await req('/sites/loja/integrations', { cookie: admin })).text, new RegExp(`/hooks/${W.hookToken(DB.sites.get('loja'), 'kiwify')}/kiwify`));
  const oldToken = W.hookToken(DB.sites.get('loja'), 'generic');
  assert.equal((await req('/sites/loja/integrations', { cookie: admin, form: { action: 'rotate' } })).status, 303);
  assert.equal((await hook('generic', { order_id: 'G2', status: 'paid', amount: 1 }, oldToken)).status, 404, 'token antigo para de funcionar');
  assert.equal(period(new URLSearchParams('range=today'), 'America/Sao_Paulo').from, today);
});

test('forma de pagamento: códigos das plataformas', async () => {
  const { method } = await import('../src/sales/webhooks.js');
  assert.deepEqual(['cc', 'cc_pix', 'pix', 'billet', 'credit_card', 'x'].map(method), ['card', 'pix', 'pix', 'boleto', 'card', 'other'], 'OnProfit manda cc, cc_pix e billet');
});
