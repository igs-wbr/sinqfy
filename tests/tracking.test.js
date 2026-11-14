// Rastreamento: snippet, classificação, ingestão, sessões, funis, jornadas e atribuição.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { boot, CHROME, IPHONE } from './helpers.js';

const { req, login, close, base } = await boot();
const { db } = await import('../src/db.js');
const { record, channel, parseUA } = await import('../src/tracking/ingest.js');
const S = await import('../src/tracking/stats.js');
const { period, localDate } = await import('../src/time.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'blog', name: 'Blog', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
await req('/sites', { cookie: admin, form: { id: 'sess', name: 'Sess', timezone: 'UTC', currency: 'USD' } });

function runSnippet({ search = '', referrer = 'https://google.com/' } = {}) {
  const src = readFileSync(new URL('../public/s.js', import.meta.url), 'utf8');
  const beacons = [], on = {}, store = {};
  const loc = { href: `https://blog.dev/a${search}`, pathname: '/a', search, host: 'blog.dev', hostname: 'blog.dev' };
  const hist = { pushState() {} }, win = { addEventListener: (t, fn) => (on['w' + t] = fn) };
  vm.runInNewContext(src, {
    document: { currentScript: { src: 'https://stats.dev/s.js', dataset: { site: 'blog' } }, referrer, addEventListener: (t, fn) => (on[t] = fn) },
    window: win, location: loc, history: hist, screen: { width: 1280 }, localStorage: store, URL, URLSearchParams, JSON,
    navigator: { sendBeacon: (u, b) => beacons.push([u, JSON.parse(b)]) },
  });
  return { src, beacons, on, store, loc, hist, win };
}
const el = (attrs, tagName = 'BUTTON') => ({ tagName, attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })), dataset: { rastro: attrs['data-rastro'] }, closest(sel) { return sel === '[data-rastro]' && attrs['data-rastro'] ? this : null; } });
const anchor = href => ({ tagName: 'A', href, closest(sel) { return sel === 'a[href]' ? this : null; } });

test('snippet: < 2 KB, pageview, SPA, eventos, opt-out', () => {
  const { src, beacons, on, store, loc, hist, win } = runSnippet();
  assert.ok(Buffer.byteLength(src) < 2048, `snippet com ${Buffer.byteLength(src)} bytes`);
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
  assert.match(dash.text, /id="visitors">2</);
  assert.ok(dash.text.includes('&#60;script&#62;alert(1)') && !dash.text.includes('<script>alert'), 'XSS escapado');
  assert.match((await req('/sites/blog/traffic?range=today&f_channel=Social', { cookie: admin })).text, /id="visitors">1</);
  assert.match((await req('/sites/blog/traffic?range=today&f_name=signup', { cookie: admin })).text, /plan = pro/);
  assert.match((await req('/sites/blog/realtime?partial=1', { cookie: admin })).text, /id="online">2</);
  assert.equal((await req('/sites/blog/funnels', { cookie: admin, form: { name: 'Compra', steps: '/a\n/pricing\nevento:signup' } })).status, 303);
  assert.match((await req('/sites/blog/funnels?range=today', { cookie: admin })).text, /Conversão <b class="pos">50%<\/b>/);
});
