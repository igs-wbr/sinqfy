<p align="center"><img src="public/brand/trackify-logo-light.svg" alt="Trackify" height="56"></p>

<p align="center">Vendas, tráfego e campanhas da Meta num painel só, sem cookies de terceiros.</p>

<p align="center">
<a href="LICENSE"><img alt="Licença MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-0E58DB"></a>
<img alt="Node 24" src="https://img.shields.io/badge/node-24.x-171717">
<img alt="PostgreSQL" src="https://img.shields.io/badge/banco-PostgreSQL-171717">
</p>

## O que faz

- **Vendas:** faturamento, lucro, ROAS, ROI, CPA, reembolsos e Pix, cartão ou boleto, vindos dos webhooks da Hotmart, Kiwify, Eduzz ou de um formato genérico.
- **Anúncios:** gastos da Meta (API, somente leitura), cruzados com as vendas por campanha, conjunto e anúncio.
- **Tráfego:** visão geral, tempo real, funis, caminhos e atribuição, com visitante anônimo (hash com salt diário).
- **Envio server-side:** Conversions API da Meta e Measurement Protocol do GA4, com fila e reenvio.
- **Relacionamento:** CRM em quadro, contatos com dados pessoais cifrados e conversas do WhatsApp ligadas ao anúncio.
- **Agências:** vários clientes na mesma instalação, cada um com a sua equipe e os seus sites.

> Feito para uso pessoal e equipes pequenas, na faixa de milhares de visitas e centenas de vendas por dia. Funis, caminhos e atribuição são calculados a cada consulta.

## Rodar localmente

Requisitos: Node 24 e Docker (para o PostgreSQL).

```sh
npm install
docker run -d --name trackify-pg -p 55432:5432 -e POSTGRES_USER=rastro -e POSTGRES_PASSWORD=rastro -e POSTGRES_DB=rastro postgres:16
cp .env.example .env    # preencha ADMIN_EMAIL e ADMIN_PASSWORD
node --env-file=.env src/server.js   # http://127.0.0.1:8080
```

### Sem tela de login (ferramenta interna)

Com `LOGIN=off` no `.env`, o painel abre direto como o dono da instalação. Só funciona com o servidor preso ao próprio computador (`HOST=127.0.0.1`). Em qualquer outro endereço a variável é ignorada e o login continua, para não expor vendas e contatos na internet.

## Colocar no ar

Produção roda em Docker com PostgreSQL e Cloudflare Tunnel: passo a passo em [docs/deploy-oracle.md](docs/deploy-oracle.md). Depois, entre no painel e siga **Primeiros passos** e **Integrações** ([docs/integracoes.md](docs/integracoes.md)).

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Servidor: painel, beacons, webhooks e tarefas a cada 5 min |
| `npm test` | Testes ponta a ponta (`node:test`) com a Graph API da Meta simulada. Precisa do PostgreSQL local ou de `TEST_DATABASE_URL` |

## Estrutura

```
src/
  app.js server.js    handler único e servidor (node:http)
  http.js auth.js     rotas e respostas · sessão, papéis e LOGIN=off
  db.js time.js       pool pg, schema e migrações · fusos e períodos
  dispatch.js         fila de envio server-side (Meta CAPI e GA4)
  tracking/ sales/    ingestão e métricas de tráfego · webhooks e métricas de vendas
  ads/meta.js         sync de campanhas e gastos da Meta
  crm.js whatsapp.js  CRM e WhatsApp
  routes/ views/      rotas por área · páginas e design system (views/ui.js)
edge/                 Worker da Cloudflare (cookies primários)
deploy/               docker-compose, backup e dados de demonstração
public/               snippet s.js, fontes, favicon, manifest e marca (brand/)
docs/                 especificação, deploy, integrações, design system e ADRs
```

## Privacidade e segurança

- **Visitantes:** id em hash com salt diário, apagado no dia seguinte. IP, e-mail e telefone nunca são gravados ([ADR 0002](docs/adr/0002-sem-cookies-salt-diario.md)).
- **Contatos do CRM:** nome, e-mail e telefone cifrados com AES-256-GCM (`DATA_KEY`), com hash ao lado ([ADR 0013](docs/adr/0013-dados-pessoais-criptografados.md)).
- **Login:** cookie HttpOnly e SameSite, senhas em scrypt e bloqueio após 10 tentativas.
- **Requisições:** POST de outra origem recusado, CSP estrita com nonce e HTML sempre escapado.

Achou uma falha? Veja [SECURITY.md](SECURITY.md) antes de abrir uma issue.

## Contribuir

Issues e pull requests são bem-vindos. Leia o [guia de contribuição](CONTRIBUTING.md) e o [código de conduta](CODE_OF_CONDUCT.md).

## Criador

**Iegos Weber**

- Instagram: [@iegos_](https://instagram.com/iegos_)
- GitHub: [@igs-wbr](https://github.com/igs-wbr)
- E-mail: [iegosweber@gmail.com](mailto:iegosweber@gmail.com)

## Licença

[MIT](LICENSE) © 2026 Iegos Weber. Componentes de terceiros e as licenças deles estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
