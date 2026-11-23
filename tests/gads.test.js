// Google Ads pela Data Manager API (ADR 0024): configuração, Lead com gclid e compra do webhook casada com o clique.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, createVerify } from 'node:crypto';
import { boot, CHROME } from './helpers.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY = { type: 'service_account', project_id: 'projeto-x', client_email: 'sinqfy@projeto-x.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://evil.example/token' };

// Google simulado; o resto do fetch é real (servidor local).
const logins = [], ingests = [];
let fail = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url)), json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.host === 'oauth2.googleapis.com') { logins.push(new URLSearchParams(String(opts.body)).get('assertion')); return json({ access_token: 'ya29.teste', expires_in: 3600 }); }
  if (u.host === 'datamanager.googleapis.com') {
    if (fail) return json({ error: { code: 400, message: fail } }, 400);
    ingests.push({ url: u, headers: opts.headers, body: JSON.parse(opts.body) });
    return json({ requestId: 'REQ1' });
  }
  if (u.host === 'graph.facebook.com') return json({ events_received: 1 });
  assert.notEqual(u.host, 'evil.example', 'nunca usa o token_uri da chave colada');
  return realFetch(url, opts);
};

const { req, login, close, base } = await boot();
const { db } = await import('../src/db.js');
const DB = await import('../src/db.js');
const D = await import('../src/dispatch.js');
const W = await import('../src/sales/webhooks.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'gad', name: 'Gad', timezone: 'UTC', currency: 'BRL' } });
const integ = form => req('/sites/gad/integrations', { cookie: admin, form: { action: 'gads', ...form } });
const h = v => createHash('sha256').update(v).digest('hex');
const edge = { 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': 'RidDoGoogle0123456789A', 'cf-ipcountry': 'BR' };
const beacon = body => fetch(base + '/e', { method: 'POST', body: JSON.stringify(body), headers: { 'user-agent': CHROME, 'x-forwarded-for': '203.0.113.9', ...edge } });

test('configuração: validação e chave cifrada no banco', async () => {
  const ok = { gads_customer: '123-456-7890', gads_actions: 'Purchase = 111\nLead: 222', gads_key: JSON.stringify(KEY) };
  assert.equal((await integ({ ...ok, gads_customer: '12345' })).status, 400, 'conta com 10 dígitos');
  assert.equal((await integ({ ...ok, gads_actions: '' })).status, 400, 'sem ação de conversão');
  assert.equal((await integ({ ...ok, gads_actions: 'Purchase = abc' })).status, 400, 'ID da ação numérico');
  assert.equal((await integ({ ...ok, gads_actions: 'Purchase = 111\ncompra = 111' })).status, 400, 'mesma ação em dois eventos contaria duas vezes');
  assert.equal((await integ({ ...ok, gads_key: '{"type":"service_account"}' })).status, 400, 'chave incompleta');
  assert.equal((await integ({ ...ok, gads_key: '' })).status, 400, 'primeira vez exige a chave');
  assert.equal((await integ(ok)).status, 303);
  const s = await db.get("SELECT gads_customer, gads_login, gads_key, gads_actions FROM sites WHERE id='gad'");
  assert.deepEqual([s.gads_customer, s.gads_login, JSON.parse(s.gads_actions)], ['1234567890', null, { Purchase: '111', Lead: '222' }]);
  assert.ok(s.gads_key.startsWith('v1.') && !s.gads_key.includes('PRIVATE KEY'), 'chave privada cifrada com a DATA_KEY');
  assert.equal((await integ({ ...ok, gads_key: '' })).status, 303, 'depois, campo vazio mantém a chave');
  const page = await req('/sites/gad/integrations', { cookie: admin });
  assert.ok(page.text.includes('Google Ads: conversões offline') && page.text.includes(KEY.client_email) && page.text.includes('Purchase = 111'));
});

test('Lead do site vai com o gclid da visita; pageview e eventos sem ação não vão', async () => {
  await beacon({ s: 'gad', u: 'https://gad.dev/oferta?gclid=Cj0KCQ-teste', i: 'evt_gads_pv01' });
  await beacon({ s: 'gad', n: 'Lead', u: 'https://gad.dev/obrigado', i: 'evt_gads_ld01', v: 5, l: { e: 'Fulano.Silva@GMAIL.com', p: '(11) 98765-4321' } });
  await beacon({ s: 'gad', n: 'Outro', u: 'https://gad.dev/x', i: 'evt_gads_ot01' });
  const q = await db.all("SELECT event_id FROM deliveries WHERE site='gad' AND dest='gads'");
  assert.deepEqual(q.map(r => r.event_id), ['evt_gads_ld01']);

  assert.deepEqual(await D.dispatch(), { sent: 1, failed: 0, retry: 0 });
  const [{ url, headers, body }] = ingests;
  assert.equal(url.pathname, '/v1/events:ingest');
  assert.deepEqual([headers.authorization, headers['x-goog-user-project']], ['Bearer ya29.teste', 'projeto-x']);
  assert.deepEqual(body.destinations, [{ operatingAccount: { accountType: 'GOOGLE_ADS', accountId: '1234567890' }, productDestinationId: '222' }]);
  assert.equal(body.encoding, 'HEX');
  const [ev] = body.events;
  assert.deepEqual([ev.transactionId, ev.eventSource, ev.adIdentifiers, ev.conversionValue, ev.currency], ['evt_gads_ld01', 'WEB', { gclid: 'Cj0KCQ-teste' }, 5, 'BRL']);
  assert.deepEqual(ev.userData.userIdentifiers, [{ emailAddress: h('fulanosilva@gmail.com') }, { phoneNumber: h('+5511987654321') }], 'Gmail sem pontos, telefone em E.164');

  // JWT da conta de serviço: assinado com a chave dela, escopo da Data Manager, audiência fixa do Google.
  const [hd, pl, sig] = logins[0].split('.');
  assert.ok(createVerify('RSA-SHA256').update(`${hd}.${pl}`).verify(publicKey, sig, 'base64url'));
  const claims = JSON.parse(Buffer.from(pl, 'base64url'));
  assert.deepEqual([claims.iss, claims.scope, claims.aud], [KEY.client_email, 'https://www.googleapis.com/auth/datamanager', 'https://oauth2.googleapis.com/token']);
  const d = await db.get("SELECT status, response FROM deliveries WHERE event_id='evt_gads_ld01'");
  assert.deepEqual([d.status, d.response], ['sent', 'aceito pelo Google Ads · requestId REQ1']);
});

const hotmart = (tx, value, email = 'comprador@dd.dev') => fetch(`${base}/hooks/${W.hookToken(DB.sites.get('gad'), 'hotmart')}/hotmart`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ event: 'PURCHASE_APPROVED', data: { product: { name: 'Curso' }, buyer: { email },
    purchase: { transaction: tx, order_date: Date.now(), price: { value, currency_value: 'BRL' }, payment: { type: 'PIX' }, origin: { xcod: 'RidDoGoogle0123456789A' } } } }) });
const gadsPurchases = async () => (await db.all("SELECT event_id FROM deliveries WHERE site='gad' AND dest='gads' AND name='Purchase' ORDER BY id")).map(r => r.event_id);

test('compra do webhook casada pelo rid leva o gclid; order bump soma, upsell depois do envio não vira outra conversão', async () => {
  assert.equal((await hotmart('HP-1', 297)).status, 200);
  assert.equal((await hotmart('HP-2', 47)).status, 200, 'order bump do mesmo comprador');
  assert.equal((await hotmart('HX-1', 97, 'outra@dd.dev')).status, 200, 'outro comprador');
  assert.deepEqual(await gadsPurchases(), ['hotmart-HP-1', 'hotmart-HX-1']);
  const before = ingests.length;
  assert.deepEqual(await D.dispatch(), { sent: 0, failed: 0, retry: 0 }, 'a compra espera o order bump e o upsell');
  assert.deepEqual(await D.dispatch({ now: Date.now() + D.PURCHASE_HOLD + 1e3 }), { sent: 2, failed: 0, retry: 0 });
  const [a, b] = ingests.slice(before).map(i => i.body);
  assert.deepEqual([a.destinations[0].productDestinationId, a.events[0].transactionId, a.events[0].eventSource, a.events[0].adIdentifiers, a.events[0].conversionValue],
    ['111', 'hotmart-HP-1', 'WEB', { gclid: 'Cj0KCQ-teste' }, 344], 'uma conversão com o valor somado');
  assert.ok(!('order_ids' in a) && !('order_ids' in a.events[0]), 'controle interno não vai ao Google');
  assert.deepEqual(a.events[0].userData.userIdentifiers, [{ emailAddress: h('comprador@dd.dev') }]);
  assert.deepEqual([b.events[0].transactionId, b.events[0].conversionValue], ['hotmart-HX-1', 97]);
  assert.equal(logins.length, 1, 'token reaproveitado');

  assert.equal((await hotmart('HP-3', 197)).status, 200, 'upsell depois do envio');
  assert.deepEqual(await gadsPurchases(), ['hotmart-HP-1', 'hotmart-HX-1'], 'não vira outra conversão');
  const log = await db.get("SELECT message FROM webhook_log WHERE site='gad' AND order_id='HP-3' ORDER BY id DESC LIMIT 1");
  assert.match(log.message, /já enviada ao Google Ads/);
});

test('erro 4xx do Google falha sem reenvio e aparece na aba Eventos', async () => {

  fail = 'Conversion action not found';
  await beacon({ s: 'gad', n: 'Lead', u: 'https://gad.dev/obrigado', i: 'evt_gads_ld02' });
  assert.deepEqual(await D.dispatch(), { sent: 0, failed: 1, retry: 0 });
  const page = await req('/sites/gad/events', { cookie: admin });
  assert.ok(page.text.includes('Google Ads ✕') && page.text.includes('Conversion action not found'));
  fail = null;
});

test('último clique: com clique da Meta e do Google, a compra vai só para o mais recente', async () => {
  assert.deepEqual([
    W.lastClick({ fbc: 'fb.1.1700000000000.IwAR', gclickTs: 1700000001000 }), W.lastClick({ fbc: 'fb.1.1700000002.IwAR', gclickTs: 1700000001000 }),
    W.lastClick({ fbc: 'fb.1.1700000000000.IwAR' }), W.lastClick({ gclickTs: 1700000001000 }), W.lastClick(null)], ['gads', 'meta', null, null, null]);

  assert.equal((await req('/sites/gad/integrations', { cookie: admin, form: { action: 'capi', pixel: '555003', capi_token: 'TOK' } })).status, 303);
  const visit = (rid, fbcAt, url) => fetch(base + '/e', { method: 'POST', body: JSON.stringify({ s: 'gad', u: url }),
    headers: { 'user-agent': CHROME, 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': rid, 'x-rastro-fbc': `fb.1.${fbcAt}.IwAR-${rid}`, 'cf-ipcountry': 'BR' } });
  const buy = (tx, rid, email) => fetch(`${base}/hooks/${W.hookToken(DB.sites.get('gad'), 'hotmart')}/hotmart`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'PURCHASE_APPROVED', data: { product: { name: 'Curso' }, buyer: { email },
      purchase: { transaction: tx, order_date: Date.now(), price: { value: 100, currency_value: 'BRL' }, payment: { type: 'PIX' }, origin: { xcod: rid } } } }) });
  const dests = async tx => (await db.all("SELECT dest FROM deliveries WHERE site='gad' AND name='Purchase' AND event_id=? ORDER BY dest", [`hotmart-${tx}`])).map(r => r.dest);
  const log = async tx => (await db.get("SELECT message FROM webhook_log WHERE site='gad' AND order_id=? ORDER BY id DESC LIMIT 1", [tx])).message;

  // Clicou na Meta há 1 h e depois no Google: só o Google Ads recebe.
  const g = 'UltimoGoogle0123456789';
  await visit(g, Date.now() - 3600e3, 'https://gad.dev/?gclid=Cj0-ultimo-google');
  assert.equal((await buy('LC-1', g, 'ultimo.google@dd.dev')).status, 200);
  assert.deepEqual(await dests('LC-1'), ['gads']);
  assert.match(await log('LC-1'), /Último clique no Google Ads: compra não enviada à Meta/);
  assert.ok((await db.get("SELECT purchase_ts FROM contacts WHERE site='gad' AND rid=?", [g]))?.purchase_ts, 'o quadro do CRM não reenvia à Meta');

  // Clicou no Google e depois na Meta: só a Meta recebe.
  const m = 'UltimoMeta012345678901';
  await visit(m, Date.now() + 3600e3, 'https://gad.dev/?gclid=Cj0-antes-da-meta');
  assert.equal((await buy('LC-2', m, 'ultimo.meta@dd.dev')).status, 200);
  assert.deepEqual(await dests('LC-2'), ['meta']);
  assert.match(await log('LC-2'), /Último clique no anúncio da Meta: compra não enviada ao Google Ads/);

  await req('/sites/gad/integrations', { cookie: admin, form: { action: 'capi', pixel: '' } });
});

test('desativar apaga a configuração', async () => {
  assert.equal((await integ({ gads_customer: '' })).status, 303);
  assert.deepEqual(await db.get("SELECT gads_customer, gads_key, gads_actions FROM sites WHERE id='gad'"), { gads_customer: null, gads_key: null, gads_actions: null });
});
