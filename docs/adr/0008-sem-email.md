# ADR 0008: Sem e-mail; o painel se atualiza sozinho

## Status
Aceito

## Data
2026-10-07

## Contexto
O Rastro enviava relatórios por e-mail (diário, semanal, mensal) e convites da equipe via SMTP (`nodemailer`). O usuário não precisa de e-mail: quer só abrir o painel e ver os números atualizados.

## Decisão
- Remover os relatórios por e-mail, o envio de convites e a dependência `nodemailer`.
- O convite continua sendo um link de uso único, exibido na tela Equipe para o admin enviar como preferir.
- As telas **Resumo** e **Campanhas** recarregam sozinhas a cada hora (`<meta http-equiv="refresh" content="3600">`), alinhadas ao sync horário da Meta, e mostram "Meta atualizada às HH:MM".
- Vendas (webhooks) e visitas (beacons) já aparecem em tempo real; só os gastos da Meta dependem do sync.

## Consequências
- Uma dependência a menos (fica só `@libsql/client`) e nenhuma credencial de SMTP para configurar.
- A rota `/cron` passa a fazer apenas o sync da Meta e a limpeza de sessões.
- A tabela `reports` deixa de ser criada. Bancos antigos podem mantê-la; ela não é mais lida.
