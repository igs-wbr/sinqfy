# ADR 0012: Cookie primário com consentimento

## Status
Aceito. Substitui o [ADR 0002](0002-sem-cookies-salt-diario.md) a partir da etapa 1.

## Data
2026-11-14

## Contexto
O ADR 0002 escolheu um ID de visitante sem cookie, com salt diário. Isso impede ligar o clique no anúncio à venda de dias depois, que é o centro do produto v2.

## Decisão
- O Worker grava, pelo servidor e no domínio do cliente, `_rid` (ID do visitante, 400 dias), `_fbp` e `_fbc`.
- O projeto escolhe se exige consentimento. Com exigência e sem aceite, nada é gravado no navegador e o evento segue só com dados do servidor.
- O `_rid` é repassado nos links de checkout e de WhatsApp para casar venda e conversa com o clique.

## Consequências
- Atribuição entre dias passa a existir; a de um dia (salt diário) sai na etapa 1.
- O painel ganha a tela Privacidade (consentimento, retenção e exclusão por titular).
