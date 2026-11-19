// CRM: quadro por coluna, lista de contatos, ficha com linha do tempo e configuração das colunas e das entradas de lead.
import { html, raw, layout, pageHead, notice, num, money, icon } from './ui.js';
import { SOURCES } from '../crm.js';
import { maskEmail, maskPhone } from '../pii.js';

const KIND = { open: 'Em andamento', won: 'Ganho', lost: 'Perdido' };
const days = ts => Math.max(0, Math.floor((Date.now() - ts) / 864e5));
const when = (ctx, ts) => new Date(ts).toLocaleString('pt-BR', { timeZone: ctx.site.timezone, dateStyle: 'short', timeStyle: 'short' });
const label = c => c.name || maskEmail(c.email) || maskPhone(c.phone) || `Contato ${c.id}`;
const origin = c => html`<span class="tag${c.source === 'meta_lead' || c.campaign_key ? ' ok' : ''}">${c.source === 'meta_lead' ? 'Meta Lead Ads' : c.utm_source ? c.utm_source : SOURCES[c.source] || c.source}</span>`;
const ERR = { dados: 'Preencha o nome e confira o evento (letras, números e _).', nome: 'Já existe uma coluna com esse nome.', minimo: 'O quadro precisa de pelo menos 2 colunas.',
  ocupada: 'Mova os contatos dessa coluna antes de apagá-la.' };

export function boardPage(ctx, cols, contacts, err) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`;
  const by = new Map(cols.map(c => [c.id, []]));
  for (const c of contacts) (by.get(c.stage_id) || by.get(cols[0].id)).push(c);
  return layout(ctx, `CRM · ${s.name}`, html`
${pageHead(`${s.name} · CRM`, raw('Do lead à <em>venda</em>'), `${num(contacts.length)} contatos. Arraste o card para mudar de coluna; colunas com evento avisam a Meta.`,
    ctx.canEdit ? html`<a class="btn" href="${base}/crm/stages">${icon('settings', 16)} Colunas e entradas</a>` : '')}
${err === 'dados' ? notice('Informe pelo menos e-mail ou telefone válido.', true) : ''}
${ctx.canEdit ? html`<details class="newlead" style="margin-bottom:16px"><summary class="btn">${icon('plus', 16)}Novo lead</summary><div class="card"><form method="post" action="${base}/crm/new" class="stack" style="max-width:none">
<div class="fields"><label class="f">Nome<input name="name" maxlength="120"></label><label class="f">E-mail<input name="email" type="email"></label>
<label class="f">Telefone<input name="phone" type="tel"></label><label class="f">Valor (R$)<input name="value" inputmode="decimal"></label></div><div><button class="primary">Cadastrar</button></div></form></div></details>` : ''}
<div class="board" data-move="${base}/crm/move">${cols.map(col => html`<section class="col" data-stage="${col.id}" aria-labelledby="col-${col.id}">
<header><h2 id="col-${col.id}">${col.name}</h2><span class="cnt-n" aria-label="${num(by.get(col.id).length)} contatos">${num(by.get(col.id).length)}</span>${col.event_name || col.kind !== 'open' ? html`<div class="ctags">${col.kind === 'won' ? html`<span class="tag ok">Ganho</span>` : col.kind === 'lost' ? html`<span class="tag bad">Perdido</span>` : ''}${col.event_name ? html`<span class="tag" title="Ao entrar aqui, a Meta recebe ${col.event_name}">Meta · ${col.event_name}</span>` : ''}</div>` : ''}</header>
<div class="cards">${by.get(col.id).map(c => html`<article class="kcard"${ctx.canEdit ? raw(' draggable="true"') : ''} data-id="${c.id}">
<div class="kh"><a href="${base}/contacts/${c.id}">${label(c)}</a>${ctx.canEdit ? html`<span class="grip" title="Arraste para outra coluna">${icon('grip-vertical', 16)}</span>` : ''}</div><div class="meta">${origin(c)}${c.value > 0 ? html`<span class="val">${money(c.value, s.currency)}</span>` : ''}<span class="age" title="Nesta coluna há ${days(c.stage_since)} dias">${days(c.stage_since)}d</span></div>
${ctx.canEdit ? html`<form method="post" action="${base}/crm/move" class="mv"><input type="hidden" name="contact" value="${c.id}"><label class="sr" for="mv-${c.id}">Mover para</label>
<select id="mv-${c.id}" name="stage">${cols.map(o => html`<option value="${o.id}"${o.id === col.id ? raw(' selected') : ''}>${o.name}</option>`)}</select><button>Mover</button></form>` : ''}</article>`)}
<p class="empty">${ctx.canEdit ? 'Arraste um card para cá.' : 'Nenhum contato.'}</p></div></section>`)}</div>
${ctx.canEdit ? html`<script nonce="${ctx.nonce}">(function(){var b=document.querySelector('.board'),drag=null;if(!b)return;
b.addEventListener('dragstart',function(e){drag=e.target.closest('.kcard');if(drag){e.dataTransfer.effectAllowed='move';drag.classList.add('dragging')}});
b.addEventListener('dragend',function(){if(drag)drag.classList.remove('dragging');drag=null;b.querySelectorAll('.over').forEach(function(x){x.classList.remove('over')})});
b.addEventListener('dragover',function(e){var c=e.target.closest('.col');if(c&&drag){e.preventDefault();c.classList.add('over')}});
b.addEventListener('dragleave',function(e){var c=e.target.closest('.col');if(c&&!c.contains(e.relatedTarget))c.classList.remove('over')});
b.addEventListener('drop',function(e){var c=e.target.closest('.col');if(!c||!drag)return;e.preventDefault();c.classList.remove('over');var card=drag,from=card.closest('.col');if(from===c)return;
c.querySelector('.cards').prepend(card);card.querySelector('select').value=c.dataset.stage;
fetch(b.dataset.move,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'js=1&contact='+card.dataset.id+'&stage='+c.dataset.stage})
.then(function(r){if(!r.ok)throw 0;[from,c].forEach(function(x){x.querySelector('.cnt-n').textContent=x.querySelectorAll('.kcard').length})}).catch(function(){location.reload()})});})()</script>` : ''}`);
}

export function contactsPage(ctx, cols, list, q) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`, colName = new Map(cols.map(c => [c.id, c.name]));
  return layout(ctx, `Contatos · ${s.name}`, html`
${pageHead(`${s.name} · Contatos`, raw('Quem são os seus <em>leads</em>'), 'Nome, e-mail e telefone ficam cifrados no banco. A lista mostra os mais recentes.')}
${ctx.q.get('ok') === 'excluido' ? notice('Contato excluído, com o histórico. Fica registrado só que houve um pedido de exclusão.') : ''}
<form method="get" class="row" style="margin-bottom:16px"><label class="sr" for="q">Buscar</label><span class="search">${icon('search', 16)}<input id="q" name="q" type="search" value="${q}" placeholder="Nome, e-mail ou telefone"></span><button>Buscar</button>${q ? html`<a class="btn link" href="?">Limpar</a>` : ''}</form>
<section class="card">${list.length ? html`<div class="tw"><table class="data txt mcards"><thead><tr><th>Contato</th><th>E-mail</th><th>Telefone</th><th>Coluna</th><th>Origem</th><th class="num">Valor</th><th>Atualizado</th></tr></thead>
<tbody>${list.map(c => html`<tr><td class="c-main"><a href="${base}/contacts/${c.id}">${c.name || `Contato ${c.id}`}</a></td><td>${maskEmail(c.email) || '-'}</td><td>${maskPhone(c.phone) || '-'}</td>
<td><span class="badge">${colName.get(c.stage_id) || '-'}</span></td><td>${origin(c)}</td><td class="num">${c.value > 0 ? money(c.value, s.currency) : '-'}</td><td class="muted">${when(ctx, c.updated)}</td></tr>`)}</tbody></table></div>`
    : html`<p class="empty">${q ? 'Nenhum contato encontrado.' : 'Nenhum contato ainda. Os leads chegam pelos formulários do site, pelo webhook de leads e pelo Lead Ads da Meta.'}</p>`}</section>`);
}

export function contactPage(ctx, c, cols, logs, events) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`, stage = cols.find(o => o.id === c.stage_id);
  const timeline = [...logs.map(l => ({ ts: l.ts, text: l.text, kind: 'crm' })), ...events.map(e => ({ ts: e.ts, text: `${e.name === 'pageview' ? 'Visitou' : e.name} ${e.path}${e.utm_campaign ? ` · ${e.utm_campaign}` : ''}`, kind: 'site' }))].sort((a, b) => b.ts - a.ts);
  return layout(ctx, `${c.name || 'Contato'} · ${s.name}`, html`
${pageHead(`${s.name} · Contato`, c.name || `Contato ${c.id}`, html`${origin(c)} · desde ${when(ctx, c.created)}`, html`<a class="btn" href="${base}/crm">${icon('arrow-left', 16)}Voltar ao quadro</a>`)}
<div class="record">
<div class="stack">
<section class="card"><h2>Dados</h2><dl class="kv"><dt>Coluna</dt><dd>${stage ? html`<span class="badge">${stage.name}</span>` : '-'}</dd><dt>Valor</dt><dd>${c.value > 0 ? html`<b>${money(c.value, s.currency)}</b>` : '-'}</dd>
<dt>E-mail</dt><dd>${c.email || '-'}</dd><dt>Telefone</dt><dd>${c.phone || '-'}</dd>
<dt>Campanha</dt><dd>${c.utm_campaign || '-'}</dd><dt>Clique ligado</dt><dd>${c.rid ? 'sim (cookie do site)' : c.lead_id ? `Lead Ads (${c.lead_id})` : 'não'}</dd></dl></section>
${ctx.canEdit ? html`<section class="card"><h2>Negócio</h2><form method="post" action="${base}/crm/move" class="row" style="margin-top:14px"><input type="hidden" name="contact" value="${c.id}"><input type="hidden" name="back" value="contact">
<label class="f">Coluna<select name="stage">${cols.map(o => html`<option value="${o.id}"${o.id === c.stage_id ? raw(' selected') : ''}>${o.name}${o.event_name ? ` (envia ${o.event_name})` : ''}</option>`)}</select></label><button class="primary">Mover</button></form>
<form method="post" action="${base}/contacts/${c.id}" class="row" style="margin-top:14px"><input type="hidden" name="action" value="value"><label class="f">Valor do negócio (${s.currency})<input name="value" value="${c.value || ''}" inputmode="decimal"></label><button>Salvar valor</button></form>
<form method="post" action="${base}/contacts/${c.id}" class="row" style="margin-top:14px"><input type="hidden" name="action" value="code"><label class="f">Código do WhatsApp<span>O código entre colchetes na primeira mensagem, ex.: R7K2Q. Liga o contato ao clique no anúncio.</span><input name="code" maxlength="9" autocomplete="off"></label><button>Ligar código</button></form>
${ctx.q.get('erro') === 'codigo' ? notice('Código não encontrado ou já usado em outro contato.', true) : ''}</section>
<section class="card"><h2>Excluir dados (LGPD)</h2><p class="muted">Apaga o contato e o histórico dele, a pedido do titular. Não dá para desfazer.</p>
<form method="post" action="${base}/contacts/${c.id}" class="row"><input type="hidden" name="action" value="erase"><label class="f">Confirmação<span>Digite EXCLUIR</span><input name="confirm" required autocomplete="off"></label><button class="danger">Excluir dados</button></form></section>` : ''}
</div>
<section class="card"><h2>Linha do tempo</h2>${timeline.length ? html`<ul class="feed timeline" style="margin-top:8px">${timeline.map(t => html`<li><time>${when(ctx, t.ts)}</time><div>${t.text}<small>${t.kind === 'site' ? 'no site' : 'CRM'}</small></div></li>`)}</ul>` : html`<p class="empty">Sem histórico ainda. Visitas e mudanças de coluna aparecem aqui.</p>`}</section>
</div>`);
}

export function stagesPage(ctx, cols, counts, err, urls) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`;
  return layout(ctx, `Colunas do CRM · ${s.name}`, html`
${pageHead(`${s.name} · CRM`, raw('Colunas e <em>entradas</em> de lead'), 'Cada coluna pode avisar a Meta quando um contato entra nela (conversão offline do CRM), com e-mail e telefone só em hash.')}
${notice(ERR[err] || null, true)}
<section class="card"><h2>Colunas</h2><form method="post" action="${base}/crm/stages" class="stack" style="max-width:none"><input type="hidden" name="action" value="save">
<div class="tw" style="margin-top:12px"><table class="data txt stages"><thead><tr><th>Ordem</th><th>Nome</th><th>Evento para a Meta</th><th>Tipo</th><th class="num">Contatos</th><th></th></tr></thead><tbody>
${cols.map(c => html`<tr><td class="ps" data-label="Ordem"><input class="ord" name="pos_${c.id}" value="${c.position}" inputmode="numeric" aria-label="Ordem de ${c.name}"></td>
<td class="nm" data-label="Nome"><input name="name_${c.id}" value="${c.name}" maxlength="40" required aria-label="Nome da coluna"></td>
<td class="ev" data-label="Evento para a Meta"><input name="event_${c.id}" value="${c.event_name || ''}" maxlength="40" placeholder="nenhum" pattern="[A-Za-z][A-Za-z0-9_]{0,39}" aria-label="Evento de ${c.name}"></td>
<td class="kd" data-label="Tipo"><select name="kind_${c.id}" aria-label="Tipo de ${c.name}">${Object.entries(KIND).map(([k, t]) => html`<option value="${k}"${k === c.kind ? raw(' selected') : ''}>${t}</option>`)}</select></td>
<td class="num ct" data-label="Contatos">${num(counts.get(c.id) || 0)}</td><td class="ac">${counts.get(c.id) ? '' : html`<button class="link danger" form="del-${c.id}">Apagar</button>`}</td></tr>`)}</tbody></table></div>
<p class="muted" style="margin:0">Eventos comuns: <code>Lead</code>, <code>QualifiedLead</code>, <code>Schedule</code>, <code>Purchase</code>. Uma venda que chega pelo checkout leva o contato para a coluna do tipo Ganho sem enviar de novo.</p>
<div><button class="primary">Salvar colunas</button></div></form>
${cols.map(c => html`<form method="post" action="${base}/crm/stages" id="del-${c.id}" hidden><input type="hidden" name="action" value="delete"><input type="hidden" name="stage" value="${c.id}"></form>`)}
<form method="post" action="${base}/crm/stages" class="row" style="margin-top:14px"><input type="hidden" name="action" value="add"><label class="f" style="flex:1">Nova coluna<input name="name" maxlength="40" required></label><button style="align-self:end">Adicionar</button></form></section>

<section class="card"><h2>Entradas de lead</h2>
<p><b>Formulários do site:</b> automático. O snippet manda e-mail, telefone e nome de qualquer formulário que tenha esses campos (só com consentimento, quando o site exige).</p>
<p><b>Webhook de leads</b> (Elementor, RD Station, n8n, Make). JSON com <code>name</code>, <code>email</code>, <code>phone</code> e, se tiver, <code>rid</code> e <code>utm_*</code>:</p><pre class="code"><code>${urls.leads}</code></pre>
<p><b>Lead Ads da Meta</b> (formulários instantâneos). No app da Meta, assine o campo <code>leadgen</code> da página com esta URL de retorno; o token de verificação é o mesmo trecho da URL depois de <code>/hooks/</code>:</p><pre class="code"><code>${urls.metaLeads}</code></pre>
<form method="post" action="${base}/crm/meta-leads" class="stack"><div class="fields">
<label class="f">Token de acesso da página<span>Com a permissão leads_retrieval. Vazio mantém; "-" apaga.</span><input name="page_token" type="password" autocomplete="off" placeholder="${s.meta_page_token ? '•••••• (configurado)' : 'não configurado'}"></label>
<label class="f">Chave secreta do app<span>Obrigatória: sem ela os avisos da Meta são recusados. Vazio mantém; "-" apaga.</span><input name="app_secret" type="password" autocomplete="off"></label>
<label class="f">Segredo do webhook de leads<span>Opcional: exige o cabeçalho X-Rastro-Signature (sha256= HMAC do corpo). Vazio mantém; "-" apaga.</span><input name="leads_secret" type="password" autocomplete="off"></label></div>
<div><button>Salvar Lead Ads</button></div></form></section>`);
}
