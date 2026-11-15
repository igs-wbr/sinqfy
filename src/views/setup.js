// Assistente de primeiro uso: 6 passos, cada um conferido pelos dados do site (src/routes/setup.js).
import { html, raw, layout, pageHead, notice, icon } from './ui.js';

const STATUS = { dns: 'Aguardando o CNAME no seu DNS', ssl: 'DNS ok, emitindo o certificado SSL', active: 'Ativo', error: 'Erro', manual: 'Cadastrado (configuração manual)' };
const when = (ctx, ts) => ts ? new Date(ts).toLocaleString('pt-BR', { timeZone: ctx.site.timezone, dateStyle: 'short', timeStyle: 'short' }) : '';

function step(n, title, ok, body, { open = false } = {}) {
  return html`<details class="card step${ok ? ' ok' : ''}"${open ? raw(' open') : ''}><summary><span class="num" aria-hidden="true">${ok ? icon('check', 16) : n}</span><span class="st"><b>${title}</b><small>${ok ? 'Pronto' : 'Pendente'}</small></span></summary><div class="body">${body}</div></details>`;
}

export function setupPage(ctx, d) {
  const s = ctx.site, base = `/sites/${encodeURIComponent(s.id)}`, st = d.steps;
  const order = ['project', 'domain', 'script', 'meta', 'checkout', 'final'], next = order.find(k => !st[k]);
  const pct = Math.round(d.done / 6 * 100);
  const snippet = `<script defer data-site="${s.id}" src="${d.edgeUrl}/s.js"></script>`;
  const back = html`<input type="hidden" name="back" value="setup">`;

  return layout(ctx, `Primeiros passos · ${s.name}`, html`
${pageHead(`${s.name} · Primeiros passos`, raw(`Deixe o rastreamento <em>pronto</em> em 6 passos`), d.done === 6 ? 'Tudo certo: o site está rastreando e enviando para a Meta.' : `${d.done} de 6 passos prontos. Esta tela confere sozinha a cada 30 segundos.`)}
${notice(d.msg)}${notice(d.err, true)}${ctx.q.get('meta') === 'erro' ? notice('A Meta recusou o pixel ou o token. Confira se o token é da Conversions API deste pixel.', true) : ''}
<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${d.done}" aria-label="Passos prontos"><i style="width:${pct}%"></i></div>
<div class="steps-list">
${step(1, 'Projeto', st.project, html`<p>Nome <b>${s.name}</b>, fuso ${s.timezone}, moeda ${s.currency}.</p><a class="btn" href="${base}/settings">Alterar em Configurações</a>`, { open: next === 'project' })}

${step(2, 'Domínio de rastreamento', st.domain, html`
<p class="muted">Um subdomínio <code>t.</code> do seu site, apontado para o Trackify. Os cookies passam a ser do seu domínio e duram 400 dias, inclusive no Safari.</p>
${s.edge_host ? html`<p><b>${s.edge_host}</b> · <span class="tag ${s.edge_status === 'active' ? 'ok' : s.edge_status === 'error' ? 'bad' : 'warn'}">${STATUS[s.edge_status] || s.edge_status}</span></p>
${s.edge_error ? notice(`Cloudflare: ${s.edge_error}`, true) : ''}
${s.edge_status !== 'active' ? html`<p>No painel do seu domínio (Registro.br, Hostinger, Cloudflare, GoDaddy), crie este registro:</p>
<div class="tw"><table class="data txt"><thead><tr><th>Tipo</th><th>Nome</th><th>Destino</th></tr></thead><tbody><tr><td>CNAME</td><td><code>t</code></td><td><code>${d.target}</code></td></tr></tbody></table></div>
<p class="muted">A propagação leva de minutos a algumas horas.${d.cf ? '' : ' A integração automática com a Cloudflare não está configurada nesta instalação: o suporte do Trackify ativa o domínio para você.'}</p>` : ''}
<div class="row"><form method="post" action="${base}/setup"><input type="hidden" name="action" value="domain_check"><button>${icon('refresh-cw', 16)} Verificar agora</button></form>
<form method="post" action="${base}/setup"><input type="hidden" name="action" value="domain_remove"><button class="link danger">Trocar domínio</button></form></div>`
    : html`<form method="post" action="${base}/setup" class="row"><input type="hidden" name="action" value="domain_add">
<label class="f" style="flex:1">Subdomínio<input name="host" required placeholder="t.seudominio.com.br" pattern="[Tt]\\..+" autocomplete="off"></label><button style="align-self:end"${next === 'domain' ? raw(' class="primary"') : ''}>Cadastrar</button></form>`}`, { open: next === 'domain' })}

${step(3, 'Script no site', st.script, html`
<p class="muted">Cole no <code>&lt;head&gt;</code> de todas as páginas (WordPress: plugin de cabeçalho ou o tema; Elementor: Código personalizado; Google Tag Manager: tag HTML personalizada em todas as páginas).</p>
<pre class="code"><code>${snippet}</code></pre>
${d.first ? html`<p class="okline">${icon('check', 16)}<span>Primeiro evento recebido em ${when(ctx, d.first.ts)}${d.first.host ? ` de ${d.first.host}` : ''}.</span></p>` : html`<p class="muted">Depois de colar, abra o site numa aba: o passo fica pronto sozinho.</p>`}`, { open: next === 'script' })}

${step(4, 'Meta: pixel e Conversions API', st.meta, html`
<p class="muted">No Gerenciador de Eventos da Meta: escolha o pixel (conjunto de dados), copie o ID e, em Configurações, Conversions API, gere um token de acesso.</p>
<form method="post" action="${base}/integrations" class="stack">${back}<input type="hidden" name="action" value="capi">
<div class="fields"><label class="f">ID do pixel<input name="pixel" value="${s.meta_pixel || ''}" pattern="[0-9]{5,25}" required></label>
<label class="f">Token da Conversions API<input name="capi_token" type="password" autocomplete="off" placeholder="${s.meta_capi_token ? '•••••• (mantido)' : ''}"></label></div>
<div class="row"><button${next === 'meta' && !(s.meta_pixel && s.meta_capi_token) ? raw(' class="primary"') : ''}>Salvar</button>${s.meta_pixel && s.meta_capi_token ? html`<button form="meta-test"${next === 'meta' ? raw(' class="primary"') : ''}>Testar conexão</button>` : ''}</div></form>
<form method="post" action="${base}/integrations" id="meta-test" hidden>${back}<input type="hidden" name="action" value="meta_test"></form>
${st.meta ? html`<p class="okline">${icon('check', 16)}<span>Pixel ${s.meta_pixel_name ? html`<b>${s.meta_pixel_name}</b> ` : ''}conectado (conferido em ${when(ctx, s.meta_checked)}).</span></p>` : ''}`, { open: next === 'meta' })}

${step(5, 'Plataforma de venda', st.checkout, html`
<p class="muted">Cadastre a URL de webhook da sua plataforma (Hotmart, Kiwify, Eduzz, Shopify, WooCommerce, Stripe), a planilha do Google ou o webhook personalizado. Todas as URLs estão em Integrações.</p>
<a class="btn" href="${base}/integrations">Abrir Integrações</a>
${d.sale ? html`<p class="okline">${icon('check', 16)}<span>Última venda recebida em ${when(ctx, d.sale.ts)}: ${d.sale.message}.</span></p>` : html`<p class="muted">Faça um pedido de teste (ou use o botão de teste da plataforma): o passo fica pronto quando a venda chegar.</p>`}`, { open: next === 'checkout' })}

${step(6, 'Teste final', st.final, html`
<p class="muted">Pronto quando um visitante com cookie do seu domínio gerou eventos e a Meta confirmou o recebimento de pelo menos um envio do servidor.</p>
<ul class="setup-checks"><li class="${d.cookie ? 'ok' : ''}">${d.cookie ? icon('check', 16) : icon('x', 16)}<span>Visitante com cookie <code>_rid</code>${d.cookie ? ` (último em ${when(ctx, d.cookie.ts)})` : ': precisa do passo 2'}</span></li>
<li class="${d.sent.n ? 'ok' : ''}">${d.sent.n ? icon('check', 16) : icon('x', 16)}<span>Envios aceitos pela Meta nos últimos 7 dias: ${d.sent.n}</span></li></ul>
<a class="btn" href="${base}/events">Ver eventos ao vivo</a>`, { open: next === 'final' })}
</div>
<script nonce="${ctx.nonce}">(function(){var dirty=false;document.addEventListener('input',function(){dirty=true});setInterval(function(){if(dirty||document.hidden||document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;location.reload()},30000)})()</script>`);
}
