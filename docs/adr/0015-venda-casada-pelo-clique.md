# ADR 0015: Venda casada com o clique pelo rid

## Status
Aceito. Etapa 3 do [plano v2](../plano-v2/plano.html).

## Data
2026-11-14

## Contexto
O checkout fica em outro domínio (Hotmart, Kiwify, Stripe) e costuma perder as UTMs e o `fbclid`. Sem o clique, a compra vai à Meta sem `fbc` e sem user agent, como `other`, e a otimização da campanha piora. Formulário antes do checkout e redirecionamentos derrubam parâmetros com frequência.

## Decisão
- O snippet põe o id do visitante (`rid`, cookie `_rid` da borda) no link de checkout, no campo que cada plataforma devolve no webhook: `xcod` (Hotmart), `sck` (Kiwify), `client_reference_id` (Stripe), `rid` nos demais.
- Ao chegar a venda, o Rastro procura o visitante pelo `rid` no mesmo site. Achando, a venda herda as UTMs da última visita com campanha (se veio sem elas) e a compra vai como `website` com `fbc`, `fbp`, user agent, `external_id` (hash do rid) e a página, e ao GA4 com o `client_id` do cookie `_ga`.
- Ordem das regras: rid, UTM, sem origem. A regra fica gravada na venda (`match_rule`) e aparece na tela Pedidos.
- Para isso, cada evento passa a guardar **o user agent, o domínio e o client_id do GA4**, só quando há consentimento. IP continua sem ser gravado.
- Assinatura dos webhooks quando a plataforma oferece (Hotmart, Shopify, WooCommerce, Stripe). Webhook personalizado com mapa de campos e Google Sheets via Apps Script entram pelo mesmo caminho (`ingestSale`).

## Consequências
- O user agent no evento é dado de navegação ligado a um id pseudônimo; segue a retenção dos eventos (ADR 0013).
- Casamento por e-mail ou telefone de um lead anterior fica para a etapa 5, quando o CRM guardar contatos.
- Sem o snippet no site (ou sem consentimento), a venda cai na regra de UTM.
