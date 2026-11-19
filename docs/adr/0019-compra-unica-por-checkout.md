# ADR 0019: Compra única por checkout na Conversions API

## Status
Aceito.

## Data
2026-11-17

## Contexto
Checkouts como a OnProfit mandam um webhook por item: o produto principal, cada order bump e o upsell são pedidos separados. Cada um virava um `Purchase` na Meta, então 10 pessoas no checkout apareciam como 20 compras ou mais. Isso distorce o custo por compra que a Meta otimiza e reporta. Para a Meta, quem comprou o produto, o order bump e o upsell fez uma compra só; o que muda é o valor.

## Decisão
- **Um Purchase por comprador e checkout.** O `enqueuePurchase` (src/dispatch.js) identifica o comprador pelo hash que já vai no evento: e-mail, senão telefone, senão o rid. Vale para qualquer plataforma.
- **Espera de 15 minutos.** O Purchase fica na fila por `PURCHASE_HOLD`. Outro pedido aprovado do mesmo comprador nesse tempo soma no mesmo evento: `value` somado, `num_items`, `order_ids` e `content_name` com os produtos. O `event_id` e o `event_time` são os do primeiro pedido.
- **Depois do envio, não vira outra conversão.** Um pedido do mesmo comprador até `PURCHASE_GROUP` (2 h) depois do primeiro, quando a compra já saiu, não gera Purchase novo. O valor dele fica só no painel.
- **Webhooks simultâneos.** Produto e bump costumam chegar no mesmo segundo. Um `pg_advisory_xact_lock` por site e comprador serializa a soma, e o mesmo pedido repetido não soma duas vezes.
- **Só a Meta.** O painel continua contando pedido por pedido. O GA4 segue com uma compra por `transaction_id`, e o Purchase da coluna do CRM não muda.

## Consequências
- A compra chega à Meta até 15 minutos depois do pagamento. A Meta aceita eventos com até 7 dias.
- Um upsell comprado mais de 15 minutos depois não entra no valor enviado à Meta.
- Duas compras de verdade da mesma pessoa em menos de 2 horas viram uma conversão. Para checkout de infoproduto, isso é o comportamento desejado.
