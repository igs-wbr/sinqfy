<p align="center"><img src="public/brand/sinqfy-logo-light.svg" alt="Sinqfy" height="56"></p>

<p align="center">Vendas, tráfego e campanhas da Meta num painel só, sem cookies de terceiros.</p>

<p align="center">
<a href="https://github.com/igs-wbr/sinqfy/releases/tag/v1.0.0"><img alt="Versão 1.0.0" src="https://img.shields.io/badge/vers%C3%A3o-1.0.0-0E58DB"></a>
<a href="LICENSE"><img alt="Licença FCL-1.0-MIT (Fair Source)" src="https://img.shields.io/badge/licen%C3%A7a-FCL--1.0--MIT-0E58DB"></a>
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
- **Clientes com vários funis:** um site por produto, domínio ou faixa de preço, agrupados por cliente no seletor. A visão "Todos os funis" soma tudo sem contar duas vezes o mesmo pedido e compara faturamento, gasto, ROAS e lucro de cada funil; o gasto da conta de anúncios vai para o site de cada campanha ([ADR 0021](docs/adr/0021-cliente-com-varios-sites.md)).
- **Purchase de qualidade:** order bump e upsell viram uma compra só, o Purchase leva o clique, o IP do checkout e o endereço do comprador em hash, e venda que chega dias depois de aprovada não vira compra de hoje na Meta.

### Recursos que cada site liga quando quiser

Em **Configurações → Recursos** ([ADR 0017](docs/adr/0017-recursos-modulares.md)):

- **Recuperação de venda pendente:** boleto ou Pix gerado e não pago recebe uma sequência no WhatsApp (modelos aprovados pela Meta). Para quando paga, recusa ou a pessoa responde.
- **Públicos para remarketing:** CSV em SHA-256 de compradores, de quem não pagou e de cada coluna do CRM, para subir como público personalizado na Meta.
- **Retenção de vídeo:** eventos `video_25` a `video_100` dos vídeos do site, para usar nos funis.
- **Robô por palavra-chave:** resposta automática no WhatsApp quando a mensagem tem uma palavra-chave.
- **Checkout com Pix:** página de pagamento com Pix copia e cola e QR Code na sua chave, sem intermediador.

> Feito para uso pessoal e equipes pequenas, na faixa de milhares de visitas e centenas de vendas por dia. Funis, caminhos e atribuição são calculados a cada consulta.

## Rodar localmente

Requisitos: Node 24 e Docker (para o PostgreSQL).

```sh
npm install
docker run -d --name sinqfy-pg -p 55432:5432 -e POSTGRES_USER=rastro -e POSTGRES_PASSWORD=rastro -e POSTGRES_DB=rastro postgres:16
cp .env.example .env    # preencha ADMIN_EMAIL e ADMIN_PASSWORD
node --env-file=.env src/server.js   # http://127.0.0.1:8080
```

### Sem tela de login (ferramenta interna)

Com `LOGIN=off` no `.env`, o painel abre direto como o dono da instalação. Só funciona com o servidor preso ao próprio computador (`HOST=127.0.0.1`). Em qualquer outro endereço a variável é ignorada e o login continua, para não expor vendas e contatos na internet.

## Colocar no ar

Nunca configurou rastreamento? Comece pelo **[guia do iniciante](docs/guia-iniciante.md)**: ele leva do zero ao rastreamento funcionando e diz onde pegar cada token e ID.

| Guia | Para quê |
|---|---|
| [Guia do iniciante](docs/guia-iniciante.md) | As 7 etapas, na ordem, com o sinal de que cada uma deu certo |
| [Manual](docs/manual.md) | O que o sistema faz e para que serve cada tela |
| [Onde hospedar](docs/hospedagem.md) | Qualquer VPS com Docker; Oracle, Cloudflare e Vercel são exemplos |
| [Servidor na Oracle](docs/deploy-oracle.md) | Exemplo completo com a VPS grátis da Oracle, tela por tela |
| [Cloudflare](docs/guia-cloudflare.md) | Domínio, túnel do painel e subdomínio de rastreamento `t.` |
| [Integrações](docs/integracoes.md) | Referência técnica de cada integração |

![Como o dado anda: anúncio, site, subdomínio t., painel, checkout e a volta para a Meta](docs/img/fluxo-dos-dados.svg)

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
  clients.js          cliente com vários sites (visão somada e gasto por funil)
  license.js          plano Grátis ou Pro (chave assinada, validada offline)
  routes/ views/      rotas por área · páginas e design system (views/ui.js)
edge/                 Worker da Cloudflare (cookies primários)
deploy/               docker-compose, backup e dados de demonstração
scripts/              emissão de chaves do Pro (só o autor, com a chave privada)
public/               snippet s.js, fontes, favicon, manifest e marca (brand/)
docs/                 especificação, deploy, integrações, design system e ADRs
```

## Privacidade e segurança

- **Visitantes:** id em hash com salt diário, apagado no dia seguinte. E-mail e telefone nunca são gravados em claro ([ADR 0002](docs/adr/0002-sem-cookies-salt-diario.md)). O IP só existe na fila de envio até sair para a Meta e, o do clique no checkout, cifrado por no máximo 7 dias ([ADR 0020](docs/adr/0020-ip-do-checkout-no-purchase.md)).
- **Contatos do CRM:** nome, e-mail e telefone cifrados com AES-256-GCM (`DATA_KEY`), com hash ao lado ([ADR 0013](docs/adr/0013-dados-pessoais-criptografados.md)).
- **Login:** cookie HttpOnly e SameSite, senhas em scrypt e bloqueio após 10 tentativas.
- **Requisições:** POST de outra origem recusado, CSP estrita com nonce e HTML sempre escapado.

Achou uma falha? Veja [SECURITY.md](SECURITY.md) antes de abrir uma issue.

## Contribuir

Issues e pull requests são bem-vindos. Leia o [guia de contribuição](CONTRIBUTING.md) e o [código de conduta](CODE_OF_CONDUCT.md).

## Versões

O que mudou em cada versão está no [CHANGELOG](CHANGELOG.md) e nos [releases](https://github.com/igs-wbr/sinqfy/releases).

## Criador

**Iegos Weber**

- Instagram: [@iegos_](https://instagram.com/iegos_)
- GitHub: [@igs-wbr](https://github.com/igs-wbr)
- E-mail: [contato@sinqfy.app](mailto:contato@sinqfy.app)

## Planos

- **Grátis, para sempre:** 1 site (1 funil) com todos os recursos.
- **Pro, R$ 45 em pagamento único:** sites ilimitados, visão somada por cliente, até 2 instalações, vitalício (atualizações e uso para sempre, sem mensalidade) e 7 dias de teste grátis. A chave é ativada em Plano, no menu da conta, e validada sem depender de internet.

## Licença

[Fair Core License 1.0, com MIT futura (FCL-1.0-MIT)](LICENSE) © 2026 Iegos Weber. É Fair Source: o código é aberto para ler, usar, alterar e redistribuir, inclusive em uso comercial próprio, só não para oferecer um produto ou serviço concorrente. Os recursos do plano Pro são liberados por chave de licença, que não pode ser contornada. Cada versão vira MIT dois anos depois de publicada. Agências podem dar acesso aos próprios clientes (permissão adicional no fim do [LICENSE](LICENSE)). Decisão em [ADR 0022](docs/adr/0022-licenca-fair-core.md).

Componentes de terceiros e as licenças deles estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
