// Emite chaves do plano Pro (ADR 0022). Só o autor roda: a chave privada nunca entra no repositório.
//   node scripts/license.mjs issue --to "Agência X" --order HP123     imprime a chave para enviar ao comprador
//   node scripts/license.mjs check <chave>                             confere uma chave
//   node scripts/license.mjs issuer --id h1                            cria uma emissora para a instalação que vende (ADR 0025)
//                                                                      e imprime LICENSE_ISSUER_KEY e LICENSE_CERT para o .env dela
// Chave privada: LICENSE_PRIVATE_KEY_FILE ou ~/.sinqfy/license_private.pem (Ed25519, PKCS#8).
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { verifyKey, issueWith, certify } from '../src/license.js';

const [cmd, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : undefined; };

const file = process.env.LICENSE_PRIVATE_KEY_FILE || join(homedir(), '.sinqfy', 'license_private.pem');
if (cmd === 'issue') {
  const key = issueWith(createPrivateKey(readFileSync(file)), { to: opt('to'), order: opt('order') });
  if (!verifyKey(key)) throw new Error('A chave privada não corresponde à chave pública de src/license.js.');
  console.log(key);
} else if (cmd === 'issuer') {
  // Emissora nova a cada troca (vazamento ou rotina). A antiga vai para REVOKED_ISSUERS só se tiver vazado.
  const id = opt('id');
  if (!/^[\w-]{1,40}$/.test(id || '')) throw new Error('Use --id com letras, números ou hífen (ex.: h1).');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const cert = certify(createPrivateKey(readFileSync(file)), publicKey, id);
  if (!verifyKey(issueWith(privateKey, {}, Date.now(), cert))) throw new Error('A chave privada não corresponde à chave pública de src/license.js.');
  console.log('LICENSE_ISSUER_KEY=' + privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  console.log('LICENSE_CERT=' + cert);
} else if (cmd === 'check') {
  console.log(verifyKey(rest[0]) || 'Chave inválida.');
} else {
  console.log('Uso: node scripts/license.mjs issue --to "Nome" --order PEDIDO | check <chave> | issuer --id ID');
}
