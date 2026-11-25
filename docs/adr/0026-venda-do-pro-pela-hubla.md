# ADR 0026: Venda do Pro pela Hubla com entrega automática da chave

## Status
Aceito.

## Data
2026-11-25

## Contexto
A chave do Pro ([ADR 0022](0022-licenca-fair-core.md)) era emitida à mão com `scripts/license.mjs` e enviada ao comprador. Para vender pela página sem o autor no meio, o pagamento precisa virar chave sozinho. O gateway é a Hubla. O Sinqfy não envia e-mail ([ADR 0008](0008-sem-email.md)) e não grava e-mail em claro.

## Decisão
- **Webhook `POST /hooks/hubla`** (`src/routes/store.js`), conferido pelo cabeçalho `x-hubla-token` (a Hubla não assina com HMAC). Fatura `paid` (em `invoice.payment_succeeded` ou `invoice.status_updated`) assina a chave com a chave privada e grava em `license_orders`: id da fatura, número do pedido, e-mails do comprador e do pagador só em índice cego (`hashEmail`), chave cifrada com `seal()`. ``refunded`, `chargeback` e `disputed` mudam o status, mesmo se chegarem antes do pagamento. `paid` depois de chargeback ou disputa (disputa ganha) volta a liberar; depois de `refunded`, não: reembolso é final, então a ordem dos avisos não importa. Eventos de teste (`x-hubla-sandbox: true`) e de outros produtos (fora de `HUBLA_PRODUCTS`) são ignorados com 200. A resposta só sai depois da gravação, então uma falha vira 5xx e a Hubla reenvia.
- **Chave emissora** (`certify` em `src/license.js`): a chave raiz fica só no PC do autor. `node scripts/license.mjs issuer --id h1` cria uma emissora e um certificado dela assinado pela raiz; o servidor que vende guarda só a emissora (`LICENSE_ISSUER_KEY`) e o certificado (`LICENSE_CERT`). A chave do comprador leva o certificado (4 partes, `corpo.assinatura.cert.assinatura_cert`) e é validada offline contra a mesma chave pública embutida. Chaves de 2 partes, assinadas direto pela raiz, continuam valendo.
- **Revogação sem servidor de ativação**: `REVOKED_ORDERS` e `REVOKED_ISSUERS` em `src/license.js` viajam com cada versão. Antes de uma versão, copie os pedidos bloqueados (`SELECT order_id FROM license_orders WHERE status <> 'paid'`). Se a emissora vazar: id dela em `REVOKED_ISSUERS`, emissora nova com outro id no `.env` do servidor. No resgate, uma chave guardada com outro certificado é reemitida pela emissora atual com os mesmos dados e datas, então o comprador só volta a `/licenca`.
- **Resgate em `/licenca`**: o comprador digita o e-mail da compra e o número do pedido (ou o id da fatura) e vê a chave. 10 erros por IP bloqueiam por 15 minutos (`login_fails`). Compra reembolsada ou contestada não mostra a chave.
- **Só na instalação que vende**: as rotas existem apenas com `LICENSE_ISSUER_KEY`, `LICENSE_CERT` e `HUBLA_TOKEN`. Nas instalações dos clientes dão 404. O painel de plano aponta o resgate para `REDEEM_URL` (`src/license.js`) quando `BUY_URL` estiver preenchido.

- **Pacote**: cada tag `vX.Y.Z` gera, por `.github/workflows/release.yml`, `sinqfy.zip`, `sinqfy.tar.gz` e `instalar.sh` na versão do GitHub (testes, `.github`, `.claude` e `CLAUDE.md` ficam fora, por `export-ignore`). `deploy/instalar.sh` instala o Docker se faltar, baixa a versão mais recente, gera os segredos e sobe o painel; rodar de novo atualiza. O comprador nunca precisa abrir o GitHub: o site e a página `/licenca` apontam para os links `releases/latest/download`.

## Consequências
- A chave é validada offline: um reembolso só a desliga na versão seguinte, e quem não atualiza continua com ela (sem as atualizações). Por R$ 45 isso é aceitável; quem pedir reembolso e continuar usando viola a licença.
- O servidor que vende guarda a emissora, não a raiz. Quem roubar a emissora pode emitir chaves (inclusive com data antiga) até a versão que a revoga; quem não atualiza continua com elas.
- O plano hospedado por assinatura (agência criada pelo pagamento) pode reaproveitar este webhook, com o plano por `agency_id` em vez da tabela `install`.
