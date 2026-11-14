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
- Todo payload recebido vai antes para o **R2** (30 dias). Se o banco falhar, o evento é reprocessado a partir dali.
- O envio para as plataformas não acontece no Worker: ele cria linhas em `deliveries` e o despachante na Oracle envia com reenvio.

## Consequências
- O código de normalização (parsers, hash, `fbc`) vai para `src/core/` sem dependência de Node, para rodar nos dois lados.
- Limite gratuito do Workers (100 mil requisições por dia) cobre testes; o plano de US$ 5 entra com o primeiro cliente pago.
