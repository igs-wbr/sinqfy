# ADR 0006: Produção na Vercel com Turso e cron externo

## Status
Substituído pelo [ADR 0010](0010-postgres-na-oracle.md) em 2026-11-14. Aceito. Substitui parcialmente o [ADR 0001](0001-processo-unico-sqlite.md): o processo único com `node:sqlite` passa a valer só para desenvolvimento local.

## Data
2026-10-07

## Contexto
O Rastro precisa ficar online 24h para receber beacons e webhooks a qualquer hora. O usuário já tem Cloudflare e Supabase, prefere não administrar servidor e escolheu a Vercel como hospedagem. Funções serverless não têm disco persistente nem processo sempre ligado, então o arquivo SQLite e o `setInterval` do ADR 0001 deixam de funcionar.

## Decisão
- **Hospedagem:** uma função Node na Vercel (`api/index.js`) reaproveita o mesmo handler do servidor local (`src/app.js`). O `public/` é servido pela CDN.
- **Banco:** Turso (libSQL), via `@libsql/client`. Em desenvolvimento e testes, o mesmo cliente abre um arquivo local (`file:`). Todas as consultas passaram a ser assíncronas.
- **Tarefas periódicas:** a rota `GET /cron`, protegida por `Authorization: Bearer CRON_SECRET`, é chamada de hora em hora por um agendador externo (GitHub Actions ou cron-job.org). O formato é o mesmo do Vercel Cron, caso o projeto passe para o plano Pro.
- **Ajustes para serverless:**
  - cache de sites recarregado a cada 10 s;
  - bloqueio de força bruta guardado no banco (`login_fails`), e não em memória;
  - a Conversions API é aguardada antes de responder o webhook;
  - exclusões em cascata feitas explicitamente, porque `PRAGMA foreign_keys` não persiste entre requisições no Turso.

## Alternativas consideradas

### Cloudflare Workers + D1
- Prós: o D1 também é SQLite e o plano gratuito é generoso.
- Contras: exige portar para o runtime do Workers (sem `node:http`, sem nodemailer).
- Não escolhido pelo usuário. Continua viável: as consultas já são assíncronas e compatíveis com SQLite.

### Supabase (Postgres)
- Prós: o usuário já tem conta.
- Contras: reescrever o SQL (upserts, `json_each`, funções de data) e adicionar o driver `pg`.
- Rejeitado: o Turso mantém o dialeto SQLite sem mudanças.

### Vercel Cron no plano Hobby
- Contras: roda só uma vez por dia, o que deixaria os gastos da Meta com até 24 h de atraso.
- Rejeitado em favor do cron externo gratuito de hora em hora.

## Consequências
- Cada página faz várias consultas pela rede, por isso foram paralelizadas com `Promise.all`. A latência depende de deixar Turso e Vercel na mesma região.
- O plano Hobby da Vercel não permite uso comercial; para vender, use o Pro.
- O servidor local (`npm start`) continua funcionando sem conta em lugar nenhum, usando o banco em arquivo.
