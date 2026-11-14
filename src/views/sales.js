// Páginas de vendas: resumo (dashboard principal), campanhas, pedidos e integrações.
import { PLATFORMS, STATUSES, METHODS } from '../sales/webhooks.js';
import { SALE_FILTERS, LEVEL_PT } from '../sales/stats.js';
import { html, raw, layout, pageHead, toolbar, kpi, list, tabs, chart, donut, notice, num, pct, ratio, money, link, on, hiddenInputs } from './ui.js';

const METHOD_COLORS = { pix: 'var(--s1)', card: 'var(--s2)', boleto: 'var(--s3)', other: 'var(--s4)' }; // ordem validada para daltonismo
const saleLabel = (col, k) => col === 'platform' ? PLATFORMS[k] ?? k : col === 'status' ? STATUSES[k] ?? k : col === 'method' ? METHODS[k] ?? k : k === '' ? '(sem UTM)' : k;
const sx = (n, d = 1) => n == null ? '-' : `${ratio(n)}${d ? 'x' : ''}`;
/** "Gastos da Meta atualizados às 14:07" (ou o atalho para conectar). As telas recarregam sozinhas a cada hora. */
const synced = (ctx, lastSync) => lastSync
  ? html`<span class="live" title="A página recarrega sozinha a cada hora"><i></i>Meta atualizada às ${new Date(lastSync).toLocaleTimeString('pt-BR', { timeZone: ctx.site.timezone, hour: '2-digit', minute: '2-digit' })}</span>`
  : ctx.canEdit ? html`<a class="live" href="/sites/${encodeURIComponent(ctx.site.id)}/integrations">Conectar a Meta →</a>` : '';
const HOURLY = { refresh: 3600 };

function selects(ctx, opts) {
  return html`<form method="get" class="row">${hiddenInputs(ctx.q, Object.keys(opts).map(k => 'f_' + k))}
${Object.entries(opts).map(([k, values]) => html`<label class="sr" for="f_${k}">${SALE_FILTERS[k]}</label><select id="f_${k}" name="f_${k}"><option value="">${SALE_FILTERS[k]}: todas</option>
${values.map(([v, t]) => html`<option value="${v}"${ctx.q.get('f_' + k) === v ? raw(' selected') : ''}>${t}</option>`)}</select>`)}<button>Filtrar</button></form>`;
}

export function salesPage(ctx, p, f, d) {
  const site = ctx.site, m = v => money(v, site.currency), c = d.cur, pv = d.prev || {};
  const empty = !d.hasData;
  const integ = `/sites/${encodeURIComponent(site.id)}/integrations`;
  const next = (what, step) => ctx.canEdit ? html`${what} ${step} em <a href="${integ}">Integrações</a>.` : `${what} Quem edita o site conecta as fontes em Integrações.`;
  const noSales = next('Nenhuma venda no período.', 'Conecte uma plataforma de vendas'), noUtm = next('Nenhuma venda com UTM no período.', 'Use o template de UTM');
  return layout(ctx, `Resumo · ${site.name}`, html`
${pageHead(`${site.name} · Resumo`, raw('Faturamento, gastos e <em>lucro</em>'), 'Vendas aprovadas das suas plataformas, cruzadas com o que você investiu em anúncios.', synced(ctx, d.lastSync))}
${toolbar(ctx, p, f, { filters: SALE_FILTERS, label: saleLabel, extra: selects(ctx, { platform: d.platforms.map(k => [k, PLATFORMS[k] ?? k]), product: d.products.map(x => [x, x]) }) })}
${empty ? notice(raw(`Ainda não há vendas nem gastos. Conecte uma plataforma de vendas e a Meta em <a href="/sites/${encodeURIComponent(site.id)}/integrations">Integrações</a>.`)) : ''}
<div class="hero">${kpi('net', 'Faturamento líquido', c.net, pv.net, m, { feature: true, spark: d.series.map(x => x.v) })}${kpi('spend', 'Gastos com anúncios', c.spend, pv.spend, m, { invert: true })}
${kpi('roas', 'ROAS', c.roas, pv.roas, sx)}${kpi('profit', 'Lucro', c.profit, pv.profit, m)}</div>
<div class="kpis">${kpi('paid', 'Vendas aprovadas', c.paid, pv.paid, num)}${kpi('meta-purchases', 'Compras (Meta)', c.metaPurchases, pv.metaPurchases, num)}${kpi('meta-roas', 'ROAS (Meta)', c.metaRoas, pv.metaRoas, sx)}${c.metaLeads || pv.metaLeads ? kpi('meta-leads', 'Leads (Meta)', c.metaLeads, pv.metaLeads, num) : ''}${kpi('gross', 'Faturamento bruto', c.gross, pv.gross, m)}${kpi('ticket', 'Ticket médio', c.ticket, pv.ticket, m)}
${kpi('cpa', 'CPA', c.cpa, pv.cpa, m, { invert: true })}${kpi('roi', 'ROI', c.roi, pv.roi, pct)}${kpi('margin', 'Margem', c.margin, pv.margin, pct)}
${kpi('pending', 'Pendentes', c.pending_value, pv.pending_value, m)}${kpi('refunds', 'Reembolsos', c.refund_rate, pv.refund_rate, pct, { invert: true })}
${kpi('chargeback', 'Chargeback', c.chargeback_rate, pv.chargeback_rate, pct, { invert: true })}${kpi('tax', `Imposto (${num(site.tax_rate)}%)`, c.tax, pv.tax, m)}</div>
<section class="card"><h2>Faturamento × gastos</h2>${chart(d.series, d.prevSeries, {
    label: 'Faturamento líquido', color: 'var(--s1)', fmt: m, line: p.days > 1 ? { key: 's', label: 'Gastos', color: 'var(--s2)' } : null, tip: x => [`${num(x.n)} vendas`], empty: next('Sem vendas nem gastos no período.', 'Conecte a plataforma de vendas e a Meta'),
  })}</section>
<div class="grid two"><section class="card"><h2>Vendas por pagamento</h2><div style="margin-top:14px">${donut(d.methods.map(x => ({ label: METHODS[x.k] ?? x.k, v: x.v, n: x.n, color: METHOD_COLORS[x.k] ?? 'var(--s4)' })),
    { total: num(c.paid), totalLabel: 'vendas', fmt: m, empty: noSales })}</div></section>
${tabs('Origem das vendas', [['Campanha', list(ctx, d.campaigns, 'utm_campaign', { head: 'utm_campaign', cols: [['Faturamento', 'v', m], ['Vendas', 'n']], filter: false, label: saleLabel, empty: noUtm })],
    ['Fonte', list(ctx, d.sources, 'utm_source', { head: 'utm_source', cols: [['Faturamento', 'v', m], ['Vendas', 'n']], label: saleLabel, empty: noUtm })]])}
${tabs('Produtos', [['Produtos', list(ctx, d.productsTop, 'product', { head: 'Produto', cols: [['Faturamento', 'v', m], ['Vendas', 'n']], label: saleLabel, empty: noSales })]])}
${tabs('Plataformas', [['Plataformas', list(ctx, d.platformsTop, 'platform', { head: 'Plataforma', cols: [['Faturamento', 'v', m], ['Vendas', 'n']], label: saleLabel, empty: noSales })]])}
</div>`, HOURLY);
}

export function campaignsPage(ctx, p, level, rows, lastSync) {
  const site = ctx.site, m = v => money(v, site.currency);
  const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const spend = sum('spend'), net = sum('net'), sales = sum('sales'), profit = sum('profit'), metaP = sum('metaPurchases'), metaV = sum('metaValue'), leads = sum('metaLeads');
  return layout(ctx, `Campanhas · ${site.name}`, html`
${pageHead(`${site.name} · Campanhas`, raw('Cada real <em>investido</em>'), raw('<b>Vendas</b> e <b>ROAS</b> vêm dos webhooks (dinheiro confirmado, ligado pela UTM). <b>Compras</b> e <b>ROAS (Meta)</b> são o que a própria Meta atribui ao anúncio, na janela de atribuição da conta.'), synced(ctx, lastSync))}
${toolbar(ctx, p, {}, { compare: false })}
<div class="toolbar"><nav class="seg" aria-label="Nível">${Object.entries(LEVEL_PT).map(([k, t]) => html`<a href="${link(ctx.q, { level: k === 'campaign' ? null : k })}"${on(level === k)}>${t}</a>`)}</nav></div>
<div class="hero">${kpi('c-net', 'Faturamento', net, null, m, { feature: true })}${kpi('c-spend', 'Gastos', spend, null, m)}${kpi('c-roas', 'ROAS', spend ? net / spend : null, null, sx)}${kpi('c-profit', 'Lucro', profit, null, m)}</div>
${rows.length ? html`<section class="card"><div class="tw"><table class="data"><thead><tr><th>Status</th><th style="text-align:left">${LEVEL_PT[level].slice(0, -1)}</th><th>Orçamento</th><th>Gastos</th><th>Vendas</th><th>CPA</th><th>Faturamento</th><th>ROAS</th><th>Compras (Meta)</th><th>ROAS (Meta)</th>${leads ? html`<th>Leads (Meta)</th>` : ''}<th>Lucro</th><th>ROI</th><th>CTR</th></tr></thead>
<tbody>${rows.map(r => html`<tr><td style="text-align:left">${r.unmatched ? html`<span class="badge st-paused">sem gasto</span>` : html`<span class="badge st-${/PAUSED/.test(r.status) ? 'paused' : r.status || 'paused'}">${r.statusPt}</span>`}</td>
<td style="text-align:left;white-space:normal;min-width:220px">${r.name}${r.platform && r.platform !== 'meta' ? html` <small class="muted">· ${r.platform}</small>` : ''}</td>
<td>${r.budget != null ? m(r.budget) : '-'}</td><td>${m(r.spend)}</td><td>${num(r.sales)}</td><td>${r.cpa != null ? m(r.cpa) : '-'}</td><td>${m(r.net)}</td>
<td>${sx(r.roas)}</td><td>${num(r.metaPurchases)}</td><td>${sx(r.metaRoas)}</td>${leads ? html`<td>${num(r.metaLeads)}</td>` : ''}<td class="${r.profit < 0 ? 'neg' : r.profit > 0 ? 'pos' : ''}">${m(r.profit)}</td><td>${pct(r.roi)}</td><td>${pct(r.ctr)}</td></tr>`)}</tbody>
<tfoot><tr><th style="text-align:left">Total</th><th></th><th></th><th>${m(spend)}</th><th>${num(sales)}</th><th>${sales ? m(spend / sales) : '-'}</th><th>${m(net)}</th><th>${sx(spend ? net / spend : null)}</th><th>${num(metaP)}</th><th>${sx(spend ? metaV / spend : null)}</th>${leads ? html`<th>${num(leads)}</th>` : ''}<th>${m(profit)}</th><th>${pct(spend ? profit / spend : null)}</th><th></th></tr></tfoot></table></div></section>`
    : notice(raw(`Nenhum gasto ou venda com UTM no período. Conecte a conta de anúncios da Meta em <a href="/sites/${encodeURIComponent(site.id)}/integrations">Integrações</a>.`))}`, HOURLY);
}

export function ordersPage(ctx, p, f, d, page) {
  const site = ctx.site, m = v => money(v, site.currency);
  const time = ts => new Date(ts).toLocaleString('pt-BR', { timeZone: site.timezone, dateStyle: 'short', timeStyle: 'short' });
  const more = d.rows.length > 50, rows = d.rows.slice(0, 50);
  return layout(ctx, `Pedidos · ${site.name}`, html`
${pageHead(`${site.name} · Pedidos`, raw('Pedido a <em>pedido</em>'), 'Tudo o que as plataformas enviaram, com status atualizado a cada webhook. Sem dados pessoais do comprador.')}
${toolbar(ctx, p, f, { compare: false, filters: SALE_FILTERS, label: saleLabel, extra: html`<nav class="seg" aria-label="Status"><a href="${link(ctx.q, { f_status: null, page: null })}"${on(!f.status)}>Todos</a>${Object.entries(STATUSES).map(([k, t]) => html`<a href="${link(ctx.q, { f_status: k, page: null })}"${on(f.status === k)}>${t}</a>`)}</nav>${selects(ctx, { platform: Object.entries(PLATFORMS), product: d.products.map(x => [x, x]), method: Object.entries(METHODS) })}` })}
<section class="card">${rows.length ? html`<div class="tw"><table class="data"><thead><tr><th>Data</th><th>Pedido</th><th>Produto</th><th>Plataforma</th><th>Pagamento</th><th>Status</th><th>Bruto</th><th>Líquido</th><th>Origem</th></tr></thead>
<tbody>${rows.map(s => html`<tr><td style="text-align:left">${time(s.ts)}</td><td style="text-align:left"><code>${s.order_id}</code></td><td style="text-align:left;white-space:normal">${s.product || '-'}</td>
<td>${PLATFORMS[s.platform] ?? s.platform}</td><td>${METHODS[s.method]}</td><td><span class="badge st-${s.status}">${STATUSES[s.status]}</span></td><td>${m(s.gross)}</td><td>${m(s.net)}</td>
<td style="white-space:normal;max-width:240px">${s.utm_source || s.utm_campaign ? html`${s.utm_source}${s.utm_campaign ? html` · <span class="muted">${s.utm_campaign}</span>` : ''}` : html`<span class="muted">sem UTM</span>`}</td></tr>`)}</tbody></table></div>
<div class="row between" style="margin-top:12px"><span class="muted">Página ${page + 1}</span><div class="row">${page ? html`<a class="btn" href="${link(ctx.q, { page: page - 1 || null })}">← Anterior</a>` : ''}${more ? html`<a class="btn" href="${link(ctx.q, { page: page + 1 })}">Próxima →</a>` : ''}</div></div>`
    : html`<p class="empty">Nenhum pedido no período.</p>`}</section>`);
}

const UTM_TEMPLATE = 'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}';

/** Saúde da fila de um destino nas últimas 24 h. */
function health(d, dest) {
  const h = (d.deliveries || []).find(x => x.dest === dest);
  if (!h) return html`<p class="muted">Nada enviado nas últimas 24 h.</p>`;
  return html`<p class="row" style="gap:6px;margin:10px 0 0"><span class="tag ok">${num(h.sent)} enviados</span>${h.pending ? html`<span class="tag warn">${num(h.pending)} na fila</span>` : ''}${h.failed ? html`<span class="tag bad">${num(h.failed)} falharam</span>` : ''}<span class="muted">últimas 24 h; veja cada um em Eventos</span></p>`;
}
export function integrationsPage(ctx, originUrl, d, msg, err) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}/integrations`;
  const time = ts => ts ? new Date(ts).toLocaleString('pt-BR', { timeZone: s.timezone, dateStyle: 'short', timeStyle: 'short' }) : 'nunca';
  return layout(ctx, `Integrações · ${s.name}`, html`
${pageHead(`${s.name} · Integrações`, raw('Conecte <em>tudo</em>'), 'Rastreamento no site, plataformas de venda, conta de anúncios da Meta e envio server-side.')}
${notice(msg)}${notice(err, true)}
<div class="grid two" style="align-items:start">
<section class="card"><h2>1 · Rastreamento no site</h2><p class="muted">Cole no <code>&lt;head&gt;</code> de todas as páginas. Pelo subdomínio <code>t.</code> (Worker da borda), os cookies <code>_rid</code>, <code>_fbp</code> e <code>_fbc</code> ficam no seu domínio por 400 dias.</p>
<pre><code>${`<script defer data-site="${s.id}" src="${d.edgeUrl}/s.js"></script>`}</code></pre>
<p class="muted">Opções no <code>&lt;script&gt;</code>: <code>data-consent="required"</code> (nada de cookie nem envio a terceiros até o banner chamar <code>rastro('consent')</code>) e <code>data-pixel="mirror"</code> (repete cada evento no Pixel com o mesmo <code>eventID</code>; tire o <code>fbq('track','PageView')</code> do código base).</p>
<h3>Template de UTM para a Meta (Ads Manager → Parâmetros de URL)</h3><pre><code>${UTM_TEMPLATE}</code></pre>
<p class="muted">O id depois do <code>|</code> liga cada venda à campanha, ao conjunto e ao anúncio certos. O snippet repassa as UTMs da página para os links de checkout (para a Hotmart: <code>src</code> e <code>sck</code>).</p>
<h3>Eventos de conversão</h3><pre><code>${`<button data-rastro="cadastro" data-rastro-plano="pro">Assinar</button>
<a data-rastro="compra" data-rastro-revenue="97.90" href="/checkout">Comprar</a>
rastro('compra', { plano: 'pro' }, 97.90)`}</code></pre></section>

<section class="card"><h2>2 · Plataformas de venda</h2><p class="muted">Cadastre a URL como webhook (todos os eventos de compra) na plataforma. O token na URL identifica este site.</p>
<div class="stack" style="margin-top:12px">${Object.entries(PLATFORMS).map(([k, t]) => html`<div class="platform"><span class="lbl">${t}</span><pre><code>${originUrl}/hooks/${s.webhook_token}/${k}</code></pre></div>`)}</div>
<form method="post" action="${base}" class="row" style="margin-top:12px"><input type="hidden" name="action" value="rotate"><button class="danger">Gerar novo token</button><span class="muted">as URLs antigas param de funcionar</span></form>
<h3>Últimos webhooks</h3>${d.logs.length ? html`<div class="tw"><table class="data"><thead><tr><th>Quando</th><th>Plataforma</th><th>Pedido</th><th>Resultado</th></tr></thead><tbody>${d.logs.map(l => html`<tr><td style="text-align:left">${time(l.ts)}</td><td>${PLATFORMS[l.platform] ?? l.platform}</td><td><code>${l.order_id || '-'}</code></td><td class="${l.ok ? '' : 'neg'}" style="white-space:normal">${l.message}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">Nenhum webhook recebido ainda.</p>`}</section>

<section class="card"><h2>3 · Meta Ads</h2><p class="muted">Importa campanhas, conjuntos, anúncios, status, orçamento e gasto diário a cada hora. Somente leitura: o token precisa só da permissão <code>ads_read</code> (gere um token de usuário do sistema no Business Manager).</p>
${d.accounts.map(a => html`<div class="platform" style="margin-top:10px"><div class="row between"><b>${a.name || 'act_' + a.account_id}</b><code>act_${a.account_id}</code></div>
<p class="muted" style="margin:6px 0">Última sincronização: ${time(a.last_sync)}${a.currency && a.currency !== s.currency ? html` · <span class="neg">moeda da conta ${a.currency} ≠ ${s.currency}</span>` : ''}</p>${a.last_error ? html`<p class="neg" style="margin:6px 0">Erro: ${a.last_error}</p>` : ''}
<div class="row"><form method="post" action="${base}"><input type="hidden" name="action" value="meta_sync"><input type="hidden" name="account" value="${a.id}"><button>Sincronizar agora</button></form>
<form method="post" action="${base}"><input type="hidden" name="action" value="meta_remove"><input type="hidden" name="account" value="${a.id}"><button class="link danger">Remover</button></form></div></div>`)}
<form method="post" action="${base}" class="stack" style="margin-top:14px"><input type="hidden" name="action" value="meta_add">
<label class="f">ID da conta de anúncios<input name="account_id" required pattern="(act_)?[0-9]{5,25}" placeholder="act_1234567890"></label>
<label class="f">Token de acesso<input name="token" type="password" required autocomplete="off"></label><div><button class="primary">Conectar conta</button></div></form></section>

<section class="card"><h2>4 · Meta: envio server-side</h2><p class="muted">Todo evento do site (PageView, Lead, InitiateCheckout e os seus) e cada venda aprovada vão à Conversions API pelo servidor, com reenvio automático. E-mail e telefone seguem só em SHA-256.</p>
${health(d, 'meta')}${s.meta_test_code ? html`<div style="margin-top:12px">${notice(html`Código de teste ativo (<code>${s.meta_test_code}</code>): os eventos aparecem só na aba Testar eventos da Meta. Apague o código quando terminar o teste.`, true)}</div>` : ''}
<form method="post" action="${base}" class="stack" style="margin-top:12px"><input type="hidden" name="action" value="capi">
<label class="f">ID do pixel / conjunto de dados<input name="pixel" value="${s.meta_pixel || ''}" pattern="[0-9]{5,25}" placeholder="vazio = desativado"></label>
<label class="f">Token da Conversions API<input name="capi_token" type="password" autocomplete="off" placeholder="${s.meta_capi_token ? '•••••• (mantido; preencha para trocar)' : ''}"></label>
<label class="f">Código de teste (opcional)<span>Gerenciador de Eventos, aba Testar eventos. Começa com TEST.</span><input name="test_code" value="${s.meta_test_code || ''}" pattern="TEST[A-Za-z0-9_]{1,40}" autocomplete="off"></label>
<div><button>Salvar</button></div></form></section>

<section class="card"><h2>5 · GA4: envio server-side</h2><p class="muted">Conversões (Lead, compra e eventos próprios) vão ao GA4 pelo Measurement Protocol, na mesma sessão do navegador (cookie <code>_ga</code>). As visitas continuam com o gtag do site, porque o GA4 não deduplica.</p>
${health(d, 'ga4')}
<form method="post" action="${base}" class="stack" style="margin-top:12px"><input type="hidden" name="action" value="ga4">
<label class="f">ID de medição<input name="ga4_id" value="${s.ga4_id || ''}" pattern="[Gg]-[A-Za-z0-9]{4,20}" placeholder="G-XXXXXXX (vazio = desativado)"></label>
<label class="f">Segredo da API<span>Admin, Fluxos de dados, Measurement Protocol, Criar.</span><input name="ga4_secret" type="password" autocomplete="off" placeholder="${s.ga4_secret ? '•••••• (mantido; preencha para trocar)' : ''}"></label>
<div><button>Salvar</button></div></form></section>
</div>`);
}
