// Aplicação: login, CSRF, papéis, link público, cron, força bruta e arquivos estáticos.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const { req, login, close } = await boot();
const { db } = await import('../src/db.js');
after(close);

let admin, viewer, uid;

test('login, sessão e CSRF', async () => {
  assert.equal((await req('/sites/blog')).location, '/login?next=%2Fsites%2Fblog');
  assert.equal((await req('/login', { form: { email: 'admin@test.dev', password: 'errada' } })).status, 401);
  admin = await login('ADMIN@test.dev');
  assert.ok(admin?.startsWith('sid='));
  assert.equal((await req('/sites', { cookie: admin, form: { id: 'x', name: 'X', timezone: 'UTC', currency: 'BRL' }, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await req('/sites', { cookie: admin, form: { id: 'blog', name: 'Blog', timezone: 'America/Sao_Paulo', currency: 'BRL' } })).location, '/sites/blog/setup');
  assert.equal((await req('/sites', { cookie: admin, form: { id: 'outro', name: 'Outro', timezone: 'UTC', currency: 'USD' } })).status, 303);
  assert.equal((await req('/sites', { cookie: admin, form: { id: 'blog', name: 'Dup', timezone: 'UTC', currency: 'BRL' } })).status, 400);
  assert.equal((await req('/login', { form: { email: 'admin@test.dev', password: 'admin-pass-123', next: '//evil.com' } })).location, '/', 'sem open redirect');
});

test('todas as páginas renderizam, com CSP e sem vazar parâmetros', async () => {
  for (const path of ['/sites/blog', '/sites/blog/campaigns', '/sites/blog/orders', '/sites/blog/traffic', '/sites/blog/realtime', '/sites/blog/funnels',
    '/sites/blog/journeys', '/sites/blog/attribution', '/sites/blog/integrations', '/sites/blog/settings', '/sites', '/team', '/account',
    '/sites/blog?range=__proto__&compare=x', '/sites/blog/campaigns?level=__proto__&platform=constructor', '/sites/blog/orders?page=-3']) {
    const r = await req(path, { cookie: admin });
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-security-policy'), /script-src 'nonce-/);
  }
  assert.equal((await req('/sites/nao-existe', { cookie: admin })).status, 404);
  assert.equal((await req('/sites/%E0%A4%A', { cookie: admin })).status, 400);
});

test('papéis: leitor só vê sites liberados; editor configura; só admin gerencia equipe', async () => {
  const inv = await req('/team', { cookie: admin, form: { email: 'leitor@test.dev', name: 'Leitor', role: 'viewer' } });
  const token = /\/invite\/([\w-]+)/.exec(inv.text)?.[1];
  assert.ok(token, 'link de convite exibido');
  assert.equal((await req(`/invite/${token}`, { form: { password: 'curta', confirm: 'curta' } })).status, 400);
  viewer = (await req(`/invite/${token}`, { form: { password: 'leitor-pass-1', confirm: 'leitor-pass-1' } })).cookie;
  assert.ok(viewer);
  assert.match((await req(`/invite/${token}`)).text, /Link inválido/, 'convite é de uso único');
  assert.equal((await req('/sites/blog', { cookie: viewer })).status, 404);
  uid = (await db.get("SELECT id FROM users WHERE email='leitor@test.dev'")).id;
  assert.equal((await req(`/team/${uid}`, { cookie: admin, form: { role: 'viewer', sites: 'blog' } })).status, 303);
  assert.equal((await req('/sites/blog', { cookie: viewer })).status, 200);
  assert.equal((await req('/sites/outro', { cookie: viewer })).status, 404);
  for (const path of ['/sites/blog/settings', '/sites/blog/integrations', '/team']) assert.equal((await req(path, { cookie: viewer })).status, 403, path);
  assert.equal((await req('/sites/blog/funnels', { cookie: viewer, form: { name: 'x', steps: '/a\n/b' } })).status, 403);
  assert.doesNotMatch((await req('/sites/blog', { cookie: viewer })).text, /Integrações<\/span>/, 'leitor não vê a seção');
  await req(`/team/${uid}`, { cookie: admin, form: { role: 'editor', sites: 'blog' } });
  assert.equal((await req('/sites/blog/integrations', { cookie: viewer })).status, 200, 'editor configura');
  assert.equal((await req('/sites/blog/delete', { cookie: viewer, form: { confirm: 'blog' } })).status, 403, 'só admin exclui');
  assert.equal((await req(`/team/${uid}`, { cookie: viewer, form: { role: 'admin' } })).status, 403);
});

test('link público mostra só tráfego e pode ser desativado', async () => {
  assert.equal((await req('/sites/blog/settings', { cookie: admin, form: { action: 'share_on' } })).status, 303);
  const t = (await db.get("SELECT share_token FROM sites WHERE id='blog'")).share_token;
  const shared = await req(`/share/${t}?range=today`);
  assert.equal(shared.status, 200);
  assert.ok(shared.text.includes('somente leitura') && !shared.text.includes('Faturamento'));
  await req('/sites/blog/settings', { cookie: admin, form: { action: 'share_off' } });
  assert.equal((await req(`/share/${t}`)).status, 404);
});

test('arquivos públicos: snippet, fontes, ícone e manifest', async () => {
  const s = await req('/s.js');
  assert.equal(s.headers.get('access-control-allow-origin'), '*');
  assert.equal((await req('/fonts/figtree.woff2')).headers.get('content-type'), 'font/woff2');
  assert.equal((await req('/manifest.webmanifest')).status, 200);
  assert.equal((await req('/fonts/../db.js')).status, 404, 'sem path traversal');
});

test('cron: só responde com o segredo e executa as tarefas', async () => {
  assert.equal((await req('/cron')).status, 404);
  assert.equal((await req('/cron', { headers: { authorization: 'Bearer errado' } })).status, 404);
  const ok = await req('/cron', { headers: { authorization: 'Bearer segredo-de-teste' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(ok.text), { meta: 0, errors: [], dispatch: { sent: 0, failed: 0, retry: 0 }, recovery: { sent: 0, skipped: 0, failed: 0 } });
});

test('força bruta: 10 falhas bloqueiam o IP', async () => {
  for (let i = 0; i < 10; i++) await req('/login', { form: { email: 'admin@test.dev', password: 'x' }, headers: { 'x-forwarded-for': '10.9.9.9' } });
  assert.equal((await req('/login', { form: { email: 'admin@test.dev', password: 'admin-pass-123' }, headers: { 'x-forwarded-for': '10.9.9.9' } })).status, 429);
});

test('pelo Worker da borda, o bloqueio de login vale para o IP real, não para o da Cloudflare', async () => {
  const via = ip => ({ 'x-edge-secret': 'segredo-da-borda', 'x-rastro-ip': ip, 'x-forwarded-for': '104.16.0.1' }); // todos chegam pelo mesmo IP da Cloudflare
  for (let i = 0; i < 10; i++) await req('/login', { form: { email: `ninguem${i}@test.dev`, password: 'x' }, headers: via('203.0.113.50') });
  assert.equal((await req('/login', { form: { email: 'outro1@test.dev', password: 'x' }, headers: via('203.0.113.50') })).status, 429, 'quem errou 10 vezes fica bloqueado');
  assert.equal((await req('/login', { form: { email: 'outro2@test.dev', password: 'x' }, headers: via('203.0.113.51') })).status, 401, 'outra pessoa pelo mesmo Worker não');
  const forjado = { 'x-edge-secret': 'errado', 'x-rastro-ip': '203.0.113.99', 'x-forwarded-for': '10.7.7.7' };
  assert.equal((await req('/login', { form: { email: 'outro3@test.dev', password: 'x' }, headers: forjado })).status, 401, 'IP da borda sem o segredo é ignorado');
});
