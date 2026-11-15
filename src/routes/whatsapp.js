// Etapa 6: link rastreável do WhatsApp, configuração (links e Cloud API), webhook da Cloud API e conversas.
// Importado antes de routes/sales.js: /hooks/:token/whatsapp vem antes da rota genérica de webhooks.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, sites, loadSites } from '../db.js';
import { route, send, redirect, form, readBody, origin, sitePath, edgeInfo, clientIp, HttpError } from '../http.js';
import { siteCtx } from '../auth.js';
import { record, allowedHost } from '../tracking/ingest.js';
import { clickLink, handleCloud, newSlug, waReady, parseRules, rulesOf } from '../whatsapp.js';
import { enabled } from '../modules.js';
import { stages, reveal, moveContact } from '../crm.js';
import { hookToken, secretsOf } from '../sales/webhooks.js';
import { open, seal, normPhone, piiReady } from '../pii.js';
import * as V from '../views/whatsapp.js';

// ---------- link público: t.seudominio.com.br/w/<slug> (pelo Worker) ou direto no painel ----------
route('GET', '/w/:slug', { auth: false }, async r => {
  const link = await db.get('SELECT * FROM wa_links WHERE slug=?', [r.params.slug]);
  const site = link && sites.get(link.site);
  if (!site) throw new HttpError(404, 'Link não encontrado.');
  const edge = edgeInfo(r.req.headers), host = String(r.req.headers['x-rastro-host'] || '');
  // Pela borda, o link só vale no domínio do próprio site (t.clienteA/w/<link de B> não grava visitante de A em B).
  if (edge && host && site.edge_host && host !== site.edge_host) throw new HttpError(404, 'Link não encontrado.');
  // Teto de cliques gravados por link (o redirecionamento continua, sem código): protege a tabela e a CAPI de robôs.
  const busy = (await db.get('SELECT COUNT(*) n FROM wa_clicks WHERE link_id=? AND ts>?', [link.id, Date.now() - 60e3])).n >= 120;
  if (busy) return r.res.writeHead(302, { location: `https://wa.me/${link.phone}?text=${encodeURIComponent(link.message || '')}`, 'cache-control': 'no-store' }).end();
  // Evento Contact na página de onde veio o clique (só se a página for de um domínio do site).
  let page = null;
  try { page = new URL(r.req.headers.referer); } catch {}
  const { code, url } = await clickLink(link, edge);
  // Só pela borda (o Referer do /w direto é forjável) e com o mesmo consentimento do snippet (sem cookie, sem envio a terceiros).
  if (edge && page && /^https?:$/.test(page.protocol) && allowedHost(site, page.hostname)) {
    await record({ body: JSON.stringify({ s: site.id, n: 'Contact', u: page.href, i: `wa_${code}_${Date.now().toString(36)}`, p: { link: link.name }, c: edge.rid ? 1 : 0 }),
      ua: r.req.headers['user-agent'] || '', ip: edge?.ip || clientIp(r.req), country: String(r.req.headers['cf-ipcountry'] || '').toUpperCase(), edge });
  }
  r.res.writeHead(302, { location: url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }).end();
});

// ---------- configuração ----------
async function settingsView(r, msg, err) {
  const links = await db.all(`SELECT l.*, (SELECT COUNT(*) FROM wa_clicks c WHERE c.link_id=l.id) clicks, (SELECT COUNT(*) FROM wa_clicks c WHERE c.link_id=l.id AND c.contact_id IS NOT NULL) matched
    FROM wa_links l WHERE l.site=? ORDER BY l.id`, [r.site.id]);
  const o = origin(r.req), s = r.site;
  const base = s.edge_host && s.edge_status === 'active' ? `https://${s.edge_host}` : o;
  send(r, err ? 400 : 200, V.settingsPage(await siteCtx(r, '/whatsapp'), links, { base, hook: `${o}/hooks/${hookToken(s, 'whatsapp')}/whatsapp`, hasSecret: !!secretsOf(s).whatsapp, aiKey: !!process.env.GEMINI_API_KEY,
    send: waReady(s), sendNeeded: enabled(s, 'recovery') || enabled(s, 'bot'), bot: enabled(s, 'bot'), rules: rulesOf(s) }, msg, err));
}
route('GET', '/sites/:id/whatsapp', { site: 'edit', module: 'whatsapp' }, r => settingsView(r, { link: 'Link criado.', cloud: 'Cloud API salva.', del: 'Link apagado.', bot: 'Respostas do robô salvas.' }[r.q.get('ok')] || null));
route('POST', '/sites/:id/whatsapp', { site: 'edit', module: 'whatsapp' }, async r => {
  const f = await form(r.req), action = f.get('action'), s = r.site, back = ok => redirect(r, sitePath(s, `/whatsapp?ok=${ok}`));
  if (action === 'link') {
    const name = (f.get('name') || '').trim().slice(0, 60), phone = normPhone(f.get('phone')), message = (f.get('message') || '').trim().slice(0, 300);
    if (!name || !phone) return settingsView(r, null, 'Dê um nome ao link e informe o número com DDD (o 55 do Brasil entra sozinho).');
    if ((await db.get('SELECT COUNT(*) n FROM wa_links WHERE site=?', [s.id])).n >= 100) return settingsView(r, null, 'Limite de 100 links por site.');
    for (let i = 0; i < 5; i++) { const { rowCount } = await db.run('INSERT INTO wa_links(site, slug, name, phone, message, created) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING', [s.id, newSlug(), name, phone, message, Date.now()]); if (rowCount) break; }
    await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [s.id, Date.now(), r.user.email, `link de WhatsApp criado: ${name}`]);
    return back('link');
  }
  if (action === 'delete') {
    await db.run('DELETE FROM wa_links WHERE id=? AND site=?', [Number(f.get('link')) || 0, s.id]);
    await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [s.id, Date.now(), r.user.email, 'link de WhatsApp apagado']);
    return back('del');
  }
  if (action === 'cloud') {
    const waba = (f.get('waba_id') || '').trim(), secret = (f.get('app_secret') || '').trim();
    if (waba && !/^\d{5,25}$/.test(waba)) return settingsView(r, null, 'O ID da conta do WhatsApp Business tem só números.');
    const phoneId = (f.get('wa_phone_id') || '').trim(), token = (f.get('wa_token') || '').trim();
    if (phoneId && !/^\d{5,25}$/.test(phoneId)) return settingsView(r, null, 'O ID do número de telefone tem só números.');
    if (token && token !== '-' && !piiReady()) return settingsView(r, null, 'Guardar o token exige a chave DATA_KEY no servidor.');
    // Token de envio (usuário do sistema): cifrado com a DATA_KEY e nunca exibido. Vazio mantém; "-" apaga.
    await db.run('UPDATE sites SET wa_phone_id=?, wa_token=? WHERE id=?', [phoneId || null, token === '-' ? null : token ? seal(token.slice(0, 1000)) : s.wa_token, s.id]);
    // IA nas conversas: desligada por padrão; ligar é decisão do cliente (texto anonimizado vai ao Google).
    await db.run('UPDATE sites SET waba_id=?, ai_suggest=? WHERE id=?', [waba || null, f.get('ai_suggest') === '1' ? 1 : 0, s.id]);
    await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [s.id, Date.now(), r.user.email, `Cloud API: WABA ${waba || '-'}, IA ${f.get('ai_suggest') === '1' ? 'ligada' : 'desligada'}${secret ? ', chave do app trocada' : ''}`]);
    if (secret) {
      const cur = secretsOf(s);
      if (secret === '-') delete cur.whatsapp; else cur.whatsapp = secret.slice(0, 200);
      await db.run('UPDATE sites SET hook_secrets=? WHERE id=?', [JSON.stringify(cur), s.id]);
    }
    await loadSites();
    return back('cloud');
  }
  if (action === 'bot') {
    const rules = parseRules(f.get('rules'));
    await db.run('UPDATE sites SET bot_rules=? WHERE id=?', [JSON.stringify(rules), s.id]);
    await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [s.id, Date.now(), r.user.email, `respostas do robô salvas (${rules.length})`]);
    await loadSites();
    return back('bot');
  }
  throw new HttpError(400, 'Ação inválida.');
});

// ---------- webhook da Cloud API (verificação e mensagens; exige a assinatura da chave do app) ----------
const siteByHook = token => {
  const t = Buffer.from(String(token));
  return [...sites.values()].find(s => { if (!s.webhook_token) return false; const w = Buffer.from(hookToken(s, 'whatsapp')); return w.length === t.length && timingSafeEqual(w, t); });
};
route('GET', '/hooks/:token/whatsapp', { auth: false }, async r => {
  const ok = siteByHook(r.params.token) && r.q.get('hub.mode') === 'subscribe' && r.q.get('hub.verify_token') === r.params.token;
  r.res.writeHead(ok ? 200 : 403, { 'content-type': 'text/plain' }).end(ok ? String(r.q.get('hub.challenge') || '').slice(0, 200) : 'forbidden');
});
route('POST', '/hooks/:token/whatsapp', { auth: false }, async r => {
  const site = siteByHook(r.params.token), raw = await readBody(r.req, 512 * 1024);
  const secret = site && secretsOf(site).whatsapp;
  if (!site || !piiReady() || !secret || !site.waba_id) return r.res.writeHead(404).end(); // sem a WABA não dá para separar clientes do mesmo app
  const want = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex')), got = Buffer.from(String(r.req.headers['x-hub-signature-256'] || ''));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return r.res.writeHead(401).end();
  let body = null;
  try { body = JSON.parse(raw); } catch {}
  await handleCloud(site, body);
  r.res.writeHead(200).end('ok');
});

// ---------- conversas ----------
route('GET', '/sites/:id/conversations', { site: 'view', module: 'whatsapp' }, async r => {
  if (!piiReady()) throw new HttpError(503, 'Conversas precisam da chave DATA_KEY configurada no servidor.');
  const [cols, rows] = await Promise.all([stages(r.site.id), db.all('SELECT * FROM contacts WHERE site=? AND last_msg IS NOT NULL ORDER BY last_msg DESC LIMIT 200', [r.site.id])]);
  const last = new Map((await db.all(`SELECT DISTINCT ON (contact_id) contact_id, text_enc, dir FROM messages WHERE site=? AND contact_id = ANY(?::bigint[]) ORDER BY contact_id, ts DESC`,
    [r.site.id, rows.map(c => c.id)])).map(m => [m.contact_id, { ...m, text: open(m.text_enc) }]));
  await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [r.site.id, Date.now(), r.user.email, 'lista de conversas aberta']);
  send(r, 200, V.conversationsPage(await siteCtx(r, '/conversations'), cols, rows.map(reveal), last));
});
route('GET', '/sites/:id/conversations/:cid', { site: 'view', module: 'whatsapp' }, async r => {
  if (!piiReady()) throw new HttpError(503, 'Conversas precisam da chave DATA_KEY configurada no servidor.');
  const c = await db.get('SELECT * FROM contacts WHERE id=? AND site=?', [Number(r.params.cid) || 0, r.site.id]);
  if (!c) throw new HttpError(404, 'Conversa não encontrada.');
  const [cols, msgs, click] = await Promise.all([stages(r.site.id), db.all('SELECT ts, dir, text_enc FROM messages WHERE contact_id=? AND site=? ORDER BY ts LIMIT 500', [c.id, r.site.id]),
    db.get('SELECT c.code, c.ts, l.name FROM wa_clicks c JOIN wa_links l ON l.id=c.link_id WHERE c.site=? AND c.contact_id=? ORDER BY c.ts LIMIT 1', [r.site.id, c.id])]);
  await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [r.site.id, Date.now(), r.user.email, `conversa do contato ${c.id} aberta`]);
  send(r, 200, V.threadPage(await siteCtx(r, '/conversations'), reveal(c), cols, msgs.map(m => ({ ...m, text: open(m.text_enc) })), click));
});
route('POST', '/sites/:id/conversations/:cid', { site: 'edit', module: 'whatsapp' }, async r => {
  const f = await form(r.req), c = await db.get('SELECT * FROM contacts WHERE id=? AND site=?', [Number(r.params.cid) || 0, r.site.id]);
  if (!c) throw new HttpError(404, 'Conversa não encontrada.');
  if (f.get('action') === 'accept' && c.suggest_stage) await moveContact(r.site, c, c.suggest_stage, { by: `sugestão aceita por ${r.user.email}` });
  else if (f.get('action') === 'dismiss') await db.run('UPDATE contacts SET suggest_stage=NULL, suggest_reason=NULL WHERE id=?', [c.id]);
  else throw new HttpError(400, 'Ação inválida.');
  redirect(r, sitePath(r.site, `/conversations/${c.id}`));
});
