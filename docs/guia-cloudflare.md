# Cloudflare: domínio, túnel e subdomínio de rastreamento

A Cloudflare é a opção usada nos guias, mas não é obrigatória: sem ela, o painel publica com o Caddy ou outro proxy, e só o cookie de 400 dias da borda fica de fora ([Onde hospedar](hospedagem.md#e-sem-cloudflare)). Com ela, faz quatro trabalhos, todos no plano grátis:

| Peça | Endereço | Para quê |
|---|---|---|
| **DNS e HTTPS** | o seu domínio | Diz para onde cada endereço aponta e emite o certificado |
| **Túnel** | `app.seudominio.com.br` | Leva você e os webhooks até o painel na Oracle sem abrir porta no servidor |
| **Worker da borda** | `t.seudominio.com.br` | Serve o script, grava o cookie de 400 dias e repassa os eventos ao painel |
| **R2** | (interno) | Guarda o backup diário do banco e os eventos que não chegaram ao painel |

![Onde cada peça roda: Cloudflare na frente, VPS da Oracle com Docker atrás](img/hospedagem.svg)

Ordem: parte 1 antes do [guia da Oracle](deploy-oracle.md); parte 2 durante ele; partes 3 e 5 depois que o painel abrir. A parte 4 só é necessária se você atende clientes com domínio próprio.

## Parte 1: colocar o domínio na Cloudflare

1. Entre em **dash.cloudflare.com** → **Add a domain** → digite `seudominio.com.br` → plano **Free**.
2. A Cloudflare copia os registros de DNS que já existem. **Confira se os registros de e-mail (MX) vieram**, senão o e-mail do domínio para de funcionar.
3. Ela mostra **dois nameservers** (ex.: `ana.ns.cloudflare.com` e `bob.ns.cloudflare.com`). Troque os nameservers no lugar onde comprou o domínio:
   - **Registro.br:** entre no painel → clique no domínio → **DNS** → **Alterar servidores DNS** → cole os dois → Salvar.
   - **Hostinger, GoDaddy e outros:** procure **Nameservers** ou **Servidores DNS** nas configurações do domínio.
4. Espere o e-mail "your domain is now active" (normalmente menos de 1 hora; pode levar até 24).
5. Se o seu site já tem certificado na hospedagem, em **SSL/TLS** → **Overview** escolha **Full**. Evita o erro de "redirecionamentos demais".

**Deu certo quando:** o domínio aparece como **Active** no painel da Cloudflare.

## Parte 2: túnel do painel (`app.seudominio`)

O túnel é uma ligação que **sai** do servidor para a Cloudflare. Por isso o servidor não precisa de nenhuma porta aberta.

1. Abra **one.dash.cloudflare.com** (Zero Trust). Na primeira vez, escolha um nome de equipe e o plano **Free**.
2. **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared** → nome `sinqfy` → **Save tunnel**.
3. Em "Choose your environment", escolha **Docker**. Aparece um comando com `--token eyJ...`. **Copie só o valor depois de `--token`**: é o `TUNNEL_TOKEN` do `.env` ([guia da Oracle, parte 7](deploy-oracle.md#parte-7-as-configurações-env)). Clique **Next**.
4. Em **Public Hostname**:

   | Campo | Valor |
   |---|---|
   | Subdomain | `app` |
   | Domain | `seudominio.com.br` |
   | Service Type | `HTTP` |
   | URL | `app:8080` |

5. **Save**. A Cloudflare cria o DNS de `app` sozinha.

**Deu certo quando:** depois do `docker compose up` no servidor, o túnel aparece como **Healthy** e `https://app.seudominio.com.br` abre o login do Sinqfy.

## Parte 3: Worker da borda (`t.seudominio`)

O Worker é um programinha que roda na Cloudflare. Ele entrega o script, grava os cookies `_rid`, `_fbp` e `_fbc` **como se fosse o seu próprio site** (no seu domínio, duram 400 dias, inclusive no Safari) e repassa cada evento ao painel com o segredo `EDGE_SECRET`. Com o R2 ativado, os eventos que o painel não recebeu ficam guardados.

Ele se chama `trackify` e já sai funcionando no endereço `trackify.<sua-conta>.workers.dev`, mesmo sem domínio na Cloudflare.

### 3.1 Publicar a primeira vez (no seu computador)

Com o [Node.js](https://nodejs.org) 24 instalado e o projeto baixado, no terminal, dentro da pasta `edge`:

```bash
npx wrangler login
npx wrangler deploy --var ORIGIN:https://app.seudominio.com.br
npx wrangler secret put EDGE_SECRET
```

- O `login` abre o navegador para autorizar a conta da Cloudflare.
- O `ORIGIN` é o endereço do painel (parte 2).
- No `secret put`, cole **o mesmo** `EDGE_SECRET` do `.env` do servidor.

No servidor, ponha no `.env` o endereço do Worker em `EDGE_URL` e reinicie o painel: `docker compose up -d app`.

### 3.2 Painel no mesmo endereço (opcional)

O Worker pode também mostrar o painel. Assim, um único endereço serve o script, os eventos e o login, e ele não muda quando o túnel reinicia. Publique com o host do Worker em `PANEL_HOST`:

```bash
npx wrangler deploy --var ORIGIN:https://app.seudominio.com.br --var PANEL_HOST:trackify.sua-conta.workers.dev
```

e use esse endereço em `PUBLIC_URL` e `EDGE_URL` no `.env`. O painel só aparece nesse host: em `t.seudominio` e nos domínios de clientes, o Worker continua mostrando só o script.

### 3.3 Deploy automático pelo GitHub

O workflow `.github/workflows/deploy-edge.yml` publica o Worker sozinho a cada push na `main` que mexe na pasta `edge/`. Configure uma vez em GitHub → seu repositório → **Settings** → **Secrets and variables** → **Actions**:

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Token da Cloudflare: **My Profile** → **API Tokens** → **Create Token** → modelo **Edit Cloudflare Workers** → conta: a sua, zonas: todas (ou nenhuma, se não tiver domínio) |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | **Account ID** (página inicial do painel da Cloudflare, menu da conta) |
| Variable | `TRACKIFY_ORIGIN` | O endereço do painel (o mesmo `ORIGIN`) |
| Variable | `TRACKIFY_PANEL_HOST` | O host do Worker para mostrar o painel (3.2), ou vazio |

Sem a variável `TRACKIFY_ORIGIN`, o workflow não roda (cópias do projeto não tentam publicar). Para publicar na hora: aba **Actions** → **Deploy do Worker** → **Run workflow**.

### 3.4 Com domínio na Cloudflare: `t.seudominio`

Em `edge/wrangler.toml`, descomente o bloco `routes` e troque `seudominio.com.br` pelo seu domínio. O Worker passa a responder também em `t.seudominio.com.br` (e nos domínios dos clientes, parte 4). Use `EDGE_URL=https://t.seudominio.com.br` no `.env`.

Com o R2 ativado (painel da Cloudflare → **R2**; pode pedir um cartão, até 10 GB é grátis), crie o bucket com os dois comandos do `wrangler.toml` e descomente o bloco `r2_buckets`.

**Deu certo quando:** o endereço do Worker com `/s.js` no fim mostra um código JavaScript. Depois de colar o script no site, abra uma página com `?fbclid=teste123` no endereço: em **Eventos**, a visita aparece com o selo `fbc`.

## Parte 4: domínio dos clientes (Cloudflare for SaaS)

Para agência com vários clientes na mesma VPS: cada cliente tem o próprio `t.dominiodocliente.com.br`, mesmo com o domínio em **outra conta da Cloudflare** (ou em qualquer outro DNS). O cliente só cria um CNAME; o certificado e o Worker ficam na sua conta. Os 100 primeiros domínios são grátis. Ativar pede aceitar os termos e um cartão na conta (custo base US$ 0; acima de 100 domínios é cobrado por domínio).

1. **Endereço de destino.** No DNS do **seu** domínio, crie:

   | Tipo | Nome | Conteúdo | Proxy |
   |---|---|---|---|
   | AAAA | `edge` | `100::` | ligado (nuvem laranja) |

   É um endereço só para a Cloudflare receber o tráfego; quem responde é o Worker.
2. **Ative o SaaS.** No seu domínio → **SSL/TLS** → **Custom Hostnames** → ative o Cloudflare for SaaS → **Add fallback origin** → `edge.seudominio.com.br`. Espere o status **Active**.
3. **Token da API.** Ícone do perfil → **My Profile** → **API Tokens** → **Create Token** → **Create Custom Token**:
   - Permissions: **Zone** · **SSL and Certificates** · **Edit** e **Zone** · **Workers Routes** · **Edit**.
   - Zone Resources: **Include** · **Specific zone** · o seu domínio.
   - Copie o token (aparece uma vez só).
4. **ID da zona.** Página inicial do seu domínio, coluna da direita: **Zone ID**.
5. No `.env` do servidor:
   ```
   CF_API_TOKEN=o token do passo 3
   CF_ZONE_ID=o ID do passo 4
   CF_SAAS_TARGET=edge.seudominio.com.br
   ```
   e reinicie: `docker compose up -d app`.
6. Não use a rota coringa `*/*`: na sua zona ela faria o Worker responder também pelo painel e pelos outros sites do domínio. Ao cadastrar o domínio de um cliente, o Sinqfy cria a rota só dele (`t.cliente.com.br/*`) e apaga quando o domínio sai. O Worker se chama `trackify`; se tiver outro nome, ponha `CF_WORKER=nome` no `.env`.

**Cada cliente novo:** crie a agência dele em **Agências** (equipe e sites isolados), o site e, em **Primeiros passos**, o domínio. O cliente cria, no DNS dele, um CNAME `t` → `edge.seudominio.com.br` com proxy **desligado** (nuvem cinza). O Sinqfy registra o domínio e a rota na Cloudflare e confere DNS e certificado sozinho a cada 5 minutos. Depois, o snippet do site dele usa `https://t.dominiodele/s.js`, e o checkout e a Meta dele são configurados no site dele, como em qualquer outro.

Sem o passo 5, o Sinqfy mostra ao cliente o mesmo CNAME e você faz à mão: **Custom Hostnames** → **Add Custom Hostname** e, em **Workers Routes**, a rota `t.dominiodocliente/*` para o Worker `trackify`.

## Parte 5: R2 para o backup

1. Painel da Cloudflare → **R2** → **Create bucket** → nome `sinqfy-backups`.
2. **R2** → **Manage R2 API Tokens** → **Create API token** → permissão **Object Read & Write**, só no bucket `sinqfy-backups`.
3. Guarde o **Access Key ID**, o **Secret Access Key** e o **Account ID** (aparece na página do R2). Eles vão no `rclone config` do [guia da Oracle, parte 10](deploy-oracle.md#parte-10-backup-diário-no-r2).

## Domínio em outra conta da Cloudflare

Cada domínio fica numa conta só, e o túnel, o Worker e o subdomínio `t.` precisam estar **na mesma conta do domínio**. Há três caminhos:

| Caminho | Como | Bom para |
|---|---|---|
| **1. Dar acesso à outra conta** (mais simples) | Na conta que tem o domínio: **Manage Account** → **Members** → **Invite**, com o e-mail que você usa hoje e o papel **Administrator**. Aceite o convite no e-mail. O mesmo login passa a enxergar as duas contas | Você é dono das duas e quer continuar com o domínio onde está. Crie o túnel e publique o Worker **na conta do domínio** (`CLOUDFLARE_ACCOUNT_ID` dela no GitHub) |
| **2. Mudar o domínio de conta** | Na conta antiga: domínio → **DNS** → **Records** → **Import and Export** → **Export** (guarda os registros). Depois **Overview** → **Remove site from Cloudflare**. Na conta nova: **Add a domain**, importe o arquivo em **Import** e troque os nameservers no registro do domínio pelos dois novos | Quer tudo numa conta só. O site fica alguns minutos a algumas horas trocando de DNS |
| **3. Domínio comprado na própria Cloudflare (Registrar)** | O registro do domínio também está preso à conta. Antes de remover, procure em **Domain Registration** a opção de mover para outra conta; se não houver, fale com o suporte da Cloudflare ou transfira para outro registrador | Só se o domínio foi **comprado** na Cloudflare |

Cuidados no caminho 2: confira se os registros de e-mail (MX, SPF, DKIM) vieram na importação, e faça a troca num horário de pouco movimento. Workers, túneis e regras de página **não** vão junto: crie de novo na conta nova.

## Por que o subdomínio começa com `t.`?

Porque o Worker usa o `t.` para saber **em qual domínio gravar o cookie**.

- O cookie precisa valer para o site inteiro (`meusite.com.br`), não só para `t.meusite.com.br`. Só assim o script lê o id do visitante em qualquer página e o põe no link do checkout.
- Descobrir sozinho qual parte de um endereço é o domínio principal exige uma lista enorme de exceções (`.com.br`, `.gov.br`, `.co.uk`...), e um erro faria o navegador recusar o cookie. Com a regra fixa ("tira o `t.` do começo"), o Worker nunca erra.
- Uma letra só é curta, neutra e não aparece nas listas de bloqueadores de anúncio. Nomes como `track`, `pixel`, `analytics` ou `stats` costumam ser bloqueados.
- Deixa o passo a passo igual para todo mundo: o CNAME é sempre `t`.

Tecnicamente, qualquer nome de **um nível só** antes do domínio funcionaria (`r.meusite.com.br`, `dados.meusite.com.br`). Para isso, o Worker e a validação do painel teriam que trocar o `t.` fixo por "tira o primeiro nome", e o Worker teria que ser publicado de novo. Se um dia precisar, é uma mudança pequena.

## Deu errado?

| Sintoma | O que fazer |
|---|---|
| Erro **1033** ou **502** em `app.` | O túnel não está ligado ou o serviço está errado. No servidor: `docker compose ps`; no túnel, a URL tem que ser `app:8080` com tipo `HTTP` |
| `t.seudominio.com.br/s.js` dá erro **404** | O `wrangler.toml` está com o domínio de exemplo. Troque e rode `npx wrangler deploy` de novo |
| Eventos não chegam, mas o `s.js` abre | O `EDGE_SECRET` do Worker é diferente do `.env`. Repita o `secret put` com o valor do `.env` e reinicie o app |
| Domínio do cliente parado em "Emitindo SSL" | O CNAME do cliente está com proxy ligado (laranja) ou aponta para outro lugar. Tem que ser cinza e apontar para `edge.seudominio.com.br` |
| Erro **1014** (CNAME Cross-User Banned) | Mesmo caso acima: o cliente também usa Cloudflare e deixou a nuvem laranja |
| O e-mail do domínio parou depois da parte 1 | Faltaram os registros MX. Copie-os do provedor antigo para o DNS da Cloudflare |
