// Checkout com Pix próprio: BR Code estático (padrão EMV do Banco Central) na chave do vendedor, sem intermediador,
// e o QR Code desenhado no servidor em SVG. O Pix estático não avisa sozinho que foi pago: a confirmação vem do
// webhook do banco (/hooks/<token>/pix, formato do genérico) ou do botão "Marcar como pago" no painel.
// Ideia e algoritmo adaptados do funil-aberto (pix.py, MIT); QR Code pelo qrcode-generator (MIT, src/vendor).
import { createRequire } from 'node:module';
import { randomInt } from 'node:crypto';

const qrcode = createRequire(import.meta.url)('./vendor/qrcode.cjs');

const field = (id, v) => {
  if (v.length > 99) throw new Error(`campo ${id} do Pix passa de 99 caracteres`);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
};
/** CRC16-CCITT-FALSE (polinômio 0x1021, início 0xFFFF), o que o BR Code exige. */
export function crc16(s) {
  let crc = 0xFFFF;
  for (const b of Buffer.from(s, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
/** Vários apps de banco recusam acento no nome e na cidade: só ASCII. */
export const ascii = (t, n) => String(t || '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim().slice(0, n);

/** Pix copia e cola. txid: até 25 letras e números (o id do pedido, para o banco devolver no webhook). */
export function brCode({ key, name, city, amount, txid = '***' }) {
  if (!key) throw new Error('chave Pix vazia');
  const id = txid === '***' ? '***' : String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const body = field('00', '01') + field('26', field('00', 'br.gov.bcb.pix') + field('01', key)) + field('52', '0000') + field('53', '986')
    + (amount > 0 ? field('54', amount.toFixed(2)) : '') + field('58', 'BR') + field('59', ascii(name, 25)) + field('60', ascii(city, 15))
    + field('62', field('05', id)) + '6304';
  return body + crc16(body);
}

/** QR Code em SVG (escalável, fundo branco). */
export function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 16, scalable: true, alt: 'QR Code do Pix' });
}

const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newOrderId = () => 'PX' + Array.from({ length: 10 }, () => ABC[randomInt(ABC.length)]).join('');

/** Chave Pix: e-mail, telefone com + (ex.: +5511999990000), CPF/CNPJ ou chave aleatória (UUID). Só dígitos com 11 = CPF. */
export function pixKey(v) {
  const k = String(v || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) return k.toLowerCase().slice(0, 77);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return k.toLowerCase();
  const d = k.replace(/\D/g, '');
  if (k.startsWith('+')) return d.length >= 12 && d.length <= 13 ? '+' + d : null;
  return d.length === 11 || d.length === 14 ? d : null;
}
