# ADR 0024: Conversões no Google Ads pela Data Manager API

## Status
Aceito.

## Data
2026-11-23

## Contexto
O Sinqfy já envia conversões para a Meta (Conversions API) e o GA4 (Measurement Protocol). Faltava o Google Ads: quem anuncia lá precisa que a compra do webhook e o lead do site cheguem à campanha com o clique do anúncio (`gclid`, `gbraid`, `wbraid`), que o snippet já guarda nos eventos.

O caminho antigo, `customers:uploadClickConversions` da Google Ads API, não aceita integração nova desde 15/06/2026: só projetos do Google Cloud que já enviavam conversões entre 17/12/2025 e 15/06/2026 continuam liberados. O Google indica a **Data Manager API** (`datamanager.googleapis.com/v1/events:ingest`), que não pede developer token nem nível de acesso da Google Ads API.

## Decisão
- Destino `gads` na fila `deliveries` ([ADR 0014](0014-fila-de-envio-server-side.md)), um evento por requisição, com o mesmo reenvio dos outros destinos. 4xx (menos 429) falha na hora.
- **Login por conta de serviço do Google Cloud**, não por OAuth de usuário: o escopo `datamanager` é sensível, e um app OAuth precisaria passar pela verificação do Google; a conta de serviço não precisa. O cliente cola a chave JSON por site e adiciona o e-mail da conta de serviço como usuário no Google Ads. O Sinqfy assina o JWT com `node:crypto` (sem biblioteca) e pede o token sempre em `oauth2.googleapis.com` (nunca no `token_uri` da chave colada). O token fica em memória por até 1 h, só como cache.
- A chave privada é gravada cifrada com `seal()` quando a `DATA_KEY` existe. Do JSON, só `type`, `project_id`, `client_email` e `private_key` são guardados.
- Por site: ID da conta dona das ações de conversão, ID da MCC (opcional, vira `loginAccount`) e um mapa `evento = ID da ação de conversão` (ação do tipo "Importar, de cliques"). Compras dos webhooks usam `Purchase`; eventos do site vão só se o nome estiver no mapa.
- Identificadores: o último `gclid`/`gbraid`/`wbraid` do visitante (pelo `rid`, ou pelo visitante sem `rid`) nos 90 dias anteriores ao evento, ou o da visita casada com a venda; e-mail e telefone em SHA-256, no formato do Google (minúsculas, Gmail sem pontos antes do @, telefone E.164 com `+`). Sem nenhum identificador, o evento não vai.
- `transactionId` = `event_id` do site ou `plataforma-pedido`, para o Google deduplicar.
- **Compra única por checkout, igual à Meta** ([ADR 0019](0019-compra-unica-por-checkout.md)): o Purchase espera 5 min na fila; order bump e upsell do mesmo comprador (e-mail, telefone ou `rid` em hash) nesse tempo somam no valor dele, com o `transactionId` do primeiro pedido; o que chega depois do envio, até 2 h, não vira outra conversão. Os pedidos somados ficam em `order_ids` no payload da fila, fora do evento, porque o Google recusa campo desconhecido.
- **Último clique**: quando a Meta e o Google Ads estão ativos no site e a pessoa clicou em anúncio dos dois antes de comprar, a compra vai só para a plataforma do clique mais recente. Clique da Meta é a data de criação do `fbc` (`fb.1.<ms>.<fbclid>`); do Google, o evento com `gclid`, `gbraid` ou `wbraid` na URL. A compra pulada fica no log do webhook e conta como enviada para o quadro do CRM não mandar o Purchase à Meta depois. Com só um dos destinos ativo, nada muda. Leads e outros eventos do site continuam indo aos dois.
- Uma ação de conversão recebe um evento só: o mapa recusa o mesmo ID em dois eventos, que contariam a mesma conversão duas vezes com `transactionId` diferente.
- Mesmas travas da Meta e do GA4: compra repetida por outra fonte e compra aprovada há mais de 3 dias não vão.
- Consentimento: o `gclid` só existe no evento quando o visitante consentiu (`data-consent`). O campo `consent` da Data Manager não é enviado (não é exigido fora do Espaço Econômico Europeu).

## Consequências
- Quem clicou em anúncio da Meta e do Google não vira compra nas duas plataformas: os números de cada uma batem com o total de vendas, ao custo de a outra plataforma otimizar com menos dados. Quem só clicou numa das duas continua com a compra indo para as duas (a outra casa pelo e-mail e telefone, como visualização).
- A tag de conversão do Google Ads no site e a compra importada do GA4 não deduplicam com esta importação (são ações diferentes): a tela avisa para deixar só uma como ação principal.
- A configuração exige três passos fora do Sinqfy (Google Cloud com acesso à Data Manager API, usuário no Google Ads, ação de conversão), descritos na tela Integrações.
- Erros que o Google só apura depois de aceitar o envio (diagnósticos do `requestStatus.retrieve`) não aparecem na aba Eventos, que mostra "aceito pelo Google Ads" com o `requestId`. Se isso pesar, consultar o status pelo `requestId` no `runJobs`.
- A regra "Anúncios: só Meta" ([ADR 0007](0007-anuncios-so-meta.md)) continua valendo para a leitura de gasto e campanhas: o Google Ads aqui só recebe conversões.
