// Dados de DEMONSTRAÇÃO para ver as telas preenchidas (nada aqui é real). Uso, com o painel no ar:
//   node deploy/seed-demo.mjs http://127.0.0.1:8090 deploy/.env.local
// Cria o site "demo" (Loja Demonstração): 14 dias de visitas, gastos e campanhas, vendas pelo webhook,
// leads no CRM e conversas de WhatsApp pela Cloud API (assinadas). Rodar de novo cria outro site (demo2, demo3...).
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import pg from 'pg';

const [BASE = 'http://127.0.0.1:8090', ENV = 'deploy/.env.local'] = process.argv.slice(2);
const env = Object.fromEntries(readFileSync(ENV, 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const db = new pg.Client({ connectionString: process.env.SEED_DATABASE_URL || 'postgres://rastro:rastro@127.0.0.1:55432/rastro' });
await db.connect();
const q = (sql, args) => db.query(sql, args);

let cookie = '';
async function http(path, form, extra = {}) {
  const res = await fetch(BASE + path, { method: form ? 'POST' : 'GET', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...extra.headers }, body: form && new URLSearchParams(form) });
  const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  return res;
}
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const rid = () => randomBytes(16).toString('base64url');
const hookToken = (wt, p) => createHash('sha256').update(`${wt}:${p}`).digest('base64url').slice(0, 32);

// 1. login e site
await http('/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
let id = 'demo';
for (let i = 2; (await q('SELECT 1 FROM sites WHERE id=$1 UNION ALL SELECT 1 FROM deleted_sites WHERE id=$1', [id])).rowCount; i++) id = `demo${i}`;
await http('/sites', { id, name: 'Loja Demonstração', timezone: 'America/Sao_Paulo', currency: 'BRL' });
await http(`/sites/${id}/settings`, { action: 'save', name: 'Loja Demonstração', timezone: 'America/Sao_Paulo', currency: 'BRL', tax_rate: '6', domains: 'lojademo.com.br' });
const { webhook_token: wt } = (await q('SELECT webhook_token FROM sites WHERE id=$1', [id])).rows[0];
console.log('site', id);

// 2. campanhas e gastos (14 dias)
const CAMPS = [
  { c: ['120201', 'Black Friday | Vendas'], s: ['120211', 'Público quente'], ads: [['120221', 'AD01 Vídeo depoimento'], ['120222', 'AD02 Carrossel ofertas']] },
  { c: ['120202', 'Remarketing 7d'], s: ['120212', 'Visitou checkout'], ads: [['120223', 'AD03 Escassez']] },
  { c: ['120203', 'Topo | Conteúdo'], s: ['120213', 'Lookalike 1%'], ads: [['120224', 'AD04 Reels bastidores'], ['120225', 'AD05 Estático prova']] },
];
const day = n => { const d = new Date(Date.now() - n * 864e5); return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); };
for (const k of CAMPS) {
  await q("INSERT INTO ad_entities VALUES ($1,'meta','campaign',$2,$3,'', 'ACTIVE', 300) ON CONFLICT DO NOTHING", [id, ...k.c]);
  await q("INSERT INTO ad_entities VALUES ($1,'meta','adset',$2,$3,$4,'ACTIVE', 150) ON CONFLICT DO NOTHING", [id, ...k.s, k.c[0]]);
  for (const a of k.ads) await q("INSERT INTO ad_entities VALUES ($1,'meta','ad',$2,$3,$4,'ACTIVE', NULL) ON CONFLICT DO NOTHING", [id, ...a, k.s[0]]);
}
for (let n = 0; n < 14; n++) for (const k of CAMPS) for (const a of k.ads) {
  const spend = rnd(40, 160) + Math.random(), imp = rnd(3000, 12000);
  await q(`INSERT INTO ad_spend(site, platform, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, impressions, clicks, meta_purchases, meta_purchase_value, meta_leads)
    VALUES ($1,'meta',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
  [id, day(n), k.c[0], k.c[1], k.s[0], k.s[1], a[0], a[1], spend.toFixed(2), imp, Math.round(imp * (0.008 + Math.random() * 0.012)), rnd(0, 2), rnd(0, 2) * 297, rnd(1, 6)]);
}

// 3. visitas (14 dias), direto no banco para ter histórico
const PAGES = ['/', '/oferta', '/depoimentos', '/checkout', '/obrigado', '/blog/como-comecar'];
const SRC = [['FB', 'Social pago', 0.45], ['google', 'Busca orgânica', 0.2], ['instagram', 'Social', 0.15], ['', 'Direto', 0.15], ['newsletter', 'E-mail', 0.05]];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const rids = [];
for (let n = 13; n >= 0; n--) {
  const visits = rnd(70, 160) + (13 - n) * 4;
  for (let v = 0; v < visits; v++) {
    let r = Math.random(), src = SRC[0];
    for (const s of SRC) { if ((r -= s[2]) <= 0) { src = s; break; } }
    const k = pick(CAMPS), ad = pick(k.ads), paid = src[0] === 'FB', visitor = rid(), session = randomBytes(8).toString('hex');
    const start = Date.now() - n * 864e5 - rnd(0, 20) * 3600e3 - rnd(0, 3599) * 1000;
    if (start > Date.now()) continue;
    const pages = rnd(1, 4), screen = pick(['mobile', 'mobile', 'mobile', 'laptop', 'desktop', 'tablet']);
    for (let p = 0; p < pages; p++) {
      const ts = start + p * rnd(20, 180) * 1000, path = p === 0 ? pick(['/', '/oferta', '/blog/como-comecar']) : pick(PAGES);
      await q(`INSERT INTO events(site,date,ts,visitor,session,name,path,referrer,channel,utm_source,utm_medium,utm_campaign,utm_content,utm_term,screen,browser,os,country,rid,event_id,fbc,fbp,ua,host)
        VALUES ($1,$2,$3,$4,$5,'pageview',$6,$7,$8,$9,$10,$11,$12,'',$13,$14,$15,'BR',$4,$16,$17,$18,$19,'lojademo.com.br')`,
      [id, day(n), ts, visitor, session, path, paid ? 'l.facebook.com' : src[0] === 'google' ? 'google.com' : src[0] === 'instagram' ? 'instagram.com' : '', src[1], src[0],
        paid ? `${k.s[1]}|${k.s[0]}` : '', paid ? `${k.c[1]}|${k.c[0]}` : '', paid ? `${ad[1]}|${ad[0]}` : '', screen, screen === 'mobile' ? 'Safari' : 'Chrome', screen === 'mobile' ? 'iOS' : 'Windows',
        `evt_${randomBytes(6).toString('hex')}`, paid ? `fb.1.${start}.IwAR${randomBytes(6).toString('hex')}` : null, `fb.1.${start}.${rnd(1e9, 9e9)}`, UA]);
      if (path === '/checkout' && Math.random() < 0.6) await q(`INSERT INTO events(site,date,ts,visitor,session,name,path,channel,utm_source,utm_campaign,screen,country,rid,event_id) VALUES ($1,$2,$3,$4,$5,'InitiateCheckout','/checkout',$6,$7,$8,$9,'BR',$4,$10)`,
        [id, day(n), ts + 5000, visitor, session, src[1], src[0], paid ? `${k.c[1]}|${k.c[0]}` : '', screen, `evt_${randomBytes(6).toString('hex')}`]);
    }
    if (paid) rids.push({ rid: visitor, k, ad, n });
  }
}
console.log('visitas ok');

// 4. vendas pelo webhook genérico (casadas pelo clique em parte)
const NOMES = ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Alves', 'Elisa Rocha', 'Fábio Nunes', 'Gabriela Reis', 'Henrique Melo', 'Isabela Costa', 'João Pedro', 'Karina Lopes', 'Lucas Martins', 'Marina Freitas', 'Nicolas Prado', 'Olívia Teles', 'Paulo Ramos', 'Quésia Moura', 'Rafael Gomes', 'Sabrina Luz', 'Tiago Ferraz'];
for (let i = 0; i < 46; i++) {
  const c = pick(rids), n = c.n, name = pick(NOMES), viaRid = Math.random() < 0.6;
  const created = new Date(Date.now() - n * 864e5 - rnd(0, 10) * 3600e3).toISOString();
  await fetch(`${BASE}/hooks/${hookToken(wt, 'generic')}/generic`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    order_id: `DEMO-${1000 + i}`, status: pick(['paid', 'paid', 'paid', 'paid', 'paid', 'pending', 'refunded']), method: pick(['pix', 'pix', 'card', 'card', 'boleto']),
    amount: pick([197, 297, 297, 497, 97]), currency: 'BRL', product: pick(['Curso Completo', 'Mentoria em Grupo', 'Ebook Inicial']), created_at: created,
    email: `${name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.')}${i}@exemplo.com`,
    ...(viaRid ? { rid: c.rid } : { utm_source: 'FB', utm_campaign: `${c.k.c[1]}|${c.k.c[0]}`, utm_medium: `${c.k.s[1]}|${c.k.s[0]}`, utm_content: `${c.ad[1]}|${c.ad[0]}` }) }) });
}
console.log('vendas ok');

// 5. leads no CRM e movimento no quadro
for (let i = 0; i < 22; i++) {
  const name = NOMES[i % NOMES.length], k = pick(CAMPS);
  await fetch(`${BASE}/hooks/${hookToken(wt, 'leads')}/leads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    name, email: `lead.${i}@exemplo.com`, phone: `119${rnd(10000000, 99999999)}`, utm_source: 'FB', utm_campaign: `${k.c[1]}|${k.c[0]}`, utm_medium: `${k.s[1]}|${k.s[0]}`, value: pick([0, 297, 497, 1497]) }) });
}
await http(`/sites/${id}/crm`);
const stages = (await q('SELECT id, name FROM stages WHERE site=$1 ORDER BY position', [id])).rows;
const contacts = (await q('SELECT id FROM contacts WHERE site=$1 ORDER BY id', [id])).rows;
contacts.forEach((c, i) => { c.target = stages[[0, 0, 1, 1, 1, 2, 2, 3, 4, 5][i % 10]]; });
for (const c of contacts) if (c.target.id !== stages[0].id) await http(`/sites/${id}/crm/move`, { contact: c.id, stage: c.target.id });
console.log('crm ok');

// 6. WhatsApp: link, Cloud API e conversas assinadas
await http(`/sites/${id}/whatsapp`, { action: 'link', name: 'Botão da página de vendas', phone: '11999990000', message: 'Olá, quero saber mais' });
await http(`/sites/${id}/whatsapp`, { action: 'cloud', waba_id: '102938475600', app_secret: 'segredo-demo' });
const convo = [
  ['5511988880001', 'Marcos Vieira', ['Oi, vi o anúncio do curso', 'Quanto custa? Dá pra parcelar no cartão?'], true],
  ['5511988880002', 'Patrícia Gomes', ['Boa tarde! Ainda tem vaga na mentoria?'], false],
  ['5511988880003', 'Rodrigo Santos', ['Paguei o pix agora, segue o comprovante'], false],
  ['5511988880004', 'Juliana Prado', ['Não tenho mais interesse, obrigada'], false],
  ['5511988880005', 'Felipe Araújo', ['Olá, quero saber mais sobre o curso completo'], true],
];
let mid = 0;
for (const [from, name, texts, ad] of convo) for (const text of texts) {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '102938475600', changes: [{ field: 'messages', value: { contacts: [{ wa_id: from, profile: { name } }],
    messages: [{ from, id: `wamid.demo.${++mid}.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000) - rnd(60, 7200)), type: 'text', text: { body: text },
      ...(ad && { referral: { source_type: 'ad', source_id: '120221', headline: 'Black Friday', ctwa_clid: `ARAk${randomBytes(20).toString('base64url')}` } }) }] } }] }] });
  await fetch(`${BASE}/hooks/${hookToken(wt, 'whatsapp')}/whatsapp`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'segredo-demo').update(body).digest('hex') } });
}
console.log('whatsapp ok');
await db.end();
console.log(`pronto: ${BASE}/sites/${id}`);
