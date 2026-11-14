// Páginas administrativas: configurações do site, sites, equipe, conta, login e convite.
import { html, raw, layout, pageHead, notice, num, money, ROLES } from './ui.js';

const TIMEZONES = ['UTC', ...Intl.supportedValuesOf('timeZone').filter(t => t !== 'UTC')];
const tzSelect = cur => html`<select name="timezone">${TIMEZONES.map(t => html`<option${t === cur ? raw(' selected') : ''}>${t}</option>`)}</select>`;

export function settingsPage(ctx, originUrl, msg) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`;
  return layout(ctx, `Configurações · ${s.name}`, html`${pageHead('Configurações', html`${s.name} <em>·</em> ajustes`, html`id <code>${s.id}</code>`)}
${notice(msg)}
<div class="grid two" style="align-items:start">
<section class="card"><h2>Geral</h2><form method="post" action="${base}/settings" class="stack" style="margin-top:14px"><input type="hidden" name="action" value="save">
<label class="f">Nome<input name="name" value="${s.name}" required maxlength="80"></label>
<label class="f">Fuso horário${tzSelect(s.timezone)}</label>
<label class="f">Moeda<input name="currency" value="${s.currency}" pattern="[A-Za-z]{3}" maxlength="3" required></label>
<label class="f">Imposto sobre o faturamento (%)<span>Descontado do lucro. Ex.: 6 para Simples Nacional na faixa inicial.</span><input name="tax_rate" type="number" min="0" max="100" step="0.01" value="${s.tax_rate}"></label>
<div><button class="primary">Salvar</button></div></form></section>
<div class="stack">
<section class="card"><h2>Link público</h2><p class="muted">Quem tiver o link vê a visão geral de tráfego, somente leitura e sem login. Dados de vendas nunca são públicos.</p>
${s.share_token ? html`<pre><code>${originUrl}/share/${s.share_token}</code></pre><form method="post" action="${base}/settings" class="row"><input type="hidden" name="action" value="share_off"><a class="btn" href="/share/${s.share_token}" target="_blank" rel="noopener">Abrir</a><button class="danger">Desativar link</button></form>`
    : html`<form method="post" action="${base}/settings"><input type="hidden" name="action" value="share_on"><button>Gerar link público</button></form>`}</section>
${ctx.user.role === 'admin' ? html`<section class="card"><h2>Excluir site</h2><p class="muted">Apaga o site e <b>todos</b> os dados: visitas, vendas, gastos e integrações. Não há como desfazer.</p>
<form method="post" action="${base}/delete" class="row"><label class="f">Confirmação<span>Digite <code>${s.id}</code></span><input name="confirm" required autocomplete="off"></label><button class="danger" style="align-self:end">Excluir permanentemente</button></form></section>` : ''}
</div></div>`);
}

export function sitesPage(ctx, rows, err) {
  return layout(ctx, 'Sites', html`${pageHead('Admin · sites', raw('Seus <em>sites</em>'), 'Cada site tem seu próprio snippet, webhooks e contas de anúncio.')}
${notice(err, true)}
<section class="card">${rows.length ? html`<div class="tw"><table class="list"><thead><tr><th>Site</th><th>Visitantes hoje</th><th>Faturamento hoje</th></tr></thead><tbody>${rows.map(r => html`<tr><td><a href="/sites/${encodeURIComponent(r.id)}">${r.name}</a> <span class="muted">${r.id}</span></td><td>${num(r.visitors)}</td><td>${money(r.net, r.currency)}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">Nenhum site ainda.</p>`}</section>
<section class="card" style="margin-top:14px"><h2>Novo site</h2><form method="post" action="/sites" class="stack" style="margin-top:14px">
<label class="f">Nome<input name="name" required maxlength="80" placeholder="Meu infoproduto"></label>
<label class="f">Id<span>Usado no snippet: letras, números, ponto, hífen.</span><input name="id" required pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{0,63}" placeholder="meu-produto"></label>
<label class="f">Fuso horário${tzSelect(ctx.defaultTz)}</label>
<label class="f">Moeda<input name="currency" value="BRL" pattern="[A-Za-z]{3}" maxlength="3" required></label>
<div><button class="primary">Criar site</button></div></form></section>`);
}

const siteChecks = (allSites, chosen) => allSites.length
  ? html`<div class="checks">${allSites.map(s => html`<label><input type="checkbox" name="sites" value="${s.id}"${chosen.has(s.id) ? raw(' checked') : ''}>${s.name}</label>`)}</div>` : html`<span class="muted">Nenhum site cadastrado.</span>`;
const roleSelect = cur => html`<select name="role" aria-label="Papel">${Object.entries(ROLES).map(([k, t]) => html`<option value="${k}"${k === cur ? raw(' selected') : ''}>${t}</option>`)}</select>`;

export function teamPage(ctx, users, allSites, { link: inviteLink, err } = {}) {
  return layout(ctx, 'Equipe', html`${pageHead('Admin · equipe', raw('Quem vê <em>o quê</em>'), raw('<b>Admin</b>: tudo, inclusive equipe e sites. <b>Editor</b>: vê e configura os sites liberados (integrações, funis, link público). <b>Leitor</b>: só vê os sites liberados.'))}
${notice(err, true)}
${inviteLink ? html`<div class="notice" role="status">Link de acesso, válido por 7 dias. Envie para a pessoa:<pre><code>${inviteLink}</code></pre></div>` : ''}
<section class="card"><h2>Convidar pessoa</h2><form method="post" action="/team" class="stack" style="margin-top:14px;max-width:none">
<div class="row"><label class="f">E-mail<input type="email" name="email" required></label><label class="f">Nome<input name="name" maxlength="80"></label><label class="f">Papel${roleSelect('viewer')}</label></div>
<div><span class="lbl" style="margin-bottom:6px">Sites liberados (admins veem todos)</span>${siteChecks(allSites, new Set())}</div><div><button class="primary">Convidar</button></div></form></section>
<section class="card" style="margin-top:14px"><h2>Membros</h2>${users.map(u => html`<div class="member"><div class="row"><b>${u.name || u.email}</b><span class="muted">${u.email}</span>
<span class="badge ${u.role === 'admin' ? 'st-paid' : 'st-paused'}">${ROLES[u.role]}</span>${u.pass ? '' : html`<span class="badge st-pending">convite pendente</span>`}${u.id === ctx.user.id ? html`<span class="muted">· você</span>` : ''}</div>
${u.id === ctx.user.id ? '' : html`<form method="post" action="/team/${u.id}" class="row">${roleSelect(u.role)}${siteChecks(allSites, u.sites)}<button>Salvar</button></form>
<div class="row"><form method="post" action="/team/${u.id}/link"><button class="link">Gerar novo link de acesso</button></form><form method="post" action="/team/${u.id}/delete"><button class="link danger">Remover</button></form></div>`}</div>`)}</section>`);
}

export function accountPage(ctx, msg, err) {
  return layout(ctx, 'Conta', html`${pageHead('Conta', raw('Sua <em>conta</em>'), `${ctx.user.email} · ${ROLES[ctx.user.role]}`)}
${notice(msg)}${notice(err, true)}
<section class="card" style="max-width:560px"><h2>Trocar senha</h2><form method="post" action="/account/password" class="stack" style="margin-top:14px">
<label class="f">Senha atual<input type="password" name="current" required autocomplete="current-password"></label>
<label class="f">Nova senha (mín. 8)<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
<label class="f">Confirmar<input type="password" name="confirm" required minlength="8" autocomplete="new-password"></label><div><button class="primary">Trocar senha</button></div></form></section>`);
}

const authCard = body => html`<div class="auth"><a class="brand" href="/" style="margin-bottom:22px;font-size:34px">rastro<i></i></a><div class="card">${body}</div><div class="zig" aria-hidden="true"></div></div>`;

export function loginPage(ctx, { next = '', email = '', err } = {}) {
  return layout(ctx, 'Entrar', authCard(html`<div class="eyebrow">Acesso</div><h1 style="font-size:40px;margin-bottom:18px">Entrar</h1>${notice(err, true)}
<form method="post" action="/login" class="stack"><input type="hidden" name="next" value="${next}">
<label class="f">E-mail<input type="email" name="email" value="${email}" required autocomplete="username" autofocus></label>
<label class="f">Senha<input type="password" name="password" required autocomplete="current-password"></label><div><button class="primary">Entrar</button></div></form>`), { bare: true });
}

export function invitePage(ctx, user, err) {
  return layout(ctx, 'Definir senha', authCard(user ? html`<div class="eyebrow">Convite</div><h1 style="font-size:40px">Bem-<em>vindo</em></h1><p class="sub" style="margin-bottom:16px">Defina uma senha para ${user.email}.</p>${notice(err, true)}
<form method="post" class="stack"><label class="f">Senha (mín. 8)<input type="password" name="password" required minlength="8" autocomplete="new-password" autofocus></label>
<label class="f">Confirmar<input type="password" name="confirm" required minlength="8" autocomplete="new-password"></label><div><button class="primary">Salvar e entrar</button></div></form>`
    : html`<h1 style="font-size:40px">Link inválido</h1><p class="sub" style="margin-bottom:16px">Este link expirou ou já foi usado. Peça um novo a um admin.</p><a class="btn" href="/login">Ir para o login</a>`), { bare: true });
}

export function messagePage(ctx, title, text) {
  return layout(ctx, title, authCard(html`<h1 style="font-size:40px">${title}</h1><p class="sub" style="margin-bottom:16px">${text}</p><a class="btn" href="/">Voltar</a>`), { bare: !ctx.user });
}
