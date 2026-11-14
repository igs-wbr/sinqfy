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
