// Páginas de tráfego: visão geral, tempo real, eventos, funis, caminhos, atribuição.
import { PLATFORMS, STATUSES } from '../sales/webhooks.js';
import { FILTERS, ATTR_DIMS, OTHER, IN_APP, VISIT_LOOKBACK, DEVICES } from '../tracking/stats.js';
import { html, raw, icon, brDate, delta, ratio, layout, pageHead, toolbar, kpi, list, tabs, chart, notice, num, pct, dur, money, countryName, SCREEN, hiddenInputs, link, on } from './ui.js';

export function label(col, k) {
  if (col === 'referrer') return k || 'Direto';
  if (col === 'country') return countryName(k);
  if (col === 'screen') return SCREEN[k] ?? k;
  return k === '' ? '(vazio)' : k;
}
const L = { label };
const tl = (ctx, p, f, compare = true) => toolbar(ctx, p, f, { compare, filters: FILTERS, label });

export function overviewPage(ctx, p, f, d) {
  const cur = d.cur, prev = d.prev || {}, site = ctx.site, rev = cur.revenue || prev.revenue;
  const m = v => money(v, site.currency), sp = key => p.days > 1 ? d.series.map(x => ({ k: x.k, v: x[key] })) : null;
  const utm = [['Fonte', d.utm_source, 'utm_source'], ['Mídia', d.utm_medium, 'utm_medium'], ['Campanha', d.utm_campaign, 'utm_campaign'], ['Conteúdo', d.utm_content, 'utm_content']];
  const live = ctx.share ? html`<span class="live"><i></i>${num(d.online)} online agora</span>` : html`<a class="live" href="/sites/${encodeURIComponent(site.id)}/realtime"><i></i>${num(d.online)} online agora</a>`;
  return layout(ctx, `${ctx.share ? 'Tráfego' : 'Visão geral'} · ${site.name}`, html`
${pageHead(`${site.name} · ${ctx.share ? 'Tráfego' : 'Visão geral'}`, raw(`Quem chega, <em>de onde</em> e o que faz`), null, live)}
${tl(ctx, p, f)}
<div class="hero">${kpi('visitors', 'Visitantes', cur.visitors, prev.visitors, num, { feature: true, spark: sp('v') })}${kpi('visits', 'Visitas', cur.visits, prev.visits, num)}
${kpi('pageviews', 'Visualizações', cur.pageviews, prev.pageviews, num, { spark: sp('n') })}${kpi('bounce', 'Rejeição', cur.bounce, prev.bounce, pct, { invert: true })}</div>
<div class="kpis">${kpi('duration', 'Duração da visita', cur.duration, prev.duration, dur)}${kpi('ppv', 'Páginas por visita', cur.visits ? cur.pageviews / cur.visits : null, prev.visits ? prev.pageviews / prev.visits : null, v => v == null ? '-' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}
${rev ? kpi('revenue', 'Receita (eventos)', cur.revenue, prev.revenue, m) : ''}</div>
<section class="card"><h2>Visitantes ao longo do tempo</h2>${chart(d.series, d.prevSeries, { tip: x => [`${num(x.n)} visualizações`] })}</section>
<div class="grid">
${tabs('Páginas', [['Mais vistas', list(ctx, d.pages, 'path', { head: 'Página', ...L })],
    ['Entrada', list(ctx, d.entry, 'path', { head: 'Página de entrada', cols: [['Visitantes', 'v'], ['Visitas', 'n']], ...L })],
    ['Saída', list(ctx, d.exit, 'path', { head: 'Página de saída', cols: [['Visitantes', 'v'], ['Visitas', 'n']], ...L })]])}
${tabs('Origens', [['Referências', list(ctx, d.referrers, 'referrer', { head: 'Referência', ...L })], ['Canais', list(ctx, d.channels, 'channel', { head: 'Canal', ...L })]])}
${tabs('UTM', utm.map(([t, rows, col]) => [t, rows.length ? list(ctx, rows, col, { head: t, ...L }) : html`<p class="empty">Nenhuma visita com <code>${col}</code> no período.</p>`]))}
${tabs('Localização', [['Países', list(ctx, d.countries, 'country', { head: 'País', ...L })]])}
${tabs('Dispositivos', [['Tipo', list(ctx, d.screens, 'screen', { head: 'Dispositivo', ...L })], ['Navegador', list(ctx, d.browsers, 'browser', { head: 'Navegador', ...L })], ['Sistema', list(ctx, d.oss, 'os', { head: 'Sistema', ...L })]])}
${appsCard(ctx, d.apps)}
${visitCard(d.visitNo)}
${tabs('Eventos', [['Eventos', list(ctx, d.events, 'name', { head: 'Evento', cols: [['Visitantes', 'v'], ['Total', 'n'], ...(d.events.some(e => e.rev) ? [['Receita', 'rev', v => v ? m(v) : '-']] : [])], ...L })],
    ...(d.props ? [['Propriedades', list(ctx, d.props, null, { head: `Propriedades de "${f.name}"`, filter: false })]] : [])])}
</div>`);
}

const rate = (a, b) => b ? pct(a / b) : '-';
/** Sessões por navegador ou app (Instagram, Facebook...) com a taxa de clique no checkout. */
function appsCard(ctx, rows) {
  const appLabel = (c, k) => IN_APP.has(k) ? html`${k} <span class="tag">App</span>` : label(c, k);
  return tabs('Navegador ou app', [['Ambiente', html`<p class="muted">Sessões por ambiente; ao lado, quantas clicaram no checkout.</p>
${list(ctx, rows.map(r => ({ ...r, r: rate(r.co, r.n) })), 'browser', { head: 'Navegador ou app', cols: [['Sessões', 'n'], ['Checkout', 'r', v => v]], label: appLabel })}`]]);
}
const VISIT_PT = ['', '1ª visita', '2ª visita', '3ª visita', '4ª ou mais'];
/** Em qual visita o lead clica no checkout e compra (só visitantes com o cookie _rid). */
function visitCard(rows) {
  const n = rows.reduce((s, r) => s + r.n, 0), first = rows.find(r => r.k === 1)?.n || 0;
  const body = rows.length ? html`<p class="muted">Primeira visita <b>${num(first)}</b> (${rate(first, n)}) · retorno <b>${num(n - first)}</b> (${rate(n - first, n)}). Visitas contadas nos ${VISIT_LOOKBACK} dias anteriores; vendas de qualquer plataforma, pelo rid.</p>
<div class="tw"><table class="list"><thead><tr><th scope="col">Visita</th><th scope="col">Sessões</th><th scope="col">Checkout</th><th scope="col">Vendas</th></tr></thead><tbody>${rows.map(r => html`<tr>
<td><span class="bar-bg" style="width:${(n ? r.n / Math.max(...rows.map(x => x.n)) * 100 : 0).toFixed(1)}%"></span><span style="position:relative">${VISIT_PT[r.k]}</span></td><td>${num(r.n)}</td><td>${rate(r.co, r.n)}</td><td>${num(r.sales)}</td></tr>`)}</tbody></table></div>`
    : html`<p class="empty">Sem visitantes com cookie no período. A contagem usa o _rid gravado pelo Worker da borda.</p>`;
  return tabs('Primeira visita ou retorno', [['Visitas', body]]);
}

export function realtimeBody(ctx, r) {
  const time = ts => new Date(ts).toLocaleTimeString('pt-BR', { timeZone: ctx.site.timezone });
  const mins = r.perMin.map((n, i) => ({ label: i === 29 ? 'agora' : `-${29 - i} min`, v: n }));
  return html`<div class="hero">${kpi('online', 'Online agora · 5 min', r.online, null, num, { feature: true })}${kpi('v30', 'Visitantes · 30 min', r.visitors30, null, num)}${kpi('pv30', 'Visualizações · 30 min', r.perMin.reduce((a, b) => a + b, 0), null, num)}</div>
<section class="card"><h2>Visualizações por minuto</h2>${chart(mins, null, { label: 'Visualizações', h: 170 })}</section>
<div class="grid"><section class="card"><h2>Atividade ao vivo</h2>${r.feed.length ? html`<ul class="feed">${r.feed.map(e => html`<li><time>${time(e.ts)}</time><div>${e.name === 'pageview' ? e.path : html`<span class="ev">${icon('activity', 14)}${e.name}</span> em ${e.path}`}<small>${countryName(e.country)} · ${SCREEN[e.screen] ?? e.screen} · ${e.browser} · ${e.referrer || 'Direto'}</small></div></li>`)}</ul>` : html`<p class="empty">Nenhuma atividade nos últimos 30 minutos.</p>`}</section>
${tabs('Páginas ativas', [['Páginas', list(ctx, r.pages, 'path', { head: 'Página', filter: false, ...L })]])}
${tabs('Origens', [['Referências', list(ctx, r.referrers, 'referrer', { head: 'Referência', filter: false, ...L })]])}
${tabs('Países', [['Países', list(ctx, r.countries, 'country', { head: 'País', filter: false, ...L })]])}</div>`;
}
export function realtimePage(ctx, r) {
  return layout(ctx, `Tempo real · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Tempo real`, raw('Acontecendo <em>agora</em>'), `O que está acontecendo em ${ctx.site.name} neste momento.`, html`<span class="live"><i></i>atualiza a cada 5s</span>`)}
<div id="rt" aria-live="polite">${realtimeBody(ctx, r)}</div>
<script nonce="${ctx.nonce}">setInterval(function(){if(document.hidden)return;fetch(location.pathname+'?partial=1').then(function(r){return r.ok?r.text():''}).then(function(h){if(h)rastroSwap(document.getElementById('rt'),h)})},5000)</script>`);
}

const short = (v, n = 10) => v && v.length > n ? v.slice(0, n) + '…' : v;
const campaignName = v => (v || '').split('::')[0].replace(/\|[\w-]+$/, '').trim(); // checkouts juntam '::<fbclid>' ao utm_content
const DL = { sent: ['ok', 'enviado'], failed: ['bad', 'falhou'], pending: ['warn', 'na fila'], sending: ['warn', 'enviando'] };
/** Selo por destino; clicar abre o inspetor (resposta da plataforma, tentativas e Reenviar). */
function sends(ctx, e) {
  if (!e.deliveries?.length && e.purchase) return html`<small title="Somada a outra compra do mesmo comprador (order bump ou upsell), enviada no lugar dela, ou sem e-mail, telefone nem clique para a Meta. O motivo fica em Vendas, no registro do webhook.">sem envio próprio</small>`;
  if (!e.deliveries?.length) return html`<small title="Configure Meta, GA4 ou Google Ads em Integrações">não enviado</small>`;
  const base = `/sites/${encodeURIComponent(ctx.site.id)}/deliveries`;
  return e.deliveries.map(d => {
    const [cls, txt] = DL[d.status] || ['', d.status], dest = { ga4: 'GA4', gads: 'Google Ads' }[d.dest] || 'Meta';
    return html`<details class="dl"><summary><span class="tag ${cls}">${dest} ${d.status === 'sent' ? '✓' : d.status === 'failed' ? '✕' : `· ${txt}`}</span>${d.status === 'sent' || d.status === 'failed' ? html`<span class="sr">${txt}</span>` : ''}</summary>
<div><b>${dest}: ${txt}</b> · ${d.attempts} ${d.attempts === 1 ? 'tentativa' : 'tentativas'}${d.response ? html`<br>${d.response}` : ''}
${d.status === 'failed' && ctx.canEdit ? html`<form method="post" action="${base}/${d.id}/retry" style="margin-top:6px"><button>Reenviar</button></form>` : ''}</div></details>`;
  });
}
export function eventsBody(ctx, rows) {
  const time = ts => new Date(ts).toLocaleString('pt-BR', { timeZone: ctx.site.timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (!rows.length) return html`<p class="empty">Nenhum evento ainda. Cole o snippet no site (tela Integrações) e abra uma página.</p>`;
  const ids = e => [['fbc', 'Meta (clique)'], ['fbp', 'Meta (navegador)'], ['gclid', 'Google'], ['gbraid', 'Google'], ['wbraid', 'Google'], ['ttclid', 'TikTok']]
    .filter(([k]) => e[k]).map(([k, t]) => html`<span class="tag" title="${t}: ${e[k]}">${k}</span>`);
  return html`<div class="tw"><table class="list events left mcards"><thead><tr><th scope="col">Quando</th><th scope="col">Evento</th><th scope="col">Envio</th><th scope="col">Página</th>
<th scope="col">Origem</th><th scope="col">Visitante</th><th scope="col">IDs para anúncios</th></tr></thead><tbody>${rows.map(e => html`<tr>
<td><time>${time(e.ts)}</time></td><td>${e.name === 'pageview' ? 'PageView' : e.name}${e.revenue ? html` <small>${num(e.revenue)}</small>` : ''}<br><small title="ID do evento (deduplicação com o Pixel)">${short(e.event_id, 12) || '-'}</small></td><td>${sends(ctx, e)}</td>
<td>${e.purchase ? html`${e.product || 'Compra'}${e.status !== 'paid' ? html`<br><small>${STATUSES[e.status] ?? e.status}</small>` : ''}` : e.path}</td><td>${e.purchase ? PLATFORMS[e.platform] || e.platform : e.channel}${e.utm_campaign ? html`<br><small>${campaignName(e.utm_campaign)}${e.utm_content ? ` · ${campaignName(e.utm_content)}` : ''}</small>` : ''}</td>
<td>${e.rid ? html`<span title="Cookie primário _rid: ${e.rid}">${short(e.rid)}</span>` : e.purchase ? html`<small title="A venda não veio com o rid do link de checkout">sem clique</small>` : html`<small title="Sem cookie: hash diário de IP e navegador">sem cookie</small>`}</td>
<td>${ids(e).length ? ids(e) : html`<small>nenhum</small>`}</td></tr>`)}</tbody></table></div>`;
}
export function eventsPage(ctx, rows) {
  return layout(ctx, `Eventos · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Eventos`, raw('Cada evento, <em>com os IDs</em> que vão para os anúncios'), 'Os últimos 100 eventos, do mais novo para o mais antigo, com as compras aprovadas que chegaram pelos webhooks. Clique no selo de envio para ver a resposta da Meta ou do GA4.', html`<span class="live"><i></i>atualiza a cada 5s</span>`)}
<section class="card" id="ev">${eventsBody(ctx, rows)}</section>
<script nonce="${ctx.nonce}">setInterval(function(){var ev=document.getElementById('ev');if(document.hidden||ev.querySelector('details[open]')||ev.contains(document.activeElement))return;fetch(location.pathname+'?partial=1').then(function(r){return r.ok?r.text():''}).then(function(h){if(h)rastroSwap(document.getElementById('ev'),h)})},5000)</script>`);
}

const RATE_T = { click: 'clicaram (CTR)', visit: 'dos cliques chegaram ao site', engage: 'interagiram', checkout: 'foram ao checkout',
  reg: 'dos que chegaram criaram conta', build: 'das contas geraram o 1º app', pub: 'dos 1º apps foram publicados', buy: 'compraram' };
/** Funil completo, em pé: largura decrescente fixa (forma, não escala) e os números de cada etapa ao lado. */
function siteFunnel(ctx, p, fn) {
  const st = fn.stages, m = v => money(v, ctx.site.currency), n = st.length, last = st.at(-1), visit = st.find(s => s.k === 'visit');
  if (!st.some(s => s.v)) return html`<section class="card"><h2>Funil completo</h2><p class="empty">Nada neste período. Com o snippet no site e a Meta conectada em Integrações, o funil aparece aqui.</p></section>`;
  const w = i => 100 - i * (48 / Math.max(1, n - 1)), inset = i => ((100 - w(Math.min(i, n - 1))) / 2).toFixed(2) + '%';
  const when = fn.since ? `desde ${brDate(fn.since)}, quando o script começou a registrar` : p.prev ? `comparado com ${brDate(p.prev.from)} a ${brDate(p.prev.to)}` : '';
  return html`<section class="card" id="funil"><div class="row between"><h2>Funil completo</h2><span class="muted">Todas as origens${when ? ` · ${when}` : ''}</span></div>
<p class="flow-sum">${fn.spend ? html`<span><b>${m(fn.spend)}</b> investidos</span>` : ''}<span><b>${m(last.revenue)}</b> faturados</span>${fn.spend ? html`<span><b>${ratio(last.revenue / fn.spend)}x</b> ROAS</span>` : ''}${visit.v ? html`<span><b>${pct(last.v / visit.v)}</b> dos visitantes compraram</span>` : ''}${fn.metaBuys ? html`<span>a Meta contou <b>${num(fn.metaBuys)}</b> compras</span>` : ''}</p>
<ol class="vf">${st.map((s, i) => html`<li class="vf-row${i === n - 1 ? ' last' : ''}" style="--t0:${inset(i)};--t1:${inset(i + 1)};--c:${(100 - i * (28 / Math.max(1, n - 1))).toFixed(0)}%">
<div class="vf-seg" title="${s.d}"><span class="vf-t">${s.t}</span><b class="vf-v">${num(s.v)}</b>${delta(s.v, s.before, num)}</div>
<div class="vf-side">${s.rate != null ? html`<span><b class="vf-r">${pct(s.rate)}</b> ${RATE_T[s.k]}</span>` : ''}
${s.k === 'visit' && s.ads != null && s.v ? html`<span>${num(s.ads)} dos anúncios, ${num(s.v - s.ads)} de outras origens</span>` : ''}
${s.k === 'buy' ? html`<span>${num(s.orders)} ${s.orders === 1 ? 'pedido' : 'pedidos'} · ${m(s.revenue)}</span>` : ''}
${s.cost ? html`<span>${s.costT}: ${m(s.cost)}</span>` : ''}<small>${s.d} · ${s.src}</small></div></li>`)}</ol>
</section>`;
}

export function funnelsPage(ctx, p, f, funnels, err, full = null) {
  const base = `/sites/${encodeURIComponent(ctx.site.id)}/funnels`;
  return layout(ctx, `Funis · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Funis`, raw('Onde as visitas <em>desistem</em>'), 'Do anúncio visto até a compra, e os funis que você montar por página ou evento.')}
${tl(ctx, p, f, false)}${notice(err, true)}
${full ? siteFunnel(ctx, p, full) : ''}<h2 class="sec">Seus funis</h2>
${funnels.length ? '' : notice(`Nenhum funil ainda.${ctx.canEdit ? ' Crie o primeiro abaixo.' : ''}`)}
${funnels.map(fn => {
    const first = fn.counts[0] || 0;
    return html`<section class="card" style="margin-bottom:16px"><div class="row between"><h2>${fn.name}</h2>
<span class="muted">Conversão <b class="pos">${first ? pct(fn.counts.at(-1) / first) : '-'}</b> · ${num(fn.counts.at(-1))} de ${num(first)}</span></div>
<div class="funnel">${fn.steps.map((s, i) => {
      const c = fn.counts[i], prevC = i ? fn.counts[i - 1] : c;
      return html`<div class="step"><span class="n">${i + 1}</span><span>${s.event ? html`Evento <b>${s.event}</b>` : html`Página <b>${s.path}</b>`}</span>
<span class="meta"><b>${num(c)}</b> visitas · ${first ? pct(c / first) : '-'}${i && prevC ? html` · <span class="neg">−${pct(1 - c / prevC)} desistiram</span>` : ''}</span>
<div class="track" role="img" aria-label="${first ? pct(c / first) : '0%'} do início"><div class="fill" style="width:${first ? (c / first * 100).toFixed(1) : 0}%"></div></div></div>`;
    })}</div>
${ctx.canEdit ? html`<form method="post" action="${base}/${fn.id}/delete" style="margin-top:6px"><button class="link danger">Excluir funil</button></form>` : ''}</section>`;
  })}
${ctx.canEdit ? html`<section class="card"><h2>Novo funil</h2><form method="post" action="${base}" class="stack" style="margin-top:14px">
<label class="f">Nome<input name="name" required maxlength="80" placeholder="Cadastro"></label>
<label class="f">Etapas<span>Uma por linha. <code>*</code> é curinga; <code>evento:nome</code> para eventos.</span><textarea name="steps" required placeholder="/\n/precos\n/cadastro*\nevento:cadastro"></textarea></label>
<div><button class="primary">Criar funil</button></div></form></section>` : ''}`);
}

function sankey(j) {
  const cols = j.cols;
  if (!cols.length) return html`<p class="empty">Sem dados no período</p>`;
  const colW = 160, gapX = 64, gap = 6, minH = 26, maxH = 440;
  const total = Math.max(...cols.map(c => c.reduce((s, x) => s + x.n, 0)));
  const scale = Math.max(0, maxH - gap * 6) / total;
  let H = 0;
  const pos = cols.map((c, i) => {
    let y = 0;
    const m = new Map(c.map(nd => { const h = Math.max(minH, nd.n * scale), p = { x: i * (colW + gapX), y, h, n: nd.n, k: nd.k, out: 0, in: 0 }; y += h + gap; return [nd.k, p]; }));
    H = Math.max(H, y - gap);
    return m;
  });
  const W = cols.length * colW + (cols.length - 1) * gapX;
  const ls = j.links.map(l => ({ ...l, a: pos[l.i].get(l.from), b: pos[l.i + 1]?.get(l.to) })).filter(l => l.a && l.b);
  ls.sort((x, y) => x.a.y - y.a.y || x.b.y - y.b.y).forEach(l => { l.ha = l.n / l.a.n * l.a.h; l.y0 = l.a.y + l.a.out; l.a.out += l.ha; });
  ls.sort((x, y) => x.b.y - y.b.y || x.a.y - y.a.y).forEach(l => { l.hb = l.n / l.b.n * l.b.h; l.y1 = l.b.y + l.b.in; l.b.in += l.hb; });
  const cut = s => s.length > 20 ? s.slice(0, 19) + '…' : s, f = n => n.toFixed(1);
  return html`<div class="scroll"><svg class="sankey" viewBox="-1 -1 ${W + 2} ${H + 28}" style="max-width:${W + 2}px;min-width:${Math.min(780, W + 2)}px" role="img" aria-label="Fluxo de páginas por etapa da visita">
${cols.map((_, i) => html`<text class="c" x="${i * (colW + gapX)}" y="${H + 20}">ETAPA ${i + 1}</text>`)}
${ls.map(l => { const x0 = l.a.x + colW, x1 = l.b.x, mx = (x0 + x1) / 2;
    return html`<path class="lnk" data-tip="${l.from} → ${l.to}|${num(l.n)} visitas" d="M${x0},${f(l.y0)}C${mx},${f(l.y0)} ${mx},${f(l.y1)} ${x1},${f(l.y1)}V${f(l.y1 + l.hb)}C${mx},${f(l.y1 + l.hb)} ${mx},${f(l.y0 + l.ha)} ${x0},${f(l.y0 + l.ha)}Z"/>`; })}
${pos.map(m => [...m.values()].map(p => html`<g data-tip="${p.k}|${num(p.n)} visitas"><rect class="node${p.k === OTHER ? ' other' : ''}" x="${p.x}" y="${f(p.y)}" width="${colW}" height="${f(p.h)}"/>
<text x="${p.x + 8}" y="${f(p.y + 17)}">${cut(p.k)}</text><text class="c" x="${p.x + colW - 8}" y="${f(p.y + 17)}" text-anchor="end">${num(p.n)}</text></g>`))}</svg></div>`;
}

export function journeysPage(ctx, p, f, j) {
  return layout(ctx, `Caminhos · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Caminhos`, raw('O caminho <em>real</em> das visitas'), `As 5 primeiras páginas de cada visita (${num(j.visits)} visitas). Filtre por página de entrada na visão geral para focar num ponto de partida.`)}
${tl(ctx, p, f, false)}<section class="card">${sankey(j)}</section>
<div class="grid">${tabs('Caminhos mais comuns', [['Caminhos', list(ctx, j.paths, null, { head: 'Caminho', cols: [['Visitas', 'n']], filter: false })]])}</div>`);
}

const gap = ms => { const h = ms / 36e5; if (h < 1) return 'na mesma hora'; if (h < 24) return `${Math.round(h)} h depois`; const d = Math.round(h / 24); return d === 1 ? '1 dia depois' : `${d} dias depois`; };
const ORD = ['1º', '2º', '3º', '4º', '5º', '6º'];
/** Rótulo curto do anúncio ("EI-027"); dois anúncios com o mesmo começo de nome ganham o fim do id. */
function adLabels(sq) {
  const keys = new Set([...sq.ads.map(x => x.k), ...sq.singles.map(x => x.k), ...sq.paths.flatMap(p => p.keys), ...sq.recent.flatMap(b => b.seq.map(s => s.k))]);
  const short = k => String(sq.info[k]?.name || k).split('|')[0].trim() || k, groups = new Map();
  for (const k of keys) (groups.get(short(k)) || groups.set(short(k), []).get(short(k))).push(String(k));
  // Ids da mesma conta da Meta terminam igual ("...0053"): mostra os 4 dígitos antes do fim em comum.
  const tag = new Map();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    let c = 0;
    while (c < ids[0].length - 4 && ids.every(id => id.at(-1 - c) === ids[0].at(-1 - c))) c++;
    for (const id of ids) tag.set(id, id.slice(Math.max(0, id.length - c - 4), id.length - c));
  }
  return k => tag.has(String(k)) ? `${short(k)} ·${tag.get(String(k))}` : short(k);
}
/** Selo do anúncio: miniatura e o rótulo curto, nome inteiro no title. */
function adChip(sq, k, cls = '', label = null) {
  const it = sq.info[k] || { name: k };
  return html`<span class="seqc ${cls}" title="${it.name}">${it.thumb ? html`<img src="${it.thumb}" alt="" width="22" height="22" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="ad-thumb none" aria-hidden="true">${icon('image')}</span>`}<b>${label ? label(k) : String(it.name).split('|')[0].trim()}</b></span>`;
}
/** Caminho em etapas: 1º clique, 2º clique, ..., comprou, com o tempo entre os cliques em cima da seta. */
function journey(sq, label, steps) {
  const n = steps.length;
  return html`<div class="jr">${steps.map((st, i) => html`${i ? html`<span class="jarrow"><small>${st.gap || ''}</small>${icon('arrow', 16)}</span>` : ''}<span class="jstep${i === n - 1 ? ' buy' : ''}"><span class="jl">${i === n - 1 ? html`${icon('cart', 13)} Comprou pelo` : i === 0 ? html`${icon('click', 13)} 1º clique` : `${ORD[i] || `${i + 1}º`} clique`}</span>${adChip(sq, st.k, i === n - 1 ? 'close' : '', label)}</span>`)}</div>`;
}
function adSequence(ctx, sq) {
  const m = v => money(v, ctx.site.currency), day = ts => new Date(ts).toLocaleDateString('pt-BR', { timeZone: ctx.site.timezone, day: '2-digit', month: '2-digit' });
  const head = html`<div class="row between"><h2>Sequência de anúncios até a compra</h2><span class="muted">${num(sq.withSeq)} de ${num(sq.purchases)} compras com anúncio no caminho</span></div>
<p class="muted" style="margin:6px 0 0">Os anúncios em que a mesma pessoa clicou (pelo cookie do visitante) nos 30 dias antes de comprar, na ordem do clique. Impressão sem clique a Meta só informa no total, por anúncio.${sq.since ? ` O script registra desde ${brDate(sq.since)}: compras antes disso não têm sequência.` : ''}</p>`;
  if (!sq.withSeq) return html`<section class="card" id="sequencia">${head}<p class="empty">Nenhuma compra no período com clique em anúncio registrado antes. A sequência aparece quando as vendas chegam com o rid do link de checkout.</p></section>`;
  const label = adLabels(sq), singleN = sq.singles.reduce((t, x) => t + x.n, 0);
  return html`<section class="card" id="sequencia">${head}
<div class="kpis" style="margin-top:14px">${kpi('sq-n', 'Compras com anúncio no caminho', sq.withSeq, null, num)}${kpi('sq-multi', 'Passaram por 2 anúncios ou mais', sq.multi, null, num)}${kpi('sq-ads', 'Anúncios até comprar (média)', sq.avgAds, null, v => ratio(v))}${kpi('sq-days', 'Dias do 1º clique à compra (média)', sq.avgDays, null, v => ratio(v))}</div>

<h3 class="seq-h">${icon('click', 16)} Passaram por mais de um anúncio <small class="muted">${num(sq.multi)} ${sq.multi === 1 ? 'compra' : 'compras'}</small></h3>
${sq.multi ? html`<div class="grid seq-grid"><div><h4>Sequências mais comuns</h4><ol class="seq-list">${sq.paths.map(pa => html`<li>${journey(sq, label, pa.keys.map(k => ({ k })))}<span class="muted">${num(pa.n)} ${pa.n === 1 ? 'compra' : 'compras'} · ${m(pa.revenue)}</span></li>`)}</ol></div>
<div><h4>Últimas compras com mais de um anúncio</h4><ol class="seq-list">${sq.recent.map(b => html`<li>${journey(sq, label, b.seq.map((st, i) => ({ k: st.k, gap: i ? gap(st.at - b.seq[i - 1].at) : '' })))}
<span class="muted">${day(b.ts)} · ${m(b.gross)}${b.orders > 1 ? ` · ${b.orders} pedidos` : ''}${b.via ? ` · pagou pelo link ${b.via}` : ''}</span></li>`)}</ol></div></div>`
  : html`<p class="empty">Ainda nenhuma compra em que a pessoa clicou em dois anúncios ou mais antes de comprar.${sq.since ? ' Com mais dias de script, as sequências aparecem aqui.' : ''}</p>`}

<h3 class="seq-h">${icon('cart', 16)} Compraram no primeiro anúncio <small class="muted">${num(singleN)} ${singleN === 1 ? 'compra' : 'compras'} · clicaram em um anúncio só e compraram</small></h3>
${sq.singles.length ? html`<div class="tw"><table class="data mcards"><thead><tr><th style="text-align:left">Anúncio</th><th>Compras</th><th>Faturamento</th><th title="Média do clique à compra">Do clique à compra</th></tr></thead>
<tbody>${sq.singles.map(x => html`<tr><td class="c-main" style="text-align:left;white-space:normal">${adChip(sq, x.k, 'close', label)} <small class="muted">${sq.info[x.k]?.name || x.k}</small></td><td><b>${num(x.n)}</b></td><td>${m(x.revenue)}</td><td>${gap(x.days / x.n * 864e5).replace(' depois', '')}</td></tr>`)}</tbody></table></div>`
  : html`<p class="empty">Nenhuma compra de quem clicou num anúncio só.</p>`}

<h3 class="seq-h">Por anúncio <small class="muted">o papel de cada um nas compras</small></h3>
<div class="tw"><table class="data mcards"><thead><tr><th style="text-align:left">Anúncio</th><th title="Impressões no período, pela Meta">Impressões</th><th title="Pessoas que entraram no site por este anúncio no período">Clicaram</th><th title="Compras em que este anúncio aparece na sequência">Em compras</th><th title="Foi o 1º clique da sequência">1º clique</th><th title="Apareceu entre o 1º clique e o da compra">No meio</th><th title="Último anúncio antes da compra">Comprou pelo</th><th>Faturamento (comprou pelo)</th><th title="Compras pelo anúncio ÷ pessoas que clicaram nele">Compras ÷ cliques</th></tr></thead>
<tbody>${sq.ads.map(x => html`<tr><td class="c-main" style="text-align:left;white-space:normal;min-width:200px">${adChip(sq, x.k, '', label)} <small class="muted">${sq.info[x.k]?.name || x.k}</small></td><td>${x.imp ? num(x.imp) : '-'}</td><td>${num(x.seen)}</td><td>${num(x.journeys)}</td><td>${num(x.first)}</td><td>${num(x.middle)}</td><td><b>${num(x.last)}</b></td><td>${m(x.revenue)}</td><td>${x.seen ? pct(x.last / x.seen) : '-'}</td></tr>`)}</tbody></table></div>
</section>`;
}

export function attributionPage(ctx, p, f, names, event, dim, a, seq = null) {
  const m = v => money(v, ctx.site.currency);
  const cols = [['Conversões', 'n'], ['Receita', 'rev', m]];
  return layout(ctx, `Atribuição · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Atribuição`, raw('Quem leva o <em>crédito</em>'), raw('<b>Primeiro clique</b> credita a primeira visita do visitante no dia; <b>último clique</b>, a última visita não-direta antes da conversão. Para vendas de plataformas, veja Vendas → Campanhas.'))}
${tl(ctx, p, f, false)}
${seq ? adSequence(ctx, seq) : ''}<h2 class="sec">Eventos do site</h2>
${names.length ? html`<form method="get" class="row" style="margin-bottom:14px">${hiddenInputs(ctx.q, ['event', 'dim'])}
<label class="f">Conversão <select name="event">${names.map(n => html`<option${n === event ? raw(' selected') : ''}>${n}</option>`)}</select></label>
<label class="f">Agrupar por <select name="dim">${Object.entries(ATTR_DIMS).map(([k, t]) => html`<option value="${k}"${k === dim ? raw(' selected') : ''}>${t}</option>`)}</select></label><button style="align-self:end">Aplicar</button></form>` : ''}
${!a ? notice(raw('Nenhum evento personalizado no período. Marque um botão com <code>data-rastro="compra"</code> ou chame <code>rastro(\'compra\')</code> (veja Integrações).')) : html`
<div class="hero">${kpi('conv', 'Conversões', a.conversions, null, num, { feature: true })}${kpi('conv-v', 'Visitantes convertidos', a.converters, null, num)}
${kpi('conv-r', 'Taxa de conversão', a.visitors ? a.converters / a.visitors : null, null, pct)}${kpi('conv-rev', 'Receita', a.revenue, null, m)}</div>
<div class="grid">${tabs('Primeiro clique', [[ATTR_DIMS[dim], list(ctx, a.first, dim, { head: ATTR_DIMS[dim], cols, filter: false, ...L })]])}
${tabs('Último clique', [[ATTR_DIMS[dim], list(ctx, a.last, dim, { head: ATTR_DIMS[dim], cols, filter: false, ...L })]])}</div>`}`);
}

// ---------- comportamento (ADR 0025) ----------
const share = (a, b) => b ? a / b : null;
const DEPTHS = [['d25', '25%'], ['d50', '50%'], ['d75', '75%'], ['d100', '100%']];
/** Grade 20 x 50 do mapa de cliques; as linhas tracejadas mostram quantas leituras chegaram a cada quarto da página. */
function heatmap(cells, device, reads) {
  const max = Math.max(1, ...cells.map(c => c.n)), total = cells.reduce((s, c) => s + c.n, 0);
  return html`<figure class="heat ${device === 'm' ? 'phone' : 'desk'}" role="img" aria-label="Mapa de calor com ${num(total)} cliques; a lista ao lado traz os elementos mais clicados">
${cells.map(c => html`<i style="left:${c.x * 5}%;top:${c.y * 2}%;opacity:${(0.15 + 0.85 * c.n / max).toFixed(2)}" title="${num(c.n)} cliques"></i>`)}
${reads?.views ? DEPTHS.slice(0, 3).map(([k, t], i) => html`<hr style="top:${(i + 1) * 25}%"><span class="q" style="top:${(i + 1) * 25}%">${pct(share(reads[k], reads.views))} chegam a ${t}</span>`) : ''}</figure>`;
}
export function behaviorPage(ctx, p, d) {
  const t = d.total || {}, reads = d.pages.find(x => x.k === d.path), r7 = d.retention.days.find(x => x.d === 7);
  const avg = x => x.views ? x.ms / x.views / 1000 : null, q = ctx.q;
  const pageRows = d.pages.length ? html`<div class="tw"><table class="list mcards"><thead><tr><th scope="col">Página</th><th scope="col">Leituras</th><th scope="col">Tempo ativo</th>${DEPTHS.map(([, h]) => html`<th scope="col">${h}</th>`)}</tr></thead><tbody>${d.pages.map(x => html`<tr${x.k === d.path ? raw(' class="on"') : ''}>
<td class="c-main"><span class="bar-bg" style="width:${(x.views / d.pages[0].views * 100).toFixed(1)}%"></span><a href="${link(q, { page: x.k, device: null })}" title="Ver o mapa de cliques de ${x.k}">${x.k}</a></td><td>${num(x.views)}</td><td>${dur(avg(x))}</td>${DEPTHS.map(([k]) => html`<td>${pct(share(x[k], x.views))}</td>`)}</tr>`)}</tbody></table></div>`
    : html`<p class="empty">Nenhuma leitura no período. O snippet manda rolagem, tempo e cliques quando o visitante sai da página ou troca de aba.</p>`;
  const devNav = html`<nav class="seg" aria-label="Aparelho">${Object.entries(DEVICES).map(([k, label]) => html`<a href="${link(q, { device: k, page: d.path })}"${on(d.device === k)}>${label} · ${num(d.devices.find(x => x.k === k)?.views || 0)}</a>`)}</nav>`;
  const targets = d.targets.length ? html`<div class="tw"><table class="list mcards"><thead><tr><th scope="col">Elemento</th><th scope="col">Destino</th><th scope="col">Cliques</th></tr></thead><tbody>${d.targets.map(x => html`<tr>
<td class="c-main"><span class="bar-bg" style="width:${(x.n / d.targets[0].n * 100).toFixed(1)}%"></span><span style="position:relative">${x.label || html`<code>${x.sel || '?'}</code>`}${x.label && x.sel ? html` <code class="muted">${x.sel}</code>` : ''}</span></td><td>${x.dest || '-'}</td><td>${num(x.n)}</td></tr>`)}</tbody></table></div>`
    : html`<p class="empty">Nenhum clique em link ou botão nesta página e aparelho.</p>`;
  const ret = d.retention;
  return layout(ctx, `Comportamento · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Comportamento`, raw('Até onde leem e <em>onde clicam</em>'), 'Rolagem, tempo com a aba aberta e cliques por página, somados sem guardar nada por visitante.')}
${toolbar(ctx, p, {}, { compare: false })}
<div class="kpis">${kpi('active', 'Tempo ativo por leitura', avg(t), null, dur)}${kpi('half', 'Chegam à metade', share(t.d50, t.views), null, pct)}${kpi('end', 'Chegam ao fim', share(t.d100, t.views), null, pct)}${kpi('back7', 'Voltam em até 7 dias', share(r7.back, r7.eligible), null, pct)}</div>
<section class="card"><h2>Rolagem e tempo por página</h2><p class="muted">Leituras são as visualizações que mandaram o resumo de saída. Tempo ativo conta só com a aba visível. Clique numa página para ver o mapa de cliques.</p>${pageRows}</section>
${d.path != null ? html`<section class="card" style="margin-top:16px"><div class="row between"><h2>Mapa de cliques · ${d.path}</h2>${devNav}</div>
<p class="muted">Posição de cada clique: largura da tela e altura da página, sem imagem do site. Links e botões entram na lista pelo texto e destino, sem virar evento de conversão.</p>
<div class="heatwrap">${heatmap(d.cells, d.device, reads)}<div>${targets}</div></div></section>` : ''}
<section class="card" style="margin-top:16px"><h2>Retorno</h2>
<p class="muted">Só conta visitantes com o cookie <code>_rid</code> (Worker da borda e, se o site pede, consentimento). Sem ele, o id do visitante muda todo dia e todo mundo pareceria novo. Base: ${num(ret.n)} primeiras visitas no período; cada prazo só conta quem já teve tempo de voltar.</p>
${ret.n ? html`<div class="tw"><table class="list"><thead><tr><th scope="col">Voltaram em até</th><th scope="col">Visitantes</th><th scope="col">Base</th><th scope="col">Taxa</th></tr></thead><tbody>${ret.days.map(x => html`<tr><td>${x.d === 1 ? '1 dia' : `${x.d} dias`}</td><td>${num(x.back)}</td><td>${num(x.eligible)}</td><td>${x.eligible ? pct(x.back / x.eligible) : 'ainda cedo'}</td></tr>`)}</tbody></table></div>`
    : html`<p class="empty">Nenhuma primeira visita com <code>_rid</code> no período.</p>`}</section>`);
}
