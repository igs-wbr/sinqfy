# Design system: Rastro Azul

Substitui o "Digital Naturalism" (verde ácido sobre carvão). Fontes de referência:

- **Tweet de referência** (painel do Oratry Studio, 11/11/2026): só a estrutura e o clima. Barra lateral azul, fundo azul gelo, cards brancos arredondados, um card de destaque azul, título grande com a palavra principal em azul. Logo, avatares, imagens e textos do Oratry **não** são usados.
- **Astryx** (design system aberto da Meta, MIT): regras de tokens, estados de componentes e acessibilidade. Resumo em `docs/astryx-referencia.md`. Não instalamos o pacote (ele é React; o Rastro é HTML renderizado no servidor).
- **Plano v2**, seção 7 (`docs/plano-v2/plano.html`): tokens e regras anti-slop.

Tudo continua em `src/views/ui.js`, num único bloco de CSS com tokens. Ícones em `src/views/icons.js`.

## Cores

O azul foi medido no vídeo de referência: `#0B4DB4` na barra e no card de destaque, `#0E58DB` nos botões.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | #ECF1FB | #070D1C | Fundo da página |
| `--surface` | #FFFFFF | #0E1730 | Cards, tabelas, campos |
| `--surface2` | #F5F8FE | #13203F | Hover de linha, segmento ativo, campo |
| `--surface3` | #E6EDFA | #1A2A50 | Pressionado, trilho de barra |
| `--line` | #DCE4F2 | #1F2D52 | Bordas |
| `--line2` | #C7D3EA | #2B3D6B | Divisor forte, borda de segmento ativo |
| `--field` | #7D8BAA | #5A70AA | Borda de campo (>= 3:1 contra superfície e fundo, regra INV13 do Astryx) |
| `--ink` | #0B1530 | #E8EEFC | Texto principal |
| `--ink2` | #34405E | #B7C4E4 | Texto secundário |
| `--muted` | #5B6785 | #8392B8 | Rótulos, eixos, ajuda |
| `--side` | #0B4DB4 | #0A1838 | Barra lateral |
| `--side-ink` | #FFFFFF | #E8EEFC | Texto da barra |
| `--side-muted` | #B9CDF3 | #8392B8 | Rótulos de grupo na barra |
| `--side-hover` | rgba(255,255,255,.10) | rgba(255,255,255,.06) | Hover de item |
| `--side-active` | rgba(255,255,255,.18) | #0B4DB4 | Item ativo |
| `--hero` | #0B4DB4 | #0B4DB4 | Card de destaque (igual nos dois modos) |
| `--primary` | #0E58DB | #0E58DB | Botão principal, foco, série única de gráfico |
| `--primary-hover` | #0B4DB4 | #1A62E0 | Hover do botão principal (#2F74EA dava 4,37:1 com texto branco) |
| `--link` | #0E58DB | #8DB4F5 | Texto azul (no escuro clareia para manter contraste) |
| `--ring` | #0E58DB | #8DB4F5 | Anel de foco (#0E58DB dava 3,17:1 sobre o fundo escuro) |
| `--info-bg` | #E7EFFD | #12244A | Aviso informativo |
| `--ok` / `--ok-bg` | #0F7A55 / #E3F5EC | #4FD1A0 / #0E3328 | Melhora, sucesso |
| `--bad` / `--bad-bg` | #C2372F / #FCE9E7 | #FF8A80 / #3A1716 | Piora, erro |
| `--warn` / `--warn-bg` | #9A6200 / #FDF1DC | #F2C15E / #352711 | Pendente, atenção |

Status sempre leva seta ou texto junto da cor.

## Tipografia

- **Figtree** (OFL), pesos 400, 500, 600, 700 e 800: interface, títulos e números.
- **JetBrains Mono** (OFL), 500 e 600: rótulos em caixa alta, IDs, horários, valores técnicos.
- Nada de Inter, Geist, Instrument Serif. Fontes servidas por `public/fonts`, nunca pelo Google (vazaria o IP de quem abre o painel).
- Números em `font-variant-numeric: tabular-nums`.

| Papel | Tamanho / altura | Peso |
|---|---|---|
| Título da página (h1) | 40px / 1.05, -0.02em (28px no celular) | 800 |
| Título de card (h2) | 15px / 1.3 | 700 |
| Número de KPI | 30px / 1.1 | 800 |
| Texto | 14px / 1.5 | 400 |
| Tabela | 13px / 1.4 | 400 |
| Rótulo (eyebrow, cabeçalho de tabela, KPI) | 10.5px mono, caixa alta, 0.12em | 600 |

## Forma, espaço e movimento

- Raio: 18px em cards, 12px em campos e botões, 9px em itens de menu, 999px em pílulas.
- Espaço: escala de 4px (4, 8, 12, 16, 20, 24, 32, 40).
- Borda de 1px em vez de sombra. Sombra só no card de destaque e em menus suspensos.
- Movimento até 160ms, só para explicar mudança. Com `prefers-reduced-motion`, nenhum.

## Estrutura da tela

- **Barra lateral** fixa à esquerda, 248px, recolhível para 72px só com ícones (botão circular na borda, estado guardado no navegador). Sem JavaScript, fica aberta.
  - Topo: marca "rastro" e seletor de site (menu com os sites e "+ Novo site").
  - Grupos (rótulo mono caixa alta): **Visão** (Resumo, Eventos com selo "ao vivo"), **Vendas** (Campanhas, Pedidos), **Tráfego** (Visão geral, Tempo real, Funis, Caminhos, Atribuição), **Configurar** (Integrações, Configurações; só quem edita).
  - Rodapé: Sites e Equipe (admin), Conta, alternar claro/escuro, Sair.
- **Celular (< 900px)**: barra vira topo com botão de menu; a navegação abre por cima do conteúdo.
- **Cabeçalho da página**: rótulo com traço de 16px antes (`SITE · PÁGINA`, mono, azul), título grande com a palavra principal em azul, linha de status em cinza; à direita, período e o botão principal.
- **Conteúdo**: largura máxima 1240px, margem 32px (16px no celular).

## Componentes

- **Botão principal**: azul cheio, texto branco, 40px de altura, um por tela. **Secundário**: superfície com borda. **Fantasma**: só texto. **Perigo**: vermelho, só em ação destrutiva. Todos com foco visível (anel de 2px `--ring` com 2px de respiro; branco dentro da barra lateral).
- **Seletor de período**: segmentos numa caixa de superfície; o ativo em `--surface2` com borda.
- **Card de destaque** (primeiro KPI): fundo `--hero` com leve degradê radial de `#2F74EA` a 55% no canto superior esquerdo (o canto fica em #1F62D2, 5,6:1 com branco), texto branco, pílulas translúcidas e barrinhas da série (a última em branco cheio).
- **KPI**: rótulo mono, número grande, variação em pílula verde ou vermelha com seta.
- **Tabela**: cabeçalho mono caixa alta em `--surface2`, linhas de 44px, números alinhados à direita, hover de linha.
- **Selo (tag)**: mono 10px, pílula com borda.
- **Estado vazio**: frase que diz o próximo passo e o botão que resolve.

## Ícones

Lucide (licença ISC), copiados como SVG inline em `src/views/icons.js`, traço de 1,75px, 18px. Sem emoji como ícone.

## Gráficos

Série única em `--s1` (igual a `--primary` no claro; no escuro #3987E5, porque #0E58DB fica em 2,9:1 sobre #0E1730); período anterior tracejado em `--muted`. Ordem fixa das séries, nunca reciclada:

| Slot | Claro (sobre #FFFFFF) | Escuro (sobre #0E1730) | Uso atual |
|---|---|---|---|
| `--s1` azul | #0E58DB | #3987E5 | Série principal, Pix |
| `--s2` laranja | #E0602C | #D95926 | Linha de gastos, cartão |
| `--s3` verde-água | #13976A | #199E70 | Boleto |
| `--s4` âmbar | #B97D00 | #C98500 | Outros |

Validado em 14/11/2026 com `validate_palette.js` da skill dataviz: claro e escuro passam em todas as checagens (faixa de luminosidade, croma, separação CVD entre vizinhos com pior caso 8,2 no claro e 8,4 no escuro, piso de visão normal 18,3 e 19,8, contraste >= 3:1 contra a superfície). Toda série tem legenda e tabela "Ver dados em tabela".

## Regras anti-slop

1. Um botão azul cheio por tela.
2. Sem gradiente roxo, vidro fosco, brilho ou emoji.
3. Nada de grade de cards iguais com ícone, título e frase. Cada card mostra um número que ajuda a decidir.
4. Todo número tem contexto (período anterior, meta ou o que a plataforma diz).
5. Texto específico: "3 vendas sem clique de origem", nunca "Algo deu errado".
6. Estado vazio ensina o próximo passo.
7. Carregando, vazio, erro e sem permissão desenhados.
8. Alinhamento à esquerda, hierarquia por tamanho e peso, sem caixa dentro de caixa.
9. Contraste AA nos dois modos, foco visível, tudo por teclado.
10. Animação só para explicar mudança, até 160ms.
11. Cor de status sempre com seta ou texto.
12. Tabelas densas e legíveis.
