// Início, configurações do site, sites, equipe, conta e a rota de cron.
import { timingSafeEqual } from 'node:crypto';
import { db, env, sites, loadSites, hashPassword, checkPassword, sha, newToken } from '../db.js';
import { DAY, localDate } from '../time.js';
import { route, send, redirect, form, origin, sitePath, HttpError } from '../http.js';
import { ctx, siteCtx, login, allowedSites, memberSites } from '../auth.js';
import { totals } from '../tracking/stats.js';
import { salesTotals } from '../sales/stats.js';
import { runJobs } from '../jobs.js';
import { ROLES } from '../views/ui.js';
import { removeHost } from '../cloudflare.js';
import { MODULES, fromForm } from '../modules.js';
import { clientSites } from '../clients.js';
import { planOf, verifyKey, setInstall, freeSiteId, FREE_SITES, PRICE, BUY_URL } from '../license.js';
import * as V from '../views/admin.js';

const TIMEZONES = new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]);
const DEFAULT_TZ = env.DEFAULT_TIMEZONE || 'America/Sao_Paulo';
const MSG = {
  saved: 'Configurações salvas.', modules: 'Recursos salvos.', share_on: 'Link público criado.', share_off: 'Link público desativado.',
  password: 'Senha alterada.',
};
export const msg = r => Object.hasOwn(MSG, r.q.get('ok') || '') ? MSG[r.q.get('ok')] : null;

// Tabelas ligadas a um site / a um usuário. Apagadas explicitamente: o schema não usa chave estrangeira.
const SITE_TABLES = [['events', 'site'], ['sales', 'site'], ['webhook_log', 'site'], ['deliveries', 'site'], ['contacts', 'site'], ['crm_log', 'site'], ['stages', 'site'], ['erased', 'site'], ['audit_log', 'site'], ['wa_links', 'site'], ['wa_clicks', 'site'], ['messages', 'site'], ['pending_orders', 'site'], ['checkout_clicks', 'site'], ['page_reads', 'site'], ['click_cells', 'site'], ['click_targets', 'site'], ['products', 'site'], ['ad_accounts', 'site'], ['ad_entities', 'site'], ['ad_spend', 'site'],
  ['funnels', 'site_id'], ['user_sites', 'site_id'], ['sites', 'id']];
const USER_TABLES = [['user_sites', 'user_id'], ['sessions', 'user_id'], ['users', 'id']];

route('GET', '/', {}, async r => {
  const mine = await allowedSites(r.user);
  if (mine.length) return redirect(r, sitePath(mine[0]));
  if (r.user.role === 'admin') return redirect(r, '/sites');
  send(r, 200, V.messagePage(ctx(r), 'Nenhum site', 'Você ainda não tem acesso a nenhum site. Peça a um admin.'));
});

// --- cron: chamado de hora em hora por um agendador externo, com o segredo no cabeçalho Authorization ---
route('GET', '/cron', { auth: false }, async r => {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET || ''}`), got = Buffer.from(r.req.headers.authorization || '');
  if (!env.CRON_SECRET || got.length !== expected.length || !timingSafeEqual(got, expected)) throw new HttpError(404, 'Página não encontrada.');
  const out = await runJobs();
  r.res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(out));
});

// --- configurações do site ---
route('GET', '/sites/:id/settings', { site: 'edit', free: true }, async r => send(r, 200, V.settingsPage(await siteCtx(r, '/settings'), origin(r.req), msg(r))));
route('POST', '/sites/:id/settings', { site: 'edit', free: true }, async r => {
  const f = await form(r.req), id = r.site.id, action = f.get('action');
  if (action === 'save') {
    const name = (f.get('name') || '').trim().slice(0, 80), tz = f.get('timezone'), cur = (f.get('currency') || '').toUpperCase(), tax = Number(f.get('tax_rate') || 0);
    if (!name || !TIMEZONES.has(tz) || !/^[A-Z]{3}$/.test(cur) || !(tax >= 0 && tax <= 100)) throw new HttpError(400, 'Nome, fuso horário, moeda ou imposto inválidos.');
    const domains = (f.get('domains') || '').toLowerCase().split(/[\s,]+/).map(d => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
    if (domains.some(d => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) throw new HttpError(400, 'Domínio inválido. Use só o domínio, ex.: loja.com.br');
    const client = (f.get('client') || '').trim().slice(0, 80), rule = (f.get('spend_rule') || '').split(',').map(t => t.trim()).filter(Boolean).join(', ').slice(0, 300);
    await db.run('UPDATE sites SET name=?, timezone=?, currency=?, tax_rate=?, domains=?, client=?, spend_rule=? WHERE id=?', [name, tz, cur, tax, domains.join(', ') || null, client, rule, id]);
    // Mudou o cliente ou a regra: a próxima sincronização das contas do cliente refaz 90 dias e redistribui o gasto entre os sites.
    if (client !== r.site.client || rule !== r.site.spend_rule) {
      const group = [...new Set([...clientSites(r.site), ...clientSites({ ...r.site, client })].map(s => s.id))];
      await db.run("UPDATE ad_accounts SET last_sync=NULL, last_full=NULL WHERE site = ANY(?::text[])", [group]);
      // Sem conta própria, todo gasto deste site veio da conta do cliente: limpa, e a ressincronização devolve o que ainda for dele.
      if (!await db.get('SELECT 1 FROM ad_accounts WHERE site=?', [id])) await db.batch([['DELETE FROM ad_spend WHERE site=?', [id]], ['DELETE FROM ad_entities WHERE site=?', [id]]]);
    }
  } else if (action === 'share_on') await db.run('UPDATE sites SET share_token=? WHERE id=?', [newToken(), id]);
  else if (action === 'share_off') await db.run('UPDATE sites SET share_token=NULL WHERE id=?', [id]);
  else if (action === 'modules') {
    const on = f.getAll('module').filter(m => Object.hasOwn(MODULES, m));
    await db.run('UPDATE sites SET modules=? WHERE id=?', [fromForm(on), id]);
    await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [id, Date.now(), r.user.email, `recursos: ${on.join(', ') || 'nenhum'}`]);
  }
  else throw new HttpError(400, 'Ação inválida.');
  await loadSites();
  redirect(r, sitePath(r.site, `/settings?ok=${action === 'save' ? 'saved' : action}`));
});
route('POST', '/sites/:id/delete', { site: 'edit', admin: true, free: true }, async r => {
  const f = await form(r.req);
  if (f.get('confirm') !== r.site.id) throw new HttpError(400, 'A confirmação não confere. Nada foi apagado.');
  if (r.site.edge_host) await removeHost(r.site); // libera o domínio na Cloudflare
  await db.batch([...SITE_TABLES.map(([t, c]) => [`DELETE FROM ${t} WHERE ${c}=?`, [r.site.id]]),
    ['INSERT INTO deleted_sites VALUES (?,?) ON CONFLICT DO NOTHING', [r.site.id, Date.now()]]]); // o id não volta a ser usado
  await loadSites();
  redirect(r, '/');
});

// --- sites ---
async function sitesView(r, err) {
  const rows = await Promise.all((await allowedSites(r.user)).map(async s => {
    const today = localDate(Date.now(), s.timezone), range = { from: today, to: today };
    const [t, sl] = await Promise.all([totals(s.id, range), salesTotals(s, range)]);
    return { ...s, visitors: t.visitors, net: sl.net };
  }));
  const clients = [...new Set((await allowedSites(r.user)).map(s => s.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  send(r, err ? 400 : 200, V.sitesPage(ctx(r, { tab: 'sites', defaultTz: DEFAULT_TZ, clients }), rows, err));
}
route('GET', '/sites', { admin: true }, r => sitesView(r));
route('POST', '/sites', { admin: true }, async r => {
  const f = await form(r.req), id = (f.get('id') || '').trim(), name = (f.get('name') || '').trim().slice(0, 80);
  const tz = f.get('timezone'), cur = (f.get('currency') || '').toUpperCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) return sitesView(r, 'Id inválido: use letras, números, ponto ou hífen.');
  if (await db.get('SELECT 1 FROM sites WHERE id=? UNION ALL SELECT 1 FROM deleted_sites WHERE id=?', [id, id])) return sitesView(r, 'Esse id não está disponível. Escolha outro.');
  if (!name || !TIMEZONES.has(tz) || !/^[A-Z]{3}$/.test(cur)) return sitesView(r, 'Preencha nome, fuso horário e moeda válidos.');
  // Grátis: 1 site na instalação (ADR 0022). Com mais, o painel dos outros fica bloqueado; aqui nem deixa criar.
  if (sites.size >= FREE_SITES && !(await planOf()).pro) return sitesView(r, `O plano Grátis tem ${FREE_SITES} site. Para criar outro, ative o Pro (ou o teste de 7 dias) em Plano.`);
  // Cliente: um dos que já existem na agência ou um novo (src/clients.js).
  const pick = f.get('client') || '', client = (pick === V.NEW_CLIENT ? f.get('client_new') || '' : pick).trim().slice(0, 80);
  if (pick === V.NEW_CLIENT && !client) return sitesView(r, 'Dê um nome ao novo cliente.');
  if (pick && pick !== V.NEW_CLIENT && !(await allowedSites(r.user)).some(s => s.client === pick)) return sitesView(r, 'Cliente não encontrado.');
  await db.run('INSERT INTO sites(id, name, timezone, currency, created, webhook_token, agency_id, client) VALUES (?,?,?,?,?,?,?,?)', [id, name, tz, cur, Date.now(), newToken(), r.user.agency_id, client]);
  await loadSites();
  redirect(r, `/sites/${encodeURIComponent(id)}/setup`);
});

// --- equipe ---
async function teamView(r, extra = {}) {
  const users = await Promise.all((await db.all('SELECT * FROM users WHERE agency_id=? ORDER BY created', [r.user.agency_id])).map(async u => ({ ...u, sites: await memberSites(u.id) })));
  send(r, extra.err ? 400 : 200, V.teamPage(ctx(r, { tab: 'team' }), users, await allowedSites(r.user), extra));
}
const setSites = (r, uid, ids) => db.batch([
  ['DELETE FROM user_sites WHERE user_id=?', [uid]],
  ...[...new Set(ids)].filter(id => sites.get(id)?.agency_id === r.user.agency_id).map(id => ['INSERT INTO user_sites VALUES (?,?)', [uid, id]]),
]);
async function issueLink(r, u) {
  const t = newToken(), url = `${origin(r.req)}/invite/${t}`;
  await db.run('UPDATE users SET invite=?, invite_expires=? WHERE id=?', [sha(t), Date.now() + 7 * DAY, u.id]);
  return { link: url };
}
async function member(r) {
  const u = await db.get('SELECT * FROM users WHERE id=? AND agency_id=?', [Number(r.params.uid) || 0, r.user.agency_id]);
  if (!u) throw new HttpError(404, 'Pessoa não encontrada.');
  if (u.id === r.user.id) throw new HttpError(400, 'Use a página Conta para alterar a sua própria conta.');
  if (u.platform && !r.user.platform) throw new HttpError(403, 'Essa conta é do dono da plataforma e não pode ser alterada aqui.');
  return u;
}
route('GET', '/team', { admin: true }, r => teamView(r));
route('POST', '/team', { admin: true }, async r => {
  const f = await form(r.req), email = (f.get('email') || '').trim().toLowerCase(), role = f.get('role') || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Object.hasOwn(ROLES, role)) return teamView(r, { err: 'E-mail ou papel inválido.' });
  if (await db.get('SELECT 1 FROM users WHERE lower(email)=lower(?)', [email])) return teamView(r, { err: 'Já existe alguém com esse e-mail.' });
  const { rows: [{ id: uid }] } = await db.run('INSERT INTO users(email, name, role, created, agency_id) VALUES (?,?,?,?,?) RETURNING id', [email, (f.get('name') || '').trim().slice(0, 80), role, Date.now(), r.user.agency_id]);
  await setSites(r, uid, f.getAll('sites'));
  teamView(r, await issueLink(r, await db.get('SELECT * FROM users WHERE id=?', [uid])));
});
route('POST', '/team/:uid', { admin: true }, async r => {
  const u = await member(r), f = await form(r.req), role = f.get('role') || '';
  if (!Object.hasOwn(ROLES, role)) throw new HttpError(400, 'Papel inválido.');
  await db.run('UPDATE users SET role=? WHERE id=?', [role, u.id]);
  await setSites(r, u.id, f.getAll('sites'));
  redirect(r, '/team');
});
route('POST', '/team/:uid/link', { admin: true }, async r => teamView(r, await issueLink(r, await member(r))));
route('POST', '/team/:uid/delete', { admin: true }, async r => {
  const u = await member(r);
  await db.batch(USER_TABLES.map(([t, c]) => [`DELETE FROM ${t} WHERE ${c}=?`, [u.id]]));
  redirect(r, '/team');
});

// --- agências (dono da plataforma): cada agência tem os seus sites e a sua equipe; o primeiro dono entra por convite ---
const platformOnly = r => { if (!r.user.platform) throw new HttpError(404, 'Página não encontrada.'); };
async function agenciesView(r, extra = {}) {
  platformOnly(r);
  const rows = await db.all(`SELECT a.*, (SELECT COUNT(*) FROM sites s WHERE s.agency_id=a.id) sites, (SELECT COUNT(*) FROM users u WHERE u.agency_id=a.id) users
    FROM agencies a ORDER BY a.id`);
  send(r, extra.err ? 400 : 200, V.agenciesPage(ctx(r, { tab: 'agencies' }), rows, extra));
}
// --- plano da instalação (ADR 0022): só o dono da plataforma ativa a chave ou o teste ---
async function planView(r, extra = {}) {
  platformOnly(r);
  const plan = await planOf();
  send(r, extra.err ? 400 : 200, V.planPage(ctx(r, { tab: 'plano' }), plan, { price: PRICE, buyUrl: BUY_URL, sites: sites.size, free: sites.get(await freeSiteId()), ...extra }));
}
route('GET', '/plano', {}, r => planView(r, { msg: { key: 'Licença Pro ativada.', trial: 'Teste do Pro ativado por 7 dias.' }[r.q.get('ok')] }));
route('POST', '/plano', {}, async r => {
  platformOnly(r);
  const f = await form(r.req), action = f.get('action');
  if (action === 'key') {
    const key = (f.get('key') || '').replace(/\s+/g, '');
    if (!verifyKey(key)) return planView(r, { err: 'Chave inválida. Copie a chave inteira, do jeito que veio na compra.' });
    await setInstall('license', key);
  } else if (action === 'trial') {
    if ((await planOf()).trialUsed) return planView(r, { err: 'O teste grátis já foi usado nesta instalação.' });
    await setInstall('trial_started', Date.now());
  } else throw new HttpError(400, 'Ação inválida.');
  redirect(r, `/plano?ok=${action}`);
});

route('GET', '/agencies', {}, r => agenciesView(r));
route('POST', '/agencies', {}, async r => {
  platformOnly(r);
  const f = await form(r.req), name = (f.get('name') || '').trim().slice(0, 80), email = (f.get('email') || '').trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return agenciesView(r, { err: 'Informe o nome da agência e o e-mail do dono.' });
  if (await db.get('SELECT 1 FROM users WHERE lower(email)=lower(?)', [email])) return agenciesView(r, { err: 'Esse e-mail já tem conta no Sinqfy.' });
  const { rows: [{ id: aid }] } = await db.run('INSERT INTO agencies(name, created) VALUES (?,?) RETURNING id', [name, Date.now()]);
  const { rows: [{ id: uid }] } = await db.run("INSERT INTO users(email, name, role, created, agency_id) VALUES (?,?,'admin',?,?) RETURNING id", [email, '', Date.now(), aid]);
  agenciesView(r, { ...await issueLink(r, await db.get('SELECT * FROM users WHERE id=?', [uid])), agency: name });
});

// --- conta ---
function accountView(r, ok, err) {
  send(r, err ? 400 : 200, V.accountPage(ctx(r, { tab: 'account' }), ok, err));
}
route('GET', '/account', {}, r => accountView(r, msg(r)));
route('POST', '/account/password', {}, async r => {
  const f = await form(r.req), pw = f.get('password') || '';
  if (!checkPassword(f.get('current') || '', r.user.pass)) return accountView(r, null, 'Senha atual incorreta.');
  if (pw.length < 8 || pw !== f.get('confirm')) return accountView(r, null, 'A nova senha precisa ter 8+ caracteres e ser confirmada.');
  await db.batch([['UPDATE users SET pass=? WHERE id=?', [hashPassword(pw), r.user.id]], ['DELETE FROM sessions WHERE user_id=?', [r.user.id]]]); // derruba outras sessões
  redirect(r, '/account?ok=password', await login(r, r.user.id));
});
