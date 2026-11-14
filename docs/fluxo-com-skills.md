# Fluxo de trabalho com skills e plugins

Este guia diz que skill ou plugin do Claude Code usar em cada tipo de tarefa neste projeto. Os comandos são digitados no chat do Claude Code.

## Por tipo de tarefa

| Tarefa | Use | Por quê |
|---|---|---|
| Ideia nova ainda vaga | `/agent-skills:idea-refine` ou `agent-skills:interview-me` | Fecha o "para quem" e o "por quê" antes de escrever código |
| Feature nova | `/agent-skills:spec` → `/agent-skills:plan` → `/agent-skills:build` | Atualize o [SPEC](SPEC.md) primeiro, quebre em tarefas, implemente em fatias testáveis |
| Decisão difícil de reverter | `agent-skills:documentation-and-adrs` | Novo arquivo em [`docs/adr/`](adr/), na sequência `0006-…` |
| Mudança de lógica ou bug | `/agent-skills:test` | Teste falhando primeiro, em `tests/*.test.js` (`node:test`) |
| Gráfico novo ou cor nova | `dataviz` | Rode o `validate_palette.js` antes de usar uma cor de série. Veja o [design system](design-system.md) |
| Tela nova ou ajuste visual | `agent-skills:frontend-ui-engineering` + [design system](design-system.md) | Reuse os componentes de `src/views/ui.js` (`kpi`, `list`, `tabs`, `chart`, `donut`, `pageHead`) |
| Ver a mudança rodando | `/run` | Sobe o servidor e confere na interface real |
| Antes de juntar | `/code-review` e `/agent-skills:review` | Correção, legibilidade, arquitetura, segurança e desempenho |
| Algo mexe com dados de terceiros | `/security-review` + `agent-skills:security-and-hardening` | Webhooks, tokens, CSV, login: tudo que vem de fora |
| Ficou complicado demais | `/ponytail:ponytail-review` ou `/ponytail:ponytail-audit` | Procura o que dá para apagar ou trocar por recurso nativo |
| Atalhos deliberados | `/ponytail:ponytail-debt` | Lista os comentários `ponytail:` (limites conhecidos e quando atacar) |
| Vai para produção | `/agent-skills:ship` | Checklist de lançamento: proxy, HTTPS, backup, variáveis |
| Lento | `agent-skills:performance-optimization` | Comece pelos pontos marcados `ponytail:` em `src/tracking/stats.js` |
| Entender o código | `/graphify` | Grafo de conhecimento do repositório |

## Convenções que essas skills devem respeitar

- **Nenhuma dependência nova** sem um ADR. Hoje é só o `@libsql/client` (banco).
- **Nada de dados pessoais no banco.** Nem IP, nem e-mail, nem telefone ([ADR 0002](adr/0002-sem-cookies-salt-diario.md), [ADR 0003](adr/0003-vendas-por-webhook-e-chave-utm.md)).
- **Escape por padrão.** Use o template `html`, e `raw()` só para HTML que o próprio código gerou ([ADR 0005](adr/0005-ui-renderizada-no-servidor.md)).
- **Somente leitura nas contas de anúncio** ([ADR 0004](adr/0004-meta-somente-leitura-e-csv.md)).
- **Textos da interface em PT-BR.**
- **Cada lógica nova deixa um teste** no arquivo da sua área: `tests/tracking`, `tests/sales` ou `tests/app`.
