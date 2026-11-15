// Recuperação de venda pendente (sequência e pedidos) e públicos para remarketing.
import { html, raw, layout, pageHead, notice, num, money } from './ui.js';
import { VARS } from '../recovery.js';

const when = (ctx, ts) => new Date(ts).toLocaleString('pt-BR', { timeZone: ctx.site.timezone, dateStyle: 'short', timeStyle: 'short' });
const STATUS = { waiting: ['Na fila', 'warn'], sending: ['Enviando', 'warn'], paid: ['Pagou', 'ok'], stopped: ['Parada', ''], done: ['Sequência concluída', ''], failed: ['Falhou', 'bad'] };

export function recoveryPage(ctx, cfg, rows, d, msg, err) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`;
  const steps = [0, 1, 2].map(i => cfg.steps[i] || {});
  return layout(ctx, `Recuperação · ${s.name}`, html`
${pageHead(`${s.name} · Recuperação`, 'Recuperação de venda pendente', 'Quem gera boleto ou Pix e não paga recebe uma sequência no WhatsApp. Para quando o pagamento chega, a venda é recusada ou a pessoa responde.')}
${notice(msg)}${notice(err, true)}
${d.ready ? '' : notice(html`O envio pela Cloud API ainda não está configurado. Informe o ID do número e o token em <a href="${base}/whatsapp">WhatsApp</a>; até lá, nenhum pedido entra na sequência.`, true)}
<section class="card"><h2>Pedidos</h2>
${rows.length ? html`<div class="tw"><table class="data txt rows-sm"><thead><tr><th>Pedido</th><th>Contato</th><th>Produto</th><th class="num">Valor</th><th>Situação</th><th class="num">Mensagens</th><th>Próxima</th></tr></thead><tbody>
${rows.map(p => html`<tr><td data-label="Pedido"><code>${p.order_id}</code><br><small class="muted">${when(ctx, p.created)}</small></td><td data-label="Contato"><a href="${base}/contacts/${p.contact_id}">${p.who}</a></td>
<td data-label="Produto">${p.product || '-'}</td><td class="num" data-label="Valor">${money(p.gross, s.currency)}</td>
<td data-label="Situação">${(([t, c]) => html`<span class="tag ${c}">${t}</span>`)(p.status === 'waiting' && !p.next_at ? ['Aguardando pagamento', ''] : STATUS[p.status])}${p.last_error ? html`<br><small class="muted">${p.last_error}</small>` : ''}</td>
<td class="num" data-label="Mensagens">${num(p.step)}</td><td data-label="Próxima">${p.next_at && (p.status === 'waiting' || p.status === 'sending') ? when(ctx, p.next_at) : '-'}</td></tr>`)}</tbody></table></div>`
    : html`<p class="empty">Nenhum pedido pendente ainda. Eles chegam pelos webhooks das plataformas de venda (boleto impresso, Pix gerado) e pelo checkout com Pix.</p>`}</section>

${ctx.canEdit ? html`<section class="card" style="margin-top:16px"><h2>Sequência</h2>
<p class="muted">Quem começa a conversa é você, então a Meta só entrega <b>modelos aprovados</b> (Gerenciador do WhatsApp, categoria Utilidade ou Marketing). Crie o modelo com as variáveis na ordem que informar abaixo: ${VARS.map((v, i) => html`${i ? ', ' : ''}<code>${v}</code>`)}. O texto livre só é usado quando a pessoa escreveu nas últimas 24 horas.</p>
<form method="post" action="${base}/recovery" class="stack" style="max-width:none">
<label class="f">Link de pagamento<span>Vai na variável <code>link</code>. Ex.: a página de checkout ou de suporte.</span><input name="link" value="${cfg.link || ''}" placeholder="https://" maxlength="300"></label>
${steps.map((st, i) => html`<fieldset class="step-box"><legend>Mensagem ${i + 1}</legend><div class="fields">
<label class="f">Depois de (minutos)<span>Contados a partir do pedido. Vazio desliga o passo.</span><input name="after${i}" type="number" min="5" max="10080" value="${st.after ?? ''}"></label>
<label class="f">Modelo aprovado<span>Nome exato, ex.: pagamento_pendente</span><input name="template${i}" value="${st.template || ''}" pattern="[a-z0-9_]+" maxlength="512"></label>
<label class="f">Idioma do modelo<input name="lang${i}" value="${st.lang || 'pt_BR'}" maxlength="10"></label>
<label class="f">Variáveis do modelo<span>Na ordem, separadas por vírgula</span><input name="params${i}" value="${(st.params || []).join(', ')}" placeholder="nome, produto, link"></label></div>
<label class="f">Texto livre (dentro de 24 h)<span>Pode usar ${VARS.map(v => `{${v}}`).join(' ')}</span><textarea name="text${i}" maxlength="1000" style="min-height:72px;font-family:var(--sans)">${st.text || ''}</textarea></label></fieldset>`)}
<div><button class="primary">Salvar sequência</button></div></form></section>` : ''}`);
}

export function audiencesPage(ctx, list) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}/audiences`;
  return layout(ctx, `Públicos · ${s.name}`, html`
${pageHead(`${s.name} · Públicos`, 'Públicos para remarketing', raw('Arquivos com e-mail, telefone e primeiro nome em SHA-256, no formato da lista de clientes da Meta. No Gerenciador de Anúncios, em Públicos, crie um <b>Público personalizado</b> a partir de uma lista de clientes e envie o arquivo. Cada download fica registrado.'))}
<section class="card"><div class="tw"><table class="data txt rows-sm"><thead><tr><th>Público</th><th class="num">Contatos</th><th></th></tr></thead><tbody>
${list.map(a => html`<tr><td data-label="Público"><b>${a.label}</b><br><small class="muted">${a.desc}</small></td><td class="num" data-label="Contatos">${num(a.n)}</td>
<td>${a.n ? html`<a class="btn" href="${base}/${a.key}.csv" download>Baixar CSV</a>` : html`<span class="muted">vazio</span>`}</td></tr>`)}</tbody></table></div>
<p class="muted" style="margin-top:12px">A Meta só usa a lista a partir de 100 pessoas encontradas. Contatos sem e-mail nem telefone ficam de fora.</p></section>`);
}
