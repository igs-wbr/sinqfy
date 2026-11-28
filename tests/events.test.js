// Webhook de eventos do produto (cadastro, primeiro app, publicação) e o funil self-serve.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { boot } from './helpers.js';

const { req, login, close } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const W = await import('../src/sales/webhooks.js');
const S = await import('../src/sales/stats.js');
const { localDate } = await import('../src/time.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'ps', name: 'Programe Studio', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
await req('/sites/ps/integrations', { cookie: admin, form: { action: 'capi', pixel: '777001', capi_token: 'CAPI' } });
const site = DB.sites.get('ps');
const eventsUrl = `/hooks/${W.hookToken(site, 'events')}/events`;
const post = (body, headers = {}, url = eventsUrl) => req(url, { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
const today = localDate(Date.now(), 'America/Sao_Paulo');
const rid = 'AbCdEfGhIjKlMnOpQrStUv';
const sha = v => createHash('sha256').update(v).digest('hex');
const clickTs = Date.now() - 60e3, CLICK_FBC = `fb.1.${clickTs}.fbclid1`;

// O clique do anúncio que o backend vai herdar: rid, fbc, fbp, UTMs, user agent e a página.
await db.run(`INSERT INTO events(site,date,ts,visitor,name,path,channel,utm_source,utm_medium,utm_campaign,utm_content,utm_term,country,rid,event_id,fbc,fbp,ua,host,ga_cid)
  VALUES ('ps',?,?,?, 'pageview','/','Social pago','FB','SELF|111','SELF|111','PS-022a|222','', 'BR', ?, 'click-1', ?, 'fb.1.1790000000000.fbp1', ?, 'programe.studio', '123.456')`,
[ today, clickTs, rid, rid, CLICK_FBC, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0' ]);

test('eventos do produto: CompleteRegistration vai à Meta com o clique e uma vez só por usuário', async () => {
  const body = { event_name: 'CompleteRegistration', user_id: 'usr_1', rid, email: 'Cliente@Empresa.com.br', phone: '11999998888',
    name: 'João Silva', url: 'https://programe.studio/signup', props: { credits_used: 10 } };
  assert.equal((await post(body)).status, 200);
  const ev = await db.get("SELECT * FROM events WHERE site='ps' AND event_id='completeregistration_usr_1'");
  assert.deepEqual([ev.name, ev.rid, ev.path, ev.utm_campaign, ev.utm_content, ev.channel], ['CompleteRegistration', rid, '/signup', 'SELF|111', 'PS-022a|222', 'Social']);
  const d = await db.get("SELECT payload FROM deliveries WHERE site='ps' AND dest='meta' AND event_id='completeregistration_usr_1'");
  const p = JSON.parse(d.payload);
  assert.deepEqual([p.event_name, p.action_source, p.event_source_url], ['CompleteRegistration', 'website', 'https://programe.studio/signup']);
  assert.equal(p.user_data.em[0], sha('cliente@empresa.com.br'));
  assert.equal(p.user_data.ph[0], sha('5511999998888'));
  assert.deepEqual([p.user_data.fn[0], p.user_data.ln[0]], [sha('joão'), sha('silva')], 'nome normalizado como no Purchase');
  assert.equal(p.user_data.external_id[0], sha(rid), 'external_id é o hash do rid');
  assert.equal(p.user_data.fbc, CLICK_FBC);
  assert.equal(p.user_data.fbp, 'fb.1.1790000000000.fbp1');
  assert.ok(p.user_data.client_user_agent && !JSON.stringify(p).includes('Cliente@'), 'e-mail só em hash');

  assert.equal((await post(body)).status, 200, 'reenvio do backend responde 200');
  assert.equal((await db.get("SELECT COUNT(*) n FROM events WHERE site='ps' AND event_id='completeregistration_usr_1'")).n, 1, 'não duplica o evento');
  assert.equal((await db.get("SELECT COUNT(*) n FROM deliveries WHERE site='ps' AND event_id='completeregistration_usr_1'")).n, 1, 'não duplica o envio');
});

test('eventos do produto: first_build sem rid acha o clique pelo e-mail do contato', async () => {
  const r = await post({ event_name: 'first_build', user_id: 'usr_1', email: 'cliente@empresa.com.br', url: 'https://programe.studio/app' });
  assert.equal(r.status, 200);
  const ev = await db.get("SELECT * FROM events WHERE site='ps' AND event_id='first_build_usr_1'");
  assert.deepEqual([ev.name, ev.rid, ev.utm_campaign], ['first_build', rid, 'SELF|111'], 'herdou rid e campanha pelo e-mail');
  const p = JSON.parse((await db.get("SELECT payload FROM deliveries WHERE site='ps' AND event_id='first_build_usr_1'")).payload);
  assert.deepEqual([p.event_name, p.action_source, p.user_data.fbc], ['first_build', 'website', CLICK_FBC]);
  assert.deepEqual(await db.get("SELECT COUNT(*) n FROM contacts WHERE site='ps'"), { n: 1 }, 'um contato só para os dois eventos');
});

test('eventos do produto: Purchase é recusado, token errado é 404 e segredo exige X-Rastro-Signature', async () => {
  assert.equal((await post({ event_name: 'Purchase', user_id: 'usr_2' })).status, 400);
  assert.equal((await post({ event_name: 'CompleteRegistration', user_id: 'usr_2' }, {}, '/hooks/token-errado/events')).status, 404);
  assert.equal((await post({ event_name: 'CompleteRegistration', user_id: 'usr_2', email: 'x@y.com' })).status, 200);

  await db.run("UPDATE sites SET hook_secrets=? WHERE id='ps'", [JSON.stringify({ events: 'segredo-events' })]);
  await DB.loadSites();
  const body = JSON.stringify({ event_name: 'app_published', user_id: 'usr_3', email: 'z@y.com' });
  assert.equal((await post(body)).status, 401, 'sem assinatura, recusa');
  const sig = 'sha256=' + createHmac('sha256', 'segredo-events').update(body).digest('hex');
  assert.equal((await post(body, { 'x-rastro-signature': sig })).status, 200);
});

test('renovação automática: grava em sales, mas não manda Purchase à Meta; a 1ª assinatura manda', async () => {
  const hook = (platform, body) => req(`/hooks/${W.hookToken(DB.sites.get('ps'), platform)}/${platform}`, { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  assert.equal((await hook('generic', { order_id: 'REN1', status: 'paid', amount: 149, kind: 'subscription_cycle', email: 'cliente@empresa.com.br' })).status, 200);
  assert.equal((await db.get("SELECT status FROM sales WHERE site='ps' AND order_id='REN1'")).status, 'paid', 'a receita recorrente entra em sales');
  assert.ok(!(await db.get("SELECT 1 FROM deliveries WHERE site='ps' AND event_id='generic-REN1'")), 'renovação não vira Purchase na Meta');

  assert.equal((await hook('generic', { order_id: 'NEW1', status: 'paid', amount: 149, kind: 'subscription_create', email: 'novo@empresa.com' })).status, 200);
  assert.ok(await db.get("SELECT 1 FROM deliveries WHERE site='ps' AND dest='meta' AND event_id='generic-NEW1'"), 'aquisição continua indo à Meta');

  const inv = W.PARSERS.stripe({ type: 'invoice.paid', data: { object: { id: 'in_1', status: 'paid', amount_paid: 14900, currency: 'brl', created: 1790000000,
    billing_reason: 'subscription_cycle', customer_email: 'a@b.com' } } });
  assert.deepEqual([inv.status, inv.gross, inv.kind, inv.order_id], ['paid', 149, 'subscription_cycle', 'in_1']);
});

test('funil self-serve: cadastro, 1º app e publicação por campanha e na tela de Funis', async () => {
  await db.run(`INSERT INTO ad_spend(site, platform, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
      spend, impressions, clicks, meta_link_clicks, meta_lpv, meta_registrations, meta_first_builds, meta_app_published)
    VALUES ('ps','meta',?, '111','SELF|111','333','S1','222','PS-022a', 100, 10000, 200, 180, 150, 1, 1, 1)`, [today]);
  const rows = await S.campaigns(DB.sites.get('ps'), { from: today, to: today }, 'campaign');
  const c = rows.find(r => r.id === '111');
  assert.deepEqual([c.regs, c.builds, c.pubs, c.metaRegs, c.metaBuilds, c.metaPubs], [1, 1, 0, 1, 1, 1]);
  assert.deepEqual([c.costReg, c.activation, c.costBuild], [100, 1, 100]);

  const page = (await req('/sites/ps/campaigns', { cookie: admin })).text;
  assert.match(page, /Cadastros/, 'coluna de cadastros na tabela');
  assert.match(page, /Custo\/cadastro/);
  assert.match(page, /Criou conta/, 'etapa no funil dos anúncios');
  assert.match(page, /Gerou 1º app/);

  const funnels = (await req('/sites/ps/funnels', { cookie: admin })).text;
  assert.match(funnels, /Criaram conta/);
  assert.match(funnels, /Geraram o 1º app/);
  assert.match(funnels, /Publicaram o app/);
});

test('isolamento: eventos do produto não alteram visitas da Visão geral, o assistente de vendas nem o filtro de Pedidos', async () => {
  const { setupState } = await import('../src/routes/setup.js');
  const T = await import('../src/tracking/stats.js');
  // Site novo que só recebeu PageView e CompleteRegistration (sem nenhuma venda ainda):
  await req('/sites', { cookie: admin, form: { id: 'outro', name: 'Outro Cliente', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
  const o = DB.sites.get('outro');
  const r2 = 'ZzYyXxWwVvUuTtSsRrQqPp';
  await db.run(`INSERT INTO events(site,date,ts,visitor,session,name,path,channel,screen,browser,os,country,rid,event_id)
    VALUES ('outro',?,?,?, 'sess1','pageview','/','Direto','desktop','Chrome','Windows','BR',?,'pv-o1')`, [today, Date.now() - 10e3, r2, r2]);
  const res = await req(`/hooks/${W.hookToken(o, 'events')}/events`, {
    body: JSON.stringify({ event_name: 'CompleteRegistration', user_id: 'u_o1', rid: r2, email: 'o@cliente.com' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.status, 200);
  // 1. O passo 5 do assistente ("Plataforma de venda") continua pendente até chegar uma venda real:
  const st = await setupState(o);
  assert.equal(st.steps.checkout, false, 'evento de produto não marca Plataforma de venda como concluída');
  // 2. O evento do backend dentro de 30 min herda a sessão do navegador (1 visita só, não 2):
  const ov = await T.overview(o, { from: today, to: today, days: 1 }, {});
  assert.deepEqual([ov.cur.visitors, ov.cur.visits, ov.cur.pageviews], [1, 1, 1]);
  assert.deepEqual(ov.apps.map(a => [a.k, a.n]), [['Chrome', 1]], 'sem linha fantasma de navegador vazio');
  // 3. Mesmo um evento fora de sessão (outro dia/dispositivo, session=NULL) não cria sessão fantasma:
  await req(`/hooks/${W.hookToken(o, 'events')}/events`, {
    body: JSON.stringify({ event_name: 'first_build', user_id: 'u_sem_sessao', email: 'ghost@cliente.com' }),
    headers: { 'content-type': 'application/json' },
  });
  const ov2 = await T.overview(o, { from: today, to: today, days: 1 }, {});
  assert.equal(ov2.cur.visits, 1, 'evento sem sessão de navegador não infla visitas');
  assert.deepEqual(ov2.apps.map(a => [a.k, a.n]), [['Chrome', 1]]);
  // 4. Filtro de plataformas na tela de Pedidos não exibe "Eventos do produto":
  const ordersHtml = (await req('/sites/outro/orders', { cookie: admin })).text;
  assert.ok(!ordersHtml.includes('Eventos do produto'), 'Pedidos só lista plataformas de venda');
});

