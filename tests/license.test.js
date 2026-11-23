// Plano da instalação (ADR 0022): Grátis com 1 site, teste de 7 dias e chave Pro assinada.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
process.env.TEST_FREE_PLAN = '1';
const { boot } = await import('./helpers.js');
const { req, login, close } = await boot();
const { db } = await import('../src/db.js');
const L = await import('../src/license.js');
after(close);
const admin = await login();
const site = id => req('/sites', { cookie: admin, form: { id, name: id, timezone: 'America/Sao_Paulo', currency: 'BRL' } });

test('chave: assinatura confere, adulterada ou de outra chave não', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const make = (p, k = privateKey) => { const b = Buffer.from(JSON.stringify(p)); return `${b.toString('base64url')}.${sign(null, b, k).toString('base64url')}`; };
  const key = make({ plan: 'pro', to: 'Agência X' });
  assert.equal(L.verifyWith(publicKey, key).to, 'Agência X');
  const [, sig] = key.split('.');
  assert.equal(L.verifyWith(publicKey, `${Buffer.from(JSON.stringify({ plan: 'pro', to: 'Outra' })).toString('base64url')}.${sig}`), null, 'payload trocado');
  assert.equal(L.verifyWith(publicKey, make({ plan: 'free' })), null, 'só chave Pro');
  assert.equal(L.verifyWith(publicKey, make({ plan: 'pro' }, generateKeyPairSync('ed25519').privateKey)), null, 'outra chave privada');
  assert.equal(L.verifyKey(key), null, 'chave de teste não vale na chave pública do Trackify');
  for (const bad of ['', 'x', 'a.b', null]) assert.equal(L.verifyKey(bad), null);
});

test('Grátis: 1 site; o segundo é bloqueado no painel, o teste de 7 dias libera e não se repete', async () => {
  assert.equal((await site('primeiro')).status, 303);
  const second = await site('segundo');
  assert.equal(second.status, 400);
  assert.match(second.text, /plano Grátis tem 1 site/);

  // Site a mais criado por fora (ex.: antes do plano existir): coleta segue, painel bloqueado, configurações abertas.
  await db.run("INSERT INTO sites(id, name, timezone, currency, created, webhook_token, agency_id) VALUES ('extra', 'Extra', 'UTC', 'BRL', ?, 'tok-extra', 1)", [Date.now() + 1000]);
  await (await import('../src/db.js')).loadSites();
  const page = await req('/sites/extra', { cookie: admin });
  assert.equal(page.status, 402);
  assert.match(page.text, /precisa do <em>Pro<\/em>/);
  assert.equal((await req('/sites/primeiro', { cookie: admin })).status, 200, 'o primeiro site abre');
  assert.equal((await req('/sites/extra/settings', { cookie: admin })).status, 200, 'configurações livres para voltar a 1 site');

  const plan = await req('/plano', { cookie: admin });
  assert.match(plan.text, /R\$ 97<small>pagamento único/);
  assert.match(plan.text, /Teste grátis por 7 dias/);
  assert.equal((await req('/plano', { cookie: admin, form: { action: 'trial' } })).status, 303);
  assert.equal((await req('/sites/extra', { cookie: admin })).status, 200, 'teste libera');
  assert.equal((await site('segundo')).status, 303);
  assert.equal((await req('/plano', { cookie: admin, form: { action: 'trial' } })).status, 400, 'teste uma vez só');

  await db.run("UPDATE install SET v=? WHERE k='trial_started'", [String(Date.now() - 8 * 864e5)]);
  assert.equal((await req('/sites/extra', { cookie: admin })).status, 402, 'teste vencido volta ao Grátis');
  assert.match((await req('/plano', { cookie: admin })).text, /Teste já usado/);
  const bad = await req('/plano', { cookie: admin, form: { action: 'key', key: 'abc.def' } });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /Chave inválida/);
});
