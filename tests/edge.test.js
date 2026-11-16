// Worker da borda (edge/worker.js): cookies primários, consentimento, repasse para a origem e fila de falhas no R2.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { identify, cookieDomain, scrubUrl } from '../edge/worker.js';

const calls = [], puts = [];
let originStatus = 202;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (originStatus === 'down') throw new Error('conexão recusada');
  return new Response(String(url).endsWith('/s.js') ? '!function(){}()' : null, { status: originStatus });
};
const env = { ORIGIN: 'https://app.rastro.dev', EDGE_SECRET: 's3gredo', RAW: { put: async (k, v) => puts.push([k, JSON.parse(v)]) } };
const run = async (req) => {
  const waits = [];
  const res = await worker.fetch(req, env, { waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  return res;
};
const beacon = (body, headers = {}) => new Request('https://t.cliente.com.br/e', {
  method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://www.cliente.com.br', 'user-agent': 'UA', 'cf-connecting-ip': '203.0.113.5', 'cf-ipcountry': 'BR', ...headers },
});
const jar = res => Object.fromEntries(res.headers.getSetCookie().map(c => c.split(';')[0].split('=')));
beforeEach(() => { calls.length = 0; puts.length = 0; originStatus = 202; });

test('painel pelo Worker: só no PANEL_HOST, sem cabeçalho da borda forjado, com o IP real e os cookies da origem', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const h = new Headers({ location: '/sites/loja' });
    h.append('set-cookie', 'sid=abc; Path=/; HttpOnly'); h.append('set-cookie', 'outro=1; Path=/');
    return new Response(null, { status: 303, headers: h });
  };
  try {
    const penv = { ...env, PANEL_HOST: 'trackify.user.workers.dev' };
    const req = new Request('https://trackify.user.workers.dev/login?next=%2Fsites', { method: 'POST', body: 'email=a%40b.c&password=x',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '198.51.100.7', 'x-edge-secret': 'forjado', 'x-rastro-rid': 'RidForjado1234567890ab', cookie: 'sid=velho' } });
    const res = await worker.fetch(req, penv, { waitUntil() {} });
    const [c] = calls;
    assert.equal(c.url, 'https://app.rastro.dev/login?next=%2Fsites');
    assert.deepEqual([c.init.method, c.init.redirect, new TextDecoder().decode(c.init.body)], ['POST', 'manual', 'email=a%40b.c&password=x']);
    const h = c.init.headers;
    assert.deepEqual([h.get('x-edge-secret'), h.get('x-rastro-ip'), h.get('x-rastro-rid'), h.get('cookie'), h.get('host')], ['s3gredo', '198.51.100.7', null, 'sid=velho', null]);
    assert.deepEqual([res.status, res.headers.get('location'), res.headers.getSetCookie().length], [303, '/sites/loja', 2]);
    calls.length = 0;
    assert.equal((await worker.fetch(new Request('https://t.cliente.com.br/login'), penv, { waitUntil() {} })).status, 404, 'domínio de cliente não mostra o painel');
    assert.equal((await worker.fetch(new Request('https://trackify.user.workers.dev/login'), env, { waitUntil() {} })).status, 404, 'sem PANEL_HOST, nada de painel');
    assert.equal(calls.length, 0);
  } finally { globalThis.fetch = realFetch; }
});

test('domínio do cookie e identificadores', () => {
  assert.equal(cookieDomain('t.cliente.com.br'), 'cliente.com.br');
  assert.equal(cookieDomain('localhost'), null);
  assert.equal(cookieDomain('cliente.com.br'), null, 'nunca um sufixo público');
  assert.equal(cookieDomain('trackify-edge.user.workers.dev'), null);
  assert.equal(scrubUrl('https://x.dev/p?email=a%40b.com&utm_source=FB&fbclid=I1'), 'https://x.dev/p?utm_source=FB&fbclid=I1');
  const now = 1700000000000;
  const fresh = identify({}, 'https://x.dev/?fbclid=IwAR1', now);
  assert.match(fresh.rid, /^[\w-]{22}$/);
  assert.match(fresh.fbp, /^fb\.1\.1700000000000\.\d{10}$/);
  assert.equal(fresh.fbc, 'fb.1.1700000000000.IwAR1');
  const kept = identify({ _rid: 'RidAntigo123', _fbp: 'fb.1.1600000000000.1111111111', _fbc: 'fb.1.1600000000000.IwAR1' }, 'https://x.dev/?fbclid=IwAR1', now);
  assert.deepEqual(kept, { rid: 'RidAntigo123', fbp: 'fb.1.1600000000000.1111111111', fbc: 'fb.1.1600000000000.IwAR1' }, 'mesmo clique: mantém o fbc');
  assert.equal(identify({ _fbc: 'fb.1.1600000000000.IwAR1' }, 'https://x.dev/?fbclid=IwAR2', now).fbc, 'fb.1.1700000000000.IwAR2', 'clique novo: fbc novo');
  assert.equal(identify({ _rid: 'curto' }, 'https://x.dev/', now).rid.length, 22, 'cookie inválido é trocado');
});

test('beacon: grava cookies no domínio do cliente e repassa à origem com o segredo', async () => {
  const res = await run(beacon({ s: 'site', u: 'https://www.cliente.com.br/?fbclid=IwAR9' }, { cookie: '_rid=RidAntigo123' }));
  assert.equal(res.status, 202);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://www.cliente.com.br');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  const c = jar(res);
  assert.equal(c._rid, 'RidAntigo123');
  assert.match(c._fbc, /\.IwAR9$/);
  assert.ok(res.headers.getSetCookie().every(x => x.includes('Domain=cliente.com.br') && x.includes('Max-Age=34560000') && x.includes('Secure')));
  const [o] = calls;
  assert.equal(o.url, 'https://app.rastro.dev/e');
  assert.deepEqual([o.init.headers['x-edge-secret'], o.init.headers['x-rastro-rid'], o.init.headers['x-rastro-ip'], o.init.headers['cf-ipcountry']], ['s3gredo', 'RidAntigo123', '203.0.113.5', 'BR']);
  assert.equal(o.init.headers['x-rastro-fbc'], c._fbc);
});

test('cookie malformado de outro sistema não derruba o beacon', async () => {
  const res = await run(beacon({ s: 'site', u: 'https://www.cliente.com.br/' }, { cookie: 'quebrado=%E0%A4%A; _rid=RidAntigo123; semigual' }));
  assert.equal(res.status, 202);
  assert.equal(jar(res)._rid, 'RidAntigo123');
});

test('sem consentimento: nenhum cookie e nenhum id persistente', async () => {
  const res = await run(beacon({ s: 'site', u: 'https://www.cliente.com.br/?fbclid=IwAR9', c: 0 }));
  assert.equal(res.status, 202);
  assert.deepEqual(res.headers.getSetCookie(), []);
  const h = calls[0].init.headers;
  assert.equal(h['x-rastro-rid'], undefined);
  assert.equal(h['x-rastro-fbp'], undefined);
  assert.match(h['x-rastro-fbc'], /\.IwAR9$/, 'fbc da URL ainda vai para a origem');
});

test('origem fora do ar: beacon vai para o R2, sem o segredo', async () => {
  for (const s of ['down', 503]) {
    originStatus = s;
    assert.equal((await run(beacon({ s: 'site', u: 'https://www.cliente.com.br/' }))).status, 202);
  }
  assert.equal(puts.length, 2);
  assert.match(puts[0][0], /^failed\/\d{4}-\d{2}-\d{2}\//);
  assert.equal(JSON.parse(puts[0][1].body).s, 'site');
  assert.ok(!JSON.stringify(puts).includes('s3gredo') && !JSON.stringify(puts).includes('203.0.113.5') && !JSON.stringify(puts).includes('"UA"'), 'sem segredo, IP nem user agent');
  originStatus = 400;
  await run(beacon({ s: 'nope', u: 'x' }));
  assert.equal(puts.length, 2, 'erro do cliente (4xx) não vai para a fila');
});

test('entrada inválida, preflight e snippet', async () => {
  assert.equal((await run(beacon('x'.repeat(5000)))).status, 413);
  assert.equal((await run(new Request('https://t.cliente.com.br/e', { method: 'POST', body: '{' }))).status, 400);
  const pre = await run(new Request('https://t.cliente.com.br/e', { method: 'OPTIONS', headers: { origin: 'https://www.cliente.com.br' } }));
  assert.equal(pre.status, 204);
  const js = await run(new Request('https://t.cliente.com.br/s.js'));
  assert.equal(await js.text(), '!function(){}()');
  assert.equal(js.headers.get('cache-control'), 'public, max-age=3600');
  originStatus = 503;
  assert.equal((await run(new Request('https://t.cliente.com.br/s.js'))).headers.get('cache-control'), 'no-store', 'erro da origem não fica em cache');
  originStatus = 202;
  assert.equal(calls.at(-1).url, 'https://app.rastro.dev/s.js');
  assert.equal((await run(new Request('https://t.cliente.com.br/qualquer'))).status, 404);
  assert.equal(calls.length, 2, 'nada além do snippet chega à origem');
});

test('link do WhatsApp: repassa com o visitante e só redireciona para o wa.me', async () => {
  const realStatus = originStatus;
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return new Response(null, { status: 302, headers: { location: String(url).includes('/w/mau') ? 'https://evil.com/' : 'https://wa.me/5511999990000?text=oi%20%5BABCDE%5D' } }); };
  const ok = await run(new Request('https://t.cliente.com.br/w/abc1234', { headers: { cookie: '_rid=RidAntigo123', referer: 'https://www.cliente.com.br/?fbclid=IwARw', 'cf-connecting-ip': '203.0.113.9' } }));
  assert.equal(ok.status, 302);
  assert.match(ok.headers.get('location'), /^https:\/\/wa\.me\//);
  const h = calls.at(-1).init.headers;
  assert.deepEqual([calls.at(-1).url, h['x-edge-secret'], h['x-rastro-rid'], h['x-rastro-ip']], ['https://app.rastro.dev/w/abc1234', 's3gredo', 'RidAntigo123', '203.0.113.9']);
  assert.match(h['x-rastro-fbc'], /IwARw$/);
  assert.equal((await run(new Request('https://t.cliente.com.br/w/mau1234'))).status, 502, 'redirecionamento fora do WhatsApp é barrado');
  const semCookie = await run(new Request('https://t.cliente.com.br/w/abc1234'));
  assert.equal(calls.at(-1).init.headers['x-rastro-rid'], undefined, 'sem cookie, sem rid');
  assert.equal(semCookie.status, 302);
  originStatus = realStatus;
});
