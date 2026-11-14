# Referência Astryx (Meta, MIT) para o Rastro

Raiz citada: `astryx-src/repo/`. Valores lidos direto do código. Tokens do core em `packages/core/src/theme/tokens.stylex.ts` (T), tema neutro em `packages/themes/neutral/src/neutralTheme.ts` (N), paleta em `packages/themes/neutral/src/neutralPaletteRefs.generated.ts`. Docs de design em `docs/design/*.md`.

## 1. Taxonomia de tokens

**Cores por papel** (T, todas `light-dark(claro, escuro)`):
- Superfície: `background-body` (página), `background-surface`, `background-card`, `background-popover`, `background-muted` (zebra/áreas rebaixadas), `background-inverted` (tooltip/toast), `overlay` (scrim modal).
- Texto: `text-primary`, `text-secondary`, `text-disabled`, `text-accent`, mais `on-accent`, `on-dark`, `on-light`.
- Ícone: `icon-primary|secondary|disabled|accent`.
- Borda: `border` (sutil, ~10% preto/branco), `border-emphasized` (bordas de campo).
- Acento: `accent`, `accent-muted` (fundo de seleção/foco), `on-accent`. Core: claro `#0064E0`, escuro `#0171E3`, texto `#FFFFFF`.
- Interação: `overlay-hover` (~5%), `overlay-pressed` (~10%), `neutral` (fundo de botão secundário, 10% claro / 20% escuro), `tint-hover`, `skeleton`, `track`, `shadow`.
- Status, 4 papéis por status (info, success, warning, error), regra INV11 em `docs/architecture/theme-tokens.md`:
  - `--color-<s>` preenchimento forte + `--color-on-<s>` (>= 4.5:1)
  - `--color-<s>-muted` preenchimento pálido + `--color-on-<s>-muted`
  - `--color-text-<s>`, `--color-icon-<s>`, `--color-border-<s>` para texto/ícone/borda sobre página e card
  - Core: info `#0064E0`, success `#0D8626`, error `#E3193B` (escuro `#F5394F`), warning `#E9AF08` (escuro `#F2C00B`). `on-error` no escuro vira `#0A1317` (branco não bateria 4.5:1). Info é independente do acento.
- Categóricas (blue, cyan, gray, green, orange, pink, purple, red, teal, yellow): cada uma com `background-X` (alfa 20%), `border-X`, `icon-X`, `text-X`.
- Valores core úteis (T): body `#F1F4F7`/`#111112`; surface `#FFFFFF`/`#1F1F22`; popover escuro `#28292C`; text-primary `#0A1317`/`#DFE2E5`; secondary `#4E606F`/`#AAAFB5`; disabled `#A4B0BC`/`#6F747C`; border-emphasized `#CCD3DB`/`#494D53`; text-blue `#042F97`/`#AFD7FF`.

**Espaçamento** (T, rem, passo de 4px): 0, 0-5=2px, 1=4, 1-5=6, 2=8, 3=12, 4=16, 5=20, 6=24, 7=28, 8=32, 9=36, 10=40, 11=44, 12=48.

**Tamanho de elemento** (T): `size-element-sm` 28px, `md` 32px, `lg` 36px. Borda `--border-width` 1px.

**Raio** (T): none 0, inner 4px, element 8px (controles), container 12px (cards, toast, banner), page 28px, full 9999px. Neutro (N): inner 6px, element 10px, container 12px, page 28px.

**Tipografia** (T): escala geométrica base 14px, razão 1.2. Tamanhos: xs 10, sm 12, base 14, lg 17, xl 20, 2xl 24, 3xl 29, 4xl 35, 5xl 42 (px). Pesos 400/500/600/700.
- h1 24/32; h2 20/28; h3 17/24; h4 14/20; h5 12/20; h6 10/16 (todos 600; o neutro põe h3 e h4 em bold).
- body 14/20 (400); label 14/20 (500); large 17/24 (600); supporting 12/20 (400); code 14/20 (400).
- display 1 a 3: 42/35/29px, peso 400, leading ~1.24.
- O neutro usa **Figtree** (400 a 700, `packages/themes/neutral/fonts.css`) em corpo e títulos; código `ui-monospace`. Em toque (`pointer: coarse` e largura < lg) a base sobe para 16px (N, `adaptations`). Preset denso sugerido em T: `{base: 12, ratio: 1.125}`.
- `font-variant-numeric: tabular-nums` existe em `packages/core/src/Text/text.stylex.ts:335`.

**Elevação** (T e N): `shadow-low|med|high`. Core claro: low `0 1px 1px /10% + 0 2px 8px /10%`; med `0 1px 2px + 0 2px 12px`; high `0 2px 2px + 0 8px 24px`. Neutro claro: low `0 2px 4px /5% + 0 4px 8px /10%`; med `0 2px 4px /5% + 0 4px 12px /10%`; high `0 4px 6px /10% + 0 12px 24px /15%`. Anéis de estado são separados: `shadow-inset-hover|selected|success|warning|error` = `inset 0 0 0 2px` com alfa 30% a 50%.

**Movimento** (T, N): durações fast/medium/slow (core 175/410/975ms; neutro 125/300/700ms; min/max = base x 0.75). `--duration-exit` = fast. Easings: standard/entrance/move `cubic-bezier(0.24, 1, 0.4, 1)` (desacelera), exit `cubic-bezier(0.3, 0, 0.6, 0.6)` (acelera).

**Foco** (T, `focusDefaults`): `outline 2px solid var(--color-accent)`, `outline-offset 3px`, só em `:focus-visible`. Campos de texto não usam outline: borda vira `accent` + `inset 0 0 0 2px accent-muted`.

## 2. Modo escuro

- Mecanismo: cada token é um par `light-dark()`; escuro é tabela própria, não inversão (T). O neutro gera as duas rampas com 21 paradas (0 a 100) e reduz o croma no escuro (50% até a parada 25, amarelo 65%), ver `packages/themes/neutral/neutral.spec.md`.
- Degraus de superfície (core): body `#111112` < surface/card `#1F1F22` < popover `#28292C`; mais alto = mais claro. Neutro: body `#1b1b1b`, surface `#262626`, card e popover `#1b1b1b`.
- Texto escuro: primary `#DFE2E5`, secondary `#AAAFB5` (nunca branco puro). Borda escura é branco ~10%. Sombra escura sobe para 20% a 30% e (neutro) ganha anel interno `inset 0 0 0 1px` branco 8%/12%/15% (low/med/high) para dar contorno sobre fundo escuro.
- Preenchimentos pálidos de status e categoria no escuro são a cor com alfa ~24% (`3F`/`3D`) sobre a superfície. Texto de acento escuro `#3E9EFB`.
- Hover/press são overlays de alfa (preto 5%/10% no claro, branco 5%/10% no escuro), não cores novas.

## 3. Componentes (números)

**Button** (`packages/core/src/Button/Button.tsx`): inline-flex, gap 8, padding 8 x 12, raio 8, label 14/20 peso 500, sem borda.
- Alturas: sm 28, md 32 (padrão), lg 36 (`max(altura, 1lh)`). Ícone-only: quadrado, padding 0. Ícone 16px em sm/md, 20px em lg.
- Variantes: primary (`accent` + `on-accent`), secondary (`neutral` + `text-primary`, padrão), ghost (transparente + `text-primary`), destructive (`error` + `on-error`; no tema neutro vira `error-muted` + `on-error-muted`).
- Hover: gradiente `overlay-hover`. Active: `overlay-pressed` + `scale(0.98)`; transição fast; sem scale em reduced-motion. Disabled: `opacity 0.5`, cursor default, sem hover. Foco: anel padrão (no destructive o anel fica vermelho). Loading: spinner `sm` por cima do rótulo, `aria-busy`, não escurece, bloqueia clique, spinner atrasado em ações curtas.

**Input / Select** (`Field/inputStyles.stylex.ts`, `TextInput`): altura 28/32/36, padding 4 x 8, gap 8, borda 1px `border-emphasized`, raio 8, fundo `surface`. Hover (só `hover: hover`): `inset 2px` de `border-emphasized` a 30%. Foco: borda `accent` + `inset 2px accent-muted`. Erro/aviso/sucesso: borda `border-<status>` + anel inset. Disabled: opacity 0.5, sem hover. Borda de controle com alvo 3:1 (INV13).

**Table** (`Table/TableCell.tsx`, `TableHeaderCell.tsx`, `TableRow.tsx`): densidade `compact | balanced (padrão) | spacious` com padding de célula 4x8, 8x12, 12x16. Corpo 14px; cabeçalho 14px peso 600 cor `text-secondary`, alinhado ao início, divisor inferior 1px `border`. Divisores de linha por padrão; zebra opcional (`background-muted` nas pares); hover de linha `overlay-hover` só com hover real. Altura de linha não é token: sai do padding + 20px de leading (derivado: compact ~28px, balanced ~36px, spacious ~44px). Alinhamento numérico: não encontrado na Table.

**Badge** (`Badge/Badge.tsx`): altura 20 (`--spacing-5`), padding inline 8, raio full, texto 12/20 peso 500, gap 4. Core: semânticas (neutral, info, success, warning, error) sólidas; categóricas com `background-X` + `text-X`. O tema neutro faz todas pálidas (`background-X` + `text-X`). Forced-colors ganha contorno 1px.

**Side navigation** (`SideNav/SideNav.tsx`, `SideNavHeading.tsx`, `NavItem/navItemStyles.stylex.ts`): largura 260, colapsada 48. Item: min-height 32 (sm 28, lg 36), padding inline 8, gap 8, raio 8, texto 14/20 peso 400. Selecionado: fundo `--color-neutral` + peso 500 (sem barra lateral). Hover/press: overlay. Disabled: `text-disabled`. Rótulo de seção: min-height 32, padding 8, texto 12 peso 600 `text-secondary`. Contêiner: padding 8, gap 8, topo e rodapé sticky.

**Tabs** (`TabList/Tab.tsx`, `TabList.tsx`): min-height 32 (28/36), padding inline 12, gap interno 4, raio 8, label 14/20 peso 400 `text-secondary`. Hover: pílula `overlay-hover` preenchendo a tab. Régua inferior 1px `border`, gap 2 entre tabs, 4px entre tabs e régua. Ícone 14/16/18px. Detalhe do indicador da selecionada: não conferido linha a linha.

**SegmentedControl** (`SegmentedControl/*`): trilho `--color-neutral`, padding 2, gap 2, raio 8. Item: padding inline 12, label peso 500 `text-secondary`; selecionado: superfície elevada, `text-primary`, peso 600, sem overlay de press.

**Card** (`Card/Card.tsx`): raio 12, fundo `background-card`, borda opcional 1px `border`, elevação none/low/med/high, padding do tema (passo 4 = 16px). Variantes de fundo: card, transparent, muted e categóricas.

**Empty state** (`EmptyState/EmptyState.tsx`): coluna centrada, gap 16, padding 32 x 24 (compacto: gap 8, padding 16); título 17/24 peso 600 `text-primary`; descrição 14/20 `text-secondary`; largura máx 360.

**Banner** (`Banner/Banner.tsx`): raio 12, padding 12 x 16, gap 8 (coluna) e 12 (linha); fundo `<status>-muted` + `on-<status>-muted`; título 14/20 peso 600.

**Toast** (`Toast/Toast.tsx`, `ToastViewport.tsx`): largura 400 (máx 100%), padding 16, raio 12, `shadow-med`, fundo `background-inverted`, texto 14/20, gap 12; auto-hide padrão 5000ms.

**Tooltip** (`Tooltip/Tooltip.tsx`, `useTooltip.tsx`): fundo `text-primary`, texto `background-surface` (invertido), raio 12, texto 14px, padding 4 x 8, `delay` padrão 200ms.

## 4. Acessibilidade aplicada

- Contraste: texto sobre status forte e sobre acento >= 4.5:1 (INV11, INV12), verificado em `scripts/check-badge-contrast.test.mjs`, `check-muted-status-contrast.test.mjs`, `packages/core/src/theme/contrast.test.ts`. Ícone e borda de status >= 3:1. Borda de controle de formulário >= 3:1 contra superfície e fundo (INV13, WCAG 1.4.11).
- Alvo de toque: 44x44px em ponteiro grosso (`packages/core/src/utils/hitArea.ts`, `MIN_TOUCH_TARGET = 44`). O visual pode ser 32px porque a área de clique cresce sem tomar o toque de um vizinho.
- Foco: só `:focus-visible`; anel 2px accent, offset 3px; o tema pode restilizar mas não mostrar anel a quem usa mouse.
- Status nunca só por cor: sempre ícone ou rótulo (`system-states.md` DR2).
- Reduced motion (`docs/design/reduced-motion.md`): sem deslocamento, escala ou mola; em toque, só crossfade de opacidade <= 200ms; mouse/teclado muda na hora. Componentes zeram `transitionDuration` em `@media (prefers-reduced-motion: reduce)`. Carregamento deve continuar legível sem animação (DR8).
- Forced colors: estados sólidos ganham contorno 1px; selecionado vira Highlight/HighlightText.
- Hover é opcional (`color-emphasis.md` DR7) e só aplicado sob `(hover: hover)`.

## 5. Ícones

- Core: SVGs padrão em `packages/core/src/Icon/defaultIcons.tsx` (viewBox 24, stroke `currentColor`, **traço 1.5**, round/round, tamanho `1em`; estilo Heroicons outline). Só cobre UI de sistema: close, chevrons, check, success, error, warning, info, calendar, clock, externalLink, menu, moreHorizontal, search, upload, arrows, funnel, eyeSlash, viewColumns, copy, wrench, stop, microphone.
- Tema neutro: `packages/themes/neutral/src/icons.tsx` mapeia esses nomes para **lucide-react** (dependência externa, não está no repo; Lucide é ISC). Traço padrão do Lucide: 2.
- Tamanhos (`docs/design/iconography.md`, `Icon/IconSize.stylex.ts`): xsm 12, sm 16 (controles), md 20, lg 24. Contorno é o padrão; preenchido só para estado ativo, status ou <= 12px. Ícone interativo vive dentro de botão/link que dá nome acessível e alvo.
- Showcases do CLI (`packages/cli/assets/templates/blocks/components/SideNav/*.tsx`) têm SVG inline no estilo Heroicons (viewBox 24, strokeWidth 1.5), só como demo.
- Os 16 ícones pedidos (home, activity, alert, dollar, bar chart, target, git-branch, users, message-circle, settings, link, globe, plug, refresh, sun, moon): **não encontrados como path SVG no repo** (só `warning` existe no core). Para copiar, usar Lucide (ISC) ou Heroicons (MIT) direto da fonte, 24x24, traço 1.5 a 2.

## 6. Faça / não faça (dashboard denso)

Faça:
- Densidade por token: controles de 28/32px, tabela `compact` (4x8) para dados, `balanced` como padrão. Corpo 14px, apoio 12px.
- Hierarquia por espaço antes de caixa: gaps crescem de local para grupo para seção; só depois cartão ou borda (`spatial-hierarchy.md` DR2, DR3).
- Uma ênfase primária por grupo de ações; o resto secundário ou ghost (`color-emphasis.md` DR3).
- Papéis de tipo por função (label, supporting, heading), não tamanhos avulsos (`typography-hierarchy.md`).
- Raio por papel: 4 interno, 8 controle, 12 container; cantos aninhados concêntricos (`shape-relationships.md`).
- Carregamento mantém as dimensões do conteúdo, sem layout shift (`system-states.md` DR5). Feedback persistente discreto; urgente pode ser sólido; transitório usa overlay invertido.
- Status sempre com ícone ou rótulo além da cor; mesmo significado em qualquer prominência.
- Overlays de hover/press em alfa sobre a superfície, não blocos opacos novos.
- Tooltip com atraso de entrada (200ms) e guarda de saída; teclado abre sem atraso (`motion.md`).

Não faça:
- Não combine borda e sombra fortes na mesma superfície; uma linguagem de borda por superfície. Sombra discreta; anel de foco nunca vira elevação (`elevation-hierarchy.md` DR3, DR4).
- Não use movimento decorativo nem bounce; movimento explica mudança (`motion.md` DR1, DR3).
- Não use um único gap em tudo (`spatial-hierarchy.md` DR4).
- Não deixe todos os botões competirem; não dependa de cor ou de hover para comunicar estado.
- Não use ícone como decoração sem papel, nem ícone sem nome acessível.
- Não ponha texto de status direto sobre preenchimento forte: usar o par `on-<status>`.
