// Jornada do lead pelo rid: navegador de app, número da visita e primeiro toque pago (ADR 0018), com venda de qualquer plataforma.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const { req, login, close } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const { record, parseUA } = await import('../src/tracking/ingest.js');
const T = await import('../src/tracking/stats.js');
const W = await import('../src/sales/webhooks.js');
const S = await import('../src/sales/stats.js');
after(close);

const INSTA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 309.0.0.0 (iPhone14,2; iOS 17_0; pt_BR)';
const RID = 'RidDaJornada12345';
const day = d => Date.UTC(2026, 10, d, 12);
const hit = (u, ts, n) => record({ body: JSON.stringify({ s: 'jor', u, ...(n && { n }) }), ua: INSTA, ip: '198.51.100.40', country: 'BR', edge: { rid: RID } }, ts);

test('navegador de app reconhecido pelo user agent', () => {
  assert.equal(parseUA(INSTA).browser, 'Instagram');
  assert.equal(parseUA(INSTA.replace('Instagram', 'Barcelona 300.0 Instagram')).browser, 'Threads', 'Threads antes do Instagram');
  assert.equal(parseUA('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]').browser, 'Facebook');
  assert.equal(parseUA('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 musical_ly_2023').browser, 'TikTok');
  assert.equal(parseUA('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0 Mobile Safari/537.36').browser, 'WebView');
  assert.ok(T.IN_APP.has('Instagram') && !T.IN_APP.has('Safari'));
});

test('jornada: abriu num anúncio, voltou por outro, comprou pela bio em outra plataforma', async () => {
  const admin = await login();
  await req('/sites', { cookie: admin, form: { id: 'jor', name: 'Jornada', timezone: 'UTC', currency: 'BRL' } });
  await db.run("INSERT INTO ad_entities(site, platform, level, id, name, status) VALUES ('jor','meta','ad','a1','V1','ACTIVE'), ('jor','meta','ad','a2','V2','ACTIVE')");
  const ad = (c, m, a) => `?utm_source=FB&utm_campaign=${encodeURIComponent(c)}&utm_medium=${encodeURIComponent(m)}&utm_content=${encodeURIComponent(a)}`;
  assert.equal(await hit('https://jor.dev/' + ad('BF|c1', 'L|s1', 'V1|a1'), day(1)), 202); // 1ª visita: abriu a porta
  assert.equal(await hit('https://jor.dev/' + ad('BF|c1', 'L|s1', 'V2|a2'), day(3)), 202); // 2ª visita: outro criativo
  assert.equal(await hit('https://jor.dev/oferta', day(3) + 60e3, 'InitiateCheckout'), 202);
  assert.equal(await hit('https://jor.dev/', day(5)), 202); // 3ª visita: direto, compra pela bio

  // Venda sem campanha (link da bio), com o rid de volta pelo checkout. Vale igual para qualquer parser: o casamento é pelo rid.
  const site = DB.sites.get('jor');
  await W.ingestSale(site, 'generic', { order_id: 'J1', status: 'paid', method: 'pix', gross: 100, net: 90, currency: 'BRL', product: 'Curso', ts: day(5) + 120e3,
    utm: { source: 'ig', medium: 'social', campaign: '', content: 'link_in_bio', term: '' }, rid: RID }, day(5) + 130e3);
  const sale = await db.get("SELECT * FROM sales WHERE site='jor' AND order_id='J1'");
  assert.deepEqual([sale.match_rule, sale.utm_campaign, sale.utm_content, sale.ft_campaign, sale.ft_content, sale.ft_medium], ['rid', 'BF|c1', 'link_in_bio', 'BF|c1', 'V1|a1', 'L|s1'],
    'último toque pago fecha; primeiro toque pago fica guardado');

  const range = { from: '2026-11-01', to: '2026-11-05' };
  assert.deepEqual((await T.visitNumber('jor', range)).map(r => [r.k, r.n, r.co, r.sales]), [[1, 1, 0, 0], [2, 1, 1, 0], [3, 1, 0, 1]], 'compra na 3ª visita, checkout na 2ª');
  assert.deepEqual((await T.visitNumber('jor', { from: '2026-11-03', to: '2026-11-05' })).map(r => r.k), [2, 3], 'visitas antes do período contam no número');
  assert.deepEqual((await T.visitNumber('jor', range, { utm_content: 'V2|a2' })).map(r => [r.k, r.n]), [[2, 1], [3, 0]], 'filtro restringe as sessões, sem renumerar');
  assert.deepEqual((await T.browserCheckout('jor', range, {})).map(r => [r.k, r.n, r.co]), [['Instagram', 3, 1]]);

  const ads = new Map((await S.campaigns(site, range, 'ad')).map(r => [r.id, r]));
  assert.deepEqual([ads.get('a1').sales, ads.get('a1').first, ads.get('a1').touched], [0, 1, 1], 'a1 abriu a porta');
  assert.equal(ads.get('a2').touched, 1, 'a2 participou');
  assert.equal(ads.get('a2').first, 0);
  assert.equal(ads.get('link_in_bio').sales, 1, 'o último toque segue o que a plataforma mandou');

  const page = await req('/sites/jor/traffic?range=custom&from=2026-11-01&to=2026-11-05', { cookie: admin });
  assert.match(page.text, /Navegador ou app/);
  assert.match(page.text, /3ª visita/);
  assert.match((await req('/sites/jor/campaigns?level=ad&range=custom&from=2026-11-01&to=2026-11-05', { cookie: admin })).text, /Participou/);
});
