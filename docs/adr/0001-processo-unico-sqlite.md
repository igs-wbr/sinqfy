# ADR 0001: Um processo Node com SQLite nativo

## Status
Parcialmente substituído pelo [ADR 0006](0006-vercel-turso-cron-externo.md): vale para o servidor local; em produção o Rastro roda na Vercel com Turso.

## Data
2026-10-07

## Contexto
O Rastro é para uso pessoal ou de equipes pequenas. Precisa ser trivial de hospedar, em uma VPS pequena atrás de um proxy reverso, com backup que seja só copiar um arquivo e quase nenhuma manutenção. Ele recebe beacons, webhooks e acessos ao painel no mesmo endereço.

## Decisão
Um único processo `node src/server.js`:

- `node:http` sem framework;
- `node:sqlite` (`DatabaseSync`, embutido no Node ≥ 22.13) em modo WAL;
- tarefas periódicas com `setInterval` dentro do próprio processo (`src/jobs.js`).

A única dependência é `nodemailer`.

## Alternativas consideradas

### Express ou Fastify + ORM
- Prós: ecossistema e middlewares prontos.
- Contras: dezenas de dependências para um roteador de ~20 rotas e consultas que são SQL direto.
- Rejeitado: o custo de manutenção e o risco de supply chain não se pagam nessa escala.

### PostgreSQL / ClickHouse
- Prós: escrita concorrente e análise colunar em volume.
- Contras: um segundo serviço para operar, fazer backup e atualizar.
- Rejeitado: o SQLite atende milhares de eventos por dia com folga. É o que o Plausible e o Umami fazem quando precisam de escala, e o README recomenda migrar para eles nesse caso.

## Consequências
- Funis, jornadas e atribuição são calculados em JS sobre os eventos do período. Isso fica marcado com `ponytail:` no código. Se ficar lento, o caminho é pré-agregar.
- Escrita serializada: um processo só. Não rode duas instâncias sobre o mesmo arquivo.
- Backup: `sqlite3 analytics.db ".backup copia.db"` ou copiar o arquivo com o processo parado.
