// Login, logout e convites (link de uso único para definir senha; também serve para redefinir).
import { db, hashPassword, checkPassword, sha } from '../db.js';
import { route, send, redirect, form, clientIp } from '../http.js';
import { ctx, login, cookie, cookieToken, blocked, failed, clearFails } from '../auth.js';
import * as V from '../views/admin.js';

route('GET', '/login', { auth: false }, r => r.user ? redirect(r, '/') : send(r, 200, V.loginPage(ctx(r), { next: r.q.get('next') || '' })));

route('POST', '/login', { auth: false }, async r => {
  const f = await form(r.req), ip = clientIp(r.req), email = (f.get('email') || '').trim(), next = f.get('next') || '';
  const byEmail = 'e:' + email.toLowerCase().slice(0, 200);
  if (await blocked(ip) || await blocked(byEmail)) return send(r, 429, V.loginPage(ctx(r), { email, next, err: 'Muitas tentativas. Tente de novo em 15 minutos.' }));
  const user = await db.get('SELECT * FROM users WHERE lower(email)=lower(?)', [email]);
  if (!checkPassword(f.get('password') || '', user?.pass)) {
    await failed(ip); await failed(byEmail);
    return send(r, 401, V.loginPage(ctx(r), { email, next, err: 'E-mail ou senha incorretos.' }));
  }
  await clearFails(ip); await clearFails(byEmail);
  redirect(r, /^\/(?![/\\])/.test(next) ? next : '/', await login(r, user.id)); // só redireciona para caminhos locais
});

route('POST', '/logout', { auth: false }, async r => {
  const t = cookieToken(r.req);
  if (t) await db.run('DELETE FROM sessions WHERE token=?', [sha(t)]);
  redirect(r, '/login', { 'set-cookie': cookie(r.req, '', 0) });
});

const inviteUser = t => db.get('SELECT * FROM users WHERE invite=? AND invite_expires>?', [sha(t), Date.now()]);
route('GET', '/invite/:token', { auth: false }, async r => send(r, 200, V.invitePage(ctx(r), await inviteUser(r.params.token))));
route('POST', '/invite/:token', { auth: false }, async r => {
  const u = await inviteUser(r.params.token);
  if (!u) return send(r, 400, V.invitePage(ctx(r), null));
  const f = await form(r.req), pw = f.get('password') || '';
  if (pw.length < 8 || pw !== f.get('confirm')) return send(r, 400, V.invitePage(ctx(r), u, 'A senha precisa ter 8+ caracteres e as duas precisam ser iguais.'));
  await db.batch([
    ['UPDATE users SET pass=?, invite=NULL, invite_expires=NULL WHERE id=?', [hashPassword(pw), u.id]],
    ['DELETE FROM sessions WHERE user_id=?', [u.id]],
  ]);
  redirect(r, '/', await login(r, u.id));
});
