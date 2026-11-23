// Plano da instalação (ADR 0022): Grátis com 1 site e todos os recursos; Pro, por pagamento único, com sites ilimitados.
// A chave do Pro é assinada pelo autor (Ed25519) e validada offline com a chave pública abaixo. Pela licença (FCL-1.0-MIT),
// mover, desligar ou contornar esta checagem não é permitido.
import { createPublicKey, verify } from 'node:crypto';
// O banco só carrega quando usado: scripts/license.mjs importa a verificação sem abrir conexão.
const DB = () => import('./db.js');

const PUBLIC_KEY = createPublicKey({ key: Buffer.from('MCowBQYDK2VwAyEASzabJd+MzqSHL49olmbn0F7+sIYU13+NNMPMzyidsHY=', 'base64'), format: 'der', type: 'spki' });
export const TRIAL_DAYS = 7, FREE_SITES = 1;
export const PRICE = 'R$ 97';
/** Página de venda do Pro. Vazia, o botão "Comprar licença" não aparece. */
export const BUY_URL = '';

/** Chave "payload.assinatura" (base64url). Retorna o payload ({ plan, to, order, issued, updates }) ou null. */
export function verifyWith(pub, key) {
  const [body, sig] = String(key || '').trim().split('.');
  if (!body || !sig) return null;
  try {
    if (!verify(null, Buffer.from(body, 'base64url'), pub, Buffer.from(sig, 'base64url'))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p?.plan === 'pro' ? p : null;
  } catch { return null; }
}
export const verifyKey = key => verifyWith(PUBLIC_KEY, key);

/** { pro, trial, trialEnds, license } da instalação. Lido do banco a cada chamada (vale entre instâncias). */
export async function planOf(now = Date.now()) {
  const kv = Object.fromEntries((await (await DB()).db.all('SELECT k, v FROM install')).map(r => [r.k, r.v]));
  const license = verifyKey(kv.license);
  const trialEnds = kv.trial_started ? Number(kv.trial_started) + TRIAL_DAYS * 864e5 : null;
  const trial = !license && trialEnds > now;
  return { pro: !!license || trial, trial, trialEnds, trialUsed: !!kv.trial_started, license };
}

/** Site que o Grátis mantém aberto: o mais antigo da instalação. Os outros continuam coletando, só o painel fica bloqueado. */
export const freeSiteId = async () => [...(await DB()).sites.values()].sort((a, b) => (a.created ?? 0) - (b.created ?? 0) || a.id.localeCompare(b.id))[0]?.id;
export const locked = async (plan, site) => !plan.pro && site.id !== await freeSiteId();

export const setInstall = async (k, v) => (await DB()).db.run('INSERT INTO install(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [k, String(v)]);
