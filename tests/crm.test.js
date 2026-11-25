// Etapa 5: dados pessoais cifrados, captura de leads (formulário, webhook, Lead Ads), quadro com evento offline,
// venda casada pelo e-mail do lead e exclusão a pedido do titular.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, createHmac } from 'node:crypto';
import { boot, CHROME } from './helpers.js';

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.host === 'graph.facebook.com') {
    const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.pathname.endsWith('/9876543210')) return json({ id: '9876543210', created_time: '2026-11-14T12:00:00+0000', ad_id: '333', adset_id: '222', campaign_id: '111', campaign_name: 'Lead Ads BF',
      field_data: [{ name: 'full_name', values: ['Maria Lead'] }, { name: 'email', values: ['Maria@Exemplo.com'] }, { name: 'phone_number', values: ['+55 11 97777-6666'] }] });
    return json({ events_received: 1 });
  }
  return realFetch(url, opts);
};

const { req, login, close, base } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const P = await import('../src/pii.js');
const W = await import('../src/sales/webhooks.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'crm', name: 'CRM', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
await req('/sites/crm/integrations', { cookie: admin, form: { action: 'capi', pixel: '555020', capi_token: 'TOK' } });
const sha = v => createHash('sha256').update(v).digest('hex');
const RID = 'CrmVisitante0000000001';
const edge = { 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': RID, 'x-rastro-fbp': 'fb.1.1763080000000.1111111111', 'x-rastro-fbc': 'fb.1.1763080000000.IwAR-crm', 'x-rastro-ip': '198.51.100.30' };
const beacon = body => fetch(base + '/e', { method: 'POST', body: JSON.stringify({ s: 'crm', ...body }), headers: { 'user-agent': CHROME, ...edge } });
const hook = (p, body, h = {}) => fetch(`${base}/hooks/${W.hookToken(DB.sites.get('crm'), p)}/${p}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...h } });
const contact = email => db.get('SELECT * FROM contacts WHERE site=? AND email_hash=?', ['crm', P.hashEmail(email)]);

test('dados pessoais: cifra, decifra, detecta adulteração e normaliza para o hash', () => {
  const box = P.seal('Joana Silva');
  assert.ok(box.startsWith('v1.') && !box.includes('Joana'));
  assert.equal(P.open(box), 'Joana Silva');
  const parts = box.split('.'); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'B' : 'A') + 'A';
  assert.equal(P.open(parts.join('.')), null, 'dado adulterado não abre');
  assert.equal(P.normPhone('(11) 98888-7777'), '5511988887777');
  assert.equal(P.metaEmail(' Ana@X.com '), sha('ana@x.com'));
  assert.equal(P.hashEmail('ana@x.com'), P.hashEmail(' ANA@x.com'), 'índice cego normalizado');
  assert.notEqual(P.hashPhone('11988887777'), sha('5511988887777'), 'índice cego não é o SHA-256 puro (que se quebra por força bruta)');
  assert.equal(P.maskEmail('joana@gmail.com'), 'j***@g***.com');
});

test('snippet: formulário com e-mail ou telefone vira Lead com os dados; sem consentimento, sem dados', () => {
  const src = readFileSync(new URL('../public/s.js', import.meta.url), 'utf8');
  const run = consent => {
    const beacons = [], on = {}, store = {};
    vm.runInNewContext(src, {
      document: { currentScript: { src: 'https://t.loja.dev/s.js', dataset: { site: 'crm', ...(consent && { consent }) } }, referrer: '', cookie: '', addEventListener: (t, fn) => (on[t] = fn) },
      window: { addEventListener() {} }, location: { href: 'https://loja.dev/', pathname: '/', search: '', host: 'loja.dev', hostname: 'loja.dev' }, history: { pushState() {} },
      screen: { width: 1280 }, localStorage: store, URL, URLSearchParams, JSON, navigator: { sendBeacon: (u, b) => beacons.push(JSON.parse(b)) },
    });
    const field = (type, name, value) => ({ type, name, value });
    const formEl = { dataset: {}, elements: [field('text', 'nome', 'Joana'), field('email', 'campo1', 'joana@x.com'), field('tel', 'whats', '11999990000'), field('hidden', 'email_oculto', 'h@h.com'), field('text', 'hotel', 'Ibis')] };
    on.submit({ target: formEl });
    on.submit({ target: { dataset: {}, elements: [field('text', 'busca', 'tênis')] } });
    on.submit({ target: { dataset: {}, elements: [field('email', 'email', 'login@x.com'), field('password', 'senha', 'x')] } });
    on.submit({ target: { dataset: { rastroIgnore: '' }, elements: [field('email', 'email', 'nao@x.com')] } });
    return beacons;
  };
  const b = run();
  assert.equal(b.length, 2, 'pageview + lead; sem e-mail nem telefone, login ou marcado com data-rastro-ignore não gera nada');
  assert.deepEqual([b[1].n, b[1].l], ['Lead', { n: 'Joana', e: 'joana@x.com', p: '11999990000' }]);
  const c = run('required');
  assert.equal(c[1].l, undefined, 'sem consentimento os dados não saem do navegador');
  assert.ok(Buffer.byteLength(readFileSync(new URL('../public/s.js', import.meta.url))) < 4096);
});

test('formulário do site: contato cifrado no CRM com clique e campanha; o evento não guarda dado pessoal', async () => {
  await beacon({ u: 'https://loja.dev/?utm_source=FB&utm_medium=LAL%7C22&utm_campaign=BF%7C11&utm_content=AD%7C33&fbclid=IwAR-crm', i: 'evt_crm000001' });
  await beacon({ n: 'Lead', u: 'https://loja.dev/obrigado', i: 'evt_crm000002', l: { n: 'Joana Silva', e: 'Joana@Exemplo.com', p: '(11) 98888-7777' } });
  const c = await contact('joana@exemplo.com');
  assert.ok(c, 'contato criado');
  assert.deepEqual([c.rid, c.fbc, c.source, c.utm_campaign, c.campaign_key, c.adset_key, c.ad_key, c.phone_hash], [RID, edge['x-rastro-fbc'], 'site', 'BF|11', '11', '22', '33', P.hashPhone('5511988887777')]);
  const dump = JSON.stringify([await db.all("SELECT * FROM contacts WHERE site='crm'"), await db.all("SELECT * FROM events WHERE site='crm'"), await db.all('SELECT * FROM crm_log')]);
  assert.ok(!/joana@exemplo|Joana Silva|98888/i.test(dump), 'nada em texto puro no banco');
  assert.equal((await db.get('SELECT name FROM stages WHERE id=?', [c.stage_id])).name, 'Novo');
});

test('eventos do site para a Meta: o Lead leva e-mail, telefone e nome em hash; depois dele, os eventos do mesmo rid também', async () => {
  const ud = async id => JSON.parse((await db.get("SELECT payload FROM deliveries WHERE site='crm' AND dest='meta' AND event_id=?", [id])).payload).user_data;
  assert.equal((await ud('evt_crm000001')).em, undefined, 'antes do lead, anônimo');
  const lead = await ud('evt_crm000002');
  assert.deepEqual([lead.em, lead.ph, lead.fn, lead.ln], [[sha('joana@exemplo.com')], [sha('5511988887777')], [sha('joana')], [sha('silva')]]);
  await beacon({ n: 'InitiateCheckout', u: 'https://loja.dev/checkout', i: 'evt_crm000003' });
  const ic = await ud('evt_crm000003');
  assert.deepEqual([ic.em, ic.ph, ic.fn, ic.external_id], [[sha('joana@exemplo.com')], [sha('5511988887777')], [sha('joana')], [sha(RID)]], 'contato achado pelo rid');
});

test('webhook de leads e Lead Ads da Meta (verificação, assinatura e busca do lead)', async () => {
  assert.equal((await hook('leads', { name: 'Pedro', email: 'pedro@x.com', utm_campaign: 'Webinar|44' })).status, 200);
  assert.equal((await hook('leads', { email: 'pedro@x.com', phone: '21977776666' })).status, 200);
  const p = await contact('pedro@x.com');
  assert.deepEqual([p.source, p.campaign_key, p.phone_hash], ['webhook', '44', P.hashPhone('5521977776666')], 'segundo envio completa o mesmo contato');
  const lead = JSON.parse((await db.get(`SELECT payload FROM deliveries WHERE event_id='crm-${p.id}-lead'`)).payload);
  assert.deepEqual([lead.event_name, lead.action_source, lead.user_data.em[0], lead.custom_data.event_source], ['Lead', 'system_generated', sha('pedro@x.com'), 'crm']);
  assert.equal((await hook('leads', { name: 'Sem contato' })).status, 400);

  const t = W.hookToken(DB.sites.get('crm'), 'meta-leads');
  const verify = await fetch(`${base}/hooks/${t}/meta-leads?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=12345`);
  assert.deepEqual([verify.status, await verify.text()], [200, '12345']);
  assert.equal((await fetch(`${base}/hooks/${t}/meta-leads?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`)).status, 403);
  await req('/sites/crm/crm/meta-leads', { cookie: admin, form: { page_token: 'PAGE-TOKEN', app_secret: 'APPSECRET' } });
  const body = JSON.stringify({ object: 'page', entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: '9876543210', ad_id: '333' } }] }] });
  assert.equal((await hook('meta-leads', body)).status, 401, 'sem assinatura');
  assert.equal((await hook('meta-leads', body, { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'APPSECRET').update(body).digest('hex') })).status, 200);
  const m = await contact('maria@exemplo.com');
  assert.deepEqual([m.source, m.lead_id, m.campaign_key, m.adset_key, m.ad_key, m.utm_campaign], ['meta_lead', '9876543210', '111', '222', '333', 'Lead Ads BF']);
});

test('quadro: mover para coluna com evento manda conversão offline com hash e lead_id, uma vez só', async () => {
  const m = await contact('maria@exemplo.com');
  const qual = await db.get("SELECT id FROM stages WHERE site='crm' AND name='Qualificado'");
  assert.equal((await req('/sites/crm/crm/move', { cookie: admin, form: { contact: m.id, stage: qual.id } })).status, 303);
  await req('/sites/crm/crm/move', { cookie: admin, form: { contact: m.id, stage: (await db.get("SELECT id FROM stages WHERE site='crm' AND name='Novo'")).id } });
  await req('/sites/crm/crm/move', { cookie: admin, form: { contact: m.id, stage: qual.id, js: '1' } });
  const rows = await db.all('SELECT payload FROM deliveries WHERE event_id=?', [`crm-${m.id}-${qual.id}`]);
  assert.equal(rows.length, 1, 'voltar e entrar de novo não duplica');
  const ev = JSON.parse(rows[0].payload);
  assert.deepEqual([ev.event_name, ev.action_source, ev.user_data.lead_id, ev.user_data.em[0]], ['QualifiedLead', 'system_generated', 9876543210, sha('maria@exemplo.com')]);
  const logs = await db.all('SELECT text FROM crm_log WHERE contact_id=?', [m.id]);
  assert.ok(logs.some(l => l.text.includes('QualifiedLead na fila da Meta')));
});

test('venda sem rid casa com o lead pelo e-mail, herda o clique e leva o contato para Ganhou sem duplicar', async () => {
  const sale = { event: 'PURCHASE_APPROVED', data: { buyer: { email: 'JOANA@exemplo.com' }, purchase: { transaction: 'HCRM1', price: { value: 497 }, order_date: Date.now() } } };
  assert.equal((await hook('hotmart', sale)).status, 200);
  const s = await db.get("SELECT match_rule, campaign_key, rid FROM sales WHERE order_id='HCRM1'");
  assert.deepEqual([s.match_rule, s.campaign_key, s.rid], ['email', '11', RID]);
  const ev = JSON.parse((await db.get("SELECT payload FROM deliveries WHERE event_id='hotmart-HCRM1'")).payload);
  assert.deepEqual([ev.action_source, ev.user_data.fbc], ['website', edge['x-rastro-fbc']], 'compra com o clique do lead');
  const c = await contact('joana@exemplo.com');
  assert.equal((await db.get('SELECT kind FROM stages WHERE id=?', [c.stage_id])).kind, 'won');
  assert.equal(c.value, 497);
  assert.equal((await db.get("SELECT COUNT(*) n FROM deliveries WHERE event_id LIKE 'crm-' || ? || '-%'", [c.id])).n, 0, 'sem Purchase duplicado pelo CRM');
});

test('telas, colunas e exclusão a pedido do titular', async () => {
  for (const p of ['/sites/crm/crm', '/sites/crm/contacts', '/sites/crm/crm/stages']) assert.equal((await req(p, { cookie: admin })).status, 200, p);
  const j = await contact('joana@exemplo.com');
  const page = await req(`/sites/crm/contacts/${j.id}`, { cookie: admin });
  assert.ok(page.text.includes('joana@exemplo.com') && page.text.includes('Movido para'), 'ficha mostra o e-mail aberto e o histórico');
  assert.ok((await req('/sites/crm/contacts?q=joana', { cookie: admin })).text.includes('j***@e***.com'), 'lista com máscara e busca');
  assert.equal((await req('/sites/crm/contacts/999999', { cookie: admin })).status, 404);

  const cols = await db.all("SELECT * FROM stages WHERE site='crm' ORDER BY position");
  const form = { action: 'save' };
  for (const c of cols) Object.assign(form, { [`name_${c.id}`]: c.name, [`event_${c.id}`]: c.event_name || '', [`kind_${c.id}`]: c.kind, [`pos_${c.id}`]: String(c.position) });
  assert.equal((await req('/sites/crm/crm/stages', { cookie: admin, form: { ...form, [`event_${cols[1].id}`]: 'Agendou reunião' } })).location, '/sites/crm/crm/stages?erro=dados');
  assert.equal((await req('/sites/crm/crm/stages', { cookie: admin, form: { ...form, [`event_${cols[1].id}`]: 'Schedule' } })).location, '/sites/crm/crm/stages');
  assert.equal((await db.get('SELECT event_name FROM stages WHERE id=?', [cols[1].id])).event_name, 'Schedule');
  await req('/sites/crm/crm/stages', { cookie: admin, form: { action: 'add', name: 'Pós-venda' } });
  const pos = await db.get("SELECT id FROM stages WHERE site='crm' AND name='Pós-venda'");
  assert.equal((await req('/sites/crm/crm/stages', { cookie: admin, form: { action: 'delete', stage: pos.id } })).location, '/sites/crm/crm/stages');
  assert.equal((await req('/sites/crm/crm/stages', { cookie: admin, form: { action: 'delete', stage: j.stage_id } })).location, '/sites/crm/crm/stages?erro=ocupada');

  assert.equal((await req(`/sites/crm/contacts/${j.id}`, { cookie: admin, form: { action: 'erase', confirm: 'sim' } })).status, 400);
  assert.equal((await req(`/sites/crm/contacts/${j.id}`, { cookie: admin, form: { action: 'erase', confirm: 'EXCLUIR' } })).status, 303);
  assert.equal(await contact('joana@exemplo.com'), undefined);
  assert.equal((await db.get('SELECT COUNT(*) n FROM crm_log WHERE contact_id=?', [j.id])).n, 0);
  assert.ok((await db.all("SELECT action FROM audit_log WHERE site='crm'")).some(a => /excluído a pedido do titular/.test(a.action)));
  assert.ok((await db.all("SELECT action FROM audit_log WHERE site='crm'")).some(a => /ficha do contato \d+ aberta/.test(a.action)), 'abertura da ficha registrada');
  assert.equal((await hook('leads', { email: 'joana@exemplo.com' })).status, 400, 'titular excluído não volta pelo webhook');
  assert.equal(await contact('joana@exemplo.com'), undefined);
  assert.equal((await db.get("SELECT COUNT(*) n FROM events WHERE site='crm' AND rid=?", [RID])).n, 0, 'eventos desligados do titular');
});
