# Deploy: Vercel + Turso

O Rastro roda como uma função serverless na Vercel. O banco é o Turso (libSQL, compatível com SQLite). Um cron externo dispara as tarefas de hora em hora. Nenhum servidor para manter.

```
visitante ──beacon──▶ Vercel (api/index.js) ──▶ Turso
Hotmart/Kiwify ─webhook─▶ │
cron externo   ─/cron (de hora em hora)─▶ │──▶ Meta Marketing API
```

> **Plano da Vercel:** o plano Hobby (gratuito) é **apenas para uso não comercial**. Se o Rastro rastreia as vendas do seu negócio, use o plano Pro.

## 1. Banco no Turso

1. Crie a conta em [turso.tech](https://turso.tech) e um banco. Pelo painel ou pela CLI:
   ```sh
   turso db create rastro
   turso db show rastro --url        # libsql://rastro-<usuario>.turso.io
   turso db tokens create rastro     # token de acesso
   ```
2. Escolha uma região próxima da região das funções da Vercel. O padrão da Vercel é Washington (`iad1`), e no Turso a equivalente é `aws-us-east-1`. Cada página do painel faz várias consultas, então a distância entre os dois pesa.

As tabelas são criadas sozinhas no primeiro acesso.

## 2. Código no GitHub

Suba a pasta do projeto para um repositório privado. O `.gitignore` já exclui `node_modules`, `.env` e bancos locais.

## 3. Projeto na Vercel

1. **Add New → Project**, importe o repositório.
2. Use **Framework Preset: Other**, deixe o build command vazio e mantenha o output directory `public` (já vem do `vercel.json`).
3. Em **Environment Variables**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `libsql://rastro-<usuario>.turso.io` |
| `DATABASE_AUTH_TOKEN` | o token do Turso |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | o primeiro admin (só vale com o banco vazio) |
| `PUBLIC_URL` | `https://stats.seudominio.com` (sem barra no final) |
| `TRUST_PROXY` | `1` |
| `CRON_SECRET` | uma string aleatória longa (ex.: `openssl rand -hex 32`) |
| `DEFAULT_TIMEZONE` | `America/Sao_Paulo` |

4. Faça o deploy e abra a URL `*.vercel.app`. A tela de login deve aparecer.

## 4. Domínio (com Cloudflare)

1. Na Vercel, abra **Settings → Domains** e adicione `stats.seudominio.com`.
2. Na Cloudflare, crie um **CNAME** `stats` apontando para `cname.vercel-dns.com`, com a **nuvem cinza (DNS only)**. A Vercel emite o certificado sozinha. Com o proxy laranja ligado, a emissão e o IP dos visitantes podem dar problema.
3. O país do visitante vem do cabeçalho `x-vercel-ip-country`, sem precisar do proxy da Cloudflare.

## 5. Cron de hora em hora

O sync da Meta (gastos, campanhas, status) roda quando alguém chama `GET /cron` com o cabeçalho `Authorization: Bearer <CRON_SECRET>`. Sem o segredo, a rota responde 404.

O workflow do GitHub Actions que fazia isso foi removido em 15/11/2026: na instalação em Docker ([deploy-oracle.md](deploy-oracle.md)) o próprio servidor roda as tarefas a cada 5 minutos. Na Vercel, use um agendador externo, como o [cron-job.org](https://cron-job.org): crie um job para `https://stats.seudominio.com/cron`, a cada hora, com o cabeçalho `Authorization: Bearer <CRON_SECRET>`.

A resposta é um JSON como `{"meta":1,"errors":[]}`, e os erros também aparecem nos logs da Vercel. As telas Resumo e Campanhas recarregam sozinhas a cada hora e mostram o horário do último sync.

## 6. Conectar tudo

Entre com o admin, crie o site e siga a tela **Integrações** (detalhes em [integracoes.md](integracoes.md)):

1. Snippet no `<head>` do site.
2. Template de UTM nos anúncios da Meta.
3. URL de webhook na Hotmart, Kiwify ou Eduzz.
4. Conta de anúncios da Meta (token `ads_read`).
5. Opcional: Conversions API.

## Desenvolvimento local

Sem `DATABASE_URL`, o Rastro usa o arquivo `analytics.db` (libSQL local) e roda as tarefas a cada 5 minutos dentro do próprio processo:

```sh
npm install
cp .env.example .env   # ADMIN_EMAIL, ADMIN_PASSWORD
npm start              # http://127.0.0.1:8080
```

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Página de erro em todas as rotas | `DATABASE_URL` ou `DATABASE_AUTH_TOKEN` errados, ou falta `ADMIN_EMAIL`/`ADMIN_PASSWORD` no primeiro deploy. Veja os logs da função |
| Formulários ou webhooks chegam vazios | Defina `NODEJS_HELPERS=0` nas variáveis da Vercel (desliga o pré-processamento do corpo da requisição) |
| Gastos da Meta não atualizam | O cron não está chamando `/cron`. Veja o histórico do cron-job.org |
| Painel lento | Turso e funções em regiões distantes; aproxime as regiões |
