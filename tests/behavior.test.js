// Comportamento (ADR 0025): rolagem, tempo ativo, mapa de cliques, captura automática e retorno.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { boot, kv, CHROME, IPHONE } from './helpers.js';

const { req, login, close, base } = await boot();
const { db } = await import('../src/db.js');
const { record, clickLabel, clickDest, clickSel } = await import('../src/tracking/ingest.js');
const { localDate, addDays } = await import('../src/time.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'lp', name: 'LP', timezone: 'UTC', currency: 'BRL' } });
await req('/sites/lp/integrations', { cookie: admin, form: { action: 'capi', pixel: '555020', capi_token: 'TOK' } });
const beacon = (body, ua = CHROME) => fetch(base + '/e', { method: 'POST', body: JSON.stringify({ s: 'lp', ...body }), headers: { 'user-agent': ua } });

function runSnippet() {
  const beacons = [], sizes = [], on = {}, doc = { scrollHeight: 4000 };
  const g = {
    document: { currentScript: { src: 'https://t.lp.dev/s.js', dataset: { site: 'lp' } }, referrer: '', cookie: '', hidden: false, documentElement: doc, addEventListener: (t, fn) => (on[t] = fn) },
    window: { addEventListener: (t, fn) => (on['w' + t] = fn) }, history: { pushState() {} },
    location: { href: 'https://lp.dev/oferta?utm_source=x', origin: 'https://lp.dev', pathname: '/oferta', search: '?utm_source=x', host: 'lp.dev', hostname: 'lp.dev' },
    screen: { width: 390 }, innerWidth: 390, innerHeight: 800, scrollY: 0, localStorage: {}, URL, URLSearchParams, JSON, Math, Date, Blob,
    navigator: { sendBeacon: (u, b) => { sizes.push(Buffer.byteLength(b)); beacons.push(JSON.parse(b)); } },
  };
  vm.runInNewContext(readFileSync(new URL('../public/s.js', import.meta.url), 'utf8'), g);
  const hide = () => { g.document.hidden = true; on.visibilitychange(); };
  const show = () => { g.document.hidden = false; on.visibilitychange(); };
  return { beacons, sizes, on, g, doc, hide, show };
}
const node = (tagName, { id = '', cls, text, href, rastro, parent } = {}) => {
  const el = { tagName, id, classList: cls ? [cls] : [], textContent: text, href, attributes: [], dataset: { rastro }, parent };
  el.closest = sel => {
    for (let n = el; n; n = n.parent) {
      if (sel === '[data-rastro]' ? n.dataset.rastro : sel === 'a[href]' ? n.tagName === 'A' && n.href : sel === 'a,button,[role=button]' && /^(A|BUTTON)$/.test(n.tagName)) return n;
    }
    return null;
  };
  return el;
};

test('snippet: resumo de saída com rolagem, tempo ativo e cliques; data-rastro não vira autocaptura', () => {
  const s = runSnippet();
  assert.equal(s.beacons.length, 1, 'só o pageview na carga');
  s.g.scrollY = 1300; s.on.wscroll(); // (1300 + 800) / 4000 = 52%: faixa 2
  s.g.scrollY = 200; s.on.wscroll(); // voltar para cima não baixa o máximo
  const span = node('SPAN', { parent: node('BUTTON', { id: 'comprar', text: '\n  Quero  comprar ' }) });
  s.on.click({ target: span, clientX: 195, pageY: 2000 });
  s.on.click({ target: node('A', { cls: 'cta', text: 'Fale conosco', href: 'https://wa.me/5511999990000?text=oi' }), clientX: 10, pageY: 3999 });
  s.on.click({ target: node('BUTTON', { text: 'Cadastro', rastro: 'Lead' }), clientX: 100, pageY: 100 });
  s.on.click({ target: node('DIV', { cls: 'hero' }), clientX: 300, pageY: 50 });
  s.hide();
  const b = s.beacons.at(-1);
  assert.deepEqual([b.s, b.u, b.w, b.d], ['lp', 'https://lp.dev/oferta', 390, [-1, 2]], 'sem query string');
  assert.ok(b.a >= 0 && !b.n && !b.i, 'beacon de comportamento não é evento');
  assert.deepEqual(b.k[0], [50, 50, 'BUTTON', 'comprar', '', 'Quero  comprar', null], 'clique dentro do botão conta para o botão');
  assert.deepEqual(b.k[1].slice(0, 6), [2, 99, 'A', '', 'cta', 'Fale conosco']);
  assert.ok(!b.k[2][5] && !b.k[2][6], 'com data-rastro: só a posição');
  assert.deepEqual([b.k[3][2], b.k[3][4], !b.k[3][5]], ['DIV', 'hero', true]);
  assert.equal(s.beacons.filter(x => x.n === 'Lead').length, 1, 'o evento marcado segue normal');

  s.show(); s.hide();
  assert.equal(s.beacons.length, 3, 'nada novo (sem rolagem, cliques nem tempo relevante): não manda de novo');
  s.show(); s.g.scrollY = 3200; s.on.wscroll(); s.hide();
  assert.deepEqual(s.beacons.at(-1).d, [2, 4], 'só as faixas novas, a partir da última enviada');
});

test('snippet: na troca de rota (SPA) o resumo vai com o endereço da página que saiu', () => {
  const s = runSnippet();
  s.on.click({ target: node('A', { text: 'Preços', href: 'https://lp.dev/precos' }), clientX: 1, pageY: 1 });
  Object.assign(s.g.location, { href: 'https://lp.dev/precos', pathname: '/precos', search: '' });
  s.g.history.pushState({}, '', '/precos');
  const [flush, pv] = s.beacons.slice(1);
  assert.deepEqual([flush.u, flush.d[0], flush.k.length], ['https://lp.dev/oferta', -1, 1]);
  assert.equal(pv.u, 'https://lp.dev/precos');
  s.hide();
  assert.deepEqual([s.beacons.at(-1).u, s.beacons.at(-1).d[0], s.beacons.at(-1).k.length], ['https://lp.dev/precos', -1, 0], 'página nova começa do zero');
});

test('ingest: soma por dia, página e aparelho; sem evento, sem envio e sem dado pessoal', async () => {
  assert.equal(clickLabel('  Ligue (11) 98888-7777 ou ana@x.com\n agora '), 'Ligue … ou … agora');
  assert.deepEqual(['mailto:a@b.com', 'tel:+5511', 'https://api.whatsapp.com/send?phone=55', 'https://www.pay.hotmart.com/X?off=1&email=a@b.com', 'javascript:alert(1)', {}].map(clickDest),
    ['e-mail', 'telefone', 'WhatsApp', 'pay.hotmart.com/X', '', '']);
  assert.deepEqual([clickSel('BUTTON', 'comprar', 'x'), clickSel('A', '', 'cta'), clickSel('A', 'id com espaço', null), clickSel('<script>', '', '')], ['button#comprar', 'a.cta', 'a', '']);

  const n0 = (await db.get('SELECT COUNT(*) n FROM events')).n, d0 = (await db.get('SELECT COUNT(*) n FROM deliveries')).n;
  const k = [[50, 50, 'BUTTON', 'comprar', null, 'Quero comprar', null], [52, 51, 'BUTTON', 'comprar', null, 'Quero comprar', null], [2, 99, 'A', '', 'cta', 'Fale', 'https://wa.me/55119'], [10, 10, 'DIV', '', 'hero', false, false]];
  assert.equal((await beacon({ u: 'https://lp.dev/oferta?email=a@b.com', w: 390, d: [-1, 2], a: 42e3, k })).status, 202);
  assert.equal((await beacon({ u: 'https://lp.dev/oferta', w: 390, d: [2, 4], a: 99e9, k: [] })).status, 202);
  assert.equal((await beacon({ u: 'https://lp.dev/oferta', w: 1440, d: [-1, 0], a: 0, k: [[0, 0, 'A', '', '', 'Entrar', 'https://lp.dev/login']] })).status, 202);
  assert.equal((await beacon({ u: 'https://lp.dev/oferta', w: 390, d: [-1, 4], a: 1, k: [] }, 'Googlebot/2.1')).status, 202);
  assert.equal((await db.get('SELECT COUNT(*) n FROM events')).n, n0, 'não grava evento');
  assert.equal((await db.get('SELECT COUNT(*) n FROM deliveries')).n, d0, 'não vai para Meta, GA4 nem Google Ads');

  const m = await db.get("SELECT * FROM page_reads WHERE site='lp' AND path='/oferta' AND device='m'");
  assert.deepEqual([m.views, m.active_ms, m.d25, m.d50, m.d75, m.d100], [1, 42e3 + 30 * 60e3, 1, 1, 1, 1], 'uma leitura, tempo limitado a 30 min por envio, cada faixa uma vez; bot fora');
  assert.equal((await db.get("SELECT views FROM page_reads WHERE site='lp' AND device='d'")).views, 1);
  const cells = await db.all("SELECT x, y, n FROM click_cells WHERE site='lp' AND device='m' ORDER BY x, y");
  assert.deepEqual(cells.map(c => [c.x, c.y, c.n]), [[0, 49, 1], [2, 5, 1], [10, 25, 2]], 'grade de 5% x 2%');
  const t = await db.all("SELECT sel, label, dest, n FROM click_targets WHERE site='lp' AND device='m' ORDER BY n DESC");
  assert.deepEqual(t.map(x => [x.sel, x.label, x.dest, x.n]), [['button#comprar', 'Quero comprar', '', 2], ['a.cta', 'Fale', 'WhatsApp', 1]], 'div sem texto nem destino não entra na lista');
});

test('tela Comportamento: páginas, mapa, elementos e retorno só com _rid', async () => {
  const day = 864e5, now = Date.now(), rid = r => ({ rid: r });
  const visit = (when, edge, ip = '192.0.2.9') => record({ body: JSON.stringify({ s: 'lp', u: 'https://lp.dev/' }), ua: CHROME, ip, country: 'BR', edge }, when);
  await visit(now - 40 * day, rid('VoltouNoDia3xxxxxxxxx1')); await visit(now - 37 * day, rid('VoltouNoDia3xxxxxxxxx1'));
  await visit(now - 40 * day, rid('NuncaVoltouxxxxxxxxxx2'));
  await visit(now - 2 * day, rid('ChegouAgoraxxxxxxxxxx3'));
  await visit(now - 40 * day, null, '192.0.2.50'); await visit(now - 39 * day, null, '192.0.2.50'); // sem cookie: fica de fora

  const today = localDate(now, 'UTC'), q = `range=custom&from=${addDays(today, -45)}&to=${today}`;
  const page = await req(`/sites/lp/behavior?${q}`, { cookie: admin });
  assert.equal(page.status, 200);
  assert.match(page.text, /Rolagem e tempo por página/);
  assert.match(page.text, /Mapa de cliques · \/oferta/);
  assert.match(page.text, /class="heat phone"/, 'abre no aparelho com mais leituras');
  assert.match(page.text, /Quero comprar/);
  assert.match(page.text, /só conta visitantes com o cookie <code>_rid<\/code>/i);
  assert.match(page.text, /3 primeiras visitas/);
  assert.equal(kv(page.text, 'back7'), '50%', 'D7: 1 de 2 (quem chegou há 2 dias ainda não conta)');
  assert.doesNotMatch(page.text, /—|–/, 'sem travessão');
  const desk = await req(`/sites/lp/behavior?${q}&page=%2Foferta&device=d`, { cookie: admin });
  assert.match(desk.text, /class="heat desk"/);
  assert.match(desk.text, /Entrar/);
  assert.doesNotMatch(desk.text, /Quero comprar/, 'lista por aparelho');
  assert.match((await req('/sites/lp/behavior?device=__proto__&page=/nada', { cookie: admin })).text, /Nenhum clique/);
  assert.match((await req('/sites/lp/traffic', { cookie: admin })).text, /href="\/sites\/lp\/behavior[^"]*"/, 'item no menu de Tráfego');
});

test('snippet: o resumo nunca passa de 4096 bytes (limite do Worker e do app); cliques demais saem em mais de um envio', () => {
  const s = runSnippet(), big = 'ção"\u0001\n'.repeat(400), id = 'x'.repeat(500);
  const href = 'https://pay.hotmart.com/' + 'ç'.repeat(300) + '?off=abc&utm_source=' + 'y'.repeat(800) + '#topo';
  for (let i = 0; i < 300; i++) s.on.click({ target: node(i % 2 ? 'A' : 'BUTTON', { id, cls: id, text: big, href }), clientX: 1, pageY: 1 });
  s.hide();
  const reads = s.beacons.filter(b => b.k), sizes = s.sizes.filter((_, i) => s.beacons[i].k);
  assert.ok(reads.length > 1, 'mandou antes de encher');
  assert.ok(Math.max(...sizes) < 4096, `maior resumo com ${Math.max(...sizes)} bytes`);
  assert.equal(reads.reduce((n, b) => n + b.k.length, 0), 300, 'nenhum clique perdido');
  assert.deepEqual(reads.map(b => b.d[0]), [-1, ...reads.slice(1).map(() => 0)], 'a leitura conta uma vez só');
  const a = reads[0].k.find(c => c[2] === 'A');
  assert.ok(!a[6].includes('?') && !a[6].includes('#') && a[6].length <= 150 && a[5].length <= 60 && a[3].length <= 60, 'destino sem query string; texto, id e destino cortados');
});
