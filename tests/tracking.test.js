// Rastreamento: snippet, classificação, ingestão, sessões, funis, jornadas e atribuição.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { boot, kv, CHROME, IPHONE } from './helpers.js';

const { req, login, close, base } = await boot();
const { db } = await import('../src/db.js');
const { record, channel, parseUA } = await import('../src/tracking/ingest.js');
const S = await import('../src/tracking/stats.js');
const { period, localDate } = await import('../src/time.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'blog', name: 'Blog', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
await req('/sites', { cookie: admin, form: { id: 'sess', name: 'Sess', timezone: 'UTC', currency: 'USD' } });

function runSnippet({ search = '', referrer = 'https://google.com/', cookie = '', consent } = {}) {
  const src = readFileSync(new URL('../public/s.js', import.meta.url), 'utf8');
  const beacons = [], ids = [], on = {}, store = {};
  const loc = { href: `https://blog.dev/a${search}`, pathname: '/a', search, host: 'blog.dev', hostname: 'blog.dev' };
  const hist = { pushState() {} }, win = { addEventListener: (t, fn) => (on['w' + t] = fn) };
  vm.runInNewContext(src, {
    document: { currentScript: { src: 'https://stats.dev/s.js', dataset: { site: 'blog', ...(consent && { consent }) } }, referrer, cookie, addEventListener: (t, fn) => (on[t] = fn) },
    window: win, location: loc, history: hist, screen: { width: 1280 }, localStorage: store, URL, URLSearchParams, JSON,
    navigator: { sendBeacon: (u, b) => { const o = JSON.parse(b); ids.push(o.i); delete o.i; beacons.push([u, o]); } },
  });
  return { src, beacons, ids, on, store, loc, hist, win };
}
const el = (attrs, tagName = 'BUTTON') => ({ tagName, attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })), dataset: { rastro: attrs['data-rastro'] }, closest(sel) { return sel === '[data-rastro]' && attrs['data-rastro'] ? this : null; } });
const anchor = (href, attrs = {}) => ({ tagName: 'A', href, hasAttribute: n => Object.hasOwn(attrs, n), closest(sel) { return sel === 'a[href]' ? this : null; } });

test('snippet: < 3,25 KB, pageview, SPA, eventos, opt-out', () => {
  const { src, beacons, on, store, loc, hist, win } = runSnippet();
  assert.ok(Buffer.byteLength(src) < 3328, `snippet com ${Buffer.byteLength(src)} bytes`);
  assert.deepEqual(beacons[0], ['https://stats.dev/e', { s: 'blog', u: loc.href, r: 'https://google.com/', w: 1280 }]);
  Object.assign(loc, { href: 'https://blog.dev/b', pathname: '/b', search: '' });
  hist.pushState({}, '', '/b'); hist.pushState({}, '', '/b');
  assert.equal(beacons.length, 2, 'uma pageview por rota nova');
  on.click({ target: el({ 'data-rastro': 'signup', 'data-rastro-plan': 'pro', 'data-rastro-revenue': '19.9' }) });
  assert.deepEqual(beacons[2][1], { s: 'blog', n: 'signup', u: loc.href, r: 'https://google.com/', w: 1280, p: { plan: 'pro' }, v: '19.9' });
  on.click({ target: el({ 'data-rastro': 'contato' }, 'FORM') });
  assert.equal(beacons.length, 3, 'clique em <form> não conta; só o submit');
  on.submit({ target: el({ 'data-rastro': 'contato' }, 'FORM') });
  win.rastro('compra', { a: 1 }, 5);
  assert.deepEqual([beacons[3][1].n, beacons[4][1].n, beacons[4][1].v], ['contato', 'compra', 5]);
  store.rastro_ignore = '1';
  win.rastro('x');
  assert.equal(beacons.length, 5, 'opt-out via localStorage');
});

test('snippet v2: id por evento, consentimento e rid nos links externos', () => {
  const a = runSnippet();
  a.win.rastro('x');
  assert.ok(a.ids.every(i => /^[\w-]{8,64}$/.test(i)) && new Set(a.ids).size === 2, 'um id único por evento');
  assert.equal(a.beacons[0][1].c, undefined, 'sem data-consent, não manda o campo');

  const b = runSnippet({ consent: 'required' });
  assert.equal(b.beacons[0][1].c, 0, 'exige consentimento e ainda não tem');
  b.win.rastro('consent');
  b.win.rastro('lead');
  assert.equal(b.beacons.length, 2, 'rastro("consent") não gera evento');
  assert.equal(b.beacons[1][1].c, 1);

  const c = runSnippet({ cookie: 'x=1; _rid=AbC123xyz_-' });
  const pay = anchor('https://pay.kiwify.com.br/K'), keep = anchor('https://pay.kiwify.com.br/K?rid=outro');
  c.on.click({ target: pay }); c.on.click({ target: keep });
  assert.equal(new URL(pay.href).searchParams.get('rid'), 'AbC123xyz_-');
  assert.equal(new URL(keep.href).searchParams.get('rid'), 'outro', 'não sobrescreve');
  const onp = anchor('https://pay.onprofit.com.br/7D53M87C?off=I2Tjop');
  runSnippet({ cookie: '_rid=AbC123xyz_-' }).on.click({ target: onp });
  const o = new URL(onp.href).searchParams;
  assert.deepEqual([o.get('off'), o.get('rid'), o.get('sck')], ['I2Tjop', 'AbC123xyz_-', 'AbC123xyz_-'], 'OnProfit só devolve src/sck/UTMs no webhook: o rid vai também em sck');
  const blog = anchor('https://outro-site.com/artigo'), marked = anchor('https://agenda.com/x', { 'data-rastro-rid': '' });
  c.on.click({ target: blog }); c.on.click({ target: marked });
  assert.equal(blog.href, 'https://outro-site.com/artigo', 'rid só em checkout, WhatsApp ou link marcado');
  assert.equal(new URL(marked.href).searchParams.get('rid'), 'AbC123xyz_-');
  assert.equal(c.beacons.filter(b => b[1].n === 'InitiateCheckout').length, 1, 'cliques seguidos no checkout viram um InitiateCheckout (dedup de 2 s)');
  const wa = anchor('https://wa.me/5511999990000'), n0 = c.beacons.length;
  c.on.click({ target: wa });
  assert.equal(c.beacons.length, n0, 'WhatsApp leva o rid, mas não é checkout');
  assert.equal(new URL(wa.href).searchParams.get('rid'), 'AbC123xyz_-');
  const none = anchor('https://pay.kiwify.com.br/K');
  runSnippet().on.click({ target: none });
  assert.equal(none.href, 'https://pay.kiwify.com.br/K', 'sem cookie e sem UTM, link intacto');
});

test('snippet: repassa UTMs para links de checkout (Hotmart recebe src/sck)', () => {
  const { on } = runSnippet({ search: '?utm_source=FB&utm_campaign=BF%7Cc1&x=1' });
  const hot = anchor('https://pay.hotmart.com/X123?off=abc'), kiwi = anchor('https://pay.kiwify.com.br/K?utm_source=keep'), own = anchor('https://blog.dev/precos');
  for (const a of [hot, kiwi, own]) on.click({ target: a });
  const h = new URL(hot.href).searchParams;
  assert.deepEqual([h.get('off'), h.get('utm_source'), h.get('utm_campaign'), h.get('src'), h.get('sck'), h.get('x')], ['abc', 'FB', 'BF|c1', 'FB', 'BF|c1', null]);
  assert.deepEqual([new URL(kiwi.href).searchParams.get('utm_source'), new URL(kiwi.href).searchParams.get('src')], ['keep', null], 'não sobrescreve; src/sck só na Hotmart');
  assert.equal(own.href, 'https://blog.dev/precos', 'links internos ficam intactos');
});

test('canais e user-agent', () => {
  const ch = (referrer, s = '', m = '', c = '') => channel({ referrer, utm_source: s, utm_medium: m, utm_campaign: c });
  assert.deepEqual(
    [ch(''), ch('google.com.br'), ch('l.facebook.com'), ch('news.ycombinator.com'), ch('', 'newsletter', 'email'), ch('google.com', 'google', 'cpc'), ch('', 'instagram', 'paid_social'), ch('', '', '', 'bf'), ch('search.brave.com')],
    ['Direto', 'Busca orgânica', 'Social', 'Referência', 'E-mail', 'Busca paga', 'Social pago', 'Outras campanhas', 'Busca orgânica']);
  assert.deepEqual(parseUA(IPHONE), { browser: 'Safari', os: 'iOS' });
  assert.deepEqual(parseUA(CHROME + ' Edg/130.0'), { browser: 'Edge', os: 'Windows' });
  assert.deepEqual(parseUA('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'), { browser: 'Chrome', os: 'Android' });
});

test('ingestão via HTTP: sem IP, sem query string, bots fora, origem herdada', async () => {
  const beacon = (body, ua = CHROME, ip = '203.0.113.7') => fetch(base + '/e', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'user-agent': ua, 'x-forwarded-for': ip, 'cf-ipcountry': 'BR' },
  }).then(r => { assert.equal(r.headers.get('access-control-allow-origin'), '*'); return r.status; });
  assert.equal(await beacon({ s: 'blog', u: 'https://blog.dev/a?utm_source=newsletter&utm_medium=email&utm_campaign=launch&token=SECRET', r: 'https://www.google.com/', w: 1280 }), 202);
  assert.equal(await beacon({ s: 'blog', u: 'https://blog.dev/pricing', r: 'https://blog.dev/a', w: 1280 }), 202);
  assert.equal(await beacon({ s: 'blog', n: 'signup', u: 'https://blog.dev/pricing', p: { plan: 'pro' }, v: 49.9, w: 1280 }), 202);
  assert.equal(await beacon({ s: 'blog', u: 'https://blog.dev/a', r: 'https://l.facebook.com/', w: 390 }, IPHONE, '198.51.100.1'), 202);
  assert.equal(await beacon({ s: 'blog', u: 'https://blog.dev/%3Cscript%3Ealert(1)%3C/script%3E', w: 390 }, IPHONE, '198.51.100.1'), 202);
  assert.equal(await beacon({ s: 'blog', u: 'https://blog.dev/a' }, 'Mozilla/5.0 (compatible; Googlebot/2.1)'), 202);
  assert.equal(await beacon({ s: 'blog', u: 'https://blog.dev/a' }, CHROME.replace('Chrome', 'HeadlessChrome')), 202);
  assert.equal(await beacon({ s: 'blog', u: 'https://blog.dev/a' }, ''), 202);
  assert.equal(await beacon({ s: 'nope', u: 'https://blog.dev/a' }), 400);
  assert.equal(await beacon('not json'), 400);

  const rows = await db.all("SELECT * FROM events WHERE site='blog' ORDER BY id");
  assert.equal(rows.length, 5, 'bots não são gravados');
  assert.ok(!JSON.stringify(rows).includes('SECRET') && !JSON.stringify(rows).includes('203.0.113.7'), 'sem query string nem IP');
  assert.equal(new Set(rows.slice(0, 3).map(r => r.session)).size, 1, 'mesma visita');
  assert.deepEqual(rows.map(r => r.channel), ['E-mail', 'E-mail', 'E-mail', 'Social', 'Social']);
  assert.deepEqual([rows[0].utm_campaign, rows[1].utm_campaign, rows[0].referrer, rows[0].country, rows[0].screen, rows[0].browser, rows[3].os],
    ['launch', 'launch', 'google.com', 'BR', 'laptop', 'Chrome', 'iOS']);
  assert.deepEqual([rows[2].name, rows[2].props, rows[2].revenue, rows[4].path], ['signup', '{"plan":"pro"}', 49.9, '/<script>alert(1)</script>']);
});

test('ingestão pela borda: cookie vira visitante, IDs de clique e segredo obrigatório', async () => {
  await req('/sites', { cookie: admin, form: { id: 'edge', name: 'Edge', timezone: 'UTC', currency: 'BRL' } });
  const send = (body, h = {}) => fetch(base + '/e', { method: 'POST', body: JSON.stringify(body), headers: { 'user-agent': CHROME, 'x-forwarded-for': '203.0.113.9', ...h } }).then(r => r.status);
  const edge = { 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': 'RidVisitante01', 'x-rastro-fbp': 'fb.1.1700000000000.1234567890', 'x-rastro-fbc': 'fb.1.1700000000000.IwAR-abc', 'x-rastro-ip': '198.51.100.20' };
  assert.equal(await send({ s: 'edge', u: 'https://e.dev/?fbclid=IwAR-abc&gclid=G-1&ttclid=T.1', i: 'evt_0000001' }, edge), 202);
  assert.equal(await send({ s: 'edge', u: 'https://e.dev/b', i: 'evt_0000002' }, { ...edge, 'x-edge-secret': 'errado-errado-err' }), 202);
  assert.equal(await send({ s: 'edge', u: 'https://e.dev/c?fbclid=IwAR-semborda', i: '<script>' }), 202);
  const [a, b, c] = await db.all("SELECT * FROM events WHERE site='edge' ORDER BY id");
  assert.deepEqual([a.visitor, a.rid, a.event_id, a.fbp, a.fbc, a.gclid, a.ttclid], ['RidVisitante01', 'RidVisitante01', 'evt_0000001', edge['x-rastro-fbp'], edge['x-rastro-fbc'], 'G-1', 'T.1']);
  assert.deepEqual([b.rid, b.fbp, b.fbc], [null, null, null], 'segredo errado: cabeçalhos da borda ignorados');
  assert.notEqual(b.visitor, 'RidVisitante01');
  assert.match(c.fbc, /^fb\.1\.\d{13}\.IwAR-semborda$/, 'sem borda, fbc montado a partir do fbclid');
  assert.match(c.event_id, /^[0-9a-f-]{36}$/, 'id inválido é trocado');
  assert.ok(!JSON.stringify([a, b, c]).includes('198.51.100.20') && !JSON.stringify([a, b, c]).includes('203.0.113.9'), 'IP nunca é gravado');

  // domínios do site: beacon de outro domínio é recusado
  assert.equal((await req('/sites/edge/settings', { cookie: admin, form: { action: 'save', name: 'Edge', timezone: 'UTC', currency: 'BRL', tax_rate: '0', domains: 'https://e.dev/, Loja.com.br' } })).status, 303);
  assert.equal((await db.get("SELECT domains FROM sites WHERE id='edge'")).domains, 'e.dev, loja.com.br');
  assert.equal(await send({ s: 'edge', u: 'https://golpe.com/', i: 'evt_0000009' }), 403);
  assert.equal(await send({ s: 'edge', u: 'https://www.loja.com.br/x', i: 'evt_0000010' }), 202);
  assert.equal((await req('/sites/edge/settings', { cookie: admin, form: { action: 'save', name: 'Edge', timezone: 'UTC', currency: 'BRL', tax_rate: '0', domains: 'não é domínio' } })).status, 400);

  const page = await req('/sites/edge/events', { cookie: admin });
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('RidVisita') && page.text.includes('>fbc<') && page.text.includes('>gclid<') && page.text.includes('sem cookie'));
  const partial = await req('/sites/edge/events?partial=1', { cookie: admin });
  assert.ok(partial.text.startsWith('<div class="tw">'), 'parcial só com a tabela');
});

test('sessões: 30 min de inatividade encerram a visita', async () => {
  const now = Date.now(), t0 = Math.max(Date.parse(new Date(now).toISOString().slice(0, 10)) + 1000, now - 3600e3);
  for (const [min, path] of [[0, '/'], [10, '/x'], [55, '/']]) {
    assert.equal(await record({ body: JSON.stringify({ s: 'sess', u: 'https://s.dev' + path }), ua: CHROME, ip: '192.0.2.1', country: '' }, t0 + min * 60e3), 202);
  }
  const today = localDate(now, 'UTC');
  const t = await S.totals('sess', { from: today, to: today });
  assert.deepEqual([t.visitors, t.pageviews, t.visits, t.bounce, t.duration], [1, 3, 2, 0.5, 300]);
});

test('funis, jornadas e atribuição', async () => {
  const p = period(new URLSearchParams('range=today'), 'America/Sao_Paulo');
  assert.deepEqual(await S.funnel('blog', p, {}, [{ path: '/a' }, { path: '/pri*' }, { event: 'signup' }]), [2, 1, 1]);
  assert.deepEqual(S.parseSteps('/a\n\n evento: signup \n/b*'), [{ path: '/a' }, { event: 'signup' }, { path: '/b*' }]);
  const j = await S.journeys('blog', p, {});
  assert.equal(j.visits, 2);
  assert.deepEqual(j.cols[0], [{ k: '/a', n: 2 }]);
  assert.ok(j.paths.some(x => x.k === '/a → /pricing' && x.n === 1));
  const a = await S.attribution('blog', p, {}, 'signup', 'channel');
  assert.deepEqual([a.conversions, a.revenue, a.converters, a.visitors, a.first[0].k, a.last[0].k], [1, 49.9, 1, 2, 'E-mail', 'E-mail']);
});

test('painel de tráfego: números, filtros e escape de XSS', async () => {
  const dash = await req('/sites/blog/traffic?range=today', { cookie: admin });
  assert.equal(dash.status, 200);
  assert.match(kv(dash.text, "visitors"), /^2$/);
  assert.ok(dash.text.includes('&#60;script&#62;alert(1)') && !dash.text.includes('<script>alert'), 'XSS escapado');
  assert.match(kv((await req('/sites/blog/traffic?range=today&f_channel=Social', { cookie: admin })).text, "visitors"), /^1$/);
  assert.match((await req('/sites/blog/traffic?range=today&f_name=signup', { cookie: admin })).text, /plan = pro/);
  assert.match(kv((await req('/sites/blog/realtime?partial=1', { cookie: admin })).text, "online"), /^2$/);
  assert.equal((await req('/sites/blog/funnels', { cookie: admin, form: { name: 'Compra', steps: '/a\n/pricing\nevento:signup' } })).status, 303);
  const fun = (await req('/sites/blog/funnels?range=today', { cookie: admin })).text;
  assert.match(fun, /Conversão <b class="pos">50%<\/b>/);
  assert.ok(fun.includes('Funil completo') && fun.includes('Visitaram o site') && fun.includes('Compraram'), 'funil completo do site no topo');
  assert.ok((await req('/sites/blog/funnels?range=30d', { cookie: admin })).text.includes('quando o script começou a registrar'), 'período maior que o script: corta no primeiro evento');
});
