# ADR 0014: Fila de envio server-side com IP só enquanto pendente

## Status
Aceito. Etapa 2 do [plano v2](../plano-v2/plano.html).

## Data
2026-11-14

## Contexto
A Conversions API da Meta pede `client_ip_address` e `client_user_agent` em eventos de site; sem eles a qualidade da correspondência (EMQ) cai. A regra do Rastro é nunca gravar IP. Enviar na hora, dentro da requisição do beacon, deixaria o snippet lento e perderia eventos quando a Meta ou o GA4 estivessem fora do ar.

## Decisão
- Ingestão e webhooks só enfileiram em `deliveries` (uma linha por evento e destino). `dispatch()` (`src/dispatch.js`) envia a cada 5 s no servidor e também no `/cron`.
- Meta: eventos do mesmo site num lote por requisição. GA4: um por requisição (um `client_id` por chamada).
- Reenvio com espera de 1 min, 5 min, 30 min e 6 h. No 5º erro, ou com o evento mais velho que 7 dias, a entrega vira `failed`.
- Cada linha é "alugada" por 2 min (`sending`), então duas instâncias não enviam a mesma coisa e uma linha presa por queda volta sozinha.
- **IP e user agent ficam no payload só enquanto a entrega está pendente.** Ao enviar, o payload é apagado. Em falha final, o payload fica sem IP e sem user agent, para permitir o reenvio manual.
- Histórico de entregas: 30 dias. Em falha final de uma compra, o e-mail e o telefone continuam no payload **só em SHA-256**, para o reenvio manual funcionar; somem com a entrega em 30 dias.
- Se a Meta recusar um lote por causa de um evento (4xx), o lote é repartido e só o evento ruim falha, na hora (4xx não melhora tentando de novo). 5xx, 429 e falta de resposta em 10 s seguem a espera crescente.
- Compra do webhook vai com `action_source: other` até a etapa 3, porque sem user agent e URL a Meta recusa `website`.
- O GA4 recebe só conversões (não `page_view`): o gtag do site já conta as visitas, e o Measurement Protocol não deduplica.
- O snippet lê o cookie `_ga` para o `client_id` do GA4 e, com `data-pixel="mirror"`, repete cada evento no Pixel com o mesmo `eventID`, para a Meta deduplicar navegador e servidor.

## Consequências
- O IP pode ficar no banco por até 7 dias se a Meta recusar os envios. É o preço de não perder o evento; a tela Eventos mostra a falha e o motivo.
- A regra "nunca grave IP" do CLAUDE.md passa a ter essa exceção documentada.
- Com `data-pixel="mirror"`, o site precisa tirar o `fbq('track','PageView')` do código base do Pixel, senão a visita conta duas vezes.
