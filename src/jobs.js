// Tarefas periódicas: limpeza e sincronização da Meta (gastos, campanhas, status).
// Em produção (Vercel) são disparadas pela rota /cron, chamada de hora em hora por um cron externo;
// localmente, src/server.js chama runJobs() a cada 5 minutos.
import { db, sites, ready } from './db.js';
import { syncMeta } from './ads/meta.js';
import { dispatch } from './dispatch.js';
import { checkHost, cfReady } from './cloudflare.js';

const META_EVERY = 55 * 60e3; // < 1 h, para o cron horário sempre pegar

export async function runJobs() {
  const out = { meta: 0, errors: [] };
  await ready;
  await db.batch([['DELETE FROM sessions WHERE expires<?', [Date.now()]], ['DELETE FROM login_fails WHERE until<?', [Date.now()]],
    ["DELETE FROM deliveries WHERE created<? AND status IN ('sent','failed')", [Date.now() - 30 * 864e5]]]); // histórico de envios: 30 dias
  out.dispatch = await dispatch();
  // Retenção (ADR 0013): contatos sem atualização e eventos com mais de 13 meses; histórico de contato apagado junto.
  const old = Date.now() - 395 * 864e5;
  await db.batch([['DELETE FROM crm_log WHERE contact_id IN (SELECT id FROM contacts WHERE updated<?)', [old]], ['DELETE FROM contacts WHERE updated<?', [old]],
    ['DELETE FROM events WHERE ts<?', [old]]]);
  if (cfReady()) for (const s of [...sites.values()].filter(s => s.edge_host && (s.edge_status === 'dns' || s.edge_status === 'ssl'))) await checkHost(s); // erro só com Verificar agora
  // Contas com erro (last_sync antigo) tentam a cada execução do cron, ou seja, no máximo uma vez por hora.
  for (const acc of await db.all("SELECT * FROM ad_accounts WHERE platform='meta' AND COALESCE(last_sync, 0) < ?", [Date.now() - META_EVERY])) {
    if (!sites.has(acc.site)) continue;
    try { await syncMeta(acc); out.meta++; } catch (e) { out.errors.push(`meta ${acc.account_id}: ${e.message}`); }
  }
  for (const e of out.errors) console.error(e);
  return out;
}
