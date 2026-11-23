// Etapa 3: checkout externo. Venda casada com o clique (rid), assinaturas, novas plataformas,
// webhook personalizado com mapa de campos e Google Sheets.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { boot, CHROME } from './helpers.js';

const { req, login, close, base } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const D = await import('../src/dispatch.js');
const W = await import('../src/sales/webhooks.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'chk', name: 'Chk', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
const integ = form => req('/sites/chk/integrations', { cookie: admin, form });
await integ({ action: 'capi', pixel: '555003', capi_token: 'TOK' });
await integ({ action: 'ga4', ga4_id: 'G-CHK001', ga4_secret: 'S' });
const token = (await db.get("SELECT webhook_token t FROM sites WHERE id='chk'")).t;
const tk = platform => W.hookToken(DB.sites.get('chk'), platform);
const post = (platform, body, headers = {}) => fetch(`${base}/hooks/${tk(platform)}/${platform}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
const RID = 'Q7mK2pX9vLw4RtY8nB1cZa';
const sha = v => createHash('sha256').update(v).digest('hex');
const queued = async (eventId, dest = 'meta') => JSON.parse((await db.get('SELECT payload FROM deliveries WHERE event_id=? AND dest=?', [eventId, dest]))?.payload || 'null');

// O visitante clicou no anúncio (com UTM e fbclid), navegou e foi ao checkout.
const edge = { 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': RID, 'x-rastro-fbp': 'fb.1.1763080000000.4829104837', 'x-rastro-fbc': 'fb.1.1763080000000.IwAR-clique', 'x-rastro-ip': '198.51.100.9',
  'x-rastro-city': encodeURIComponent('São Paulo'), 'x-rastro-region': 'SP' };
const beacon = body => fetch(base + '/e', { method: 'POST', body: JSON.stringify({ s: 'chk', ...body }), headers: { 'user-agent': CHROME, ...edge } });
await beacon({ u: 'https://loja.dev/oferta?utm_source=FB&utm_medium=LAL%7C222&utm_campaign=BF%7C111&utm_content=AD12%7C333&fbclid=IwAR-clique', i: 'evt_chk00001', g: '123.456' });
await beacon({ n: 'InitiateCheckout', u: 'https://loja.dev/checkout', i: 'evt_chk00002' });

test('Hotmart: rid em xcod casa com o clique, herda UTMs e a compra vai como website com fbc e user agent', async () => {
  const body = { event: 'PURCHASE_APPROVED', data: { product: { name: 'Curso' }, buyer: { email: 'a@b.com' },
    purchase: { transaction: 'HPX1', price: { value: 297, currency_value: 'BRL' }, payment: { type: 'PIX' }, order_date: Date.now(), origin: { xcod: RID } } } };
  assert.equal((await post('hotmart', body)).status, 200);
  const s = await db.get("SELECT * FROM sales WHERE order_id='HPX1'");
  assert.deepEqual([s.rid, s.match_rule, s.utm_campaign, s.campaign_key, s.adset_key, s.ad_key], [RID, 'rid', 'BF|111', '111', '222', '333'], 'UTMs herdadas do clique');
  const ev = (await queued('hotmart-HPX1')).user_data ? await queued('hotmart-HPX1') : null;
  assert.equal(ev.action_source, 'website');
  assert.equal(ev.event_source_url, 'https://loja.dev/checkout');
  assert.deepEqual([ev.user_data.fbc, ev.user_data.fbp, ev.user_data.client_user_agent, ev.user_data.external_id[0]], [edge['x-rastro-fbc'], edge['x-rastro-fbp'], CHROME, sha(RID)]);
  // ADR 0020: IP, cidade e UF do clique no checkout; a cópia cifrada sai do banco quando a compra entra na fila.
  assert.deepEqual([ev.user_data.client_ip_address, ev.user_data.st[0], ev.user_data.ct[0]], ['198.51.100.9', sha('sp'), sha('saopaulo')]);
  assert.equal((await db.all("SELECT 1 FROM checkout_clicks WHERE site='chk'")).length, 0);
  const g = await queued('hotmart-HPX1', 'ga4');
  assert.deepEqual([g.client_id, g.events[0].name, g.events[0].params.transaction_id, g.events[0].params.value], ['123.456', 'purchase', 'hotmart-HPX1', 297]);
});

test('a compra aparece na tela de eventos, com o envio da Meta e os IDs do clique', async () => {
  const page = (await req('/sites/chk/events?partial=1', { cookie: admin })).text;
  const row = page.split('<tr>').find(t => t.includes('hotmart-HPX1'));
  assert.ok(row, 'linha da compra');
  assert.ok(row.includes('Purchase') && row.includes('Curso') && row.includes('Hotmart') && row.includes('Meta') && row.includes('na fila'), 'compra com produto, plataforma e selo da fila');
  assert.ok(row.includes(edge['x-rastro-fbc']) && row.includes(edge['x-rastro-fbp']), 'fbc e fbp do clique');
  await db.run("UPDATE sales SET utm_content='AD12|333::PAZXh0bgNhZW0' WHERE order_id='HPX1'");
  const row2 = (await req('/sites/chk/events?partial=1', { cookie: admin })).text.split('<tr>').find(t => t.includes('hotmart-HPX1'));
  assert.ok(row2.includes('BF · AD12') && !row2.includes('PAZXh0'), 'anúncio sem o código colado depois de ::');
});

test('Hotmart: sck fixo do produtor não toma o lugar da campanha do clique', async () => {
  const body = { event: 'PURCHASE_APPROVED', data: { purchase: { transaction: 'HPSCK', price: { value: 47 }, order_date: Date.now(), origin: { xcod: RID, sck: 'lp-ahsd-47' } } } };
  assert.equal((await post('hotmart', body)).status, 200);
  const s = await db.get("SELECT utm_campaign, campaign_key, ad_key FROM sales WHERE order_id='HPSCK'");
  assert.deepEqual([s.utm_campaign, s.campaign_key, s.ad_key], ['BF|111', '111', '333']);
});

test('venda anterior ao clique não herda o clique', async () => {
  const old = Date.now() - 40 * 864e5;
  const body = { event: 'PURCHASE_APPROVED', data: { buyer: { email: 'o@l.d' }, purchase: { transaction: 'HPOLD', price: { value: 50 }, order_date: old, origin: { xcod: RID } } } };
  assert.equal((await post('hotmart', body)).status, 200);
  assert.equal((await db.get("SELECT match_rule FROM sales WHERE order_id='HPOLD'")).match_rule, 'none');
});

test('sem clique: compra vai como other e não vai ao GA4; UTM vira a regra', async () => {
  const body = { event: 'PURCHASE_APPROVED', data: { buyer: { email: 'c@d.com', checkout_phone: '(11) 98888-7777', name: 'Ana Maria Conceição' },
    purchase: { transaction: 'HPX2', price: { value: 100 }, order_date: Date.now(), origin: { src: 'FB', sck: 'Outra|999' } } } };
  assert.equal((await post('hotmart', body)).status, 200);
  assert.equal((await db.get("SELECT match_rule FROM sales WHERE order_id='HPX2'")).match_rule, 'utm');
  const ev = await queued('hotmart-HPX2');
  assert.equal(ev.action_source, 'other');
  assert.equal(ev.user_data.ph[0], sha('5511988887777'), 'telefone com DDI 55');
  assert.deepEqual([ev.user_data.fn, ev.user_data.ln, ev.user_data.country], [[sha('ana')], [sha('conceição')], [sha('br')]], 'nome e país em hash');
  assert.equal(await queued('hotmart-HPX2', 'ga4'), null);
});

test('assinaturas: Hotmart (hottok), Shopify, WooCommerce e Stripe', async () => {
  assert.equal((await integ({ action: 'secrets', secret_hotmart: 'HOTTOK1', secret_shopify: 'shp', secret_woocommerce: 'woo', secret_stripe: 'whsec_x' })).status, 303);
  const hot = { event: 'PURCHASE_APPROVED', data: { buyer: { email: 'x@y.com' }, purchase: { transaction: 'HPS1', price: { value: 1 } } } };
  assert.equal((await post('hotmart', hot)).status, 401);
  assert.equal((await post('hotmart', hot, { 'x-hotmart-hottok': 'HOTTOK1' })).status, 200);

  const shop = JSON.stringify({ id: 9001, financial_status: 'paid', total_price: '150.00', currency: 'BRL', email: 's@h.com', created_at: new Date(Date.now() - 3600e3).toISOString(),
    landing_site: '/?utm_source=FB&utm_campaign=Shop%7C77&fbclid=IwAR-shop', client_details: { user_agent: CHROME }, line_items: [{ title: 'Tênis' }] });
  assert.equal((await post('shopify', shop, { 'x-shopify-hmac-sha256': 'errado' })).status, 401);
  assert.equal((await post('shopify', shop, { 'x-shopify-hmac-sha256': createHmac('sha256', 'shp').update(shop).digest('base64') })).status, 200);
  const sh = await db.get("SELECT * FROM sales WHERE platform='shopify'");
  assert.deepEqual([sh.order_id, sh.gross, sh.utm_campaign, sh.product, sh.match_rule], ['9001', 150, 'Shop|77', 'Tênis', 'utm']);
  const shEv = await queued('shopify-9001');
  assert.match(shEv.user_data.fbc, /\.IwAR-shop$/, 'fbclid do landing_site vira fbc');

  const woo = JSON.stringify({ id: 77, status: 'processing', total: '89.90', currency: 'BRL', billing: { email: 'w@c.com' }, line_items: [{ name: 'Caneca' }],
    meta_data: [{ key: '_wc_order_attribution_utm_source', value: 'google' }, { key: '_wc_order_attribution_utm_campaign', value: 'Woo|55' }] });
  assert.equal((await post('woocommerce', woo, { 'x-wc-webhook-signature': createHmac('sha256', 'woo').update(woo).digest('base64') })).status, 200);
  assert.deepEqual(Object.values(await db.get("SELECT gross, utm_source, utm_campaign FROM sales WHERE platform='woocommerce'")), [89.9, 'google', 'Woo|55']);

  const stripe = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_intent: 'pi_1', payment_status: 'paid', amount_total: 4990, currency: 'brl',
    created: Math.floor(Date.now() / 1000), client_reference_id: RID, customer_details: { email: 'st@r.pe' }, payment_method_types: ['card'] } } });
  const t = Math.floor(Date.now() / 1000), sig = createHmac('sha256', 'whsec_x').update(`${t}.${stripe}`).digest('hex');
  assert.equal((await post('stripe', stripe, { 'stripe-signature': `t=${t},v1=deadbeef` })).status, 401);
  assert.equal((await post('stripe', stripe, { 'stripe-signature': `t=${t - 900},v1=${createHmac('sha256', 'whsec_x').update(`${t - 900}.${stripe}`).digest('hex')}` })).status, 401, 'assinatura vencida');
  assert.equal((await post('stripe', stripe, { 'stripe-signature': `t=${t},v1=${sig}` })).status, 200);
  assert.deepEqual(Object.values(await db.get("SELECT order_id, gross, method, rid, match_rule FROM sales WHERE platform='stripe'")), ['pi_1', 49.9, 'card', RID, 'rid']);

  const crossUrl = await fetch(`${base}/hooks/${tk('hotmart')}/generic`, { method: 'POST', body: JSON.stringify({ order_id: 'FAKE', status: 'paid', amount: 9999, email: 'z@z.com' }) });
  assert.equal(crossUrl.status, 404, 'URL da Hotmart não cria venda pelo genérico');
  assert.equal((await post('generic', { order_id: 'GEN1', status: 'paid', amount: 10 })).status, 200);
  assert.equal((await post('generic', { order_id: 'GEN1', status: 'pending', amount: 10 })).status, 200);
  assert.equal((await db.get("SELECT status FROM sales WHERE order_id='GEN1'")).status, 'paid', 'pendente atrasado não desfaz o pago');
  assert.equal((await post('generic', { order_id: 'GEN1', status: 'refunded', amount: 10 })).status, 200);
  assert.equal((await post('generic', { order_id: 'GEN1', status: 'paid', amount: 10 })).status, 200);
  assert.equal((await db.get("SELECT status FROM sales WHERE order_id='GEN1'")).status, 'refunded', 'pago reenviado depois do reembolso não volta');
  assert.equal((await db.get("SELECT COUNT(*) n FROM deliveries WHERE event_id='generic-GEN1' AND dest='meta'")).n, 0, 'sem identificador, nada vai à Meta');
  assert.equal((await integ({ action: 'secrets', secret_hotmart: '-' })).status, 303);
  assert.equal(W.secretsOf(DB.sites.get('chk')).hotmart, undefined, '"-" apaga o segredo');
  assert.ok((await db.all("SELECT message FROM webhook_log WHERE site='chk'")).some(l => l.message === 'Hottok não confere'));
});

test('webhook personalizado: mapa de campos, prévia e recebimento', async () => {
  const map = { action: 'custom_map', f_order_id: 'data.order.code', f_status: 'data.order.state', f_amount: 'data.order.total_cents', f_email: 'data.client.mail',
    f_rid: 'data.tracking.rid', f_product: 'data.items[0].name', s_paid: 'APPROVED, PAID', s_refunded: 'REFUNDED', cents: '1' };
  const sample = { data: { order: { code: 'C-1', state: 'APPROVED', total_cents: 19700 }, client: { mail: 'p@q.com' }, tracking: { rid: RID }, items: [{ name: 'Mentoria' }] } };
  const prev = await integ({ ...map, action: 'custom_preview', sample: JSON.stringify(sample) });
  assert.equal(prev.status, 200);
  assert.ok(prev.text.includes('C-1') && prev.text.includes('Mentoria') && prev.text.includes('197'), 'prévia mostra a venda lida');
  assert.equal((await db.get("SELECT custom_map FROM sites WHERE id='chk'")).custom_map, null, 'prévia não salva');
  assert.equal((await integ({ ...map, f_amount: '' })).status, 400);
  assert.equal((await integ(map)).status, 303);
  assert.equal((await post('custom', sample)).status, 200);
  assert.equal((await post('custom', { data: { order: { code: 'C-2', state: 'WAITING', total_cents: 1 } } })).status, 200, 'status fora do mapa é ignorado');
  const c = await db.get("SELECT * FROM sales WHERE platform='custom'");
  assert.deepEqual([c.order_id, c.status, c.gross, c.product, c.match_rule, (await db.all("SELECT 1 FROM sales WHERE platform='custom'")).length], ['C-1', 'paid', 197, 'Mentoria', 'rid', 1]);
  // Nome do comprador vai para o Purchase (fn, ln em hash), como nas plataformas nativas.
  assert.equal(W.parseCustom({ id: 'X', p: 1, c: { name: 'Ana Souza' } }, { fields: { order_id: 'id', amount: 'p', name: 'c.name' } }).name, 'Ana Souza');
});

test('Google Sheets: linhas com cabeçalho em português, status e data brasileiros, resultado por linha', async () => {
  const send = body => fetch(`${base}/hooks/${tk('sheets')}/sheets`, { method: 'POST', body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json() }));
  const r = await send({ rows: [
    { row: 2, values: { 'Pedido': 'PL-1', 'Status': 'Aprovado', 'Valor': 'R$ 1.497,00', 'E-mail': 'f@g.com', 'Produto': 'Imersão', 'rid': RID } },
    { row: 3, values: { 'Pedido': 'PL-2', 'Situação': '', 'Valor': '97', 'Data': '13/11/2026 15:30' } },
    { row: 4, values: { 'Pedido': 'PL-3', 'Status': 'em análise', 'Valor': '10' } },
    { row: 5, values: { 'Status': 'pago', 'Valor': '10' } },
    { row: 6, values: { 'Pedido': 'PL-4', 'Status': 'pago', 'Valor': '' } },
  ] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.results.map(x => [x.row, x.ok]), [[2, true], [3, true], [4, false], [5, false], [6, false]]);
  assert.equal(r.json.results[4].message, 'Valor vazio', 'linha ainda sendo digitada não vira venda de valor zero');
  assert.equal(r.json.results[3].message, 'Pedido sem identificador');
  const p1 = await db.get("SELECT * FROM sales WHERE order_id='PL-1'");
  assert.deepEqual([p1.platform, p1.status, p1.gross, p1.product, p1.match_rule], ['sheets', 'paid', 1497, 'Imersão', 'rid']);
  assert.deepEqual(Object.values(await db.get("SELECT status, date FROM sales WHERE order_id='PL-2'")), ['paid', '2026-11-13'], 'status vazio conta como pago; data brasileira');
  assert.equal((await send({ rows: 'x' })).status, 400);
  assert.equal((await fetch(`${base}/hooks/token-errado/sheets`, { method: 'POST', body: '{"rows":[]}' })).status, 404);
});

test('tela: integrações mostram as novas fontes e o script da planilha; pedidos mostram a origem', async () => {
  const page = await req('/sites/chk/integrations', { cookie: admin });
  assert.ok(['Webhook personalizado', 'Google Sheets', 'rastroEnviar', `/hooks/${tk('sheets')}/sheets`, 'Shopify', 'Stripe', 'WooCommerce'].every(t => page.text.includes(t)));
  const orders = await req('/sites/chk/orders?range=30d', { cookie: admin });
  assert.ok(orders.text.includes('Clique (rid)') && orders.text.includes('UTM'));
});
