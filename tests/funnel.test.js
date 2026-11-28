// Funil dos anúncios: qual fonte vale em cada etapa e onde fica o gargalo (sem banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFunnel, compareFunnel, siteStages } from '../src/sales/funnel.js';

const meta = { imp: 100000, clicks: 1500, link: 1200, lpv: 600, ic: 40, buy: 9, spend: 1000 };
const on = { tracking: true, webhooks: true };

test('funil: página e checkout pelo script, compra pelo webhook, impressão e clique pela Meta', () => {
  const st = buildFunnel(meta, { visits: 900, engaged: 420, checkout: 25 }, { n: 7 }, on);
  const by = Object.fromEntries(st.map(s => [s.k, s]));
  assert.deepEqual(st.map(s => s.k), ['imp', 'click', 'visit', 'engage', 'checkout', 'buy']);
  assert.equal(by.click.v, 1200, 'clique no link, não todos os cliques');
  assert.deepEqual([by.visit.v, by.visit.src, by.visit.alt], [900, 'sinqfy', 600], 'visita do script; a Meta fica como comparação');
  assert.deepEqual([by.checkout.v, by.checkout.src], [25, 'sinqfy']);
  assert.deepEqual([by.buy.v, by.buy.src, by.buy.alt], [7, 'sinqfy', 9], 'compra confirmada pelo webhook');
  assert.equal(by.buy.cost, 1000 / 7, 'custo por compra');
});

test('funil: sem script nem webhook, usa a Meta e não inventa a etapa de interação', () => {
  const st = buildFunnel(meta, {}, {}, { tracking: false, webhooks: false });
  assert.deepEqual(st.map(s => [s.k, s.v, s.src]), [['imp', 100000, 'meta'], ['click', 1200, 'meta'], ['visit', 600, 'meta'], ['checkout', 40, 'meta'], ['buy', 9, 'meta']]);
});

test('funil: gargalo é a etapa que mais caiu contra o período anterior da própria campanha', () => {
  const before = buildFunnel(meta, { visits: 900, engaged: 420, checkout: 60 }, { n: 20 }, on); // checkout 14%, compra 33%
  const now = buildFunnel(meta, { visits: 900, engaged: 420, checkout: 50 }, { n: 5 }, on); // checkout 12% (caiu pouco), compra 10% (caiu muito)
  compareFunnel(now, before);
  const by = Object.fromEntries(now.map(s => [s.k, s]));
  assert.ok(by.buy.gargalo);
  assert.equal(now.filter(s => s.gargalo).length, 1);
  assert.equal(by.buy.before, 20 / 60);
});

test('funil: sem período anterior ou com base pequena, não aponta gargalo', () => {
  assert.ok(!compareFunnel(buildFunnel(meta, { visits: 900, engaged: 420, checkout: 25 }, { n: 1 }, on), null).some(s => s.gargalo));
  const small = { imp: 500, link: 10 };
  assert.ok(!compareFunnel(buildFunnel(small, { visits: 1 }, { n: 0 }, on), buildFunnel(small, { visits: 9 }, { n: 0 }, on)).some(s => s.gargalo));
});

test('funil self-serve: cadastro, 1º app e publicação no lugar de interação e checkout', () => {
  const m = { ...meta, ic: 0, reg: 300, build: 120, pub: 40 };
  const st = buildFunnel(m, { visits: 900, regs: 320, builds: 100, pubs: 30 }, { n: 7 }, on);
  const by = Object.fromEntries(st.map(s => [s.k, s]));
  assert.deepEqual(st.map(s => s.k), ['imp', 'click', 'visit', 'reg', 'build', 'pub', 'buy']);
  assert.deepEqual([by.reg.v, by.reg.src, by.reg.alt], [320, 'sinqfy', 300], 'cadastro pelo nosso evento, Meta como comparação');
  assert.equal(by.reg.rate, 320 / 900, 'cadastro ÷ visita');
  assert.equal(by.reg.cost, 1000 / 320, 'custo por cadastro');
  assert.equal(by.build.rate, 100 / 320, 'ativação: 1º app ÷ cadastro');
  assert.equal(by.build.cost, 1000 / 100, 'custo por 1º app');
  assert.equal(by.pub.rate, 30 / 100, 'publicado ÷ 1º app');
  assert.equal(by.buy.rate, 7 / 30, 'compra ÷ publicado');
  assert.ok(!by.engage && !by.checkout, 'sem InitiateCheckout, o self-serve não mostra etapa de checkout');
  // Com InitiateCheckout (modal de paywall quando acabam os créditos), o checkout entra entre a publicação e a compra:
  const withCo = buildFunnel({ ...m, ic: 15 }, { visits: 900, regs: 320, builds: 100, pubs: 30, checkout: 18 }, { n: 7 }, on);
  assert.deepEqual(withCo.map(s => s.k), ['imp', 'click', 'visit', 'reg', 'build', 'pub', 'checkout', 'buy']);
  // Cliente tradicional que só usa CompleteRegistration (sem first_build nem app_published) não vê colunas vazias de app:
  const onlyReg = buildFunnel({ ...meta, reg: 50 }, { visits: 900, regs: 60, checkout: 20 }, { n: 7 }, on);
  assert.deepEqual(onlyReg.map(s => s.k), ['imp', 'click', 'visit', 'reg', 'checkout', 'buy']);
});

test('funil completo self-serve: mesmas etapas na tela de Funis, sem interação e checkout', () => {
  const { stages } = siteStages({ ...meta, reg: 300, build: 120, pub: 40 }, { visits: 900, ads: 480, regs: 280, builds: 90, pubs: 25 },
    { buyers: 12, orders: 15, revenue: 1500 });
  const by = Object.fromEntries(stages.map(s => [s.k, s]));
  assert.deepEqual(stages.map(s => s.k), ['imp', 'click', 'visit', 'reg', 'build', 'pub', 'buy']);
  assert.deepEqual([by.reg.v, by.reg.src, by.reg.cost, by.reg.costT], [280, 'Script', 1000 / 280, 'Custo por cadastro']);
  assert.equal(by.build.rate, 90 / 280);
  assert.equal(by.pub.rate, 25 / 90);
  assert.equal(by.buy.rate, 12 / 25);
});

test('funil completo: todas as origens, taxa da visita só com quem veio do anúncio e compradores sem contar o order bump', () => {
  const { stages, spend, metaBuys } = siteStages(meta, { visits: 900, ads: 480, engaged: 300, checkout: 60 }, { buyers: 12, orders: 15, revenue: 1500 });
  const by = Object.fromEntries(stages.map(s => [s.k, s]));
  assert.deepEqual(stages.map(s => s.k), ['imp', 'click', 'visit', 'engage', 'checkout', 'buy']);
  assert.deepEqual([by.click.v, by.click.rate, by.visit.v, by.visit.rate], [1200, 0.012, 900, 0.4], 'visita: 480 dos anúncios sobre 1200 cliques, não 900');
  assert.deepEqual([by.buy.v, by.buy.orders, by.buy.rate, by.buy.cost, by.imp.cost], [12, 15, 0.2, 1000 / 12, 10]);
  assert.deepEqual([spend, metaBuys], [1000, 9]);
  const noAds = siteStages({}, { visits: 50, ads: 0, engaged: 20, checkout: 5 }, { buyers: 1 }).stages;
  assert.deepEqual(noAds.map(s => s.k), ['visit', 'engage', 'checkout', 'buy'], 'sem Meta, começa na visita');
  assert.equal(noAds[0].rate, undefined);
});
