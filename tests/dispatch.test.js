// Etapa 2: fila de envio server-side (Meta Conversions API e GA4 Measurement Protocol), com reenvio.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { boot, CHROME } from './helpers.js';

// Meta e GA4 simulados; o resto do fetch é real (servidor local).
const meta = [], ga4 = [];
let metaFail = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.host === 'graph.facebook.com') {
    if (metaFail > 0) { metaFail--; return json({ error: { message: 'Erro temporário da Meta' } }, 500); }
    if (JSON.parse(opts.body).data.some(e => e.event_name === 'Ruim')) return json({ error: { message: 'Parâmetro inválido', error_user_msg: 'Evento Ruim inválido' } }, 400);
    meta.push({ url: u, body: JSON.parse(opts.body) });
    return json({ events_received: JSON.parse(opts.body).data.length, fbtrace_id: 'TRACE1' });
  }
  if (u.host === 'www.google-analytics.com') { ga4.push({ url: u, body: JSON.parse(opts.body) }); return new Response(null, { status: 204 }); }
  return realFetch(url, opts);
};

const { req, login, close, base } = await boot();
const { db } = await import('../src/db.js');
const D = await import('../src/dispatch.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'cap', name: 'Cap', timezone: 'UTC', currency: 'BRL' } });
const integ = form => req('/sites/cap/integrations', { cookie: admin, form });
const beacon = (body, h = {}) => fetch(base + '/e', { method: 'POST', body: JSON.stringify(body), headers: { 'user-agent': CHROME, 'x-forwarded-for': '203.0.113.50', ...h } });
const edge = { 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': 'RidDoVisitante9', 'x-rastro-fbp': 'fb.1.1700000000000.1234567890', 'x-rastro-fbc': 'fb.1.1700000000000.IwAR-x', 'x-rastro-ip': '198.51.100.77' };

test('sem destino configurado, nada vai para a fila', async () => {
  await beacon({ s: 'cap', u: 'https://cap.dev/', i: 'evt_semdestino' });
  assert.equal((await db.get("SELECT COUNT(*) n FROM deliveries WHERE site='cap'")).n, 0);
});

test('configuração: validação do GA4 e do código de teste', async () => {
  assert.equal((await integ({ action: 'ga4', ga4_id: 'UA-123', ga4_secret: 'x' })).status, 400);
  assert.equal((await integ({ action: 'ga4', ga4_id: 'G-ABC123' })).status, 400, 'sem segredo');
  assert.equal((await integ({ action: 'capi', pixel: '555002', capi_token: 'TOK', test_code: 'abc' })).status, 400);
  assert.equal((await integ({ action: 'capi', pixel: '555002', capi_token: 'TOK', test_code: 'TEST123' })).status, 303);
  assert.equal((await integ({ action: 'ga4', ga4_id: 'g-abc123', ga4_secret: 'SEGREDO' })).status, 303);
  const s = await db.get("SELECT meta_pixel, meta_test_code, ga4_id, ga4_secret FROM sites WHERE id='cap'");
  assert.deepEqual(s, { meta_pixel: '555002', meta_test_code: 'TEST123', ga4_id: 'G-ABC123', ga4_secret: 'SEGREDO' });
});

test('evento do site vai para Meta (em lote) e GA4, com dados da borda; IP sai do banco depois do envio', async () => {
  assert.equal((await beacon({ s: 'cap', u: 'https://cap.dev/oferta?fbclid=IwAR-x&utm_source=FB', i: 'evt_pageview1', g: '111.222' }, edge)).status, 202);
  assert.equal((await beacon({ s: 'cap', n: 'Lead', u: 'https://cap.dev/oferta', i: 'evt_lead00001', v: 10 }, edge)).status, 202);
  const queued = await db.all("SELECT * FROM deliveries WHERE site='cap' ORDER BY id");
  assert.deepEqual(queued.map(d => [d.dest, d.event_id, d.status]), [['meta', 'evt_pageview1', 'pending'], ['meta', 'evt_lead00001', 'pending'], ['ga4', 'evt_lead00001', 'pending']], 'page_view não vai ao GA4');
  assert.ok(queued[0].payload.includes('198.51.100.77'), 'IP só no payload pendente');

  const out = await D.dispatch();
  assert.deepEqual(out, { sent: 3, failed: 0, retry: 0 });
  assert.equal(meta.length, 1, 'Meta recebe os eventos do site num lote');
  const [pv, lead] = meta[0].body.data;
  assert.equal(meta[0].body.test_event_code, 'TEST123');
  assert.ok(meta[0].url.pathname.endsWith('/555002/events') && meta[0].body.access_token === 'TOK' && !meta[0].url.search, 'token no corpo, não na URL');
  assert.deepEqual([pv.event_name, pv.event_id, pv.action_source, pv.event_source_url], ['PageView', 'evt_pageview1', 'website', 'https://cap.dev/oferta']);
  assert.deepEqual([pv.user_data.fbc, pv.user_data.fbp, pv.user_data.client_ip_address, pv.user_data.client_user_agent], [edge['x-rastro-fbc'], edge['x-rastro-fbp'], '198.51.100.77', CHROME]);
  assert.deepEqual(pv.user_data.external_id, [createHash('sha256').update('RidDoVisitante9').digest('hex')]);
  assert.deepEqual([lead.event_name, lead.custom_data], ['Lead', { value: 10, currency: 'BRL' }]);

  assert.equal(ga4.length, 1, 'GA4: só conversões');
  assert.equal(ga4[0].url.searchParams.get('measurement_id'), 'G-ABC123');
  assert.deepEqual([ga4[0].body.client_id, ga4[0].body.events[0].name, ga4[0].body.events[0].params.value], ['RidDoVisitante9', 'generate_lead', 10]);

  const sent = await db.all("SELECT status, payload, response FROM deliveries WHERE site='cap'");
  assert.ok(sent.every(d => d.status === 'sent' && d.payload === null));
  assert.ok(sent.some(d => d.response.includes('TRACE1')));
  assert.ok(!JSON.stringify(await db.all('SELECT * FROM deliveries')).includes('198.51.100.77'), 'IP não fica no banco');

  const page = await req('/sites/cap/events', { cookie: admin });
  assert.ok(page.text.includes('Meta ✓') && page.text.includes('GA4 ✓') && page.text.includes('TRACE1'), 'inspetor mostra o envio e a resposta');
  const integ2 = await req('/sites/cap/integrations', { cookie: admin });
  assert.ok(integ2.text.includes('GA4: envio server-side') && integ2.text.includes('Código de teste ativo') && integ2.text.includes('2 enviados'));
  assert.ok(integ2.text.includes('pattern="TEST[A-Za-z0-9_]{1,40}"'), 'padrão do código de teste chega intacto ao navegador');
});

test('erro da Meta: reenvio com espera crescente, falha final guarda payload sem IP e pode ser reenviada', async () => {
  await beacon({ s: 'cap', n: 'Lead', u: 'https://cap.dev/x', i: 'evt_retry0001' }, edge);
  await db.run("DELETE FROM deliveries WHERE dest='ga4'");
  metaFail = 99;
  let now = Date.now();
  const r1 = await D.dispatch({ now });
  assert.deepEqual(r1, { sent: 0, failed: 0, retry: 1 });
  let d = await db.get("SELECT * FROM deliveries WHERE event_id='evt_retry0001'");
  assert.deepEqual([d.status, d.attempts, d.next_at - now, d.response], ['pending', 1, D.BACKOFF[0], 'Erro temporário da Meta']);
  assert.deepEqual(await D.dispatch({ now }), { sent: 0, failed: 0, retry: 0 }, 'ainda não chegou a hora');
  for (const wait of D.BACKOFF) { now += wait; await D.dispatch({ now }); }
  d = await db.get("SELECT * FROM deliveries WHERE event_id='evt_retry0001'");
  assert.deepEqual([d.status, d.attempts], ['failed', 5]);
  assert.ok(d.payload && !d.payload.includes('198.51.100.77') && !d.payload.includes('client_user_agent'), 'payload guardado sem IP nem user agent');

  metaFail = 0;
  const page = await req('/sites/cap/events', { cookie: admin });
  assert.equal(page.status, 200);
  assert.equal((await req(`/sites/cap/deliveries/${d.id}/retry`, { cookie: admin, form: {} })).status, 303);
  await D.dispatch();
  d = await db.get("SELECT * FROM deliveries WHERE event_id='evt_retry0001'");
  assert.deepEqual([d.status, d.payload], ['sent', null]);
});

test('evento inválido no lote: a Meta recusa o lote, o Rastro reparte e só o ruim falha (sem reenvio)', async () => {
  await db.run("DELETE FROM deliveries");
  await db.run("UPDATE sites SET ga4_id=NULL, ga4_secret=NULL WHERE id='cap'");
  await req('/sites/cap/integrations', { cookie: admin, form: { action: 'ga4', ga4_id: '' } });
  await beacon({ s: 'cap', n: 'Lead', u: 'https://cap.dev/a', i: 'evt_bom000001' }, edge);
  await beacon({ s: 'cap', n: 'Ruim', u: 'https://cap.dev/a', i: 'evt_ruim00001' }, edge);
  const before = meta.length;
  assert.deepEqual(await D.dispatch(), { sent: 1, failed: 1, retry: 0 });
  assert.equal(meta.length, before + 1, 'o bom chegou no envio individual');
  const bad = await db.get("SELECT * FROM deliveries WHERE event_id='evt_ruim00001'");
  assert.deepEqual([bad.status, bad.attempts, bad.response], ['failed', 1, 'Evento Ruim inválido']);
  await integ({ action: 'ga4', ga4_id: 'G-ABC123', ga4_secret: 'SEGREDO' });
});

test('nomes de evento para o GA4 e lease da fila', async () => {
  assert.deepEqual(['pageview', 'Purchase', 'Clique no botão!', '9x'].map(D.ga4Name), ['page_view', 'purchase', 'clique_no_bot_o_', 'x']);
  // linha presa em "sending" (processo caiu) volta depois que o aluguel vence
  await beacon({ s: 'cap', n: 'Lead', u: 'https://cap.dev/y', i: 'evt_preso0001' }, edge);
  await db.run("UPDATE deliveries SET status='sending', next_at=? WHERE event_id='evt_preso0001'", [Date.now() + 60e3]);
  assert.equal((await D.dispatch()).sent, 0);
  assert.equal((await D.dispatch({ now: Date.now() + 61e3 })).sent, 2);
});
