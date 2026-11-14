// Base da interface: template com escape, formatação, design system "Digital Naturalism", layout e componentes.
import { RANGES } from '../time.js';

// ---------- template com escape automático ----------
class Raw { constructor(s) { this.s = s; } }
export const raw = s => new Raw(String(s));
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const out = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(out).join('') : v == null || v === false ? '' : esc(v);
export const html = (s, ...v) => raw(s.reduce((acc, str, i) => acc + str + (i < v.length ? out(v[i]) : ''), ''));

// ---------- formatação ----------
const nf = new Intl.NumberFormat('pt-BR');
export const num = n => nf.format(n ?? 0);
export const pct = x => x == null ? '–' : `${(Math.round(x * 1000) / 10).toLocaleString('pt-BR')}%`;
export const ratio = x => x == null ? '–' : x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pad2 = n => String(n).padStart(2, '0');
export const dur = s => s == null ? '–' : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${pad2(Math.round(s % 60))}s`;
export const money = (v, cur = 'BRL') => {
  if (v == null) return '–';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(v); } catch { return `${cur} ${num(v)}`; }
};
const regions = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const flag = c => String.fromCodePoint(...[...c].map(x => 127397 + x.charCodeAt(0)));
export const countryName = c => { if (c === '??') return 'Desconhecido'; try { return `${flag(c)} ${regions.of(c)}`; } catch { return c; } };
export const brDate = d => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const SCREEN = { mobile: 'Celular', tablet: 'Tablet', laptop: 'Notebook', desktop: 'Desktop', '??': 'Desconhecido' };
export const ROLES = { admin: 'Admin', editor: 'Editor', viewer: 'Leitor' };

export function link(q, changes) {
  const s = new URLSearchParams(q);
  for (const [k, v] of Object.entries(changes)) v == null ? s.delete(k) : s.set(k, v);
  const str = s.toString();
  return str ? '?' + str : '?';
}
export const on = cond => cond ? raw(' class="on" aria-current="page"') : '';
export const hiddenInputs = (q, skip = []) => [...q].filter(([k]) => !skip.includes(k)).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`);

// ---------- design system: Digital Naturalism ----------
// Carvão profundo + verde ácido; serifa editorial (Instrument Serif) + sans de interface (Inter) + mono técnica (JetBrains Mono).
// Paleta de séries validada (dataviz/validate_palette, modo escuro, superfície #151613): s1→s4 nessa ordem.
const NOISE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
export const CSS = `@font-face{font-family:"Instrument Serif";src:url(/fonts/instrument-serif.woff2) format("woff2");font-display:swap}
@font-face{font-family:"Instrument Serif";font-style:italic;src:url(/fonts/instrument-serif-italic.woff2) format("woff2");font-display:swap}
@font-face{font-family:Inter;src:url(/fonts/inter.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(/fonts/jetbrains-mono.woff2) format("woff2");font-weight:100 800;font-display:swap}
:root{color-scheme:dark;--bg:#0d0e0c;--surface:#151613;--surface2:#1c1e1a;--surface3:#24261f;--line:rgba(236,239,230,.09);--line2:rgba(236,239,230,.17);
--ink:#eceee6;--ink2:#a6ab9d;--muted:#767c6e;--acid:#c8ff3d;--acid-ink:#0d0e0c;--wash:rgba(200,255,61,.08);--grid:#252720;--base:#3a3d33;
--s1:#74a817;--s2:#8370ec;--s3:#df5f2b;--s4:#1d9f97;--up:#c8ff3d;--down:#ff6b57;--warn:#f2c14e;
--serif:"Instrument Serif",Georgia,"Times New Roman",serif;--sans:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:var(--ink);font:14px/1.5 var(--sans);background:var(--bg) radial-gradient(1100px 560px at 105% -8%,rgba(200,255,61,.07),transparent 60%) fixed}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:90;opacity:.07;background-image:url("${NOISE}")}
a{color:inherit}::selection{background:var(--acid);color:var(--acid-ink)}
:focus-visible{outline:2px solid var(--acid);outline-offset:2px}
main{max-width:1240px;margin:0 auto;padding:28px 20px 80px}
/* topo */
.top{position:sticky;top:0;z-index:20;background:rgba(13,14,12,.86);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.bar{max-width:1240px;margin:0 auto;padding:10px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px}
.brand{font:italic 400 26px/1 var(--serif);text-decoration:none;letter-spacing:-.01em;display:inline-flex;align-items:baseline;gap:2px}.brand i{width:7px;height:7px;background:var(--acid);display:inline-block;transform:skewX(-14deg)}
.spacer{flex:1}.mini{display:flex;flex-wrap:wrap;gap:2px;align-items:center}.mini a,.mini button{font:500 11px/1 var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--ink2);text-decoration:none;padding:8px 10px;background:none;border:0;cursor:pointer}.mini a:hover,.mini button:hover,.mini a.on{color:var(--acid)}
.menu{position:relative}.menu summary{cursor:pointer;list-style:none;padding:7px 12px;border:1px solid var(--line2);font:500 13px var(--sans)}.menu summary::after{content:" ↓";color:var(--acid)}
.menu>div{position:absolute;top:calc(100% + 6px);left:0;min-width:240px;max-height:60vh;overflow:auto;background:var(--surface2);border:1px solid var(--line2);padding:4px;z-index:30;box-shadow:0 20px 40px rgba(0,0,0,.5)}.menu>div a{display:block;padding:8px 10px;text-decoration:none}.menu>div a:hover{background:var(--wash);color:var(--acid)}
.sections{display:flex;flex-wrap:wrap;gap:8px;padding:2px 0 0 6px}
.sections a{display:inline-block;padding:7px 18px;transform:skewX(-14deg);border:1px solid var(--line2);background:var(--surface);color:var(--ink2);text-decoration:none;font:600 11.5px/1.2 var(--mono);text-transform:uppercase;letter-spacing:.1em;transition:border-color .15s,color .15s}
.sections a>span{display:inline-block;transform:skewX(14deg)}.sections a:hover{border-color:var(--acid);color:var(--ink)}.sections a.on{background:var(--acid);border-color:var(--acid);color:var(--acid-ink)}
.subnav{border-top:1px solid var(--line)}.subnav .bar{padding-top:0;padding-bottom:0;gap:4px 22px}
.subnav a{padding:10px 0 9px;color:var(--ink2);text-decoration:none;border-bottom:2px solid transparent;font-size:13px}.subnav a:hover{color:var(--ink)}.subnav a.on{color:var(--ink);border-color:var(--acid)}
/* cabeçalho de página */
.head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin:6px 0 22px}
.eyebrow{font:500 11px/1 var(--mono);text-transform:uppercase;letter-spacing:.14em;color:var(--ink2);display:flex;align-items:center;gap:10px;margin-bottom:12px}.eyebrow::before{content:"";width:22px;height:2px;background:var(--acid)}
h1{font:400 clamp(34px,5vw,54px)/1 var(--serif);letter-spacing:-.015em;margin:0}h1 em{color:var(--acid)}
.sub{color:var(--ink2);margin:10px 0 0;max-width:72ch}
h2{font:400 22px/1.1 var(--serif);margin:0;letter-spacing:-.005em}h3{font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--ink2);margin:20px 0 8px}
.zig{height:8px;width:100%;margin:16px 0;background:linear-gradient(135deg,var(--acid) 25%,transparent 25%) -4px 0/8px 8px,linear-gradient(225deg,var(--acid) 25%,transparent 25%) -4px 0/8px 8px;opacity:.85}
/* filtros */
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
.seg{display:flex;flex-wrap:wrap;border:1px solid var(--line2);background:var(--surface)}.seg a{padding:6px 11px;text-decoration:none;color:var(--ink2);font:500 12px var(--mono);border-right:1px solid var(--line)}.seg a:last-child{border-right:0}.seg a:hover{color:var(--ink)}.seg a.on{background:var(--acid);color:var(--acid-ink)}
.pop summary{cursor:pointer;padding:6px 11px;border:1px solid var(--line2);background:var(--surface);color:var(--ink2);list-style:none;font:500 12px var(--mono)}.pop[open] summary{color:var(--acid)}.pop form{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}
.period{color:var(--muted);font:12px var(--mono)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.chip{display:inline-flex;gap:6px;align-items:center;padding:4px 12px;transform:skewX(-10deg);border:1px solid var(--acid);color:var(--ink);text-decoration:none;font-size:12.5px;background:var(--wash)}.chip>span{transform:skewX(10deg)}.chip b{color:var(--acid);font-weight:600}
/* KPIs */
.hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));background:var(--surface);border:1px solid var(--line);margin-bottom:14px;--z:9px;padding-bottom:var(--z);mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/calc(2*var(--z)) 100%}
.hero .kpi{padding:20px 22px 18px;border-right:1px solid var(--line)}.hero .kpi b{display:block;font:400 clamp(34px,3.6vw,46px)/1.05 var(--serif);letter-spacing:-.01em;margin:8px 0 6px}
.hero .kpi.feature{background:var(--acid);color:var(--acid-ink)}.hero .feature .lbl,.hero .feature .delta{color:var(--acid-ink)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(165px,100%),1fr));gap:10px;margin-bottom:14px}
.kpis .kpi{background:var(--surface);border:1px solid var(--line);padding:13px 15px;position:relative}.kpis .kpi b{display:block;font:600 21px/1.25 var(--sans);font-variant-numeric:tabular-nums;margin-top:4px}
.lbl{display:block;font:500 10.5px/1.2 var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--ink2)}
.delta{font:500 11.5px var(--mono);color:var(--ink2)}.delta.good{color:var(--up)}.delta.bad{color:var(--down)}
/* cartões */
.card{background:var(--surface);border:1px solid var(--line);padding:18px 20px;min-width:0;position:relative}
.card::before{content:"";position:absolute;top:-1px;left:-1px;width:12px;height:12px;border-top:2px solid var(--acid);border-left:2px solid var(--acid)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:14px;margin-top:14px}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.between{justify-content:space-between}.stack{display:grid;gap:12px}
/* gráficos */
.legend{display:flex;gap:18px;flex-wrap:wrap;color:var(--ink2);font:11px var(--mono);text-transform:uppercase;letter-spacing:.06em;margin:10px 0 6px}.legend span{display:inline-flex;gap:7px;align-items:center}
.sw{width:10px;height:10px;display:inline-block}.sw.line{height:0;width:18px;border-top:2px solid}.sw.dash{height:0;width:18px;border-top:2px dashed var(--muted)}
svg{display:block;width:100%;height:auto}svg text{fill:var(--muted);font:10.5px var(--mono)}
.gl{stroke:var(--grid)}.bl{stroke:var(--base)}.hit{fill:transparent}.col:hover .hit{fill:var(--wash)}.prevl{fill:none;stroke:var(--muted);stroke-width:2;stroke-dasharray:4 3}.serl{fill:none;stroke-width:2;stroke-linejoin:round}
.tip{position:fixed;z-index:95;pointer-events:none;background:var(--surface3);border:1px solid var(--line2);padding:9px 11px;font:12px var(--mono);color:var(--ink2);max-width:340px;box-shadow:0 14px 30px rgba(0,0,0,.45)}.tip .t{color:var(--acid);margin-bottom:3px}
.donut{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px;align-items:center}@media (max-width:480px){.donut{grid-template-columns:1fr}}
.donut svg text.big{fill:var(--ink);font:400 26px var(--serif)}.donut svg text.small{fill:var(--ink2);font:10px var(--mono);text-transform:uppercase;letter-spacing:.08em}
.donut ul{list-style:none;margin:0;padding:0}.donut li{display:grid;grid-template-columns:12px 1fr auto;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line)}.donut li:first-child{border-top:0}.donut li small{display:block;white-space:nowrap;color:var(--ink2);font:11px var(--mono)}
/* abas dentro de cartões */
.tabs{display:flex;flex-wrap:wrap;align-items:center;gap:2px}.tabs h2{margin-right:auto}.tabs>input{position:absolute;opacity:0;pointer-events:none}
.tabs>label{cursor:pointer;padding:4px 9px;color:var(--ink2);font:500 11px var(--mono);text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid transparent}.tabs>input:checked+label{color:var(--ink);border-color:var(--acid)}.tabs>input:focus-visible+label{outline:2px solid var(--acid)}
.pane{display:none;flex-basis:100%;margin-top:10px}${[1, 2, 3, 4, 5].map(i => `.tabs>input:nth-of-type(${i}):checked~.pane:nth-of-type(${i})`).join(',')}{display:block}
/* tabelas */
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--ink2);font:500 10.5px var(--mono);text-transform:uppercase;letter-spacing:.08em;padding:6px 0;border-bottom:1px solid var(--line2)}th+th,td+td{text-align:right;padding-left:14px;white-space:nowrap}
td{padding:8px 0;border-top:1px solid var(--line)}tbody tr:hover td{background:rgba(236,239,230,.02)}
.list td:first-child{position:relative;word-break:break-word;padding-left:8px}.list td:first-child a{text-decoration:none;position:relative}.list td:first-child a:hover{color:var(--acid)}.list td+td{width:1%}
.bar-bg{position:absolute;inset:4px auto 4px 0;background:var(--wash);border-left:2px solid var(--acid)}
.data td,.data th{padding-left:10px;padding-right:4px}.data td:first-child,.data th:first-child{padding-left:0}
.neg{color:var(--down)}.pos{color:var(--up)}.muted{color:var(--ink2)}.empty{color:var(--ink2);padding:14px 0;margin:0}
.badge{display:inline-block;padding:2px 8px;font:500 10.5px var(--mono);text-transform:uppercase;letter-spacing:.06em;border:1px solid currentColor}
.st-paid,.st-ACTIVE{color:var(--acid)}.st-pending{color:var(--warn)}.st-refunded{color:var(--s2)}.st-chargeback,.st-refused{color:var(--down)}.st-paused{color:var(--muted)}
/* funil, sankey, feed */
.funnel .step{display:grid;grid-template-columns:30px 1fr auto;gap:6px 14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}.funnel .step:first-child{border-top:0}
.funnel .n{width:26px;height:26px;display:grid;place-items:center;font:600 12px var(--mono);border:1px solid var(--acid);color:var(--acid);transform:skewX(-10deg)}.funnel .track{grid-column:2/4;height:12px;background:var(--surface3)}.funnel .fill{height:100%;background:var(--acid)}.funnel .meta{color:var(--ink2);font:12px var(--mono);text-align:right}
.scroll{overflow-x:auto}.sankey{min-width:780px}.node{fill:var(--surface3);stroke:var(--line2)}.node.other{opacity:.6}.lnk{fill:var(--acid);opacity:.13}.lnk:hover{opacity:.38}.sankey text{fill:var(--ink);font:12px var(--sans)}.sankey text.c{fill:var(--ink2);font:11px var(--mono)}
.feed{list-style:none;margin:0;padding:0;max-height:540px;overflow:auto}.feed li{display:grid;grid-template-columns:72px 1fr;gap:10px;padding:8px 0;border-top:1px solid var(--line)}.feed time{color:var(--ink2);font:12px var(--mono)}.feed .ev{color:var(--acid)}.feed small{color:var(--ink2);display:block;font-size:12px}
.live{display:inline-flex;align-items:center;gap:8px;font:500 11px var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--ink2);text-decoration:none}.live i{width:8px;height:8px;background:var(--acid);box-shadow:0 0 0 0 var(--acid);animation:p 2s infinite}@keyframes p{70%{box-shadow:0 0 0 7px transparent}}@media (prefers-reduced-motion:reduce){.live i{animation:none}}
/* formulários */
form.stack{max-width:480px}label.f{display:grid;gap:5px;font:500 10.5px var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--ink2)}label.f>span{text-transform:none;letter-spacing:0;font:13px var(--sans)}
input,select,textarea{font:14px var(--sans);color:var(--ink);background:var(--surface2);border:1px solid var(--line2);border-radius:2px;padding:8px 10px;max-width:100%;text-transform:none;letter-spacing:0}input:focus,select:focus,textarea:focus{border-color:var(--acid);outline:none}
textarea{min-height:120px;font:13px var(--mono);width:100%}input[type=checkbox]{accent-color:var(--acid)}
button,.btn{font:600 11.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;cursor:pointer;border:1px solid var(--line2);background:transparent;color:var(--ink);padding:11px 16px;text-decoration:none;display:inline-block}button:hover,.btn:hover{border-color:var(--acid);color:var(--acid)}
.primary{background:var(--acid);border-color:var(--acid);color:var(--acid-ink);clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))}.primary:hover{color:var(--acid-ink);filter:brightness(1.08)}
.danger{color:var(--down);border-color:var(--down)}.danger:hover{color:var(--down);border-color:var(--down);background:rgba(255,107,87,.08)}.link{border:0;padding:8px 0;color:var(--ink2)}.link:hover{color:var(--acid)}
.notice{padding:12px 16px;border:1px solid var(--line2);border-left:3px solid var(--acid);background:var(--surface);margin-bottom:14px}.notice.err{border-left-color:var(--down);color:var(--ink)}
pre{background:var(--surface2);border:1px solid var(--line);padding:12px 14px;overflow-x:auto;font:12.5px/1.55 var(--mono);white-space:pre-wrap;word-break:break-word;margin:8px 0}code{font-family:var(--mono);font-size:.92em;color:var(--acid)}pre code{color:var(--ink)}
.checks{display:flex;flex-wrap:wrap;gap:6px 16px}.checks label{display:inline-flex;gap:6px;align-items:center;font-size:13px}
.member{display:grid;gap:10px;padding:16px 0;border-top:1px solid var(--line)}.member:first-of-type{border-top:0}
.auth{max-width:420px;margin:12vh auto 0}.auth .card{padding:30px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}details.data summary{cursor:pointer;color:var(--muted);font:11px var(--mono);text-transform:uppercase;letter-spacing:.06em;margin-top:8px}
.platforms{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px}.platform{border:1px solid var(--line);padding:14px;background:var(--surface2)}`;

const TIP_JS = `(function(){var d=document,t=d.createElement('div');t.className='tip';t.hidden=true;d.body.appendChild(t);
d.addEventListener('pointerover',function(e){var g=e.target.closest&&e.target.closest('[data-tip]');if(!g){t.hidden=true;return}t.replaceChildren();g.dataset.tip.split('|').forEach(function(l,i){var x=d.createElement('div');x.textContent=l;if(!i)x.className='t';t.appendChild(x)});t.hidden=false});
d.addEventListener('pointermove',function(e){if(t.hidden)return;var r=t.getBoundingClientRect(),x=e.clientX+14,y=e.clientY+14;if(x+r.width>innerWidth-8)x=e.clientX-r.width-14;if(y+r.height>innerHeight-8)y=e.clientY-r.height-14;t.style.left=x+'px';t.style.top=y+'px'})})()`;

// ---------- layout ----------
export function layout(ctx, title, body, { bare = false, refresh = 0 } = {}) {
  return html`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="same-origin"><meta name="theme-color" content="#0d0e0c">${refresh ? html`<meta http-equiv="refresh" content="${refresh}">` : ''}<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg">
<link rel="preload" href="/fonts/instrument-serif.woff2" as="font" type="font/woff2" crossorigin><title>${title} · Rastro</title><style>${raw(CSS)}</style></head>
<body>${bare ? '' : header(ctx)}<main>${body}</main><script nonce="${ctx.nonce}">${raw(TIP_JS)}</script></body></html>`;
}

const SECTIONS = [
  { label: 'Vendas', tabs: [['', 'Resumo'], ['/campaigns', 'Campanhas'], ['/orders', 'Pedidos']] },
  { label: 'Tráfego', tabs: [['/traffic', 'Visão geral'], ['/realtime', 'Tempo real'], ['/funnels', 'Funis'], ['/journeys', 'Jornadas'], ['/attribution', 'Atribuição']] },
  { label: 'Integrações', tabs: [['/integrations', 'Integrações']], edit: true },
  { label: 'Configurações', tabs: [['/settings', 'Configurações']], edit: true },
];
const KEEP_PERIOD = new Set(['', '/campaigns', '/orders', '/traffic', '/funnels', '/journeys', '/attribution']);

function header(ctx) {
  const { user, site, share } = ctx;
  if (share) return html`<header class="top"><div class="bar"><a class="brand" href="?">rastro<i></i></a><strong>${site.name}</strong><span class="spacer"></span><span class="live">Relatório público · somente leitura</span></div></header>`;
  const keep = new URLSearchParams([...(ctx.q || [])].filter(([k]) => ['range', 'from', 'to', 'compare'].includes(k))).toString();
  const href = p => `/sites/${encodeURIComponent(site.id)}${p}${keep && KEEP_PERIOD.has(p) ? '?' + keep : ''}`;
  const sections = site ? SECTIONS.filter(s => !s.edit || ctx.canEdit) : [];
  const current = sections.find(s => s.tabs.some(([p]) => p === ctx.tab));
  return html`<header class="top"><div class="bar"><a class="brand" href="/">rastro<i></i></a>
${site ? html`<details class="menu"><summary>${site.name}</summary><div>${ctx.sites.map(s => html`<a href="/sites/${encodeURIComponent(s.id)}">${s.name}</a>`)}${user.role === 'admin' ? html`<a href="/sites">+ Novo site</a>` : ''}</div></details>
<nav class="sections" aria-label="Seções">${sections.map(s => html`<a href="${href(s.tabs[0][0])}"${on(s === current)}><span>${s.label}</span></a>`)}</nav>` : ''}
<span class="spacer"></span><nav class="mini" aria-label="Conta">${user.role === 'admin' ? html`<a href="/sites"${on(ctx.tab === 'sites')}>Sites</a><a href="/team"${on(ctx.tab === 'team')}>Equipe</a>` : ''}
<a href="/account"${on(ctx.tab === 'account')}>Conta</a><form method="post" action="/logout"><button>Sair</button></form></nav></div>
${current && current.tabs.length > 1 ? html`<nav class="subnav" aria-label="${current.label}"><div class="bar">${current.tabs.map(([p, t]) => html`<a href="${href(p)}"${on(ctx.tab === p)}>${t}</a>`)}</div></nav>` : ''}</header>`;
}

export const pageHead = (eyebrow, title, sub, aside = '') =>
  html`<div class="head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? html`<p class="sub">${sub}</p>` : ''}</div>${aside}</div>`;

// ---------- componentes ----------
export function toolbar(ctx, p, f, { compare = true, filters = {}, label = x => x } = {}) {
  const q = ctx.q;
  const cmp = { prev: 'vs. anterior', year: 'vs. ano anterior', off: 'Sem comparação' };
  return html`<div class="toolbar">
<nav class="seg" aria-label="Período">${Object.entries(RANGES).map(([k, t]) => html`<a href="${link(q, { range: k, from: null, to: null })}"${on(p.range === k)}>${t}</a>`)}</nav>
<details class="pop"${p.range === 'custom' ? raw(' open') : ''}><summary>Personalizado</summary><form method="get">${hiddenInputs(q, ['range', 'from', 'to'])}<input type="hidden" name="range" value="custom">
<label class="sr" for="from">De</label><input type="date" id="from" name="from" value="${p.from}" required> – <label class="sr" for="to">Até</label><input type="date" id="to" name="to" value="${p.to}" required><button>Aplicar</button></form></details>
${compare ? html`<nav class="seg" aria-label="Comparação">${Object.entries(cmp).map(([k, t]) => html`<a href="${link(q, { compare: k === 'prev' ? null : k })}"${on(p.compare === k)}>${t}</a>`)}</nav>` : ''}
<span class="period">${p.from === p.to ? brDate(p.from) : `${brDate(p.from)} – ${brDate(p.to)}`}${p.prev && compare ? ` · vs ${brDate(p.prev.from)} – ${brDate(p.prev.to)}` : ''}</span></div>
${Object.keys(f).length ? html`<div class="chips" aria-label="Filtros ativos">${Object.entries(f).map(([k, v]) => html`<a class="chip" href="${link(q, { ['f_' + k]: null })}" aria-label="Remover filtro ${filters[k]}"><span>${filters[k]}: <b>${label(k, v)}</b> ✕</span></a>`)}<a class="chip" href="${link(new URLSearchParams([...q].filter(([k]) => !k.startsWith('f_'))), {})}"><span>Limpar</span></a></div>` : ''}`;
}

function delta(cur, prev, fmt, invert) {
  if (prev == null || cur == null || !prev) return '';
  const ch = (cur - prev) / Math.abs(prev);
  if (Math.abs(ch) < 0.005) return html`<span class="delta" title="Antes: ${fmt(prev)}">= 0%</span>`;
  const good = invert ? ch < 0 : ch > 0;
  return html`<span class="delta ${good ? 'good' : 'bad'}" title="Antes: ${fmt(prev)}">${ch > 0 ? '▲' : '▼'} ${pct(Math.abs(ch))} <span class="sr">${good ? '(melhora)' : '(piora)'} — antes ${fmt(prev)}</span></span>`;
}
/** Indicador: kpi(id, rótulo, atual, anterior, formatador, { invert, feature }) */
export const kpi = (id, t, cur, prev, fmt, { invert = false, feature = false } = {}) =>
  html`<div class="kpi${feature ? ' feature' : ''}"><span class="lbl">${t}</span><b id="${id}">${fmt(cur)}</b>${delta(cur, prev, fmt, invert)}</div>`;

/** Lista com barra de fundo proporcional; cada linha vira filtro quando `col` é passado. */
export function list(ctx, rows, col, { head = '', cols = [['Visitantes', 'v'], ['Views', 'n']], filter = true, label = (c, k) => k === '' ? '(vazio)' : k, prefix = 'f_' } = {}) {
  if (!rows?.length) return html`<p class="empty">Sem dados no período</p>`;
  const max = Math.max(1e-9, ...rows.map(r => Math.abs(r[cols[0][1]] ?? 0)));
  return html`<div class="tw"><table class="list"><thead><tr><th scope="col">${head}</th>${cols.map(c => html`<th scope="col">${c[0]}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>
<td><span class="bar-bg" style="width:${(Math.abs(r[cols[0][1]] ?? 0) / max * 100).toFixed(1)}%"></span>${filter && col && ctx.q ? html`<a href="${link(ctx.q, { [prefix + col]: r.k })}" title="Filtrar por ${label(col, r.k)}">${label(col, r.k)}</a>` : html`<span style="position:relative">${label(col, r.k)}</span>`}</td>
${cols.map(([, key, fmt]) => html`<td>${fmt ? fmt(r[key]) : num(r[key])}</td>`)}</tr>`)}</tbody></table></div>`;
}

let tabSeq = 0;
export function tabs(title, panes) {
  const id = 't' + (++tabSeq);
  return html`<section class="card"><div class="tabs"><h2>${title}</h2>${panes.map((p, i) => html`<input type="radio" name="${id}" id="${id}-${i}"${i ? '' : raw(' checked')}><label for="${id}-${i}">${p[0]}</label>`)}
${panes.map(p => html`<div class="pane">${p[1]}</div>`)}</div></section>`;
}

function niceMax(m) {
  const p = 10 ** Math.floor(Math.log10(m));
  return [1, 2, 2.5, 5, 10].map(k => k * p).find(v => v >= m);
}
const f1 = n => n.toFixed(1);
const barPath = (x, w, y0, y1) => {
  const r = Math.min(3, w / 2, y0 - y1);
  return `M${f1(x)},${y0}V${f1(y1 + r)}Q${f1(x)},${f1(y1)} ${f1(x + r)},${f1(y1)}H${f1(x + w - r)}Q${f1(x + w)},${f1(y1)} ${f1(x + w)},${f1(y1 + r)}V${y0}Z`;
};
const compact = n => Math.abs(n) >= 1000 ? new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : num(n);

/**
 * Barras (série principal) + linha opcional (segunda medida, mesma unidade) + tracejado do período anterior.
 * Tooltip por coluna e tabela acessível. Um único eixo y.
 */
export function chart(cur, prev, { label = 'Visitantes', color = 'var(--acid)', fmt = num, line = null, h = 240, tip = () => [] } = {}) {
  const W = 960, L = 52, R = 6, T = 10, B = 24, ph = h - T - B, pw = W - L - R, n = cur.length, step = pw / n;
  const max = niceMax(Math.max(1, ...cur.map(d => d.v), ...(prev || []).map(d => d.v), ...(line ? cur.map(d => d[line.key]) : [])));
  const y = v => T + ph - v / max * ph;
  const ticks = [0, 1, 2, 3, 4].map(i => max * i / 4);
  const bw = Math.max(1, Math.min(34, step - 3)), every = Math.ceil(n / 10);
  const cx = i => L + i * step + step / 2;
  const cols = cur.map((d, i) => {
    const x = L + i * step, pv = prev?.[i];
    const t = [d.label, `${label}: ${fmt(d.v)}`, ...(line ? [`${line.label}: ${fmt(d[line.key])}`] : []), ...tip(d), ...(pv ? [`Anterior (${pv.label}): ${fmt(pv.v)}`] : [])].join('|');
    const top = d.v ? Math.min(y(d.v), T + ph - 2) : null;
    return html`<g class="col" data-tip="${t}"><rect class="hit" x="${f1(x)}" y="${T}" width="${f1(step)}" height="${ph}"/>${top != null ? html`<path fill="${color}" d="${barPath(x + (step - bw) / 2, bw, T + ph, top)}"/>` : ''}</g>`;
  });
  const pts = vals => vals.map((v, i) => `${f1(cx(i))},${f1(y(v))}`).join(' ');
  return html`<div class="legend" aria-hidden="true"><span><i class="sw" style="background:${color}"></i>${label}</span>${line ? html`<span><i class="sw line" style="border-color:${line.color}"></i>${line.label}</span>` : ''}${prev ? html`<span><i class="sw dash"></i>Período anterior</span>` : ''}</div>
<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="Gráfico: ${label}${line ? ' e ' + line.label : ''} por período">
${ticks.map(t => html`<line class="${t ? 'gl' : 'bl'}" x1="${L}" x2="${W - R}" y1="${f1(y(t) - 0.5)}" y2="${f1(y(t) - 0.5)}"/><text x="${L - 8}" y="${f1(y(t) + 4)}" text-anchor="end">${compact(t)}</text>`)}
${cols}${line ? html`<polyline class="serl" stroke="${line.color}" points="${pts(cur.map(d => d[line.key]))}" pointer-events="none"/>` : ''}${prev ? html`<polyline class="prevl" points="${pts(prev.map(d => d.v))}" pointer-events="none"/>` : ''}
${cur.map((d, i) => i % every === 0 ? html`<text x="${f1(cx(i))}" y="${h - 6}" text-anchor="middle">${d.label}</text>` : '')}</svg>
<details class="data"><summary>Ver dados em tabela</summary><div class="tw"><table class="data"><thead><tr><th>Período</th><th>${label}</th>${line ? html`<th>${line.label}</th>` : ''}${prev ? html`<th>Anterior</th>` : ''}</tr></thead>
<tbody>${cur.map((d, i) => html`<tr><td>${d.label}</td><td>${fmt(d.v)}</td>${line ? html`<td>${fmt(d[line.key])}</td>` : ''}${prev ? html`<td>${fmt(prev[i]?.v)}</td>` : ''}</tr>`)}</tbody></table></div></details>`;
}

/** Rosca com 2px de respiro entre fatias e legenda com valores (identidade nunca só pela cor). */
export function donut(items, { total, totalLabel, fmt = num }) {
  const sum = items.reduce((s, x) => s + x.v, 0);
  if (!sum) return html`<p class="empty">Sem vendas aprovadas no período</p>`;
  const R = 70, r = 46, C = 90;
  let a0 = -Math.PI / 2;
  const arc = (a1, a2) => {
    const p = (rad, a) => `${f1(C + rad * Math.cos(a))},${f1(C + rad * Math.sin(a))}`, big = a2 - a1 > Math.PI ? 1 : 0;
    return `M${p(R, a1)}A${R},${R} 0 ${big} 1 ${p(R, a2)}L${p(r, a2)}A${r},${r} 0 ${big} 0 ${p(r, a1)}Z`;
  };
  const slices = items.map(x => {
    const a1 = a0, a2 = a0 + x.v / sum * Math.PI * 2 - (items.length > 1 ? 0.0001 : 0);
    a0 = a1 + x.v / sum * Math.PI * 2;
    return html`<path d="${items.length > 1 ? arc(a1, a2) : `M${C},${C - R}A${R},${R} 0 1 1 ${C - 0.01},${C - R}L${C - 0.01},${C - r}A${r},${r} 0 1 0 ${C},${C - r}Z`}" fill="${x.color}" stroke="var(--surface)" stroke-width="2" data-tip="${x.label}|${fmt(x.v)} · ${pct(x.v / sum)}${x.n != null ? ` · ${num(x.n)} vendas` : ''}"/>`;
  });
  return html`<div class="donut"><svg viewBox="0 0 180 180" role="img" aria-label="${totalLabel}">${slices}<text class="big" x="90" y="92" text-anchor="middle">${total}</text><text class="small" x="90" y="112" text-anchor="middle">${totalLabel}</text></svg>
<ul>${items.map(x => html`<li><i class="sw" style="background:${x.color}"></i><span>${x.label}<small>${x.n != null ? `${num(x.n)} vendas` : ''}</small></span><span>${fmt(x.v)} <small>${pct(x.v / sum)}</small></span></li>`)}</ul></div>`;
}

export const notice = (text, err) => text ? html`<div class="notice${err ? ' err' : ''}" role="${err ? 'alert' : 'status'}">${text}</div>` : '';
