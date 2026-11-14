# ADR 0002: Visitante identificado por hash com salt diário, sem cookies

## Status
Será substituído pelo [ADR 0012](0012-cookie-primario-com-consentimento.md) na etapa 1 do plano v2. Aceito

## Data
2026-10-07

## Contexto
O rastreamento não pode exigir banner de consentimento nem guardar dados pessoais. Ainda assim, precisa contar visitantes únicos, montar visitas (sessões) e atribuir conversões.

## Decisão
- O id do visitante é `sha256(salt_do_dia + site + IP + user-agent)`, truncado em 16 caracteres e calculado no servidor.
- O salt tem 32 bytes aleatórios e é trocado a cada dia UTC. O salt anterior é **apagado**.
- O IP não é gravado em lugar nenhum.
- O snippet não usa cookies nem storage; a única exceção é a flag opcional `rastro_ignore`, que o próprio dono define para se excluir.
- A visita é atribuída na ingestão: o evento continua a visita anterior se o último evento do visitante foi há 30 minutos ou menos, e herda a origem dela (referência, UTMs, canal).

## Alternativas consideradas

### Cookie de primeira parte com id persistente
- Prós: atribuição entre dias e contagem exata de recorrência.
- Contras: exige consentimento (LGPD/ePrivacy) e cria um identificador pessoal.
- Rejeitado: contraria o propósito do produto.

### Salt derivado de um segredo + data
- Prós: dispensa a tabela de salts.
- Contras: quem tiver o segredo e um IP consegue recalcular hashes antigos.
- Rejeitado: o salt aleatório apagado torna a desanonimização impossível, mesmo com acesso total ao banco.

## Consequências
- "Visitantes" em 7 ou 30 dias é a soma dos únicos de cada dia, a mesma troca que o Plausible faz.
- As visitas são cortadas à meia-noite UTC.
- A atribuição de eventos (Tráfego → Atribuição) vale só dentro do dia. A atribuição de **vendas** não sofre esse limite, porque vem das UTMs no webhook ([ADR 0003](0003-vendas-por-webhook-e-chave-utm.md)).
