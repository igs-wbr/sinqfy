// Páginas de vendas: resumo (dashboard principal), campanhas, pedidos e integrações.
import { PLATFORMS, STATUSES, METHODS, SIGNED, CUSTOM_FIELDS, CUSTOM_STATUSES, MATCH_PT, hookToken } from '../sales/webhooks.js';
import { SALE_FILTERS, LEVEL_PT } from '../sales/stats.js';
import { html, raw, icon, brDate, layout, pageHead, toolbar, kpi, list, tabs, chart, share, tone, notice, num, pct, ratio, money, link, on, hiddenInputs } from './ui.js';
import { BRANDS, brandSvg } from './icons.js';
import { gadsKey } from '../dispatch.js';

const saleLabel = (col, k) => col === 'platform' ? PLATFORMS[k] ?? k : col === 'status' ? STATUSES[k] ?? k : col === 'method' ? METHODS[k] ?? k : k === '' ? '(sem UTM)' : k;
const sx = (n, d = 1) => n == null ? '-' : `${ratio(n)}${d ? 'x' : ''}`;
/** "Gastos da Meta atualizados às 14:07" (ou o atalho para conectar). As telas recarregam sozinhas a cada 5 minutos. */
const synced = (ctx, lastSync) => lastSync
  ? html`<span class="live" title="A página recarrega sozinha a cada 5 minutos"><i></i>Meta atualizada às ${new Date(lastSync).toLocaleTimeString('pt-BR', { timeZone: ctx.site.timezone, hour: '2-digit', minute: '2-digit' })}</span>`
  : ctx.canEdit ? html`<a class="live" href="/sites/${encodeURIComponent(ctx.site.id)}/integrations">Conectar a Meta →</a>` : '';
const AUTO = { refresh: 300 }; // o gasto da Meta atualiza a cada 5 min
/** "Integrações" como link só para quem edita (leitor e a visão do cliente não abrem a tela). */
const integLink = (ctx, hash = '') => ctx.canEdit ? html`<a href="/sites/${encodeURIComponent(ctx.site.id)}/integrations${hash}">Integrações</a>` : 'Integrações';

function selects(ctx, opts) {
  return html`<form method="get" class="row">${hiddenInputs(ctx.q, Object.keys(opts).map(k => 'f_' + k))}
${Object.entries(opts).map(([k, values]) => html`<label class="sr" for="f_${k}">${SALE_FILTERS[k]}</label><select id="f_${k}" name="f_${k}"><option value="">${SALE_FILTERS[k]}: todas</option>
${values.map(([v, t]) => html`<option value="${v}"${ctx.q.get('f_' + k) === v ? raw(' selected') : ''}>${t}</option>`)}</select>`)}<button>Filtrar</button></form>`;
}

export function salesPage(ctx, p, f, d) {
  const site = ctx.site, m = v => money(v, site.currency), c = d.cur, pv = d.prev || {};
  const empty = !d.hasData, sp = key => p.days > 1 ? d.series.map(x => ({ k: x.k, v: x[key] })) : null;
  const integ = `/sites/${encodeURIComponent(site.id)}/integrations`;
  const next = (what, step) => ctx.canEdit ? html`${what} ${step} em <a href="${integ}">Integrações</a>.` : `${what} Quem edita o site conecta as fontes em Integrações.`;
  const noSales = next('Nenhuma venda no período.', 'Conecte uma plataforma de vendas'), noUtm = next('Nenhuma venda com UTM no período.', 'Use o template de UTM');
  return layout(ctx, `Resumo · ${site.name}`, html`
${pageHead(`${site.name} · Resumo`, raw('Faturamento, gastos e <em>lucro</em>'), 'Vendas aprovadas das suas plataformas, cruzadas com o que você investiu em anúncios.', synced(ctx, d.lastSync))}
${toolbar(ctx, p, f, { filters: SALE_FILTERS, label: saleLabel, extra: selects(ctx, { platform: d.platforms.map(k => [k, PLATFORMS[k] ?? k]), product: d.products.map(x => [x, x]) }) })}
${empty ? notice(html`Ainda não há vendas nem gastos. Conecte uma plataforma de vendas e a Meta em ${integLink(ctx)}.`) : ''}
<div class="hero">${kpi('net', 'Faturamento líquido', c.net, pv.net, m, { feature: true, spark: sp('v') })}${kpi('spend', 'Gastos com anúncios', c.spend, pv.spend, m, { invert: true, spark: sp('s') })}
${kpi('roas', 'ROAS', c.roas, pv.roas, sx, { tone: tone(c.roas, 1) })}${kpi('profit', 'Lucro', c.profit, pv.profit, m, { tone: tone(c.profit) })}</div>
<div class="kpis">${kpi('paid', 'Vendas aprovadas', c.paid, pv.paid, num)}${kpi('meta-purchases', 'Compras (Meta)', c.metaPurchases, pv.metaPurchases, num)}${kpi('meta-roas', 'ROAS (Meta)', c.metaRoas, pv.metaRoas, sx)}${c.metaLeads || pv.metaLeads ? kpi('meta-leads', 'Leads (Meta)', c.metaLeads, pv.metaLeads, num) : ''}${kpi('gross', 'Faturamento bruto', c.gross, pv.gross, m)}${kpi('ticket', 'Ticket médio', c.ticket, pv.ticket, m)}
${kpi('cpa', 'CPA', c.cpa, pv.cpa, m, { invert: true })}${kpi('roi', 'ROI', c.roi, pv.roi, pct)}${kpi('margin', 'Margem', c.margin, pv.margin, pct)}
${kpi('pending', 'Pendentes', c.pending_value, pv.pending_value, m)}${kpi('refunds', 'Reembolsos', c.refund_rate, pv.refund_rate, pct, { invert: true })}
${kpi('chargeback', 'Chargeback', c.chargeback_rate, pv.chargeback_rate, pct, { invert: true })}${kpi('tax', `Imposto (${num(site.tax_rate)}%)`, c.tax, pv.tax, m)}</div>
${d.funnels ? funnelsTable(ctx, d.funnels, m) : ''}
<section class="card"><h2>Faturamento × gastos</h2>${chart(d.series, d.prevSeries, {
    label: 'Faturamento líquido', color: 'var(--s1)', fmt: m, line: p.days > 1 ? { key: 's', label: 'Gastos', color: 'var(--s2)' } : null, tip: x => [`${num(x.n)} vendas`], marks: d.marks, empty: next('Sem vendas nem gastos no período.', 'Conecte a plataforma de vendas e a Meta'),
  })}</section>
<div class="grid two"><section class="card"><h2>Vendas por pagamento</h2><div style="margin-top:14px">${share(d.methods.map(x => ({ label: METHODS[x.k] ?? x.k, v: x.v, n: x.n })), { fmt: m, empty: noSales })}</div></section>
${tabs('Origem das vendas', [['Campanha', list(ctx, d.campaigns, 'utm_campaign', { head: 'utm_campaign', cols: [['Faturamento', 'v', m], ['Vendas', 'n']], filter: false, label: saleLabel, empty: noUtm })],
    ['Fonte', list(ctx, d.sources, 'utm_source', { head: 'utm_source', cols: [['Faturamento', 'v', m], ['Vendas', 'n']], label: saleLabel, empty: noUtm })]])}
${tabs('Produtos', [['Produtos', list(ctx, d.productsTop, 'product', { head: 'Produto', cols: [['Faturamento', 'v', m], ['Vendas', 'n']], label: saleLabel, empty: noSales })]])}
${tabs('Plataformas', [['Plataformas', list(ctx, d.platformsTop, 'platform', { head: 'Plataforma', cols: [['Faturamento', 'v', m], ['Vendas', 'n']], label: saleLabel, empty: noSales })]])}
</div>`, AUTO);
}

/** Visão do cliente: um funil (site) por linha, do que mais fatura ao que menos, com o link para o painel de cada um. */
function funnelsTable(ctx, rows, m) {
  const keep = new URLSearchParams([...ctx.q].filter(([k]) => ['range', 'from', 'to', 'compare'].includes(k))).toString();
  return html`<section class="card"><h2>Funis do cliente</h2><p class="muted">Cada site é um funil, com o próprio pixel e o gasto das campanhas dele. Um pedido que chegou a dois sites conta nos dois aqui, e uma vez no total acima.</p>
<div class="tw"><table class="list"><thead><tr><th scope="col">Funil</th><th scope="col">Faturamento líquido</th><th scope="col">Gastos</th><th scope="col">ROAS</th><th scope="col">Lucro</th><th scope="col">Vendas</th><th scope="col">Ticket médio</th></tr></thead>
<tbody>${[...rows].sort((a, b) => b.t.net - a.t.net).map(({ site: s, t }) => html`<tr><td><a href="/sites/${encodeURIComponent(s.id)}${keep ? '?' + keep : ''}">${s.name}</a></td>
<td>${m(t.net)}</td><td>${m(t.spend)}</td><td>${sx(t.roas)}</td><td class="${t.profit < 0 ? 'neg' : t.profit > 0 ? 'pos' : ''}">${m(t.profit)}</td><td>${num(t.paid)}</td><td>${t.ticket == null ? '-' : m(t.ticket)}</td></tr>`)}</tbody></table></div></section>`;
}

const SRC = { sinqfy: 'Sinqfy', meta: 'Meta' };
// O que costuma causar a perda em cada etapa (texto do aviso de gargalo).
const CAUSE = {
  click: 'O anúncio é visto e pouco clicado: teste outro criativo, gancho ou público.',
  visit: 'A pessoa clica e não chega à página (ou chega sem ser reconhecida): confira a velocidade da página e se o anúncio usa o template de UTM.',
  engage: 'A pessoa chega e sai logo: título, primeira dobra, oferta ou velocidade no celular.',
  checkout: 'A página não leva ao checkout: oferta, preço, prova social ou o botão de compra.',
  buy: 'O checkout perde gente: meio de pagamento, preço final, frete ou confiança. Vale ligar a recuperação de venda pendente.',
};
const WHY = { sinqfy: 'script na página, sem bloqueio de navegador', meta: 'estimativa da Meta' };
/** Faixa do funil (SVG 100 por etapa, 100 de altura): plana em cada coluna e curva suave na passagem para a próxima. */
function flowPath(hs) {
  const top = h => (50 - h / 2).toFixed(2), bot = h => (50 + h / 2).toFixed(2), n = hs.length;
  let d = `M0,${top(hs[0])}`;
  for (let i = 0; i < n - 1; i++) { const x = i * 100; d += ` L${x + 55},${top(hs[i])} C${x + 85},${top(hs[i])} ${x + 85},${top(hs[i + 1])} ${x + 115},${top(hs[i + 1])}`; }
  d += ` L${n * 100},${top(hs[n - 1])} L${n * 100},${bot(hs[n - 1])}`;
  for (let i = n - 2; i >= 0; i--) { const x = i * 100; d += ` L${x + 115},${bot(hs[i + 1])} C${x + 85},${bot(hs[i + 1])} ${x + 85},${bot(hs[i])} ${x + 55},${bot(hs[i])}`; }
  return `${d} L0,${bot(hs[0])}Z`;
}

/** Funil dos anúncios: colunas por etapa a partir do clique, faixa contínua proporcional (azul da marca), o trecho do gargalo em vermelho. Detalhes no tooltip. */
function adFunnel(ctx, fn, m) {
  const all = fn.stages, imp = all[0], st = all.slice(1), first = st[0]?.v || 0;
  const metas = (fn.options || []).filter(r => r.platform === 'meta');
  const g = st.find(s => s.gargalo), gi = st.indexOf(g), compared = all.some(s => s.before != null);
  const when = fn.prev ? `${brDate(fn.prev.from)} a ${brDate(fn.prev.to)}` : '';
  const why = s => s.k === 'buy' && s.src === 'sinqfy' ? 'venda confirmada pela plataforma' : WHY[s.src];
  const hs = st.map(s => first ? Math.max(1.5, 92 * s.v / first) : 1.5), d = flowPath(hs), W = st.length * 100;
  const tip = s => [s.t, `${num(s.v)} ${s.d.toLowerCase()}`, `Fonte: ${SRC[s.src]} (${why(s)})`,
    ...(s.alt != null && s.alt !== s.v ? [`${SRC[s.altSrc]} registrou ${num(s.alt)}`] : []),
    ...(s.rate != null ? [`Passaram da etapa anterior: ${pct(s.rate)}${s.before != null ? ` (antes ${pct(s.before)})` : ''}`] : []),
    ...(s.cost ? [`Custo por pessoa: ${m(s.cost)}`] : [])].join('|');
  return html`<section class="card" id="funil"><div class="row between"><h2>Funil dos anúncios</h2>
<form method="get" action="#funil" class="row">${hiddenInputs(ctx.q, ['fc'])}<label class="sr" for="fc">Campanha</label><select id="fc" name="fc" data-submit><option value="">Todas as campanhas da Meta</option>${metas.map(r => html`<option value="${r.id}"${fn.fc === r.id ? raw(' selected') : ''}>${r.name}</option>`)}</select><button class="auto-btn">Ver</button></form></div>
${!imp.v ? html`<p class="empty">Sem dados da Meta neste período. Conecte a conta em ${integLink(ctx, '#meta')}.</p>` : html`
<p class="flow-sum"><span><b>${num(imp.v)}</b> impressões</span><span><b>${pct(st[0]?.rate)}</b> clicaram</span>${fn.spend ? html`<span><b>${m(fn.spend)}</b> investidos</span>` : ''}</p>
<div class="tw"><div class="flow" style="--n:${st.length}">
<svg class="flow-band" viewBox="0 0 ${W} 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="flow-g"><stop offset="0" stop-color="var(--s1)"/><stop offset="1" stop-color="var(--s1)" stop-opacity=".45"/></linearGradient>${g ? html`<clipPath id="flow-c"><rect x="${(gi - 1) * 100 + 55}" y="0" width="${W}" height="100"/></clipPath>` : ''}</defs>
<path d="${d}" fill="url(#flow-g)"/>${g ? html`<path d="${d}" fill="var(--bad)" clip-path="url(#flow-c)" opacity=".9"/>` : ''}</svg>
${st.map((s, i) => html`<div class="fcol${s.gargalo ? ' bad' : ''}" style="grid-column:${i + 1}" data-tip="${tip(s)}" tabindex="0" aria-label="${tip(s).replaceAll('|', '. ')}">
<span class="fcol-t">${s.t}</span><b class="fcol-p">${first ? pct(s.v / first) : '-'}</b><span class="fcol-v">${num(s.v)}${s.gargalo ? html` <em>gargalo</em>` : ''}</span><span class="fcol-s">${SRC[s.src]}</span></div>`)}
</div></div>
${g ? html`<p class="flow-note bad">${raw('<b>Gargalo:</b>')} ${g.t.toLowerCase()}. ${pct(g.rate)} passaram da etapa anterior, contra ${pct(g.before)} no período anterior (${when}). ${CAUSE[g.k]}</p>`
  : html`<p class="flow-note">${compared ? `Nenhuma etapa caiu em relação ao período anterior (${when}).` : 'O gargalo aparece quando houver dados do período anterior para comparar.'}</p>`}`}
</section>`;
}

/** Seletores de campanha e conjunto (navegação da Meta): escolher a campanha mostra os conjuntos dela; o conjunto, os anúncios. */
function drill(ctx, level, nav) {
  const camps = nav.campaigns.filter(r => r.platform === 'meta' && !r.unmatched), sets = nav.adsets.filter(r => r.platform === 'meta' && !r.unmatched);
  if (!camps.length) return '';
  const opt = (r, cur) => html`<option value="${r.id}"${cur === r.id ? raw(' selected') : ''}>${r.name}</option>`;
  return html`<form method="get" class="row drill">${hiddenInputs(ctx.q, ['campaign', 'adset', 'level', 'fc'])}<input type="hidden" name="level" value="${level === 'campaign' ? 'adset' : level}">
<label class="sr" for="d-camp">Campanha</label><select id="d-camp" name="campaign" data-submit><option value="">Todas as campanhas</option>${camps.map(r => opt(r, nav.campaign))}</select>
${nav.campaign ? html`<span class="muted" aria-hidden="true">›</span><label class="sr" for="d-set">Conjunto</label><select id="d-set" name="adset" data-submit><option value="">Todos os conjuntos</option>${sets.map(r => opt(r, nav.adset))}</select>` : ''}
<button class="auto-btn">Ver</button></form>`;
}

export function campaignsPage(ctx, p, level, rows, lastSync, funnel = null, nav = { campaigns: [], adsets: [] }) {
  const site = ctx.site, m = v => money(v, site.currency);
  const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const spend = sum('spend'), net = sum('net'), sales = sum('sales'), profit = sum('profit'), metaP = sum('metaPurchases'), metaV = sum('metaValue'), leads = sum('metaLeads');
  return layout(ctx, `Campanhas · ${site.name}`, html`
${pageHead(`${site.name} · Campanhas`, raw('Cada real <em>investido</em>'), raw('<b>Vendas</b> e <b>ROAS</b> vêm dos webhooks (dinheiro confirmado, ligado pela UTM). <b>Compras</b> e <b>ROAS (Meta)</b> são o que a própria Meta atribui ao anúncio, na janela de atribuição da conta. <b>Abriu</b> conta o primeiro anúncio do lead; <b>Participou</b>, todo anúncio que ele viu antes de comprar.'), synced(ctx, lastSync))}
${toolbar(ctx, p, {}, { compare: false })}
<div class="toolbar"><nav class="seg" aria-label="Nível">${Object.entries(LEVEL_PT).map(([k, t]) => html`<a href="${link(ctx.q, { level: k === 'campaign' ? null : k, ...(k === 'campaign' && { campaign: null, adset: null, fc: null }), ...(k === 'adset' && { adset: null }) })}"${on(level === k)}>${t}</a>`)}</nav>${drill(ctx, level, nav)}</div>
<div class="hero">${kpi('c-net', 'Faturamento', net, null, m, { feature: true })}${kpi('c-spend', 'Gastos', spend, null, m)}${kpi('c-roas', 'ROAS', spend ? net / spend : null, null, sx, { tone: tone(spend ? net / spend : null, 1) })}${kpi('c-profit', 'Lucro', profit, null, m, { tone: tone(profit) })}</div>
${funnel ? adFunnel(ctx, funnel, m) : ''}
${rows.length ? html`<section class="card"><div class="tw"><table class="data mcards"><thead><tr><th>Status</th><th style="text-align:left">${LEVEL_PT[level].slice(0, -1)}</th><th>Orçamento</th><th>Gastos</th><th>Vendas</th><th title="Vendas em que este foi o primeiro anúncio clicado pelo lead (primeiro toque pago)">Abriu</th><th title="Vendas em que este anúncio aparece em alguma visita do lead nos 30 dias antes da compra">Participou</th><th>CPA</th><th>Faturamento</th><th>ROAS</th><th>Compras (Meta)</th><th>ROAS (Meta)</th>${leads ? html`<th>Leads (Meta)</th>` : ''}<th>Lucro</th><th>ROI</th><th>CTR</th></tr></thead>
<tbody>${rows.map(r => html`<tr><td style="text-align:left">${r.unmatched ? html`<span class="badge st-paused">sem gasto</span>` : html`<span class="badge st-${/PAUSED/.test(r.status) ? 'paused' : r.status || 'paused'}">${r.statusPt}</span>`}</td>
<td class="c-main" style="text-align:left;white-space:normal;min-width:220px">${level === 'ad' && !r.unmatched ? html`<span class="ad-name">${r.thumb ? html`<img class="ad-thumb" src="${r.thumb}" alt="" width="48" height="48" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="ad-thumb none" aria-hidden="true">${icon('image')}</span>`}<span>${r.name}</span></span>` : level === 'campaign' && r.platform === 'meta' ? html`<a href="${link(ctx.q, { level: 'adset', campaign: r.id, adset: null, fc: null })}" title="Ver os conjuntos desta campanha">${r.name}</a>`
  : level === 'adset' && r.platform === 'meta' && (nav.campaign || r.parent) ? html`<a href="${link(ctx.q, { level: 'ad', campaign: nav.campaign || r.parent, adset: r.id, fc: null })}" title="Ver os anúncios deste conjunto">${r.name}</a>` : r.name}${r.platform && r.platform !== 'meta' ? html` <small class="muted">· ${r.platform}</small>` : ''}</td>
<td>${r.budget != null ? m(r.budget) : '-'}</td><td>${m(r.spend)}</td><td>${num(r.sales)}</td><td>${num(r.first)}</td><td>${num(r.touched)}</td><td>${r.cpa != null ? m(r.cpa) : '-'}</td><td>${m(r.net)}</td>
<td>${sx(r.roas)}</td><td>${num(r.metaPurchases)}</td><td>${sx(r.metaRoas)}</td>${leads ? html`<td>${num(r.metaLeads)}</td>` : ''}<td class="${r.profit < 0 ? 'neg' : r.profit > 0 ? 'pos' : ''}">${m(r.profit)}</td><td>${pct(r.roi)}</td><td>${pct(r.ctr)}</td></tr>`)}</tbody>
<tfoot><tr><th style="text-align:left">Total</th><th></th><th></th><th>${m(spend)}</th><th>${num(sales)}</th><th>${num(sum('first'))}</th><th></th><th>${sales ? m(spend / sales) : '-'}</th><th>${m(net)}</th><th>${sx(spend ? net / spend : null)}</th><th>${num(metaP)}</th><th>${sx(spend ? metaV / spend : null)}</th>${leads ? html`<th>${num(leads)}</th>` : ''}<th>${m(profit)}</th><th>${pct(spend ? profit / spend : null)}</th><th></th></tr></tfoot></table></div></section>`
    : notice(html`Nenhum gasto ou venda com UTM no período. Conecte a conta de anúncios da Meta em ${integLink(ctx)}.`)}`, AUTO);
}

export function ordersPage(ctx, p, f, d, page) {
  const site = ctx.site, m = v => money(v, site.currency);
  const time = ts => new Date(ts).toLocaleString('pt-BR', { timeZone: site.timezone, dateStyle: 'short', timeStyle: 'short' });
  const more = d.rows.length > 50, rows = d.rows.slice(0, 50);
  return layout(ctx, `Pedidos · ${site.name}`, html`
${pageHead(`${site.name} · Pedidos`, raw('Pedido a <em>pedido</em>'), 'Tudo o que as plataformas enviaram, com status atualizado a cada webhook. Sem dados pessoais do comprador.')}
${toolbar(ctx, p, f, { compare: false, filters: SALE_FILTERS, label: saleLabel, extra: html`<nav class="seg" aria-label="Status"><a href="${link(ctx.q, { f_status: null, page: null })}"${on(!f.status)}>Todos</a>${Object.entries(STATUSES).map(([k, t]) => html`<a href="${link(ctx.q, { f_status: k, page: null })}"${on(f.status === k)}>${t}</a>`)}</nav>${selects(ctx, { platform: Object.entries(PLATFORMS), product: d.products.map(x => [x, x]), method: Object.entries(METHODS) })}` })}
<section class="card">${rows.length ? html`<div class="tw"><table class="data txt mcards"><thead><tr><th>Data</th><th>Pedido</th><th>Produto</th><th>Plataforma</th><th>Pagamento</th><th>Status</th><th class="num">Bruto</th><th class="num">Líquido</th><th>Origem</th></tr></thead>
<tbody>${rows.map(s => html`<tr><td style="text-align:left">${time(s.ts)}</td><td style="text-align:left"><code>${s.order_id}</code></td><td style="text-align:left;white-space:normal">${s.product || '-'}</td>
<td>${PLATFORMS[s.platform] ?? s.platform}</td><td>${METHODS[s.method]}</td><td><span class="badge st-${s.status}">${STATUSES[s.status]}</span></td><td class="num">${m(s.gross)}</td><td class="num">${m(s.net)}</td>
<td style="white-space:normal;max-width:260px"><span class="tag${s.match_rule === 'rid' ? ' ok' : ''}" title="Como a venda foi ligada ao anúncio">${MATCH_PT[s.match_rule] || MATCH_PT.none}</span> ${s.utm_source || s.utm_campaign ? html`${s.utm_source}${s.utm_campaign ? html` · <span class="muted">${s.utm_campaign}</span>` : ''}` : html`<span class="muted">sem UTM</span>`}${s.ft_campaign && s.ft_campaign !== s.utm_campaign ? html`<br><small class="muted" title="Primeiro anúncio clicado pelo lead">abriu: ${s.ft_campaign}${s.ft_content ? ` · ${s.ft_content}` : ''}</small>` : ''}</td></tr>`)}</tbody></table></div>
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
const sheetScript = url => `// Rastro: envia as vendas desta planilha (1ª linha = cabeçalho) e escreve o resultado na coluna Rastro.
const RASTRO_URL = '${url}';
const ABA = 'Vendas'; // nome da aba com as vendas

function rastroEnviar() {
  const aba = SpreadsheetApp.getActive().getSheetByName(ABA);
  if (!aba) throw new Error('Aba "' + ABA + '" não encontrada');
  const dados = aba.getDataRange().getValues();
  const cab = dados[0].map(String);
  let col = cab.findIndex(h => h.trim().toLowerCase() === 'rastro');
  if (col < 0) { col = cab.length; aba.getRange(1, col + 1).setValue('Rastro'); }
  const linhas = [];
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][col] || '') !== '' || dados[i].every(v => v === '')) continue; // já enviada ou com erro: limpe a célula para tentar de novo
    const values = {};
    cab.forEach((h, j) => { if (j !== col && h) values[h] = dados[i][j] instanceof Date ? Utilities.formatDate(dados[i][j], 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') : String(dados[i][j]); });
    linhas.push({ row: i + 1, values });
  }
  for (let k = 0; k < linhas.length; k += 200) {
    const res = UrlFetchApp.fetch(RASTRO_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ rows: linhas.slice(k, k + 200) }), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Rastro respondeu ' + res.getResponseCode());
    const agora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm');
    JSON.parse(res.getContentText()).results.forEach(r => aba.getRange(r.row, col + 1).setValue(r.ok ? 'enviado ' + agora : 'erro: ' + r.message));
  }
}

function rastroConfigurar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'rastroEnviar').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rastroEnviar').timeBased().everyMinutes(5).create();
  rastroEnviar();
}`;

// Seção de cada ação de Integrações (o POST volta para a âncora dela).
export const INTEG_SECTION = { rotate: 'plataformas', secrets: 'plataformas', custom_map: 'custom', custom_preview: 'custom', meta_add: 'meta', meta_sync: 'meta', meta_remove: 'meta', capi: 'capi', meta_test: 'capi', ga4: 'ga4', gads: 'gads' };

/** Integrações em grade de ícones: cada um abre só a sua configuração (âncora + :target, funciona sem JavaScript). */
export function integrationsPage(ctx, originUrl, d, msg, err) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}/integrations`;
  const secrets = (() => { try { return JSON.parse(s.hook_secrets || '{}') || {}; } catch { return {}; } })();
  const cmap = d.customDraft || (() => { try { return JSON.parse(s.custom_map || 'null') || {}; } catch { return {}; } })();
  const time = ts => ts ? new Date(ts).toLocaleString('pt-BR', { timeZone: s.timezone, dateStyle: 'short', timeStyle: 'short' }) : 'nunca';
  const act = sec => `${base}#${sec}`;
  const st = (ok, text) => html`<span class="tag ${ok === true ? 'ok' : ok === false ? 'warn' : ''}">${text}</span>`;
  const lastHook = d.logs[0];
  const ic = (id, name) => html`<span class="tile-ic${Object.hasOwn(BRANDS, name) ? ' brand' : ''}" style="view-transition-name:ic-${id}">${Object.hasOwn(BRANDS, name) ? raw(brandSvg(name, 24)) : icon(name, 22)}</span>`;
  const parts = [
    ['site', 'Rastreamento no site', 'globe', 'Snippet, UTMs e eventos de conversão.', st(null, 'Copiar e colar'), html`
<section class="card"><h2>Snippet</h2><p class="muted">Cole no <code>&lt;head&gt;</code> de todas as páginas. Pelo subdomínio <code>t.</code> (Worker da borda), os cookies <code>_rid</code>, <code>_fbp</code> e <code>_fbc</code> ficam no seu domínio por 400 dias.</p>
<pre><code>${`<script defer data-site="${s.id}" src="${d.edgeUrl}/s.js"></script>`}</code></pre>
<p class="muted">Opções no <code>&lt;script&gt;</code>: <code>data-consent="required"</code> (nada de cookie nem envio a terceiros até o banner chamar <code>rastro('consent')</code>) e <code>data-pixel="mirror"</code> (repete cada evento no Pixel com o mesmo <code>eventID</code>; tire o <code>fbq('track','PageView')</code> do código base).</p></section>
<section class="card"><h2>Template de UTM para a Meta</h2><p class="muted">No Ads Manager, em Parâmetros de URL.</p><pre><code>${UTM_TEMPLATE}</code></pre>
<p class="muted">O id depois do <code>|</code> liga cada venda à campanha, ao conjunto e ao anúncio certos. O snippet repassa as UTMs da página para os links de checkout (para a Hotmart: <code>src</code> e <code>sck</code>).</p></section>
<section class="card"><h2>Eventos de conversão</h2><pre><code>${`<button data-rastro="cadastro" data-rastro-plano="pro">Assinar</button>
<a data-rastro="compra" data-rastro-revenue="97.90" href="/checkout">Comprar</a>
rastro('compra', { plano: 'pro' }, 97.90)`}</code></pre></section>`],
    ['plataformas', 'Plataformas de venda', 'link', 'Webhooks de Hotmart, Kiwify, Shopify, Stripe e outras.', lastHook ? st(!!lastHook.ok, `Último webhook: ${time(lastHook.ts)}`) : st(false, 'Nenhum webhook ainda'), html`
<section class="card"><h2>URLs dos webhooks</h2><p class="muted">Cadastre a URL como webhook (eventos de compra, reembolso e chargeback) na plataforma. O token na URL identifica este site. A venda é ligada ao clique pelo <code>rid</code> que o snippet põe no link de checkout (Hotmart em <code>xcod</code>, Kiwify e OnProfit em <code>sck</code>, Stripe em <code>client_reference_id</code>).</p>
<div class="platforms" style="margin-top:12px">${Object.entries(PLATFORMS).filter(([k]) => k !== 'custom' && k !== 'sheets').map(([k, t]) => html`<div class="platform"><div class="row between"><span class="lbl">${t}</span>${SIGNED[k] ? html`<span class="tag ${secrets[k] ? 'ok' : 'warn'}">${secrets[k] ? 'assinatura conferida' : 'sem assinatura'}</span>` : ''}</div><pre><code>${originUrl}/hooks/${hookToken(s, k)}/${k}</code></pre></div>`)}</div>
<form method="post" action="${act('plataformas')}" class="row" style="margin-top:12px"><input type="hidden" name="action" value="rotate"><button class="danger">Gerar novo token</button><span class="muted">as URLs antigas param de funcionar</span></form></section>
<section class="card"><h2>Segredos de assinatura</h2><form method="post" action="${act('plataformas')}" class="stack" style="margin-top:10px;max-width:none"><input type="hidden" name="action" value="secrets">
<p class="muted" style="margin:0">Com o segredo, o Sinqfy recusa webhooks sem a assinatura da plataforma. Cada plataforma tem a sua URL, então a de uma não serve para outra. Campo vazio mantém o atual; digite <code>-</code> para apagar.</p>
<div class="fields">${Object.entries(SIGNED).map(([k, t]) => html`<label class="f">${PLATFORMS[k]}<span>${t}</span><input name="secret_${k}" type="password" autocomplete="off" placeholder="${secrets[k] ? '•••••• (configurado)' : 'não configurado'}"></label>`)}</div>
<div><button>Salvar segredos</button></div></form></section>
<section class="card"><h2>Últimos webhooks</h2>${d.logs.length ? html`<div class="tw"><table class="data txt"><thead><tr><th>Quando</th><th>Plataforma</th><th>Pedido</th><th>Resultado</th></tr></thead><tbody>${d.logs.map(l => html`<tr><td style="text-align:left">${time(l.ts)}</td><td>${PLATFORMS[l.platform] ?? l.platform}</td><td><code>${l.order_id || '-'}</code></td><td class="${l.ok ? '' : 'neg'}" style="white-space:normal">${l.message}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">Nenhum webhook recebido ainda.</p>`}</section>`],
    ['custom', 'Webhook personalizado', 'plug', 'Qualquer checkout, CRM ou automação que mande JSON.', s.custom_map ? st(true, 'Mapa salvo') : st(null, 'Não configurado'), html`
<section class="card"><p class="muted" style="margin-top:0">Para qualquer checkout, CRM ou automação (Make, n8n, Zapier) que mande JSON: diga onde fica cada campo e quais valores de status contam como venda. Caminhos com ponto, ex.: <code>data.order.id</code> ou <code>items[0].name</code>.</p>
<pre><code>${originUrl}/hooks/${hookToken(s, 'custom')}/custom</code></pre>
<form method="post" action="${act('custom')}" class="stack" style="margin-top:12px;max-width:none">
<div class="fields">${Object.entries(CUSTOM_FIELDS).map(([k, t]) => html`<label class="f">${t}<input name="f_${k}" value="${cmap.fields?.[k] || ''}" placeholder="${k === 'order_id' ? 'obrigatório' : k === 'amount' ? 'obrigatório' : ''}" maxlength="200" autocomplete="off"></label>`)}</div>
<p class="muted" style="margin:0">Valores de status que contam em cada situação, separados por vírgula (sem diferenciar maiúsculas).</p>
<div class="fields">${CUSTOM_STATUSES.map(k => html`<label class="f">Status ${STATUSES[k]}<input name="s_${k}" value="${cmap.status?.[k] || ''}" maxlength="300" autocomplete="off"></label>`)}</div>
<label class="row"><input type="checkbox" name="cents" value="1"${cmap.cents ? raw(' checked') : ''}> Valores em centavos</label>
<label class="f">Exemplo do JSON (para testar o mapa)<textarea name="sample" rows="6" spellcheck="false">${d.preview?.sample || ''}</textarea></label>
${d.preview ? (d.preview.error ? notice(d.preview.error, true) : html`<div class="platform"><span class="lbl">Venda lida do exemplo</span><pre><code>${JSON.stringify({ pedido: d.preview.parsed.order_id, status: STATUSES[d.preview.parsed.status], valor: d.preview.parsed.gross, liquido: d.preview.parsed.net, moeda: d.preview.parsed.currency, produto: d.preview.parsed.product, rid: d.preview.parsed.rid || '', utm: d.preview.parsed.utm }, null, 2)}</code></pre></div>`) : ''}
<div class="row"><button name="action" value="custom_preview">Testar com o exemplo</button><button name="action" value="custom_map" class="primary">Salvar mapa</button></div></form></section>`],
    ['sheets', 'Google Sheets', 'google-sheets', 'Vendas registradas numa planilha, enviadas a cada 5 minutos.', st(null, 'Script pronto'), html`
<section class="card"><p class="muted" style="margin-top:0">Para vendas que você registra numa planilha (venda pelo WhatsApp, boleto manual, outro checkout). Um script dentro da planilha envia as linhas novas a cada 5 minutos e escreve o resultado numa coluna <b>Rastro</b>. Nada fica público.</p>
<ol class="steps"><li>Na planilha, deixe as vendas numa aba chamada <b>Vendas</b> com cabeçalho na 1ª linha: <code>Pedido</code>, <code>Status</code>, <code>Valor</code>, e se tiver, <code>Data</code>, <code>Produto</code>, <code>E-mail</code>, <code>Telefone</code>, <code>rid</code>, <code>utm_campaign</code>.</li>
<li>Abra <b>Extensões, Apps Script</b>, apague o que estiver lá e cole o código abaixo.</li>
<li>Escolha a função <b>rastroConfigurar</b> e clique em <b>Executar</b> (o Google pede permissão uma vez).</li>
<li>Linha com erro ou que mudou (ex.: Reembolsado): corrija e apague a célula da coluna Rastro dela para enviar de novo. Não repita na planilha pedidos que já chegam por uma plataforma, senão a venda conta duas vezes.</li></ol>
<pre class="code"><code>${sheetScript(`${originUrl}/hooks/${hookToken(s, 'sheets')}/sheets`)}</code></pre></section>`],
    ['meta', 'Meta Ads: gasto e campanhas', 'meta', 'Lê da Meta campanhas, anúncios e gasto diário. Não envia nada.', d.accounts.length ? st(!d.accounts.some(a => a.last_error), `${d.accounts.length} ${d.accounts.length > 1 ? 'contas conectadas' : 'conta conectada'}`) : st(false, 'Não conectado'), html`
<section class="card"><p class="muted" style="margin-top:0">Importa campanhas, conjuntos, anúncios, status, orçamento e gasto diário a cada 5 minutos. Somente leitura: o token precisa só da permissão <code>ads_read</code> (gere um token de usuário do sistema no Business Manager).</p>
${d.accounts.map(a => html`<div class="platform" style="margin-top:10px"><div class="row between"><b>${a.name || 'act_' + a.account_id}</b><code>act_${a.account_id}</code></div>
<p class="muted" style="margin:6px 0">Última sincronização: ${time(a.last_sync)}${a.currency && a.currency !== s.currency ? html` · <span class="neg">moeda da conta ${a.currency} ≠ ${s.currency}</span>` : ''}</p>${a.last_error ? html`<p class="neg" style="margin:6px 0">Erro: ${a.last_error}</p>` : ''}
<div class="row"><form method="post" action="${act('meta')}"><input type="hidden" name="action" value="meta_sync"><input type="hidden" name="account" value="${a.id}"><button>Sincronizar agora</button></form>
<form method="post" action="${act('meta')}"><input type="hidden" name="action" value="meta_remove"><input type="hidden" name="account" value="${a.id}"><button class="link danger">Remover</button></form></div></div>`)}
<form method="post" action="${act('meta')}" class="stack" style="margin-top:14px"><input type="hidden" name="action" value="meta_add">
<label class="f">ID da conta de anúncios<input name="account_id" required pattern="(act_)?[0-9]{5,25}" placeholder="act_1234567890" inputmode="numeric"></label>
<label class="f">Token de acesso<input name="token" type="password" required autocomplete="off"></label><div><button class="primary">Conectar conta</button></div></form></section>`],
    ['capi', 'Meta Pixel: Conversions API', 'meta', 'Envia à Meta os eventos do site e as vendas, pelo servidor e com reenvio automático.', s.meta_pixel ? st(true, s.meta_checked ? 'Ativo e conferido' : 'Ativo') : st(null, 'Desativado'), html`
<section class="card"><p class="muted" style="margin-top:0">Todo evento do site (PageView, Lead, InitiateCheckout e os seus) e cada venda aprovada vão à Conversions API pelo servidor, com reenvio automático. E-mail e telefone seguem só em SHA-256.</p>
${health(d, 'meta')}${s.meta_test_code ? html`<div style="margin-top:12px">${notice(html`Código de teste ativo (<code>${s.meta_test_code}</code>): os eventos aparecem só na aba Testar eventos da Meta. Apague o código quando terminar o teste.`, true)}</div>` : ''}
<form method="post" action="${act('capi')}" class="stack" style="margin-top:12px"><input type="hidden" name="action" value="capi">
<label class="f">ID do pixel / conjunto de dados<input name="pixel" value="${s.meta_pixel || ''}" pattern="[0-9]{5,25}" placeholder="vazio = desativado" inputmode="numeric"></label>
<label class="f">Token da Conversions API<input name="capi_token" type="password" autocomplete="off" placeholder="${s.meta_capi_token ? '•••••• (mantido; preencha para trocar)' : ''}"></label>
<label class="f">Código de teste (opcional)<span>Gerenciador de Eventos, aba Testar eventos. Começa com TEST.</span><input name="test_code" value="${s.meta_test_code || ''}" pattern="TEST[A-Za-z0-9_]{1,40}" autocomplete="off"></label>
<div class="row"><button class="primary">Salvar</button></div></form>
${s.meta_pixel && s.meta_capi_token ? html`<form method="post" action="${act('capi')}" style="margin-top:10px"><input type="hidden" name="action" value="meta_test"><button>Conferir conexão com a Meta</button></form>` : ''}</section>`],
    ['ga4', 'Google Analytics 4: envio server-side', 'google-analytics', 'Conversões pelo Measurement Protocol.', s.ga4_id ? st(true, 'Ativo') : st(null, 'Desativado'), html`
<section class="card"><p class="muted" style="margin-top:0">Conversões (Lead, compra e eventos próprios) vão ao GA4 pelo Measurement Protocol, na mesma sessão do navegador (cookie <code>_ga</code>). As visitas continuam com o gtag do site, porque o GA4 não deduplica.</p>
${health(d, 'ga4')}
<form method="post" action="${act('ga4')}" class="stack" style="margin-top:12px"><input type="hidden" name="action" value="ga4">
<label class="f">ID de medição<input name="ga4_id" value="${s.ga4_id || ''}" pattern="[Gg]-[A-Za-z0-9]{4,20}" placeholder="G-XXXXXXX (vazio = desativado)" autocapitalize="characters"></label>
<label class="f">Segredo da API<span>Admin, Fluxos de dados, Measurement Protocol, Criar.</span><input name="ga4_secret" type="password" autocomplete="off" placeholder="${s.ga4_secret ? '•••••• (mantido; preencha para trocar)' : ''}"></label>
<div><button class="primary">Salvar</button></div></form></section>`],
    ['gads', 'Google Ads: conversões offline', 'google-ads', 'Compras e leads enviados ao Google Ads pelo servidor.', s.gads_customer ? st(true, 'Ativo') : st(null, 'Desativado'), html`
<section class="card"><p class="muted" style="margin-top:0">Cada compra aprovada e os eventos que você escolher vão ao Google Ads pela Data Manager API, com o clique do anúncio (<code>gclid</code>, <code>gbraid</code>, <code>wbraid</code>) e, quando houver, e-mail e telefone só em SHA-256 (conversões otimizadas para leads). O mesmo pedido nunca conta duas vezes.</p>
${health(d, 'gads')}
<ol class="steps"><li>No Google Cloud: crie um projeto, peça acesso à <b>Data Manager API</b> (formulário do Google) e ative a API. Em <b>IAM, Contas de serviço</b>, crie uma conta e baixe uma chave <b>JSON</b>.</li>
<li>No Google Ads: <b>Admin, Acesso e segurança</b>, adicione o e-mail da conta de serviço${gadsKey(s)?.client_email ? html` (<code>${gadsKey(s).client_email}</code>)` : ''} como usuário padrão.</li>
<li>Em <b>Metas, Conversões</b>, crie uma ação do tipo <b>Importar, de cliques</b> para cada evento. O ID da ação é o número depois de <code>ctId=</code> na URL dela.</li>
<li>Para não contar a mesma compra duas vezes: se o site também tem a tag de conversão do Google Ads ou importa a compra do GA4, deixe só uma delas como <b>ação principal</b> e as outras como secundárias.</li></ol>
<form method="post" action="${act('gads')}" class="stack" style="margin-top:12px"><input type="hidden" name="action" value="gads">
<label class="f">ID da conta do Google Ads<span>A conta dona das ações de conversão.</span><input name="gads_customer" value="${s.gads_customer || ''}" pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{4}" placeholder="123-456-7890 (vazio = desativado)" inputmode="numeric"></label>
<label class="f">ID da MCC (opcional)<span>Só se a conta de serviço entrou pela conta de administrador.</span><input name="gads_login" value="${s.gads_login || ''}" pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{4}" inputmode="numeric"></label>
<label class="f">Eventos e ações de conversão<span>Um por linha: nome do evento = ID da ação. Compras dos webhooks usam <code>Purchase</code>.</span><textarea name="gads_actions" rows="3" spellcheck="false" placeholder="Purchase = 123456789&#10;Lead = 987654321">${s.gads_actions ? Object.entries(JSON.parse(s.gads_actions)).map(([k, id]) => `${k} = ${id}`).join('\n') : ''}</textarea></label>
<label class="f">Chave JSON da conta de serviço<span>${s.gads_key ? 'Mantida; cole outra só para trocar.' : 'Cole o arquivo inteiro.'}</span><textarea name="gads_key" rows="3" spellcheck="false" autocomplete="off" placeholder="${s.gads_key ? '•••••• (mantida)' : '{ "type": "service_account", ... }'}"></textarea></label>
<div><button class="primary">Salvar</button></div></form></section>`],
  ];
  return layout(ctx, `Integrações · ${s.name}`, html`
${pageHead(`${s.name} · Integrações`, raw('Conecte <em>tudo</em>'), 'Escolha o que configurar. Cada item abre só o que ele precisa.')}
${notice(msg)}${notice(err, true)}
<div class="hub-page">
<nav class="hub" aria-label="Integrações">${parts.map(([id, t, name, desc, status]) => html`<a class="tile" href="#${id}">${ic(id, name)}<span class="tile-t">${t}</span><span class="tile-d">${desc}</span>${status}</a>`)}</nav>
${parts.map(([id, t, name, desc, status, body]) => html`<section class="part" id="${id}" aria-label="${t}"><a class="back" href="#">${icon('arrow-left', 16)}Todas as integrações</a>
<header class="part-h">${ic(id, name)}<div><h2>${t}</h2><p class="muted">${desc}</p></div>${status}</header>${body}</section>`)}
</div>`);
}
