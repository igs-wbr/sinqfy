// Emite chaves do plano Pro (ADR 0022). Só o autor roda: a chave privada nunca entra no repositório.
//   node scripts/license.mjs issue --to "Agência X" --order HP123     imprime a chave para enviar ao comprador
//   node scripts/license.mjs check <chave>                             confere uma chave
// Chave privada: LICENSE_PRIVATE_KEY_FILE ou ~/.trackify/license_private.pem (Ed25519, PKCS#8).
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { verifyKey } from '../src/license.js';

const [cmd, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : undefined; };

if (cmd === 'issue') {
  const file = process.env.LICENSE_PRIVATE_KEY_FILE || join(homedir(), '.trackify', 'license_private.pem');
  const now = Date.now();
  const payload = { plan: 'pro', to: String(opt('to') || '').slice(0, 80), order: String(opt('order') || '').slice(0, 60), issued: now, updates: now + 365 * 864e5 };
  const body = Buffer.from(JSON.stringify(payload));
  const key = `${body.toString('base64url')}.${sign(null, body, createPrivateKey(readFileSync(file))).toString('base64url')}`;
  if (!verifyKey(key)) throw new Error('A chave privada não corresponde à chave pública de src/license.js.');
  console.log(key);
} else if (cmd === 'check') {
  console.log(verifyKey(rest[0]) || 'Chave inválida.');
} else {
  console.log('Uso: node scripts/license.mjs issue --to "Nome" --order PEDIDO | check <chave>');
}
