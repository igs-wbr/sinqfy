# Changelog

Mudanças de cada versão do Sinqfy. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Novo
- Google Ads em Integrações: compras aprovadas e eventos escolhidos vão ao Google Ads como conversões, pela Data Manager API, com `gclid`/`gbraid`/`wbraid` e e-mail e telefone em SHA-256. Order bump e upsell do mesmo comprador viram uma conversão só, como na Meta, e quem clicou em anúncio da Meta e do Google tem a compra enviada só para o último clique. Login por conta de serviço do Google Cloud, com a chave cifrada no banco (ADR 0024).

### Melhorou
- Purchase na Meta: quando a venda não traz endereço e não há local do clique no checkout, a UF vai pelo DDD do celular brasileiro (em hash), o que melhora a qualidade da correspondência das compras sem clique.
- Webhook personalizado: campos novos para o sobrenome (somado ao nome) e o país do comprador, como no webhook V2 da OnProfit (`customer.lastname`, `customer_address.country`). "Brasil" por extenso vira BR.

### Documentação
- ADR 0019 e guia: a espera do Purchase para somar order bump e upsell é de 5 minutos (era 15 na documentação). O ADR explica que um pedido do mesmo comprador que chega depois do envio perde só o valor na Meta, não a conversão nem a atribuição.

## [1.1.0] - 2026-11-23

### Mudou
- O produto agora se chama **Sinqfy**. Logotipo novo no mesmo desenho do anterior (símbolo, azul e traço iguais, letras novas), em todas as variações, no painel, no app instalável e na documentação. Arquivos da marca renomeados para `sinqfy-*`.
- O repositório passou a ser `igs-wbr/sinqfy` (o endereço antigo redireciona).

### Mantido de propósito
- Nada muda nos sites que já rastreiam: `data-rastro`, `window.rastro`, o cookie `_rid` e os cabeçalhos da borda continuam iguais, e o Worker da Cloudflare segue com o nome `trackify` (as rotas dos domínios dos clientes apontam para ele). Detalhes no ADR 0023.

## [1.0.0] - 2026-11-23

Primeira versão estável, em produção desde 17/11/2026.

### Vendas e anúncios
- Resumo com faturamento líquido e bruto, gastos, ROAS, lucro, ROI, CPA, ticket médio, reembolsos e chargeback, comparando com o período anterior.
- Webhooks da Hotmart, Kiwify, Eduzz, Shopify, WooCommerce e Stripe, formato genérico, mapa de campos personalizado e Google Sheets, com assinatura conferida.
- Campanhas, conjuntos e anúncios da Meta (somente leitura) cruzados com as vendas pela UTM, com funil e gargalo por campanha.
- Pedidos, vendas por forma de pagamento, origem por campanha e fonte, produtos e plataformas.

### Envio server-side
- Conversions API da Meta e Measurement Protocol do GA4, com fila, reenvio e diagnóstico por evento.
- PageView, InitiateCheckout, Lead e Purchase; order bump e upsell do mesmo comprador viram uma compra só, com o valor somado.
- Purchase com o clique do anúncio (fbc, fbp, user agent), o IP do checkout e cidade, UF e CEP do comprador, sempre em hash.
- Venda aprovada há mais de 3 dias (ex.: "Compra completa" da Hotmart no fim da garantia) é gravada, mas não vai à Meta nem ao GA4 como compra de hoje.

### Tráfego
- Visão geral, tempo real, eventos, funis, caminhos e atribuição por sequência de anúncios, com visitante anônimo e cookies primários pelo subdomínio `t.` (Worker da Cloudflare).

### Relacionamento
- CRM em quadro, contatos com dados pessoais cifrados, evento offline por coluna e conversas do WhatsApp ligadas ao anúncio.
- Recursos por site: recuperação de venda pendente, públicos para remarketing, retenção de vídeo, robô por palavra-chave e checkout com Pix.

### Agências e clientes
- Várias agências na mesma instalação, cada uma com equipe, papéis e sites próprios.
- Cliente com vários sites (um por funil): seletor agrupado por cliente, visão "Todos os funis" sem pedido duplicado, comparação dos funis e gasto da conta dividido pelo nome da campanha.
- Painel instalável no celular (PWA) e link público de tráfego somente leitura.

### Licença e planos
- Licença Fair Core 1.0 com MIT futura (FCL-1.0-MIT): uso livre, sem revenda concorrente; cada versão vira MIT dois anos depois.
- Plano Grátis com 1 site e todos os recursos; Pro por pagamento único (R$ 97) com sites ilimitados, até 2 instalações, 12 meses de atualizações e 7 dias de teste. Chave assinada e validada offline.

[1.1.0]: https://github.com/igs-wbr/sinqfy/releases/tag/v1.1.0
[1.0.0]: https://github.com/igs-wbr/sinqfy/releases/tag/v1.0.0
