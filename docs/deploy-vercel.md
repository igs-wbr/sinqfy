# Vercel: o painel sem servidor, com limites

Alternativa à VPS ([comparação](hospedagem.md#e-a-vercel)). O painel roda como função serverless na Vercel (`api/index.js`), com um PostgreSQL gerenciado. Serve para testar ou para operações pequenas.

> **Antes de escolher:** o plano gratuito (Hobby) da Vercel é **só para uso não comercial**. E como não há processo ligado, os envios para a Meta e o GA4, a recuperação de vendas e a sincronização dos anúncios só rodam quando um agendador chama `/cron`.

```
visitante ──evento──▶ Vercel (api/index.js) ──▶ PostgreSQL gerenciado (Neon, Supabase...)
Hotmart, Kiwify... ──webhook──▶ │
agendador externo ──/cron a cada 5 a 15 min──▶ │──▶ Meta e GA4
```

## 1. Banco PostgreSQL gerenciado

Crie um banco num serviço com plano gratuito, como **Neon** (neon.tech) ou **Supabase** (supabase.com), e copie a **connection string** (`postgres://usuario:senha@host/banco?sslmode=require`). No Neon, prefira a versão com **pooler**, que aguenta melhor muitas funções ao mesmo tempo. Escolha a região mais perto da região das funções da Vercel (padrão: Washington, `iad1`).

As tabelas são criadas sozinhas no primeiro acesso.

## 2. Projeto na Vercel

1. **Add New → Project** e importe o repositório do GitHub.
2. **Framework Preset: Other**, build command vazio; o resto vem do `vercel.json`.
3. Em **Environment Variables**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a connection string do passo 1 |
| `ADMIN_EMAIL` e `ADMIN_PASSWORD` | o primeiro admin (senha com 12 caracteres ou mais) |
| `PUBLIC_URL` | `https://app.seudominio.com.br` (sem barra no fim) |
| `TRUST_PROXY` e `COOKIE_SECURE` | `1` |
| `CRON_SECRET` e `DATA_KEY` | `openssl rand -hex 32` cada um. Guarde a `DATA_KEY` fora da Vercel |
| `DEFAULT_TIMEZONE` | `America/Sao_Paulo` |
| `NODEJS_HELPERS` | `0` (sem isso, formulários e webhooks chegam vazios) |

4. Deploy e abra a URL `*.vercel.app`: a tela de login deve aparecer.

## 3. Domínio

Na Vercel, **Settings → Domains** → adicione `app.seudominio.com.br` e crie no seu DNS o registro que ela mostrar. Na Cloudflare, use a nuvem **cinza** (DNS only).

## 4. Agendador para o `/cron`

Crie um job num agendador externo (ex.: **cron-job.org**, gratuito) chamando `https://app.seudominio.com.br/cron` com o cabeçalho `Authorization: Bearer <CRON_SECRET>`. A cada **5 a 15 minutos** se usar a Conversions API ou a recuperação; a cada hora se for só a sincronização dos anúncios. Sem o segredo, a rota responde 404.

A resposta é um JSON como `{"meta":1,"errors":[],...}`; os erros também aparecem nos logs da Vercel.

## 5. Conectar tudo

Siga o [guia do iniciante](guia-iniciante.md) a partir da etapa 2.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Erro em todas as páginas | `DATABASE_URL` errada ou falta o admin no primeiro deploy. Veja os logs da função |
| Formulários ou webhooks chegam vazios | Falta `NODEJS_HELPERS=0` |
| Eventos demoram a aparecer na Meta | O agendador roda pouco; diminua o intervalo do `/cron` |
| "too many connections" no banco | Use a connection string com pooler |
| Painel lento | Banco e funções em regiões distantes |
