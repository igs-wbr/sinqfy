# Design system: Trackify

Moldura neutra (grafite), azul da marca só como acento. Revisado em 15/11/2026 com a skill [unslop](https://github.com/heydamir/unslop) (Damir Sokolovsky, CC BY 4.0), que substituiu o "Rastro Azul" (barra lateral e card de destaque azuis, fundos azul-marinho no escuro). Referências que continuam valendo:

- **Astryx** (design system aberto da Meta, MIT): estados de componentes e acessibilidade. Resumo em `docs/astryx-referencia.md`.
- **Plano v2**, seção 7 (`docs/plano-v2/plano.html`): regras anti-slop.

Tudo continua em `src/views/ui.js`, num único bloco de CSS com tokens. Ícones em `src/views/icons.js`.

## Direção

- **Produto:** painel que cruza vendas aprovadas, gasto na Meta e tráfego para gestores e agências decidirem onde pôr dinheiro.
- **Caráter:** exato, contábil, direto.
- **Mundo:** livro-caixa e extrato. Superfícies cinza, sem tinta de cor.
- **Momentos:** o gráfico principal da tela e o número de destaque (faturamento líquido, visitantes, conversões).
- **Assinatura:** a linha tracejada do período anterior em toda comparação.

## Marca: Trackify

Arquivos em `public/brand/` (SVG vetorial, nome em traço desenhado, sem depender de fonte):

| Arquivo | Uso |
|---|---|
| `../favicon.svg` | Favicon e ícone do app, servido em `/favicon.svg`. Traço mais grosso e trecho inicial em 50% para ler em 16px |
| `trackify-mark.svg` | Símbolo completo (rastro tracejado virando linha até o ponto), avatar e redes |
| `trackify-mark-mono.svg` | Símbolo de uma cor (`currentColor`), sem fundo |
| `trackify-logo-light.svg` / `-dark.svg` | Logo horizontal sobre fundo claro / escuro |
| `trackify-logo-mono.svg` | Logo horizontal de uma cor (`currentColor`) |
| `trackify-wordmark-light.svg` / `-dark.svg` | Só o nome |
| `trackify-stacked-light.svg` | Logo empilhado (símbolo sobre o nome) |

No painel, o símbolo vai inline (`MARK` em `ui.js`) ao lado do nome em Figtree. Área de respiro mínima: metade da altura do símbolo. Nomes técnicos ficam como estão (cabeçalho `X-Rastro-Signature`, coluna `Rastro` da planilha, chaves `rastro-*` do navegador) para não quebrar integrações existentes.

## Cores

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | #FAFAFA | #141415 | Fundo da página |
| `--surface` | #FFFFFF | #19191B | Cards, tabelas, campos |
| `--surface2` | #F4F4F5 | #232325 | Hover, segmento ativo |
| `--surface3` | #EBEBED | #2A2A2D | Pressionado, trilho de barra |
| `--line` / `--line2` | #E8E8EA / #D8D8DC | #28282B / #353538 | Hairlines |
| `--field` | #8A8A90 | #6A6A70 | Borda de campo (>= 3:1, regra INV13 do Astryx) |
| `--ink` / `--ink2` / `--muted` | #171717 / #525252 / #6B6B70 | #EDEDED / #A1A1A6 / #85858B | Três papéis de texto |
| `--side` | #F4F4F5 | #0F0F10 | Barra lateral, com hairline à direita |
| `--side-active` + `--side-hl` | #FFFFFF + hairline | #232325 + realce interno | Item ativo (degrau de superfície, ícone no acento) |
| `--primary` | #0E58DB | #0E58DB | Botão principal, seleção, série principal |
| `--link` / `--ring` | #0E58DB | #8DB4F5 | Texto azul e foco (no escuro clareia para contraste) |
| `--ok` `--bad` `--warn` | #0F7A55 / #C2372F / #9A6200 | #4CC38A / #FF8A80 / #E2B04A | Só significado, sempre com seta ou texto |

O azul cobre poucos por cento da tela: botão principal, item ativo, logo e a série principal do gráfico. Selos, código, ícones e avatares ficam nos neutros.

## Tipografia

- **Figtree** (OFL): texto da interface, pesos 400 a 600. Números com algarismos tabulares (`tabular-nums` no `body`).
- **Display** (`--display`): título da página e números de KPI. Padrão **Bricolage Grotesque** (OFL); **Space Grotesk** (OFL) em teste, trocada no menu do perfil (`data-font=space`, salvo em `rastro-font`).
- **JetBrains Mono** (OFL): só códigos, IDs e horários. Valores, variações e eixos ficam na sans.
- Dinheiro em KPI com hierarquia: símbolo e centavos menores (`figure()` em `ui.js`), o inteiro grande.
- Fontes servidas por `public/fonts`, nunca pelo Google (vazaria o IP de quem abre o painel).
- Sem caixa alta com espaçamento largo, sem itálico, sem espaçamento negativo em texto pequeno. Hierarquia por tamanho e cor.

| Papel | Tamanho / altura | Peso |
|---|---|---|
| Título da página (h1), display | 40px / 1.08, -0.03em (28px no celular) | 600 |
| Número de destaque, display | 44px / 1, -0.02em | 600 |
| Número de KPI / faixa, display | 28px / 20px | 600 |
| Título de card (h2) | 16px / 1.3 | 500 |
| Texto | 14px / 1.5 | 400 |
| Rótulo, cabeçalho de tabela, meta | 12 a 13px, sentence case | 400 a 500 |

## Forma, espaço e movimento

- Raio: 14px em cards e painéis, 8px em campos, botões e itens de menu, 6px em selos. Interno = externo menos o respiro.
- Espaço: escala de 4px. Itens da barra com 36px, rótulo de grupo 16px acima e 8px abaixo.
- Borda de 1px em vez de sombra. Sombra neutra só em menus suspensos e tooltip.
- Movimento com 3 durações e uma curva: `--d1` 120ms (hover), `--d2` 240ms (menus, indicadores), `--d3` 400ms (troca de página, entrada de cartões); `--ease`, e `--spring` só no que "pula" (indicador de aba, avatar). Nada em loop. Com `prefers-reduced-motion`, nenhum.
- Navegação: pré-renderização ao parar o mouse em link do menu, das abas de período ou do perfil (Speculation Rules); troca de página com View Transitions, e o conteúdo entra de baixo ou de cima conforme a direção no menu.
- Primeira visita da página na sessão (`.intro`): cartões entram em sequência, barras crescem, linhas se desenham e os números do topo contam até o valor. Navegação lenta mostra a barra de progresso do rastro depois de 150ms.
- Rastro (traço com ponto do logo) é o motivo da marca: item ativo do menu, fim das linhas, barra de carregamento e estado vazio.

## Estrutura da tela

- **Barra lateral** fixa à esquerda, 248px, recolhível para 72px só com ícones. Sem JavaScript, fica aberta.
- **Celular (< 900px)**, pensado para abrir como web app instalado:
  - topo translúcido com a marca, o site e o perfil; **barra de abas inferior** com Resumo, Tráfego, CRM (ou Pedidos), Conversas (ou Eventos) e Menu, que abre a gaveta com o resto;
  - gaveta que segue o dedo para fechar (e abre pela borda esquerda no app instalado); puxar para atualizar só no app instalado (no navegador o próprio navegador já faz);
  - áreas seguras (`env(safe-area-inset-*)`) no topo, na gaveta, na barra de abas e nas laterais; campos com 16px para o iOS não dar zoom; a barra de abas some com o teclado aberto;
  - toque sem atraso (`touch-action: manipulation`), sem realce cinza, com retorno ao pressionar; alvos de 44px ou mais; rolagem horizontal contida em quadros e tabelas;
  - `manifest.webmanifest` com ícone maskable, `apple-touch-icon` em PNG, metas de web app, botão "Instalar o app" no perfil (no iPhone, a instrução do Safari) e aviso de sem conexão;
  - `public/sw.js` guarda só fontes, ícones e `offline.html`; páginas com dados nunca vão para o cache.
- **Cabeçalho da página**: título e linha de contexto (sem texto acima do título); à direita, período e o botão principal.
- **Menu do perfil**: círculo no canto superior direito com Sites, Equipe, Agências, Conta, tema, fonte de títulos e Sair. Camada flutuante com vidro (desfoque).
- **KPIs**: a primeira linha (`.hero`) tem o número de destaque ocupando duas colunas; os demais indicadores (`.kpis`) ficam numa faixa única com hairlines entre as células, sem cards iguais.
- **Conteúdo**: largura máxima 1240px, margem 32px (16px no celular).

## Componentes

- **Botão principal**: azul cheio, texto branco, um por tela. **Secundário**: superfície com borda. **Fantasma**: só texto. **Perigo**: vermelho, só em ação destrutiva. Foco visível com anel de 2px `--ring`.
- **Variação** (`.delta`): pílula com seta, verde ou vermelha. O período comparado aparece na barra de filtros.
- **Minigráfico** (`spark`): linha da série diária dentro do KPI, com ponto no último valor. Acende o mesmo dia quando o mouse passa pelo gráfico principal (mira compartilhada por `data-k`).
- **Participação** (`share()`): barras horizontais ordenadas, com rótulo, valor e porcentagem escritos. Substitui a rosca.
- **Selo** (`.tag`, `.badge`): texto 12px numa superfície com hairline, raio 6px.
- **Tabela**: cabeçalho em `--surface2`, números à direita, hover de linha.
- **Estado vazio**: frase que diz o próximo passo e o botão que resolve.

## Ícones

Lucide (licença ISC), SVG inline em `src/views/icons.js`, 18px, traço 1,5px, na cor do papel de texto. Sem emoji, nem bandeiras de país.

## Gráficos

Série única em `--s1`; período anterior tracejado em `--muted`. Marcações (ponto com linha pontilhada) mostram o dia em que uma campanha começou ou parou de gastar (`campaignMarks` em `sales/stats.js`). Ordem fixa das séries, nunca reciclada:

| Slot | Claro | Escuro | Uso atual |
|---|---|---|---|
| `--s1` azul | #0E58DB | #3987E5 | Série principal, Pix |
| `--s2` laranja | #E0602C | #D95926 | Linha de gastos, cartão |
| `--s3` verde-água | #13976A | #199E70 | Boleto |
| `--s4` âmbar | #B97D00 | #C98500 | Outros |

Validado em 14/11/2026 com `validate_palette.js` da skill dataviz sobre superfícies brancas e #0E1730. As superfícies escuras novas (#19191B) são mais neutras e não reduzem o contraste das séries. Toda série tem legenda e tabela "Ver dados em tabela".

## Regras anti-slop

1. Um botão azul cheio por tela; o azul não pinta a moldura.
2. Sem degradê de cor, vidro, brilho, emoji ou palavra do título pintada.
3. Nada de grade de cards iguais. Um número lidera; o resto é faixa compacta.
4. Card de número não leva minigráfico: rótulo, número e variação.
5. Todo número tem contexto (período anterior, meta ou o que a plataforma diz).
6. Texto específico: "3 vendas sem clique de origem", nunca "Algo deu errado".
7. Estado vazio ensina o próximo passo.
8. Contraste AA nos dois modos, foco visível, tudo por teclado.
9. Animação só para explicar mudança, até 160ms, sem loop.
10. Cor de status sempre com seta ou texto.
