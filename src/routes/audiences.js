// Públicos para remarketing (ADR 0004: nada é escrito na conta de anúncios). O arquivo sai com e-mail, telefone e
// primeiro nome em SHA-256, no formato da lista de clientes da Meta; o dado aberto nunca deixa o servidor.
import { db } from '../db.js';
import { route, send, HttpError } from '../http.js';
import { siteCtx } from '../auth.js';
import { stages } from '../crm.js';
import { open, metaEmail, metaPhone, sha, piiReady } from '../pii.js';
import * as V from '../views/recovery.js';

const NOT_WON = "stage_id NOT IN (SELECT id FROM stages WHERE site=?1 AND kind='won')";
/** Públicos fixos + um por coluna do CRM: { key: { label, desc, where } }. `where` filtra contacts (site = ?1). */
async function audiences(site) {
  const out = {
    buyers: { label: 'Compradores', desc: 'Contatos na coluna de ganho. Use como exclusão ou para semelhantes (lookalike).',
      where: "stage_id IN (SELECT id FROM stages WHERE site=?1 AND kind='won')" },
    abandoned: { label: 'Geraram pedido e não pagaram', desc: 'Boleto ou Pix pendente, recusado ou expirado, sem compra depois.',
      where: `id IN (SELECT contact_id FROM pending_orders WHERE site=?1 AND status<>'paid') AND ${NOT_WON}` },
  };
  for (const c of await stages(site.id)) out[`stage-${c.id}`] = { label: `Coluna ${c.name}`, desc: 'Contatos que estão nesta coluna do CRM agora.', where: 'stage_id=' + Number(c.id) };
  return out;
}

route('GET', '/sites/:id/audiences', { site: 'edit', module: 'audiences' }, async r => {
  if (!piiReady()) throw new HttpError(503, 'Públicos precisam da chave DATA_KEY configurada no servidor.');
  const list = await audiences(r.site);
  const counts = await Promise.all(Object.values(list).map(a => db.get(`SELECT COUNT(*) n FROM contacts WHERE site=?1 AND ${a.where}`, [r.site.id])));
  send(r, 200, V.audiencesPage(await siteCtx(r, '/audiences'), Object.entries(list).map(([key, a], i) => ({ key, ...a, n: counts[i].n }))));
});

const csvCell = v => v ? `"${v}"` : '';
route('GET', '/sites/:id/audiences/:key', { site: 'edit', module: 'audiences' }, async r => {
  if (!piiReady()) throw new HttpError(503, 'Públicos precisam da chave DATA_KEY configurada no servidor.');
  const list = await audiences(r.site), key = r.params.key.replace(/\.csv$/, '');
  if (!Object.hasOwn(list, key)) throw new HttpError(404, 'Público não encontrado.');
  const rows = await db.all(`SELECT email_enc, phone_enc, name_enc FROM contacts WHERE site=?1 AND ${list[key].where} ORDER BY id LIMIT 100000`, [r.site.id]);
  const fn = c => sha((open(c.name_enc) || '').trim().split(/\s+/)[0].normalize('NFC').toLowerCase().replace(/[^\p{L}]/gu, '') || null);
  const lines = rows.map(c => [metaEmail(open(c.email_enc)), metaPhone(open(c.phone_enc)), fn(c)]).filter(([e, p]) => e || p).map(x => x.map(csvCell).join(','));
  await db.run('INSERT INTO audit_log(site, ts, actor, action) VALUES (?,?,?,?)', [r.site.id, Date.now(), r.user.email, `público exportado: ${list[key].label} (${lines.length})`]);
  r.res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'content-disposition': `attachment; filename="${r.site.id}-${key}.csv"` }).end(['email,phone,fn', ...lines].join('\n') + '\n');
});
