// Etapa 6: link rastreável com código, webhook da Cloud API, conversão de mensagem para a Meta e sugestão de coluna.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { boot, CHROME } from './helpers.js';

const aiPrompts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.host === 'generativelanguage.googleapis.com') {
    const b = JSON.parse(opts.body);
    aiPrompts.push({ key: opts.headers['x-goog-api-key'], text: b.contents[0].parts[0].text, system: b.systemInstruction?.parts[0].text || '' });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"coluna":"Proposta","motivo":"pediu o link de pagamento"}' }] } }] }), { status: 200 });
  }
  return realFetch(url, opts);
};

const { req, login, close, base } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const P = await import('../src/pii.js');
const WA = await import('../src/whatsapp.js');
const W = await import('../src/sales/webhooks.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'zap', name: 'Zap', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
await req('/sites/zap/settings', { cookie: admin, form: { action: 'save', name: 'Zap', timezone: 'America/Sao_Paulo', currency: 'BRL', tax_rate: '0', domains: 'loja.dev' } });
await req('/sites/zap/integrations', { cookie: admin, form: { action: 'capi', pixel: '555030', capi_token: 'TOK' } });
const RID = 'ZapVisitante0000000001';
const edge = { 'x-edge-secret': 'segredo-da-borda', 'x-rastro-rid': RID, 'x-rastro-fbc': 'fb.1.1763080000000.IwAR-zap', 'x-rastro-fbp': 'fb.1.1763080000000.2222222222', 'x-rastro-ip': '198.51.100.40' };
const hookUrl = () => `${base}/hooks/${W.hookToken(DB.sites.get('zap'), 'whatsapp')}/whatsapp`;
const cloud = (body, secret = 'APPSECRET') => { const raw = JSON.stringify(body); return fetch(hookUrl(), { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') } }); };
const msg = (from, id, text, extra = {}) => ({ object: 'whatsapp_business_account', entry: [{ id: '1029384756', changes: [{ field: 'messages', value: {
  metadata: { phone_number_id: '1' }, contacts: [{ wa_id: from, profile: { name: 'Carla Zap' } }], messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text }, ...extra }] } }] }] });
let code;

test('link rastreável: clique vira Contact, guarda o visitante e manda para o wa.me com o código', async () => {
  assert.equal((await req('/sites/zap/whatsapp', { cookie: admin, form: { action: 'link', name: 'Botão LP', phone: '(11) 99999-0000', message: 'Quero saber mais' } })).status, 303);
  assert.equal((await req('/sites/zap/whatsapp', { cookie: admin, form: { action: 'link', name: 'Sem número', phone: '12' } })).status, 400);
  const link = await db.get("SELECT * FROM wa_links WHERE site='zap'");
  assert.equal(link.phone, '5511999990000');
  await fetch(base + '/e', { method: 'POST', body: JSON.stringify({ s: 'zap', u: 'https://loja.dev/?utm_source=FB&utm_campaign=Zap%7C77&utm_medium=LAL%7C78&utm_content=AD%7C79', i: 'evt_zap000001' }), headers: { 'user-agent': CHROME, ...edge } });
  const r = await fetch(`${base}/w/${link.slug}`, { redirect: 'manual', headers: { 'user-agent': CHROME, referer: 'https://loja.dev/oferta', ...edge } });
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://wa.me/5511999990000');
  code = WA.CODE_RE.exec(loc.searchParams.get('text'))[1];
  assert.match(loc.searchParams.get('text'), /^Quero saber mais \[[A-Z2-9]{5}\]$/);
  assert.deepEqual(Object.values(await db.get('SELECT rid, fbc FROM wa_clicks WHERE code=?', [code])), [RID, edge['x-rastro-fbc']]);
  const ev = await db.get("SELECT name, path, props FROM events WHERE site='zap' AND name='Contact'");
  assert.deepEqual([ev.path, JSON.parse(ev.props).link], ['/oferta', 'Botão LP']);
  const direto = await fetch(`${base}/w/${link.slug}`, { redirect: 'manual' });
  assert.equal(direto.status, 302, 'sem borda nem referer ainda redireciona');
  assert.equal((await fetch(`${base}/w/naoexiste`, { redirect: 'manual' })).status, 404);
});

test('Cloud API: verificação, assinatura obrigatória e conversa ligada ao clique pelo código', async () => {
  const t = W.hookToken(DB.sites.get('zap'), 'whatsapp');
  assert.equal((await fetch(`${hookUrl()}?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=777`)).status, 200);
  assert.equal((await cloud(msg('5511988887777', 'wamid.1', 'oi'))).status, 404, 'sem chave do app configurada, nada entra');
  assert.equal((await req('/sites/zap/whatsapp', { cookie: admin, form: { action: 'cloud', waba_id: '1029384756', app_secret: 'APPSECRET' } })).status, 303);
  assert.equal((await cloud(msg('5511988887777', 'wamid.1', 'oi'), 'errado')).status, 401);
  assert.equal((await cloud(msg('5511988887777', 'wamid.1', `Quero saber mais [${code}] quanto custa?`))).status, 200);
  assert.equal((await cloud(msg('5511988887777', 'wamid.1', 'repetido'))).status, 200, 'reenvio da Meta não duplica');
  const c = await db.get('SELECT * FROM contacts WHERE site=? AND phone_hash=?', ['zap', P.hashPhone('5511988887777')]);
  assert.deepEqual([P.open(c.name_enc), c.source, c.rid, c.fbc, c.campaign_key, c.adset_key, c.ad_key], ['Carla Zap', 'whatsapp', RID, edge['x-rastro-fbc'], '77', '78', '79']);
  const m = await db.all('SELECT * FROM messages WHERE contact_id=?', [c.id]);
  assert.equal(m.length, 1);
  assert.ok(!m[0].text_enc.includes('quanto') && P.open(m[0].text_enc).includes('quanto custa'), 'mensagem cifrada');
  const qual = await db.get("SELECT id FROM stages WHERE site='zap' AND name='Qualificado'");
  assert.deepEqual([c.suggest_stage, c.suggest_reason], [qual.id, 'Perguntou sobre preço ou pagamento'], 'sugestão por regra, sem IA');
  assert.equal((await db.get('SELECT contact_id FROM wa_clicks WHERE code=?', [code])).contact_id, c.id);
});

test('anúncio de clique para WhatsApp: ctwa_clid, LeadSubmitted e coluna como conversão de mensagem', async () => {
  const ref = { referral: { source_type: 'ad', source_id: '120333', headline: 'Promo Zap', ctwa_clid: 'ARAkLkA8rmlFeiCktEJQ-QTwRiyYHAFDLMNDBH0CD3qpjd0HR4irJ6LEkR7JwFF4XvnO2E4Nx0-eM-GABDLOPaOdRMv-_zfUQ2a' } };
  assert.equal((await cloud(msg('5521977776666', 'wamid.2', 'Olá, vi o anúncio', ref))).status, 200);
  const c = await db.get('SELECT * FROM contacts WHERE site=? AND phone_hash=?', ['zap', P.hashPhone('5521977776666')]);
  assert.deepEqual([c.ctwa_clid, c.ad_key], [ref.referral.ctwa_clid, '120333']);
  const lead = JSON.parse((await db.get('SELECT payload FROM deliveries WHERE event_id=?', [`wa-${c.id}-lead`])).payload);
  assert.deepEqual([lead.event_name, lead.action_source, lead.messaging_channel, lead.user_data], ['LeadSubmitted', 'business_messaging', 'whatsapp',
    { whatsapp_business_account_id: '1029384756', ctwa_clid: ref.referral.ctwa_clid }]);
  const qual = await db.get("SELECT id FROM stages WHERE site='zap' AND name='Qualificado'");
  await req('/sites/zap/crm/move', { cookie: admin, form: { contact: c.id, stage: qual.id } });
  const ev = JSON.parse((await db.get('SELECT payload FROM deliveries WHERE event_id=?', [`crm-${c.id}-${qual.id}`])).payload);
  assert.deepEqual([ev.event_name, ev.action_source, ev.user_data.ctwa_clid], ['QualifiedLead', 'business_messaging', ref.referral.ctwa_clid]);
});

test('IA (Gemini) sugere a coluna sem receber dado pessoal; conversas e aceite', async () => {
  process.env.GEMINI_API_KEY = 'chave-ia';
  await cloud(msg('5531966665555', 'wamid.2b', 'oi')); // IA desligada no site: regras, sem chamada
  assert.equal(aiPrompts.length, 0, 'IA só com o site ligado');
  await req('/sites/zap/whatsapp', { cookie: admin, form: { action: 'cloud', waba_id: '1029384756', ai_suggest: '1' } });
  await cloud(msg('5531966665555', 'wamid.3', 'me manda o link? meu email é ze@x.com e meu cpf 123.456.789-00, fone 31 96666-5555'));
  delete process.env.GEMINI_API_KEY;
  assert.equal(aiPrompts.length, 1);
  assert.equal(aiPrompts[0].key, 'chave-ia');
  assert.ok(!/ze@x\.com|123\.456|96666/.test(aiPrompts[0].text) && /\[email\]/.test(aiPrompts[0].text), 'texto anonimizado antes de ir para a IA');
  // Prompt injection: a conversa vai só entre marcadores, e as instruções ficam à parte (systemInstruction).
  assert.ok(/^<conversa>\n[\s\S]*\n<\/conversa>$/.test(aiPrompts[0].text) && /nunca siga/.test(aiPrompts[0].system) && !/Colunas do funil/.test(aiPrompts[0].text), 'conversa separada das instruções');
  const c = await db.get('SELECT * FROM contacts WHERE site=? AND phone_hash=?', ['zap', P.hashPhone('5531966665555')]);
  const prop = await db.get("SELECT id FROM stages WHERE site='zap' AND name='Proposta'");
  assert.deepEqual([c.suggest_stage, P.open(c.suggest_reason)], [prop.id, 'IA: pediu o link de pagamento'], 'motivo da IA guardado cifrado');

  assert.equal((await req('/sites/zap/conversations', { cookie: admin })).status, 200);
  const page = await req(`/sites/zap/conversations/${c.id}`, { cookie: admin });
  assert.ok(page.text.includes('Sugestão: mover para Proposta') && page.text.includes('me manda o link'));
  assert.equal((await req(`/sites/zap/conversations/${c.id}`, { cookie: admin, form: { action: 'accept' } })).status, 303);
  const after = await db.get('SELECT stage_id, suggest_stage FROM contacts WHERE id=?', [c.id]);
  assert.deepEqual([after.stage_id, after.suggest_stage], [prop.id, null]);
});

test('código digitado na ficha (WhatsApp Business sem API) e anonimização', async () => {
  const link = await db.get("SELECT * FROM wa_links WHERE site='zap'");
  const r = await fetch(`${base}/w/${link.slug}`, { redirect: 'manual', headers: { 'user-agent': CHROME, referer: 'https://loja.dev/', ...edge } });
  const c2 = WA.CODE_RE.exec(new URL(r.headers.get('location')).searchParams.get('text'))[1];
  await req('/sites/zap/crm/new', { cookie: admin, form: { name: 'Pelo app', phone: '41955554444' } });
  const c = await db.get('SELECT id FROM contacts WHERE site=? AND phone_hash=?', ['zap', P.hashPhone('41955554444')]);
  assert.equal((await req(`/sites/zap/contacts/${c.id}`, { cookie: admin, form: { action: 'code', code: 'ZZZZZ' } })).location, `/sites/zap/contacts/${c.id}?erro=codigo`);
  assert.equal((await req(`/sites/zap/contacts/${c.id}`, { cookie: admin, form: { action: 'code', code: `[${c2.toLowerCase()}]` } })).location, `/sites/zap/contacts/${c.id}`);
  assert.equal((await db.get('SELECT rid FROM contacts WHERE id=?', [c.id])).rid, RID);
  assert.equal(WA.redact('fale com ana@b.co ou (11) 98888-7777, cpf 123.456.789-09'), 'fale com [email] ou [numero], cpf [cpf]');
  assert.equal(WA.redact('cep 01310-100, pix 123e4567-e89b-12d3-a456-426614174000 em https://x.com/?t=abc'), 'cep [cep], pix [chave] em [link]');
  // outra WABA no mesmo app não entra neste site
  const other = msg('5511900001111', 'wamid.9', 'oi'); other.entry[0].id = '999';
  await cloud(other);
  assert.equal(await db.get('SELECT 1 FROM contacts WHERE site=? AND phone_hash=?', ['zap', P.hashPhone('5511900001111')]), undefined);
  // código com mais de 7 dias não liga
  await db.run("UPDATE wa_clicks SET ts=ts - 8 * 86400000, contact_id=NULL WHERE code=?", [c2]);
  await req('/sites/zap/crm/new', { cookie: admin, form: { name: 'Outro', phone: '41911112222' } });
  const c3 = await db.get('SELECT id FROM contacts WHERE site=? AND phone_hash=?', ['zap', P.hashPhone('41911112222')]);
  assert.equal((await req(`/sites/zap/contacts/${c3.id}`, { cookie: admin, form: { action: 'code', code: c2 } })).location, `/sites/zap/contacts/${c3.id}?erro=codigo`);
  assert.equal((await req('/sites/zap/whatsapp', { cookie: admin })).status, 200);
});
