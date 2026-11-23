# Sinqfy: guia para agentes

Analytics de vendas, tráfego e campanhas da Meta, em evolução para o produto multi-cliente do [plano v2](docs/plano-v2/plano.html) (etapas 0 a 6 concluídas, painel no design system Sinqfy, moldura grafite e azul só como acento). Produção: Docker com PostgreSQL em qualquer VPS ([onde hospedar](docs/hospedagem.md); exemplo com a Oracle em [deploy-oracle](docs/deploy-oracle.md), [ADR 0010](docs/adr/0010-postgres-na-oracle.md)); provedores (Oracle, Cloudflare, Vercel) são exemplos, nunca dependência no código; localmente, `npm start` com o Postgres do Docker. Única dependência: `pg`. Não há envio de e-mail ([ADR 0008](docs/adr/0008-sem-email.md)). Interface em PT-BR.

## Comandos
- `npm start`: servidor em `HOST:PORT` (padrão `127.0.0.1:8080`), Postgres local (`127.0.0.1:55432`) se `DATABASE_URL` estiver vazio, tarefas a cada 5 min.
- `npm test`: `node --test "tests/*.test.js"`. Precisa do Postgres local (ou `TEST_DATABASE_URL`). Cada arquivo cria e apaga um schema próprio, e a Graph API da Meta é simulada em `tests/sales.test.js`.

## Estrutura
- `src/app.js`: handler único (estáticos, beacon `/e`, despacho, CSRF). É usado por `src/server.js` (Docker e local) e ainda por `api/index.js` (Vercel, legado).
- `src/db.js`: pool `pg` com `db.all/get/run/exec/batch` (todos **assíncronos**; SQL com `?`, convertido para `$N`), schema em `ready`, cache `sites` recarregado a cada 10 s.
- `edge/`: Worker da Cloudflare (`worker.js`, `wrangler.toml`): cookies primários e repasse do beacon com `EDGE_SECRET`. Testado em `tests/edge.test.js` sem wrangler.
- `deploy/`: `docker-compose.yml` (postgres e app; publicação por perfil: `cloudflare` com túnel, `caddy` com HTTPS automático, ou proxy próprio), `Caddyfile` e `backup.sh` (pg_dump cifrado para qualquer remoto do rclone).
- `src/http.js` (rotas e respostas) · `src/auth.js` (sessão, papéis, força bruta no banco) · `src/time.js` (fusos e períodos).
- `src/tracking/`, `src/sales/`, `src/ads/meta.js`: domínio. `src/sales/funnel.js`: funil dos anúncios da aba Campanhas (fonte mais confiável por etapa: página pelo script, compra pelo webhook, impressão e clique pela Meta; gargalo é a etapa que mais caiu contra o período anterior da própria campanha, nunca média de mercado). `src/jobs.js`: `runJobs()`, chamado por `GET /cron` (Bearer `CRON_SECRET`).
- `src/dispatch.js`: fila `deliveries` e envio server-side para Meta (CAPI) e GA4 (Measurement Protocol), com reenvio. Ingestão e webhooks só enfileiram; `dispatch()` roda a cada 5 s no servidor e no `/cron`.
- `src/cloudflare.js`: domínio do cliente na borda (Cloudflare for SaaS, custom hostnames). `src/routes/setup.js` + `src/views/setup.js`: assistente de 6 passos.
- Agências ([ADR 0009](docs/adr/0009-multi-cliente.md)): todo acesso a site, equipe e convite filtra por `agency_id`; `users.platform` é o dono da instalação.
- `src/pii.js` (cifra e hash de dados pessoais, `DATA_KEY`) e `src/crm.js` (contatos, colunas, evento offline por coluna, compra leva o contato para Ganhou). `src/routes/crm.js` é importado antes de `sales.js` por causa das rotas `/hooks/:token/leads` e `/meta-leads`.
- `src/whatsapp.js` + `src/routes/whatsapp.js`: link rastreável `/w/:slug` com código, webhook da Cloud API, conversas e sugestão de coluna ([ADR 0016](docs/adr/0016-whatsapp.md)). `routes/whatsapp.js` também vem antes de `sales.js`.
- `src/clients.js`: cliente com vários sites, um por funil ([ADR 0021](docs/adr/0021-cliente-com-varios-sites.md)). Visão somada em `/sites/~chave` (rotas com `client: true`, pedido repetido conta uma vez) e gasto da conta dividido pelo nome da campanha (`spend_rule`) em `syncMeta`.
- `src/license.js`: plano da instalação ([ADR 0022](docs/adr/0022-licenca-fair-core.md), licença FCL-1.0-MIT). Grátis abre 1 site no painel (os outros seguem coletando; rotas com `free: true` ficam abertas); Pro por chave Ed25519 validada offline ou teste de 7 dias, na tabela `install`. Chaves emitidas com `scripts/license.mjs` (chave privada fora do repositório). Nunca remova nem contorne essa checagem.
- `src/modules.js`: recursos liga/desliga por site ([ADR 0017](docs/adr/0017-recursos-modulares.md)). Rota com `module` dá 404 desligada; item do `NAV` com o 5º campo some do menu.
- `src/recovery.js` (venda pendente → `pending_orders` e sequência no WhatsApp, rodada em `runJobs`), `src/checkout.js` (BR Code do Pix e QR em SVG com `src/vendor/qrcode.cjs`, MIT), `src/routes/audiences.js` (CSV em SHA-256). Envio e robô em `src/whatsapp.js` (`sendWhatsapp`, `matchRule`).
- `src/routes/`: um arquivo por área; cada um registra as suas rotas com `route()`.
- `src/views/`: `ui.js` concentra o design system e os componentes; os demais arquivos são as páginas.
- `public/`: servido pela CDN na Vercel. `sw.js` (service worker: só estáticos e `offline.html`, nunca páginas com dados), `manifest.webmanifest` e `icons/` fazem o painel abrir como web app no celular. O snippet `s.js` (< 3,25 KB) é minificado à mão e servido aos sites pelo Worker.
- `docs/`: SPEC, deploy, integrações, design system, ADRs (próximo: `0024`), fluxo com skills.

## Regras
- Nome do produto: **Sinqfy** ([ADR 0023](docs/adr/0023-nome-sinqfy.md)). Não renomeie o que está no ar: Worker `trackify`, `data-rastro`, `window.rastro`, `_rid`, cabeçalhos `x-rastro-*`, usuário `rastro` do banco.
- Toda consulta é `await db.…`; consultas independentes vão em `Promise.all`/`awaitAll`.
- Escritas que precisam ser atômicas usam `db.batch([[sql, args], …])`.
- SQL de Postgres: datas em ms são `BIGINT`, sem recursos do SQLite. Em `ON CONFLICT … DO UPDATE`, qualifique as colunas da tabela (`sales.method`). Mudança de schema é aditiva (`ADD COLUMN IF NOT EXISTS`) no fim de `migrate()`.
- O schema não usa chave estrangeira: apague as tabelas filhas explicitamente (veja `SITE_TABLES` e `USER_TABLES` em `routes/admin.js`).
- Nada de estado em memória que precise valer entre instâncias serverless. Use o banco; o cache de `sites` é a exceção, com validade de 10 s.
- Trabalho assíncrono de um webhook (ex.: Conversions API) é **aguardado** antes de responder.
- Escape por padrão: monte HTML com o template `html`; `raw()` só para HTML gerado pelo próprio código.
- Nunca grave IP, e-mail ou telefone. PII do webhook, do formulário do site e do contato do CRM (pelo `rid`) só segue em hash para a Conversions API. Exceções: IP e user agent no payload da fila `deliveries` enquanto o envio está pendente ([ADR 0014](docs/adr/0014-fila-de-envio-server-side.md)); user agent, domínio e client_id do GA4 no evento, com consentimento, para casar a venda com o clique ([ADR 0015](docs/adr/0015-venda-casada-pelo-clique.md)); IP do clique no checkout cifrado com `seal()`, com cidade e UF, em `checkout_clicks` até o Purchase ou por 7 dias ([ADR 0020](docs/adr/0020-ip-do-checkout-no-purchase.md)). Contatos do CRM: nome, e-mail e telefone só cifrados com `seal()` e hash ao lado ([ADR 0013](docs/adr/0013-dados-pessoais-criptografados.md)); nunca em log, `crm_log` ou evento.
- Chaves vindas da query string que indexam objetos passam por `Object.hasOwn`. Nomes de coluna em SQL vêm de whitelists (`FILTERS`, `SALE_FILTERS`, `LEVELS`, `ATTR_DIMS`).
- Ao desestruturar um import dinâmico, `sites` perde o live binding. Use o namespace (`DB.sites`).
- Anúncios: só Meta ([ADR 0007](docs/adr/0007-anuncios-so-meta.md)), somente leitura ([ADR 0004](docs/adr/0004-meta-somente-leitura-e-csv.md)).
- Mapa de skills por tarefa: `docs/fluxo-com-skills.md`.
