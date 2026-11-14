// Tarefas periódicas: limpeza e sincronização da Meta (gastos, campanhas, status).
// Em produção (Vercel) são disparadas pela rota /cron, chamada de hora em hora por um cron externo;
// localmente, src/server.js chama runJobs() a cada 5 minutos.
import { db, sites, ready } from './db.js';
import { syncMeta } from './ads/meta.js';
import { dispatch } from './dispatch.js';

const META_EVERY = 55 * 60e3; // < 1 h, para o cron horário sempre pegar

export async function runJobs() {
  const out = { meta: 0, errors: [] };
  await ready;
  await db.batch([['DELETE FROM sessions WHERE expires<?', [Date.now()]], ['DELETE FROM login_fails WHERE until<?', [Date.now()]],
    ["DELETE FROM deliveries WHERE created<? AND status IN ('sent','failed')", [Date.now() - 30 * 864e5]]]); // histórico de envios: 30 dias
  out.dispatch = await dispatch();
  // Contas com erro (last_sync antigo) tentam a cada execução do cron, ou seja, no máximo uma vez por hora.
  for (const acc of await db.all("SELECT * FROM ad_accounts WHERE platform='meta' AND COALESCE(last_sync, 0) < ?", [Date.now() - META_EVERY])) {
    if (!sites.has(acc.site)) continue;
    try { await syncMeta(acc); out.meta++; } catch (e) { out.errors.push(`meta ${acc.account_id}: ${e.message}`); }
  }
  for (const e of out.errors) console.error(e);
  return out;
}
