// Checkout com Pix: página pública do produto, página do Pix (QR e copia e cola) e o painel de produtos e pedidos.
import { html, raw, layout, pageHead, notice, money, icon } from './ui.js';

const when = (site, ts) => new Date(ts).toLocaleString('pt-BR', { timeZone: site.timezone, dateStyle: 'short', timeStyle: 'short' });
const head = (site, p) => html`<p class="muted" style="margin:0 0 4px">${site.name}</p><h1>${p.name}</h1><p class="price">${money(p.price, site.currency)}</p>`;

export function productPage(ctx, site, p, keep, err) {
  return layout(ctx, p.name, html`<div class="auth pay"><section class="card">${head(site, p)}${notice(err, true)}
<form method="post" action="/p/${p.slug}" class="stack">${keep.map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
<label class="f">Nome<input name="name" required maxlength="120" autocomplete="name"></label>
<label class="f">E-mail<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
<label class="f">WhatsApp<span>Com DDD. Para enviar o acesso e avisar sobre o pagamento.</span><input name="phone" type="tel" required inputmode="tel" autocomplete="tel" placeholder="(11) 99999-0000"></label>
<button class="primary">Gerar Pix</button></form>
<p class="muted small">Seus dados ficam cifrados e são usados só para este pedido.</p></section></div>`, { bare: true });
}

export function payPage(ctx, site, p, sale, code, svg) {
  const paid = sale.status === 'paid';
  return layout(ctx, `Pix · ${p.name}`, html`<div class="auth pay"><section class="card">${head(site, p)}
${paid ? html`<p class="okline">${icon('check')}<b>Pagamento confirmado.</b> Obrigado pela compra.</p>`
    : sale.status === 'pending' ? html`<ol class="steps"><li>Abra o app do seu banco e escolha pagar com Pix.</li><li>Leia o QR Code ou cole o código abaixo.</li><li>Esta página atualiza sozinha quando o pagamento for confirmado.</li></ol>
<div class="qr">${raw(svg)}</div>
<label class="f">Pix copia e cola<input id="pix" value="${code}" readonly></label>
<button type="button" class="primary" data-act="copy" data-for="pix">Copiar código</button>
<p class="muted small">Pedido <code>${sale.order_id}</code>. Recebedor: ${p.pix_name}.</p>`
      : html`<p>Este pedido não está mais aberto. Volte à página do produto para gerar um novo Pix.</p><a class="btn" href="/p/${p.slug}">Voltar</a>`}
</section></div>`, { bare: true, refresh: sale.status === 'pending' ? 15 : 0 });
}

const STATUS = { paid: ['Pago', 'ok'], pending: ['Aguardando Pix', 'warn'], refused: ['Cancelado', 'bad'], refunded: ['Reembolsado', ''], chargeback: ['Contestado', 'bad'] };
export function panelPage(ctx, products, orders, d, msg, err) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}/checkout`;
  return layout(ctx, `Checkout · ${s.name}`, html`
${pageHead(`${s.name} · Checkout`, 'Checkout com Pix', 'Página de pagamento com Pix copia e cola na sua chave, sem intermediador e sem taxa. A venda entra nos relatórios, no CRM e na Conversions API como as das plataformas.')}
${notice(msg)}${notice(err, true)}${d.pii ? '' : notice('O checkout precisa da chave DATA_KEY configurada no servidor: os dados do comprador ficam cifrados.', true)}
<section class="card"><h2>Pedidos</h2>
${orders.length ? html`<div class="tw"><table class="data txt rows-sm"><thead><tr><th>Pedido</th><th>Produto</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
${orders.map(o => html`<tr><td data-label="Pedido"><code>${o.order_id}</code><br><small class="muted">${when(s, o.ts)}</small></td><td data-label="Produto">${o.product}</td>
<td class="num" data-label="Valor">${money(o.gross, o.currency)}</td><td data-label="Situação"><span class="tag ${STATUS[o.status]?.[1] || ''}">${STATUS[o.status]?.[0] || o.status}</span></td>
<td>${ctx.canEdit && o.status === 'pending' ? html`<form method="post" action="${base}"><input type="hidden" name="action" value="paid"><input type="hidden" name="order" value="${o.order_id}"><button>Marcar como pago</button></form>` : ''}</td></tr>`)}</tbody></table></div>`
    : html`<p class="empty">Nenhum pedido ainda. Crie um produto e use o link dele no botão de compra.</p>`}</section>

<section class="card" style="margin-top:16px"><h2>Produtos</h2>
${products.length ? html`<div class="tw"><table class="data txt rows-sm"><thead><tr><th>Produto</th><th class="num">Preço</th><th>Link para o botão</th><th></th></tr></thead><tbody>
${products.map(p => html`<tr><td data-label="Produto"><b>${p.name}</b>${p.active ? '' : html`<br><small class="muted">desligado</small>`}</td><td class="num" data-label="Preço">${money(p.price, s.currency)}</td>
<td data-label="Link"><code>${d.base}/p/${p.slug}</code></td><td>${ctx.canEdit ? html`<form method="post" action="${base}"><input type="hidden" name="action" value="toggle"><input type="hidden" name="product" value="${p.id}"><button class="link">${p.active ? 'Desligar' : 'Ligar'}</button></form>` : ''}</td></tr>`)}</tbody></table></div>
<p class="muted">No botão do site, use o link com o atributo <code>data-rastro-rid</code> para a venda casar com o clique do anúncio: <code>&lt;a href="${d.base}/p/…" data-rastro-rid&gt;</code></p>`
    : html`<p class="empty">Nenhum produto ainda.</p>`}</section>

<div class="grid two" style="align-items:start">
${ctx.canEdit ? html`<section class="card"><h2>Novo produto</h2><form method="post" action="${base}" class="stack" style="margin-top:14px;max-width:none"><input type="hidden" name="action" value="product"><div class="fields">
<label class="f">Produto<input name="name" required maxlength="120" placeholder="Curso completo"></label>
<label class="f">Preço<input name="price" required inputmode="decimal" placeholder="97,00"></label>
<label class="f">Chave Pix<span>E-mail, CPF, CNPJ, aleatória ou telefone com +55</span><input name="pix_key" required maxlength="77"></label>
<label class="f">Nome do recebedor<span>Como aparece no banco, até 25 letras</span><input name="pix_name" required maxlength="40"></label>
<label class="f">Cidade<input name="pix_city" required maxlength="40" placeholder="Sao Paulo"></label></div>
<div><button class="primary">Criar produto</button></div></form></section>` : ''}

<section class="card"><h2>Confirmação automática</h2>
<p class="muted">O Pix na chave não avisa sozinho que foi pago. Sem integração, use <b>Marcar como pago</b> acima. Se o seu banco tem webhook de Pix recebido (Efí, Inter, Mercado Pago, Asaas e outros), envie para a URL abaixo o id do pedido, que vai no campo de identificação (txid) do Pix:</p>
<pre class="code"><code>${d.hook}</code></pre>
<pre class="code"><code>{ "order_id": "PX…", "status": "paid" }</code></pre>
<p class="muted">Na confirmação, a compra vai para a Meta e o GA4 com os dados do pedido, o contato passa para Ganhou e a recuperação para.</p></section></div>`);
}
