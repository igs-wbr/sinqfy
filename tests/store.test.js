// Venda do Pro pela Hubla (ADR 0026): webhook assina a chave, o comprador resgata com e-mail e pedido, reembolso bloqueia.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
const root = generateKeyPairSync('ed25519'), issuer = generateKeyPairSync('ed25519');
const { certify, verifyWith, issueWith } = await import('../src/license.js');
Object.assign(process.env, { LICENSE_ISSUER_KEY: issuer.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  LICENSE_CERT: certify(root.privateKey, issuer.publicKey, 'h1'), HUBLA_TOKEN: 'tok-hubla', HUBLA_PRODUCTS: 'prod-sinqfy' });
const { boot } = await import('./helpers.js');
const { req, close } = await boot();
const { db } = await import('../src/db.js');
after(close);

const hubla = (type, status, { product = 'prod-sinqfy', token = 'tok-hubla', sandbox = 'false', id = 'inv-1', order = 'PED-77' } = {}) => req('/hooks/hubla', {
  headers: { 'content-type': 'application/json', 'x-hubla-token': token, 'x-hubla-sandbox': sandbox },
  body: JSON.stringify({ type, version: '2.0.0', event: {
    product: { id: product, name: 'Sinqfy Pro' }, products: [{ id: product }],
    user: { firstName: 'Ana', lastName: 'Lima', email: 'Ana@Exemplo.com' },
    invoice: { id, orderId: order, status, payer: { email: 'pagador@exemplo.com' }, amount: { totalCents: 9700 } },
  } }),
});
const redeem = (email, order) => req('/licenca', { form: { email, order } });

test('webhook: token, sandbox e outro produto não geram chave', async () => {
  assert.equal((await hubla('invoice.payment_succeeded', 'paid', { token: 'errado' })).status, 401);
  assert.equal((await hubla('invoice.payment_succeeded', 'paid', { sandbox: 'true' })).status, 200);
  assert.equal((await hubla('invoice.payment_succeeded', 'paid', { product: 'outro' })).status, 200);
  assert.equal((await db.all('SELECT 1 FROM license_orders')).length, 0);
});

test('pago: chave válida, resgate só com e-mail e pedido certos, sem e-mail gravado', async () => {
  assert.equal((await hubla('invoice.payment_succeeded', 'paid')).status, 200);
  assert.equal((await hubla('invoice.status_updated', 'paid')).status, 200, 'repetido não duplica');
  const rows = await db.all('SELECT * FROM license_orders');
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /exemplo\.com|Ana|Lima/i, 'nada pessoal em claro');

  assert.equal((await redeem('ana@exemplo.com', 'PED-99')).status, 404);
  assert.equal((await redeem('outra@exemplo.com', 'PED-77')).status, 404);
  for (const [email, order] of [[' ANA@exemplo.com ', 'PED-77'], ['pagador@exemplo.com', 'inv-1']]) {
    const ok = await redeem(email, order);
    assert.equal(ok.status, 200);
    const key = /<textarea[^>]*>([^<]+)<\/textarea>/.exec(ok.text)[1];
    const p = verifyWith(root.publicKey, key);
    assert.equal(p.to, 'Ana Lima');
    assert.equal(p.order, 'PED-77');
  }
});

test('chargeback bloqueia e disputa ganha libera; reembolso é final, mesmo fora de ordem', async () => {
  await hubla('invoice.status_updated', 'chargeback');
  assert.equal((await redeem('ana@exemplo.com', 'PED-77')).status, 410);
  await hubla('invoice.status_updated', 'paid');
  assert.equal((await redeem('ana@exemplo.com', 'PED-77')).status, 200, 'disputa ganha');
  await hubla('invoice.refunded', 'refunded');
  await hubla('invoice.status_updated', 'paid');
  assert.equal((await redeem('ana@exemplo.com', 'PED-77')).status, 410, 'paid atrasado não desfaz o reembolso');

  await hubla('invoice.refunded', 'refunded', { id: 'inv-2', order: 'PED-78' }); // reembolso chega antes do pagamento
  await hubla('invoice.payment_succeeded', 'paid', { id: 'inv-2', order: 'PED-78' });
  assert.equal((await redeem('ana@exemplo.com', 'PED-78')).status, 410);
});

test('cadeia: emissora certificada vale; emissora sem certificado, revogada ou pedido revogado não', () => {
  const cert = certify(root.privateKey, issuer.publicKey, 'h1');
  const key = issueWith(issuer.privateKey, { order: 'P1' }, Date.now(), cert);
  assert.equal(verifyWith(root.publicKey, key).order, 'P1');
  assert.equal(verifyWith(root.publicKey, issueWith(issuer.privateKey, { order: 'P1' })), null, 'emissora sozinha não vale');
  assert.equal(verifyWith(root.publicKey, issueWith(issuer.privateKey, {}, Date.now(), certify(generateKeyPairSync('ed25519').privateKey, issuer.publicKey, 'h1'))), null, 'certificado de outra raiz');
  assert.equal(verifyWith(root.publicKey, issueWith(generateKeyPairSync('ed25519').privateKey, {}, Date.now(), cert)), null, 'outra emissora com o certificado da h1');
  assert.equal(verifyWith(root.publicKey, key, { issuers: new Set(['h1']), orders: new Set() }), null, 'emissora revogada');
  assert.equal(verifyWith(root.publicKey, key, { issuers: new Set(), orders: new Set(['P1']) }), null, 'pedido revogado');
  assert.equal(verifyWith(root.publicKey, cert), null, 'o certificado não é chave');
  assert.equal(verifyWith(root.publicKey, issueWith(root.privateKey, { order: 'P2' })).order, 'P2', 'chave antiga, assinada pela raiz, continua valendo');
  assert.equal(verifyWith(root.publicKey, key.split('.').slice(0, 3).join('.')), null, '3 partes');
});

test('emissora trocada: o resgate reemite a chave com a emissora nova, mesmos dados e datas', async () => {
  await hubla('invoice.payment_succeeded', 'paid', { id: 'inv-3', order: 'PED-80' });
  const antiga = /<textarea[^>]*>([^<]+)<\/textarea>/.exec((await redeem('ana@exemplo.com', 'PED-80')).text)[1];
  const nova = generateKeyPairSync('ed25519');
  Object.assign(process.env, { LICENSE_ISSUER_KEY: nova.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), LICENSE_CERT: certify(root.privateKey, nova.publicKey, 'h2') });
  const key = /<textarea[^>]*>([^<]+)<\/textarea>/.exec((await redeem('ana@exemplo.com', 'PED-80')).text)[1];
  assert.notEqual(key, antiga);
  const revogada = { issuers: new Set(['h1']), orders: new Set() };
  assert.equal(verifyWith(root.publicKey, antiga, revogada), null);
  const p = verifyWith(root.publicKey, key, revogada), a = verifyWith(root.publicKey, antiga);
  assert.deepEqual([p.to, p.order, p.issued, p.updates], [a.to, a.order, a.issued, a.updates]);
});

test('força bruta: 10 erros bloqueiam o resgate', async () => {
  for (let i = 0; i < 10; i++) await redeem('x@exemplo.com', 'P' + i);
  assert.equal((await redeem('ana@exemplo.com', 'PED-77')).status, 429);
});
