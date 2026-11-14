# Especificação: Rastro

## Objetivo

Um painel único para quem vende online e anuncia, com três perguntas respondidas no mesmo lugar:

1. **Quanto eu faturei e lucrei?** Vendas das plataformas menos gastos com anúncios e impostos.
2. **Qual campanha, conjunto ou anúncio trouxe essas vendas?** Gasto cruzado com vendas pela UTM.
3. **Quem visitou o site e o que fez?** Analytics de tráfego sem cookies.

**Público:** uso pessoal ou de uma equipe pequena (um infoprodutor, um pequeno e-commerce, uma agência com poucos clientes).

**Escala-alvo:** até alguns milhares de visitas e algumas centenas de vendas por dia, por site.

## Escopo

| Área | O que faz | Código |
|---|---|---|
| Rastreamento | Snippet de ~1,4 KB: pageviews, eventos, receita, SPA, propagação de UTMs para o checkout | `public/s.js`, `src/tracking/ingest.js` |
| Tráfego | Visão geral, tempo real, funis, jornadas, atribuição de eventos | `src/tracking/stats.js`, `src/views/traffic.js` |
| Vendas | Webhooks da Hotmart, Kiwify, Eduzz e formato genérico; status atualizado a cada evento | `src/sales/webhooks.js` |
| Métricas de venda | Faturamento, lucro, ROAS, ROI, CPA, margem, reembolso, chargeback, meios de pagamento | `src/sales/stats.js` |
| Anúncios | Sync da Meta Marketing API (somente leitura), de hora em hora via `/cron` | `src/ads/meta.js` |
| Server-side | Envio de compras aprovadas para a Conversions API da Meta | `src/ads/meta.js` (`sendCapi`) |
| Equipe | Papéis Admin / Editor / Leitor, acesso por site, convite por link | `src/auth.js`, `src/routes/admin.js` |
| Atualização | Gastos da Meta sincronizados de hora em hora; Resumo e Campanhas recarregam sozinhos a cada hora (vendas e visitas já chegam em tempo real) | `src/jobs.js`, `/cron` |
| Hospedagem | Função na Vercel + banco Turso (libSQL); servidor local para desenvolvimento | `api/index.js`, `src/app.js`, `src/db.js` |
| Compartilhamento | Link público somente leitura, só da parte de tráfego | `src/routes/traffic.js` |

## Definições das métricas

Todas consideram o período selecionado e as datas no fuso do site.

| Métrica | Definição |
|---|---|
| Faturamento bruto | Soma de `gross` das vendas **aprovadas** (o que o cliente pagou) |
| Faturamento líquido | Soma de `net` das vendas aprovadas (o que a plataforma repassa; igual ao bruto se o webhook não informar a comissão) |
| Gastos com anúncios | Soma de `ad_spend.spend` (Meta via API) |
| Imposto | Faturamento bruto × alíquota configurada no site |
| Lucro | Líquido − gastos − imposto |
| Margem | Lucro ÷ líquido |
| ROAS | Líquido ÷ gastos |
| ROI | Lucro ÷ gastos |
| Compras (Meta) / ROAS (Meta) | Compras e valor de compra que a própria Meta atribui aos anúncios (janela de atribuição da conta) ÷ gastos. Não confirma pagamento; serve para comparar com as vendas reais |
| CPA | Gastos ÷ vendas aprovadas |
| Ticket médio | Líquido ÷ vendas aprovadas |
| Reembolso % / Chargeback % | Reembolsadas (ou chargebacks) ÷ (aprovadas + reembolsadas + chargebacks) |
| Pendentes | Soma do bruto de vendas pendentes (Pix gerado, boleto impresso) |
| Visita | Sequência de eventos do mesmo visitante com intervalos ≤ 30 min |
| Rejeição | Visitas com uma única visualização ÷ visitas |

Regras de contagem:

- **Data da venda.** É a data de criação do pedido. Um reembolso posterior muda o status mas não a data.
- **Venda × campanha.** A venda é ligada à campanha, ao conjunto e ao anúncio pela chave da UTM: o id depois do `|` no template `nome|id` ou, sem id, o próprio nome. Veja [ADR 0003](adr/0003-vendas-por-webhook-e-chave-utm.md).

## Modelo de dados

Banco libSQL (dialeto SQLite): Turso em produção e arquivo local em desenvolvimento. As tabelas são criadas e migradas de forma aditiva no primeiro acesso, em `src/db.js`.

| Tabela | Uma linha por… |
|---|---|
| `events` | pageview ou evento do snippet (sem IP, sem query string) |
| `sales` | pedido de uma plataforma (`UNIQUE(site, platform, order_id)`), sem dados pessoais |
| `ad_spend` | dia × campanha × conjunto × anúncio × plataforma |
| `ad_entities` | campanha, conjunto ou anúncio da Meta (nome, status, orçamento) |
| `ad_accounts` | conta de anúncios conectada (token guardado localmente) |
| `webhook_log` | resultado dos últimos 50 webhooks por site (sem payload) |
| `sites`, `users`, `user_sites`, `sessions`, `login_fails`, `funnels`, `salts` | configuração e controle |

## Fora do escopo

Cada item tem um motivo:

- **Pausar ou ativar campanhas pelo painel.** Exigiria `ads_management` e ações reais na conta; foi escolhido somente leitura ([ADR 0004](adr/0004-meta-somente-leitura-e-csv.md)).
- **Google Ads, TikTok e Kwai.** Só Meta, por enquanto ([ADR 0007](adr/0007-anuncios-so-meta.md)).
- **Atribuição entre dias.** O id do visitante muda diariamente, por privacidade ([ADR 0002](adr/0002-sem-cookies-salt-diario.md)).
- **Envio de e-mails** (relatórios e convites): o painel é a única saída ([ADR 0008](adr/0008-sem-email.md)).
- **Dados pessoais de compradores, API pública, exportação, retenção automática e landing page de marketing.**

## Critérios de aceite

- `npm test` passa: 20 testes cobrindo snippet, ingestão, sessões, webhooks das 4 plataformas, CAPI, sync da Meta (simulada), métricas, campanhas, papéis, link público, auto-refresh, cron e segurança.
- O snippet tem menos de 2 KB.
- Nenhuma linha do banco contém IP, e-mail ou telefone.
