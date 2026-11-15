// Venda pendente (boleto ou Pix gerado e não pago): o comprador vira contato do CRM (cifrado) e a venda entra em
// pending_orders. Com o recurso de recuperação ligado e o envio da Cloud API configurado, uma sequência de mensagens
// sai pelo WhatsApp e para sozinha quando o pagamento chega, a venda é recusada ou a pessoa responde.
import { db, sites } from './db.js';
import { open, piiReady } from './pii.js';
import { enabled } from './modules.js';
import { upsertContact, log } from './crm.js';
import { sendWhatsapp, waReady, permanentSend } from './whatsapp.js';

/**
 * Passos: `after` em minutos desde o pedido. Quem começa a conversa é a empresa, então a Cloud API exige um modelo
 * aprovado (`template`, com as variáveis em `params`); `text` só vale se a pessoa escreveu nas últimas 24 h.
 */
export const DEFAULT_RECOVERY = { link: '', steps: [
  { after: 15, template: '', lang: 'pt_BR', params: ['nome', 'produto', 'link'], text: 'Oi {nome}! O pagamento de {produto} ainda está pendente. Se precisar de ajuda, é só responder. {link}' },
  { after: 240, template: '', lang: 'pt_BR', params: ['nome', 'produto', 'link'], text: '' },
  { after: 1440, template: '', lang: 'pt_BR', params: ['nome', 'produto', 'link'], text: '' },
] };
export const VARS = ['nome', 'produto', 'valor', 'link'];
export function recoveryOf(site) {
  try { const c = JSON.parse(site.recovery || 'null'); if (c?.steps) return c; } catch {}
  return DEFAULT_RECOVERY;
}
const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (all, k) => Object.hasOwn(v, k) ? v[k] : all);

/** Chamado pelo webhook de venda (src/sales/webhooks.js) a cada mudança de status. */
export async function trackPending(site, platform, s, now = Date.now()) {
  if (s.status !== 'pending') {
    const to = s.status === 'paid' ? 'paid' : 'stopped';
    // Pago encerra sempre (e tira do público de quem não pagou); recusa ou reembolso só param o que ainda estava na fila.
    await db.run(`UPDATE pending_orders SET status=?, next_at=NULL WHERE site=? AND platform=? AND order_id=? AND ${to === 'paid' ? "status<>'paid'" : "status IN ('waiting','sending')"}`,
      [to, site.id, platform, s.order_id]);
    return;
  }
  const recover = enabled(site, 'recovery') && waReady(site) && s.phone;
  // O checkout próprio sempre guarda o pedido: a confirmação do Pix chega sem e-mail e telefone.
  if (!piiReady() || !(s.email || s.phone) || !(recover || enabled(site, 'audiences') || platform === 'pix')) return;
  const { contact } = await upsertContact(site, { email: s.email, phone: s.phone, name: s.name, rid: s.rid, source: 'checkout', utm: s.utm,
    note: `Pedido pendente ${platform} ${s.order_id}` }, now);
  if (!contact) return;
  const first = recoveryOf(site).steps[0];
  const { rowCount } = await db.run(`INSERT INTO pending_orders(site, platform, order_id, contact_id, product, gross, created, next_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(site, platform, order_id) DO NOTHING`, [site.id, platform, s.order_id, contact.id, s.product || '', s.gross || 0, now, recover && first ? now + first.after * 60e3 : null]);
  if (rowCount && recover && first) await log(site.id, contact.id, `Recuperação agendada para o pedido ${s.order_id}`, now);
}

/** Envia o passo devido de cada pedido pendente. Linhas "alugadas" por 2 min, como a fila de envio (src/dispatch.js). */
export async function runRecovery(now = Date.now()) {
  const rows = await db.all(`UPDATE pending_orders SET status='sending', next_at=? WHERE id IN (SELECT id FROM pending_orders
    WHERE status IN ('waiting','sending') AND next_at<=? ORDER BY next_at LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING *`, [now + 120e3, now]);
  const out = { sent: 0, skipped: 0, failed: 0 };
  for (const p of rows) out[await step(p, now)]++;
  return out;
}

const end = (p, status, err = null) => db.run('UPDATE pending_orders SET status=?, next_at=NULL, last_error=? WHERE id=?', [status, err, p.id]);
async function step(p, now) {
  const site = sites.get(p.site);
  // Recurso desligado ou envio sem configuração: a sequência fica parada (não manda mensagem atrasada depois).
  if (!site || !enabled(site, 'recovery') || !waReady(site)) { await end(p, 'stopped', 'recuperação desligada'); return 'skipped'; }
  const [sale, contact] = await Promise.all([db.get('SELECT status FROM sales WHERE site=? AND platform=? AND order_id=?', [p.site, p.platform, p.order_id]),
    db.get('SELECT * FROM contacts WHERE id=? AND site=?', [p.contact_id, p.site])]);
  if (sale && sale.status !== 'pending') { await end(p, sale.status === 'paid' ? 'paid' : 'stopped'); return 'skipped'; }
  const phone = contact && open(contact.phone_enc);
  if (!phone) { await end(p, 'stopped', 'contato sem telefone'); return 'skipped'; }
  const cfg = recoveryOf(site), st = cfg.steps[p.step];
  if (!st) { await end(p, 'done'); return 'skipped'; }
  const advance = () => {
    const next = cfg.steps[p.step + 1];
    return db.run('UPDATE pending_orders SET status=?, step=step+1, next_at=?, last_error=NULL WHERE id=?',
      [next ? 'waiting' : 'done', next ? Math.max(now + 60e3, p.created + next.after * 60e3) : null, p.id]);
  };
  const lastIn = (await db.get("SELECT MAX(ts) ts FROM messages WHERE contact_id=? AND dir='in'", [contact.id]))?.ts;
  const v = { nome: (open(contact.name_enc) || '').split(/\s+/)[0] || '', produto: p.product || 'seu pedido',
    valor: (p.gross || 0).toLocaleString('pt-BR', { style: 'currency', currency: site.currency || 'BRL' }), link: cfg.link || '' };
  const msg = lastIn && now - lastIn < 24 * 3600e3 && st.text ? { text: fill(st.text, v) }
    : st.template ? { template: st.template, lang: st.lang, params: (st.params || []).map(k => v[k] ?? '') } : null;
  if (!msg) {
    await log(site.id, contact.id, `Recuperação: passo ${p.step + 1} pulado (fora da janela de 24 h e sem modelo aprovado)`, now);
    await advance();
    return 'skipped';
  }
  try {
    await sendWhatsapp(site, contact, phone, msg, now);
    await log(site.id, contact.id, `Recuperação: mensagem ${p.step + 1} de ${cfg.steps.length} enviada (pedido ${p.order_id})`, now);
    await advance();
    return 'sent';
  } catch (e) {
    const err = (e.name === 'TimeoutError' ? 'Sem resposta em 10 s' : e.message || String(e)).slice(0, 300);
    if (permanentSend(e)) { await end(p, 'failed', err); await log(site.id, contact.id, `Recuperação parada: ${err}`, now); }
    else await db.run("UPDATE pending_orders SET status='waiting', next_at=?, last_error=? WHERE id=?", [now + 10 * 60e3, err, p.id]);
    return 'failed';
  }
}
