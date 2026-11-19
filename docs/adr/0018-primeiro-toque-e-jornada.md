# ADR 0018: Primeiro toque pago e jornada do lead pelo rid

## Status
Aceito.

## Data
2026-11-17

## Contexto
A venda quase nunca vem de um anúncio só. O lead clica num criativo, volta dias depois por outro e compra pela bio, por um link de recuperação ou digitando o endereço. As plataformas de checkout (Hotmart, Kiwify, Hubla, Stripe e as outras) guardam só a origem da compra, então o anúncio que trouxe o lead perde o crédito. Também faltava saber em qual visita o lead compra e em qual ambiente (navegador do Instagram, Safari...) ele chega ao checkout.

## Decisão
- **Primeiro toque pago.** Ao casar a venda pelo rid (ADR 0015), o `matchSale` busca também a primeira visita com `utm_campaign` nos 30 dias anteriores e grava em `sales.ft_source`, `ft_medium`, `ft_campaign` e `ft_content`. Sem visita paga registrada, o primeiro toque é a própria origem da venda. Um webhook depois do primeiro (pendente e depois pago) não troca o primeiro toque.
- **Último toque continua igual.** As colunas `utm_*`, as chaves de campanha e o envio à Conversions API não mudam: Vendas, CPA e ROAS seguem o último toque.
- **Três leituras na aba Campanhas:** Vendas (último toque), Abriu (primeiro toque) e Participou (o anúncio aparece em alguma visita do mesmo rid nos 30 dias antes da compra, ou é a origem da venda).
- **Número da visita.** A visita é numerada por rid, com as sessões dos 90 dias anteriores ao período. A venda entra na última visita antes dela. Só vale para visitantes com o cookie `_rid`: o hash diário (ADR 0002) não liga dias diferentes.
- **Navegador de app.** O `parseUA` reconhece o navegador embutido de Instagram, Facebook, Threads, TikTok, LinkedIn, Pinterest, Snapchat, X, app do Google e WebView genérico.
- **Clique no checkout.** O `s.js` registra `InitiateCheckout` ao clicar num link de checkout conhecido (os mesmos domínios que recebem o rid, menos o WhatsApp). O evento também vai à Meta e ao GA4 pela fila, como os demais.
- Tudo é independente da plataforma: o casamento é pelo rid que volta no webhook, ou pelo e-mail ou telefone de um lead do CRM. Uma plataforma nova só precisa devolver o rid (parser próprio, `generic` ou webhook personalizado).

## Consequências
- Outro aparelho ou navegador perde o rastro, como em qualquer cookie primário. O casamento por e-mail ou telefone do CRM cobre parte disso.
- Vendas anteriores a esta versão ganham o primeiro toque na migração, pelos eventos do mesmo rid que ainda estão no banco; sem eles, fica a origem da própria venda.
- **Deduplicação** (testada em `tests/dedup.test.js`): o snippet segura o mesmo evento repetido em menos de 2 s (clique duplo, checkout automático junto do manual) e não espelha `Purchase` no Pixel, porque a compra sai do webhook com o id do pedido. No servidor, a fila só aceita um envio por `(site, destino, event_id)`; o mesmo pedido vindo de outra fonte com o mesmo valor não gera outro Purchase; e o quadro do CRM e o webhook não mandam a mesma compra duas vezes (janela de 7 dias por contato).
