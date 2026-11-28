// Etapa 4: assistente de primeiro uso (6 passos) e domínio do cliente na borda.
// Cada passo é conferido pelos próprios dados: domínio ativo, primeiro evento, Meta testada, primeira venda, envio feito.
import { db, sites } from '../db.js';
import { route, send, redirect, form, origin, sitePath, HttpError } from '../http.js';
import { siteCtx } from '../auth.js';
import { addHost, checkHost, removeHost, cfReady, saasTarget, HOST_RE, publicSuffix, normalizeHost, edgeUrlFor } from '../cloudflare.js';
import { hookToken } from '../sales/webhooks.js';
import * as V from '../views/setup.js';

const DAY = 864e5;
/** Estado de cada passo, a partir do que já aconteceu no site. */
export async function setupState(site, now = Date.now()) {
  const [first, cookie, sale, sent] = await Promise.all([
    db.get('SELECT ts, host FROM events WHERE site=? ORDER BY ts LIMIT 1', [site.id]),
    db.get('SELECT ts FROM events WHERE site=? AND rid IS NOT NULL ORDER BY ts DESC LIMIT 1', [site.id]),
    db.get("SELECT ts, platform, message FROM webhook_log WHERE site=? AND ok=1 AND order_id<>'' AND platform NOT IN ('events','leads','meta-leads','whatsapp') ORDER BY id DESC LIMIT 1", [site.id]),
    db.get("SELECT COUNT(*) n, MAX(sent_at) last FROM deliveries WHERE site=? AND dest='meta' AND status='sent' AND sent_at>?", [site.id, now - 7 * DAY]),
  ]);
  const steps = {
    project: true,
    domain: site.edge_status === 'active',
    script: !!first,
    meta: !!(site.meta_pixel && site.meta_capi_token && site.meta_checked),
    checkout: !!sale,
    final: !!(sent.n && cookie),
  };
  return { steps, done: Object.values(steps).filter(Boolean).length, first, cookie, sale, sent };
}

async function view(r, msg, err) {
  const st = await setupState(r.site);
  send(r, err ? 400 : 200, V.setupPage(await siteCtx(r, '/setup'), {
    ...st, msg, err, cf: cfReady(), target: saasTarget(), edgeUrl: edgeUrlFor(r.site, origin(r.req)), origin: origin(r.req),
    genericUrl: `${origin(r.req)}/hooks/${hookToken(r.site, 'generic')}/generic`,
  }));
}
route('GET', '/sites/:id/setup', { site: 'edit' }, r => view(r, r.q.get('ok') === 'domain' ? 'Domínio cadastrado. Agora crie o registro CNAME no seu DNS.' : null));
route('POST', '/sites/:id/setup', { site: 'edit' }, async r => {
  const f = await form(r.req), action = f.get('action'), site = r.site;
  if (action === 'domain_add') {
    const host = normalizeHost(f.get('host'));
    if (!HOST_RE.test(host) || publicSuffix(host)) return view(r, null, 'Use o domínio do seu site com t. na frente, por exemplo t.seudominio.com.br');
    // Mensagem neutra: não confirma que outra agência usa o domínio. Conflito real é resolvido pelo dono da plataforma.
    if ([...sites.values()].some(s => s.edge_host === host && s.id !== site.id)) return view(r, null, 'Não foi possível cadastrar esse domínio. Fale com o suporte do Sinqfy.');
    const used = [...sites.values()].filter(s => s.agency_id === site.agency_id && s.edge_host && s.id !== site.id).length;
    if (used >= 50) return view(r, null, 'Limite de 50 domínios por agência. Fale com o suporte para aumentar.');
    await addHost(site, host);
    return redirect(r, sitePath(site, '/setup?ok=domain'));
  }
  if (action === 'domain_check') { await checkHost(site); return redirect(r, sitePath(site, '/setup')); }
  if (action === 'domain_remove') { await removeHost(site); return redirect(r, sitePath(site, '/setup')); }
  throw new HttpError(400, 'Ação inválida.');
});
