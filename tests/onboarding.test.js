// Etapa 4: agências isoladas, domínio do cliente pelo Cloudflare for SaaS, teste da Meta e assistente de 6 passos.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, CHROME } from './helpers.js';

// Cloudflare e Meta simuladas; o resto do fetch é real (servidor local).
const cfCalls = [];
let cfHost = null, metaOk = true;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.host === 'api.cloudflare.com') {
    cfCalls.push({ method: opts.method, path: u.pathname, auth: opts.headers?.authorization, body: opts.body && JSON.parse(opts.body) });
    if (opts.method === 'POST') { cfHost = { id: 'ch_1', hostname: JSON.parse(opts.body).hostname, status: 'pending', ssl: { status: 'pending_validation' } }; return json({ success: true, result: cfHost }); }
    if (opts.method === 'GET') return json({ success: true, result: cfHost });
    if (opts.method === 'DELETE') { cfHost = null; return json({ success: true, result: { id: 'ch_1' } }); }
  }
  if (u.host === 'graph.facebook.com') {
    if (!metaOk) return json({ error: { message: 'Invalid OAuth access token' } }, 400);
    return json({ id: u.pathname.split('/').pop(), name: 'Pixel da Loja', auth: opts.headers?.authorization });
  }
  return realFetch(url, opts);
};

process.env.CF_API_TOKEN = 'cf-token'; process.env.CF_ZONE_ID = 'zona1'; process.env.CF_SAAS_TARGET = 'edge.rastro.dev';
const { req, login, close, base } = await boot();
const { db } = await import('../src/db.js');
after(close);

const owner = await login();
await req('/sites', { cookie: owner, form: { id: 'loja', name: 'Loja', timezone: 'America/Sao_Paulo', currency: 'BRL' } });

test('agências: a outra agência não vê nem mexe em nada da primeira', async () => {
  const created = await req('/agencies', { cookie: owner, form: { name: 'Agência B', email: 'dono@b.dev' } });
  assert.equal(created.status, 200);
  const link = /\/invite\/([\w-]+)/.exec(created.text)?.[1];
  assert.ok(link, 'convite do dono da nova agência');
  assert.equal((await req(`/invite/${link}`, { form: { password: 'senha-da-b-123', confirm: 'senha-da-b-123' } })).status, 303);
  const b = await login('dono@b.dev', 'senha-da-b-123');

  assert.equal((await req('/sites/loja', { cookie: b })).status, 404, 'site de outra agência');
  assert.equal((await req('/sites/loja/settings', { cookie: b, form: { action: 'share_on' } })).status, 404);
  assert.ok(!(await req('/sites', { cookie: b })).text.includes('>Loja<'), 'lista de sites só da agência');
  assert.equal((await req('/agencies', { cookie: b })).status, 404, 'só o dono da plataforma cria agências');

  assert.equal((await req('/sites', { cookie: b, form: { id: 'loja-b', name: 'Loja B', timezone: 'UTC', currency: 'BRL' } })).status, 303);
  assert.equal((await req('/sites/loja-b', { cookie: owner })).status, 404, 'e o contrário também');
  const team = await req('/team', { cookie: b });
  assert.ok(team.text.includes('dono@b.dev') && !team.text.includes('admin@test.dev'), 'equipe só da agência');
  const ownerId = (await db.get("SELECT id FROM users WHERE email='admin@test.dev'")).id;
  assert.equal((await req(`/team/${ownerId}/delete`, { cookie: b, form: {} })).status, 404, 'não apaga gente de outra agência');
  // Dono da agência 1 (sem ser dono da plataforma) não mexe na conta do dono da plataforma
  assert.equal((await req('/team', { cookie: owner, form: { email: 'socio@a.dev', role: 'admin' } })).status, 200);
  const sid = (await db.get("SELECT id FROM users WHERE email='socio@a.dev'")).id;
  const inv = await req(`/team/${sid}/link`, { cookie: owner, form: {} });
  const t = /\/invite\/([\w-]+)/.exec(inv.text)[1];
  await req(`/invite/${t}`, { form: { password: 'senha-socio-123', confirm: 'senha-socio-123' } });
  const socio = await login('socio@a.dev', 'senha-socio-123');
  for (const path of [`/team/${ownerId}/link`, `/team/${ownerId}`, `/team/${ownerId}/delete`]) assert.equal((await req(path, { cookie: socio, form: { role: 'viewer' } })).status, 403, path);
  assert.equal((await req('/team', { cookie: b, form: [['email', 'gestor@b.dev'], ['role', 'editor'], ['sites', 'loja'], ['sites', 'loja-b']] })).status, 200);
  const g = await db.get("SELECT id FROM users WHERE email='gestor@b.dev'");
  assert.deepEqual((await db.all('SELECT site_id FROM user_sites WHERE user_id=?', [g.id])).map(x => x.site_id), ['loja-b'], 'não libera site de outra agência');
  assert.ok(team.text.includes('Dono'), 'papéis com os nomes novos');
});

test('domínio: cadastra na Cloudflare, mostra o CNAME, confere e vira o endereço do snippet', async () => {
  assert.equal((await req('/sites/loja/setup', { cookie: owner, form: { action: 'domain_add', host: 'www.loja.com.br' } })).status, 400, 'só subdomínio t.');
  assert.equal((await req('/sites/loja/setup', { cookie: owner, form: { action: 'domain_add', host: 'https://t.loja.com.br/' } })).status, 303);
  const post = cfCalls.find(c => c.method === 'POST');
  assert.deepEqual([post.path, post.auth, post.body.hostname, post.body.ssl.method], ['/client/v4/zones/zona1/custom_hostnames', 'Bearer cf-token', 't.loja.com.br', 'http']);
  let s = await db.get("SELECT edge_host, edge_status, domains FROM sites WHERE id='loja'");
  assert.deepEqual([s.edge_host, s.edge_status, s.domains], ['t.loja.com.br', 'dns', 'loja.com.br'], 'domínio raiz liberado nos domínios do site');
  const page = await req('/sites/loja/setup', { cookie: owner });
  assert.ok(page.text.includes('edge.rastro.dev') && page.text.includes('Aguardando o CNAME'));

  cfHost = { ...cfHost, status: 'active', ssl: { status: 'active' } };
  assert.equal((await req('/sites/loja/setup', { cookie: owner, form: { action: 'domain_check' } })).status, 303);
  assert.equal((await db.get("SELECT edge_status FROM sites WHERE id='loja'")).edge_status, 'active');
  assert.ok((await req('/sites/loja/integrations', { cookie: owner })).text.includes('https://t.loja.com.br/s.js'), 'snippet usa o domínio do cliente');
  await req('/sites', { cookie: owner, form: { id: 'outra', name: 'Outra', timezone: 'UTC', currency: 'BRL' } });
  assert.equal((await req('/sites/outra/setup', { cookie: owner, form: { action: 'domain_add', host: 't.loja.com.br' } })).status, 400, 'domínio em uso');
  assert.equal((await req('/sites/outra/setup', { cookie: owner, form: { action: 'domain_add', host: 't.com.br' } })).status, 400, 'sufixo público');
  cfCalls.length = 0;
  assert.equal((await req('/sites/outra/setup', { cookie: owner, form: { action: 'domain_add', host: 't.outra.com' } })).status, 303);
  assert.equal((await req('/sites/outra/setup', { cookie: owner, form: { action: 'domain_add', host: 't.outra2.com' } })).status, 303);
  assert.ok(cfCalls.some(c => c.method === 'DELETE'), 'trocar de domínio apaga o anterior na Cloudflare');
  // site excluído: fila e domínio somem, e o id não volta a ser usado
  assert.equal((await req('/sites/outra/delete', { cookie: owner, form: { confirm: 'outra' } })).status, 303);
  assert.equal((await req('/sites', { cookie: owner, form: { id: 'outra', name: 'De novo', timezone: 'UTC', currency: 'BRL' } })).status, 400);
});

test('Meta: testar conexão confere o pixel com o token (no cabeçalho, não na URL)', async () => {
  const back = { back: 'setup' };
  assert.equal((await req('/sites/loja/integrations', { cookie: owner, form: { ...back, action: 'capi', pixel: '555010', capi_token: 'TOKEN-CAPI' } })).location, '/sites/loja/setup');
  metaOk = false;
  assert.equal((await req('/sites/loja/integrations', { cookie: owner, form: { ...back, action: 'meta_test' } })).location, '/sites/loja/setup?meta=erro');
  assert.equal((await db.get("SELECT meta_checked FROM sites WHERE id='loja'")).meta_checked, null);
  metaOk = true;
  assert.equal((await req('/sites/loja/integrations', { cookie: owner, form: { ...back, action: 'meta_test' } })).status, 303);
  const s = await db.get("SELECT meta_checked, meta_pixel_name FROM sites WHERE id='loja'");
  assert.ok(s.meta_checked > 0 && s.meta_pixel_name === 'Pixel da Loja');
  await req('/sites/loja/integrations', { cookie: owner, form: { action: 'capi', pixel: '555010', capi_token: 'OUTRO-TOKEN' } });
  assert.equal((await db.get("SELECT meta_checked FROM sites WHERE id='loja'")).meta_checked, null, 'token novo precisa de teste novo');
  await req('/sites/loja/integrations', { cookie: owner, form: { action: 'meta_test' } });
});

test('assistente: cada passo fica pronto com o que acontece de verdade', async () => {
  const done = async () => Number(/(\d) de 6 passos prontos|Tudo certo/.exec((await req('/sites/loja/setup', { cookie: owner })).text)?.[1] ?? 6);
  assert.equal(await done(), 3, 'projeto, domínio e Meta');
  await fetch(base + '/e', { method: 'POST', body: JSON.stringify({ s: 'loja', u: 'https://www.loja.com.br/', i: 'evt_onb00001' }),
    headers: { 'user-agent': CHROME, 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': 'RidOnboarding0000000001', 'x-rastro-ip': '198.51.100.3' } });
  assert.equal(await done(), 4, 'script');
  const W = await import('../src/sales/webhooks.js'), DB = await import('../src/db.js');
  await fetch(`${base}/hooks/${W.hookToken(DB.sites.get('loja'), 'generic')}/generic`, { method: 'POST', body: JSON.stringify({ order_id: 'O1', status: 'paid', amount: 10, email: 'c@d.ef' }) });
  assert.equal(await done(), 5, 'plataforma de venda');
  const D = await import('../src/dispatch.js');
  await D.dispatch();
  assert.ok((await req('/sites/loja/setup', { cookie: owner })).text.includes('Tudo certo'), 'teste final com envio aceito pela Meta');
});
