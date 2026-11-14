# Rastro: guia para agentes

Analytics de vendas, tráfego e campanhas da Meta, em evolução para o produto multi-cliente do [plano v2](docs/plano-v2/plano.html) (etapas 0 e 1 concluídas). Produção: Docker na VM da Oracle com PostgreSQL ([deploy](docs/deploy-oracle.md), [ADR 0010](docs/adr/0010-postgres-na-oracle.md)); localmente, `npm start` com o Postgres do Docker. Única dependência: `pg`. Não há envio de e-mail ([ADR 0008](docs/adr/0008-sem-email.md)). Interface em PT-BR.

## Comandos
- `npm start`: servidor em `HOST:PORT` (padrão `127.0.0.1:8080`), Postgres local (`127.0.0.1:55432`) se `DATABASE_URL` estiver vazio, tarefas a cada 5 min.
- `npm test`: `node --test "tests/*.test.js"`. Precisa do Postgres local (ou `TEST_DATABASE_URL`). Cada arquivo cria e apaga um schema próprio, e a Graph API da Meta é simulada em `tests/sales.test.js`.

## Estrutura
- `src/app.js`: handler único (estáticos, beacon `/e`, despacho, CSRF). É usado por `src/server.js` (Docker e local) e ainda por `api/index.js` (Vercel, legado).
- `src/db.js`: pool `pg` com `db.all/get/run/exec/batch` (todos **assíncronos**; SQL com `?`, convertido para `$N`), schema em `ready`, cache `sites` recarregado a cada 10 s.
- `edge/`: Worker da Cloudflare (`worker.js`, `wrangler.toml`): cookies primários e repasse do beacon com `EDGE_SECRET`. Testado em `tests/edge.test.js` sem wrangler.
- `deploy/`: `docker-compose.yml` (postgres, app, cloudflared) e `backup.sh` (pg_dump para o R2).
- `src/http.js` (rotas e respostas) · `src/auth.js` (sessão, papéis, força bruta no banco) · `src/time.js` (fusos e períodos).
- `src/tracking/`, `src/sales/`, `src/ads/meta.js`: domínio. `src/jobs.js`: `runJobs()`, chamado por `GET /cron` (Bearer `CRON_SECRET`).
- `src/routes/`: um arquivo por área; cada um registra as suas rotas com `route()`.
- `src/views/`: `ui.js` concentra o design system e os componentes; os demais arquivos são as páginas.
- `public/`: servido pela CDN na Vercel. O snippet `s.js` (< 2 KB) é minificado à mão e servido aos sites pelo Worker.
- `docs/`: SPEC, deploy, integrações, design system, ADRs (próximo: `0014`), fluxo com skills.

## Regras
- Toda consulta é `await db.…`; consultas independentes vão em `Promise.all`/`awaitAll`.
- Escritas que precisam ser atômicas usam `db.batch([[sql, args], …])`.
- SQL de Postgres: datas em ms são `BIGINT`, sem recursos do SQLite. Em `ON CONFLICT … DO UPDATE`, qualifique as colunas da tabela (`sales.method`). Mudança de schema é aditiva (`ADD COLUMN IF NOT EXISTS`) no fim de `migrate()`.
- O schema não usa chave estrangeira: apague as tabelas filhas explicitamente (veja `SITE_TABLES` e `USER_TABLES` em `routes/admin.js`).
- Nada de estado em memória que precise valer entre instâncias serverless. Use o banco; o cache de `sites` é a exceção, com validade de 10 s.
- Trabalho assíncrono de um webhook (ex.: Conversions API) é **aguardado** antes de responder.
- Escape por padrão: monte HTML com o template `html`; `raw()` só para HTML gerado pelo próprio código.
- Nunca grave IP, e-mail ou telefone. PII do webhook só segue em hash para a Conversions API. (Muda na etapa 5, ver [ADR 0013](docs/adr/0013-dados-pessoais-criptografados.md).)
- Chaves vindas da query string que indexam objetos passam por `Object.hasOwn`. Nomes de coluna em SQL vêm de whitelists (`FILTERS`, `SALE_FILTERS`, `LEVELS`, `ATTR_DIMS`).
- Ao desestruturar um import dinâmico, `sites` perde o live binding. Use o namespace (`DB.sites`).
- Anúncios: só Meta ([ADR 0007](docs/adr/0007-anuncios-so-meta.md)), somente leitura ([ADR 0004](docs/adr/0004-meta-somente-leitura-e-csv.md)).
- Mapa de skills por tarefa: `docs/fluxo-com-skills.md`.
