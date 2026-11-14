// Base da interface: template com escape, formatação, design system "Rastro Azul" (docs/design-system.md), layout e componentes.
import { RANGES } from '../time.js';
import { iconSvg } from './icons.js';

// ---------- template com escape automático ----------
class Raw { constructor(s) { this.s = s; } }
export const raw = s => new Raw(String(s));
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const out = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(out).join('') : v == null || v === false ? '' : esc(v);
export const html = (s, ...v) => raw(s.reduce((acc, str, i) => acc + str + (i < v.length ? out(v[i]) : ''), ''));
export const icon = (name, size) => raw(iconSvg(name, size));

// ---------- formatação ----------
const nf = new Intl.NumberFormat('pt-BR');
export const num = n => nf.format(n ?? 0);
export const pct = x => x == null ? '-' : `${(Math.round(x * 1000) / 10).toLocaleString('pt-BR')}%`;
export const ratio = x => x == null ? '-' : x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pad2 = n => String(n).padStart(2, '0');
export const dur = s => s == null ? '-' : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${pad2(Math.round(s % 60))}s`;
export const money = (v, cur = 'BRL') => {
  if (v == null) return '-';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(v); } catch { return `${cur} ${num(v)}`; }
};
const regions = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const flag = c => String.fromCodePoint(...[...c].map(x => 127397 + x.charCodeAt(0)));
export const countryName = c => { if (c === '??') return 'Desconhecido'; try { return `${flag(c)} ${regions.of(c)}`; } catch { return c; } };
export const brDate = d => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const SCREEN = { mobile: 'Celular', tablet: 'Tablet', laptop: 'Notebook', desktop: 'Desktop', '??': 'Desconhecido' };
// Papéis dentro da agência (ADR 0009): Dono gerencia sites e equipe; Gestor configura os sites liberados; Cliente só vê.
export const ROLES = { admin: 'Dono', editor: 'Gestor', viewer: 'Cliente' };

export function link(q, changes) {
  const s = new URLSearchParams(q);
  for (const [k, v] of Object.entries(changes)) v == null ? s.delete(k) : s.set(k, v);
  const str = s.toString();
  return str ? '?' + str : '?';
}
export const on = cond => cond ? raw(' class="on" aria-current="page"') : '';
export const hiddenInputs = (q, skip = []) => [...q].filter(([k]) => !skip.includes(k)).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`);

// ---------- design system: Rastro Azul ----------
// Tokens em :root; o escuro é uma tabela própria (não inversão), aplicada pelo sistema ou por data-theme.
// Séries s1 a s4 validadas com a skill dataviz nos dois modos (ver docs/design-system.md, Gráficos).
const DARK = `color-scheme:dark;--bg:#070D1C;--surface:#0E1730;--surface2:#13203F;--surface3:#1A2A50;--line:#1F2D52;--line2:#2B3D6B;--field:#5A70AA;
--ink:#E8EEFC;--ink2:#B7C4E4;--muted:#8392B8;--side:#0A1838;--side-ink:#E8EEFC;--side-muted:#8392B8;--side-hover:rgba(255,255,255,.06);--side-active:#0B4DB4;
--primary-hover:#1A62E0;--link:#8DB4F5;--ring:#8DB4F5;--info-bg:#12244A;--bar:rgba(57,135,229,.16);--hover:rgba(255,255,255,.04);
--ok:#4FD1A0;--ok-bg:#0E3328;--bad:#FF8A80;--bad-bg:#3A1716;--warn:#F2C15E;--warn-bg:#352711;
--s1:#3987E5;--s2:#D95926;--s3:#199E70;--s4:#C98500;--shadow:0 12px 32px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.08);--edge:rgba(0,0,0,.55);--if-light:none;--if-dark:inline-flex`;

export const CSS = `@font-face{font-family:Figtree;src:url(/fonts/figtree.woff2) format("woff2");font-weight:300 900;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(/fonts/jetbrains-mono.woff2) format("woff2");font-weight:100 800;font-display:swap}
:root{color-scheme:light;--bg:#ECF1FB;--surface:#FFFFFF;--surface2:#F5F8FE;--surface3:#E6EDFA;--line:#DCE4F2;--line2:#C7D3EA;--field:#7D8BAA;
--ink:#0B1530;--ink2:#34405E;--muted:#5B6785;--side:#0B4DB4;--side-ink:#FFFFFF;--side-muted:#B9CDF3;--side-hover:rgba(255,255,255,.10);--side-active:rgba(255,255,255,.18);
--hero:#0B4DB4;--primary:#0E58DB;--primary-hover:#0B4DB4;--link:#0E58DB;--ring:#0E58DB;--info-bg:#E7EFFD;--bar:rgba(14,88,219,.08);--hover:rgba(11,21,48,.035);
--ok:#0F7A55;--ok-bg:#E3F5EC;--bad:#C2372F;--bad-bg:#FCE9E7;--warn:#9A6200;--warn-bg:#FDF1DC;
--s1:#0E58DB;--s2:#E0602C;--s3:#13976A;--s4:#B97D00;--shadow:0 12px 32px rgba(11,40,110,.16);--edge:rgba(11,21,48,.16);--if-light:inline-flex;--if-dark:none;
--sw:248px;--sans:Figtree,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
:root[data-theme=dark]{${DARK}}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100vh;color:var(--ink);font:14px/1.5 var(--sans);background:var(--bg);-webkit-font-smoothing:antialiased}
a{color:inherit}main p a,.notice a{color:var(--link)}::selection{background:var(--primary);color:#fff}
:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.ic{flex:none;display:block}
.sr,.nav-t{position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.page{padding-left:var(--sw);transition:padding .16s}
main{max-width:1240px;margin:0 auto;padding:32px 32px 80px}
/* barra lateral */
.side{position:fixed;inset:0 auto 0 0;z-index:40;width:var(--sw);display:flex;flex-direction:column;gap:2px;padding:14px 12px 12px;background:var(--side);color:var(--side-ink);overflow-y:auto;scrollbar-width:none;transition:width .16s,transform .16s,visibility .16s}
.side::-webkit-scrollbar{display:none}.side :focus-visible{outline-color:#fff}
.brand{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 8px;margin-bottom:6px;color:inherit;text-decoration:none;font:800 20px/1 var(--sans);letter-spacing:-.02em}
.mark{width:30px;height:30px;flex:none;display:grid;place-items:center;border-radius:9px;background:#fff;color:#0B4DB4;font:800 17px/1 var(--sans)}
.it{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:40px;padding:0 12px;border:0;border-radius:9px;background:none;color:var(--side-ink);text-decoration:none;font:500 14px/1.2 var(--sans);text-align:left;cursor:pointer;transition:background-color .12s}
.it .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (hover:hover){.it:hover{background:var(--side-hover)}}
.it.on{background:var(--side-active);font-weight:600}
.cnt{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.22);font:600 10px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.06em}
.cnt i{width:6px;height:6px;border-radius:50%;background:#7CE8B8}
.glabel{margin:10px 12px 4px;font:600 10.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--side-muted)}
.side .foot{margin-top:auto;position:sticky;bottom:-14px;background:var(--side);padding-bottom:4px;padding-top:8px;border-top:1px solid rgba(255,255,255,.14);display:grid;gap:2px}.side form{margin:0}
.tl{display:var(--if-light)}.td{display:var(--if-dark)}
.menu{position:relative;margin-bottom:6px}.menu summary{list-style:none;background:rgba(255,255,255,.08)}.menu summary::-webkit-details-marker{display:none}
.menu[open] summary .chev{transform:rotate(90deg)}.chev{transition:transform .12s;opacity:.8}
.menu>div{display:grid;gap:2px;margin-top:6px;padding:4px;border-radius:12px;background:rgba(255,255,255,.08);max-height:50vh;overflow:auto}
.menu>div a{display:flex;align-items:center;min-height:36px;padding:0 10px;border-radius:8px;text-decoration:none;font-size:13.5px}.menu>div a:hover{background:var(--side-hover)}
.collapse{display:none;position:fixed;top:24px;left:calc(var(--sw) - 14px);z-index:45;width:28px;height:28px;padding:0;place-items:center;border-radius:50%;border:1px solid var(--line2);background:var(--surface);color:var(--link);box-shadow:0 2px 8px rgba(11,40,110,.18);cursor:pointer;transition:left .16s}
.collapse::before{content:"";position:absolute;inset:-8px}.js .collapse{display:grid}.collapse .ic{transition:transform .16s}[data-side=mini] .collapse .ic{transform:rotate(180deg)}
.theme{display:none}.js .theme{display:flex}
.mtop,.side-x,.scrim{display:none}
@media (min-width:900px){
[data-side=mini]{--sw:72px}
[data-side=mini] .side{padding-left:12px;padding-right:12px}
@media (min-height:960px){[data-side=mini] .side{overflow:visible}}
[data-side=mini] .brand{justify-content:center;padding:0}[data-side=mini] .brand>span:last-child,[data-side=mini] .cnt,[data-side=mini] .chev{display:none}
[data-side=mini] .glabel{height:1px;margin:10px 8px;overflow:hidden;color:transparent;background:rgba(255,255,255,.14)}
[data-side=mini] .it{justify-content:center;padding:0}
[data-side=mini] .it .t{position:absolute;left:calc(100% + 14px);top:50%;transform:translateY(-50%);flex:none;padding:6px 10px;border-radius:8px;background:var(--ink);color:var(--surface);font:600 12.5px/1.2 var(--sans);opacity:0;pointer-events:none;z-index:50;box-shadow:var(--shadow)}
[data-side=mini] .it:hover .t,[data-side=mini] .it:focus-visible .t{opacity:1}
[data-side=mini] .menu>div{position:absolute;left:calc(100% + 14px);top:0;width:240px;background:var(--surface);color:var(--ink);border:1px solid var(--line);box-shadow:var(--shadow);z-index:50}
[data-side=mini] .menu>div a:hover{background:var(--surface2)}[data-side=mini] .menu>div :focus-visible{outline-color:var(--ring)}
[data-side=mini] .menu[open] .it .t{opacity:0}
}
@media (max-width:899px){
.page{padding-left:0}
.mtop{display:flex;position:sticky;top:0;z-index:30;align-items:center;gap:8px;min-height:56px;padding:0 12px;background:var(--side);color:var(--side-ink)}
.mtop .brand{margin:0}.mtop .site{margin-left:auto;font-weight:600;max-width:50vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px}
.menu-btn{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;cursor:pointer}.menu-btn:hover{background:var(--side-hover)}
.nav-t:focus-visible~.mtop .menu-btn{outline:2px solid #fff;outline-offset:-2px}
.side{width:min(300px,86vw);transform:translateX(-100%);visibility:hidden;box-shadow:var(--shadow)}
.nav-t:checked~.side{transform:none;visibility:visible}
.nav-t:checked~.scrim{display:block;position:fixed;inset:0;z-index:35;background:rgba(7,13,28,.5)}
.side-x{display:grid;place-items:center;position:absolute;top:16px;right:12px;width:44px;height:44px;border-radius:12px;cursor:pointer}
.collapse,.js .collapse{display:none}
main{padding:20px 16px 64px}
}
@media (pointer:coarse){.it,.menu>div a{min-height:44px}}
/* barra do link público */
.sbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:10px 24px;background:var(--side);color:var(--side-ink)}.sbar .brand{margin:0}.sbar .live{margin-left:auto}
/* cabeçalho de página */
.head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px 24px;margin:4px 0 24px}
.head-aside{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:12px;font:600 10.5px/1.2 var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--link)}.eyebrow::before{content:"";width:16px;height:2px;border-radius:2px;background:currentColor}
h1{font:800 40px/1.05 var(--sans);letter-spacing:-.02em;margin:0;text-wrap:balance}h1 em{font-style:normal;color:var(--link)}
.sub{color:var(--muted);font-size:15px;margin:12px 0 0;max-width:72ch}
h2{font:700 15px/1.3 var(--sans);margin:0}
h3{font:600 10.5px/1.2 var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:22px 0 8px}
@media (max-width:899px){h1{font-size:28px}}
/* filtros */
.toolbar{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin-bottom:16px}
.seg{display:inline-flex;max-width:100%;overflow-x:auto;scrollbar-width:none;gap:2px;padding:3px;border:1px solid var(--line);border-radius:12px}.seg::-webkit-scrollbar{display:none}
.seg a:focus-visible{outline-offset:-2px}
/* sombra de rolagem: aparece só na borda onde ainda há conteúdo */
.seg,.tw{background:linear-gradient(to right,var(--surface) 30%,transparent) left/32px 100% no-repeat local,linear-gradient(to left,var(--surface) 30%,transparent) right/32px 100% no-repeat local,radial-gradient(farthest-side at 0 50%,var(--edge),transparent) left/12px 100% no-repeat scroll,radial-gradient(farthest-side at 100% 50%,var(--edge),transparent) right/12px 100% no-repeat scroll;background-color:var(--surface)}
.filters>summary{list-style:none;display:none;align-items:center;gap:6px;min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink2);font:500 13px/1 var(--sans);cursor:pointer}.filters>summary::-webkit-details-marker{display:none}
.filters>div{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center}
@media (max-width:599px){.filters{flex-basis:100%}.filters>summary{display:inline-flex}.filters[open]>summary{margin-bottom:8px}}
.seg a{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border:1px solid transparent;border-radius:9px;color:var(--muted);text-decoration:none;font:500 13px/1 var(--sans);white-space:nowrap}
@media (hover:hover){.seg a:hover{color:var(--ink);background:var(--hover)}}
.seg a.on{background:var(--surface2);border-color:var(--line2);color:var(--ink);font-weight:600}
.pop{position:relative}.pop summary{list-style:none;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink2);font:500 13px/1 var(--sans);cursor:pointer}.pop summary::-webkit-details-marker{display:none}
.pop[open] summary{border-color:var(--line2);color:var(--ink)}.pop form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
.period{color:var(--muted);font:500 12px var(--mono)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.chip{display:inline-flex;gap:6px;align-items:center;min-height:32px;padding:0 12px;border:1px solid var(--line2);border-radius:999px;background:var(--surface);color:var(--ink2);text-decoration:none;font-size:13px}.chip b{color:var(--link);font-weight:600}
/* KPIs */
.hero,.kpis{display:grid;gap:16px;margin-bottom:16px}
.hero{grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))}.kpis{grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:12px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:18px 20px;min-width:0;display:flex;flex-direction:column;align-items:flex-start}
.kpi b{display:block;font:800 30px/1.1 var(--sans);letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin:10px 0 10px;overflow-wrap:anywhere}
.kpis .kpi{padding:14px 16px;border-radius:16px}.kpis .kpi b{font:700 21px/1.2 var(--sans);margin:6px 0 8px}
.kpi.feature{background:var(--hero) radial-gradient(130% 100% at 0 0,rgba(47,116,234,.55),transparent 62%);border-color:transparent;color:#fff;box-shadow:var(--shadow)}
.lbl{display:block;font:600 10.5px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.feature .lbl{color:rgba(255,255,255,.9)}
.delta{display:inline-flex;align-items:center;gap:4px;margin-top:auto;padding:3px 9px;border-radius:999px;background:var(--surface2);color:var(--ink2);font:600 11.5px/1.4 var(--mono)}
.delta.good{background:var(--ok-bg);color:var(--ok)}.delta.bad{background:var(--bad-bg);color:var(--bad)}
.feature .delta,.feature .delta.good,.feature .delta.bad{background:rgba(255,255,255,.16);color:#fff}
.spark{display:flex;align-items:flex-end;gap:3px;width:100%;height:34px;margin-top:14px}.spark i{flex:1;max-width:12px;min-height:3px;border-radius:3px 3px 1px 1px;background:rgba(255,255,255,.28)}.spark i:last-child{background:#fff}
/* cartões */
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px 22px;min-width:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:16px;margin-top:16px}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.between{justify-content:space-between}.stack{display:grid;gap:14px}
@media (max-width:899px){.card{padding:16px}}
@media (max-width:600px){.hero,.kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.hero .feature{grid-column:1/-1}.hero>.kpi:last-child:nth-child(even),.kpis>.kpi:last-child:nth-child(odd){grid-column:1/-1}.hero .kpi:not(.feature) b{font-size:22px}.kpi{padding:14px 16px}}
.events time{white-space:nowrap}
/* gráficos */
.legend{display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font:600 10.5px var(--mono);text-transform:uppercase;letter-spacing:.08em;margin:12px 0 8px}.legend span{display:inline-flex;gap:7px;align-items:center}
.sw{width:10px;height:10px;border-radius:3px;display:inline-block;flex:none}.sw.line{height:0;width:18px;border-radius:0;border-top:2px solid}.sw.dash{height:0;width:18px;border-radius:0;border-top:2px dashed var(--muted)}
svg:not(.ic){display:block;width:100%;height:auto}svg text{fill:var(--muted);font:500 10.5px var(--mono)}
.gl{stroke:var(--line)}.bl{stroke:var(--line2)}.hit{fill:transparent}.col:hover .hit{fill:var(--bar)}.prevl{fill:none;stroke:var(--muted);stroke-width:2;stroke-dasharray:5 4}.serl{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart-empty{display:grid;place-items:center;align-content:center;gap:10px;margin-top:12px;padding:24px;border:1px dashed var(--line2);border-radius:14px;color:var(--muted);text-align:center}.chart-empty .ic{color:var(--link)}.chart-empty p{margin:0;max-width:46ch}
.empty a{color:var(--link)}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:14px}
.tip{position:fixed;z-index:95;pointer-events:none;background:var(--ink);color:var(--surface);border-radius:12px;padding:8px 12px;font:500 12px/1.5 var(--mono);max-width:340px;box-shadow:var(--shadow)}.tip .t{font:700 13px/1.4 var(--sans);margin-bottom:2px}
.donut{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px;align-items:center}@media (max-width:480px){.donut{grid-template-columns:1fr}.donut svg{max-width:220px;margin:0 auto}}
.donut svg text.big{fill:var(--ink);font:800 26px var(--sans)}.donut svg text.small{fill:var(--muted);font:600 10px var(--mono);text-transform:uppercase;letter-spacing:.1em}
.donut ul{list-style:none;margin:0;padding:0}.donut li{display:grid;grid-template-columns:12px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}.donut li:first-child{border-top:0}.donut li small{display:block;white-space:nowrap;color:var(--muted);font:12px var(--mono)}
/* abas dentro de cartões */
.tabs{display:flex;flex-wrap:wrap;align-items:center;gap:2px}.tabs h2{margin-right:auto;padding-right:8px}.tabs>input{position:absolute;opacity:0;pointer-events:none}
.tabs>label{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border-radius:8px;cursor:pointer;color:var(--muted);font:500 12.5px/1 var(--sans)}
@media (hover:hover){.tabs>label:hover{color:var(--ink);background:var(--hover)}}
.tabs>input:checked+label{background:var(--surface2);color:var(--ink);font-weight:600;box-shadow:inset 0 0 0 1px var(--line)}.tabs>input:focus-visible+label{outline:2px solid var(--ring);outline-offset:2px}
.pane{display:none;flex-basis:100%;margin-top:12px}${[1, 2, 3, 4, 5].map(i => `.tabs>input:nth-of-type(${i}):checked~.pane:nth-of-type(${i})`).join(',')}{display:block}
.pop form.stack{display:grid}.pop>summary::after{content:"";display:inline-block;width:6px;height:6px;margin-left:8px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(45deg) translateY(-2px);transition:transform .12s}.pop[open]>summary::after{transform:rotate(225deg)}
pre{font-variant-ligatures:none}pre.code{white-space:pre;word-break:normal;max-height:420px;overflow:auto}
table.txt th,table.txt td{text-align:left}table.txt .num{text-align:right}table.txt td:first-child{white-space:nowrap}
.grid>.card.full{grid-column:1/-1}.platform pre{border:0;background:var(--surface)}
.progress{height:8px;border-radius:999px;background:var(--surface3);overflow:hidden;margin:4px 0 18px}.progress i{display:block;height:100%;background:var(--primary);border-radius:999px;transition:width .16s}
.steps-list{display:grid;gap:12px}.step>summary{display:flex;align-items:center;gap:14px;list-style:none;cursor:pointer;min-height:44px}.step>summary::-webkit-details-marker{display:none}
.step .num{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line2);font:700 14px/1 var(--sans);color:var(--ink2)}
.step.ok .num{background:var(--ok-bg);border-color:transparent;color:var(--ok)}.step .st{display:grid;gap:2px}.step .st small{color:var(--muted);font-size:12.5px}.step.ok .st small{color:var(--ok)}
.step>.body{margin-top:14px;padding-top:14px;border-top:1px solid var(--line);display:grid;gap:10px}.step>.body>p{margin:0}
.setup-checks{list-style:none;margin:0;padding:0;display:grid;gap:6px}.setup-checks li{display:flex;align-items:center;gap:8px;color:var(--bad)}.setup-checks li.ok{color:var(--ok)}
.step>.body>.btn,.step>.body>a.btn{justify-self:start}.step>.body>p.okline{display:flex;gap:8px;align-items:center;color:var(--ok)}.step>summary{border-radius:12px}
.notice code{overflow-wrap:anywhere}.notice>div{min-width:0}
.steps{margin:10px 0 12px;padding-left:20px;display:grid;gap:6px;color:var(--ink2)}textarea{font:500 12.5px/1.5 var(--mono)}
.tag.ok{color:var(--ok);background:var(--ok-bg);border-color:transparent}.tag.bad{color:var(--bad);background:var(--bad-bg);border-color:transparent}.tag.warn{color:var(--warn);background:var(--warn-bg);border-color:transparent}
details.dl{display:inline-block}details.dl>summary{list-style:none;cursor:pointer}details.dl>summary::-webkit-details-marker{display:none}details.dl[open]>div{margin-top:6px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface2);font-size:12px;max-width:360px;white-space:normal}
.tag{display:inline-block;font:600 10px/1 var(--mono);padding:4px 7px;margin:1px 4px 1px 0;border:1px solid var(--line2);border-radius:999px;background:var(--surface2);color:var(--link);text-transform:uppercase;letter-spacing:.04em}
/* tabelas */
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.4;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--muted);font:600 10.5px/1.2 var(--mono);text-transform:uppercase;letter-spacing:.1em;padding:10px 12px;background:var(--surface2);white-space:nowrap}
thead th:first-child{border-radius:10px 0 0 10px}thead th:last-child{border-radius:0 10px 10px 0}
th+th,td+td{text-align:right;white-space:nowrap}
td{padding:12px;border-top:1px solid var(--line)}tbody tr:first-child td{border-top:0}
@media (hover:hover){tbody tr:hover td{background:var(--hover)}}
tfoot th{background:none;border-top:1px solid var(--line2);color:var(--ink);font:700 13px var(--sans);text-transform:none;letter-spacing:0}
.list td:first-child{position:relative;word-break:break-word}.list td:first-child a{text-decoration:none;position:relative}.list td:first-child a:hover{color:var(--link);text-decoration:underline}.list td+td{width:1%}
.bar-bg{position:absolute;left:12px;bottom:5px;height:3px;max-width:calc(100% - 24px);border-radius:2px;background:var(--s1);opacity:.35}
td small,.events small{color:var(--muted)}.left th,.left td{text-align:left;white-space:normal}.left td+td{width:auto}.left td{vertical-align:top}
.neg{color:var(--bad)}.pos{color:var(--ok)}.muted{color:var(--muted)}.empty{color:var(--muted);padding:16px 0;margin:0}
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font:600 10.5px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.06em;background:var(--surface2);color:var(--ink2);white-space:nowrap}
.st-paid,.st-ACTIVE{background:var(--ok-bg);color:var(--ok)}.st-pending{background:var(--warn-bg);color:var(--warn)}.st-refunded{background:var(--surface3);color:var(--ink2)}.st-chargeback,.st-refused{background:var(--bad-bg);color:var(--bad)}.st-paused{background:var(--surface2);color:var(--muted)}
/* funil, caminhos, feed */
.funnel .step{display:grid;grid-template-columns:32px 1fr auto;gap:8px 14px;align-items:center;padding:14px 0;border-top:1px solid var(--line)}.funnel .step:first-child{border-top:0}
.funnel .n{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;font:600 12px var(--mono);background:var(--surface2);border:1px solid var(--line2);color:var(--link)}
.funnel .track{grid-column:2/4;height:10px;border-radius:999px;background:var(--surface3);overflow:hidden}.funnel .fill{height:100%;border-radius:999px;background:var(--s1)}.funnel .meta{color:var(--muted);font:12px var(--mono);text-align:right}.funnel .meta b{color:var(--ink)}
.scroll{overflow-x:auto}.node{fill:var(--surface2);stroke:var(--line2)}.node.other{opacity:.6}.lnk{fill:var(--s1);opacity:.16}.lnk:hover{opacity:.38}.sankey text{fill:var(--ink);font:500 12px var(--sans)}.sankey text.c{fill:var(--muted);font:500 11px var(--mono)}
.feed{list-style:none;margin:0;padding:0;max-height:540px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}.feed li{display:grid;grid-template-columns:72px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--line)}.feed li:first-child{border-top:0}.feed time{color:var(--muted);font:12px var(--mono)}.feed .ev{display:inline-flex;align-items:center;gap:5px;color:var(--link);font-weight:600}.feed small{color:var(--muted);display:block;font-size:12px}
.live{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font:600 10.5px var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--ink2);text-decoration:none}a.live:hover{border-color:var(--line2);color:var(--ink)}
.live i{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 var(--ok);animation:p 2s infinite}@keyframes p{70%{box-shadow:0 0 0 6px transparent}}
.sbar .live{background:rgba(255,255,255,.12);border-color:transparent;color:#fff}
/* formulários */
form.stack{max-width:480px}label.f{display:grid;gap:6px;font:600 10.5px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}label.f>span{text-transform:none;letter-spacing:0;font:400 13px var(--sans)}
input,select,textarea{font:14px var(--sans);color:var(--ink);background:var(--surface);border:1px solid var(--field);border-radius:12px;min-height:40px;padding:8px 12px;max-width:100%;text-transform:none;letter-spacing:0}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--ring);box-shadow:0 0 0 3px var(--bar),inset 0 0 0 1px var(--ring)}
textarea{min-height:120px;font:13px var(--mono);width:100%}input[type=checkbox]{min-height:0;width:18px;height:18px;padding:0;accent-color:var(--primary)}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 16px;border:1px solid var(--line2);border-radius:12px;background:var(--surface);color:var(--ink);font:600 14px/1 var(--sans);text-decoration:none;cursor:pointer;transition:background-color .12s,border-color .12s,transform .12s}
@media (hover:hover){button:hover,.btn:hover{background:var(--surface2);border-color:var(--field)}}
button:active,.btn:active{transform:scale(.98)}
.primary,button.primary{background:var(--primary);border-color:var(--primary);color:#fff}@media (hover:hover){.primary:hover,button.primary:hover{background:var(--primary-hover);border-color:var(--primary-hover)}}
.danger,button.danger{color:var(--bad);border-color:var(--bad)}@media (hover:hover){.danger:hover,button.danger:hover{background:var(--bad-bg);border-color:var(--bad)}}
.link,button.link{border-color:transparent;background:none;padding:0 8px;color:var(--ink2)}@media (hover:hover){.link:hover,button.link:hover{background:var(--hover);border-color:transparent;color:var(--ink)}}
.link.danger{color:var(--bad);border-color:transparent}
.notice{display:flex;gap:10px;align-items:flex-start;padding:14px 16px;border-radius:14px;background:var(--info-bg);color:var(--ink);margin-bottom:16px}.notice>.ic{margin-top:1px}.notice.err{background:var(--bad-bg)}.notice.err>.ic{color:var(--bad)}.notice pre{margin-bottom:0}
pre{background:var(--surface2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;overflow-x:auto;font:12.5px/1.6 var(--mono);white-space:pre-wrap;word-break:break-word;margin:8px 0}code{font-family:var(--mono);font-size:.92em;color:var(--link)}pre code{color:var(--ink)}
.checks{display:flex;flex-wrap:wrap;gap:6px 16px}.checks label{display:inline-flex;gap:8px;align-items:center;min-height:32px;font-size:13px}
.member{display:grid;gap:10px;padding:16px 0;border-top:1px solid var(--line)}.member:first-of-type{border-top:0}
details.data summary{cursor:pointer;display:inline-flex;align-items:center;min-height:32px;color:var(--muted);font:600 10.5px var(--mono);text-transform:uppercase;letter-spacing:.08em;margin-top:6px}
.platforms{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px}.platform{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--surface2)}.platform pre{background:var(--surface)}
/* páginas sem barra (login, convite) */
body.bare{background:var(--side)}
.auth{max-width:440px;margin:0 auto;padding:12vh 16px 40px}.auth>.brand{margin:0 0 20px;padding:0}.bare .auth>.brand{color:#fff}.bare main{padding:0}.auth .card{padding:32px;border:0;box-shadow:var(--shadow)}
.auth h1{font-size:36px;margin-bottom:18px}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
@media (forced-colors:active){.it.on,.seg a.on,.tabs>input:checked+label{outline:1px solid CanvasText}.funnel .fill,.bar-bg,.sw,.spark,.meter i{forced-color-adjust:none}}
.skip{position:absolute;left:12px;top:-60px;z-index:100;padding:10px 14px;border-radius:10px;background:var(--primary);color:#fff;font-weight:600;text-decoration:none}.skip:focus{top:12px}
@media (min-width:900px){.nav-t{display:none}}`;

// Antes da pintura: tema e barra recolhida salvos (sem JS fica tudo no padrão do sistema e a barra aberta).
const HEAD_JS = `(function(){var h=document.documentElement,t,s;try{t=localStorage.getItem('rastro-theme');s=localStorage.getItem('rastro-side')}catch(e){}
if(t==='light'||t==='dark')h.dataset.theme=t;if(s==='mini')h.dataset.side='mini';h.classList.add('js');
var dk=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches,m=document.querySelector('meta[name=theme-color]');if(m)m.content=dk?'#0A1838':'#0B4DB4'})()`;

const TIP_JS = `(function(){var d=document,t=d.createElement('div');t.className='tip';t.hidden=true;d.body.appendChild(t);
d.addEventListener('pointerover',function(e){var g=e.target.closest&&e.target.closest('[data-tip]');if(!g){t.hidden=true;return}t.replaceChildren();g.dataset.tip.split('|').forEach(function(l,i){var x=d.createElement('div');x.textContent=l;if(!i)x.className='t';t.appendChild(x)});t.hidden=false});
d.addEventListener('pointermove',function(e){if(t.hidden)return;var r=t.getBoundingClientRect(),x=e.clientX+14,y=e.clientY+14;if(x+r.width>innerWidth-8)x=e.clientX-r.width-14;if(y+r.height>innerHeight-8)y=e.clientY-r.height-14;t.style.left=x+'px';t.style.top=y+'px'})})()`;

const UI_JS = `(function(){var d=document,h=d.documentElement,mq=matchMedia('(prefers-color-scheme: dark)');
function dark(){return h.dataset.theme?h.dataset.theme==='dark':mq.matches}
function meta(){var m=d.querySelector('meta[name=theme-color]');if(m)m.content=dark()?'#0A1838':'#0B4DB4'}
function save(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function side(){var b=d.querySelector('.collapse');if(!b)return;var mini=h.dataset.side==='mini';b.setAttribute('aria-expanded',String(!mini));b.setAttribute('aria-label',mini?'Expandir menu':'Recolher menu')}
if(innerWidth<600)d.querySelectorAll('details.filters').forEach(function(x){x.open=false});side();if(mq.addEventListener)mq.addEventListener('change',meta);
d.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-act]');if(!b)return;
if(b.dataset.act==='theme'){var t=dark()?'light':'dark';h.dataset.theme=t;save('rastro-theme',t);meta()}
else{if(h.dataset.side==='mini')delete h.dataset.side;else h.dataset.side='mini';save('rastro-side',h.dataset.side||'open');side()}})})()`;

// ---------- layout ----------
export function layout(ctx, title, body, { bare = false, refresh = 0 } = {}) {
  const shell = bare ? html`<main>${body}</main>` : ctx.share ? html`${shareBar(ctx)}<main>${body}</main>` : html`<a class="skip" href="#main">Pular para o conteúdo</a>${sidebar(ctx)}<div class="page"><main id="main" tabindex="-1">${body}</main></div>`;
  return html`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="same-origin"><meta name="theme-color" content="#0B4DB4"><script nonce="${ctx.nonce}">${raw(HEAD_JS)}</script>${refresh ? html`<meta http-equiv="refresh" content="${refresh}">` : ''}<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg">
<link rel="preload" href="/fonts/figtree.woff2" as="font" type="font/woff2" crossorigin><title>${title} · Rastro</title><style>${raw(CSS)}</style></head>
<body${bare ? raw(' class="bare"') : ''}>${shell}<script nonce="${ctx.nonce}">${raw(TIP_JS)};${raw(UI_JS)}</script></body></html>`;
}

const brand = (href, label = 'rastro') => html`<a class="brand" href="${href}"><span class="mark" aria-hidden="true">r</span><span>${label}</span></a>`;
const shareBar = ctx => html`<header class="sbar">${brand('?')}<strong>${ctx.site.name}</strong><span class="live">Relatório público · somente leitura</span></header>`;

const NAV = [
  { label: 'Visão', items: [['', 'Resumo', 'house'], ['/events', 'Eventos', 'activity', 'ao vivo']] },
  { label: 'Vendas', items: [['/campaigns', 'Campanhas', 'megaphone'], ['/orders', 'Pedidos', 'list']] },
  { label: 'Tráfego', items: [['/traffic', 'Visão geral', 'chart-column'], ['/realtime', 'Tempo real', 'radio'], ['/funnels', 'Funis', 'funnel'], ['/journeys', 'Caminhos', 'route'], ['/attribution', 'Atribuição', 'target']] },
  { label: 'Configurar', edit: true, items: [['/setup', 'Primeiros passos', 'route'], ['/integrations', 'Integrações', 'plug'], ['/settings', 'Configurações', 'settings']] },
];
const KEEP_PERIOD = new Set(['', '/campaigns', '/orders', '/traffic', '/funnels', '/journeys', '/attribution']);

const item = (href, text, ic, cur, badge) => html`<a class="it${cur ? ' on' : ''}" href="${href}"${cur ? raw(' aria-current="page"') : ''}>${icon(ic)}<span class="t">${text}</span>${badge ? html`<span class="cnt"><i></i>${badge}</span>` : ''}</a>`;

function sidebar(ctx) {
  const { user, site } = ctx;
  const keep = new URLSearchParams([...(ctx.q || [])].filter(([k]) => ['range', 'from', 'to', 'compare'].includes(k))).toString();
  const href = p => `/sites/${encodeURIComponent(site.id)}${p}${keep && KEEP_PERIOD.has(p) ? '?' + keep : ''}`;
  const groups = site ? NAV.filter(g => !g.edit || ctx.canEdit) : [];
  return html`<input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu de navegação">
<header class="mtop"><label for="nav-t" class="menu-btn" title="Menu">${icon('menu', 22)}</label>${brand('/')}${site ? html`<span class="site">${site.name}</span>` : ''}</header>
<aside class="side" id="side" aria-label="Barra lateral">
<label for="nav-t" class="side-x" title="Fechar menu">${icon('x', 22)}</label>
${brand('/')}
${site ? html`<details class="menu"><summary class="it" title="Trocar de site">${icon('layers')}<span class="t">${site.name}</span><span class="chev">${icon('chevron-right', 16)}</span></summary><div>${(ctx.sites || []).map(s => html`<a href="/sites/${encodeURIComponent(s.id)}">${s.name}</a>`)}${user?.role === 'admin' ? html`<a href="/sites">+ Novo site</a>` : ''}</div></details>
<nav aria-label="Seções do site">${groups.map(g => html`<p class="glabel">${g.label}</p>${g.items.map(([p, t, ic, badge]) => item(href(p), t, ic, ctx.tab === p, badge))}`)}</nav>` : ''}
<nav class="foot" aria-label="Conta">${user?.role === 'admin' ? html`${item('/sites', 'Sites', 'globe', ctx.tab === 'sites')}${item('/team', 'Equipe', 'users', ctx.tab === 'team')}` : ''}${user?.platform ? item('/agencies', 'Agências', 'layers', ctx.tab === 'agencies') : ''}
${user ? item('/account', 'Conta', 'user', ctx.tab === 'account') : ''}
<button type="button" class="it theme" data-act="theme"><span class="tl">${icon('moon')}</span><span class="td">${icon('sun')}</span><span class="t tl">Tema escuro</span><span class="t td">Tema claro</span></button>
${user ? html`<form method="post" action="/logout"><button class="it">${icon('log-out')}<span class="t">Sair</span></button></form>` : ''}</nav>
</aside><label for="nav-t" class="scrim" aria-hidden="true"></label>
<button type="button" class="collapse" data-act="side" aria-controls="side" aria-expanded="true" aria-label="Recolher menu">${icon('chevron-left', 16)}</button>`;
}

export const pageHead = (eyebrow, title, sub, aside = '') =>
  html`<div class="head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? html`<p class="sub">${sub}</p>` : ''}</div>${aside ? html`<div class="head-aside">${aside}</div>` : ''}</div>`;

// ---------- componentes ----------
/** Período sempre à vista; o resto (personalizado, comparação e `extra`) fica num details que fecha sozinho no celular. */
export function toolbar(ctx, p, f, { compare = true, filters = {}, label = x => x, extra = '' } = {}) {
  const q = ctx.q;
  const cmp = { prev: 'vs. anterior', year: 'vs. ano anterior', off: 'Sem comparação' };
  const span = (a, b) => a === b ? brDate(a) : `${brDate(a)} a ${brDate(b)}`;
  return html`<div class="toolbar">
<nav class="seg" aria-label="Período">${Object.entries(RANGES).map(([k, t]) => html`<a href="${link(q, { range: k, from: null, to: null })}"${on(p.range === k)}>${t}</a>`)}</nav>
<details class="filters" open><summary>${icon('filter', 16)}Filtros</summary><div>
<details class="pop"${p.range === 'custom' ? raw(' open') : ''}><summary>Personalizado</summary><form method="get">${hiddenInputs(q, ['range', 'from', 'to'])}<input type="hidden" name="range" value="custom">
<label class="sr" for="from">De</label><input type="date" id="from" name="from" value="${p.from}" required> <span class="muted" aria-hidden="true">até</span> <label class="sr" for="to">Até</label><input type="date" id="to" name="to" value="${p.to}" required><button>Aplicar</button></form></details>
${compare ? html`<nav class="seg" aria-label="Comparação">${Object.entries(cmp).map(([k, t]) => html`<a href="${link(q, { compare: k === 'prev' ? null : k })}"${on(p.compare === k)}>${t}</a>`)}</nav>` : ''}${extra}</div></details>
<span class="period">${span(p.from, p.to)}${p.prev && compare ? ` · vs ${span(p.prev.from, p.prev.to)}` : ''}</span></div>
${Object.keys(f).length ? html`<div class="chips" aria-label="Filtros ativos">${Object.entries(f).map(([k, v]) => html`<a class="chip" href="${link(q, { ['f_' + k]: null })}" aria-label="Remover filtro ${filters[k]}">${filters[k]}: <b>${label(k, v)}</b> ${icon('x', 14)}</a>`)}<a class="chip" href="${link(new URLSearchParams([...q].filter(([k]) => !k.startsWith('f_'))), {})}">Limpar</a></div>` : ''}`;
}

function delta(cur, prev, fmt, invert) {
  if (prev == null || cur == null || !prev) return '';
  const ch = (cur - prev) / Math.abs(prev);
  if (Math.abs(ch) < 0.005) return html`<span class="delta" title="Antes: ${fmt(prev)}">= 0%</span>`;
  const good = invert ? ch < 0 : ch > 0;
  return html`<span class="delta ${good ? 'good' : 'bad'}" title="Antes: ${fmt(prev)}">${ch > 0 ? '▲' : '▼'} ${pct(Math.abs(ch))} <span class="sr">${good ? '(melhora)' : '(piora)'}, antes ${fmt(prev)}</span></span>`;
}
/** Barrinhas decorativas do card de destaque (os números estão no gráfico e na tabela). */
const sparkBars = vals => {
  const v = vals.slice(-14), max = Math.max(1e-9, ...v.map(Math.abs));
  return html`<span class="spark" aria-hidden="true">${v.map(x => html`<i style="height:${Math.max(8, Math.abs(x) / max * 100).toFixed(0)}%"></i>`)}</span>`;
};
/** Indicador: kpi(id, rótulo, atual, anterior, formatador, { invert, feature, spark }) */
export const kpi = (id, t, cur, prev, fmt, { invert = false, feature = false, spark = null } = {}) =>
  html`<div class="kpi${feature ? ' feature' : ''}"><span class="lbl">${t}</span><b id="${id}">${fmt(cur)}</b>${delta(cur, prev, fmt, invert)}${spark?.length > 1 ? sparkBars(spark) : ''}</div>`;

/** Lista com barra de fundo proporcional; cada linha vira filtro quando `col` é passado. */
export function list(ctx, rows, col, { head = '', cols = [['Visitantes', 'v'], ['Views', 'n']], filter = true, label = (c, k) => k === '' ? '(vazio)' : k, prefix = 'f_', empty = 'Sem dados no período.' } = {}) {
  if (!rows?.length) return html`<p class="empty">${empty}</p>`;
  const max = Math.max(1e-9, ...rows.map(r => Math.abs(r[cols[0][1]] ?? 0)));
  return html`<div class="tw"><table class="list"><thead><tr><th scope="col">${head}</th>${cols.map(c => html`<th scope="col">${c[0]}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>
<td><span class="bar-bg" style="width:${(Math.abs(r[cols[0][1]] ?? 0) / max * 100).toFixed(1)}%"></span>${filter && col && ctx.q ? html`<a href="${link(ctx.q, { [prefix + col]: r.k })}" title="Filtrar por ${label(col, r.k)}">${label(col, r.k)}</a>` : html`<span style="position:relative">${label(col, r.k)}</span>`}</td>
${cols.map(([, key, fmt]) => html`<td>${fmt ? fmt(r[key]) : num(r[key])}</td>`)}</tr>`)}</tbody></table></div>`;
}

let tabSeq = 0;
export function tabs(title, panes) {
  if (panes.length === 1) return html`<section class="card"><h2>${title}</h2><div style="margin-top:12px">${panes[0][1]}</div></section>`;
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
  const r = Math.min(4, w / 2, y0 - y1);
  return `M${f1(x)},${y0}V${f1(y1 + r)}Q${f1(x)},${f1(y1)} ${f1(x + r)},${f1(y1)}H${f1(x + w - r)}Q${f1(x + w)},${f1(y1)} ${f1(x + w)},${f1(y1 + r)}V${y0}Z`;
};
const compact = n => Math.abs(n) >= 1000 ? new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : num(n);

/**
 * Barras (série principal) + linha opcional (segunda medida, mesma unidade) + tracejado do período anterior.
 * Tooltip por coluna e tabela acessível. Um único eixo y.
 */
export function chart(cur, prev, { label = 'Visitantes', color = 'var(--s1)', fmt = num, line = null, h = 240, tip = () => [], empty = 'Sem dados no período.' } = {}) {
  if (![...cur, ...(prev || [])].some(d => d.v || (line && d[line.key]))) return html`<div class="chart-empty" style="min-height:${Math.round(h * 0.75)}px">${icon('chart-column', 22)}<p>${empty}</p></div>`;
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
export function donut(items, { total, totalLabel, fmt = num, empty = 'Sem vendas aprovadas no período.' }) {
  const sum = items.reduce((s, x) => s + x.v, 0);
  if (!sum) return html`<p class="empty">${empty}</p>`;
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

export const notice = (text, err) => text ? html`<div class="notice${err ? ' err' : ''}" role="${err ? 'alert' : 'status'}">${err ? icon('triangle-alert') : ''}<div>${text}</div></div>` : '';
