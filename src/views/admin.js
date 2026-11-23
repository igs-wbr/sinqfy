// Páginas administrativas: configurações do site, sites, equipe, conta, login e convite.
import { html, raw, MARK, layout, pageHead, notice, num, money, ROLES } from './ui.js';
import { MODULES, chosen } from '../modules.js';

const TIMEZONES = ['UTC', ...Intl.supportedValuesOf('timeZone').filter(t => t !== 'UTC')];
const tzSelect = cur => html`<select name="timezone">${TIMEZONES.map(t => html`<option${t === cur ? raw(' selected') : ''}>${t}</option>`)}</select>`;

export function settingsPage(ctx, originUrl, msg) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`;
  return layout(ctx, `Configurações · ${s.name}`, html`${pageHead(`${s.name} · Configurações`, raw('Ajustes do <em>site</em>'), html`id <code>${s.id}</code>`)}
${notice(msg)}
<div class="grid two" style="align-items:start">
<section class="card"><h2>Geral</h2><form method="post" action="${base}/settings" class="stack" style="margin-top:14px"><input type="hidden" name="action" value="save">
<label class="f">Nome<input name="name" value="${s.name}" required maxlength="80"></label>
<label class="f">Fuso horário${tzSelect(s.timezone)}</label>
<label class="f">Moeda<input name="currency" value="${s.currency}" pattern="[A-Za-z]{3}" maxlength="3" required></label>
<label class="f">Domínios do site<span>Separados por vírgula, ex.: loja.com.br. Eventos de outros domínios são recusados. Vazio aceita qualquer um.</span><input name="domains" value="${s.domains || ''}" maxlength="500" placeholder="loja.com.br, ofertas.loja.com.br"></label>
<label class="f">Imposto sobre o faturamento (%)<span>Descontado do lucro. Ex.: 6 para Simples Nacional na faixa inicial.</span><input name="tax_rate" type="number" min="0" max="100" step="0.01" value="${s.tax_rate}"></label>
<label class="f">Cliente<span>Sites com o mesmo cliente (um por funil, produto ou faixa de preço) ganham a visão somada "Cliente (todos)" no seletor de sites.</span><input name="client" value="${s.client || ''}" maxlength="80" list="clients" placeholder="Ex.: Jean Alessandro"><datalist id="clients">${[...new Set((ctx.sites || []).map(x => x.client).filter(Boolean))].map(c => html`<option value="${c}">`)}</datalist></label>
<label class="f">Campanhas deste site<span>Trechos do nome das campanhas, separados por vírgula. Com a conta de anúncios ligada a outro site do mesmo cliente, o gasto dessas campanhas vem para este site. Vazio: o gasto fica no site da conta.</span><input name="spend_rule" value="${s.spend_rule || ''}" maxlength="300" placeholder="Ex.: BLACK997"></label>
<div><button class="primary">Salvar</button></div></form></section>
<div class="stack">
<section class="card"><h2>Recursos</h2><p class="muted">Ligue só o que este site usa. Desligado, o item some do menu e as telas, envios e tarefas do recurso param.</p>
<form method="post" action="${base}/settings" class="stack" style="max-width:none"><input type="hidden" name="action" value="modules"><div class="mods">
${Object.entries(MODULES).map(([id, m]) => html`<label><input type="checkbox" name="module" value="${id}"${chosen(s, id) ? raw(' checked') : ''}><span><b>${m.label}</b><small>${m.desc}${m.needs ? ` Depende de ${MODULES[m.needs].label}.` : ''}</small></span></label>`)}</div>
<div><button>Salvar recursos</button></div></form></section>
<section class="card"><h2>Link público</h2><p class="muted">Quem tiver o link vê a visão geral de tráfego, somente leitura e sem login. Dados de vendas nunca são públicos.</p>
${s.share_token ? html`<pre><code>${originUrl}/share/${s.share_token}</code></pre><form method="post" action="${base}/settings" class="row"><input type="hidden" name="action" value="share_off"><a class="btn" href="/share/${s.share_token}" target="_blank" rel="noopener">Abrir</a><button class="danger">Desativar link</button></form>`
    : html`<form method="post" action="${base}/settings"><input type="hidden" name="action" value="share_on"><button>Gerar link público</button></form>`}</section>
${ctx.user.role === 'admin' ? html`<section class="card"><h2>Excluir site</h2><p class="muted">Apaga o site e <b>todos</b> os dados: visitas, vendas, gastos e integrações. Não há como desfazer.</p>
<form method="post" action="${base}/delete" class="row"><label class="f">Confirmação<span>Digite <code>${s.id}</code></span><input name="confirm" required autocomplete="off"></label><button class="danger" style="align-self:end">Excluir permanentemente</button></form></section>` : ''}
</div></div>`);
}

export const NEW_CLIENT = '__new';
export function sitesPage(ctx, rows, err) {
  return layout(ctx, 'Sites', html`${pageHead('Agência · Sites', raw('Seus <em>sites</em>'), 'Cada site tem seu próprio snippet, webhooks e contas de anúncio.')}
${notice(err, true)}
<section class="card">${rows.length ? html`<div class="tw"><table class="list"><thead><tr><th>Site</th><th>Visitantes hoje</th><th>Faturamento hoje</th></tr></thead><tbody>${rows.map(r => html`<tr><td><a href="/sites/${encodeURIComponent(r.id)}">${r.name}</a> <span class="muted">${r.id}</span></td><td>${num(r.visitors)}</td><td>${money(r.net, r.currency)}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">Nenhum site ainda.</p>`}</section>
<section class="card" style="margin-top:14px"><h2>Novo site</h2><form method="post" action="/sites" class="stack" style="margin-top:14px">
<label class="f">Nome<input name="name" required maxlength="80" placeholder="Meu infoproduto"></label>
<label class="f">Id<span>Usado no snippet: letras, números, ponto, hífen.</span><input name="id" required pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{0,63}" placeholder="meu-produto"></label>
<label class="f">Fuso horário${tzSelect(ctx.defaultTz)}</label>
<label class="f">Moeda<input name="currency" value="BRL" pattern="[A-Za-z]{3}" maxlength="3" required></label>
<div class="client-pick stack"><label class="f">Cliente<span>Sites do mesmo cliente (um por funil ou produto) ficam juntos no seletor e ganham a visão somada.</span><select name="client">
<option value="">Sem cliente</option>${ctx.clients?.length ? html`<optgroup label="Cliente existente">${ctx.clients.map(c => html`<option value="${c}">${c}</option>`)}</optgroup>` : ''}<option value="${NEW_CLIENT}">+ Novo cliente</option></select></label>
<label class="f new-client">Nome do novo cliente<input name="client_new" maxlength="80" placeholder="Ex.: Jean"></label></div>
<div><button class="primary">Criar site</button></div></form></section>`);
}

const siteChecks = (allSites, chosen, form) => allSites.length
  ? html`<div class="checks">${allSites.map(s => html`<label><input type="checkbox" name="sites" value="${s.id}"${form ? html` form="${form}"` : ''}${chosen.has(s.id) ? raw(' checked') : ''}>${s.name}</label>`)}</div>` : html`<span class="muted">Nenhum site cadastrado.</span>`;
const roleSelect = (cur, form) => html`<select name="role" aria-label="Papel"${form ? html` form="${form}"` : ''}>${Object.entries(ROLES).map(([k, t]) => html`<option value="${k}"${k === cur ? raw(' selected') : ''}>${t}</option>`)}</select>`;

export function teamPage(ctx, users, allSites, { link: inviteLink, err } = {}) {
  return layout(ctx, 'Equipe', html`${pageHead('Agência · Equipe', raw('Quem vê <em>o quê</em>'), raw('<b>Dono</b>: tudo na agência, inclusive equipe e sites. <b>Gestor</b>: vê e configura os sites liberados (integrações, funis, link público). <b>Cliente</b>: só vê os sites liberados.'))}
${notice(err, true)}
${inviteLink ? notice(html`Link de acesso, válido por 7 dias. Envie para a pessoa:<pre><code>${inviteLink}</code></pre>`) : ''}
<section class="card"><h2>Convidar pessoa</h2><form method="post" action="/team" class="stack" style="margin-top:14px;max-width:none">
<div class="fields"><label class="f">E-mail<input type="email" name="email" required></label><label class="f">Nome<input name="name" maxlength="80"></label><label class="f">Papel${roleSelect('viewer')}</label></div>
<div><span class="lbl" style="margin-bottom:6px">Sites liberados (o Dono vê todos)</span>${siteChecks(allSites, new Set())}</div><div><button class="primary">Convidar</button></div></form></section>
<section class="card" style="margin-top:16px"><h2>Membros</h2><div class="tw" style="margin-top:12px"><table class="left"><thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th><th scope="col">Sites liberados</th><th scope="col">Ações</th></tr></thead><tbody>${users.map(u => {
    const me = u.id === ctx.user.id, fid = `u${u.id}`;
    return html`<tr><td><b>${u.name || u.email}</b>${me ? html` <span class="muted">(você)</span>` : ''}<br><small>${u.email}</small>${u.pass ? '' : html`<br><span class="badge st-pending">convite pendente</span>`}</td>
<td>${me ? html`<span class="badge">${ROLES[u.role]}</span>` : roleSelect(u.role, fid)}</td><td>${me ? html`<span class="muted">${u.role === 'admin' ? 'Todos' : '-'}</span>` : siteChecks(allSites, u.sites, fid)}</td>
<td>${me ? '' : html`<div class="row" style="gap:4px"><form method="post" action="/team/${u.id}" id="${fid}"><button>Salvar</button></form><form method="post" action="/team/${u.id}/link"><button class="link">Novo link de acesso</button></form><form method="post" action="/team/${u.id}/delete"><button class="link danger">Remover</button></form></div>`}</td></tr>`;
  })}</tbody></table></div></section>`);
}

export function accountPage(ctx, msg, err) {
  return layout(ctx, 'Conta', html`${pageHead('Conta', raw('Sua <em>conta</em>'), `${ctx.user.email} · ${ROLES[ctx.user.role]}`)}
${notice(msg)}${notice(err, true)}
<section class="card" style="max-width:560px"><h2>Trocar senha</h2><form method="post" action="/account/password" class="stack" style="margin-top:14px">
<label class="f">Senha atual<input type="password" name="current" required autocomplete="current-password"></label>
<label class="f">Nova senha (mín. 8)<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
<label class="f">Confirmar<input type="password" name="confirm" required minlength="8" autocomplete="new-password"></label><div><button class="primary">Trocar senha</button></div></form></section>`);
}

const authCard = body => html`<div class="auth"><a class="brand" href="/">${MARK}<span>Sinqfy</span></a><div class="card">${body}</div></div>`;

export function loginPage(ctx, { next = '', email = '', err } = {}) {
  return layout(ctx, 'Entrar', authCard(html`<h1>Entrar</h1>${notice(err, true)}
<form method="post" action="/login" class="stack"><input type="hidden" name="next" value="${next}">
<label class="f">E-mail<input type="email" name="email" value="${email}" required autocomplete="username" autofocus></label>
<label class="f">Senha<input type="password" name="password" required autocomplete="current-password"></label><div><button class="primary">Entrar</button></div></form>`), { bare: true });
}

export function invitePage(ctx, user, err) {
  return layout(ctx, 'Definir senha', authCard(user ? html`<h1>Bem-<em>vindo</em></h1><p class="sub" style="margin-bottom:16px">Defina uma senha para ${user.email}.</p>${notice(err, true)}
<form method="post" class="stack"><label class="f">Senha (mín. 8)<input type="password" name="password" required minlength="8" autocomplete="new-password" autofocus></label>
<label class="f">Confirmar<input type="password" name="confirm" required minlength="8" autocomplete="new-password"></label><div><button class="primary">Salvar e entrar</button></div></form>`
    : html`<h1>Link inválido</h1><p class="sub" style="margin-bottom:16px">Este link expirou ou já foi usado. Peça um novo a um admin.</p><a class="btn" href="/login">Ir para o login</a>`), { bare: true });
}

export function messagePage(ctx, title, text) {
  if (!ctx.user) return layout(ctx, title, authCard(html`<h1>${title}</h1><p class="sub" style="margin-bottom:16px">${text}</p><a class="btn" href="/">Voltar</a>`), { bare: true });
  return layout(ctx, title, html`${pageHead(`Sinqfy · ${title}`, title, html`${text} Confira o endereço ou volte para os seus sites.`)}<a class="btn" href="/">Ir para os meus sites</a>`);
}

export function agenciesPage(ctx, rows, { link: inviteLink, agency, err } = {}) {
  return layout(ctx, 'Agências', html`${pageHead('Sinqfy · Agências', raw('Cada agência com os <em>seus</em> clientes'), 'Uma agência só vê os próprios sites e a própria equipe. O dono entra pelo link de convite.')}
${notice(err, true)}${inviteLink ? notice(html`Agência <b>${agency}</b> criada. Envie este link ao dono (vale 7 dias): <code>${inviteLink}</code>`) : ''}
<div class="grid two" style="align-items:start">
<section class="card"><h2>Agências</h2><div class="tw"><table class="data txt"><thead><tr><th>Agência</th><th class="num">Sites</th><th class="num">Pessoas</th></tr></thead>
<tbody>${rows.map(a => html`<tr><td>${a.name}${a.id === ctx.user.agency_id ? html` <span class="tag">a sua</span>` : ''}</td><td class="num">${num(a.sites)}</td><td class="num">${num(a.users)}</td></tr>`)}</tbody></table></div></section>
<section class="card"><h2>Nova agência</h2><form method="post" action="/agencies" class="stack"><div class="fields">
<label class="f">Nome da agência<input name="name" required maxlength="80"></label><label class="f">E-mail do dono<input name="email" type="email" required></label></div>
<div><button class="primary">Criar e gerar convite</button></div></form></section></div>`);
}

// ---------- plano (ADR 0022) ----------
const FREE_FEATURES = ['1 site (funil)', 'Rastreamento sem cookies de terceiros', 'Conversions API da Meta e GA4', 'Webhooks de vendas (Hotmart, Kiwify, Eduzz e outros)',
  'Campanhas, funis, caminhos e atribuição', 'CRM, contatos e WhatsApp', 'Recuperação de venda e públicos', 'Painel no celular', 'Todos os recursos incluídos'];
const PRO_FEATURES = ['Tudo do Grátis, mais:', 'Sites ilimitados', 'Visão somada por cliente e comparação de funis', 'Use em até 2 instalações', 'Atualizações por 12 meses, uso para sempre', '7 dias grátis, depois pague uma vez'];
const day = ts => new Date(Number(ts)).toLocaleDateString('pt-BR');

export function planPage(ctx, plan, { price, buyUrl, sites, free, msg, err }) {
  const status = plan.license ? html`Plano <b>Pro</b>${plan.license.to ? html`, licenciado para <b>${plan.license.to}</b>` : ''}${plan.license.updates ? html`. Atualizações até ${day(plan.license.updates)}` : ''}.`
    : plan.trial ? html`Teste do <b>Pro</b> até ${day(plan.trialEnds)}. Depois disso, o painel volta a abrir só o primeiro site (${free?.name || '-'}), e os outros continuam coletando.`
      : html`Plano <b>Grátis</b>: o painel abre 1 site (${free?.name || '-'}). ${sites > 1 ? `Os outros ${sites - 1} continuam coletando visitas e vendas, só o painel deles fica bloqueado.` : ''}`;
  return layout(ctx, 'Plano', html`${pageHead('Instalação · Plano', raw('Pague <em>uma vez</em>'), status)}
${notice(msg)}${notice(err, true)}
<div class="plans">
<section class="card"><h2>Grátis</h2><p class="price">R$ 0<small>para sempre</small></p><p class="muted">Tudo o que você precisa para um funil.</p>
<ul>${FREE_FEATURES.map(f => html`<li>${f}</li>`)}</ul></section>
<section class="card pro"><h2>Pro</h2><p class="price">${price}<small>pagamento único</small></p><p class="muted">Para quem opera vários funis, produtos ou clientes.</p>
<ul>${PRO_FEATURES.map(f => html`<li>${f}</li>`)}</ul>
${plan.license ? '' : html`<form method="post" action="/plano"><input type="hidden" name="action" value="trial"><button${plan.trialUsed ? raw(' disabled') : ''}>${plan.trialUsed ? (plan.trial ? 'Teste em andamento' : 'Teste já usado') : 'Teste grátis por 7 dias'}</button></form>
${buyUrl ? html`<a class="btn primary" href="${buyUrl}" target="_blank" rel="noopener">Comprar licença</a>` : ''}`}</section></div>
<section class="card" style="margin-top:16px"><h2>${plan.license ? 'Trocar a chave' : 'Já tenho uma chave'}</h2><form method="post" action="/plano" class="stack" style="margin-top:12px;max-width:none"><input type="hidden" name="action" value="key">
<label class="f">Chave de licença<span>Cole a chave recebida na compra. Ela é validada aqui mesmo, sem depender de internet.</span><textarea name="key" rows="3" required spellcheck="false" autocomplete="off"></textarea></label>
<div><button class="primary">Ativar</button></div></form></section>`);
}

/** Site além do primeiro no plano Grátis: o painel fica bloqueado, a coleta e os envios seguem. */
export function lockedPage(ctx, site, free) {
  return layout(ctx, `${site.name} · Plano Pro`, html`${pageHead(`${site.name}`, raw('Este site precisa do <em>Pro</em>'), html`No plano Grátis, o painel abre só o primeiro site da instalação (${free?.name || '-'}). Este site continua coletando visitas e vendas e enviando eventos à Meta: nada se perde.`)}
${ctx.user?.platform ? html`<a class="btn primary" href="/plano">Ver o plano Pro</a>` : html`<p class="muted">Peça ao dono da instalação para ativar o plano Pro.</p>`}`);
}
