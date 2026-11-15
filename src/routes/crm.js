// Etapa 5: CRM (quadro, contatos, ficha, colunas) e entrada de leads por webhook e pelo Lead Ads da Meta.
// Importado antes de routes/sales.js: as rotas /hooks/:token/leads e /meta-leads precisam vir antes da genérica.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, env, sites, loadSites } from '../db.js';
import { route, send, redirect, form, readBody, origin, sitePath, HttpError } from '../http.js';
import { siteCtx } from '../auth.js';
import { stages, upsertContact, moveContact, reveal, eraseContact, metaCrmEvent, log, SOURCES } from '../crm.js';
import { enqueue, metaReady } from '../dispatch.js';
import { hookToken, adKey, secretsOf } from '../sales/webhooks.js';
import { piiReady, seal, open } from '../pii.js';
import { claimCode } from '../whatsapp.js';
import * as V from '../views/crm.js';

const siteByHook = (token, platform) => {
  const t = Buffer.from(String(token));
  return [...sites.values()].find(s => { if (!s.webhook_token) return false; const w = Buffer.from(hookToken(s, platform)); return w.length === t.length && timingSafeEqual(w, t); });
};
const contactOf = async (r, id) => {
  const c = await db.get('SELECT * FROM contacts WHERE id=? AND site=?', [Number(id) || 0, r.site.id]);
  if (!c) throw new HttpError(404, 'Contato não encontrado.');
  return c;
};
const need = () => { if (!piiReady()) throw new HttpError(503, 'O CRM precisa da chave DATA_KEY configurada no servidor.'); };

// ---------- quadro ----------
route('GET', '/sites/:id/crm', { site: 'view', module: 'crm' }, async r => {
  need();
  const [cols, rows] = await Promise.all([stages(r.site.id), db.all('SELECT * FROM contacts WHERE site=? ORDER BY stage_since DESC LIMIT 1000', [r.site.id])]);
  send(r, 200, V.boardPage(await siteCtx(r, '/crm'), cols, rows.map(reveal), r.q.get('erro')));
});
route('POST', '/sites/:id/crm/move', { site: 'edit', module: 'crm' }, async r => {
  const f = await form(r.req), c = await contactOf(r, f.get('contact'));
  await moveContact(r.site, c, Number(f.get('stage')) || 0, { by: r.user.email });
  if (f.get('js') === '1') return r.res.writeHead(204).end(); // arrastar e soltar
  redirect(r, f.get('back') === 'contact' ? sitePath(r.site, `/contacts/${c.id}`) : sitePath(r.site, '/crm'));
});
route('POST', '/sites/:id/crm/new', { site: 'edit', module: 'crm' }, async r => {
  need();
  const f = await form(r.req);
  const { contact } = await upsertContact(r.site, { name: f.get('name'), email: f.get('email'), phone: f.get('phone'), value: f.get('value'), source: 'manual', note: `Cadastrado por ${r.user.email}` });
  if (!contact) return redirect(r, sitePath(r.site, '/crm?erro=dados'));
  redirect(r, sitePath(r.site, `/contacts/${contact.id}`));
});

// ---------- contatos ----------
route('GET', '/sites/:id/contacts', { site: 'view', module: 'crm' }, async r => {
  need();
  // ponytail: busca decifrando até 2000 contatos em memória; índice de busca cifrado se o CRM passar disso
  const q = (r.q.get('q') || '').trim().toLowerCase().slice(0, 100);
  const [cols, rows] = await Promise.all([stages(r.site.id), db.all('SELECT * FROM contacts WHERE site=? ORDER BY updated DESC LIMIT 2000', [r.site.id])]);
  const list = rows.map(reveal).filter(c => !q || [c.name, c.email, c.phone].some(v => v && v.toLowerCase().includes(q))).slice(0, 200);
  send(r, 200, V.contactsPage(await siteCtx(r, '/contacts'), cols, list, q));
});
route('GET', '/sites/:id/contacts/:cid', { site: 'view' }, async r => {
  need();
  const c = reveal(await contactOf(r, r.params.cid));
  await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [r.site.id, Date.now(), r.user.email, `ficha do contato ${c.id} aberta`]);
  const [cols, logs, events] = await Promise.all([stages(r.site.id),
    db.all('SELECT ts, text FROM crm_log WHERE contact_id=? AND site=? ORDER BY ts DESC LIMIT 100', [c.id, r.site.id]),
    c.rid ? db.all('SELECT ts, name, path, utm_campaign, channel FROM events WHERE site=? AND rid=? ORDER BY ts DESC LIMIT 50', [r.site.id, c.rid]) : []]);
  send(r, 200, V.contactPage(await siteCtx(r, '/contacts'), c, cols, logs, events));
});
route('POST', '/sites/:id/contacts/:cid', { site: 'edit' }, async r => {
  const f = await form(r.req), c = await contactOf(r, r.params.cid), action = f.get('action');
  if (action === 'value') {
    const v = Number(String(f.get('value') || '0').replace(',', '.'));
    if (!(v >= 0 && v < 1e9)) throw new HttpError(400, 'Valor inválido.');
    await db.run('UPDATE contacts SET value=?, updated=? WHERE id=?', [v, Date.now(), c.id]);
    await log(r.site.id, c.id, `Valor alterado para ${v} (${r.user.email})`);
  } else if (action === 'code') {
    const click = await claimCode(r.site, c, (f.get('code') || '').trim().replace(/[\[\]\s]/g, ''));
    if (!click) return redirect(r, sitePath(r.site, `/contacts/${c.id}?erro=codigo`));
  } else if (action === 'erase') {
    if (f.get('confirm') !== 'EXCLUIR') throw new HttpError(400, 'Digite EXCLUIR para confirmar.');
    await eraseContact(r.site, c.id, r.user.email);
    return redirect(r, sitePath(r.site, '/contacts?ok=excluido'));
  } else throw new HttpError(400, 'Ação inválida.');
  redirect(r, sitePath(r.site, `/contacts/${c.id}`));
});

// ---------- colunas ----------
const EVENT_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
route('GET', '/sites/:id/crm/stages', { site: 'edit', module: 'crm' }, async r => {
  const cols = await stages(r.site.id);
  const counts = new Map((await db.all('SELECT stage_id, COUNT(*) n FROM contacts WHERE site=? GROUP BY stage_id', [r.site.id])).map(x => [x.stage_id, x.n]));
  const o = origin(r.req), urls = { leads: `${o}/hooks/${hookToken(r.site, 'leads')}/leads`, metaLeads: `${o}/hooks/${hookToken(r.site, 'meta-leads')}/meta-leads` };
  send(r, 200, V.stagesPage(await siteCtx(r, '/crm'), cols, counts, r.q.get('erro'), urls));
});
route('POST', '/sites/:id/crm/stages', { site: 'edit', module: 'crm' }, async r => {
  const f = await form(r.req), action = f.get('action'), cols = await stages(r.site.id), back = e => redirect(r, sitePath(r.site, `/crm/stages${e ? `?erro=${e}` : ''}`));
  if (action === 'save') {
    const stmts = [];
    for (const c of cols) {
      const name = (f.get(`name_${c.id}`) || '').trim().slice(0, 40), ev = (f.get(`event_${c.id}`) || '').trim(), kind = f.get(`kind_${c.id}`);
      const pos = Number(f.get(`pos_${c.id}`));
      if (!name || (ev && !EVENT_RE.test(ev)) || !['open', 'won', 'lost'].includes(kind) || !Number.isInteger(pos)) return back('dados');
      stmts.push(['UPDATE stages SET name=?, event_name=?, kind=?, position=? WHERE id=? AND site=?', [name, ev || null, kind, pos, c.id, r.site.id]]);
    }
    try { await db.batch(stmts); } catch { return back('nome'); } // nome repetido
    return back();
  }
  if (action === 'add') {
    const name = (f.get('name') || '').trim().slice(0, 40);
    if (!name) return back('dados');
    try { await db.run('INSERT INTO stages(site, name, position, kind) VALUES (?,?,?,?)', [r.site.id, name, cols.length, 'open']); } catch { return back('nome'); }
    return back();
  }
  if (action === 'delete') {
    const id = Number(f.get('stage')) || 0;
    if (cols.length <= 2) return back('minimo');
    if ((await db.get('SELECT COUNT(*) n FROM contacts WHERE site=? AND stage_id=?', [r.site.id, id])).n) return back('ocupada');
    await db.run('DELETE FROM stages WHERE id=? AND site=?', [id, r.site.id]);
    return back();
  }
  throw new HttpError(400, 'Ação inválida.');
});

// ---------- Lead Ads da Meta: token da página para buscar os dados do lead ----------
route('POST', '/sites/:id/crm/meta-leads', { site: 'edit', module: 'crm' }, async r => {
  const f = await form(r.req), token = (f.get('page_token') || '').trim(), secret = (f.get('app_secret') || '').trim();
  if (token) await db.run('UPDATE sites SET meta_page_token=? WHERE id=?', [token === '-' ? null : seal(token.slice(0, 500)), r.site.id]); // cifrado como os contatos
  const leads = (f.get('leads_secret') || '').trim();
  if (secret || leads) {
    const cur = secretsOf(r.site);
    for (const [k, v] of [['meta-leads', secret], ['leads', leads]]) if (v === '-') delete cur[k]; else if (v) cur[k] = v.slice(0, 200);
    await db.run('UPDATE sites SET hook_secrets=? WHERE id=?', [JSON.stringify(cur), r.site.id]);
  }
  await loadSites();
  redirect(r, sitePath(r.site, '/crm/stages'));
});

// ---------- entrada de leads (público; token por destino na URL) ----------
const jsonOr = (v, d) => { try { return JSON.parse(v) ?? d; } catch { return d; } };
const hookLog = (site, platform, order, ok, message, now = Date.now()) => db.batch([
  ['INSERT INTO webhook_log(site, ts, platform, order_id, status, ok, message) VALUES (?,?,?,?,?,?,?)', [site, now, platform, order, '', ok, message]],
  ['DELETE FROM webhook_log WHERE site=? AND id NOT IN (SELECT id FROM webhook_log WHERE site=? ORDER BY id DESC LIMIT 50)', [site, site]]]);
const tooMany = async (site, source) => (await db.get('SELECT COUNT(*) n FROM contacts WHERE site=? AND source=? AND created>?', [site, source, Date.now() - 60e3])).n >= 60;
const hmacOk = (secret, raw, header, prefix = '') => {
  const want = Buffer.from(prefix + createHmac('sha256', secret).update(raw).digest('hex')), got = Buffer.from(String(header || ''));
  return want.length === got.length && timingSafeEqual(want, got);
};
/** Lead que chega de fora: contato no CRM e, se a Meta estiver configurada, um Lead offline (uma vez por contato). */
async function inboundLead(site, d, platform, now = Date.now()) {
  const { contact, created } = await upsertContact(site, d, now);
  if (!contact) return false;
  if (created && metaReady(site)) {
    const ev = metaCrmEvent(site, contact, { id: 'lead', event_name: 'Lead' }, now);
    if (ev) await enqueue(site.id, 'meta', ev.event_id, 'Lead', ev, now);
  }
  await hookLog(site.id, platform, `lead-${contact.id}`, 1, created ? 'Novo lead no CRM' : 'Lead já existia: dados completados', now);
  return true;
}

// Formato próprio: { name, email, phone, rid, value, utm_source, utm_campaign, utm_medium, utm_content } (Elementor, RD, n8n, Make)
route('POST', '/hooks/:token/leads', { auth: false }, async r => {
  const site = siteByHook(r.params.token, 'leads');
  const raw = await readBody(r.req, 64 * 1024);
  if (!site || !piiReady()) return r.res.writeHead(404, { 'content-type': 'application/json' }).end('{"ok":false}');
  const secret = secretsOf(site).leads; // com segredo: cabeçalho X-Rastro-Signature = sha256=HMAC-SHA256 do corpo
  if (secret && !hmacOk(secret, raw, r.req.headers['x-rastro-signature'], 'sha256=')) return r.res.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false}');
  if (await tooMany(site.id, 'webhook')) return r.res.writeHead(429, { 'content-type': 'application/json' }).end('{"ok":false}');
  const b = jsonOr(raw, null) || Object.fromEntries(new URLSearchParams(raw));
  const ok = await inboundLead(site, { name: b.name || b.nome, email: b.email, phone: b.phone || b.telefone || b.whatsapp, rid: /^[\w-]{22}$/.test(b.rid || '') ? b.rid : null,
    value: b.value, source: 'webhook', utm: { source: b.utm_source, campaign: b.utm_campaign }, campaign_key: adKey(b.utm_campaign), adset_key: adKey(b.utm_medium), ad_key: adKey(b.utm_content) }, 'leads');
  r.res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok }));
});

// Lead Ads da Meta: verificação da assinatura do webhook (GET) e aviso de lead novo (POST, busca os dados na Graph API).
route('GET', '/hooks/:token/meta-leads', { auth: false }, async r => {
  const site = siteByHook(r.params.token, 'meta-leads');
  const ok = site && r.q.get('hub.mode') === 'subscribe' && r.q.get('hub.verify_token') === r.params.token;
  r.res.writeHead(ok ? 200 : 403, { 'content-type': 'text/plain' }).end(ok ? String(r.q.get('hub.challenge') || '').slice(0, 200) : 'forbidden');
});
route('POST', '/hooks/:token/meta-leads', { auth: false }, async r => {
  const site = siteByHook(r.params.token, 'meta-leads'), raw = await readBody(r.req, 256 * 1024);
  if (!site || !piiReady()) return r.res.writeHead(404).end();
  const secret = secretsOf(site)['meta-leads'], pageToken = open(site.meta_page_token);
  // Sem a chave do app, ninguém prova que o aviso veio da Meta: o Lead Ads só funciona com ela configurada.
  if (!secret || !hmacOk(secret, raw, r.req.headers['x-hub-signature-256'], 'sha256=')) return r.res.writeHead(401).end();
  const changes = (jsonOr(raw, {}).entry || []).flatMap(e => e.changes || []).filter(c => c.field === 'leadgen').slice(0, 10);
  await Promise.all(changes.map(async ({ value: v }) => {
    if (!pageToken || !/^\d{5,30}$/.test(String(v?.leadgen_id || ''))) return;
    try {
      const res = await fetch(`https://graph.facebook.com/${env.META_API_VERSION || 'v23.0'}/${v.leadgen_id}?fields=field_data,created_time,ad_id,adset_id,campaign_id,campaign_name`,
        { headers: { authorization: `Bearer ${pageToken}` }, signal: AbortSignal.timeout(10e3) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || `HTTP ${res.status}`);
      const field = (...names) => (j.field_data || []).find(x => names.includes(String(x.name).toLowerCase()))?.values?.[0];
      await inboundLead(site, { lead_id: v.leadgen_id, name: field('full_name', 'nome_completo', 'first_name', 'nome'), email: field('email', 'e-mail'),
        phone: field('phone_number', 'telefone', 'whatsapp'), source: 'meta_lead', utm: { source: 'facebook', campaign: j.campaign_name || '' },
        campaign_key: String(j.campaign_id || v.campaign_id || ''), adset_key: String(j.adset_id || v.adgroup_id || ''), ad_key: String(j.ad_id || v.ad_id || '') }, 'meta-leads');
    } catch (e) { await hookLog(site.id, 'meta-leads', String(v.leadgen_id), 0, `Lead Ads: ${String(e.message).slice(0, 200)}`); }
  }));
  r.res.writeHead(200).end('ok');
});
