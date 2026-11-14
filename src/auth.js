import { db, env, sites, sha, newToken } from './db.js';
import { DAY } from './time.js';

// ---------- sessões de login (cookie HttpOnly; o banco guarda só o hash do token) ----------
export const cookieToken = req => /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '')?.[1];
export const cookie = (req, value, maxAge) =>
  `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;

export async function login(r, userId) {
  const t = newToken();
  await db.run('INSERT INTO sessions VALUES (?,?,?)', [sha(t), userId, Date.now() + 30 * DAY]);
  return { 'set-cookie': cookie(r.req, t, 30 * 86400) };
}
export async function currentUser(req) {
  const t = cookieToken(req);
  return t ? await db.get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', [sha(t), Date.now()]) ?? null : null;
}

// ---------- força bruta: 10 falhas por IP bloqueiam o login por 15 min (no banco: vale entre instâncias) ----------
export async function blocked(ip) {
  const f = await db.get('SELECT n, until FROM login_fails WHERE ip=?', [ip]);
  return !!f && f.n >= 10 && f.until > Date.now();
}
export const failed = ip => db.run(`INSERT INTO login_fails VALUES (?, 1, ?)
  ON CONFLICT(ip) DO UPDATE SET n = CASE WHEN login_fails.until < ?3 THEN 1 ELSE login_fails.n + 1 END, until = CASE WHEN login_fails.until < ?3 THEN excluded.until ELSE login_fails.until END`,
[ip, Date.now() + 15 * 60e3, Date.now()]);
export const clearFails = ip => db.run('DELETE FROM login_fails WHERE ip=?', [ip]);

// ---------- permissões: admin vê tudo; editor e leitor só os sites liberados; só admin/editor alteram ----------
export const memberSites = async uid => new Set((await db.all('SELECT site_id FROM user_sites WHERE user_id=?', [uid])).map(x => x.site_id));
export async function allowedSites(u) {
  if (u.role === 'admin') return [...sites.values()];
  const ids = await memberSites(u.id);
  return [...sites.values()].filter(s => ids.has(s.id));
}
export const canView = async (u, id) => u.role === 'admin' || !!await db.get('SELECT 1 FROM user_sites WHERE user_id=? AND site_id=?', [u.id, id]);
export const canEdit = async (u, id) => u.role === 'admin' || (u.role === 'editor' && await canView(u, id));

/** Contexto passado às views. */
export const ctx = (r, extra = {}) => ({ nonce: r.nonce, user: r.user, q: r.q, ...extra });
export const siteCtx = async (r, tab) => ctx(r, { site: r.site, sites: await allowedSites(r.user), tab, canEdit: r.canEdit });
