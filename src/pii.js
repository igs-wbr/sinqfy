// Dados pessoais (ADR 0013): nome, e-mail e telefone ficam cifrados com AES-256-GCM (chave DATA_KEY, fora do banco)
// e, ao lado, um índice cego (HMAC com chave) para casar registros. O SHA-256 que a Meta pede é calculado só na hora do envio.
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { env } from './db.js';

let key = null;
function dataKey() {
  if (key) return key;
  const raw = env.DATA_KEY || '';
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('Defina DATA_KEY com 32 bytes (openssl rand -hex 32) para guardar contatos do CRM');
  return (key = k);
}
export const piiReady = () => { try { dataKey(); return true; } catch { return false; } };

/** "v1.<iv>.<tag>.<texto>" em base64url. null continua null. */
export function seal(text) {
  if (text == null || text === '') return null;
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', dataKey(), iv);
  const out = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), out.toString('base64url')].join('.');
}
export function open(box) {
  if (!box) return null;
  const [v, iv, tag, data] = String(box).split('.');
  if (v !== 'v1') return null;
  try {
    const d = createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(iv, 'base64url'), { authTagLength: 16 });
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; } // chave errada ou dado adulterado
}

// Normalização no formato que a Meta pede para o hash.
export const normEmail = e => { const v = String(e || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.slice(0, 254) : null; };
export function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d; // Brasil sem DDI
  return d.length >= 10 && d.length <= 15 ? d : null;
}
export const sha = v => v ? createHash('sha256').update(v).digest('hex') : null;
/** SHA-256 puro, no formato da Meta. Só para montar o envio, nunca para gravar (telefone se quebra por força bruta). */
export const metaEmail = e => sha(normEmail(e));
export const metaPhone = p => sha(normPhone(p));
// Índice cego: HMAC com subchave derivada da DATA_KEY. Casa contatos e vendas sem permitir força bruta a partir do dump.
let bkey = null;
const bidx = v => v ? createHmac('sha256', bkey ||= Buffer.from(hkdfSync('sha256', dataKey(), Buffer.alloc(0), 'rastro-blind-index', 32))).update(v).digest('hex') : null;
export const hashEmail = e => bidx(normEmail(e));
export const hashPhone = p => bidx(normPhone(p));
/** Máscara para listas: a**@d***.com, (11) 9****-1234. O texto inteiro só na ficha. */
export const maskEmail = e => e ? e.replace(/^(.).*?(@.).*?(\.[^.]+)$/, '$1***$2***$3') : '';
export const maskPhone = p => p ? p.replace(/\d(?=\d{4})/g, '*') : '';
