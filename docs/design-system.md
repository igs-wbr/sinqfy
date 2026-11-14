# Design system: Digital Naturalism

Estética escura de vanguarda: superfícies de carvão profundo, acentos em verde ácido, tipografia editorial serifada sobre uma UI sans limpa, e elementos de inspiração brutalista. Tudo isso fica em `src/views/ui.js`, em um único bloco de CSS com tokens.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0d0e0c` | fundo da página (carvão com leve viés verde) |
| `--surface` / `--surface2` / `--surface3` | `#151613` / `#1c1e1a` / `#24261f` | cartões, campos, tooltips |
| `--line` / `--line2` | bone a 9% / 17% | bordas finas |
| `--ink` / `--ink2` / `--muted` | `#eceee6` / `#a6ab9d` / `#767c6e` | texto primário, secundário, eixos |
| `--acid` | `#c8ff3d` | acento: aba ativa, KPI de destaque, foco, botões primários |
| `--up` / `--down` / `--warn` | `#c8ff3d` / `#ff6b57` / `#f2c14e` | variação boa / ruim / pendente (sempre com ▲▼ e texto) |

## Tipografia

As fontes são servidas pelo próprio servidor, em `public/fonts`, sob licença OFL. Nada é carregado do Google, porque isso vazaria o IP de quem abre o painel.

- **Instrument Serif** (editorial): títulos de página (`h1`, com a palavra-chave em *itálico verde*), títulos de cartão e números grandes dos KPIs.
- **Inter** (UI): texto corrido, tabelas, valores secundários.
- **JetBrains Mono** (técnica): rótulos em caixa alta com espaçamento largo, abas, botões, eixos, datas.

## Elementos de assinatura

| Elemento | Onde | Como |
|---|---|---|
| Grão | página inteira | `body::after` com `feTurbulence` em data-URI, opacidade 7% |
| Abas inclinadas | navegação principal, chips de filtro | `transform: skewX(-14deg)`, com o texto desinclinado num `span` interno |
| Borda serrilhada | faixa de KPIs (`.hero`) | `mask: conic-gradient(...)` com dentes de 9 px |
| Zigue-zague | login e convite | `.zig`, dois `linear-gradient` diagonais |
| Canto marcado | todo `.card` | `::before` de 12 px em L, verde ácido |
| Chanfro | botão primário | `clip-path` cortando dois cantos |

## Gráficos

A paleta categórica foi validada com o script da skill **dataviz** (`validate_palette.js --mode dark --surface #151613`). Passou nas checagens de luminosidade, croma, separação para daltonismo (incluindo o par que fecha o círculo do donut) e contraste.

| Slot | Cor | Entidade |
|---|---|---|
| s1 | `#74a817` | Faturamento · Pix |
| s2 | `#8370ec` | Gastos · Cartão |
| s3 | `#df5f2b` | Boleto |
| s4 | `#1d9f97` | Outros |

A ordem importa: verde e laranja colapsam para deuteranopes e por isso nunca ficam adjacentes. O verde ácido não entra na paleta categórica, porque é claro demais para dividir o gráfico com outras séries. Ele só aparece em gráficos de uma única série.

Regras aplicadas:

- um único eixo y;
- legenda sempre visível;
- tooltip por coluna;
- tabela acessível ("Ver dados em tabela");
- 2 px de respiro entre fatias do donut;
- período anterior em tracejado neutro.

## Acessibilidade

- Foco visível em verde ácido.
- Variações levam seta e texto (`sr-only`), não só cor.
- Abas de cartão são `radio` nativos, navegáveis por teclado.
- Tabelas têm cabeçalho.
- O contraste de `--ink2` sobre `--surface` é de cerca de 7:1.
- A animação do indicador "ao vivo" respeita `prefers-reduced-motion`.
