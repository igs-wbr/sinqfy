# ADR 0021: Cliente com vários sites (um por funil)

## Status
Aceito.

## Data
2026-11-23

## Contexto
Um cliente costuma ter vários produtos em domínios e pixels diferentes (ex.: a esteira AHSD e a Black 997 do mesmo produtor), às vezes 5 a 8 funis em faixas de preço diferentes. Cada funil precisa do próprio painel, e o produtor também quer ver tudo somado e comparar os funis. Juntar tudo num site só, com vários pixels, misturaria domínios (um domínio bloqueado pela Meta contaminaria o pixel principal) e perderia o painel por funil. Além disso, a conta de anúncios fica ligada a um site só, então o gasto de todas as campanhas caía nele.

## Decisão
- **Um site por funil**, como antes: script, webhook, pixel e painel próprios.
- **Campo `client` no site.** Sites da mesma agência com o mesmo cliente formam um grupo (`src/clients.js`).
- **Visão somada em `/sites/~<chave do cliente>`**: Resumo, Campanhas e Pedidos com `site = ANY(...)`, e o pedido que chegou a dois sites (mesma plataforma e id) conta uma vez. Só leitura, só com os sites que o usuário vê, e só quando ele vê dois ou mais. O Resumo ganha a tabela "Funis do cliente".
- **Gasto dividido pelo nome da campanha (`spend_rule`).** A conta segue ligada a um site; na sincronização, a campanha cujo nome contém um trecho da regra de outro site do cliente vai, com conjuntos e anúncios, para esse site. Mudar o cliente ou a regra zera a última sincronização das contas do grupo: a próxima refaz 90 dias e apaga dos outros sites o que mudou de lugar.

## Consequências
- Telas por site (eventos, funis, CRM, integrações) continuam por site; a visão do cliente não as tem.
- O imposto da visão somada é o do primeiro site do cliente.
- Um pedido que chega a dois sites aparece nos dois painéis; para cada funil mostrar só o seu, filtre os produtos no webhook de cada site.
