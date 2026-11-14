# ADR 0010: PostgreSQL na VM da Oracle

## Status
Aceito. Substitui o [ADR 0006](0006-vercel-turso-cron-externo.md) e o que restava do [ADR 0001](0001-processo-unico-sqlite.md).

## Data
2026-11-14

## Contexto
O v2 vai receber eventos de vários clientes, guardar contatos do CRM e manter uma fila de envios para Meta, Google e TikTok com reenvio. O Turso (SQLite) tem um escritor por vez e não tem segurança por linha. O Neon gratuito tem 0,5 GB e hiberna. A VM ARM gratuita da Oracle (até 4 núcleos e 24 GB) aguenta Postgres, painel e despachante juntos.

## Decisão
- **Banco:** PostgreSQL 17 em Docker na VM da Oracle, com backup diário para o R2.
- **Cliente:** `pg` (node-postgres). `src/db.js` mantém a API `db.all/get/run/exec/batch`; o SQL continua com `?` e é convertido para `$N`.
- **Tipos:** datas em ms ficam em `BIGINT` (lidas como `number`), valores em `DOUBLE PRECISION`.
- **Acesso da borda:** o Worker da Cloudflare chega ao banco por Hyperdrive através de um Cloudflare Tunnel, sem abrir a porta 5432 na internet.
- **Testes:** cada arquivo de teste cria um schema próprio (`DATABASE_SCHEMA`) e o apaga no fim.
- **Painel:** sai da Vercel e roda em Docker na mesma VM, publicado pelo Tunnel. O `setInterval` do servidor local volta a valer para as tarefas; a rota `/cron` continua para chamadas externas.

## Alternativas consideradas
- **Turso:** sem RLS, um escritor por vez, plano gratuito com limite de linhas lidas.
- **Neon ou Supabase:** Postgres gerenciado, mas com limites gratuitos pequenos e hibernação. Continuam como plano B: basta trocar `DATABASE_URL`.

## Consequências
- Recursos só do SQLite saíram do código (`INSERT OR IGNORE`, `json_each`, colunas soltas no `GROUP BY`, `COLLATE NOCASE`).
- Upserts qualificam colunas da tabela (`sales.method`) porque o Postgres não aceita o nome solto no `DO UPDATE`.
- Precisamos cuidar da VM: atualizações, backup e monitoramento (o agente da etapa 9 vigia).
