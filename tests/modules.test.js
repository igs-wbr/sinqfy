// Recursos liga/desliga e os cinco recursos novos: retenção de vídeo, públicos, recuperação, robô e checkout com Pix.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { boot, CHROME } from './helpers.js';

// Cloud API simulada: guarda cada envio e devolve um id de mensagem.
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.host === 'graph.facebook.com' && u.pathname.endsWith('/messages')) {
    const body = JSON.parse(opts.body);
    sent.push({ auth: opts.headers.authorization, phoneId: u.pathname.split('/')[2], body });
    if (body.to === '5511900000000') return new Response(JSON.stringify({ error: { message: 'Template name does not exist' } }), { status: 400 });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.T${sent.length}` }] }), { status: 200 });
  }
  return realFetch(url, opts);
};

const { req, login, close, base } = await boot();
const DB = await import('../src/db.js'), { db } = DB;
const W = await import('../src/sales/webhooks.js');
const R = await import('../src/recovery.js');
const C = await import('../src/checkout.js');
const WA = await import('../src/whatsapp.js');
after(close);

const admin = await login();
await req('/sites', { cookie: admin, form: { id: 'mod', name: 'Mod', timezone: 'America/Sao_Paulo', currency: 'BRL' } });
await req('/sites/mod/settings', { cookie: admin, form: { action: 'save', name: 'Mod', timezone: 'America/Sao_Paulo', currency: 'BRL', tax_rate: '0', domains: 'loja.dev' } });
await req('/sites/mod/integrations', { cookie: admin, form: { action: 'capi', pixel: '777010', capi_token: 'TOK' } });
const modules = (...on) => req('/sites/mod/settings', { cookie: admin, body: new URLSearchParams([['action', 'modules'], ...on.map(m => ['module', m])]).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const hook = (p, body) => fetch(`${base}/hooks/${W.hookToken(DB.sites.get('mod'), p)}/${p}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const beacon = body => fetch(base + '/e', { method: 'POST', body: JSON.stringify({ s: 'mod', ...body }), headers: { 'user-agent': CHROME } });
const sha = v => createHash('sha256').update(v).digest('hex');

test('recursos: padrão mantém CRM e WhatsApp; desligado some do menu e a rota responde 404', async () => {
  const home = await req('/sites/mod', { cookie: admin });
  assert.match(home.text, /\/sites\/mod\/crm"/);
  assert.doesNotMatch(home.text, /\/sites\/mod\/(recovery|checkout|audiences)"/, 'recursos novos vêm desligados');
  assert.equal((await req('/sites/mod/checkout', { cookie: admin })).status, 404);
  assert.equal((await modules('whatsapp', 'checkout')).status, 303);
  const after = await req('/sites/mod', { cookie: admin });
  assert.match(after.text, /\/sites\/mod\/checkout"/);
  assert.doesNotMatch(after.text, /\/sites\/mod\/crm"/, 'CRM desligado sai do menu');
  assert.equal((await req('/sites/mod/crm', { cookie: admin })).status, 404);
  assert.equal((await req('/sites/mod/checkout', { cookie: admin })).status, 200);
  // Recuperação marcada sem o WhatsApp: fica escolhida, mas não liga.
  await modules('recovery');
  assert.equal((await req('/sites/mod/recovery', { cookie: admin })).status, 404);
  assert.match((await req('/sites/mod/settings', { cookie: admin })).text, /value="recovery" checked/);
});

test('retenção de vídeo: ignorada com o recurso desligado; ligada, entra no funil e não vai para a Meta', async () => {
  await modules('crm', 'whatsapp');
  assert.equal((await beacon({ n: 'video_50', u: 'https://loja.dev/vsl', i: 'vid00000001', p: { video: 'vsl.mp4' } })).status, 202);
  assert.equal((await db.get("SELECT COUNT(*) n FROM events WHERE site='mod' AND name='video_50'")).n, 0);
  await modules('crm', 'whatsapp', 'video');
  await beacon({ u: 'https://loja.dev/vsl', i: 'vid00000002' });
  await beacon({ n: 'video_25', u: 'https://loja.dev/vsl', i: 'vid00000003', p: { video: 'vsl.mp4' } });
  await beacon({ n: 'video_50', u: 'https://loja.dev/vsl', i: 'vid00000004', p: { video: 'vsl.mp4' } });
  assert.equal((await db.get("SELECT COUNT(*) n FROM events WHERE site='mod' AND name LIKE 'video_%'")).n, 2);
  assert.equal((await db.get("SELECT COUNT(*) n FROM deliveries WHERE site='mod' AND name LIKE 'video_%'")).n, 0, 'retenção não vira evento na Meta');
  assert.equal((await db.get("SELECT COUNT(*) n FROM deliveries WHERE site='mod' AND event_id='vid00000002'")).n, 1, 'o pageview segue normal');
});

test('snippet: quartis do vídeo, cada um uma vez', async () => {
  const { readFileSync } = await import('node:fs'), vm = await import('node:vm');
  const beacons = [], on = {};
  vm.runInNewContext(readFileSync(new URL('../public/s.js', import.meta.url), 'utf8'), {
    document: { currentScript: { src: 'https://t.loja.dev/s.js', dataset: { site: 'mod' } }, referrer: '', cookie: '', addEventListener: (t, fn) => (on[t] = fn) },
    window: { addEventListener() {} }, location: { href: 'https://loja.dev/vsl', pathname: '/vsl', search: '', host: 'loja.dev', hostname: 'loja.dev' }, history: { pushState() {} },
    screen: { width: 1280 }, localStorage: {}, URL, URLSearchParams, JSON, navigator: { sendBeacon: (u, b) => beacons.push(JSON.parse(b)) },
  });
  const video = { duration: 100, currentSrc: 'https://cdn.loja.dev/aulas/vsl.mp4?token=x' };
  for (const t of [1, 10, 26, 30, 55, 51, 80, 100]) { video.currentTime = t; on.timeupdate({ target: video }); }
  assert.deepEqual(beacons.slice(1).map(b => [b.n, b.p.video]), [['video_25', 'vsl.mp4'], ['video_50', 'vsl.mp4'], ['video_75', 'vsl.mp4'], ['video_100', 'vsl.mp4']]);
});

test('recuperação: venda pendente vira contato e sequência no WhatsApp; para quando paga', async () => {
  await modules('crm', 'whatsapp', 'recovery', 'audiences');
  await req('/sites/mod/whatsapp', { cookie: admin, form: { action: 'cloud', waba_id: '1029384756', app_secret: 'APPSECRET', wa_phone_id: '1112223334', wa_token: 'EAAG-envio' } });
  assert.notEqual(DB.sites.get('mod').wa_token, 'EAAG-envio', 'o token fica cifrado no banco');
  assert.equal((await req('/sites/mod/recovery', { cookie: admin, form: { link: 'https://loja.dev/pagar', after0: '15', template0: 'pagamento_pendente', params0: 'nome, produto, link', text0: 'Oi {nome}, falta pagar {produto}', after1: '60', template1: '', text1: 'só texto' } })).status, 303);
  const t0 = Date.now();
  assert.equal((await hook('generic', { order_id: 'B-1', status: 'pending', amount: '197', product: 'Curso', email: 'ana@exemplo.com', phone: '(11) 98888-1111', name: 'Ana Souza' })).status, 200);
  const p = await db.get("SELECT * FROM pending_orders WHERE site='mod' AND order_id='B-1'");
  assert.equal(p.status, 'waiting');
  assert.ok(p.next_at >= t0 + 15 * 60e3 - 1000 && p.next_at <= Date.now() + 15 * 60e3);
  assert.deepEqual(await R.runRecovery(Date.now()), { sent: 0, skipped: 0, failed: 0 }, 'antes da hora nada sai');

  const out = await R.runRecovery(p.next_at + 1000);
  assert.equal(out.sent, 1);
  const [m] = sent.splice(0);
  assert.equal(m.auth, 'Bearer EAAG-envio');
  assert.equal(m.phoneId, '1112223334');
  assert.equal(m.body.to, '5511988881111');
  assert.equal(m.body.template.name, 'pagamento_pendente', 'sem conversa nas últimas 24 h, só modelo aprovado');
  assert.deepEqual(m.body.template.components[0].parameters.map(x => x.text), ['Ana', 'Curso', 'https://loja.dev/pagar']);
  const again = await db.get('SELECT * FROM pending_orders WHERE id=?', [p.id]);
  assert.deepEqual([again.status, again.step], ['waiting', 1]);
  // Passo 2 só tem texto livre e a pessoa não escreveu: pula e encerra a sequência.
  assert.equal((await R.runRecovery(again.next_at + 1000)).skipped, 1);
  assert.equal(sent.length, 0);
  assert.equal((await db.get('SELECT status FROM pending_orders WHERE id=?', [p.id])).status, 'done');

  // Outro pedido: o pagamento chega antes da mensagem e ela não sai.
  await hook('generic', { order_id: 'B-2', status: 'pending', amount: '97', product: 'Curso', phone: '11977776666' });
  await hook('generic', { order_id: 'B-2', status: 'paid', amount: '97', product: 'Curso', phone: '11977776666' });
  assert.equal((await db.get("SELECT status FROM pending_orders WHERE order_id='B-2'")).status, 'paid');
  assert.equal((await R.runRecovery(Date.now() + 2 * 3600e3)).sent, 0);
  // Modelo inexistente: erro definitivo, a sequência para e o erro aparece na tela.
  await hook('generic', { order_id: 'B-3', status: 'pending', amount: '97', phone: '11900000000' });
  assert.equal((await R.runRecovery(Date.now() + 20 * 60e3)).failed, 1);
  const bad = await db.get("SELECT * FROM pending_orders WHERE order_id='B-3'");
  assert.deepEqual([bad.status, bad.last_error], ['failed', 'Template name does not exist']);
  assert.match((await req('/sites/mod/recovery', { cookie: admin })).text, /Template name does not exist/);
  sent.splice(0);
});

test('públicos: CSV só com SHA-256, compradores e quem não pagou', async () => {
  const page = await req('/sites/mod/audiences', { cookie: admin });
  assert.equal(page.status, 200);
  const csv = await req('/sites/mod/audiences/abandoned.csv', { cookie: admin });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /attachment; filename="mod-abandoned.csv"/);
  const lines = csv.text.trim().split('\n');
  assert.equal(lines[0], 'email,phone,fn');
  assert.ok(lines.includes(`"${sha('ana@exemplo.com')}","${sha('5511988881111')}","${sha('ana')}"`), 'Ana gerou o boleto e não pagou');
  assert.doesNotMatch(csv.text, /ana@|98888|5511977776666/, 'nada aberto; quem pagou (B-2) não está');
  const buyers = await req('/sites/mod/audiences/buyers.csv', { cookie: admin });
  assert.ok(buyers.text.includes(sha('5511977776666')));
  assert.ok(await db.get("SELECT 1 FROM audit_log WHERE site='mod' AND action LIKE 'público exportado%'"), 'download registrado');
  assert.equal((await req('/sites/mod/audiences/stage-999999.csv', { cookie: admin })).status, 404);
});

test('robô: palavra-chave responde por texto; a resposta da pessoa para a recuperação', async () => {
  await modules('crm', 'whatsapp', 'recovery', 'bot');
  await req('/sites/mod/whatsapp', { cookie: admin, form: { action: 'bot', rules: 'preço, quanto custa = O investimento é R$ 197\nlixo sem igual\nacesso = Chega no e-mail' } });
  assert.deepEqual(WA.rulesOf(DB.sites.get('mod')).map(r => r.words), [['preço', 'quanto custa'], ['acesso']]);
  assert.equal(WA.matchRule(WA.rulesOf(DB.sites.get('mod')), 'QUANTO CUSTA?')?.reply, 'O investimento é R$ 197');
  assert.equal(WA.matchRule(WA.rulesOf(DB.sites.get('mod')), 'precisamos conversar'), null, 'palavra inteira, não pedaço');
  await hook('generic', { order_id: 'B-4', status: 'pending', amount: '97', phone: '11955554444' });
  const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1029384756', changes: [{ field: 'messages', value: { contacts: [{ wa_id: '5511955554444', profile: { name: 'Bia' } }],
    messages: [{ from: '5511955554444', id: 'wamid.IN1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Qual o preço?' } }] } }] }] });
  const res = await fetch(`${base}/hooks/${W.hookToken(DB.sites.get('mod'), 'whatsapp')}/whatsapp`, { method: 'POST', body: raw,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'APPSECRET').update(raw).digest('hex') } });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].body.type, sent[0].body.text.body, sent[0].body.to], ['text', 'O investimento é R$ 197', '5511955554444']);
  assert.equal((await db.get("SELECT status FROM pending_orders WHERE order_id='B-4'")).status, 'stopped', 'respondeu: recuperação parada');
  assert.equal((await db.get("SELECT COUNT(*) n FROM messages m JOIN contacts c ON c.id=m.contact_id WHERE c.site='mod' AND m.dir='out' AND m.wa_msg_id=?", [`wamid.T${sent.length}`])).n, 1, 'resposta guardada na conversa');
  sent.splice(0);
});

test('checkout com Pix: BR Code do Banco Central, preço do painel, pago leva a compra à Meta', async () => {
  assert.equal(C.brCode({ key: '123e4567-e12b-12d1-a456-426655440000', name: 'Fulano de Tal', city: 'BRASILIA' }),
    '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');
  assert.deepEqual([C.pixKey('123.456.789-01'), C.pixKey('+55 (11) 99999-0000'), C.pixKey('11999990000'), C.pixKey('x')], ['12345678901', '+5511999990000', '11999990000', null], 'só dígitos com 11 é CPF; telefone precisa do +55');
  await modules('crm', 'whatsapp', 'checkout');
  assert.equal((await req('/sites/mod/checkout', { cookie: admin, form: { action: 'product', name: 'Mentoria', price: '297,00', pix_key: 'pix@loja.dev', pix_name: 'Loja Ação', pix_city: 'São Paulo' } })).status, 303);
  const prod = await db.get("SELECT * FROM products WHERE site='mod'");
  assert.deepEqual([prod.price, prod.pix_name, prod.pix_city], [297, 'Loja Acao', 'Sao Paulo']);
  const page = await req(`/p/${prod.slug}?utm_source=fb&utm_campaign=Lanc%7C99&rid=CheckoutVisitante00001`);
  assert.equal(page.status, 200);
  assert.match(page.text, /value="CheckoutVisitante00001"/);
  assert.equal((await req(`/p/${prod.slug}`, { form: { name: 'Caio', email: 'x' } })).status, 400);
  const res = await req(`/p/${prod.slug}`, { form: { name: 'Caio Lima', email: 'caio@exemplo.com', phone: '(21) 97777-0000', price: '1', utm_source: 'fb', utm_campaign: 'Lanc|99' } });
  assert.equal(res.status, 303);
  const order = res.location.split('/').pop();
  const sale = await db.get("SELECT * FROM sales WHERE site='mod' AND platform='pix' AND order_id=?", [order]);
  assert.deepEqual([sale.status, sale.gross, sale.utm_campaign, sale.campaign_key], ['pending', 297, 'Lanc|99', '99'], 'preço do painel, não do formulário');
  const pay = await req(res.location);
  const code = /id="pix" value="([^"]+)"/.exec(pay.text)[1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
  assert.equal(code.slice(-4), C.crc16(code.slice(0, -4)), 'CRC confere');
  assert.ok(code.includes('5406297.00') && code.includes(`05${String(order.length).padStart(2, '0')}${order}`), 'valor e id do pedido no Pix');
  assert.match(pay.text, /<svg[^>]*viewBox/);
  assert.match(pay.text, /http-equiv="refresh"/);
  assert.equal((await req(`/p/${prod.slug}/PXAAAAAAAAAA`)).status, 404);
  // Confirmação pelo painel: Purchase com o e-mail do pedido em hash; contato em Ganhou.
  assert.equal((await req('/sites/mod/checkout', { cookie: admin, form: { action: 'paid', order } })).status, 303);
  assert.equal((await db.get("SELECT status FROM sales WHERE order_id=?", [order])).status, 'paid');
  const d = await db.get("SELECT payload FROM deliveries WHERE site='mod' AND event_id=?", [`pix-${order}`]);
  const ev = JSON.parse(d.payload);
  assert.deepEqual([ev.event_name, ev.custom_data.value, ev.user_data.em[0]], ['Purchase', 297, sha('caio@exemplo.com')]);
  assert.match((await req(res.location)).text, /Pagamento confirmado/);
  // Confirmação pelo webhook do banco no formato do genérico.
  const r2 = await req(`/p/${prod.slug}`, { form: { name: 'Davi', email: 'davi@exemplo.com', phone: '21966660000' } });
  const o2 = r2.location.split('/').pop();
  assert.equal((await hook('pix', { order_id: o2, status: 'paid' })).status, 200);
  const s2 = await db.get('SELECT status, gross FROM sales WHERE order_id=?', [o2]);
  assert.deepEqual([s2.status, s2.gross], ['paid', 297]);
  assert.ok(await db.get("SELECT 1 FROM deliveries WHERE site='mod' AND event_id=?", [`pix-${o2}`]));
  // Produto desligado sai do ar.
  await req('/sites/mod/checkout', { cookie: admin, form: { action: 'toggle', product: String(prod.id) } });
  assert.equal((await req(`/p/${prod.slug}`)).status, 404);
});
