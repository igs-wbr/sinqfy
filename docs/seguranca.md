# Segurança do Sinqfy

Como o sistema se protege, o resultado da última auditoria e o que conferir de tempos em tempos. Para relatar uma falha, veja o [SECURITY.md](../SECURITY.md).

## Como o sistema se protege

| Área | Proteção |
|---|---|
| **Segredos** | Nenhuma chave no código. Tudo vem do `.env` (fora do Git) ou dos segredos da Cloudflare e do GitHub. Os arquivos `.env`, `deploy/.env`, `deploy/.env.local` e `.wrangler/` estão no `.gitignore` |
| **Login** | Senha com scrypt, cookie de sessão HttpOnly, SameSite=Lax e Secure, bloqueio por 15 minutos depois de 10 erros (por IP e por e-mail, guardado no banco). O primeiro admin não nasce com senha curta nem com a de exemplo |
| **Páginas** | HTML sempre escapado, CSP estrita com nonce (nenhum script de terceiro), `frame-ancestors 'none'`, HSTS em produção, POST de outro site recusado |
| **Dados pessoais** | Nome, e-mail e telefone cifrados com AES-256-GCM (`DATA_KEY`), com índice cego ao lado. Para a Meta, só SHA-256. E-mail de visitante nunca é gravado; IP só do clique no checkout, cifrado, até o Purchase ou por 7 dias (ADR 0020) |
| **Webhooks** | URL com token por site e plataforma; assinatura conferida quando a plataforma oferece (Hotmart, Shopify, WooCommerce, Stripe, WhatsApp, Lead Ads) |
| **Borda (Worker)** | Repassa ao painel com `EDGE_SECRET`; cabeçalhos da borda vindos de fora são descartados; limite de 120 eventos por minuto por IP; o painel só aparece no `PANEL_HOST` |
| **Servidor** | Nenhuma porta aberta além do SSH: tudo entra pelo túnel. O app roda como usuário sem privilégio no contêiner. O banco não é publicado na rede |
| **Permissões** | Agências isoladas; papéis Dono, Gestor e Cliente; tokens da Meta nunca são exibidos |
| **Dependências** | Só `pg`. Dependabot ligado no GitHub |

## Auditoria de 16/11/2026

Varredura do código atual e de **todo o histórico do Git** procurando os valores reais do `.env` (senha do admin, `CRON_SECRET`, `EDGE_SECRET`, `DATA_KEY`) e padrões de token (Meta, GitHub, Stripe, AWS, Google, Slack, chaves privadas): **nada encontrado**. `npm audit`: 0 vulnerabilidades.

### Corrigido na auditoria

| Achado | Correção |
|---|---|
| Banco de desenvolvimento publicado em todas as interfaces (`0.0.0.0:55432`) com senha fraca | Recriado preso a `127.0.0.1`, no mesmo volume de dados |
| Banco e página de demonstração sem reinício automático (ficavam fora do ar depois de religar o Docker) | `restart: unless-stopped` nos dois |
| Worker `trackify` com URLs de prévia ligadas (cada versão ganhava um endereço público extra) | Desligadas na conta e `preview_urls = false` no `wrangler.toml` |
| Sem HSTS | `Strict-Transport-Security` quando `COOKIE_SECURE=1` |
| Primeiro admin aceitava qualquer senha, inclusive a de exemplo | Exige 12 caracteres ou mais e recusa a de exemplo |
| Alertas do Dependabot desligados | Ligados |
| Worker antigo `rastro-edge-teste` com o `EDGE_SECRET` em texto aberto, e `trackify-edge` sem uso | Os dois apagados e o `EDGE_SECRET` trocado no painel e no Worker `trackify` |

### Pendente (depende do dono da conta)

| Prioridade | O que fazer | Por quê |
|---|---|---|
| Média | Ligar a verificação em duas etapas (2FA) no GitHub, na Cloudflare e na Oracle | Quem entra nessas contas controla o sistema |
| Média | Rodar `npx wrangler logout` quando não estiver publicando | O login do wrangler nesta máquina dá acesso à conta da Cloudflare |
| Baixa | Antes de tornar o repositório público: decidir o e-mail dos commits (`git config user.email`) e ligar a proteção da branch `main` | O histórico mostra o e-mail do autor; a proteção da branch só existe em repositório público ou no GitHub Pro |

## Checagem periódica

- [ ] `npm audit` sem vulnerabilidades e alertas do Dependabot resolvidos.
- [ ] Nenhum Worker com segredo em `plain_text` (Cloudflare → Workers → Settings → Variables).
- [ ] Backup do dia no R2 e um teste de restauração por mês ([guia da Oracle, parte 10](deploy-oracle.md#parte-10-backup-diário-no-r2)).
- [ ] `docker compose ps` com os três serviços `running` e a VPS atualizada (`sudo apt update && sudo apt upgrade`).
- [ ] Equipe: quem saiu da agência foi removido em **Equipe**.

## Trocar um segredo

| Segredo | Onde trocar | Efeito |
|---|---|---|
| `EDGE_SECRET` | `.env` do painel e `npx wrangler secret put EDGE_SECRET` no Worker | Eventos param entre a troca de um e do outro; faça os dois em seguida |
| `CRON_SECRET` | `.env` do painel | Só afeta quem chama `/cron` |
| Token de webhook | **Integrações** → Gerar novo token | URLs antigas param: recadastre nas plataformas |
| Token da Meta ou do WhatsApp | Gere outro na Meta e cole no painel | Imediato |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (revogue o velho) e GitHub → Settings → Secrets | Só o deploy automático |
| `DATA_KEY` | **Não troque** sem migrar os dados: os contatos cifrados com a chave antiga ficariam ilegíveis | |
