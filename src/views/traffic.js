// Páginas de tráfego: visão geral, tempo real, eventos, funis, caminhos, atribuição.
import { FILTERS, ATTR_DIMS, OTHER } from '../tracking/stats.js';
import { html, raw, icon, layout, pageHead, toolbar, kpi, list, tabs, chart, notice, num, pct, dur, money, countryName, SCREEN, hiddenInputs } from './ui.js';

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
  const m = v => money(v, site.currency);
  const utm = [['Fonte', d.utm_source, 'utm_source'], ['Mídia', d.utm_medium, 'utm_medium'], ['Campanha', d.utm_campaign, 'utm_campaign'], ['Conteúdo', d.utm_content, 'utm_content']];
  const live = ctx.share ? html`<span class="live"><i></i>${num(d.online)} online agora</span>` : html`<a class="live" href="/sites/${encodeURIComponent(site.id)}/realtime"><i></i>${num(d.online)} online agora</a>`;
  return layout(ctx, `${ctx.share ? 'Tráfego' : 'Visão geral'} · ${site.name}`, html`
${pageHead(`${site.name} · ${ctx.share ? 'Tráfego' : 'Visão geral'}`, raw(`Quem chega, <em>de onde</em> e o que faz`), null, live)}
${tl(ctx, p, f)}
<div class="hero">${kpi('visitors', 'Visitantes', cur.visitors, prev.visitors, num, { feature: true })}${kpi('visits', 'Visitas', cur.visits, prev.visits, num)}
${kpi('pageviews', 'Visualizações', cur.pageviews, prev.pageviews, num)}${kpi('bounce', 'Rejeição', cur.bounce, prev.bounce, pct, { invert: true })}</div>
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
${tabs('Eventos', [['Eventos', list(ctx, d.events, 'name', { head: 'Evento', cols: [['Visitantes', 'v'], ['Total', 'n'], ...(d.events.some(e => e.rev) ? [['Receita', 'rev', v => v ? m(v) : '-']] : [])], ...L })],
    ...(d.props ? [['Propriedades', list(ctx, d.props, null, { head: `Propriedades de "${f.name}"`, filter: false })]] : [])])}
</div>`);
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
<script nonce="${ctx.nonce}">setInterval(function(){if(document.hidden)return;fetch(location.pathname+'?partial=1').then(function(r){return r.ok?r.text():''}).then(function(h){if(h)document.getElementById('rt').innerHTML=h})},5000)</script>`);
}

const short = (v, n = 10) => v && v.length > n ? v.slice(0, n) + '…' : v;
const campaignName = v => (v || '').replace(/\|[\w-]+$/, '').trim();
const DL = { sent: ['ok', 'enviado'], failed: ['bad', 'falhou'], pending: ['warn', 'na fila'], sending: ['warn', 'enviando'] };
/** Selo por destino; clicar abre o inspetor (resposta da plataforma, tentativas e Reenviar). */
function sends(ctx, e) {
  if (!e.deliveries?.length) return html`<small title="Configure Meta ou GA4 em Integrações">não enviado</small>`;
  const base = `/sites/${encodeURIComponent(ctx.site.id)}/deliveries`;
  return e.deliveries.map(d => {
    const [cls, txt] = DL[d.status] || ['', d.status], dest = d.dest === 'ga4' ? 'GA4' : 'Meta';
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
  return html`<div class="tw"><table class="list events left"><thead><tr><th scope="col">Quando</th><th scope="col">Evento</th><th scope="col">Envio</th><th scope="col">Página</th>
<th scope="col">Origem</th><th scope="col">Visitante</th><th scope="col">IDs para anúncios</th></tr></thead><tbody>${rows.map(e => html`<tr>
<td><time>${time(e.ts)}</time></td><td>${e.name === 'pageview' ? 'PageView' : e.name}${e.revenue ? html` <small>${num(e.revenue)}</small>` : ''}<br><small title="ID do evento (deduplicação com o Pixel)">${short(e.event_id, 12) || '-'}</small></td><td>${sends(ctx, e)}</td>
<td>${e.path}</td><td>${e.channel}${e.utm_campaign ? html`<br><small>${campaignName(e.utm_campaign)}${e.utm_content ? ` · ${campaignName(e.utm_content)}` : ''}</small>` : ''}</td>
<td>${e.rid ? html`<span title="Cookie primário _rid: ${e.rid}">${short(e.rid)}</span>` : html`<small title="Sem cookie: hash diário de IP e navegador">sem cookie</small>`}</td>
<td>${ids(e).length ? ids(e) : html`<small>nenhum</small>`}</td></tr>`)}</tbody></table></div>`;
}
export function eventsPage(ctx, rows) {
  return layout(ctx, `Eventos · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Eventos`, raw('Cada evento, <em>com os IDs</em> que vão para os anúncios'), 'Os últimos 100 eventos, do mais novo para o mais antigo. Clique no selo de envio para ver a resposta da Meta ou do GA4.', html`<span class="live"><i></i>atualiza a cada 5s</span>`)}
<section class="card" id="ev">${eventsBody(ctx, rows)}</section>
<script nonce="${ctx.nonce}">setInterval(function(){var ev=document.getElementById('ev');if(document.hidden||ev.querySelector('details[open]')||ev.contains(document.activeElement))return;fetch(location.pathname+'?partial=1').then(function(r){return r.ok?r.text():''}).then(function(h){if(h)document.getElementById('ev').innerHTML=h})},5000)</script>`);
}

export function funnelsPage(ctx, p, f, funnels, err) {
  const base = `/sites/${encodeURIComponent(ctx.site.id)}/funnels`;
  return layout(ctx, `Funis · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Funis`, raw('Onde as visitas <em>desistem</em>'), 'Quantas visitas passam por cada etapa, em ordem, dentro da mesma visita.')}
${tl(ctx, p, f, false)}${notice(err, true)}
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

export function attributionPage(ctx, p, f, names, event, dim, a) {
  const m = v => money(v, ctx.site.currency);
  const cols = [['Conversões', 'n'], ['Receita', 'rev', m]];
  return layout(ctx, `Atribuição · ${ctx.site.name}`, html`${pageHead(`${ctx.site.name} · Atribuição`, raw('Quem leva o <em>crédito</em>'), raw('<b>Primeiro clique</b> credita a primeira visita do visitante no dia; <b>último clique</b>, a última visita não-direta antes da conversão. Para vendas de plataformas, veja Vendas → Campanhas.'))}
${tl(ctx, p, f, false)}
${names.length ? html`<form method="get" class="row" style="margin-bottom:14px">${hiddenInputs(ctx.q, ['event', 'dim'])}
<label class="f">Conversão <select name="event">${names.map(n => html`<option${n === event ? raw(' selected') : ''}>${n}</option>`)}</select></label>
<label class="f">Agrupar por <select name="dim">${Object.entries(ATTR_DIMS).map(([k, t]) => html`<option value="${k}"${k === dim ? raw(' selected') : ''}>${t}</option>`)}</select></label><button style="align-self:end">Aplicar</button></form>` : ''}
${!a ? notice(raw('Nenhum evento personalizado no período. Marque um botão com <code>data-rastro="compra"</code> ou chame <code>rastro(\'compra\')</code> (veja Integrações).')) : html`
<div class="hero">${kpi('conv', 'Conversões', a.conversions, null, num, { feature: true })}${kpi('conv-v', 'Visitantes convertidos', a.converters, null, num)}
${kpi('conv-r', 'Taxa de conversão', a.visitors ? a.converters / a.visitors : null, null, pct)}${kpi('conv-rev', 'Receita', a.revenue, null, m)}</div>
<div class="grid">${tabs('Primeiro clique', [[ATTR_DIMS[dim], list(ctx, a.first, dim, { head: ATTR_DIMS[dim], cols, filter: false, ...L })]])}
${tabs('Último clique', [[ATTR_DIMS[dim], list(ctx, a.last, dim, { head: ATTR_DIMS[dim], cols, filter: false, ...L })]])}</div>`}`);
}
