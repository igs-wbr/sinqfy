// Cliente com vários sites (um por funil): gasto dividido pela regra de campanha, visão somada sem pedido duplicado.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, kv } from './helpers.js';

// Conta de anúncios simulada: uma campanha da Black e uma da esteira, um dia de gasto cada.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.host !== 'graph.facebook.com') return realFetch(url, opts);
  const json = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  const p = u.pathname.replace(/^\/v[\d.]+\/act_77777/, ''), day = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // dia no fuso do site (como a Meta devolve), não em UTC: das 21h à meia-noite eles diferem
  if (p === '') return json({ name: 'CA Jean', currency: 'BRL' });
  if (p === '/campaigns') return json({ data: [{ id: 'cb', name: 'SPEC | VENDAS | BLACK997 | CBO', effective_status: 'ACTIVE' }, { id: 'ce', name: 'SPEC | VENDAS | ESCALA 01', effective_status: 'ACTIVE' }] });
  if (p === '/adsets') return json({ data: [{ id: 'sb', name: 'BK01', campaign_id: 'cb', effective_status: 'ACTIVE' }, { id: 'se', name: 'E01', campaign_id: 'ce', effective_status: 'ACTIVE' }] });
  if (p === '/ads') return json({ data: [{ id: 'ab', name: 'BK-005', adset_id: 'sb', effective_status: 'ACTIVE' }, { id: 'ae', name: 'E-1', adset_id: 'se', effective_status: 'ACTIVE' }] });
  if (p === '/insights') return json({ data: [
    { date_start: day, campaign_id: 'cb', campaign_name: 'SPEC | VENDAS | BLACK997 | CBO', adset_id: 'sb', ad_id: 'ab', spend: '100', impressions: '1000', clicks: '10' },
    { date_start: day, campaign_id: 'ce', campaign_name: 'SPEC | VENDAS | ESCALA 01', adset_id: 'se', ad_id: 'ae', spend: '300', impressions: '3000', clicks: '30' }] });
  return json({ error: { message: 'rota não simulada ' + p } });
};

const { req, login, close } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const W = await import('../src/sales/webhooks.js');
after(close);
const admin = await login();
const save = (id, client, rule = '') => req(`/sites/${id}/settings`, { cookie: admin, form: { action: 'save', name: id.toUpperCase(), timezone: 'America/Sao_Paulo', currency: 'BRL', tax_rate: '0', client, spend_rule: rule } });
const sale = (site, tx, value, product) => req(`/hooks/${W.hookToken(DB.sites.get(site), 'hotmart')}/hotmart`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({
  event: 'PURCHASE_APPROVED', data: { product: { name: product }, purchase: { transaction: tx, order_date: Date.now(), price: { value } } } }) });

test('gasto de cada campanha vai para o site do funil; visão do cliente soma sem duplicar pedido', async () => {
  for (const id of ['ahsd', 'black', 'outro']) await req('/sites', { cookie: admin, form: { id, name: id, timezone: 'America/Sao_Paulo', currency: 'BRL' } });
  await save('ahsd', 'Jean'); await save('black', 'Jean', 'BLACK997, black 2026'); await save('outro', 'Outra cliente', 'ESCALA');
  assert.equal(DB.sites.get('black').spend_rule, 'BLACK997, black 2026');
  const added = await req('/sites/ahsd/integrations', { cookie: admin, form: { action: 'meta_add', account_id: 'act_77777', token: 'T' } });
  assert.equal(added.status, 303, /class="notice[^"]*"[^>]*>([^<]*)/.exec(added.text)?.[1]);

  const spend = async site => Number((await db.get('SELECT COALESCE(SUM(spend),0) s FROM ad_spend WHERE site=?', [site])).s);
  assert.deepEqual([await spend('ahsd'), await spend('black'), await spend('outro')], [300, 100, 0], 'regra de outro cliente não pega a campanha');
  assert.ok(await db.get("SELECT 1 FROM ad_entities WHERE site='black' AND level='ad' AND id='ab'"), 'anúncio da Black vai junto com a campanha');

  // Regra apagada: a ressincronização devolve o gasto ao site da conta, sem duplicar.
  await save('black', 'Jean', '');
  const acc = await db.get("SELECT * FROM ad_accounts WHERE site='ahsd'");
  assert.equal(acc.last_sync, null, 'mudar a regra pede ressincronização completa');
  await (await import('../src/ads/meta.js')).syncMeta(acc);
  assert.deepEqual([await spend('ahsd'), await spend('black')], [400, 0]);
  await save('black', 'Jean', 'BLACK997');
  await (await import('../src/ads/meta.js')).syncMeta(await db.get("SELECT * FROM ad_accounts WHERE site='ahsd'"));
  assert.deepEqual([await spend('ahsd'), await spend('black')], [300, 100]);

  // A mesma venda da Black chega aos dois sites (webhook da Hotmart nos dois); a do Spectra só no AHSD.
  await sale('ahsd', 'HP1', 997, 'BLACK AHSD'); await sale('black', 'HP1', 997, 'BLACK AHSD'); await sale('ahsd', 'HP2', 47, 'Spectra');
  const page = await req('/sites/~jean', { cookie: admin });
  assert.equal(page.status, 200);
  assert.match(kv(page.text, 'paid'), /^2$/, 'pedido repetido conta uma vez');
  assert.match(kv(page.text, 'spend'), /400/);
  assert.match(page.text, /Funis do cliente/);
  assert.match(page.text, /<details class="sub" open><summary>Jean<span class="chev">[\s\S]*?href="\/sites\/~jean" class="on"[^>]*>Todos os funis<\/a>[\s\S]*?>AHSD<\/a>[\s\S]*?>BLACK<\/a><\/details>/, 'cliente é um submenu com a visão somada e os sites');
  assert.match(page.text, /<details class="sub"><summary>Outra cliente[\s\S]*?>OUTRO<\/a><\/details>/, 'cliente com um site só: submenu sem visão somada');
  assert.match(page.text, /href="\/sites\/~jean\/campaigns/);
  assert.doesNotMatch(page.text, /href="\/sites\/~jean\/(events|integrations|settings)/, 'menu só com as telas que somam');
  assert.match(kv((await req('/sites/black', { cookie: admin })).text, 'spend'), /100/, 'painel da Black tem o gasto da campanha dela');

  const camps = await req('/sites/~jean/campaigns', { cookie: admin });
  assert.equal(camps.status, 200);
  assert.match(camps.text, /BLACK997/); assert.match(camps.text, /ESCALA 01/);
  assert.equal((await req('/sites/~jean/orders', { cookie: admin })).status, 200);
  for (const p of ['/events', '/integrations', '/settings']) assert.equal((await req('/sites/~jean' + p, { cookie: admin })).status, 404, p);
  assert.equal((await req('/sites/~outra-cliente', { cookie: admin })).status, 404, 'cliente com um site só não tem visão somada');
});

test('novo site entra num cliente existente ou num novo', async () => {
  assert.match((await req('/sites', { cookie: admin })).text, /<optgroup label="Cliente existente"><option value="Jean">Jean<\/option><option value="Outra cliente">/);
  const make = form => req('/sites', { cookie: admin, form: { name: form.id, timezone: 'America/Sao_Paulo', currency: 'BRL', ...form } });
  assert.equal((await make({ id: 'jean3', client: 'Jean' })).status, 303);
  assert.equal((await make({ id: 'novo1', client: '__new', client_new: ' Agentise ' })).status, 303);
  assert.equal((await make({ id: 'novo2', client: '__new', client_new: '' })).status, 400);
  assert.equal((await make({ id: 'novo3', client: 'Inventado' })).status, 400);
  assert.equal((await make({ id: 'solto' })).status, 303);
  assert.deepEqual(['jean3', 'novo1', 'solto'].map(id => DB.sites.get(id).client), ['Jean', 'Agentise', '']);
});
