// Etapa 4: domínio do cliente na borda pelo Cloudflare for SaaS (custom hostnames).
// O cliente cria um CNAME t.dominiodele → CF_SAAS_TARGET; o Rastro registra o hostname na zona da Cloudflare,
// que emite o SSL, e o Worker (rota */*) passa a responder nesse domínio. Sem CF_API_TOKEN, o painel mostra o passo a passo manual.
import { db, env, loadSites } from './db.js';

const API = 'https://api.cloudflare.com/client/v4';
export const cfReady = () => !!(env.CF_API_TOKEN && env.CF_ZONE_ID);
export const saasTarget = () => env.CF_SAAS_TARGET || 'edge.seudominio.com.br';

/** Só subdomínio "t." de um domínio (é o que o Worker usa para gravar o cookie no domínio inteiro). */
export const HOST_RE = /^t\.[a-z0-9-]+(\.[a-z0-9-]+)+$/;
/** t.com.br, t.co.uk: o domínio raiz seria um sufixo público. */
export const publicSuffix = host => /^t\.(com|net|org|gov|edu|co|art|blog|app|dev|ind|inf|log|med|nom|eco|tur|vet)\.[a-z]{2}$/.test(host) || /^t\.[a-z]+$/.test(host);
export const normalizeHost = h => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  .replace(/^(?!t\.)(www\.)?(?=[^.]+\.)/, 't.'); // só o domínio (com ou sem www.): o t. entra sozinho

async function cf(method, path, body) {
  const res = await fetch(`${API}/zones/${encodeURIComponent(env.CF_ZONE_ID)}${path}`, {
    method, headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body), signal: AbortSignal.timeout(15e3),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.errors?.[0]?.message || `Cloudflare respondeu ${res.status}`);
  return j.result;
}

/** Estado legível: aguardando DNS, emitindo SSL, ativo ou erro. */
export function statusOf(r) {
  if (!r) return { status: 'manual', error: null };
  const ssl = r.ssl?.status, err = r.verification_errors?.[0] || r.ssl?.validation_errors?.[0]?.message || null;
  if (r.status === 'active' && ssl === 'active') return { status: 'active', error: null };
  if (r.status === 'blocked' || r.status === 'moved' || /fail|timed_out/.test(ssl || '')) return { status: 'error', error: err || `Hostname ${r.status}, SSL ${ssl}` };
  if (r.status === 'active') return { status: 'ssl', error: null };
  return { status: 'dns', error: err };
}

const save = (site, id, st) => db.run('UPDATE sites SET edge_host_id=?, edge_status=?, edge_error=? WHERE id=?', [id, st.status, st.error, site]);

/** Cadastra o domínio do cliente. Também libera o domínio raiz na lista de domínios do site. */
export async function addHost(site, host) {
  if (cfReady() && site.edge_host_id) await cf('DELETE', `/custom_hostnames/${encodeURIComponent(site.edge_host_id)}`).catch(() => {});
  const root = host.slice(2), domains = new Set(String(site.domains || '').split(',').map(d => d.trim()).filter(Boolean));
  domains.add(root);
  await db.run('UPDATE sites SET edge_host=?, edge_host_id=NULL, edge_status=?, edge_error=NULL, domains=? WHERE id=?', [host, cfReady() ? 'dns' : 'manual', [...domains].join(', '), site.id]);
  if (cfReady()) {
    try {
      const r = await cf('POST', '/custom_hostnames', { hostname: host, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } });
      await save(site.id, r.id, statusOf(r));
    } catch (e) { await save(site.id, null, { status: 'error', error: e.message.slice(0, 300) }); }
  }
  await loadSites();
}

/** Confere o estado na Cloudflare (botão "Verificar agora", assistente e tarefa periódica). */
export async function checkHost(site) {
  if (!cfReady() || !site.edge_host) return;
  try {
    let r;
    if (site.edge_host_id) r = await cf('GET', `/custom_hostnames/${encodeURIComponent(site.edge_host_id)}`);
    else [r] = await cf('GET', `/custom_hostnames?hostname=${encodeURIComponent(site.edge_host)}`);
    if (!r) r = await cf('POST', '/custom_hostnames', { hostname: site.edge_host, ssl: { method: 'http', type: 'dv' } });
    await save(site.id, r.id, statusOf(r));
  } catch (e) { await save(site.id, site.edge_host_id, { status: 'error', error: e.message.slice(0, 300) }); }
  await loadSites();
}

export async function removeHost(site) {
  if (cfReady() && site.edge_host_id) await cf('DELETE', `/custom_hostnames/${encodeURIComponent(site.edge_host_id)}`).catch(() => {});
  await db.run('UPDATE sites SET edge_host=NULL, edge_host_id=NULL, edge_status=NULL, edge_error=NULL WHERE id=?', [site.id]);
  await loadSites();
}

/** URL do snippet para o site: o domínio dele quando ativo; senão a borda padrão; senão o próprio painel. */
export const edgeUrlFor = (site, fallback) => site.edge_host && site.edge_status === 'active' ? `https://${site.edge_host}` : env.EDGE_URL || fallback;
