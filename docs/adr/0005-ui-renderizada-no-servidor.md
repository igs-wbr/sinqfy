# ADR 0005: Interface renderizada no servidor, sem framework de front-end

## Status
Aceito

## Data
2026-10-07

## Contexto
O painel tem cerca de 15 telas de leitura com filtros, mais formulários de configuração. Precisa ser rápido, funcionar bem no celular (o "app" do print) e ter superfície mínima de ataque, porque exibe dados vindos de terceiros: caminhos, referências, nomes de campanha, payloads de webhook.

## Decisão
- HTML gerado no servidor com uma tag de template (`html```) que **escapa tudo por padrão**; `raw()` é a única saída sem escape.
- Filtros e períodos são links e query strings, e as abas dentro dos cartões são `radio` + CSS.
- JavaScript só onde é indispensável, sempre inline com **nonce** de CSP:
  - tooltip dos gráficos;
  - atualização a cada 5 s do Tempo real;
  - leitura do arquivo CSV.
- Gráficos em SVG gerado no servidor; nenhuma biblioteca de gráficos.
- Instalável como PWA (manifest + ícone) para uso no celular.

## Alternativas consideradas

### SPA (React/Vue) + API JSON
- Prós: interações mais ricas.
- Contras: build, bundle, uma API inteira para manter e o risco de XSS espalhado por componentes.
- Rejeitado: nenhuma tela precisa de estado no cliente que um link não resolva.

### Biblioteca de gráficos (Chart.js etc.)
- Prós: menos código de desenho.
- Contras: dependência, bundle e controle limitado do design system.
- Rejeitado: barras, linha, donut e sankey cabem em ~150 linhas de SVG.

## Consequências
- CSP estrita: `default-src 'none'`, scripts só com nonce, fontes e imagens só do próprio domínio.
- Mudanças visuais ficam concentradas em `src/views/ui.js`, onde estão os tokens e os componentes do [design system](../design-system.md).
- Cada filtro recarrega a página. A navegação continua rápida porque as consultas são pequenas e não há bundle.
