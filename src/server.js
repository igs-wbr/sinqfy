// Servidor local (desenvolvimento ou VPS). Em produção na Vercel, a entrada é api/index.js.
import http from 'node:http';
import { env } from './db.js';
import { handler } from './app.js';
import { runJobs } from './jobs.js';
import { dispatch } from './dispatch.js';

export const server = http.createServer(handler);

const host = env.HOST || '127.0.0.1';
server.listen(Number(env.PORT ?? 8080), host, () => {
  console.log(`Rastro rodando em http://${host}:${server.address().port}`);
  // Sem cron externo localmente: as tarefas rodam aqui a cada 5 minutos.
  const run = () => runJobs().catch(e => console.error(e));
  setInterval(run, 5 * 60e3).unref();
  run();
  // Fila de envio para Meta e GA4 (etapa 2). ponytail: no mesmo processo do painel; separar quando o volume pedir.
  const every = Number(env.DISPATCH_EVERY ?? 5000); // 0 desliga (testes chamam dispatch() direto)
  if (every) setInterval(() => dispatch().catch(e => console.error(e)), every).unref();
});
