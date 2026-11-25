# ADR 0025: Rolagem, tempo ativo, mapa de cliques e retorno, só em somas

## Status
Aceito.

## Data
2026-11-24

## Contexto
A aba Tráfego dizia de onde vem a visita e por onde ela passa, mas não o que a pessoa faz dentro da página: até onde lê, quanto tempo fica com a aba aberta, onde clica e se volta depois. Ferramentas de análise de produto resolvem isso guardando cada clique e cada rolagem por visitante, com scripts de dezenas de KB e, na gravação de sessão, a tela inteira. Isso não cabe aqui: o snippet é minificado à mão para ficar pequeno, o ingest não guarda dado pessoal ([ADR 0002](0002-sem-cookies-salt-diario.md)) e sem consentimento só vale contagem anônima ([ADR 0012](0012-cookie-primario-com-consentimento.md)).

## Decisão
- **Um resumo de saída por página.** O `s.js` mede a faixa máxima de rolagem (25, 50, 75 e 100%), o tempo com a aba visível e os cliques. Quando a aba some (`visibilitychange`) ou a rota muda (SPA), ele manda um beacon com `d: [faixa já enviada, faixa máxima]`, `a` (ms) e `k` (os cliques). Sem nada novo, não manda. Quando a lista de cliques passa de 2500 bytes, o resumo sai na hora e a contagem recomeça, para o corpo ficar abaixo dos 4096 bytes que o Worker e o app aceitam (acima disso o beacon seria recusado inteiro, com rolagem e tempo junto).
- **Clique: posição e alvo, nunca conteúdo digitado.** x em % da largura da tela, y em % da altura do documento, e a tag, id e primeira classe do elemento. Em `a`, `button` e `[role=button]` sem `data-rastro` (captura automática), também o texto do elemento e o destino do `href` sem query string nem âncora. O snippet corta texto, id e classe em 60 caracteres e o destino em 150. Valor de campo nunca sai do navegador.
- **No servidor, só somas.** O ingest não grava evento nem chama a fila de envio: o beacon com `k` vira `UPSERT` em três tabelas por dia, página e aparelho (celular abaixo de 768 px, computador acima). `page_reads` soma leituras, tempo e quantas chegaram a cada faixa (a primeira faixa enviada conta a leitura; depois, só as faixas novas, então a mesma página não conta duas vezes). `click_cells` soma cliques numa grade de 20 x 50. `click_targets` soma os cliques da captura automática por seletor curto, texto e destino. Tempo por envio limitado a 30 minutos.
- **Limpeza no ingest.** O texto perde o que parecer e-mail ou telefone. O destino fica sem query string; `mailto:`, `tel:` e WhatsApp viram só o tipo (o número não fica). Seletor passa por whitelist de caracteres.
- **Captura automática não é conversão.** Ela não vira evento, não aparece em Eventos nem nos funis e não vai para Meta, GA4 ou Google Ads. Evento de conversão continua sendo `data-rastro` ou `rastro()`.
- **Retorno só com `_rid`.** Sem o cookie, o id do visitante é um hash com salt diário e muda todo dia; todo mundo pareceria novo. A retenção usa a primeira visita de cada `rid` nos eventos e conta quem voltou em até 1, 7 e 30 dias, só entre quem já teve esse tempo. A tela diz isso.
- **Mesma retenção dos eventos.** As três tabelas são apagadas depois de 13 meses (`runJobs`) e junto com o site.
- **Tamanho do snippet.** Os quatro recursos somam cerca de 720 bytes ao `s.js` (3307 para 4030; com gzip, 1783 para 2165). O teto passou de 3,25 KB para 4 KB. A alternativa era um segundo arquivo carregado depois do `load`, que precisaria de rota nova e reimplantação do Worker da borda em cada instalação.

## Consequências
- A tela Tráfego → Comportamento mostra rolagem e tempo por página, o mapa de calor por aparelho (sem imagem do site, só a grade e as linhas de 25/50/75%), a lista dos links e botões mais clicados e o retorno D1/D7/D30.
- Volume: uma linha por dia, página e aparelho em `page_reads`, no máximo 1000 células por dia e página em `click_cells`, e uma linha por elemento clicado em `click_targets`. Nada cresce com o número de visitantes.
- O mapa não sabe a altura real da página: o y é relativo ao documento e a grade é a mesma para páginas curtas e longas. Bom para ver onde se clica em proporção, não para medir pixels.
- Beacons perdidos (aba morta sem `visibilitychange`) fazem leituras e tempo ficarem um pouco abaixo das visualizações.
- Gravação de sessão segue fora (peso do script e LGPD).
