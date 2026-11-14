// Etapa 6: WhatsApp. Link rastreável (código curto na mensagem liga a conversa ao clique), webhook da Cloud API oficial
// (mensagens cifradas, ctwa_clid de anúncio de clique para WhatsApp) e sugestão de coluna do CRM por regras ou IA.
import { randomInt } from 'node:crypto';
import { db, env } from './db.js';
import { seal, open, normPhone } from './pii.js';
import { upsertContact, stages, log, metaWhatsappEvent } from './crm.js';
import { enqueue, metaReady } from './dispatch.js';
import { adKey } from './sales/webhooks.js';

const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L: o cliente pode digitar o código
export const CODE_RE = /\[([A-HJ-KM-NP-Z2-9]{5})\]/i;
export const newCode = () => Array.from({ length: 5 }, () => ABC[randomInt(ABC.length)]).join('');
export const newSlug = () => Array.from({ length: 7 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[randomInt(31)]).join('');

/** Clique no link: grava o código com o visitante e devolve a URL do wa.me com o código no fim da mensagem. */
export async function clickLink(link, edge, now = Date.now()) {
  let code;
  for (let i = 0; i < 5; i++) {
    code = newCode();
    const { rowCount } = await db.run('INSERT INTO wa_clicks(code, site, link_id, ts, rid, fbc, fbp) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',
      [code, link.site, link.id, now, edge?.rid || null, edge?.fbc || null, edge?.fbp || null]);
    if (rowCount) break;
  }
  const text = `${link.message ? link.message + ' ' : ''}[${code}]`;
  return { code, url: `https://wa.me/${link.phone}?text=${encodeURIComponent(text)}` };
}

/** Dados do clique para o contato: rid, fbc e a campanha da última visita com UTM antes do clique. */
export async function clickContext(site, click) {
  if (!click) return {};
  const paid = click.rid && await db.get("SELECT utm_source, utm_medium, utm_campaign, utm_content FROM events WHERE site=? AND rid=? AND utm_campaign<>'' AND ts<=? ORDER BY ts DESC LIMIT 1",
    [site.id, click.rid, click.ts + 60e3]);
  return { rid: click.rid, fbc: click.fbc, fbp: click.fbp, utm: { source: paid?.utm_source || 'whatsapp', campaign: paid?.utm_campaign || '' },
    campaign_key: adKey(paid?.utm_campaign), adset_key: adKey(paid?.utm_medium), ad_key: adKey(paid?.utm_content) };
}

/** Liga um código (digitado no CRM ou vindo na mensagem) ao contato. Retorna o clique ou null. */
export async function claimCode(site, contact, code, now = Date.now()) {
  // Atômico e com validade de 7 dias: um código não troca de dono, e chutar códigos antigos não pega o clique de ninguém.
  const { rows: [click] } = await db.run('UPDATE wa_clicks SET contact_id=? WHERE site=? AND code=? AND (contact_id IS NULL OR contact_id=?) AND ts>? RETURNING *',
    [contact.id, site.id, String(code || '').toUpperCase(), contact.id, now - 7 * 864e5]);
  if (!click) return null;
  const ctx = await clickContext(site, click);
  await db.batch([
    [`UPDATE contacts SET rid=COALESCE(rid, ?), fbc=COALESCE(fbc, ?), fbp=COALESCE(fbp, ?), utm_source=COALESCE(NULLIF(utm_source,''), ?), utm_campaign=COALESCE(NULLIF(utm_campaign,''), ?),
      campaign_key=COALESCE(NULLIF(campaign_key,''), ?), adset_key=COALESCE(NULLIF(adset_key,''), ?), ad_key=COALESCE(NULLIF(ad_key,''), ?), updated=? WHERE id=?`,
    [ctx.rid, ctx.fbc, ctx.fbp, ctx.utm.source, ctx.utm.campaign, ctx.campaign_key, ctx.adset_key, ctx.ad_key, now, contact.id]]]);
  await log(site.id, contact.id, `Código ${click.code} do link de WhatsApp ligado ao contato${ctx.utm.campaign ? ` · campanha ${ctx.utm.campaign}` : ''}`, now);
  return click;
}

// ---------- sugestão de coluna ----------
/** Tira e-mail, telefone, CPF e números longos antes de qualquer texto sair para a IA. */
export const redact = t => String(t || '').replace(/https?:\/\/\S+/gi, '[link]').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[chave]').replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '[cnpj]')
  .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[cpf]').replace(/\b\d{5}-?\d{3}\b/g, '[cep]').replace(/\+?\(?\d[\d\s().-]{7,}\d/g, '[numero]').slice(0, 2000);

const RULES = [
  [/(paguei|pago|comprovante|pix (feito|enviado)|j[aá] (comprei|paguei)|transfer[iê])/i, 'won', 'Fala em pagamento feito'],
  [/(n[aã]o (tenho|tenho mais) interesse|n[aã]o quero|pare de|remove|descadastr|sem interesse)/i, 'lost', 'Disse que não tem interesse'],
  [/(pre[cç]o|valor|quanto (custa|é|fica)|parcel|desconto|forma de pagamento|boleto|cart[aã]o|pix)/i, 'qualified', 'Perguntou sobre preço ou pagamento'],
];
/** Regras simples (sem IA): coluna sugerida pelo texto da última mensagem recebida. */
export function ruleSuggest(text, cols) {
  for (const [re, target, reason] of RULES) {
    if (!re.test(text)) continue;
    const st = target === 'qualified' ? cols.find(c => /qualific/i.test(c.name)) : cols.find(c => c.kind === target);
    if (st) return { stage: st.id, reason };
  }
  return null;
}
/** Com GEMINI_API_KEY: a IA lê as últimas mensagens (sem dado pessoal) e escolhe uma coluna. Sem chave: regras. */
export async function suggest(site, contact, cols) {
  const msgs = (await db.all("SELECT dir, text_enc FROM messages WHERE contact_id=? ORDER BY ts DESC LIMIT 8", [contact.id])).reverse();
  const lastIn = msgs.filter(m => m.dir === 'in').map(m => open(m.text_enc) || '').at(-1) || '';
  if (!env.GEMINI_API_KEY || !site.ai_suggest || (contact.suggest_at && Date.now() - contact.suggest_at < 60e3)) return ruleSuggest(lastIn, cols);
  await db.run('UPDATE contacts SET suggest_at=? WHERE id=?', [Date.now(), contact.id]);
  const convo = msgs.map(m => `${m.dir === 'in' ? 'Cliente' : 'Empresa'}: ${redact(open(m.text_enc))}`).join('\n');
  const prompt = `Você classifica conversas de venda no WhatsApp. Colunas do funil: ${cols.map(c => `"${c.name}"`).join(', ')}.
Leia a conversa e responda só com JSON {"coluna": "<nome exato de uma coluna>", "motivo": "<até 12 palavras>"}. Se não houver sinal claro, use a coluna atual "${cols.find(c => c.id === contact.stage_id)?.name || cols[0].name}".
Conversa:
${convo}`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL || 'gemini-2.5-flash')}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(15e3),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
    });
    const j = await res.json();
    const out = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    const st = cols.find(c => c.name.toLowerCase() === String(out.coluna || '').toLowerCase());
    return st ? { stage: st.id, reason: seal(`IA: ${String(out.motivo || '').slice(0, 120)}`) } : ruleSuggest(lastIn, cols); // o motivo pode repetir dado pessoal: cifrado
  } catch { return ruleSuggest(lastIn, cols); } // IA fora do ar: regras
}

// ---------- webhook da Cloud API ----------
/**
 * Mensagens recebidas: contato pelo número (cifrado), conversa guardada cifrada, código do link ligado ao clique,
 * ctwa_clid e anúncio de quem veio de anúncio de clique para WhatsApp, LeadSubmitted para a Meta no primeiro contato.
 */
export async function handleCloud(site, payload, now = Date.now()) {
  let n = 0;
  const touched = new Map();
  for (const ch of (payload?.entry || []).filter(e => String(e.id) === String(site.waba_id)).flatMap(e => e.changes || []).filter(c => c.field === 'messages').slice(0, 20)) {
    const v = ch.value || {}, names = new Map((v.contacts || []).map(c => [c.wa_id, c.profile?.name]));
    for (const m of (v.messages || []).slice(0, 50)) {
      if (!normPhone(m.from) || !m.id) continue;
      if (await db.get('SELECT 1 FROM messages WHERE wa_msg_id=?', [m.id])) continue; // a Meta reenvia avisos
      const text = m.type === 'text' ? m.text?.body : m.type === 'button' ? m.button?.text : m.type === 'interactive' ? (m.interactive?.button_reply?.title || m.interactive?.list_reply?.title) : `[${m.type}]`;
      const ref = m.referral || {};
      const ts = Number(m.timestamp) ? Number(m.timestamp) * 1000 : now;
      if (now - ts > 7 * 864e5) continue; // aviso antigo repetido
      const { contact, created } = await upsertContact(site, { phone: m.from, name: names.get(m.from), source: 'whatsapp',
        utm: ref.ctwa_clid ? { source: 'facebook', campaign: ref.headline || '' } : {}, ad_key: ref.source_type === 'ad' ? String(ref.source_id || '') : '' }, ts);
      if (!contact) continue;
      await db.run('INSERT INTO messages(site, contact_id, ts, dir, text_enc, wa_msg_id) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING', [site.id, contact.id, ts, 'in', seal(String(text || '').slice(0, 4000)), m.id]);
      if (ref.ctwa_clid && !contact.ctwa_clid) {
        await db.run('UPDATE contacts SET ctwa_clid=? WHERE id=?', [String(ref.ctwa_clid).slice(0, 300), contact.id]);
        contact.ctwa_clid = String(ref.ctwa_clid).slice(0, 300);
        await log(site.id, contact.id, `Veio de anúncio de clique para WhatsApp${ref.source_id ? ` (anúncio ${ref.source_id})` : ''}`, ts);
      }
      const code = CODE_RE.exec(text || '')?.[1];
      if (code) await claimCode(site, contact, code, ts);
      if (created && metaReady(site)) {
        const ev = metaWhatsappEvent(site, contact, 'LeadSubmitted', `wa-${contact.id}-lead`, ts);
        if (ev) await enqueue(site.id, 'meta', ev.event_id, 'LeadSubmitted', ev, now);
      }
      await db.run('UPDATE contacts SET last_msg=GREATEST(COALESCE(last_msg, 0), ?) WHERE id=?', [ts, contact.id]);
      touched.set(contact.id, contact);
      n++;
    }
  }
  const cols = touched.size && await stages(site.id);
  for (const contact of touched.values()) { // uma sugestão por contato por aviso, olhando a conversa toda
    const fresh = await db.get('SELECT * FROM contacts WHERE id=?', [contact.id]), sug = await suggest(site, fresh, cols);
    const keep = sug && sug.stage !== fresh.stage_id;
    await db.run('UPDATE contacts SET suggest_stage=?, suggest_reason=? WHERE id=?', [keep ? sug.stage : null, keep ? sug.reason : null, contact.id]);
  }
  return n;
}
