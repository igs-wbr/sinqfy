// Base da interface: template com escape, formatação, design system "Rastro Azul" (docs/design-system.md), layout e componentes.
import { RANGES } from '../time.js';
import { iconSvg } from './icons.js';
import { NO_LOGIN } from '../auth.js';
import { enabled } from '../modules.js';
import { groupsOf } from '../clients.js';

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
export const countryName = c => { if (c === '??') return 'Desconhecido'; try { return regions.of(c); } catch { return c; } };
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

// ---------- design system (docs/design-system.md) ----------
// Tokens em :root; o escuro é uma tabela própria (não inversão), aplicada pelo sistema ou por data-theme.
// Séries s1 a s4 validadas com a skill dataviz nos dois modos (ver docs/design-system.md, Gráficos).
const DARK = `color-scheme:dark;--bg:#141415;--surface:#19191B;--surface2:#232325;--surface3:#2A2A2D;--line:#28282B;--line2:#353538;--field:#6A6A70;
--ink:#EDEDED;--ink2:#A1A1A6;--muted:#85858B;--side:#0F0F10;--side-ink:#EDEDED;--side-muted:#85858B;--side-hover:rgba(255,255,255,.04);--side-active:#232325;--side-line:#232325;--side-hl:inset 0 1px 0 rgba(255,255,255,.06);
--primary-hover:#1A62E0;--link:#8DB4F5;--ring:#8DB4F5;--info-bg:#1C2230;--bar:rgba(57,135,229,.16);--hover:rgba(255,255,255,.03);
--ok:#4CC38A;--ok-bg:#15291F;--bad:#FF8A80;--bad-bg:#2E1718;--warn:#E2B04A;--warn-bg:#2B2416;
--s1:#3987E5;--s2:#D95926;--s3:#199E70;--s4:#C98500;--shadow:0 12px 32px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.06);--edge:rgba(0,0,0,.55);--if-light:none;--if-dark:inline-flex`;

export const CSS = `@font-face{font-family:Figtree;src:url(/fonts/figtree.woff2) format("woff2");font-weight:300 900;font-display:swap}
@font-face{font-family:"Bricolage Grotesque";src:url(/fonts/bricolage-grotesque.woff2) format("woff2");font-weight:200 800;font-display:swap}
@font-face{font-family:"Space Grotesk";src:url(/fonts/space-grotesk.woff2) format("woff2");font-weight:300 700;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(/fonts/jetbrains-mono.woff2) format("woff2");font-weight:100 800;font-display:swap}
:root{color-scheme:light;--bg:#FAFAFA;--surface:#FFFFFF;--surface2:#F4F4F5;--surface3:#EBEBED;--line:#E8E8EA;--line2:#D8D8DC;--field:#8A8A90;
--ink:#171717;--ink2:#525252;--muted:#6B6B70;--side:#F4F4F5;--side-ink:#171717;--side-muted:#6B6B70;--side-hover:rgba(0,0,0,.04);--side-active:#FFFFFF;--side-line:#E8E8EA;--side-hl:0 0 0 1px #E8E8EA,0 1px 2px rgba(0,0,0,.05);
--primary:#0E58DB;--primary-hover:#0B4DB4;--link:#0E58DB;--ring:#0E58DB;--info-bg:#EEF3FD;--bar:rgba(14,88,219,.08);--hover:rgba(0,0,0,.03);
--ok:#0F7A55;--ok-bg:#E6F4EC;--bad:#C2372F;--bad-bg:#FBEBEA;--warn:#9A6200;--warn-bg:#FBF1DF;
--s1:#0E58DB;--s2:#E0602C;--s3:#13976A;--s4:#B97D00;--shadow:0 8px 24px rgba(0,0,0,.08);--edge:rgba(0,0,0,.12);--if-light:inline-flex;--if-dark:none;
--sw:248px;--ease:cubic-bezier(.22,1,.36,1);--spring:cubic-bezier(.34,1.4,.64,1);--d1:.12s;--d2:.24s;--d3:.4s;--display:"Bricolage Grotesque",Figtree,system-ui,sans-serif;--sans:Figtree,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
:root[data-theme=dark]{${DARK}}
:root[data-font=space]{--display:"Space Grotesk",Figtree,system-ui,sans-serif}
*{box-sizing:border-box}[hidden]{display:none!important}
html{background:var(--bg);-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%}
a,button,label,summary,input,select,textarea,[data-tip]{touch-action:manipulation}
body{margin:0;min-height:100vh;color:var(--ink);font:14px/1.5 var(--sans);font-variant-numeric:tabular-nums;background:var(--bg);-webkit-font-smoothing:antialiased}
a{color:inherit}main p a,.notice a{color:var(--link)}::selection{background:var(--primary);color:#fff}
:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.ic{flex:none;display:block}
.sr,.nav-t{position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.page{padding-left:var(--sw);transition:padding .32s var(--ease)}
main{max-width:1240px;margin:0 auto;padding:32px 32px 80px}
/* barra lateral */
.side{position:fixed;inset:0 auto 0 0;z-index:40;width:var(--sw);display:flex;flex-direction:column;gap:2px;padding:12px 12px 12px;background:var(--side);color:var(--side-ink);border-right:1px solid var(--side-line);overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--line2) transparent;transition:width .32s var(--ease),transform .32s var(--ease),visibility .32s}
.brand{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 8px;margin-bottom:4px;color:inherit;text-decoration:none;font:600 18px/1 var(--sans)}
.mark{width:28px;height:28px;flex:none}
.it{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:34px;padding:0 10px;border:0;border-radius:8px;background:none;color:var(--side-ink);text-decoration:none;font:500 14px/1.2 var(--sans);text-align:left;cursor:pointer;transition:background-color .12s}
.it .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (hover:hover){.it:hover{background:var(--side-hover)}}
.it .ic{color:var(--side-ink);opacity:.72}.it.on .ic{opacity:1}.it.on{background:var(--side-active);box-shadow:var(--side-hl)}.it.on .ic{color:var(--link)}
.cnt{display:inline-flex;align-items:center;gap:6px;color:var(--side-muted);font:400 12px/16px var(--sans)}
.cnt i{width:6px;height:6px;border-radius:50%;background:var(--ok)}
.glabel{margin:12px 10px 4px;font:600 12px/1 var(--sans);color:var(--side-muted)}
.tl{display:var(--if-light)}.td{display:var(--if-dark)}
.menu{position:relative;margin-bottom:6px}.menu summary{list-style:none;background:var(--side-active);box-shadow:var(--side-hl)}.menu summary::-webkit-details-marker{display:none}
.menu[open] summary .chev{transform:rotate(90deg)}.chev{transition:transform .3s var(--spring);opacity:.8}
.menu>div{display:grid;gap:2px;margin-top:6px;padding:4px;border-radius:8px;background:var(--surface);border:1px solid var(--line);max-height:50vh;overflow:auto}
.menu>div a{display:flex;align-items:center;min-height:36px;padding:0 10px;border-radius:8px;text-decoration:none;font-size:14px}.menu>div a:hover{background:var(--side-hover)}
.client-pick:not(:has(option[value="__new"]:checked)) .new-client{display:none}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:stretch}.plans>.card{display:flex;flex-direction:column;gap:12px}
.plans .price{font-size:40px;font-weight:700;line-height:1}.plans .price small{font-size:13px;font-weight:400;color:var(--muted);margin-left:6px}
.plans ul{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:8px;flex:1}.plans li::before{content:"✓";color:var(--ok);font-weight:700;margin-right:10px}
.plans .pro{background:var(--ink);color:var(--bg);border-color:var(--ink)}.plans .pro .muted,.plans .pro .price small{color:color-mix(in srgb,var(--bg) 65%,transparent)}
.plans form{display:grid;gap:8px}.plans .pro button,.plans .pro .btn{width:100%;justify-content:center}
.menu .sub>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:36px;padding:0 10px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;background:none;box-shadow:none}
.menu .sub>summary:hover{background:var(--surface2)}
.menu .sub>summary .chev{display:inline-flex;transform:none;transition:transform var(--d2) var(--ease)}.menu .sub[open]>summary .chev{transform:rotate(90deg)}
.menu .sub>a{padding-left:24px;color:var(--muted)}.menu>div a.on{color:var(--ink);font-weight:600;background:var(--surface2)}
.collapse{display:none;position:fixed;top:24px;left:calc(var(--sw) - 14px);z-index:45;width:28px;height:28px;padding:0;place-items:center;border-radius:50%;border:1px solid var(--line2);background:var(--surface);color:var(--muted);box-shadow:0 1px 2px rgba(0,0,0,.08);cursor:pointer;transition:left .32s var(--ease)}
.collapse::before{content:"";position:absolute;inset:-8px}.js .collapse{display:grid}.collapse .ic{transition:transform .4s var(--spring)}[data-side=mini] .collapse .ic{transform:rotate(180deg)}
.theme{display:none}.js .theme{display:flex}
.mtop,.side-x,.scrim,.tabbar{display:none}
@media (min-width:900px){
[data-side=mini]{--sw:72px}
[data-side=mini] .side{padding-left:12px;padding-right:12px}
@media (min-height:960px){[data-side=mini] .side{overflow:visible}}
[data-side=mini] .brand{justify-content:center;padding:0}[data-side=mini] .brand>span:last-child,[data-side=mini] .cnt,[data-side=mini] .chev{display:none}
[data-side=mini] .glabel{height:1px;margin:10px 8px;overflow:hidden;color:transparent;background:var(--side-line)}
[data-side=mini] .side .it{justify-content:center;padding:0}
[data-side=mini] .side .it .t{position:absolute;left:calc(100% + 14px);top:50%;transform:translateY(-50%);flex:none;padding:6px 10px;border-radius:8px;background:var(--ink);color:var(--surface);font:600 13px/1.2 var(--sans);opacity:0;pointer-events:none;z-index:50;box-shadow:var(--shadow)}
[data-side=mini] .side .it:hover .t,[data-side=mini] .side .it:focus-visible .t{opacity:1}
[data-side=mini] .menu>div{position:absolute;left:calc(100% + 14px);top:0;width:240px;background:var(--surface);color:var(--ink);border:1px solid var(--line);box-shadow:var(--shadow);z-index:50}
[data-side=mini] .menu>div a:hover{background:var(--surface2)}[data-side=mini] .menu>div :focus-visible{outline-color:var(--ring)}
[data-side=mini] .menu[open] .it .t{opacity:0}
}
@media (max-width:899px){
.page{padding-left:0}
.mtop{display:flex;position:sticky;top:0;z-index:30;align-items:center;gap:8px;min-height:calc(56px + env(safe-area-inset-top));padding:env(safe-area-inset-top) max(12px,env(safe-area-inset-right)) 0 max(12px,env(safe-area-inset-left));background:color-mix(in srgb,var(--side) 88%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.5);backdrop-filter:blur(16px) saturate(1.5);color:var(--side-ink);border-bottom:1px solid var(--side-line);-webkit-user-select:none;user-select:none}
.mtop .brand{margin:0}.mtop .site{margin-left:auto;font-weight:600;max-width:50vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px}
.menu-btn{display:grid;place-items:center;width:44px;height:44px;border-radius:8px;cursor:pointer}.menu-btn:hover{background:var(--side-hover)}
.nav-t:focus-visible~.mtop .menu-btn{outline:2px solid var(--ring);outline-offset:-2px}
.side{width:min(300px,86vw);padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(12px + env(safe-area-inset-bottom));padding-left:max(12px,env(safe-area-inset-left));transform:translateX(-100%);visibility:hidden;box-shadow:var(--shadow);overscroll-behavior:contain;touch-action:pan-y}
.nav-t:checked~.side{transform:none;visibility:visible}
.scrim{display:block;position:fixed;inset:0;z-index:35;background:rgba(0,0,0,.4);opacity:0;pointer-events:none;transition:opacity var(--d3) var(--ease);touch-action:none}.nav-t:checked~.scrim{opacity:1;pointer-events:auto}
.side-x{display:grid;place-items:center;position:absolute;top:calc(12px + env(safe-area-inset-top));right:12px;width:44px;height:44px;border-radius:8px;cursor:pointer}
.collapse,.js .collapse{display:none}
main{padding:20px max(16px,env(safe-area-inset-right)) calc(64px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
body:has(.tabbar) main{padding-bottom:calc(96px + env(safe-area-inset-bottom))}body:has(.tabbar) .menu-btn{display:none}
/* barra de abas inferior (alcance do polegar), com o fundo da aba ativa que desliza entre páginas */
.tabbar{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;position:fixed;left:0;right:0;bottom:0;z-index:30;padding:6px max(6px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(6px,env(safe-area-inset-left));background:color-mix(in srgb,var(--side) 86%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.5);backdrop-filter:blur(16px) saturate(1.5);border-top:1px solid var(--side-line);transition:transform var(--d2) var(--ease);view-transition-name:tabbar;-webkit-user-select:none;user-select:none}
.tabbar a,.tabbar label{display:grid;justify-items:center;align-content:center;gap:4px;min-height:52px;color:var(--side-muted);font:600 11px/1 var(--sans);text-decoration:none;cursor:pointer;-webkit-touch-callout:none}
.tabbar .ti{display:grid;place-items:center;width:56px;height:30px;border-radius:15px;transition:background-color var(--d2),transform var(--d1) var(--ease)}
.tabbar .on{color:var(--ink)}.tabbar .on .ti{background:color-mix(in srgb,var(--primary) 16%,transparent);color:var(--link);view-transition-name:tab-on}
.tabbar :active>.ti{transform:scale(.9)}
body:has(:is(input:not([type=checkbox]):not([type=radio]),textarea,select):focus) .tabbar{transform:translateY(110%)}
html input,html select,html textarea{font-size:16px}
}
@media (pointer:coarse){.it,.menu>div a{min-height:44px}.seg a,.tabs>label{min-height:40px}
.it:active,.menu>div a:active,.convo:active,.seg a:active,.tabs>label:active,.chip:active,.live:active{background:var(--hover);transition:none}
.hero .kpi:active{transform:scale(.985)}.prof>summary:active{transform:scale(.92)}}
.board,.tw,.seg,.thread,.feed{overscroll-behavior-x:contain}
@media (display-mode:standalone){html{overscroll-behavior-y:contain}}
/* puxar para atualizar (app instalado) e aviso sem conexão */
.ptr{position:fixed;left:50%;top:calc(8px + env(safe-area-inset-top));z-index:60;display:grid;place-items:center;width:40px;height:40px;margin-left:-20px;border-radius:50%;background:var(--surface);color:var(--link);box-shadow:var(--shadow);opacity:0;transform:translateY(-56px);pointer-events:none}
.ptr.go{transition:transform var(--d2) var(--ease),opacity var(--d2)}.ptr.spin svg{animation:fx-spin .8s linear infinite}@keyframes fx-spin{to{transform:rotate(360deg)}}
.offline body::after{content:"Sem conexão. Os números podem estar desatualizados.";position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:60;padding:12px 16px;border-radius:12px;background:var(--ink);color:var(--surface);font:500 13px/1.4 var(--sans);text-align:center;box-shadow:var(--shadow);animation:fx-pop var(--d2) var(--ease)}
@media (min-width:900px){.offline body::after{left:auto;right:24px;bottom:24px;max-width:360px}}
/* barra do link público */
.sbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:12px 24px;background:var(--side);color:var(--side-ink);border-bottom:1px solid var(--side-line)}.sbar .brand{margin:0}.sbar .live{margin-left:auto}
/* cabeçalho de página */
.head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px 24px;margin:4px 0 24px}
.head-aside{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
h1{font:600 40px/1.08 var(--display);letter-spacing:-.03em;margin:0;text-wrap:balance}h1 em{font-style:normal;color:var(--link)}
.sub{color:var(--ink2);font-size:15px;margin:8px 0 0;max-width:72ch}
h2{font:500 16px/1.3 var(--sans);margin:0}
h3{font:500 13px/1.2 var(--sans);color:var(--muted);margin:24px 0 8px}
@media (max-width:899px){h1{font-size:28px}}
/* filtros */
.toolbar{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin-bottom:16px}
.seg{display:inline-flex;max-width:100%;overflow-x:auto;scrollbar-width:none;gap:2px;padding:3px;border:1px solid var(--line);border-radius:8px}.seg::-webkit-scrollbar{display:none}
.seg a:focus-visible{outline-offset:-2px}
/* sombra de rolagem: aparece só na borda onde ainda há conteúdo */
.seg,.tw{background:linear-gradient(to right,var(--surface) 30%,transparent) left/32px 100% no-repeat local,linear-gradient(to left,var(--surface) 30%,transparent) right/32px 100% no-repeat local,radial-gradient(farthest-side at 0 50%,var(--edge),transparent) left/12px 100% no-repeat scroll,radial-gradient(farthest-side at 100% 50%,var(--edge),transparent) right/12px 100% no-repeat scroll;background-color:var(--surface)}
.filters>summary{list-style:none;display:none;align-items:center;gap:6px;min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink2);font:500 13px/1 var(--sans);cursor:pointer}.filters>summary::-webkit-details-marker{display:none}
.filters>div{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center}
@media (max-width:599px){.filters{flex-basis:100%}.filters>summary{display:inline-flex}.filters[open]>summary{margin-bottom:8px}}
.seg a{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border:1px solid transparent;border-radius:8px;color:var(--muted);text-decoration:none;font:500 13px/1 var(--sans);white-space:nowrap}
@media (hover:hover){.seg a:hover{color:var(--ink);background:var(--hover)}}
.seg a.on{background:var(--surface2);border-color:var(--line2);color:var(--ink);font-weight:600}
.pop{position:relative}.pop summary{list-style:none;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink2);font:500 13px/1 var(--sans);cursor:pointer}.pop summary::-webkit-details-marker{display:none}
.pop[open] summary{border-color:var(--line2);color:var(--ink)}.pop form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
.period{color:var(--muted);font:500 12px var(--sans)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.chip{display:inline-flex;gap:6px;align-items:center;min-height:32px;padding:0 12px;border:1px solid var(--line2);border-radius:6px;background:var(--surface);color:var(--ink2);text-decoration:none;font-size:13px}.chip b{color:var(--ink);font-weight:500}
/* KPIs */
.hero,.kpis{display:grid;gap:16px;margin-bottom:16px}
.hero{grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))}@media (min-width:1100px){.hero>.feature{grid-column:span 2}}
.kpis{grid-template-columns:repeat(auto-fill,minmax(min(176px,100%),1fr));gap:1px;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;min-width:0;display:flex;flex-direction:column;align-items:flex-start}
.kpi b{display:block;font:600 28px/1.1 var(--display);letter-spacing:-.02em;margin:8px 0;overflow-wrap:anywhere}.kpi b .int{white-space:nowrap}.kpi b small{font-size:.52em;font-weight:500;letter-spacing:0;opacity:.6}.kpi b small.u:first-child{margin-right:.2em}
.kpis .kpi{padding:16px;border:0;border-radius:0;box-shadow:-1px -1px 0 var(--line)}.kpis .kpi b{font:600 20px/1.2 var(--display);margin:4px 0}
.kpi.feature b{font-size:44px;line-height:1;letter-spacing:-.02em;margin:12px 0}
.lbl{display:block;font:400 12px/1.3 var(--sans);color:var(--muted)}
.delta{display:inline-flex;align-items:center;gap:4px;margin-top:auto;padding:2px 8px;border-radius:999px;background:var(--surface2);color:var(--muted);font:500 12px/16px var(--sans)}
.delta.good{color:var(--ok);background:var(--ok-bg)}.delta.bad{color:var(--bad);background:var(--bad-bg)}
/* cartões */
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 24px;min-width:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:16px;margin-top:16px}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.between{justify-content:space-between}.stack{display:grid;gap:14px}
@media (max-width:899px){.card{padding:16px}}
@media (max-width:600px){.hero,.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.hero{gap:12px}.hero .feature{grid-column:1/-1}.hero>.kpi:last-child:nth-child(even),.kpis>.kpi:last-child:nth-child(odd){grid-column:1/-1}.hero .kpi:not(.feature) b{font-size:30px}.kpi{padding:14px 16px}}
.events time{white-space:nowrap}
/* gráficos */
.legend{display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font:400 12px var(--sans);margin:12px 0 8px}.legend span{display:inline-flex;gap:7px;align-items:center}
.sw{width:10px;height:10px;border-radius:3px;display:inline-block;flex:none}.sw.line{height:0;width:18px;border-radius:0;border-top:2px solid}.sw.dash{height:0;width:18px;border-radius:0;border-top:2px dashed var(--muted)}
svg:not(.ic):not(.mark){display:block;width:100%;height:auto}svg text{fill:var(--muted);font:500 11px var(--sans)}
.gl{stroke:var(--line)}.bl{stroke:var(--line2)}.hit{fill:transparent}.col:hover .hit{fill:var(--bar)}.prevl{fill:none;stroke:var(--muted);stroke-width:2;stroke-dasharray:5 4}.serl{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart-empty{display:grid;place-items:center;align-content:center;gap:10px;margin-top:12px;padding:24px;border:1px dashed var(--line2);border-radius:14px;color:var(--muted);text-align:center}.chart-empty .ic{color:var(--muted)}.chart-empty p{margin:0;max-width:46ch}
.empty a{color:var(--link)}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:14px}
.tip{position:fixed;z-index:95;pointer-events:none;background:var(--ink);color:var(--surface);border-radius:8px;padding:8px 12px;font:500 12px/1.5 var(--sans);max-width:340px;box-shadow:var(--shadow);background:color-mix(in srgb,var(--ink) 88%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}.tip .t{font:600 13px/1.4 var(--sans);margin-bottom:2px}
.share{list-style:none;margin:0;padding:0;display:grid;gap:14px}.share li{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:baseline}.share b{font-weight:500}.share small{color:var(--muted);font-size:12px;margin-left:6px}.share .v{font-weight:600}
.share .tr{grid-column:1/-1;height:8px;border-radius:6px;background:var(--surface3);overflow:hidden}.share .tr i{display:block;height:100%;border-radius:6px;background:var(--s1);transform-origin:left}
/* abas dentro de cartões */
.tabs{display:flex;flex-wrap:wrap;align-items:center;gap:2px}.tabs h2{margin-right:auto;padding-right:8px}.tabs>input{position:absolute;opacity:0;pointer-events:none}
.tabs>label{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border-radius:8px;cursor:pointer;color:var(--muted);font:500 13px/1 var(--sans)}
@media (hover:hover){.tabs>label:hover{color:var(--ink);background:var(--hover)}}
.tabs>input:checked+label{background:var(--surface2);color:var(--ink);font-weight:600;box-shadow:inset 0 0 0 1px var(--line)}.tabs>input:focus-visible+label{outline:2px solid var(--ring);outline-offset:2px}
.pane{display:none;flex-basis:100%;margin-top:12px}${[1, 2, 3, 4, 5].map(i => `.tabs>input:nth-of-type(${i}):checked~.pane:nth-of-type(${i})`).join(',')}{display:block}
.pop form.stack{display:grid}.pop>summary::after{content:"";display:inline-block;width:6px;height:6px;margin-left:8px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(45deg) translateY(-2px);transition:transform .12s}.pop[open]>summary::after{transform:rotate(225deg)}
pre{font-variant-ligatures:none}pre.code{white-space:pre;word-break:normal;max-height:420px;overflow:auto}
table.txt th,table.txt td{text-align:left}table.txt .num{text-align:right}table.txt td:first-child{white-space:nowrap}
.grid>.card.full{grid-column:1/-1}.platform pre{border:0;background:var(--surface)}
.progress{height:8px;border-radius:6px;background:var(--surface3);overflow:hidden;margin:4px 0 18px}.progress i{display:block;height:100%;background:var(--primary);border-radius:6px;transition:width .16s}
.steps-list{display:grid;gap:12px}.step>summary{display:flex;align-items:center;gap:14px;list-style:none;cursor:pointer;min-height:44px}.step>summary::-webkit-details-marker{display:none}
.step .num{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line2);font:600 14px/1 var(--sans);color:var(--ink2)}
.step.ok .num{background:var(--ok-bg);border-color:transparent;color:var(--ok)}.step .st{display:grid;gap:2px}.step .st small{color:var(--muted);font-size:13px}.step.ok .st small{color:var(--ok)}
.step>.body{margin-top:14px;padding-top:14px;border-top:1px solid var(--line);display:grid;gap:10px}.step>.body>p{margin:0}
.setup-checks{list-style:none;margin:0;padding:0;display:grid;gap:6px}.setup-checks li{display:flex;align-items:center;gap:8px;color:var(--bad)}.setup-checks li.ok{color:var(--ok)}
.step>.body>.btn,.step>.body>a.btn{justify-self:start}.step>.body>p.okline{display:flex;gap:8px;align-items:center;color:var(--ok)}.step>summary{border-radius:8px}
.notice code{overflow-wrap:anywhere}.notice>div{min-width:0}
/* CRM: quadro, cards, ficha e colunas */
.board{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 12px;align-items:stretch;scroll-snap-type:x proximity;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
@property --fl{syntax:"<length>";inherits:false;initial-value:0px}@property --fr{syntax:"<length>";inherits:false;initial-value:0px}
@keyframes bfade{0%{--fl:0px;--fr:56px}6%,94%{--fl:56px;--fr:56px}100%{--fl:56px;--fr:0px}}
@supports (animation-timeline:scroll()){.board{-webkit-mask-image:linear-gradient(to right,transparent,#000 var(--fl),#000 calc(100% - var(--fr)),transparent);mask-image:linear-gradient(to right,transparent,#000 var(--fl),#000 calc(100% - var(--fr)),transparent);animation:bfade linear both;animation-timeline:scroll(self inline)}}
.board>.col{flex:0 0 280px;display:flex;flex-direction:column;background:var(--surface2);border:1px solid var(--line);border-radius:16px;padding:8px;scroll-snap-align:start;transition:background-color .12s,border-color .12s}
.board>.col.over{background:var(--info-bg);border:1px dashed var(--ring)}
.col>header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:6px 6px 10px}.col>header h2{font:600 14px/1.3 var(--sans);margin:0}
.cnt-n{min-width:24px;padding:1px 8px;border-radius:6px;background:var(--surface3);color:var(--ink2);font:500 12px/1.5 var(--sans);text-align:center}
.col>header .ctags{flex-basis:100%;display:flex;flex-wrap:wrap;gap:4px}.col>header .tag{margin:0}
.cards{display:grid;align-content:start;gap:8px;flex:1;min-height:96px}
.kcard{position:relative;display:grid;gap:8px;padding:12px;background:var(--surface);border:1px solid var(--line);border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
@media (hover:hover){.kcard:hover{border-color:var(--line2)}}
.kcard[draggable=true]{cursor:grab}.kcard[draggable=true]:active{cursor:grabbing}.kcard.dragging{opacity:.45}.kcard:focus-within{border-color:var(--ring)}
.kh{display:flex;gap:8px;align-items:flex-start}.kh a{flex:1;min-width:0;color:var(--ink);text-decoration:none;font-weight:600;line-height:1.35;overflow-wrap:anywhere}.kh a:hover{color:var(--link);text-decoration:underline}.kh .grip{color:var(--muted);margin-top:1px}
.kcard .meta{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;font-size:13px;color:var(--muted)}.kcard .meta .tag{margin:0}.kcard .val{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}.kcard .age{margin-left:auto;font:400 12px var(--mono)}
.kcard .mv{display:flex;gap:6px;padding-top:8px;border-top:1px solid var(--line)}.kcard .mv select{flex:1;min-width:0;min-height:36px;padding:4px 8px;font-size:13px}.kcard .mv button{min-height:36px;padding:0 12px;font-size:13px}
@media (hover:hover) and (pointer:fine){.js .kcard:not(:focus-within) .mv{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);padding:0;border:0}}
.cards .empty{display:grid;place-items:center;min-height:88px;padding:12px;border:1px dashed var(--line2);border-radius:8px;font-size:13px;text-align:center}.cards:has(.kcard) .empty{display:none}
.newlead>summary{list-style:none;display:inline-flex;align-items:center;gap:6px}.newlead>summary::-webkit-details-marker{display:none}.newlead[open]>.card{margin-top:10px;max-width:760px}
@media (max-width:899px){.board{scroll-snap-type:x mandatory;margin:0 -16px;padding:2px 16px 12px;scroll-padding:0 16px}.board>.col{flex-basis:min(84vw,300px)}}
.kv{display:grid;grid-template-columns:minmax(96px,auto) 1fr;gap:10px 16px;margin:14px 0 0}.kv dt{color:var(--muted);font:400 12px/1.7 var(--sans)}.kv dd{margin:0;word-break:break-word}
.record{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:16px;align-items:start}.record>.stack{gap:16px}@media (max-width:899px){.record{grid-template-columns:1fr}}
.record form.row{align-items:flex-end}.record form.row label.f{flex:1 1 160px;min-width:0}.record label.f select,.record label.f input{width:100%;min-width:0}
.timeline{max-height:none}.feed.timeline li{grid-template-columns:140px 1fr}.timeline time{white-space:nowrap}@media (max-width:480px){.feed.timeline li{grid-template-columns:1fr;gap:2px}}
.search{position:relative;flex:1;max-width:440px}.search .ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}.search input{width:100%;padding-left:38px}
.stages input,.stages select{width:100%;min-width:150px}.stages td.nm input{min-width:180px}.stages input.ord{width:72px;min-width:72px}.stages td.ac{white-space:nowrap}
@media (max-width:719px){.stages thead{display:none}.stages tbody tr{display:grid;grid-template-columns:88px 1fr;gap:10px 12px;padding:14px 0;border-top:1px solid var(--line)}.stages tbody tr:first-child{border-top:0}
.stages td{padding:0;border:0;text-align:left!important}.stages td::before{content:attr(data-label);display:block;margin-bottom:4px;color:var(--muted);font:400 12px/1.3 var(--sans)}
.stages td.nm,.stages td.ev,.stages td.kd{grid-column:2}.stages td.ps{grid-row:1/3}.stages td.ct,.stages td.ac{align-self:end}}
/* WhatsApp: caixa de entrada, conversa e sugestão */
.inbox-card{padding:8px}.inbox{list-style:none;margin:0;padding:0}.inbox li+li{border-top:1px solid var(--line)}
.convo{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:2px 12px;align-items:center;padding:12px;border-radius:8px;text-decoration:none;color:var(--ink)}
@media (hover:hover){.convo:hover{background:var(--hover)}}
.ava{grid-row:1/3;width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:var(--surface3);color:var(--ink2);font:500 14px/1 var(--sans)}
.convo .who{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0}.convo .who b{font-weight:600}.convo .who .tag{margin:0}
.convo time{align-self:start;color:var(--muted);font:400 12px var(--mono);white-space:nowrap}
.convo .prev{grid-column:2/4;color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.convo .prev b{color:var(--ink2);font-weight:600}
.tag.sug{color:var(--link);background:var(--info-bg);border-color:transparent}
.suggest{display:flex;gap:12px;align-items:flex-start;padding:16px;margin-bottom:16px;border:1px solid var(--line2);border-radius:16px;background:var(--info-bg)}.suggest>.ic{color:var(--link);margin-top:2px}.suggest p{margin:0 0 10px}
.chat{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,320px);gap:16px;align-items:start}@media (max-width:899px){.chat{grid-template-columns:1fr}}
.thread{list-style:none;margin:12px 0 0;padding:4px 2px;display:flex;flex-direction:column;gap:6px;max-height:65vh;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
.thread .day{align-self:center;margin:10px 0 4px;padding:2px 10px;border-radius:6px;background:var(--surface2);color:var(--muted);font:400 12px/1.6 var(--sans)}
@media (max-width:719px){.tw:has(>table.mcards){overflow:visible}table.mcards thead{display:none}table.mcards,table.mcards tbody,table.mcards tfoot{display:block;width:100%}table.mcards tr{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px 16px;padding:14px 2px;border-top:1px solid var(--line)}table.mcards tbody tr:first-child{border-top:0}table.mcards td,table.mcards th{display:block;padding:0;border:0;text-align:left!important;white-space:normal!important;min-width:0!important;max-width:none!important;overflow-wrap:anywhere}table.mcards [data-label]::before{content:attr(data-label);display:block;color:var(--muted);font:400 11px/1.5 var(--sans)}table.mcards .c-main,table.mcards td:not([data-label]):not(:empty){grid-column:1/-1}table.mcards td:empty,table.mcards th:empty{display:none}table.mcards tfoot tr{background:var(--surface2);border-radius:10px;padding:12px}table.mcards .bar-bg{display:none}}
@media (max-width:719px){.rows-sm thead{display:none}.rows-sm,.rows-sm tbody,.rows-sm tr,.rows-sm td{display:block}.rows-sm tr{padding:12px 0;border-top:1px solid var(--line)}.rows-sm tbody tr:first-child{border-top:0}.rows-sm td{padding:4px 0;border:0;text-align:left!important;white-space:normal!important}.rows-sm td[data-label]::before{content:attr(data-label);display:block;color:var(--muted);font:400 12px/1.6 var(--sans)}.rows-sm code{overflow-wrap:anywhere}}
.msg{position:relative;align-self:flex-start;max-width:min(78%,520px);padding:8px 12px 6px;border-radius:16px 16px 16px 4px;background:var(--surface2);border:1px solid var(--line);white-space:pre-wrap;word-break:break-word;line-height:1.45}
.msg.out{align-self:flex-end;border-radius:16px 16px 4px 16px;background:var(--primary);border-color:var(--primary);color:#fff}
.msg time{display:block;margin-top:2px;text-align:right;font:400 11px var(--mono);color:var(--muted)}.msg.out time{color:rgba(255,255,255,.85)}
.steps{margin:10px 0 12px;padding-left:20px;display:grid;gap:6px;color:var(--ink2)}textarea{font:500 13px/1.5 var(--mono)}
.tag.ok{color:var(--ok);background:var(--ok-bg);border-color:transparent}.tag.bad{color:var(--bad);background:var(--bad-bg);border-color:transparent}.tag.warn{color:var(--warn);background:var(--warn-bg);border-color:transparent}
details.dl{display:inline-block}details.dl>summary{list-style:none;cursor:pointer}details.dl>summary::-webkit-details-marker{display:none}details.dl[open]>div{margin-top:6px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface2);font-size:12px;max-width:360px;white-space:normal}
.tag{display:inline-block;font:400 12px/1 var(--mono);padding:4px 6px;margin:2px 4px 2px 0;border:1px solid var(--line);border-radius:6px;background:var(--surface2);color:var(--ink2)}
/* tabelas */
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.4;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--muted);font:400 12px/1.2 var(--sans);padding:10px 12px;background:var(--surface2);white-space:nowrap}
thead th:first-child{border-radius:10px 0 0 10px}thead th:last-child{border-radius:0 10px 10px 0}
th+th,td+td{text-align:right;white-space:nowrap}
td{padding:12px;border-top:1px solid var(--line)}tbody tr:first-child td{border-top:0}
@media (hover:hover){tbody tr:hover td{background:var(--hover)}}
tfoot th{background:none;border-top:1px solid var(--line2);color:var(--ink);font:600 13px var(--sans);text-transform:none;letter-spacing:0}
.list td:first-child{position:relative;word-break:break-word}.list td:first-child a{text-decoration:none;position:relative}.list td:first-child a:hover{color:var(--link);text-decoration:underline}.list td+td{width:1%}
.bar-bg{position:absolute;left:12px;bottom:5px;height:3px;max-width:calc(100% - 24px);border-radius:2px;background:var(--s1);opacity:.35}
td small,.events small{color:var(--muted)}.left th,.left td{text-align:left;white-space:normal}.left td+td{width:auto}.left td{vertical-align:top}
.neg{color:var(--bad)}.pos{color:var(--ok)}.muted{color:var(--muted)}.empty{color:var(--muted);padding:16px 0;margin:0}
.badge{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:6px;font:400 12px/1.4 var(--sans);background:var(--surface2);color:var(--ink2);white-space:nowrap}
.st-paid,.st-ACTIVE{background:var(--ok-bg);color:var(--ok)}.st-pending{background:var(--warn-bg);color:var(--warn)}.st-refunded{background:var(--surface3);color:var(--ink2)}.st-chargeback,.st-refused{background:var(--bad-bg);color:var(--bad)}.st-paused{background:var(--surface2);color:var(--muted)}
/* funil, caminhos, feed */
.funnel .step{display:grid;grid-template-columns:32px 1fr auto;gap:8px 14px;align-items:center;padding:14px 0;border-top:1px solid var(--line)}.funnel .step:first-child{border-top:0}
.funnel .n{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;font:600 12px var(--sans);background:var(--surface2);border:1px solid var(--line2);color:var(--ink2)}
.funnel .track{grid-column:2/4;height:10px;border-radius:6px;background:var(--surface3);overflow:hidden}.funnel .fill{height:100%;border-radius:6px;background:var(--s1)}.funnel .meta{color:var(--muted);font:12px var(--sans);text-align:right}.funnel .meta b{color:var(--ink)}
.heatwrap{display:grid;grid-template-columns:auto minmax(0,1fr);gap:20px;align-items:start;margin-top:12px}@media (max-width:719px){.heatwrap{grid-template-columns:1fr}table.list.mcards td{width:auto}}
.heat{position:relative;margin:0 auto;border:1px solid var(--line2);border-radius:12px;background:repeating-linear-gradient(180deg,var(--surface2) 0 18px,transparent 18px 30px);overflow:hidden}.heat.phone{width:200px;aspect-ratio:9/19}.heat.desk{width:320px;max-width:100%;aspect-ratio:4/5}
.heat i{position:absolute;width:5%;height:2%;border-radius:2px;background:var(--s2)}.heat hr{position:absolute;left:0;right:0;margin:0;border:0;border-top:1px dashed var(--field)}.heat .q{position:absolute;right:6px;transform:translateY(-120%);font:11px var(--sans);color:var(--muted);background:var(--surface);padding:0 4px;border-radius:4px}
.scroll{overflow-x:auto}.node{fill:var(--surface2);stroke:var(--line2)}.node.other{opacity:.6}.lnk{fill:var(--s1);opacity:.16}.lnk:hover{opacity:.38}.sankey text{fill:var(--ink);font:500 12px var(--sans)}.sankey text.c{fill:var(--muted);font:500 11px var(--sans)}
.feed{list-style:none;margin:0;padding:0;max-height:540px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}.feed li{display:grid;grid-template-columns:72px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--line)}.feed li:first-child{border-top:0}.feed time{color:var(--muted);font:12px var(--mono)}.feed .ev{display:inline-flex;align-items:center;gap:6px;color:var(--ink);font-weight:500}.feed small{color:var(--muted);display:block;font-size:12px}
.live{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);font:400 13px var(--sans);color:var(--ink2);text-decoration:none}a.live:hover{border-color:var(--line2);color:var(--ink)}
.live i{width:8px;height:8px;border-radius:50%;background:var(--ok)}

/* formulários */
form.stack{max-width:480px}label.f{display:grid;gap:6px;font:400 12px/1.3 var(--sans);color:var(--muted)}label.f>span{text-transform:none;letter-spacing:0;font:400 13px var(--sans)}
input,select,textarea{font:14px var(--sans);color:var(--ink);background:var(--surface);border:1px solid var(--field);border-radius:8px;min-height:40px;padding:8px 12px;max-width:100%;text-transform:none;letter-spacing:0}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--ring);box-shadow:0 0 0 3px var(--bar),inset 0 0 0 1px var(--ring)}
textarea{min-height:120px;font:13px var(--mono);width:100%}input[type=checkbox]{min-height:0;width:18px;height:18px;padding:0;accent-color:var(--primary)}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 16px;border:1px solid var(--line2);border-radius:8px;background:var(--surface);color:var(--ink);font:500 14px/1 var(--sans);text-decoration:none;cursor:pointer;transition:background-color .12s,border-color .12s,transform .12s}
@media (hover:hover){button:hover,.btn:hover{background:var(--surface2);border-color:var(--field)}}
button:active,.btn:active{transform:scale(.98)}
.primary,button.primary{background:var(--primary);border-color:var(--primary);color:#fff}@media (hover:hover){.primary:hover,button.primary:hover{background:var(--primary-hover);border-color:var(--primary-hover)}}
.danger,button.danger{color:var(--bad);border-color:var(--bad)}@media (hover:hover){.danger:hover,button.danger:hover{background:var(--bad-bg);border-color:var(--bad)}}
.link,button.link{border-color:transparent;background:none;padding:0 8px;color:var(--ink2)}@media (hover:hover){.link:hover,button.link:hover{background:var(--hover);border-color:transparent;color:var(--ink)}}
.link.danger{color:var(--bad);border-color:transparent}
.notice{display:flex;gap:10px;align-items:flex-start;padding:14px 16px;border-radius:14px;background:var(--info-bg);color:var(--ink);margin-bottom:16px}.notice>.ic{margin-top:1px}.notice.err{background:var(--bad-bg)}.notice.err>.ic{color:var(--bad)}.notice pre{margin-bottom:0}
pre{background:var(--surface2);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow-x:auto;font:13px/1.6 var(--mono);white-space:pre-wrap;word-break:break-word;margin:8px 0}code{font-family:var(--mono);font-size:.92em;color:var(--ink2)}pre code{color:var(--ink)}
.checks{display:flex;flex-wrap:wrap;gap:6px 16px}.checks label{display:inline-flex;gap:8px;align-items:center;min-height:32px;font-size:13px}
.member{display:grid;gap:10px;padding:16px 0;border-top:1px solid var(--line)}.member:first-of-type{border-top:0}
details.data summary{cursor:pointer;display:inline-flex;align-items:center;min-height:32px;color:var(--muted);font:400 12px var(--sans);margin-top:6px}
.platforms{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px}.platform{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--surface2)}.platform pre{background:var(--surface)}
.pick .sr{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}.pick .pane,.pick summary .opt{display:none}.pick .pane{margin-top:12px;flex-direction:column}
.pick details{position:relative;max-width:420px}.pick summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface2);cursor:pointer;font-weight:600}
.pick summary::-webkit-details-marker{display:none}.pick summary .chev{transition:transform var(--d2) var(--ease)}.pick details[open] summary .chev{transform:rotate(90deg)}
.pick .opt{display:flex;align-items:center;gap:10px}.pick [role=listbox]{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 6px);display:grid;gap:2px;padding:4px;border:1px solid var(--line);border-radius:10px;background:var(--surface);box-shadow:var(--shadow);max-height:60vh;overflow:auto}
.pick [role=listbox] .opt{min-height:40px;padding:0 10px;border-radius:8px;cursor:pointer;font-size:14px}.pick [role=listbox] .opt:hover{background:var(--surface2)}
.pick:has(.sr:focus-visible) summary{outline:2px solid var(--ring);outline-offset:2px}
.mono{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:5px;color:var(--surface);font-size:11px;font-weight:700;line-height:1;flex:none}
/* páginas sem barra (login, convite) */
body.bare{background:var(--bg)}
.auth{max-width:440px;margin:0 auto;padding:12vh 16px 40px}.auth>.brand{margin:0 0 20px;padding:0}.bare main{padding:0}.auth .card{padding:32px;border:0;box-shadow:var(--shadow)}
.auth h1{font-size:28px;margin-bottom:16px}
.pay .price{font:500 28px/1.2 var(--sans);font-variant-numeric:tabular-nums;margin:8px 0 20px}.pay .qr{max-width:240px;margin:8px auto 16px;padding:8px;border-radius:12px;background:#fff}.pay .qr svg{display:block;width:100%;height:auto}.pay .small{font-size:13px;margin:12px 0 0}.pay .stack{max-width:none}.pay button.primary{width:100%}
.okline{display:flex;gap:8px;align-items:center;color:var(--ok)}.step-box{border:1px solid var(--line);border-radius:12px;padding:12px 16px 16px;margin:0;display:grid;gap:12px}.step-box legend{padding:0 6px;font-weight:500}.mods{display:grid;gap:12px}.mods label{display:flex;gap:12px;align-items:flex-start}.mods input{flex:none;margin-top:3px}.mods small{display:block;color:var(--muted)}
/* movimento: 3 durações (--d1 hover, --d2 menus, --d3 páginas) e uma curva (--ease; --spring só no que "pula") */
@view-transition{navigation:auto}
main{view-transition-name:main}.side .it.on{view-transition-name:nav-on}.toolbar>.seg a.on{view-transition-name:seg-on}
::view-transition-group(*){animation-duration:var(--d3);animation-timing-function:var(--ease)}
::view-transition-old(main){animation:var(--d1) ease both fx-out}::view-transition-new(main){animation:var(--d3) var(--ease) both fx-in}
html:active-view-transition-type(down)::view-transition-old(main){animation-name:fx-out-up}html:active-view-transition-type(down)::view-transition-new(main){animation-name:fx-in}
html:active-view-transition-type(up)::view-transition-old(main){animation-name:fx-out-down}html:active-view-transition-type(up)::view-transition-new(main){animation-name:fx-in-up}
@keyframes fx-out{to{opacity:0}}@keyframes fx-out-up{to{opacity:0;transform:translateY(-12px)}}@keyframes fx-out-down{to{opacity:0;transform:translateY(12px)}}
@keyframes fx-in{from{opacity:0;transform:translateY(16px)}}@keyframes fx-in-up{from{opacity:0;transform:translateY(-16px)}}
@keyframes fx-pop{from{opacity:0;transform:translateY(-4px) scale(.98)}}
.menu[open]>div,.pop[open]>form,.filters[open]>div,details.dl[open]>div,.step[open]>.body{animation:fx-pop var(--d2) var(--ease);transform-origin:top left}
.pane{animation:fx-in var(--d3) var(--ease)}
.side nav{position:relative}
.glide{position:absolute;left:0;top:0;border-radius:8px;background:var(--side-hover);pointer-events:none;opacity:0;transition:transform var(--d2) var(--ease),width var(--d2) var(--ease),height var(--d2) var(--ease),opacity var(--d1)}.glide.in{opacity:1}
@media (hover:hover){.js .side nav .it:hover{background:none}}
.sec .it{transition:background-color var(--d1),transform var(--d2) var(--ease),scale var(--d2) var(--spring),box-shadow var(--d2)}
.sec.sorting{user-select:none;cursor:grabbing}.sec .it.lift{z-index:2;scale:1.04;background:var(--primary);color:#fff;box-shadow:0 10px 24px rgba(14,88,219,.32);transition:scale var(--d2) var(--spring),box-shadow var(--d2),background-color var(--d1)}.sec .it.lift .ic,.sec .it.lift .cnt{color:#fff}
.tabs{position:relative}.tabs>label{position:relative}.tabs>.ind{position:absolute;left:0;top:0;border-radius:8px;background:var(--surface2);box-shadow:inset 0 0 0 1px var(--line);pointer-events:none}
.fx .tabs>.ind{transition:transform var(--d3) var(--spring),width var(--d2) var(--ease),height var(--d2) var(--ease)}.js .tabs>input:checked+label{background:none;box-shadow:none}
.seg a{transition:color var(--d1),background-color var(--d1)}.seg a.on{box-shadow:0 1px 2px rgba(0,0,0,.06)}
/* rastro (o traço com ponto do logo) marca o item ativo, o fim das linhas e o carregamento */
.side .it.on{background:none;box-shadow:none;font-weight:600}.side .it.on .ic{color:var(--link)}
.side .it.on::before{content:"";position:absolute;left:-8px;top:5px;width:2px;height:calc(50% - 6px);border-radius:2px;background:linear-gradient(transparent,var(--primary))}
.side .it.on::after{content:"";position:absolute;left:-9px;top:50%;width:4px;height:4px;margin-top:-2px;border-radius:50%;background:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 25%,transparent)}
.ic.rastro{color:var(--muted)}.rastro path{stroke-dasharray:3 5}
.nprog{position:fixed;top:0;left:0;right:0;height:2px;z-index:200;pointer-events:none;opacity:0;transition:opacity var(--d2)}.loading .nprog{opacity:1}
.nprog::before{content:"";position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,transparent,var(--primary))}
.nprog::after{content:"";position:absolute;top:-2px;left:0;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--primary);box-shadow:0 0 8px var(--primary)}
.loading .nprog::before{animation:fx-load-w 8s cubic-bezier(.1,.7,.2,1) forwards}.loading .nprog::after{animation:fx-load-x 8s cubic-bezier(.1,.7,.2,1) forwards}
@keyframes fx-load-w{to{width:90%}}@keyframes fx-load-x{to{left:90%}}
/* primeira visita da página na sessão: cartões entram, barras crescem, linhas se desenham */
.intro .hero>.kpi{animation:fx-in var(--d3) var(--ease) both}.intro .hero>.kpi:nth-child(2){animation-delay:40ms}.intro .hero>.kpi:nth-child(3){animation-delay:80ms}.intro .hero>.kpi:nth-child(4){animation-delay:120ms}
.intro .col path{transform-box:fill-box;transform-origin:bottom;animation:fx-grow var(--d3) var(--ease) both;animation-delay:calc(var(--i,0) * 18ms)}@keyframes fx-grow{from{transform:scaleY(0)}}
.intro .serl,.intro .spark .ln{stroke-dasharray:1;animation:fx-draw .9s var(--ease) both .15s}@keyframes fx-draw{from{stroke-dashoffset:1}}
.intro .share .tr i{animation:fx-fill var(--d3) var(--ease) both .1s}@keyframes fx-fill{from{transform:scaleX(0)}}
.feed li.new,tbody tr.new{animation:fx-new 2.4s var(--ease)}@keyframes fx-new{0%{opacity:0;transform:translateY(-6px);background:var(--info-bg)}15%{opacity:1;transform:none;background:var(--info-bg)}}
/* minigráfico, mira compartilhada e marcações */
.spark{margin:6px 0 10px;overflow:visible;color:var(--s1)}.spark .ln{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linejoin:round;stroke-linecap:round}.spark .ar{fill:currentColor;opacity:.08}
.kpi svg.spark{height:40px}.spark .ln,.spark .pt,.spark .end{vector-effect:non-scaling-stroke}.spark .pt,.spark .end{fill:none;stroke:currentColor;stroke-width:7;stroke-linecap:round}.spark .pt{opacity:0;transition:opacity var(--d1)}.spark .pt.x{opacity:1}
.kpi.feature .spark{color:#fff}
.col.x .hit{fill:var(--bar)}
.flag .mk{stroke:var(--ink2);stroke-dasharray:2 4;opacity:.7}.flag .mkd{fill:var(--surface);stroke:var(--ink);stroke-width:2}.flag .mkh{fill:transparent}.flag:hover .mkd{fill:var(--ink)}.sw.mkl{width:8px;height:8px;border-radius:50%;border:2px solid var(--ink);background:var(--surface)}
.serl+.end,.end-dot{fill:var(--surface);stroke-width:2}
/* menu do perfil (camada flutuante: vidro) */
.prof{position:fixed;top:16px;right:24px;z-index:46}
.prof>summary{list-style:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--primary);color:#fff;font:600 15px/1 var(--display);cursor:pointer;box-shadow:0 0 0 3px var(--bg),0 1px 3px rgba(0,0,0,.2);transition:transform var(--d2) var(--spring)}.prof>summary::-webkit-details-marker{display:none}
@media (hover:hover){.prof>summary:hover{transform:scale(1.06)}}
.prof>div,[data-side=mini] .menu>div{background:color-mix(in srgb,var(--surface) 82%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.5);backdrop-filter:blur(16px) saturate(1.5)}
.prof>div{position:absolute;right:0;top:calc(100% + 8px);width:250px;display:grid;gap:2px;padding:6px;border-radius:12px;border:1px solid var(--line);box-shadow:var(--shadow);transform-origin:top right;animation:fx-pop var(--d2) var(--ease)}
.prof .who{display:grid;gap:2px;margin:0 0 4px;padding:8px 10px 10px;border-bottom:1px solid var(--line);font-size:13px}.prof .who b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.prof .who small{color:var(--muted)}
.prof .it{color:var(--ink)}.prof .it .ic{color:var(--muted);opacity:1}.prof .it.on{background:var(--surface2);box-shadow:none}@media (hover:hover){.prof .it:hover{background:var(--surface2)}}.prof form{margin:0}
.ios-hint{margin:2px 10px 8px;color:var(--muted);font-size:13px}.fs,[data-font=space] .fb{display:none}[data-font=space] .fs{display:inline}
@media (min-width:900px){.head{padding-right:56px}}
@media (max-width:899px){.prof{top:calc(8px + env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));z-index:31}.mtop .site{padding-right:52px}}
/* números do topo maiores; ROAS e lucro em verde ou vermelho conforme o resultado */
.hero .kpi:not(.feature) b{font-size:38px;line-height:1.05;margin:10px 0}
@media (max-width:600px){.hero .kpi:not(.feature) b{font-size:30px}}
.kpi.good b{color:var(--ok)}.kpi.bad b{color:var(--bad)}
/* Integrações: grade de ícones; a seção da âncora (:target) toma o lugar da grade */
.hub{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));gap:12px}
.tile{display:grid;align-content:start;justify-items:start;gap:6px;min-height:168px;padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--ink);text-decoration:none;transition:transform var(--d2) var(--ease),border-color var(--d1),box-shadow var(--d2) var(--ease)}
.tile-ic{display:grid;place-items:center;width:44px;height:44px;margin-bottom:6px;border-radius:12px;background:var(--info-bg);color:var(--link);flex:none}.tile-ic.brand{background:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.tile-t{font:600 16px/1.25 var(--display)}.tile-d{color:var(--muted);font-size:13px;line-height:1.4}.tile .tag{margin:auto 0 0}
@media (hover:hover){.tile:hover{transform:translateY(-3px);border-color:var(--line2);box-shadow:var(--shadow)}}.tile:active{transform:scale(.98)}
.part{display:none;gap:16px;scroll-margin-top:80px}.part:target{display:grid;animation:fx-in var(--d3) var(--ease)}.hub-page:has(.part:target) .hub{display:none}
.back{display:inline-flex;align-items:center;gap:6px;justify-self:start;min-height:40px;padding:0 12px 0 8px;margin-left:-8px;border-radius:8px;color:var(--ink2);text-decoration:none;font-weight:500}@media (hover:hover){.back:hover{background:var(--hover);color:var(--ink)}}
.part-h{display:flex;flex-wrap:wrap;align-items:center;gap:12px 14px}.part-h .tile-ic{margin:0}.part-h>div{flex:1;min-width:200px}.part-h h2{font:600 22px/1.2 var(--display)}.part-h p{margin:2px 0 0}.part-h .tag{margin:0}
/* funil dos anúncios: colunas e faixa contínua atrás (o texto fica fora da faixa, legível nos dois temas) */
.flow-sum{display:flex;flex-wrap:wrap;gap:4px 20px;margin:10px 0 0;color:var(--muted);font-size:13px}.flow-sum b{color:var(--ink);font-weight:600}
.flow{position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(104px,1fr));grid-template-rows:auto auto 150px auto auto;margin-top:16px;min-width:560px}
.flow-band{grid-row:3;grid-column:1/-1;width:100%;height:150px!important;pointer-events:none}
.fcol{display:grid;grid-row:1/-1;grid-template-rows:subgrid;justify-items:center;align-content:start;padding:0 6px;border-left:1px solid var(--line);text-align:center;outline-offset:-2px;border-radius:2px}.fcol:first-of-type{border-left:0}
@media (hover:hover){.fcol:hover{background:var(--hover)}}
.fcol-t{color:var(--muted);font-size:12px;line-height:1.3;min-height:2.6em}.fcol-p{font:600 22px/1.1 var(--display);letter-spacing:-.01em;margin:2px 0 8px}
.fcol-v{grid-row:4;margin-top:10px;font-weight:600}.fcol-v em{font-style:normal;margin-left:4px;padding:1px 6px;border-radius:999px;background:var(--bad);color:#fff;font-size:11px}.fcol-s{grid-row:5;color:var(--muted);font-size:11px}
.fcol.bad .fcol-p{color:var(--bad)}
.drill{gap:8px;align-items:center;flex-wrap:wrap}.drill select{max-width:min(320px,100%)}@media (max-width:719px){.drill{width:100%}.drill select{flex:1 1 100%;max-width:none}.drill>span[aria-hidden]{display:none}}
.seq{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.seqc{display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 3px;border:1px solid var(--line2);border-radius:999px;background:var(--surface2);font-size:12px;white-space:nowrap}.seqc b{font-weight:600}.seqc img,.seqc .ad-thumb{width:22px;height:22px;border-radius:50%;object-fit:cover;border:0}.seqc .ad-thumb svg{width:12px;height:12px}.seqc.close{border-color:var(--ok);background:var(--ok-bg)}.seqa,.seqg{color:var(--muted);font-size:11px}
.seq-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:22px 0 4px;font-size:15px}.seq-h small{font-weight:400;font-size:12px}.seq-grid h4{margin:6px 0 0;font:500 13px var(--sans);color:var(--muted)}
.jr{display:flex;flex-wrap:wrap;align-items:flex-end;gap:4px 6px}.jstep{display:grid;gap:3px;justify-items:start}.jl{display:inline-flex;align-items:center;gap:4px;color:var(--muted);font:500 11px var(--sans);text-transform:uppercase;letter-spacing:.03em}.jstep.buy .jl{color:var(--ok)}
.jarrow{display:grid;justify-items:center;align-self:flex-end;padding-bottom:4px;color:var(--muted);min-width:44px}.jarrow small{font-size:10px;line-height:1.2;white-space:nowrap}
.seq-list{list-style:none;margin:8px 0 0;padding:0;display:grid}.seq-list li{display:grid;gap:4px;padding:10px 0;border-top:1px solid var(--line);font-size:12px}.seq-list li:first-child{border-top:0}
.ad-name{display:flex;align-items:center;gap:12px}.ad-thumb{flex:none;width:48px;height:48px;border-radius:8px;object-fit:cover;background:var(--surface2);border:1px solid var(--line)}.ad-thumb.none{display:grid;place-items:center;color:var(--muted)}.ad-thumb.none svg{width:18px;height:18px}
.vf{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:3px}
.vf-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,260px);gap:24px;align-items:center}
.vf-seg{min-height:88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:10px calc((var(--t0) + var(--t1)) / 2);text-align:center;color:#fff;background:color-mix(in srgb,var(--s1) var(--c),var(--surface));clip-path:polygon(var(--t0) 0,calc(100% - var(--t0)) 0,calc(100% - var(--t1)) 100%,var(--t1) 100%)}
.vf-t{font:500 13px/1.3 var(--sans);opacity:.9}.vf-v{font:600 28px/1.1 var(--display);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.vf-row:not(.last) .vf-seg .delta{margin-top:4px;color:#fff;background:rgba(255,255,255,.18)}
.vf-row.last .vf-seg{clip-path:none;margin:6px var(--t0) 0;padding:12px;border-radius:14px;color:var(--ink);background:var(--surface2);border:1px solid var(--s1);box-shadow:var(--shadow)}.vf-row.last .vf-t{color:var(--muted);opacity:1}.vf-row.last .delta{margin-top:4px}
.vf-side{display:grid;gap:2px;color:var(--muted);font-size:13px}.vf-side b{color:var(--ink);font-weight:600}.vf-r{font:600 18px var(--display)}.vf-side small{font-size:12px;opacity:.85}
h2.sec{margin:28px 0 12px;font-size:18px}
@media (max-width:719px){.vf-row{grid-template-columns:1fr;gap:6px}.vf-side{text-align:center;padding-bottom:10px}.vf-v{font-size:22px}.vf-seg{min-height:76px}}
.flow-note{margin:14px 0 0;color:var(--muted);font-size:13px}.flow-note.bad{color:var(--ink)}.flow-note.bad b{color:var(--bad)}
.intro .flow-band path{animation:fx-reveal .9s var(--ease) both .1s}@keyframes fx-reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.js .auto-btn{display:none}
/* card de destaque e cartões que respondem ao mouse */
.kpi.feature{position:relative;overflow:hidden;border-color:transparent;color:#fff;background:radial-gradient(120% 90% at 100% 0,rgba(255,255,255,.18),transparent 60%),linear-gradient(160deg,#2F7BFF,#0E58DB 55%,#0A47B8);box-shadow:0 14px 34px rgba(14,88,219,.28)}
.kpi.feature .lbl{color:rgba(255,255,255,.82)}.kpi.feature .delta{color:#fff;background:rgba(255,255,255,.18)}
.hero .kpi{transition:transform var(--d3) var(--ease),box-shadow var(--d3) var(--ease)}
@media (hover:hover){.hero .kpi:hover{transform:translateY(-3px);box-shadow:var(--shadow)}.hero .kpi.feature:hover{box-shadow:0 18px 40px rgba(14,88,219,.36)}}
@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
@media (forced-colors:active){.it.on,.seg a.on,.tabs>input:checked+label{outline:1px solid CanvasText}.funnel .fill,.bar-bg,.sw,.meter i{forced-color-adjust:none}}
.skip{position:absolute;left:12px;top:-60px;z-index:100;padding:10px 14px;border-radius:10px;background:var(--primary);color:#fff;font-weight:600;text-decoration:none}.skip:focus{top:12px}
@media (min-width:900px){.nav-t{display:none}}`;

// Antes da pintura: tema e barra recolhida salvos (sem JS fica tudo no padrão do sistema e a barra aberta).
const HEAD_JS = `(function(){var h=document.documentElement,t,s;try{t=localStorage.getItem('rastro-theme');s=localStorage.getItem('rastro-side')}catch(e){}
var f;try{f=localStorage.getItem('rastro-font')}catch(e){}if(f==='space')h.dataset.font=f;
if(t==='light'||t==='dark')h.dataset.theme=t;if(s==='mini')h.dataset.side='mini';h.classList.add('js');
var k='rastro-seen:'+location.pathname;function intro(){try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,1)}catch(e){}h.classList.add('intro')}
if(document.prerendering)document.addEventListener('prerenderingchange',intro,{once:true});else intro();
addEventListener('pagereveal',function(e){var v;try{v=sessionStorage.getItem('rastro-dir');sessionStorage.removeItem('rastro-dir')}catch(x){}if(e.viewTransition&&v)e.viewTransition.types.add(v)});
var dk=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches,m=document.querySelector('meta[name=theme-color]');if(m)m.content=dk?'#0F0F10':'#F4F4F5'})()`;

const TIP_JS = `(function(){var d=document,t=d.createElement('div');t.className='tip';t.hidden=true;d.body.appendChild(t);
function pos(e){if(t.hidden)return;var r=t.getBoundingClientRect(),o=e.pointerType==='touch'?28:14,x=e.clientX+14,y=e.clientY+o;if(x+r.width>innerWidth-8)x=Math.max(8,e.clientX-r.width-14);if(y+r.height>innerHeight-8)y=e.clientY-r.height-o;t.style.left=x+'px';t.style.top=y+'px'}
d.addEventListener('pointerover',function(e){var g=e.target.closest&&e.target.closest('[data-tip]');if(!g){t.hidden=true;return}t.replaceChildren();g.dataset.tip.split('|').forEach(function(l,i){var x=d.createElement('div');x.textContent=l;if(!i)x.className='t';t.appendChild(x)});t.hidden=false;pos(e)});
d.addEventListener('pointermove',pos);addEventListener('scroll',function(){t.hidden=true},{passive:true})})()`;

const UI_JS = `(function(){var d=document,h=d.documentElement,mq=matchMedia('(prefers-color-scheme: dark)');
function dark(){return h.dataset.theme?h.dataset.theme==='dark':mq.matches}
function meta(){var m=d.querySelector('meta[name=theme-color]');if(m)m.content=dark()?'#0F0F10':'#F4F4F5'}
function save(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function side(){var b=d.querySelector('.collapse');if(!b)return;var mini=h.dataset.side==='mini';b.setAttribute('aria-expanded',String(!mini));b.setAttribute('aria-label',mini?'Expandir menu':'Recolher menu')}
d.addEventListener('change',function(e){var p=e.target.closest&&e.target.closest('.pick');if(p&&p.querySelector('details'))p.querySelector('details').open=false});
if(innerWidth<600)d.querySelectorAll('details.filters').forEach(function(x){x.open=false});side();if(mq.addEventListener)mq.addEventListener('change',meta);
d.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-act]');if(!b)return;
if(b.dataset.act==='copy'){var i=d.getElementById(b.dataset.for);if(i){i.select();try{navigator.clipboard.writeText(i.value)}catch(x){d.execCommand('copy')}b.textContent='Código copiado'}return}
if(b.dataset.act==='theme'){var t=dark()?'light':'dark';h.dataset.theme=t;save('rastro-theme',t);meta()}
else if(b.dataset.act==='font'){if(h.dataset.font)delete h.dataset.font;else h.dataset.font='space';save('rastro-font',h.dataset.font||'')}
else if(b.dataset.act==='side'){if(h.dataset.side==='mini')delete h.dataset.side;else h.dataset.side='mini';save('rastro-side',h.dataset.side||'open');side()}})})()`;

// Fluidez: brilho que segue o mouse no menu, itens do menu reordenáveis arrastando (salvo no navegador), indicador deslizante nas abas.
const FX_JS = `(function(){var d=document,h=d.documentElement,K='rastro-nav',sec=d.querySelector('.side .sec'),drag=null,moved=false;
function key(a){return a.pathname.split('/').slice(3).join('/')}
function runs(){var r=[],c=[];[].forEach.call(sec.children,function(x){if(x.matches('a.it'))c.push(x);else{if(c.length)r.push(c);c=[]}});if(c.length)r.push(c);return r}
function place(g,it){g.style.transform='translate('+it.offsetLeft+'px,'+it.offsetTop+'px)';g.style.width=it.offsetWidth+'px';g.style.height=it.offsetHeight+'px'}
if(sec){var saved=[];try{saved=JSON.parse(localStorage.getItem(K))||[]}catch(e){}
runs().forEach(function(g){var after=g[g.length-1].nextSibling;g.slice().sort(function(a,b){var i=saved.indexOf(key(a)),j=saved.indexOf(key(b));return(i<0?1e3:i)-(j<0?1e3:j)}).forEach(function(a){sec.insertBefore(a,after)})})}
d.querySelectorAll('.side nav').forEach(function(n){var g=d.createElement('i');g.className='glide';n.prepend(g);
n.addEventListener('pointerover',function(e){var it=e.target.closest('.it');if(!it||!n.contains(it)||drag&&drag.on)return;var fresh=!g.classList.contains('in');if(fresh)g.style.transition='none';place(g,it);if(fresh){g.offsetWidth;g.style.transition=''}g.classList.add('in')});
n.addEventListener('pointerleave',function(){g.classList.remove('in')})});
if(sec){sec.addEventListener('dragstart',function(e){e.preventDefault()});
sec.addEventListener('pointerdown',function(e){var it=e.target.closest('a.it');if(it&&!e.button&&e.pointerType==='mouse')drag={it:it,y0:e.clientY,on:false}});
sec.addEventListener('click',function(e){if(moved){e.preventDefault();moved=false}},true);
d.addEventListener('pointermove',function(e){if(!drag)return;var x=drag,dy=e.clientY-x.y0;
if(!x.on){if(Math.abs(dy)<5)return;x.g=runs().filter(function(r){return r.indexOf(x.it)>=0})[0];x.from=x.to=x.g.indexOf(x.it);x.h=x.it.offsetHeight;x.on=true;x.it.classList.add('lift');sec.classList.add('sorting');sec.querySelector('.glide').classList.remove('in')}
dy=Math.max(-x.from*x.h,Math.min((x.g.length-1-x.from)*x.h,dy));x.dy=dy;x.it.style.transform='translateY('+dy+'px)';x.to=Math.round(x.from+dy/x.h);
x.g.forEach(function(s,i){if(s!==x.it)s.style.transform=i>x.from&&i<=x.to?'translateY(-'+x.h+'px)':i<x.from&&i>=x.to?'translateY('+x.h+'px)':''})});
function drop(){var x=drag;drag=null;if(!x||!x.on)return;moved=true;setTimeout(function(){moved=false},0);
var after=x.g[x.g.length-1].nextSibling,arr=x.g.filter(function(s){return s!==x.it});arr.splice(x.to,0,x.it);
x.g.forEach(function(s){s.style.transition='none';s.style.transform=''});arr.forEach(function(a){sec.insertBefore(a,after)});
x.it.style.transform='translateY('+(x.dy-(x.to-x.from)*x.h)+'px)';x.it.offsetWidth;x.g.forEach(function(s){s.style.transition=''});x.it.style.transform='';x.it.classList.remove('lift');sec.classList.remove('sorting');
try{localStorage.setItem(K,JSON.stringify([].map.call(sec.querySelectorAll('a.it'),key)))}catch(e){}}
d.addEventListener('pointerup',drop);d.addEventListener('pointercancel',drop)}
function tabs(){d.querySelectorAll('.tabs').forEach(function(t){var c=t.querySelector('input:checked+label'),i=t.querySelector(':scope>.ind');if(!c||!c.offsetWidth)return;if(!i){i=d.createElement('i');i.className='ind';t.prepend(i)}place(i,c)})}
tabs();d.addEventListener('change',function(e){if(e.target.closest('.tabs'))tabs()});addEventListener('resize',tabs);if(d.fonts)d.fonts.ready.then(tabs);
d.addEventListener('click',function(e){d.querySelectorAll('details.prof[open]').forEach(function(x){if(!x.contains(e.target))x.open=false})});
setTimeout(function(){h.classList.add('fx')},100);
var cur=null;d.addEventListener('pointerover',function(e){var c=e.target.closest&&e.target.closest('.col[data-k]'),k=c?c.dataset.k:null;if(k===cur)return;cur=k;d.querySelectorAll('.x').forEach(function(x){x.classList.remove('x')});if(k)d.querySelectorAll('[data-k="'+CSS.escape(k)+'"]').forEach(function(x){x.classList.add('x')})});
var bar=d.createElement('div'),tm;bar.className='nprog';bar.setAttribute('aria-hidden','true');d.body.appendChild(bar);
function busy(){clearTimeout(tm);tm=setTimeout(function(){h.classList.add('loading')},150)}
d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target||a.hasAttribute('download')||a.origin!==location.origin||a.getAttribute('href').charAt(0)==='#')return;busy()});
d.addEventListener('submit',function(e){if(!e.defaultPrevented)busy()});
addEventListener('pageshow',function(){clearTimeout(tm);h.classList.remove('loading')});
addEventListener('pageswap',function(e){if(!e.activation||!e.activation.entry)return;var a=[].map.call(d.querySelectorAll('.side a.it'),function(x){return x.pathname}),i=a.indexOf(location.pathname),j=a.indexOf(new URL(e.activation.entry.url).pathname);try{sessionStorage.setItem('rastro-dir',i<0||j<0||i===j?'':j>i?'down':'up')}catch(x){}});
function count(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.querySelectorAll('.hero .int[data-count]').forEach(function(el){var v=+el.dataset.count,t0=performance.now(),nf=new Intl.NumberFormat('pt-BR');if(!(v>9))return;el.textContent='0';(function step(t){var p=Math.min(1,(t-t0)/700);el.textContent=nf.format(Math.round(v*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(step)})(t0)})}
if(h.classList.contains('intro'))count();else if(d.prerendering)d.addEventListener('prerenderingchange',function(){if(h.classList.contains('intro'))count()},{once:true});
d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.tile,.part>a.back');if(!a||!d.startViewTransition||e.metaKey||e.ctrlKey)return;e.preventDefault();d.startViewTransition(function(){location.hash=a.getAttribute('href')==='#'?'':a.hash})});
d.addEventListener('change',function(e){var s=e.target;if(s.matches&&s.matches('select[data-submit]')&&s.form)s.form.requestSubmit?s.form.requestSubmit():s.form.submit()});
function cards(r){r.querySelectorAll('table.mcards').forEach(function(t){var h=[].map.call(t.querySelectorAll('thead th'),function(x){return x.textContent.trim()});t.querySelectorAll('tbody tr,tfoot tr').forEach(function(tr){var foot=tr.parentNode.tagName==='TFOOT';[].forEach.call(tr.children,function(c,i){if(foot&&!i)c.classList.add('c-main');else if(h[i]&&!c.classList.contains('c-main'))c.setAttribute('data-label',h[i])})})})}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',function(){cards(d)});else cards(d);
window.rastroSwap=function(el,html){var old=new Set([].map.call(el.querySelectorAll('.feed li,tbody tr'),function(x){return x.textContent}));el.innerHTML=html;cards(el);if(old.size)el.querySelectorAll('.feed li,tbody tr').forEach(function(x){if(!old.has(x.textContent))x.classList.add('new')})}})()`;

// Pré-renderiza a página quando o mouse para sobre um link do menu, das abas de período ou do perfil (só GET, sem efeito colateral).
const SPECULATION = JSON.stringify({ prerender: [{ where: { and: [{ href_matches: '/*' }, { selector_matches: '.side a, .seg a, .prof a, .tabbar a' }] }, eagerness: 'moderate' }] });

// Celular como app: gaveta que segue o dedo (abre pela borda no app instalado), puxar para atualizar no app instalado,
// botão de instalar, aviso sem conexão e service worker (só estáticos e a página offline).
const MOBILE_JS = `(function(){var d=document,h=d.documentElement,nt=d.getElementById('nav-t'),side=d.getElementById('side'),scrim=d.querySelector('.scrim'),app=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function buzz(){if(navigator.vibrate)try{navigator.vibrate(8)}catch(e){}}
if(nt&&side){var g=null;
d.addEventListener('touchstart',function(e){if(innerWidth>=900||e.touches.length>1)return;var x=e.touches[0].clientX,open=nt.checked;if(open?!side.contains(e.target)&&e.target!==scrim:!(app&&x<24))return;g={x0:x,y0:e.touches[0].clientY,open:open,w:side.offsetWidth,on:false,dx:0,t:Date.now()}},{passive:true});
d.addEventListener('touchmove',function(e){if(!g)return;var dx=e.touches[0].clientX-g.x0,dy=e.touches[0].clientY-g.y0;
if(!g.on){if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){g=null;return}if(Math.abs(dx)<8)return;g.on=true;side.style.transition=scrim.style.transition='none';side.style.visibility='visible';scrim.style.pointerEvents='none'}
var off=g.open?Math.min(0,dx):Math.min(0,dx-g.w);g.dx=dx;side.style.transform='translateX('+off+'px)';scrim.style.opacity=String(1+off/g.w)},{passive:true});
d.addEventListener('touchend',function(){if(!g)return;var x=g;g=null;if(!x.on)return;var fast=Math.abs(x.dx)/(Date.now()-x.t)>.5,open=x.open?!(x.dx<-x.w/3||fast&&x.dx<0):x.dx>x.w/3||fast&&x.dx>0;
side.style.transition=scrim.style.transition='';side.style.transform=side.style.visibility=scrim.style.opacity=scrim.style.pointerEvents='';if(open!==x.open)buzz();nt.checked=open},{passive:true})}
if(app){var p=d.createElement('div'),y0=null,dy=0;p.className='ptr';p.setAttribute('aria-hidden','true');p.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';d.body.appendChild(p);
d.addEventListener('touchstart',function(e){y0=scrollY<=0&&!nt.checked&&!e.target.closest('.board,.tw,.seg,.thread,.feed,.side,.prof')?e.touches[0].clientY:null;dy=0},{passive:true});
d.addEventListener('touchmove',function(e){if(y0==null)return;dy=Math.max(0,e.touches[0].clientY-y0);if(scrollY>0){y0=null;dy=0}var k=Math.min(1,dy/120);p.classList.remove('go');p.style.opacity=String(k);p.style.transform='translateY('+(-56+k*96)+'px) rotate('+k*270+'deg)';if(dy>=120&&!p.dataset.armed){p.dataset.armed=1;buzz()}if(dy<120)delete p.dataset.armed},{passive:true});
d.addEventListener('touchend',function(){if(y0==null)return;y0=null;p.classList.add('go');if(dy>=120){p.classList.add('spin');p.style.transform='translateY(40px)';location.reload()}else{p.style.opacity='0';p.style.transform=''}},{passive:true})}
var ask=null,ib=d.querySelector('[data-act=install]'),hint=d.querySelector('.ios-hint');
addEventListener('beforeinstallprompt',function(e){e.preventDefault();ask=e;if(ib)ib.hidden=false});
if(ib&&!app&&/iP(hone|ad|od)/.test(navigator.userAgent)){ib.hidden=false;ib.dataset.ios=1}
if(ib)ib.addEventListener('click',function(){if(ib.dataset.ios){if(hint)hint.hidden=!hint.hidden;return}if(ask){ask.prompt();ask.userChoice.then(function(){ask=null;ib.hidden=true})}});
addEventListener('appinstalled',function(){if(ib)ib.hidden=true});
function net(){h.classList.toggle('offline',!navigator.onLine)}net();addEventListener('online',net);addEventListener('offline',net);
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})})()`;

// ---------- layout ----------
export function layout(ctx, title, body, { bare = false, refresh = 0 } = {}) {
  const shell = bare ? html`<main>${body}</main>` : ctx.share ? html`${shareBar(ctx)}<main>${body}</main>` : html`<a class="skip" href="#main">Pular para o conteúdo</a>${sidebar(ctx)}${profile(ctx)}<div class="page"><main id="main" tabindex="-1">${body}</main></div>`;
  return html`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<meta name="referrer" content="same-origin"><meta name="theme-color" content="#F4F4F5"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Sinqfy"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="format-detection" content="telephone=no"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><script nonce="${ctx.nonce}">${raw(HEAD_JS)}</script>${refresh ? html`<meta http-equiv="refresh" content="${refresh}">` : ''}<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/figtree.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin><title>${title} · Sinqfy</title><style>${raw(CSS)}</style></head>
<body${bare ? raw(' class="bare"') : ''}>${shell}${bare || ctx.share ? '' : html`<script type="speculationrules" nonce="${ctx.nonce}">${raw(SPECULATION)}</script>`}<script nonce="${ctx.nonce}">${raw(TIP_JS)};${raw(UI_JS)};${raw(FX_JS)};${raw(MOBILE_JS)}</script></body></html>`;
}

const RASTRO = raw('<svg class="ic rastro" width="64" height="32" viewBox="0 0 64 32" aria-hidden="true"><path d="M4 26L20 16L30 22L50 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="55" cy="6" r="4" fill="currentColor"/></svg>');
export const MARK = raw('<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0E58DB"/><g fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 46L24 36" stroke-opacity=".5"/><path d="M24 36L33 42L46 23"/></g><circle cx="47" cy="21" r="6" fill="#fff"/></svg>');
const brand = (href, label = 'Sinqfy') => html`<a class="brand" href="${href}">${MARK}<span>${label}</span></a>`;
const shareBar = ctx => html`<header class="sbar">${brand('?')}<strong>${ctx.site.name}</strong><span class="live">Relatório público · somente leitura</span></header>`;

const NAV = [
  { label: 'Visão', items: [['', 'Resumo', 'house'], ['/events', 'Eventos', 'activity', 'ao vivo']] },
  { label: 'Vendas', items: [['/campaigns', 'Campanhas', 'megaphone'], ['/orders', 'Pedidos', 'list'], ['/checkout', 'Checkout Pix', 'qr-code', null, 'checkout'], ['/recovery', 'Recuperação', 'refresh-cw', null, 'recovery']] },
  { label: 'Tráfego', items: [['/traffic', 'Visão geral', 'chart-column'], ['/realtime', 'Tempo real', 'radio'], ['/funnels', 'Funis', 'funnel'], ['/journeys', 'Caminhos', 'route'], ['/behavior', 'Comportamento', 'click'], ['/attribution', 'Atribuição', 'target']] },
  { label: 'Relacionamento', items: [['/crm', 'CRM', 'square-kanban', null, 'crm'], ['/contacts', 'Contatos', 'users', null, 'crm'], ['/conversations', 'Conversas', 'message-circle', null, 'whatsapp'], ['/audiences', 'Públicos', 'target', null, 'audiences', true]] },
  { label: 'Configurar', edit: true, items: [['/setup', 'Primeiros passos', 'route'], ['/integrations', 'Integrações', 'plug'], ['/whatsapp', 'WhatsApp', 'phone', null, 'whatsapp'], ['/settings', 'Configurações', 'settings']] },
];
const CLIENT_TABS = new Set(['', '/campaigns', '/orders']);
const KEEP_PERIOD = new Set(['', '/campaigns', '/orders', '/traffic', '/funnels', '/journeys', '/behavior', '/attribution']);

const item = (href, text, ic, cur, badge) => html`<a class="it${cur ? ' on' : ''}" href="${href}"${cur ? raw(' aria-current="page"') : ''}>${icon(ic)}<span class="t">${text}</span>${badge ? html`<span class="cnt"><i></i>${badge}</span>` : ''}</a>`;

const adminItems = ({ user, tab }) => html`${user?.role === 'admin' ? html`${item('/sites', 'Sites', 'globe', tab === 'sites')}${item('/team', 'Equipe', 'users', tab === 'team')}` : ''}${user?.platform ? html`${item('/agencies', 'Agências', 'layers', tab === 'agencies')}${item('/plano', 'Plano', 'circle-dollar-sign', tab === 'plano')}` : ''}`;

// Menu do perfil (canto superior direito): conta, administração da agência, tema e sair.
function profile(ctx) {
  const { user } = ctx;
  if (!user) return '';
  const who = user.name || user.email;
  return html`<details class="prof"><summary title="Conta" aria-label="Menu da conta">${String(who).trim()[0]?.toUpperCase() || '?'}</summary><div>
<p class="who"><b>${who}</b><small>${ROLES[user.role]}</small></p>
${adminItems(ctx)}${item('/account', 'Conta', 'user', ctx.tab === 'account')}
<button type="button" class="it theme" data-act="theme"><span class="tl">${icon('moon')}</span><span class="td">${icon('sun')}</span><span class="t tl">Tema escuro</span><span class="t td">Tema claro</span></button>
<button type="button" class="it" data-act="install" hidden>${icon('plus')}<span class="t">Instalar o app</span></button><p class="ios-hint" hidden>No Safari, toque em Compartilhar e depois em <b>Adicionar à Tela de Início</b>.</p>
<button type="button" class="it" data-act="font">${icon('type')}<span class="t"><span class="fb">Títulos: Bricolage</span><span class="fs">Títulos: Space Grotesk</span></span></button>
${NO_LOGIN ? '' : html`<form method="post" action="/logout"><button class="it">${icon('log-out')}<span class="t">Sair</span></button></form>`}</div></details>`;
}

// Barra de abas do celular: 4 destinos mais usados (conforme os recursos ligados) e Menu, que abre a gaveta com o resto.
function tabbar(ctx, href, groups) {
  const has = p => groups.some(g => g.items.some(i => i[0] === p));
  const tabs = ctx.site.ids ? [['', 'Resumo', 'house'], ['/campaigns', 'Campanhas', 'megaphone'], ['/orders', 'Pedidos', 'list']] : [['', 'Resumo', 'house'], ['/traffic', 'Tráfego', 'chart-column'], has('/crm') ? ['/crm', 'CRM', 'square-kanban'] : ['/orders', 'Pedidos', 'list'], has('/conversations') ? ['/conversations', 'Conversas', 'message-circle'] : ['/events', 'Eventos', 'activity']];
  const inTabs = tabs.some(([p]) => p === ctx.tab);
  return html`<nav class="tabbar" aria-label="Navegação rápida">${tabs.map(([p, t, ic]) => html`<a href="${href(p)}"${on(ctx.tab === p)}><span class="ti">${icon(ic, 20)}</span>${t}</a>`)}<label for="nav-t"${inTabs ? '' : raw(' class="on"')}><span class="ti">${icon('menu', 20)}</span>Menu</label></nav>`;
}

// Seletor de sites: cada cliente é um submenu com a visão somada (dois sites ou mais) e os sites dele; o do site aberto já vem aberto.
function sitePicker(ctx) {
  const { clients, loose } = groupsOf(ctx.sites || []), cur = ctx.site?.id;
  const link = (href, text, here) => html`<a href="${href}"${here ? raw(' class="on" aria-current="page"') : ''}>${text}</a>`;
  const siteLink = s => link(`/sites/${encodeURIComponent(s.id)}`, s.name, s.id === cur);
  return html`${clients.map(c => html`<details class="sub"${c.sites.some(s => s.id === cur) || cur === '~' + c.key ? raw(' open') : ''}><summary>${c.name}<span class="chev">${icon('chevron-right', 14)}</span></summary>
${c.all ? link(`/sites/~${c.key}`, 'Todos os funis', cur === '~' + c.key) : ''}${c.sites.map(siteLink)}</details>`)}${loose.map(siteLink)}`;
}

function sidebar(ctx) {
  const { user, site } = ctx;
  const keep = new URLSearchParams([...(ctx.q || [])].filter(([k]) => ['range', 'from', 'to', 'compare'].includes(k))).toString();
  const href = p => `/sites/${encodeURIComponent(site.id)}${p}${keep && KEEP_PERIOD.has(p) ? '?' + keep : ''}`;
  // Item com recurso (src/modules.js) some quando o recurso está desligado; o 6º campo marca item só de quem edita.
  // Visão do cliente (sites somados): só as telas de vendas que somam (src/clients.js).
  const groups = site ? NAV.filter(g => !g.edit || ctx.canEdit).map(g => ({ ...g, items: g.items.filter(([p, , , , mod, ed]) => (site.ids ? CLIENT_TABS.has(p) : !mod || enabled(site, mod)) && (!ed || ctx.canEdit)) })).filter(g => g.items.length) : [];
  return html`<input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu de navegação">
<header class="mtop"><label for="nav-t" class="menu-btn" title="Menu">${icon('menu', 22)}</label>${brand('/')}${site ? html`<span class="site">${site.name}</span>` : ''}</header>
<aside class="side" id="side" aria-label="Barra lateral">
<label for="nav-t" class="side-x" title="Fechar menu">${icon('x', 22)}</label>
${brand('/')}
${site ? html`<details class="menu"><summary class="it" title="Trocar de site">${icon('layers')}<span class="t">${site.name}</span><span class="chev">${icon('chevron-right', 16)}</span></summary><div>${sitePicker(ctx)}${user?.role === 'admin' ? html`<a href="/sites">+ Novo site</a>` : ''}</div></details>
<nav class="sec" aria-label="Seções do site">${groups.map(g => html`<p class="glabel">${g.label}</p>${g.items.map(([p, t, ic, badge]) => item(href(p), t, ic, ctx.tab === p, badge))}`)}</nav>` : ''}
${site ? '' : html`<nav aria-label="Agência">${adminItems(ctx)}</nav>`}
</aside><label for="nav-t" class="scrim" aria-hidden="true"></label>${site ? tabbar(ctx, href, groups) : ''}
<button type="button" class="collapse" data-act="side" aria-controls="side" aria-expanded="true" aria-label="Recolher menu">${icon('chevron-left', 16)}</button>`;
}

// O 1º argumento (contexto acima do título) não aparece mais: a barra lateral já diz o site e a seção.
export const pageHead = (_context, title, sub, aside = '') =>
  html`<div class="head"><div><h1>${title}</h1>${sub ? html`<p class="sub">${sub}</p>` : ''}</div>${aside ? html`<div class="head-aside">${aside}</div>` : ''}</div>`;

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

export function delta(cur, prev, fmt, invert) {
  if (prev == null || cur == null || !prev) return '';
  const ch = (cur - prev) / Math.abs(prev);
  if (Math.abs(ch) < 0.005) return html`<span class="delta" title="Antes: ${fmt(prev)}">= 0%</span>`;
  const good = invert ? ch < 0 : ch > 0;
  return html`<span class="delta ${good ? 'good' : 'bad'}" title="Antes: ${fmt(prev)}">${ch > 0 ? '▲' : '▼'} ${pct(Math.abs(ch))} <span class="sr">${good ? '(melhora)' : '(piora)'}, antes ${fmt(prev)}</span></span>`;
}
/** Indicador: kpi(id, rótulo, atual, anterior, formatador, { invert, feature }) */
/** "R$ 4.061,00" vira símbolo e centavos menores e o inteiro grande (o inteiro conta até o valor na 1ª visita). Outros formatos passam direto. */
function figure(str) {
  const m = /^(\D*?)(\d[\d.]*)(,\d+)?(%|x)?$/.exec(str);
  if (!m) return str;
  const [, pre, int, dec, suf] = m;
  return html`${pre.trim() ? html`<small class="u">${pre.trim()}</small>` : ''}<span class="int" data-count="${int.replace(/\./g, '')}">${int}</span>${dec ? html`<small>${dec}</small>` : ''}${suf ? html`<small class="u">${suf}</small>` : ''}`;
}
/** Minigráfico de linha: pontos [{k, v}]; cada ponto acende com a mira do gráfico principal (mesmo `k`). */
function spark(pts) {
  if (!pts || pts.length < 2 || !pts.some(p => p.v)) return '';
  const W = 160, H = 28, max = Math.max(...pts.map(p => p.v)), min = Math.min(0, ...pts.map(p => p.v)), span = max - min || 1;
  const xy = pts.map((p, i) => [f1(i / (pts.length - 1) * W), f1(H - 3 - (p.v - min) / span * (H - 6))]);
  const line = xy.map(q => q.join(',')).join(' '), [ex, ey] = xy[xy.length - 1];
    // Altura fixa e largura livre (preserveAspectRatio none); os pontos são traços de comprimento zero, que continuam redondos.
  return html`<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="M0,${H} L${line.replaceAll(' ', ' L')} L${W},${H}Z"/><polyline class="ln" pathLength="1" points="${line}"/>${xy.map(([x, y], i) => html`<path class="pt" data-k="${pts[i].k}" d="M${x},${y}h0"/>`)}<path class="end" d="M${ex},${ey}h0"/></svg>`;
}
/** Verde acima do ponto de equilíbrio, vermelho abaixo, neutro em cima dele ou sem valor (ROAS: 1; lucro: 0). */
export const tone = (v, even = 0) => v == null || v === even ? '' : v > even ? 'good' : 'bad';
/** Indicador: kpi(id, rótulo, atual, anterior, formatador, { invert, feature, spark: [{k, v}], tone: 'good'|'bad' }) */
export const kpi = (id, t, cur, prev, fmt, { invert = false, feature = false, spark: pts = null, tone: tn = '' } = {}) =>
  html`<div class="kpi${feature ? ' feature' : ''}${tn ? ' ' + tn : ''}"><span class="lbl">${t}</span><b id="${id}">${figure(fmt(cur))}</b>${spark(pts)}${delta(cur, prev, fmt, invert)}</div>`;

/** Lista com barra de fundo proporcional; cada linha vira filtro quando `col` é passado. */
export function list(ctx, rows, col, { head = '', cols = [['Visitantes', 'v'], ['Views', 'n']], filter = true, label = (c, k) => k === '' ? '(vazio)' : k, prefix = 'f_', empty = 'Nada registrado neste período. Tente um intervalo maior.' } = {}) {
  if (!rows?.length) return html`<p class="empty">${empty}</p>`;
  const max = Math.max(1e-9, ...rows.map(r => Math.abs(r[cols[0][1]] ?? 0)));
  return html`<div class="tw"><table class="list"><thead><tr><th scope="col">${head}</th>${cols.map(c => html`<th scope="col">${c[0]}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>
<td><span class="bar-bg" style="width:${(Math.abs(r[cols[0][1]] ?? 0) / max * 100).toFixed(1)}%"></span>${filter && col && ctx.q ? html`<a href="${link(ctx.q, { [prefix + col]: r.k })}" title="Filtrar por ${label(col, r.k)}">${label(col, r.k)}</a>` : html`<span style="position:relative">${label(col, r.k)}</span>`}</td>
${cols.map(([, key, fmt]) => html`<td>${fmt ? fmt(r[key]) : num(r[key])}</td>`)}</tr>`)}</tbody></table></div>`;
}

const f1 = n => n.toFixed(1);

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
const barPath = (x, w, y0, y1) => {
  const r = Math.min(4, w / 2, y0 - y1);
  return `M${f1(x)},${y0}V${f1(y1 + r)}Q${f1(x)},${f1(y1)} ${f1(x + r)},${f1(y1)}H${f1(x + w - r)}Q${f1(x + w)},${f1(y1)} ${f1(x + w)},${f1(y1 + r)}V${y0}Z`;
};
const compact = n => Math.abs(n) >= 1000 ? new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : num(n);

/**
 * Barras (série principal) + linha opcional (segunda medida, mesma unidade) + tracejado do período anterior.
 * Tooltip por coluna e tabela acessível. Um único eixo y.
 */
export function chart(cur, prev, { label = 'Visitantes', color = 'var(--s1)', fmt = num, line = null, h = 240, tip = () => [], empty = 'Nada registrado neste período. Tente um intervalo maior.', marks = [] } = {}) {
  if (![...cur, ...(prev || [])].some(d => d.v || (line && d[line.key]))) return html`<div class="chart-empty" style="min-height:${Math.round(h * 0.75)}px">${RASTRO}<p>${empty}</p></div>`;
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
    return html`<g class="col" data-k="${d.k ?? d.label}" style="--i:${i}" data-tip="${t}"><rect class="hit" x="${f1(x)}" y="${T}" width="${f1(step)}" height="${ph}"/>${top != null ? html`<path fill="${color}" d="${barPath(x + (step - bw) / 2, bw, T + ph, top)}"/>` : ''}</g>`;
  });
  const pts = vals => vals.map((v, i) => `${f1(cx(i))},${f1(y(v))}`).join(' ');
  const byK = new Map();
  for (const mk of marks) { const i = cur.findIndex(d => d.k === mk.k); if (i >= 0) byK.set(i, [...(byK.get(i) || []), mk.text]); }
  const flags = [...byK].map(([i, texts]) => html`<g class="flag" data-tip="${cur[i].label}|${texts.map(x => x.replaceAll("|", "/")).join("|")}"><rect class="mkh" x="${f1(cx(i) - 8)}" y="${T}" width="16" height="${ph}"/><line class="mk" x1="${f1(cx(i))}" x2="${f1(cx(i))}" y1="${T + 6}" y2="${T + ph}"/><circle class="mkd" cx="${f1(cx(i))}" cy="${T + 5}" r="4"/></g>`);
  const lv = line && cur.map(d => d[line.key]);
  return html`<div class="legend" aria-hidden="true"><span><i class="sw" style="background:${color}"></i>${label}</span>${line ? html`<span><i class="sw line" style="border-color:${line.color}"></i>${line.label}</span>` : ''}${prev ? html`<span><i class="sw dash"></i>Período anterior</span>` : ''}${flags.length ? html`<span><i class="sw mkl"></i>Início ou fim de campanha</span>` : ''}</div>
<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="Gráfico: ${label}${line ? ' e ' + line.label : ''} por período">
${ticks.map(t => html`<line class="${t ? 'gl' : 'bl'}" x1="${L}" x2="${W - R}" y1="${f1(y(t) - 0.5)}" y2="${f1(y(t) - 0.5)}"/><text x="${L - 8}" y="${f1(y(t) + 4)}" text-anchor="end">${compact(t)}</text>`)}
${cols}${line ? html`<polyline class="serl" pathLength="1" stroke="${line.color}" points="${pts(lv)}" pointer-events="none"/><circle class="end-dot" stroke="${line.color}" cx="${f1(cx(n - 1))}" cy="${f1(y(lv[n - 1]))}" r="4" pointer-events="none"/>` : ''}${prev ? html`<polyline class="prevl" points="${pts(prev.map(d => d.v))}" pointer-events="none"/>` : ''}${flags}
${cur.map((d, i) => i % every === 0 ? html`<text x="${f1(cx(i))}" y="${h - 6}" text-anchor="middle">${d.label}</text>` : '')}</svg>
<details class="data"><summary>Ver dados em tabela</summary><div class="tw"><table class="data"><thead><tr><th>Período</th><th>${label}</th>${line ? html`<th>${line.label}</th>` : ''}${prev ? html`<th>Anterior</th>` : ''}</tr></thead>
<tbody>${cur.map((d, i) => html`<tr><td>${d.label}</td><td>${fmt(d.v)}</td>${line ? html`<td>${fmt(d[line.key])}</td>` : ''}${prev ? html`<td>${fmt(prev[i]?.v)}</td>` : ''}</tr>`)}</tbody></table></div></details>`;
}

/** Participação em barras horizontais ordenadas (mais fácil de comparar que rosca); rótulo e valor sempre escritos. */
export function share(items, { fmt = num, empty = 'Nenhuma venda aprovada neste período.' } = {}) {
  const sum = items.reduce((a, x) => a + x.v, 0);
  if (!sum) return html`<p class="empty">${empty}</p>`;
  const rows = [...items].sort((a, b) => b.v - a.v), max = rows[0].v;
  return html`<ul class="share">${rows.map(x => html`<li><span><b>${x.label}</b>${x.n != null ? html`<small>${num(x.n)} vendas</small>` : ''}</span><span><span class="v">${fmt(x.v)}</span><small>${pct(x.v / sum)}</small></span><span class="tr"><i style="width:${(x.v / max * 100).toFixed(1)}%"></i></span></li>`)}</ul>`;
}

export const notice = (text, err) => text ? html`<div class="notice${err ? ' err' : ''}" role="${err ? 'alert' : 'status'}">${err ? icon('triangle-alert') : ''}<div>${text}</div></div>` : '';
