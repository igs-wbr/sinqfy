# ADR 0004: Meta Marketing API somente leitura; demais plataformas por CSV

## Status
Aceito; a parte de CSV foi substituída pelo [ADR 0007](0007-anuncios-so-meta.md).

## Data
2026-10-07

## Contexto
Lucro, ROAS e CPA precisam do gasto com anúncios por dia e por campanha, conjunto e anúncio. As plataformas de referência (Utmify e similares) integram por API com Meta, Google, TikTok e Kwai, e algumas permitem pausar campanhas pelo painel.

## Decisão
- **Meta:** sincronização via Marketing API com token de usuário do sistema com `ads_read`. A primeira sincronização traz 30 dias; depois roda de hora em hora e refaz os últimos 3 dias. O status e o orçamento são exibidos, nunca alterados.
- **Google Ads, TikTok, Kwai:** importação de CSV exportado do gerenciador, com detecção de colunas em pt-BR e inglês.
- **Conversions API:** envio server-side de compras aprovadas, com PII só em hash.

## Alternativas consideradas

### Pausar e ativar campanhas pelo painel (`ads_management`)
- Prós: paridade com ferramentas comerciais.
- Contras: um bug ou clique errado afeta dinheiro real; o token passa a ter poder de escrita.
- Rejeitado por decisão do usuário. Reavaliar com confirmação explícita por ação.

### APIs do Google Ads e TikTok
- Prós: dados automáticos.
- Contras: o Google exige developer token aprovado e OAuth; mais superfície de manutenção.
- Adiado: o CSV cobre o caso pessoal. Se for adicionar, siga o padrão de `src/ads/meta.js` (gravar em `ad_spend` e `ad_entities` com `platform` próprio).

## Consequências
- O token da Meta fica no SQLite local, em texto, e nunca é exibido na interface. Proteja o arquivo do banco.
- A versão da Graph API (`META_API_VERSION`) precisa ser atualizada a cada ~2 anos, quando a Meta descontinua versões antigas.
- O gasto não é convertido de moeda; um aviso aparece se a conta usar outra moeda.
