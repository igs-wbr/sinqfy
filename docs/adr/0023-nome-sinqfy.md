# ADR 0023: O produto passa a se chamar Sinqfy

## Status
Aceito.

## Data
2026-11-23

## Contexto
Já existe uma empresa chamada Trackify na mesma área. O nome escolhido foi **Sinqfy**: inventado, curto e sem colisão relevante nas buscas abertas (a checagem no INPI, classes 42 e 35, ainda precisa ser feita antes do lançamento). O produto já está no ar, com sites de clientes rastreando, rotas da Cloudflare apontando para o Worker e um servidor de produção.

## Decisão
- **Marca:** mesmo símbolo, mesmo azul (#0E58DB) e mesmo traço desenhado à mão do logotipo anterior; só as letras mudam. As letras novas (`s`, `n`, `q`) seguem a construção das antigas: traço 5, pontas redondas, altura-x de y 20 a 40, curvas de círculo. Arquivos em `public/brand/sinqfy-*`.
- **Muda:** nome no painel, títulos, app instalável, página offline, documentação, README, `package.json`, repositório no GitHub (`igs-wbr/sinqfy`) e as instruções de instalação nova (pasta, VM, túnel e bucket de backup com o nome `sinqfy`).
- **Não muda (quebraria o que está no ar):** `data-rastro`, `window.rastro`, `localStorage.rastro_*`, cookie `_rid`, cabeçalhos `x-rastro-*`, usuário e banco `rastro`, o Worker da Cloudflare `trackify` (publicado pelo GitHub Actions com esse nome e usado pelas rotas dos domínios dos clientes; `CF_WORKER` troca se um dia houver um Worker novo), o túnel e a pasta `~/trackify` do servidor de produção atual, e os contêineres `trackify-*` deste computador. Registros históricos (`docs/producao.md`, `docs/seguranca.md`) também ficam como foram escritos.

## Consequências
- Nenhum site de cliente precisa trocar o snippet ou os links.
- Um Worker com o nome novo exigiria publicar outro Worker e migrar as rotas; não vale a pena enquanto o nome não aparece para o visitante.
