# ADR 0011: Coleta e webhooks na borda (Cloudflare Workers e R2)

## Status
Aceito. Implementação nas etapas 1 a 4.

## Data
2026-11-14

## Contexto
O script e os webhooks precisam responder rápido, gravar cookie primário no domínio do cliente e nunca perder evento quando o banco estiver fora do ar.

## Decisão
- Um Worker atende `s.js`, `/e`, `/hooks/:token/:plataforma`, `/w/:slug` e os webhooks da Meta e do WhatsApp.
- Cada cliente aponta `t.dominiodele` por CNAME; o domínio é registrado no **Cloudflare for SaaS**, que emite o SSL.
- O Worker é fino: grava os cookies, responde na hora e repassa o beacon ao painel na Oracle (pelo túnel) com o `EDGE_SECRET`. A ingestão continua no Node, num código só.
- Beacons que a origem não recebeu (fora do ar ou 5xx) vão para o **R2** em `failed/` para reprocessar. Na etapa 3, todo webhook de checkout também é arquivado.
- O envio para as plataformas não acontece no Worker: ele cria linhas em `deliveries` e o despachante na Oracle envia com reenvio.

## Revisão (etapa 1, 2026-11-14)
A ideia inicial era o Worker gravar direto no Postgres por Hyperdrive. Ficou para depois: repassar ao painel evita portar a ingestão para o runtime do Workers e manter dois códigos. Hyperdrive volta se a origem virar gargalo.

## Consequências
- O código de normalização (parsers, hash, `fbc`) vai para `src/core/` sem dependência de Node, para rodar nos dois lados.
- Limite gratuito do Workers (100 mil requisições por dia) cobre testes; o plano de US$ 5 entra com o primeiro cliente pago.
