// Tráfego: visão geral, tempo real, funis, jornadas, atribuição e o link público.
import { db, sites } from '../db.js';
import { period } from '../time.js';
import { route, send, redirect, form, sitePath, HttpError } from '../http.js';
import { ctx, siteCtx } from '../auth.js';
import * as S from '../tracking/stats.js';
import * as V from '../views/traffic.js';
import { deliveriesFor, retry, dispatch } from '../dispatch.js';

const range = r => [period(r.q, r.site.timezone), S.filtersFrom(r.q)];

route('GET', '/sites/:id/traffic', { site: 'view' }, async r => {
  const [p, f] = range(r);
  send(r, 200, V.overviewPage(await siteCtx(r, '/traffic'), p, f, await S.overview(r.site, p, f)));
});

route('GET', '/share/:token', { auth: false }, async r => {
  const site = [...sites.values()].find(s => s.share_token && s.share_token === r.params.token);
  if (!site) throw new HttpError(404, 'Este link público não existe ou foi desativado.');
  r.site = site;
  const [p, f] = range(r);
  send(r, 200, V.overviewPage(ctx(r, { site, share: true, user: null }), p, f, await S.overview(site, p, f)), { 'x-robots-tag': 'noindex' });
});

route('GET', '/sites/:id/events', { site: 'view' }, async r => {
  const [c, d] = await Promise.all([siteCtx(r, '/events'), S.recentEvents(r.site.id)]);
  const dl = await deliveriesFor(r.site.id, d.map(e => e.event_id).filter(Boolean));
  for (const e of d) e.deliveries = dl.get(e.event_id) || [];
  send(r, 200, r.q.has('partial') ? V.eventsBody(c, d) : V.eventsPage(c, d));
});
route('POST', '/sites/:id/deliveries/:did/retry', { site: 'edit' }, async r => {
  await retry(r.site.id, Number(r.params.did) || 0);
  dispatch().catch(e => console.error(e)); // envia já; a tela mostra o resultado no próximo ciclo
  redirect(r, sitePath(r.site, '/events'));
});

route('GET', '/sites/:id/realtime', { site: 'view' }, async r => {
  const [c, d] = await Promise.all([siteCtx(r, '/realtime'), S.realtime(r.site)]);
  send(r, 200, r.q.has('partial') ? V.realtimeBody(c, d) : V.realtimePage(c, d));
});

async function funnelsView(r, err) {
  const [p, f] = range(r);
  const list = await Promise.all((await db.all('SELECT * FROM funnels WHERE site_id=? ORDER BY id', [r.site.id])).map(async fn => {
    const steps = JSON.parse(fn.steps);
    return { ...fn, steps, counts: await S.funnel(r.site.id, p, f, steps) };
  }));
  send(r, err ? 400 : 200, V.funnelsPage(await siteCtx(r, '/funnels'), p, f, list, err));
}
route('GET', '/sites/:id/funnels', { site: 'view' }, r => funnelsView(r));
route('POST', '/sites/:id/funnels', { site: 'edit' }, async r => {
  const f = await form(r.req), name = (f.get('name') || '').trim().slice(0, 80), steps = S.parseSteps(f.get('steps') || '');
  if (!name || steps.length < 2) return funnelsView(r, 'Dê um nome e pelo menos 2 etapas ao funil.');
  await db.run('INSERT INTO funnels(site_id, name, steps) VALUES (?,?,?)', [r.site.id, name, JSON.stringify(steps)]);
  redirect(r, sitePath(r.site, '/funnels'));
});
route('POST', '/sites/:id/funnels/:fid/delete', { site: 'edit' }, async r => {
  await db.run('DELETE FROM funnels WHERE id=? AND site_id=?', [Number(r.params.fid) || 0, r.site.id]);
  redirect(r, sitePath(r.site, '/funnels'));
});

route('GET', '/sites/:id/journeys', { site: 'view' }, async r => {
  const [p, f] = range(r);
  send(r, 200, V.journeysPage(await siteCtx(r, '/journeys'), p, f, await S.journeys(r.site.id, p, f)));
});

route('GET', '/sites/:id/attribution', { site: 'view' }, async r => {
  const [p, f] = range(r), names = await S.eventNames(r.site.id, p);
  const event = names.includes(r.q.get('event')) ? r.q.get('event') : names[0];
  const dim = Object.hasOwn(S.ATTR_DIMS, r.q.get('dim') || '') ? r.q.get('dim') : 'channel';
  send(r, 200, V.attributionPage(await siteCtx(r, '/attribution'), p, f, names, event, dim, event ? await S.attribution(r.site.id, p, f, event, dim) : null));
});
