# ADR 0022: Licença Fair Core e plano Pro por pagamento único

## Status
Aceito.

## Data
2026-11-23

## Contexto
O Sinqfy vai ser distribuído para cada cliente instalar no próprio servidor (self-hosted), com código à vista, uma versão gratuita completa e uma licença paga uma vez, no modelo do Maestri. A licença MIT, adotada em 15/11 com o repositório ainda privado, deixaria qualquer pessoa revender o produto e liberar os recursos pagos, que já existem no código (vários sites, visão por cliente). Open core de verdade exigiria tirar esses recursos para um módulo fechado, e a separação por agência e por site está em quase toda consulta.

## Decisão
- **Licença: Fair Core License 1.0 com MIT futura (FCL-1.0-MIT)**, texto de fcl.dev. Uso, alteração e redistribuição livres para qualquer fim que não seja concorrente; proibido contornar a chave de licença; cada versão vira MIT dois anos depois de publicada. Permissão adicional no fim do `LICENSE`: agência pode dar acesso aos próprios clientes. O autor é o único dono do código, então pode trocar a licença; contribuições futuras autorizam essa troca (`CONTRIBUTING.md`).
- **Planos, como o Maestri:**
  - Grátis, para sempre: 1 site (1 funil) e todos os recursos.
  - Pro, R$ 97 em pagamento único: sites ilimitados (e com eles a visão por cliente), até 2 instalações, atualizações por 12 meses e uso da versão para sempre, 7 dias de teste grátis.
- **Chave do Pro (`src/license.js`):** JSON assinado com Ed25519 pelo autor (`scripts/license.mjs`, chave privada fora do repositório) e validado offline com a chave pública embutida. Fica na tabela `install`, junto com o início do teste (uma vez por instalação). As 2 instalações valem pelos termos, sem servidor de ativação.
- **Sem o Pro, nada se perde:** sites além do primeiro (o mais antigo) continuam coletando, recebendo webhooks e enviando à Meta; só o painel deles mostra a página do Pro. Configurações e exclusão do site ficam livres, para dar para voltar a 1 site. Sem o Pro, não dá para criar um segundo site.

## Consequências
- Não dá para chamar o projeto de "open source" no sentido oficial: é Fair Source (código aberto, uso livre, sem revenda).
- A proteção é jurídica: alguém pode alterar o código, mas isso viola a licença e permite derrubar um fork público.
- Perder a chave privada impede emitir chaves novas; ela precisa de cópia de segurança (gerenciador de senhas).
- O botão "Comprar licença" aparece quando `BUY_URL` em `src/license.js` tiver a página de venda.
- Venda e entrega automática da chave pela Hubla: [ADR 0026](0026-venda-do-pro-pela-hubla.md).
