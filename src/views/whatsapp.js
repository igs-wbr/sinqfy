// WhatsApp: links rastreáveis e Cloud API (configuração), lista de conversas e conversa com a origem e a sugestão de coluna.
import { html, raw, layout, pageHead, notice, num, icon } from './ui.js';
import { maskPhone } from '../pii.js';

const when = (ctx, ts) => new Date(ts).toLocaleString('pt-BR', { timeZone: ctx.site.timezone, dateStyle: 'short', timeStyle: 'short' });

export function settingsPage(ctx, links, d, msg, err) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}/whatsapp`;
  return layout(ctx, `WhatsApp · ${s.name}`, html`
${pageHead(`${s.name} · WhatsApp`, raw('Cada conversa ligada ao <em>anúncio</em>'), 'Links rastreáveis para qualquer WhatsApp e, com a Cloud API oficial, as conversas e os anúncios de clique para WhatsApp.')}
${notice(msg)}${notice(err, true)}
<section class="card"><h2>Links rastreáveis</h2>
<p class="muted">Use no botão do site no lugar do link do <code>wa.me</code>. O clique conta como <code>Contact</code> e a mensagem sai com um código curto (ex.: <code>[R7K2Q]</code>). Quando a conversa chega pela Cloud API, ou quando você digita o código na ficha do contato, ela fica ligada ao clique e à campanha.</p>
${links.length ? html`<div class="tw"><table class="data txt rows-sm"><thead><tr><th>Link</th><th>Número</th><th>Endereço para o botão</th><th class="num">Cliques</th><th class="num">Conversas ligadas</th><th></th></tr></thead><tbody>
${links.map(l => html`<tr><td data-label="Link"><b>${l.name}</b>${l.message ? html`<br><small class="muted">${l.message}</small>` : ''}</td><td data-label="Número">${maskPhone(l.phone)}</td><td data-label="Endereço para o botão"><code>${d.base}/w/${l.slug}</code></td>
<td class="num" data-label="Cliques">${num(l.clicks)}</td><td class="num" data-label="Conversas ligadas">${num(l.matched)}</td><td><form method="post" action="${base}"><input type="hidden" name="action" value="delete"><input type="hidden" name="link" value="${l.id}"><button class="link danger">Apagar</button></form></td></tr>`)}</tbody></table></div>`
    : html`<p class="empty">Nenhum link ainda. Crie o primeiro abaixo e troque o link do botão de WhatsApp do site.</p>`}
<form method="post" action="${base}" class="stack" style="margin-top:14px"><input type="hidden" name="action" value="link"><div class="fields">
<label class="f">Nome<input name="name" required maxlength="60" placeholder="Botão da página de vendas"></label>
<label class="f">Número do WhatsApp<span>Com DDD. O 55 entra sozinho.</span><input name="phone" required inputmode="tel" placeholder="(11) 99999-0000"></label>
<label class="f">Mensagem pronta<input name="message" maxlength="300" placeholder="Olá, quero saber mais"></label></div>
<div><button class="primary">Criar link</button></div></form></section>

<section class="card"><h2>WhatsApp Cloud API (número oficial)</h2>
<p class="muted">Com o número na Cloud API da Meta, as mensagens recebidas viram contatos no CRM, a conversa aparece em Conversas e quem veio de anúncio de clique para WhatsApp volta para a Meta como conversão de mensagem. Quem usa o app WhatsApp Business comum fica só com os links acima.</p>
<ol class="steps"><li>No app da Meta, em WhatsApp, Configuração, cadastre a URL de retorno abaixo e use como token de verificação o trecho da URL depois de <code>/hooks/</code>. Assine o campo <code>messages</code>.</li>
<li>Informe o ID da conta do WhatsApp Business (WABA) e a chave secreta do app. Sem a chave, os avisos são recusados.</li>
<li>No Gerenciador de Eventos, ligue o conjunto de dados (pixel) à conta do WhatsApp Business, para a Meta aceitar as conversões de mensagem.</li></ol>
<pre class="code"><code>${d.hook}</code></pre>
<form method="post" action="${base}" class="stack"><input type="hidden" name="action" value="cloud"><div class="fields">
<label class="f">ID da conta do WhatsApp Business<input name="waba_id" value="${s.waba_id || ''}" inputmode="numeric" pattern="[0-9]{5,25}"></label>
<label class="f">Chave secreta do app<span>${d.hasSecret ? 'Configurada. Vazio mantém; "-" apaga.' : 'Ainda não configurada.'}</span><input name="app_secret" type="password" autocomplete="off"></label>
<label class="f">ID do número de telefone<span>Para enviar mensagens (recuperação e robô). Em WhatsApp, Configuração da API.</span><input name="wa_phone_id" value="${s.wa_phone_id || ''}" inputmode="numeric" pattern="[0-9]{5,25}"></label>
<label class="f">Token de acesso<span>${s.wa_token ? 'Configurado. Vazio mantém; "-" apaga.' : 'Token permanente de um usuário do sistema, com whatsapp_business_messaging.'}</span><input name="wa_token" type="password" autocomplete="off"></label></div>
${d.sendNeeded && !d.send ? notice('A recuperação ou o robô estão ligados, mas o envio só funciona com o ID do número e o token.', true) : ''}
${d.aiKey ? html`<label class="row" style="align-items:flex-start"><input type="checkbox" name="ai_suggest" value="1"${s.ai_suggest ? raw(' checked') : ''} style="margin-top:4px"><span><b>Sugerir a coluna do CRM com IA (Gemini)</b><br><small class="muted">As últimas mensagens vão ao Google sem e-mail, telefone, CPF, CNPJ, CEP, links e chaves Pix, no máximo uma vez por minuto por contato. Nomes e endereços escritos na conversa podem seguir. Ligue só se o seu contrato com os clientes permitir. Desligado, valem as regras simples.</small></span></label>` : html`<p class="muted" style="margin:0">Sugestão de coluna por regras simples. A sugestão por IA aparece aqui quando a instalação tiver uma chave do Gemini.</p>`}
<div><button>Salvar Cloud API</button></div></form></section>
${d.bot ? html`<section class="card" style="margin-top:16px"><h2>Robô por palavra-chave</h2>
<p class="muted">Uma regra por linha: palavras separadas por vírgula, um sinal de igual e a resposta. Vale a primeira regra cuja palavra aparece na mensagem, sem diferença de acento ou maiúscula, com no máximo uma resposta por minuto para cada contato. A resposta sai como texto, porque a pessoa acabou de escrever.</p>
<form method="post" action="${base}" class="stack" style="max-width:none"><input type="hidden" name="action" value="bot">
<label class="f">Regras<textarea name="rules" style="min-height:140px" placeholder="preço, valor, quanto custa = O investimento é R$ 97 no Pix ou 12x no cartão: https://...&#10;acesso, login, senha = O acesso chega no e-mail da compra. Não achou? Responda com o e-mail que usou.">${d.rules.map(x => `${x.words.join(', ')} = ${x.reply}`).join('\n')}</textarea></label>
<div><button class="primary">Salvar respostas</button></div></form></section>` : ''}`);
}

const initials = c => (c.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#';
const hhmm = (ctx, ts) => new Date(ts).toLocaleTimeString('pt-BR', { timeZone: ctx.site.timezone, hour: '2-digit', minute: '2-digit' });
const day = (ctx, ts) => new Date(ts).toLocaleDateString('pt-BR', { timeZone: ctx.site.timezone, day: '2-digit', month: 'long', year: 'numeric' });
/** Hoje mostra só a hora; outros dias, a data curta. */
const ago = (ctx, ts) => day(ctx, ts) === day(ctx, Date.now()) ? hhmm(ctx, ts) : new Date(ts).toLocaleDateString('pt-BR', { timeZone: ctx.site.timezone, day: '2-digit', month: '2-digit' });

export function conversationsPage(ctx, cols, contacts, last) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`, col = new Map(cols.map(c => [c.id, c.name]));
  return layout(ctx, `Conversas · ${s.name}`, html`
${pageHead(`${s.name} · Conversas`, raw('Conversas do <em>WhatsApp</em>'), 'As mais recentes primeiro. Uma sugestão de coluna aparece quando a conversa indica mudança no funil.')}
<section class="card inbox-card">${contacts.length ? html`<ul class="inbox">${contacts.map(c => { const m = last.get(c.id); return html`<li><a class="convo" href="${base}/conversations/${c.id}">
<span class="ava" aria-hidden="true">${initials(c)}</span><span class="who"><b>${c.name || maskPhone(c.phone) || `Contato ${c.id}`}</b>${col.get(c.stage_id) ? html`<span class="tag">${col.get(c.stage_id)}</span>` : ''}${c.ctwa_clid ? html`<span class="tag ok">anúncio</span>` : ''}${c.suggest_stage ? html`<span class="tag sug">sugestão: ${col.get(c.suggest_stage)}</span>` : ''}</span>
<time datetime="${new Date(c.last_msg).toISOString()}" title="${when(ctx, c.last_msg)}">${ago(ctx, c.last_msg)}</time><span class="prev">${m ? html`${m.dir === 'out' ? html`<b>Você:</b> ` : ''}${m.text || ''}` : ''}</span></a></li>`; })}</ul>`
    : html`<p class="empty">Nenhuma conversa ainda. As conversas chegam pela Cloud API do WhatsApp${ctx.canEdit ? html` (configure em <a href="${base}/whatsapp">WhatsApp</a>)` : ''}.</p>`}</section>`);
}

export function threadPage(ctx, c, cols, msgs, click) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`, col = new Map(cols.map(x => [x.id, x.name]));
  let prevDay = '';
  const items = msgs.map(m => {
    const d = day(ctx, m.ts), sep = d !== prevDay;
    prevDay = d;
    return html`${sep ? html`<li class="day"><span>${d}</span></li>` : ''}<li class="msg ${m.dir}"><span class="sr">${m.dir === 'out' ? 'Você' : c.name || 'Contato'}: </span>${m.text || ''}<time datetime="${new Date(m.ts).toISOString()}" title="${when(ctx, m.ts)}">${hhmm(ctx, m.ts)}</time></li>`;
  });
  const sub = [col.get(c.stage_id), ctx.canEdit ? c.phone : maskPhone(c.phone)].filter(Boolean).join(' · '); // número inteiro só para quem edita
  return layout(ctx, `Conversa · ${s.name}`, html`
${pageHead(`${s.name} · Conversa`, c.name || maskPhone(c.phone) || `Contato ${c.id}`, sub || null, html`<a class="btn" href="${base}/conversations">${icon('arrow-left', 16)}Conversas</a>`)}
${c.suggest_stage && ctx.canEdit ? html`<div class="suggest" role="status">${icon('route')}<div><p><b>Sugestão: mover para ${col.get(c.suggest_stage)}.</b> <span class="muted">${c.suggest_reason || ''}</span></p>
<div class="row"><form method="post" action="${base}/conversations/${c.id}"><input type="hidden" name="action" value="accept"><button class="primary">Mover para ${col.get(c.suggest_stage)}</button></form>
<form method="post" action="${base}/conversations/${c.id}"><input type="hidden" name="action" value="dismiss"><button class="link">Ignorar</button></form></div></div></div>` : ''}
<div class="chat">
<section class="card"><h2>Mensagens</h2>${msgs.length ? html`<ol class="thread" aria-label="Mensagens, da mais antiga para a mais nova">${items}</ol>
<script nonce="${ctx.nonce}">(function(){var t=document.querySelector('.thread');if(t)t.scrollTop=t.scrollHeight})()</script>` : html`<p class="empty">Sem mensagens guardadas (ficam 90 dias).</p>`}</section>
<section class="card"><h2>Origem</h2><dl class="kv">
<dt>Anúncio de clique</dt><dd>${c.ctwa_clid ? `sim${c.ad_key ? ` (anúncio ${c.ad_key})` : ''}` : 'não'}</dd>
<dt>Link rastreável</dt><dd>${click ? `${click.name} · código ${click.code} · ${when(ctx, click.ts)}` : 'não'}</dd>
<dt>Campanha</dt><dd>${c.utm_campaign || '-'}</dd><dt>Clique no site</dt><dd>${c.rid ? 'sim' : 'não'}</dd></dl>
<a class="btn" href="${base}/contacts/${c.id}" style="margin-top:16px">Abrir ficha no CRM</a></section></div>`);
}
