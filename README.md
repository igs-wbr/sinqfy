# Rastro

Vendas, tráfego e campanhas da Meta em um painel só, **sem cookies**.

- **Vendas:** faturamento, lucro, ROAS, ROI, CPA, reembolsos e Pix/cartão/boleto, vindos de webhooks da Hotmart, Kiwify, Eduzz ou de um formato genérico.
- **Anúncios:** gastos da Meta (API, somente leitura), cruzados com as vendas por campanha, conjunto e anúncio.
- **Tráfego:** analytics com visão geral, tempo real, funis, jornadas e atribuição.

Em produção, roda na **Vercel** com o banco **Turso**; para desenvolvimento, `npm start` sobe tudo local. A interface segue o design system *Digital Naturalism*.

> **Nota honesta:** o Rastro foi feito para uso pessoal e equipes pequenas, na faixa de milhares de visitas e centenas de vendas por dia. Funis, jornadas e atribuição são calculados a cada consulta. Com tráfego sério, use um [Plausible](https://github.com/plausible/analytics) ou [Umami](https://github.com/umami-software/umami) para o tráfego, e uma ferramenta comercial de tracking de vendas para o que ficou de fora: Google, TikTok e Kwai, e pausar campanhas.

## Colocar no ar

O passo a passo está em **[docs/deploy-vercel.md](docs/deploy-vercel.md)**. Em resumo:

1. Crie um banco no Turso.
2. Suba o código para o GitHub e importe na Vercel com as variáveis do `.env.example`.
3. Aponte o domínio pela Cloudflare.
4. Ative o cron de hora em hora (o workflow do GitHub Actions já vem pronto). Ele sincroniza os gastos da Meta; as telas de Vendas recarregam sozinhas a cada hora.

Depois, entre no painel e siga a tela **Integrações**: snippet, template de UTM, webhook da plataforma de vendas e conta da Meta. Detalhes em [docs/integracoes.md](docs/integracoes.md).

## Rodar localmente

```sh
npm install
cp .env.example .env       # ADMIN_EMAIL, ADMIN_PASSWORD
npm start                  # http://127.0.0.1:8080 (banco em analytics.db)
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Servidor local: painel, beacons, webhooks e tarefas a cada 5 min |
| `npm test` | 20 testes ponta a ponta (`node:test`), com a API da Meta simulada |

## Estrutura

```
api/index.js          função da Vercel (reaproveita src/app.js)
vercel.json           rotas, CDN de public/, cache
src/
  app.js              handler: estáticos, beacon /e, despacho, CSRF
  server.js           servidor local (node:http) + tarefas a cada 5 min
  http.js auth.js     rotas/respostas · sessão e papéis
  db.js time.js       cliente libSQL, schema e migrações · fusos e períodos
  jobs.js             tarefas do /cron: sync da Meta e limpeza
  tracking/           ingestão de beacons + consultas de tráfego
  sales/              webhooks das plataformas + métricas de vendas
  ads/meta.js         Meta: sync de campanhas e gastos + Conversions API
  routes/             auth · admin (inclui /cron) · traffic · sales
  views/              ui.js (design system e componentes) + páginas por área
public/               s.js (snippet), fontes, ícone, manifest
tests/                tracking · sales · app (+ helpers)
docs/                 SPEC · deploy · integrações · design system · ADRs · fluxo com skills
.github/workflows/    cron.yml: chama /cron de hora em hora
```

## Privacidade e segurança

- **Visitantes:** o id é um hash com salt diário aleatório, que é apagado no dia seguinte. IP, e-mail e telefone nunca são gravados ([ADR 0002](docs/adr/0002-sem-cookies-salt-diario.md)).
- **Login:** sessão com cookie HttpOnly e SameSite, senhas em scrypt e bloqueio após 10 tentativas (guardado no banco, então vale entre instâncias).
- **Requisições:** POSTs de outra origem são recusados; a CSP é estrita, com nonce, e todo o HTML é escapado.
- **Tokens:** os da Meta ficam no banco e nunca são exibidos. As URLs de webhook usam um token por site que pode ser trocado a qualquer momento, e `/cron` exige `CRON_SECRET`.

Mais em [docs/](docs/README.md): especificação, métricas, design system, decisões (ADRs) e o [mapa de skills do Claude Code](docs/fluxo-com-skills.md) para evoluir o projeto.
