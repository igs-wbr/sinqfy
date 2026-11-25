// Plano da instalação (ADR 0022): Grátis com 1 site e todos os recursos; Pro vitalício, por pagamento único, com sites ilimitados.
// A chave do Pro é assinada pelo autor (Ed25519) e validada offline com a chave pública abaixo. Pela licença (FCL-1.0-MIT),
// mover, desligar ou contornar esta checagem não é permitido.
import { createPublicKey, sign, verify } from 'node:crypto';
// O banco só carrega quando usado: scripts/license.mjs importa a verificação sem abrir conexão.
const DB = () => import('./db.js');

const PUBLIC_KEY = createPublicKey({ key: Buffer.from('MCowBQYDK2VwAyEASzabJd+MzqSHL49olmbn0F7+sIYU13+NNMPMzyidsHY=', 'base64'), format: 'der', type: 'spki' });
export const TRIAL_DAYS = 7, FREE_SITES = 1;
export const PRICE = 'R$ 97';
/** Página de venda do Pro. Vazia, o botão "Comprar licença" não aparece. */
export const BUY_URL = 'https://pay.hub.la/g7FNkfPdKTNHTKrkSC7E';
/** Onde o comprador pega a chave depois de pagar (src/routes/store.js, na instalação do autor). */
export const REDEEM_URL = 'https://painel.sinqfy.app/licenca';
/** Pacote da versão mais recente (.github/workflows/release.yml) e instalador de um comando (deploy/instalar.sh). */
export const DOWNLOAD_URL = 'https://github.com/igs-wbr/sinqfy/releases/latest/download/sinqfy.zip';
export const INSTALL_CMD = 'curl -fsSL https://github.com/igs-wbr/sinqfy/releases/latest/download/instalar.sh | bash';

// Revogação sem servidor de ativação (ADR 0026): a lista viaja com cada versão nova.
// Pedidos reembolsados ou contestados, na instalação que vende: SELECT order_id FROM license_orders WHERE status <> 'paid'
const REVOKED_ORDERS = new Set([]);
// Emissoras vazadas (id do certificado): todas as chaves assinadas por elas deixam de valer.
const REVOKED_ISSUERS = new Set([]);

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const signPart = (priv, body) => `${body}.${sign(null, Buffer.from(body, 'base64url'), priv).toString('base64url')}`;
/** Payload de "corpo.assinatura" se a assinatura conferir com pub, senão null. */
function signed(pub, body, sig) {
  try { return verify(null, Buffer.from(body, 'base64url'), pub, Buffer.from(sig, 'base64url')) ? JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) : null; } catch { return null; }
}

/** Certificado de uma chave emissora, assinado pela chave raiz (só no PC do autor). O servidor que vende guarda a emissora, nunca a raiz. */
export const certify = (rootPriv, issuerPub, id) =>
  signPart(rootPriv, b64({ kind: 'issuer', id: String(id).slice(0, 40), pub: issuerPub.export({ format: 'der', type: 'spki' }).toString('base64') }));

/** Assina uma chave Pro. Com cert, priv é a emissora e a chave leva o certificado: "corpo.assinatura.cert.assinatura_cert". */
export function issueWith(priv, { to = '', order = '' } = {}, now = Date.now(), cert = '') {
  const key = signPart(priv, b64({ plan: 'pro', to: String(to).slice(0, 80), order: String(order).slice(0, 60), issued: now }));
  return cert ? `${key}.${cert}` : key;
}

/** Chave assinada pela raiz ou por uma emissora certificada por ela. Retorna o payload ({ plan, to, order, issued }) ou null. Chaves antigas trazem também updates, que não limita nada (Pro vitalício). */
export function verifyWith(root, key, { orders = REVOKED_ORDERS, issuers = REVOKED_ISSUERS } = {}) {
  const [body, sig, cbody, csig, extra] = String(key || '').trim().split('.');
  if (!body || !sig || !cbody !== !csig || extra !== undefined) return null;
  let pub = root;
  if (cbody) {
    const c = signed(root, cbody, csig);
    if (c?.kind !== 'issuer' || !c.id || issuers.has(c.id)) return null;
    try { pub = createPublicKey({ key: Buffer.from(String(c.pub), 'base64'), format: 'der', type: 'spki' }); } catch { return null; }
  }
  const p = signed(pub, body, sig);
  return p?.plan === 'pro' && !orders.has(String(p.order)) ? p : null;
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
