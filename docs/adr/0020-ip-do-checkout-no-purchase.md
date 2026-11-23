# ADR 0020: IP, cidade e UF do clique no checkout no Purchase

## Status
Aceito.

## Data
2026-11-19

## Contexto
O Purchase vem do webhook do checkout, minutos ou dias depois do clique. Os eventos do site levam IP, cidade e UF à Meta, mas esses dados só existem no payload da fila e são apagados no envio ([ADR 0014](0014-fila-de-envio-server-side.md)). Por isso o Purchase saía sem `client_ip_address`, `ct` e `st`, e a qualidade da correspondência (EMQ) parava perto de 8,9. A meta é 9,3, e o IP junto com o user agent é um dos sinais que a Meta mais pesa.

## Decisão
- **Tabela `checkout_clicks`, uma linha por site e rid.** No `InitiateCheckout` com rid, consentimento e Meta configurada, a Sinqfy grava o IP cifrado com `seal()` (AES-256-GCM, `DATA_KEY`, como os contatos do [ADR 0013](0013-dados-pessoais-criptografados.md)), a cidade e a UF vindas da borda. Um clique novo substitui o anterior.
- **Purchase usa e apaga.** O `matchSale` lê a linha do mesmo rid, dos 7 dias antes da venda, e o `metaPurchase` manda `client_ip_address`, `ct` e `st` em SHA-256. Assim que a compra entra na fila da Meta, a linha é apagada. Na fila, o IP segue a regra do ADR 0014: sai do banco no envio.
- **7 dias no máximo.** O `runJobs` apaga as linhas mais antigas. Exclusão do site apaga a tabela junto.
- **Só o checkout.** PageView e outros eventos não guardam nada além do que já guardavam.

## Consequências
- O banco passa a ter IP, sempre cifrado e por no máximo 7 dias. Sem a `DATA_KEY` nada é gravado, e um dump do banco não mostra o IP.
- Compra sem clique casado pelo rid continua sem IP.
- Cidade e UF ficam em texto (localização aproximada, sem o IP), também por no máximo 7 dias.
