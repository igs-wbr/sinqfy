// Etapa 5: CRM. Um contato = um card no quadro (coluna = etapa). Entrar numa coluna pode disparar um evento
// offline para a Meta (Conversions API, action_source system_generated), com e-mail e telefone só em hash.
import { db } from './db.js';
import { seal, open, normEmail, normPhone, hashEmail, hashPhone, metaEmail, metaPhone, sha, piiReady } from './pii.js';
import { enqueue, metaReady } from './dispatch.js';

export const DEFAULT_STAGES = [
  ['Novo', null, 'open'], ['Em conversa', null, 'open'], ['Qualificado', 'QualifiedLead', 'open'],
  ['Proposta', null, 'open'], ['Ganhou', 'Purchase', 'won'], ['Perdeu', null, 'lost'],
];
export const SOURCES = { site: 'Formulário do site', webhook: 'Webhook de leads', meta_lead: 'Lead Ads da Meta', manual: 'Cadastro manual', venda: 'Compra', whatsapp: 'WhatsApp', checkout: 'Pedido pendente' };

export async function stages(site) {
  let rows = await db.all('SELECT * FROM stages WHERE site=? ORDER BY position, id', [site]);
  if (!rows.length) {
    await db.batch(DEFAULT_STAGES.map(([name, ev, kind], i) => ['INSERT INTO stages(site, name, position, event_name, kind) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING', [site, name, i, ev, kind]]));
    rows = await db.all('SELECT * FROM stages WHERE site=? ORDER BY position, id', [site]);
  }
  return rows;
}

export const log = (site, contact, text, now = Date.now()) => db.run('INSERT INTO crm_log(site, contact_id, ts, text) VALUES (?,?,?,?)', [site, contact, now, String(text).slice(0, 300)]);

/** Contato com os dados abertos (só para a ficha e o quadro; nunca para log nem IA). */
export function reveal(c) {
  return c && { ...c, name: open(c.name_enc), email: open(c.email_enc), phone: open(c.phone_enc), ...(String(c.suggest_reason || '').startsWith('v1.') && { suggest_reason: open(c.suggest_reason) }) };
}

export async function findContact(site, { emailHash, phoneHash, leadId }) {
  if (!emailHash && !phoneHash && !leadId) return null;
  return db.get(`SELECT * FROM contacts WHERE site=? AND ((?::text IS NOT NULL AND email_hash=?) OR (?::text IS NOT NULL AND phone_hash=?) OR (?::text IS NOT NULL AND lead_id=?))
    ORDER BY id LIMIT 1`, [site, emailHash, emailHash, phoneHash, phoneHash, leadId, leadId]);
}

/**
 * Cria ou completa um contato. Casa por e-mail, telefone ou lead_id da Meta; campos vazios são preenchidos,
 * os que já existem não são trocados (o primeiro clique e a primeira origem ficam). Retorna { contact, created }.
 */
export async function upsertContact(site, d, now = Date.now()) {
  if (!piiReady()) return { contact: null, created: false };
  const email = normEmail(d.email), phone = normPhone(d.phone), name = String(d.name || '').trim().slice(0, 120) || null;
  const emailHash = hashEmail(email), phoneHash = hashPhone(phone), leadId = d.lead_id ? String(d.lead_id).slice(0, 40) : null;
  if (!emailHash && !phoneHash && !leadId) return { contact: null, created: false };
  // Titular que pediu exclusão não volta a ser cadastrado (nem por compra, formulário ou Lead Ads).
  if (await db.get('SELECT 1 FROM erased WHERE site=? AND bidx IN (?, ?)', [site.id, emailHash || '-', phoneHash || '-'])) return { contact: null, created: false };
  const u = d.utm || {};
  const found = await findContact(site.id, { emailHash, phoneHash, leadId });
  if (found) {
    await db.run(`UPDATE contacts SET updated=?, name_enc=COALESCE(name_enc, ?), email_enc=COALESCE(email_enc, ?), phone_enc=COALESCE(phone_enc, ?),
      email_hash=COALESCE(email_hash, ?), phone_hash=COALESCE(phone_hash, ?), lead_id=COALESCE(lead_id, ?), rid=COALESCE(rid, ?), fbc=COALESCE(fbc, ?), fbp=COALESCE(fbp, ?),
      utm_source=COALESCE(NULLIF(utm_source,''), ?), utm_campaign=COALESCE(NULLIF(utm_campaign,''), ?), campaign_key=COALESCE(NULLIF(campaign_key,''), ?),
      adset_key=COALESCE(NULLIF(adset_key,''), ?), ad_key=COALESCE(NULLIF(ad_key,''), ?) WHERE id=?`,
    [now, seal(name), seal(email), seal(phone), emailHash, phoneHash, leadId, d.rid || null, d.fbc || null, d.fbp || null,
      u.source || '', u.campaign || '', d.campaign_key || '', d.adset_key || '', d.ad_key || '', found.id]);
    if (d.note) await log(site.id, found.id, d.note, now);
    return { contact: await db.get('SELECT * FROM contacts WHERE id=?', [found.id]), created: false };
  }
  const [first] = await stages(site.id);
  const { rows: [c] } = await db.run(`INSERT INTO contacts(site, stage_id, stage_since, name_enc, email_enc, phone_enc, email_hash, phone_hash, lead_id, rid, fbc, fbp, source,
    utm_source, utm_campaign, campaign_key, adset_key, ad_key, value, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING *`,
  [site.id, first.id, now, seal(name), seal(email), seal(phone), emailHash, phoneHash, leadId, d.rid || null, d.fbc || null, d.fbp || null, d.source || 'manual',
    u.source || '', u.campaign || '', d.campaign_key || '', d.adset_key || '', d.ad_key || '', Number(d.value) || 0, now, now]);
  if (!c) return upsertContact(site, d, now); // outra requisição criou o mesmo contato no meio do caminho (índice único)
  await log(site.id, c.id, `Lead recebido: ${SOURCES[c.source] || c.source}${u.campaign ? ` · campanha ${u.campaign}` : ''}`, now);
  return { contact: c, created: true };
}

/** Evento offline da Meta para a entrada numa coluna (integração de CRM / Conversion Leads). */
/** Conversão de conversa de anúncio de clique para WhatsApp (Conversions API para mensagens: WABA + ctwa_clid). */
// Eventos que a Conversions API para mensagens aceita; fora da lista, a conversão vai pelo caminho comum (e-mail e telefone em hash).
export const BM_EVENTS = new Set(['LeadSubmitted', 'QualifiedLead', 'Purchase', 'InitiateCheckout', 'AddToCart', 'ViewContent', 'OrderCreated', 'OrderShipped', 'OrderDelivered', 'OrderCanceled', 'OrderReturned', 'CartAbandoned', 'RatingProvided', 'ReviewProvided']);
export function metaWhatsappEvent(site, c, eventName, eventId, now = Date.now()) {
  if (!c.ctwa_clid || !site.waba_id || !BM_EVENTS.has(eventName)) return null;
  const custom_data = {};
  if (c.value > 0) Object.assign(custom_data, { value: c.value, currency: site.currency });
  return { event_name: eventName, event_time: Math.floor(now / 1000), event_id: eventId, action_source: 'business_messaging', messaging_channel: 'whatsapp',
    user_data: { whatsapp_business_account_id: site.waba_id, ctwa_clid: c.ctwa_clid }, ...(Object.keys(custom_data).length && { custom_data }) };
}

export function metaCrmEvent(site, c, stage, now = Date.now()) {
  // Quem veio de anúncio de clique para WhatsApp: a conversão volta como mensagem (ligada ao anúncio pelo ctwa_clid).
  const wa = metaWhatsappEvent(site, c, stage.event_name, `crm-${c.id}-${stage.id}`, now);
  if (wa) return wa;
  const user_data = {};
  const em = metaEmail(open(c.email_enc)), ph = metaPhone(open(c.phone_enc));
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (c.lead_id) user_data.lead_id = Number(c.lead_id) || c.lead_id;
  if (c.fbc) user_data.fbc = c.fbc;
  if (c.fbp) user_data.fbp = c.fbp;
  if (c.rid) user_data.external_id = [sha(c.rid)];
  if (!Object.keys(user_data).length) return null;
  const custom_data = { event_source: 'crm', lead_event_source: 'Rastro' };
  if (c.value > 0) Object.assign(custom_data, { value: c.value, currency: site.currency });
  return { event_name: stage.event_name, event_time: Math.floor(now / 1000), event_id: `crm-${c.id}-${stage.id}`, action_source: 'system_generated', user_data, custom_data };
}

/**
 * Move o card. Com evento na coluna e Meta configurada, a conversão vai para a fila (uma vez por contato e coluna).
 * `silent`: só move (ex.: compra que chegou pelo webhook, cujo Purchase já foi enviado).
 */
export async function moveContact(site, c, stageId, { by = 'painel', silent = false, now = Date.now() } = {}) {
  const st = await db.get('SELECT * FROM stages WHERE id=? AND site=?', [stageId, site.id]);
  if (!st || c.stage_id === st.id) return false;
  await db.run('UPDATE contacts SET stage_id=?, stage_since=?, updated=?, suggest_stage=NULL, suggest_reason=NULL WHERE id=? AND site=?', [st.id, now, now, c.id, site.id]);
  let sent = '';
  if (!silent && st.event_name && metaReady(site)) {
    const ev = metaCrmEvent(site, c, st, now);
    if (ev) { await enqueue(site.id, 'meta', ev.event_id, st.event_name, ev, now); sent = ` · ${st.event_name} na fila da Meta`; }
  }
  await log(site.id, c.id, `Movido para ${st.name} (${by})${sent}`, now);
  return true;
}

/** Compra aprovada: o contato (criado se preciso) vai para a coluna de ganho, sem novo evento (o Purchase já saiu). */
export async function saleToCrm(site, sale, click, now = Date.now()) {
  const { contact } = await upsertContact(site, { email: sale.email, phone: sale.phone, name: sale.name, rid: click?.rid, fbc: click?.fbc, fbp: click?.fbp, source: 'venda',
    utm: sale.utm, value: sale.gross }, now);
  if (!contact) return;
  const won = (await stages(site.id)).find(s => s.kind === 'won');
  if (won) await moveContact(site, contact, won.id, { by: `compra ${sale.platform} ${sale.order_id}`, silent: true, now });
  if (!(contact.value > 0) && sale.gross > 0) await db.run('UPDATE contacts SET value=? WHERE id=?', [sale.gross, contact.id]);
}

/** LGPD: apaga o contato e o histórico; fica só o registro de que houve um pedido de exclusão. */
export async function eraseContact(site, id, actor, now = Date.now()) {
  const c = await db.get('SELECT * FROM contacts WHERE site=? AND id=?', [site.id, id]);
  if (!c) return;
  await db.batch([
    ['DELETE FROM crm_log WHERE site=? AND contact_id=?', [site.id, id]], ['DELETE FROM messages WHERE site=? AND contact_id=?', [site.id, id]],
    ['UPDATE wa_clicks SET rid=NULL, fbc=NULL, fbp=NULL, contact_id=NULL WHERE site=? AND contact_id=?', [site.id, id]],
    ["DELETE FROM deliveries WHERE site=? AND (event_id LIKE 'crm-' || ? || '-%' OR event_id LIKE 'wa-' || ? || '-%')", [site.id, String(id), String(id)]], // nada pendente vai mais à Meta
    ...(c.rid ? [['UPDATE events SET rid=NULL, ua=NULL, ga_cid=NULL, fbc=NULL, fbp=NULL WHERE site=? AND rid=?', [site.id, c.rid]],
      ['UPDATE sales SET rid=NULL WHERE site=? AND rid=?', [site.id, c.rid]]] : []),
    ...[c.email_hash, c.phone_hash].filter(Boolean).map(b => ['INSERT INTO erased(site, bidx, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', [site.id, b, now]]),
    ['DELETE FROM contacts WHERE site=? AND id=?', [site.id, id]],
    ['INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [site.id, now, actor, `contato ${id} excluído a pedido do titular`]],
  ]);
}
