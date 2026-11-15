// Recuperação de venda pendente: sequência configurável e a lista dos pedidos em andamento (src/recovery.js).
import { db, loadSites } from '../db.js';
import { route, send, redirect, form, sitePath, HttpError } from '../http.js';
import { siteCtx } from '../auth.js';
import { open, maskPhone, piiReady } from '../pii.js';
import { recoveryOf, VARS } from '../recovery.js';
import { waReady } from '../whatsapp.js';
import * as V from '../views/recovery.js';

async function view(r, msg, err) {
  if (!piiReady()) throw new HttpError(503, 'A recuperação precisa da chave DATA_KEY configurada no servidor.');
  const rows = await db.all(`SELECT p.*, c.phone_enc, c.name_enc FROM pending_orders p LEFT JOIN contacts c ON c.id=p.contact_id
    WHERE p.site=? ORDER BY p.created DESC LIMIT 100`, [r.site.id]);
  const list = rows.map(p => ({ ...p, who: (open(p.name_enc) || '').split(/\s+/)[0] || maskPhone(open(p.phone_enc)) || `Contato ${p.contact_id}` }));
  send(r, err ? 400 : 200, V.recoveryPage(await siteCtx(r, '/recovery'), recoveryOf(r.site), list, { ready: waReady(r.site) }, msg, err));
}
route('GET', '/sites/:id/recovery', { site: 'view', module: 'recovery' }, r => view(r, r.q.get('ok') ? 'Sequência salva.' : null));
route('POST', '/sites/:id/recovery', { site: 'edit', module: 'recovery' }, async r => {
  const f = await form(r.req), link = (f.get('link') || '').trim().slice(0, 300);
  if (link && !/^https:\/\/\S+$/.test(link)) return view(r, null, 'O link de pagamento precisa começar com https://');
  const steps = [];
  for (let i = 0; i < 3; i++) {
    const after = Math.round(Number(f.get(`after${i}`)));
    if (!f.get(`after${i}`) || !(after >= 5 && after <= 10080)) continue; // passo vazio é ignorado; até 7 dias
    const template = (f.get(`template${i}`) || '').trim().slice(0, 512), text = (f.get(`text${i}`) || '').trim().slice(0, 1000);
    if (template && !/^[a-z0-9_]+$/.test(template)) return view(r, null, `Passo ${i + 1}: o nome do modelo tem só letras minúsculas, números e _ (como aparece no Gerenciador do WhatsApp).`);
    if (!template && !text) return view(r, null, `Passo ${i + 1}: informe um modelo aprovado ou um texto.`);
    const params = (f.get(`params${i}`) || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (params.some(p => !VARS.includes(p))) return view(r, null, `Passo ${i + 1}: as variáveis do modelo podem ser ${VARS.join(', ')}.`);
    steps.push({ after, template, lang: (f.get(`lang${i}`) || 'pt_BR').trim().replace(/[^\w]/g, '').slice(0, 10) || 'pt_BR', params, text });
  }
  steps.sort((a, b) => a.after - b.after);
  await db.run('UPDATE sites SET recovery=? WHERE id=?', [JSON.stringify({ link, steps }), r.site.id]);
  await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [r.site.id, Date.now(), r.user.email, `sequência de recuperação salva (${steps.length} passos)`]);
  await loadSites();
  redirect(r, sitePath(r.site, '/recovery?ok=1'));
});
