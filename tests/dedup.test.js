// Deduplicação: cada conversão chega à Meta uma vez só, seja qual for o caminho (navegador, Pixel espelhado,
// webhook repetido ou fora de ordem, duas fontes do mesmo pedido, quadro do CRM, reenvio após erro).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { boot, CHROME } from './helpers.js';

// Meta e GA4 simulados. `metaFail` faz as próximas N chamadas da Meta responderem 500.
const capi = [], ga4 = [];
let metaFail = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.host === 'graph.facebook.com') {
    if (metaFail > 0) { metaFail--; return new Response('{"error":{"message":"instável"}}', { status: 500 }); }
    const body = JSON.parse(opts.body);
    capi.push(...body.data);
    return new Response(JSON.stringify({ events_received: body.data.length }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.host === 'www.google-analytics.com') { ga4.push(JSON.parse(opts.body)); return new Response(null, { status: 204 }); }
  return realFetch(url, opts);
};

const { req, login, close, base } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const D = await import('../src/dispatch.js');
const W = await import('../src/sales/webhooks.js');
const C = await import('../src/crm.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'dd', name: 'Dedup', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
await req('/sites/dd/integrations', { cookie: admin, form: { action: 'capi', pixel: '555099', capi_token: 'TOK' } });
await req('/sites/dd/integrations', { cookie: admin, form: { action: 'ga4', ga4_id: 'G-DEDUP1', ga4_secret: 'S' } });
const site = () => DB.sites.get('dd');

const RID = 'DedupVisitante00000001';
const edge = { 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': RID, 'x-rastro-fbp': 'fb.1.1763080000000.5555555555', 'x-rastro-ip': '198.51.100.60' };
const beacon = body => fetch(base + '/e', { method: 'POST', body: JSON.stringify({ s: 'dd', u: 'https://dd.dev/oferta', ...body }), headers: { 'user-agent': CHROME, ...edge } });
const sale = (order, status, extra = {}) => ({ order_id: order, status, method: 'pix', gross: 197, net: 180, currency: 'BRL', product: 'Curso',
  utm: { source: 'FB', medium: '', campaign: 'BF|c1', content: '', term: '' }, email: 'comprador@dd.dev', ...extra });
const ingest = (platform, s, now = Date.now()) => W.ingestSale(site(), platform, s, now);
const hotmart = tx => ({ event: 'PURCHASE_APPROVED', data: { product: { name: 'Curso' }, buyer: { email: 'hot@dd.dev' },
  purchase: { transaction: tx, order_date: Date.now(), price: { value: 297, currency_value: 'BRL' }, payment: { type: 'PIX' } } } });
const hook = body => fetch(`${base}/hooks/${W.hookToken(site(), 'hotmart')}/hotmart`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const queued = (eventId, dest = 'meta') => db.all("SELECT * FROM deliveries WHERE site='dd' AND dest=? AND event_id=?", [dest, eventId]);
const purchases = async () => (await db.all("SELECT event_id FROM deliveries WHERE site='dd' AND dest='meta' AND name='Purchase' ORDER BY id")).map(r => r.event_id);
const stage = name => db.get("SELECT id FROM stages WHERE site='dd' AND name=?", [name]);
const move = (contact, st) => req('/sites/dd/crm/move', { cookie: admin, form: { contact: contact.id, stage: st.id, js: '1' } });

// ---------- navegador ----------
function snippet({ mirror = false, cookie = '' } = {}) {
  const src = readFileSync(new URL('../public/s.js', import.meta.url), 'utf8');
  const beacons = [], pixel = [], on = {};
  let clock = 1_800_000_000_000;
  const win = { addEventListener() {}, ...(mirror && { fbq: (...a) => pixel.push(a) }) };
  const ctx = {
    document: { currentScript: { src: 'https://t.dd.dev/s.js', dataset: { site: 'dd', ...(mirror && { pixel: 'mirror' }) } }, referrer: '', cookie, addEventListener: (t, fn) => (on[t] = fn) },
    window: win, location: { href: 'https://dd.dev/', pathname: '/', search: '', host: 'dd.dev', hostname: 'dd.dev' }, history: { pushState() {} },
    screen: { width: 390 }, localStorage: {}, URL, URLSearchParams, JSON, Math, Date: { now: () => clock },
    navigator: { sendBeacon: (u, b) => beacons.push(JSON.parse(b)) }, fbq: win.fbq,
  };
  vm.runInNewContext(src, ctx);
  return { beacons, pixel, on, win, loc: ctx.location, hist: ctx.history, tick: ms => { clock += ms; } };
}
const link = (href, attrs = {}) => ({ tagName: 'A', href, attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })), dataset: { rastro: attrs['data-rastro'] },
  hasAttribute: n => Object.hasOwn(attrs, n), closest(sel) { return sel === 'a[href]' || (sel === '[data-rastro]' && attrs['data-rastro']) ? this : null; } });
const named = (b, n) => b.filter(x => x.n === n);

test('navegador: Pixel espelhado usa o mesmo id do servidor; Purchase não vai ao Pixel', () => {
  const s = snippet({ mirror: true });
  s.win.rastro('Lead');
  s.tick(5000);
  s.win.rastro('Purchase', {}, 197);
  assert.deepEqual(s.pixel.map(p => [p[1], p[3].eventID]), [['PageView', s.beacons[0].i], ['Lead', s.beacons[1].i]], 'cada fbq leva o eventID do beacon');
  assert.equal(named(s.beacons, 'Purchase').length, 1, 'o beacon da compra vai (painel), o Pixel não');
  assert.ok(!s.pixel.some(p => p[1] === 'Purchase'), 'compra só pelo webhook, com o id do pedido');
});

test('navegador: clique duplo, checkout automático + manual e o mesmo evento em < 2 s saem uma vez', () => {
  const s = snippet({ cookie: '_rid=AbC123xyz_-' });
  const pay = link('https://pay.hotmart.com/X1', { 'data-rastro': 'InitiateCheckout' }); // marcado à mão e também reconhecido como checkout
  s.on.click({ target: pay });
  s.on.click({ target: pay }); // clique duplo
  s.win.rastro('InitiateCheckout'); // onclick manual do site
  assert.equal(named(s.beacons, 'InitiateCheckout').length, 1);
  s.tick(2500);
  s.on.click({ target: link('https://pay.kiwify.com.br/K') });
  assert.equal(named(s.beacons, 'InitiateCheckout').length, 2, 'depois de 2 s é um novo clique de verdade');
  s.win.rastro('Lead'); s.win.rastro('Contact');
  assert.equal(s.beacons.length, 5, 'pageview, 2 checkouts, Lead e Contact: eventos diferentes no mesmo instante passam');
  const ids = s.beacons.map(b => b.i);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
});

test('navegador: pageview de rotas diferentes nunca é segurada', () => {
  const s = snippet();
  Object.assign(s.loc, { pathname: '/b', href: 'https://dd.dev/b' }); s.hist.pushState();
  Object.assign(s.loc, { pathname: '/c', href: 'https://dd.dev/c' }); s.hist.pushState();
  assert.equal(s.beacons.filter(b => !b.n).length, 3);
});

// ---------- servidor: eventos do site ----------
test('beacon repetido (mesmo id) vira um envio só; compra pelo navegador não vai à Meta', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await beacon({ n: 'InitiateCheckout', i: 'evt_dd_ic0001' })).status, 202);
  await Promise.all([1, 2, 3].map(() => beacon({ n: 'Lead', i: 'evt_dd_lead001' })));
  assert.equal((await beacon({ n: 'Purchase', i: 'evt_dd_buy0001', v: 197 })).status, 202);
  assert.equal((await queued('evt_dd_ic0001')).length, 1);
  assert.equal((await queued('evt_dd_lead001')).length, 1);
  assert.equal((await queued('evt_dd_ic0001', 'ga4')).length, 1);
  assert.equal((await queued('evt_dd_buy0001')).length, 0, 'compra do navegador pode ser forjada: só o webhook manda');
  await D.dispatch();
  await D.dispatch();
  assert.deepEqual(capi.filter(e => /^evt_dd_/.test(e.event_id)).map(e => [e.event_name, e.event_id]),
    [['InitiateCheckout', 'evt_dd_ic0001'], ['Lead', 'evt_dd_lead001']], 'cada evento chega uma vez, com o id do Pixel');
});

// ---------- servidor: compras ----------
test('webhook repetido, simultâneo e fora de ordem: um Purchase por pedido', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await hook(hotmart('HDD1'))).status, 200);
  await Promise.all(Array.from({ length: 5 }, () => hook(hotmart('HDD2'))));
  // pendente → pago → pago → reembolsado → pago (atrasado): a compra sai uma vez
  for (const st of ['pending', 'paid', 'paid', 'refunded', 'paid']) await ingest('generic', sale('GDD1', st));
  // pago chega antes do pendente
  await ingest('generic', sale('GDD2', 'paid')); await ingest('generic', sale('GDD2', 'pending'));
  assert.deepEqual(await purchases(), ['hotmart-HDD1', 'hotmart-HDD2', 'generic-GDD1', 'generic-GDD2']);
  assert.equal((await db.get("SELECT COUNT(*) n FROM sales WHERE site='dd' AND order_id='HDD2'")).n, 1, 'webhooks simultâneos gravam uma venda');
  assert.equal((await db.get("SELECT status FROM sales WHERE site='dd' AND order_id='GDD1'")).status, 'refunded', 'pago atrasado não desfaz o reembolso');
});

test('mesmo pedido por duas fontes (webhook e planilha): um Purchase; pedido igual com valor diferente não é confundido', async () => {
  await ingest('hotmart', sale('X100', 'paid', { email: 'duas@dd.dev' }));
  await ingest('sheets', sale('X100', 'paid', { email: 'duas@dd.dev' }));
  await ingest('kiwify', sale('X100', 'paid', { email: 'outro@dd.dev', gross: 47, net: 40 }));
  const ids = (await purchases()).filter(i => i.endsWith('X100'));
  assert.deepEqual(ids, ['hotmart-X100', 'kiwify-X100']);
  assert.equal((await db.all("SELECT 1 FROM deliveries WHERE site='dd' AND dest='ga4' AND event_id='sheets-X100'")).length, 0, 'nem no GA4');
  assert.ok((await db.get("SELECT message FROM webhook_log WHERE site='dd' AND platform='sheets' AND order_id='X100' ORDER BY id DESC LIMIT 1")).message.includes('já recebida por Hotmart'));
});

// ---------- servidor: quadro do CRM ----------
test('CRM: compra do webhook não volta pela coluna Ganhou, e a marcada à mão não volta pelo webhook', async () => {
  await C.stages('dd');
  const won = await stage('Ganhou'), novo = await stage('Novo');
  const P = await import('../src/pii.js'), find = email => C.findContact('dd', { emailHash: P.hashEmail(email) });

  // 1) webhook primeiro; depois alguém arrasta o contato para fora e de volta para Ganhou
  await ingest('generic', sale('CRM1', 'paid', { email: 'web@dd.dev' }));
  const a = await find('web@dd.dev');
  assert.equal(a.purchase_src, 'sale');
  await move(a, novo); await move(await find('web@dd.dev'), won);
  assert.equal((await queued(`crm-${a.id}-${won.id}`)).length, 0, 'sem Purchase do quadro');

  // 2) vendedor marca a venda à mão; o webhook da mesma compra chega depois
  const { contact: b } = await C.upsertContact(site(), { email: 'mao@dd.dev', source: 'manual' });
  await move(b, won);
  assert.equal((await queued(`crm-${b.id}-${won.id}`)).length, 1, 'o quadro manda o Purchase');
  await ingest('generic', sale('CRM2', 'paid', { email: 'mao@dd.dev' }));
  assert.equal((await queued('generic-CRM2')).length, 0, 'o webhook não repete');
  assert.ok((await db.get("SELECT message FROM webhook_log WHERE site='dd' AND order_id='CRM2' ORDER BY id DESC LIMIT 1")).message.includes('quadro do CRM'));

  // 3) recompra de verdade, dias depois: sai normalmente
  await ingest('generic', sale('CRM3', 'paid', { email: 'mao@dd.dev', ts: Date.now() + 8 * 864e5 }), Date.now() + 8 * 864e5);
  assert.equal((await queued('generic-CRM3')).length, 1);
  // 4) duas compras pelo webhook no mesmo dia: as duas saem (o bloqueio é só contra o quadro)
  await ingest('generic', sale('CRM4', 'paid', { email: 'web@dd.dev' }));
  assert.equal((await queued('generic-CRM4')).length, 1);
});

// ---------- fila ----------
test('erro e reenvio: mesmo event_id em todas as tentativas; depois de enviado, nunca mais', async () => {
  await D.dispatch({ now: Date.now() + 9 * 864e5 }); // esvazia a fila dos testes anteriores
  await ingest('generic', sale('RET1', 'paid', { email: 'retry@dd.dev' }));
  const t0 = Date.now() + 1000;
  metaFail = 1;
  await D.dispatch({ now: t0 });
  assert.equal((await queued('generic-RET1'))[0].status, 'pending', 'erro 500 volta para a fila');
  const before = capi.length;
  await Promise.all([D.dispatch({ now: t0 + D.BACKOFF[0] }), D.dispatch({ now: t0 + D.BACKOFF[0] }), D.dispatch({ now: t0 + 2 * D.BACKOFF[0] })]);
  assert.deepEqual(capi.slice(before).map(e => e.event_id), ['generic-RET1'], 'rodadas simultâneas não mandam duas vezes');
  assert.equal((await queued('generic-RET1'))[0].status, 'sent');
});

test('resumo: nenhum evento aceito pela Meta repete o par (nome, event_id)', async () => {
  await D.dispatch({ now: Date.now() + 10 * 864e5 });
  const seen = new Map();
  for (const e of capi) seen.set(`${e.event_name}|${e.event_id}`, (seen.get(`${e.event_name}|${e.event_id}`) || 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1);
  assert.deepEqual(dup, [], 'duplicados: ' + JSON.stringify(dup));
  const ga = new Map();
  for (const g of ga4) for (const e of g.events) if (e.params.transaction_id) ga.set(e.params.transaction_id, (ga.get(e.params.transaction_id) || 0) + 1);
  assert.ok([...ga.values()].every(n => n === 1), 'GA4: uma compra por transaction_id');
  assert.ok(capi.length > 10 && seen.size === capi.length);
});
