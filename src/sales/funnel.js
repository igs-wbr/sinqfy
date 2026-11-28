// Funil dos anúncios da Meta: do anúncio visto até a compra, cada etapa com a fonte mais confiável.
// Regra da fonte: o que acontece na página vem do nosso script (primeira parte, não sofre bloqueio de navegador nem
// perda do iOS); a compra vem do webhook da plataforma (dinheiro confirmado). A Meta só manda nas etapas que só ela
// vê (impressão e clique) e serve de reserva quando ainda não temos o dado (script sem o evento, plataforma sem webhook).
// Sem referência de mercado: o gargalo é a etapa cuja taxa mais caiu em relação ao período anterior da própria campanha.

const MIN_BASE = 20; // abaixo disso a taxa é ruído e a etapa não vira gargalo

const choose = (ours, theirs, trust) => trust && ours > 0 ? { v: ours, src: 'sinqfy', alt: theirs, altSrc: 'meta' }
  : theirs > 0 ? { v: theirs, src: 'meta', alt: ours, altSrc: 'sinqfy' } : { v: ours, src: 'sinqfy', alt: theirs, altSrc: 'meta' };

/** O site usa o funil self-serve (cadastro, primeiro app, publicação) quando alguma dessas etapas tem número. */
export const isSelfServe = (meta, own) => !!(Number(own.regs) || Number(own.builds) || Number(own.pubs) || Number(meta.reg) || Number(meta.build));

/**
 * meta: { imp, clicks, link, lpv, ic, buy, reg, build, pub, spend } somado da ad_spend
 * own: { visits, engaged, checkout, regs, builds, pubs } de quem chegou pela campanha; sales: { n };
 * tracking/webhooks: há dado nosso no período/site.
 * Devolve as etapas com valor, fonte, valor da outra fonte, taxa sobre a etapa anterior (rate) e custo por pessoa.
 * Com eventos de produto, o meio do funil vira cadastro, primeiro app e aplicativo publicado no lugar de interação e checkout.
 */
export function buildFunnel(meta, own, sales, { tracking, webhooks }) {
  const n = x => Number(x) || 0;
  const self = isSelfServe(meta, own);
  const st = [
    { k: 'imp', t: 'Viu o anúncio', d: 'Impressões', v: n(meta.imp), src: 'meta' },
    { k: 'click', t: 'Clicou no anúncio', d: 'Cliques no link', v: n(meta.link) || n(meta.clicks), src: 'meta' },
    { k: 'visit', t: 'Chegou à página', d: 'Visitantes da campanha', ...choose(n(own.visits), n(meta.lpv), tracking) },
    ...(self ? [
      { k: 'reg', t: 'Criou conta', d: 'CompleteRegistration', costT: 'Custo por cadastro', ...choose(n(own.regs), n(meta.reg), tracking) },
      ...(n(own.builds) || n(meta.build) ? [{ k: 'build', t: 'Gerou 1º app', d: 'first_build · ativação', costT: 'Custo por 1º app', ...choose(n(own.builds), n(meta.build), tracking) }] : []),
      ...(n(own.pubs) || n(meta.pub) ? [{ k: 'pub', t: 'Publicou app', d: 'app_published', costT: 'Custo por app publicado', ...choose(n(own.pubs), n(meta.pub), tracking) }] : []),
      ...(n(own.checkout) || n(meta.ic) ? [{ k: 'checkout', t: 'Foi para o checkout', d: 'Início de checkout', ...choose(n(own.checkout), n(meta.ic), tracking) }] : []),
    ] : [
      ...(tracking ? [{ k: 'engage', t: 'Interagiu na página', d: 'Viu 2 páginas ou mais, ou disparou um evento', v: n(own.engaged), src: 'sinqfy' }] : []),
      { k: 'checkout', t: 'Foi para o checkout', d: 'Início de checkout', ...choose(n(own.checkout), n(meta.ic), tracking) },
    ]),
    { k: 'buy', t: 'Comprou', d: 'Vendas aprovadas', ...choose(n(sales.n), n(meta.buy), webhooks) },
  ];
  st.forEach((s, i) => {
    if (n(meta.spend) && s.v) s.cost = n(meta.spend) / s.v;
    const prev = st[i - 1];
    if (prev?.v) Object.assign(s, { rate: s.v / prev.v, base: prev.v });
  });
  return st;
}

/** Compara cada taxa com a da mesma etapa no período anterior (before) e marca como gargalo a que mais caiu. */
export function compareFunnel(cur, prev) {
  const old = new Map((prev || []).map(s => [s.k, s]));
  let worst = null;
  for (const s of cur) {
    const p = old.get(s.k);
    if (s.rate == null || p?.rate == null) continue;
    s.before = p.rate;
    s.change = s.rate / p.rate;
    if (s.base >= MIN_BASE && p.base >= MIN_BASE && s.change < 1 && (!worst || s.change < worst.change)) worst = s;
  }
  if (worst) worst.gargalo = true;
  return cur;
}

/**
 * Funil completo do site (tela Funis): todas as origens, não só os anúncios. Impressão e clique só a Meta vê;
 * visita, interação e checkout vêm do script; compra, do webhook (compradores: o order bump do mesmo clique não conta duas vezes).
 * A taxa da visita é a das visitas vindas de anúncio sobre os cliques, para não passar de 100% com o tráfego orgânico.
 */
export function siteStages(meta, own, sales) {
  const n = x => Number(x) || 0, spend = n(meta.spend), self = isSelfServe(meta, own);
  const pick = (ours, theirs, src, costT) => ({ v: ours || theirs, src: ours ? src : 'Meta', alt: theirs, altSrc: 'Meta', ...(costT && { costT }) });
  const st = [
    ...(n(meta.imp) ? [{ k: 'imp', t: 'Viram um anúncio', d: 'Impressões na Meta', v: n(meta.imp), src: 'Meta', cost: spend && spend / n(meta.imp) * 1000, costT: 'CPM' }] : []),
    ...(n(meta.imp) ? [{ k: 'click', t: 'Clicaram no anúncio', d: 'Cliques no link', v: n(meta.link) || n(meta.clicks), src: 'Meta', costT: 'Custo por clique' }] : []),
    { k: 'visit', t: 'Visitaram o site', d: 'Visitantes de todas as origens', v: n(own.visits), src: 'Script', ads: n(own.ads) },
    ...(self ? [
      { k: 'reg', t: 'Criaram conta', d: 'CompleteRegistration (cadastro concluído)', ...pick(n(own.regs), n(meta.reg), 'Script', 'Custo por cadastro') },
      ...(n(own.builds) || n(meta.build) ? [{ k: 'build', t: 'Geraram o 1º app', d: 'first_build (ativação)', ...pick(n(own.builds), n(meta.build), 'Script', 'Custo por 1º app') }] : []),
      ...(n(own.pubs) || n(meta.pub) ? [{ k: 'pub', t: 'Publicaram o app', d: 'app_published', ...pick(n(own.pubs), n(meta.pub), 'Script', 'Custo por app publicado') }] : []),
      ...(n(own.checkout) ? [{ k: 'checkout', t: 'Iniciaram o checkout', d: 'Visitantes com início de checkout', v: n(own.checkout), src: 'Script', costT: 'Custo por checkout' }] : []),
    ] : [
      { k: 'engage', t: 'Interagiram', d: 'Viram 2 páginas ou mais, ou dispararam um evento', v: n(own.engaged), src: 'Script' },
      { k: 'checkout', t: 'Iniciaram o checkout', d: 'Visitantes com início de checkout', v: n(own.checkout), src: 'Script', costT: 'Custo por checkout' },
    ]),
    { k: 'buy', t: 'Compraram', d: 'Compradores com venda aprovada', v: n(sales.buyers), src: 'Webhook', orders: n(sales.orders), revenue: n(sales.revenue), costT: 'Custo por compra' },
  ];
  st.forEach((s, i) => {
    if (s.costT && s.k !== 'imp' && spend && s.v) s.cost = spend / s.v;
    const prev = st[i - 1];
    if (!prev?.v) return;
    s.rate = s.k === 'visit' ? (s.ads ? Math.min(1, s.ads / prev.v) : null) : s.v / prev.v;
  });
  return { stages: st, spend, metaBuys: n(meta.buy) };
}
