// Tarefas periódicas: limpeza e sincronização da Meta (gastos, campanhas, status).
// Em produção (Vercel) são disparadas pela rota /cron, chamada de hora em hora por um cron externo;
// localmente, src/server.js chama runJobs() a cada 5 minutos.
import { db, sites, ready } from './db.js';
import { syncMeta } from './ads/meta.js';
import { dispatch } from './dispatch.js';
import { runRecovery } from './recovery.js';
import { checkHost, cfReady } from './cloudflare.js';

const META_EVERY = 4 * 60e3; // < 5 min: o gasto da Meta atualiza a cada rodada (server.js roda a cada 5 min)

export async function runJobs() {
  const out = { meta: 0, errors: [] };
  await ready;
  await db.batch([['DELETE FROM sessions WHERE expires<?', [Date.now()]], ['DELETE FROM login_fails WHERE until<?', [Date.now()]],
    ["DELETE FROM deliveries WHERE created<? AND status IN ('sent','failed')", [Date.now() - 30 * 864e5]], // histórico de envios: 30 dias
    ['DELETE FROM checkout_clicks WHERE ts<?', [Date.now() - 7 * 864e5]]]); // IP cifrado do checkout: 7 dias (ADR 0020)
  out.dispatch = await dispatch();
  out.recovery = await runRecovery();
  // Retenção (ADR 0013): contatos sem atualização e eventos com mais de 13 meses; histórico de contato apagado junto.
  const old = Date.now() - 395 * 864e5;
  await db.batch([['DELETE FROM crm_log WHERE contact_id IN (SELECT id FROM contacts WHERE updated<?)', [old]], ['DELETE FROM contacts WHERE updated<?', [old]],
    ['DELETE FROM events WHERE ts<?', [old]], ['DELETE FROM messages WHERE ts<?', [Date.now() - 90 * 864e5]], ['DELETE FROM wa_clicks WHERE ts<?', [old]],
    ...['page_reads', 'click_cells', 'click_targets'].map(t => [`DELETE FROM ${t} WHERE date<?`, [new Date(old).toISOString().slice(0, 10)]])]); // mensagens: 90 dias; comportamento: 13 meses, como os eventos
  if (cfReady()) for (const s of [...sites.values()].filter(s => s.edge_host && (s.edge_status === 'dns' || s.edge_status === 'ssl'))) await checkHost(s); // erro só com Verificar agora
  // Gasto a cada rodada (5 min); contas com erro também tentam de novo a cada rodada.
  // Conta que bateu no limite da Meta fica parada até sync_after.
  for (const acc of await db.all("SELECT * FROM ad_accounts WHERE platform='meta' AND COALESCE(last_sync, 0) < ? AND COALESCE(sync_after, 0) < ?", [Date.now() - META_EVERY, Date.now()])) {
    if (!sites.has(acc.site)) continue;
    try { await syncMeta(acc); out.meta++; } catch (e) { out.errors.push(`meta ${acc.account_id}: ${e.message}`); }
  }
  for (const e of out.errors) console.error(e);
  return out;
}
