# ADR 0003: Vendas por webhook, ligadas às campanhas pela chave da UTM

## Status
Aceito

## Data
2026-10-07

## Contexto
O painel de vendas precisa de valor bruto e líquido, meio de pagamento, status (aprovada, pendente, reembolsada, chargeback) e a campanha que gerou cada venda. O evento de compra disparado pelo navegador não traz status nem reembolsos. Além disso, o id de visitante muda a cada dia ([ADR 0002](0002-sem-cookies-salt-diario.md)).

## Decisão
- As vendas entram por **webhooks** das plataformas (Hotmart, Kiwify, Eduzz e um formato genérico).
- Cada payload é normalizado e gravado em `sales` com upsert por `(site, platform, order_id)`. Assim, um reembolso posterior atualiza o mesmo pedido.
- A origem vem das **UTMs que a plataforma repassa**. O snippet garante que elas cheguem ao checkout ao copiar as UTMs da página para o link; para a Hotmart, também `src` e `sck`.
- A ligação venda ↔ anúncio usa a **chave da UTM**: o id depois do último `|` no template `nome|id`, ou o próprio texto. A chave é comparada com o id e, depois, com o nome das entidades de `ad_spend` e `ad_entities`.
- Nenhum dado pessoal do comprador é gravado.

## Alternativas consideradas

### Ligar a venda ao visitante pelo e-mail ou por um id no checkout
- Prós: jornada completa do clique à compra.
- Contras: exige guardar PII ou um id persistente no navegador.
- Rejeitado: viola o ADR 0002.

### Integração por API de cada plataforma (polling)
- Prós: não depende da configuração de webhook.
- Contras: credenciais por plataforma, limites de taxa, atraso.
- Rejeitado: todas as plataformas-alvo têm webhook, que é imediato.

## Consequências
- Sem o template de UTM com ids, as vendas só casam com campanhas cujo **nome** seja idêntico à UTM.
- Vendas sem UTM aparecem como uma linha "Sem UTM" na tabela de campanhas, em vez de sumirem.
- O formato da Eduzz é tratado de forma tolerante (novo + legado), e o log de webhooks mostra o resultado para conferência.
