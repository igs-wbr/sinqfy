# Documentação

| Documento | Para quê |
|---|---|
| [SPEC.md](SPEC.md) | O que o Rastro faz, definições das métricas, modelo de dados, fora do escopo |
| [deploy-vercel.md](deploy-vercel.md) | Colocar no ar: Vercel + Turso + cron de hora em hora + domínio na Cloudflare |
| [integracoes.md](integracoes.md) | Snippet, template de UTM, webhooks (Hotmart, Kiwify, Eduzz, genérico), Meta, Conversions API |
| [design-system.md](design-system.md) | Digital Naturalism: tokens, tipografia, elementos de assinatura, paleta de gráficos validada |
| [fluxo-com-skills.md](fluxo-com-skills.md) | Qual skill ou plugin do Claude Code usar em cada tipo de tarefa |
| [adr/](adr/) | Decisões de arquitetura e por que foram tomadas |

## Decisões (ADRs)

1. [Um processo Node com SQLite nativo](adr/0001-processo-unico-sqlite.md) (parcialmente substituído pelo 6)
2. [Visitante por hash com salt diário, sem cookies](adr/0002-sem-cookies-salt-diario.md)
3. [Vendas por webhook, ligadas às campanhas pela chave da UTM](adr/0003-vendas-por-webhook-e-chave-utm.md)
4. [Meta somente leitura; demais plataformas por CSV](adr/0004-meta-somente-leitura-e-csv.md) (CSV substituído pelo 7)
5. [Interface renderizada no servidor, sem framework](adr/0005-ui-renderizada-no-servidor.md)
6. [Produção na Vercel com Turso e cron externo](adr/0006-vercel-turso-cron-externo.md)
7. [Anúncios só da Meta, por enquanto](adr/0007-anuncios-so-meta.md)
8. [Sem e-mail: o painel se atualiza sozinho](adr/0008-sem-email.md)
