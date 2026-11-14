# ADR 0013: Dados pessoais criptografados para o CRM

## Status
Aceito. Substitui a regra "nunca gravar IP, e-mail ou telefone" a partir da etapa 5. Até lá a regra antiga continua valendo.

## Data
2026-11-14

## Contexto
O CRM precisa mostrar nome e telefone do lead, e o casamento de venda com lead exige guardar o e-mail ou o telefone. O Rastro passa a ser operador de dados pessoais dos clientes (LGPD).

## Decisão
- Nome, e-mail e telefone ficam criptografados (AES-256-GCM) com chave fora do banco (`DATA_KEY`), mais o SHA-256 normalizado ao lado para casar registros e enviar às plataformas.
- IP só existe em memória durante o envio do evento; não é gravado.
- Retenção configurável por projeto (padrão: 13 meses para eventos e contatos, 90 dias para mensagens, 30 dias para o bruto no R2).
- Exclusão por pedido do titular apaga contato, mensagens e identidades e registra o pedido em `audit_log`.
- A IA nunca recebe dado pessoal em claro.

## Consequências
- Perder `DATA_KEY` torna os contatos ilegíveis: a chave entra no backup, guardada separada do dump.
- Contrato de tratamento de dados com cada cliente (etapa 10).

## Implementação (etapa 5, 2026-11-14)
- `src/pii.js`: AES-256-GCM com IV aleatório de 12 bytes por valor, formato `v1.<iv>.<tag>.<dado>` (o prefixo permite trocar de algoritmo ou de chave depois). Chave em `DATA_KEY` (32 bytes, hex ou base64). Sem a chave, o CRM fica desligado e o resto do Rastro funciona.
- Ao lado do dado cifrado fica um **índice cego** (HMAC-SHA256 com subchave derivada da `DATA_KEY` por HKDF) do e-mail normalizado e do telefone com DDI, para casar contatos e vendas. O SHA-256 puro que a Meta pede é calculado só na hora do envio, a partir do texto decifrado: telefone em SHA-256 puro se quebra por força bruta, então nunca é gravado.
- A lista de contatos mostra e-mail e telefone mascarados; o texto inteiro só aparece na ficha.
- Exclusão a pedido do titular apaga o contato e o histórico e registra o pedido em `audit_log`.
- Exclusão também apaga envios pendentes do contato, desliga os eventos do `rid` dele (sem user agent, fbc, fbp e client_id do GA4) e grava o índice cego em `erased`: o titular não volta a ser cadastrado por compra, formulário ou Lead Ads.
- Retenção: a tarefa periódica apaga contatos sem atualização e eventos com mais de 13 meses.
- Captura de formulário só pela borda (beacon com `EDGE_SECRET`), com limite de 30 por minuto por site; formulário com senha, cartão ou `data-rastro-ignore` não é capturado.
- Token da página do Lead Ads cifrado; o Lead Ads só aceita avisos com a assinatura da chave do app. Cada abertura de ficha fica em `audit_log`.
- Pendente: AAD por coluna, rotação de chave (`DATA_KEY_OLD`) e alarme quando a chave não abre os dados.
