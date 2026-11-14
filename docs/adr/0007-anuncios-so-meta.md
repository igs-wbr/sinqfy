# ADR 0007: Anúncios só da Meta, por enquanto

## Status
Aceito. Substitui a parte de CSV do [ADR 0004](0004-meta-somente-leitura-e-csv.md).

## Data
2026-10-07

## Contexto
O ADR 0004 previa gastos da Meta por API e das demais plataformas (Google Ads, TikTok, Kwai) por importação de CSV. O usuário anuncia, por enquanto, só na Meta.

## Decisão
Remover a importação de CSV (`src/ads/csv.js`), a seção correspondente em Integrações e as abas de plataforma da tela de Campanhas. A integração com a Meta (sync somente leitura + Conversions API) continua igual.

## Consequências
- Menos código e menos interface para manter.
- A tabela `ad_spend` continua com a coluna `platform`. Para voltar a aceitar outras plataformas, basta gravar nela com outro valor de `platform`, por API (seguindo `src/ads/meta.js`) ou por um importador. A tela de Campanhas já mostra a plataforma quando ela é diferente de `meta`.
