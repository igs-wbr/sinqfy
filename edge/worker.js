// Worker da borda (ADR 0011 e 0012). Roda em t.dominiodocliente via Cloudflare for SaaS.
//   GET  /s.js  snippet, buscado na origem e guardado no cache da Cloudflare
//   POST /e     grava os cookies primários (_rid, _fbp, _fbc) pelo servidor e repassa o beacon à origem
// A origem (painel na Oracle) só confia nos cabeçalhos x-rastro-* com o EDGE_SECRET.
// Variáveis: ORIGIN (https://app.seudominio), EDGE_SECRET; binding opcional RAW (bucket R2).

const YEAR = 400 * 86400; // limite de vida de cookie aceito pelo Chrome
const MAX_BODY = 4096;
const ID_RE = /^[\w-]{8,64}$/, FB_RE = /^fb\.\d\.\d{10,13}\.[\w.-]{1,255}$/, CLICK_RE = /^[\w.-]{1,255}$/;

// Cookie malformado de outro sistema do cliente é ignorado (não pode derrubar o beacon).
const cookies = req => Object.fromEntries((req.headers.get('cookie') || '').split(/;\s*/).flatMap(c => {
  const i = c.indexOf('=');
  if (i < 1) return [];
  try { return [[c.slice(0, i), decodeURIComponent(c.slice(i + 1))]]; } catch { return []; }
}));
const rand = bytes => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const digits = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b % 10).join('');

/**
 * t.cliente.com.br → cliente.com.br: o cookie vale para o site inteiro do cliente. Só para hosts "t.*" (o padrão do Rastro);
 * qualquer outro host fica com cookie só do host, para nunca cair num sufixo público como com.br.
 */
export const cookieDomain = host => /^t\.[^.]+\.[^.]+/.test(host) ? host.slice(2) : null;

/** Para o arquivo de falhas no R2: tira a query da URL, menos UTMs e IDs de clique (formulário GET pode trazer e-mail). */
const KEEP = /^(utm_\w+|fbclid|gclid|gbraid|wbraid|ttclid)$/;
export function scrubUrl(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) if (!KEEP.test(k)) url.searchParams.delete(k);
    return url.href;
  } catch { return null; }
}

/**
 * Identificadores do visitante. Cookies existentes são mantidos; fbclid novo na URL gera _fbc novo
 * (formato da Meta: fb.1.<ms>.<fbclid>, sem alterar o fbclid).
 */
export function identify(jar, pageUrl, now = Date.now()) {
  let fbclid = null;
  try { fbclid = new URL(pageUrl).searchParams.get('fbclid'); } catch {}
  const rid = ID_RE.test(jar._rid || '') ? jar._rid : rand(16);
  const fbp = FB_RE.test(jar._fbp || '') ? jar._fbp : `fb.1.${now}.${digits(10)}`;
  let fbc = FB_RE.test(jar._fbc || '') ? jar._fbc : null;
  if (fbclid && CLICK_RE.test(fbclid) && !fbc?.endsWith('.' + fbclid)) fbc = `fb.1.${now}.${fbclid}`;
  return { rid, fbp, fbc };
}

function cors(req) {
  const origin = req.headers.get('origin');
  return origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'Origin' } : { 'access-control-allow-origin': '*' };
}

async function collect(req, env, ctx) {
  if (Number(req.headers.get('content-length')) > MAX_BODY) return new Response(null, { status: 413, headers: cors(req) });
  // Limite por IP com o binding de rate limit da Cloudflare (opcional; veja wrangler.toml).
  if (env.LIMITER && !(await env.LIMITER.limit({ key: req.headers.get('cf-connecting-ip') || 'x' })).success) return new Response(null, { status: 429, headers: cors(req) });
  const body = await req.text();
  if (body.length > MAX_BODY) return new Response(null, { status: 413, headers: cors(req) });
  let e;
  try { e = JSON.parse(body); } catch { return new Response(null, { status: 400, headers: cors(req) }); }

  const consent = e?.c !== 0; // o snippet manda c:0 quando o site exige consentimento e ele não foi dado
  const id = identify(cookies(req), e?.u);
  const headers = new Headers(cors(req));
  if (consent) {
    const domain = cookieDomain(new URL(req.url).hostname);
    const attrs = `${domain ? `; Domain=${domain}` : ''}; Path=/; Max-Age=${YEAR}; SameSite=Lax; Secure`;
    for (const [k, v] of [['_rid', id.rid], ['_fbp', id.fbp], ['_fbc', id.fbc]]) if (v) headers.append('set-cookie', `${k}=${v}${attrs}`);
  }

  const forward = {
    'content-type': 'text/plain', 'user-agent': req.headers.get('user-agent') || '', 'x-edge-secret': env.EDGE_SECRET || '',
    'x-rastro-ip': req.headers.get('cf-connecting-ip') || '', 'cf-ipcountry': req.headers.get('cf-ipcountry') || '',
    ...(consent && { 'x-rastro-rid': id.rid, 'x-rastro-fbp': id.fbp }),
    ...(id.fbc && { 'x-rastro-fbc': id.fbc }), // vem da URL; sem consentimento vai só para a origem, sem cookie
  };
  // Responde já; a origem recebe em segundo plano. Se ela falhar, o beacon vai para o R2 para reprocessar.
  // ponytail: só os que falharam vão para o R2 (cabe no plano gratuito); arquivar tudo quando houver auditoria por payload.
  ctx.waitUntil(fetch(`${env.ORIGIN}/e`, { method: 'POST', headers: forward, body, signal: AbortSignal.timeout(10e3) }).then(r => {
    if (r.status >= 500) throw new Error(`origem respondeu ${r.status}`);
  }).catch(err => env.RAW?.put(`failed/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${id.rid}.json`,
    // Sem segredo, IP e user agent; URL sem query (menos UTMs e IDs de clique). Apagado pela regra de ciclo de vida do bucket (30 dias).
    JSON.stringify({ at: Date.now(), error: String(err.message || err),
      headers: { ...forward, 'x-edge-secret': undefined, 'x-rastro-ip': undefined, 'user-agent': undefined }, body: JSON.stringify({ ...e, u: scrubUrl(e.u) }) }))));
  return new Response(null, { status: 202, headers });
}

export default {
  async fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    if (pathname === '/s.js' && req.method === 'GET') {
      // Só cacheia resposta boa: um erro momentâneo da origem não pode deixar o snippet quebrado por 1 h em todos os sites.
      const r = await fetch(`${env.ORIGIN}/s.js`, { cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 3600, '400-599': 0 } }, signal: AbortSignal.timeout(10e3) });
      return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': r.ok ? 'public, max-age=3600' : 'no-store', 'access-control-allow-origin': '*' } });
    }
    if (pathname === '/e' && req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors(req), 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } });
    }
    if (pathname === '/e' && req.method === 'POST') return collect(req, env, ctx);
    return new Response('Not found', { status: 404 });
  },
};
