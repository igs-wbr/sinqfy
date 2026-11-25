# Onde hospedar o Sinqfy

O Sinqfy não depende de um provedor. Ele precisa de três coisas, e cada uma pode vir de onde você preferir:

| Peça | O que é | Exemplos (os guias usam os marcados) |
|---|---|---|
| **Servidor** | Uma máquina Linux com Docker, ligada 24 horas | **Oracle Cloud (Always Free)**, Hetzner, DigitalOcean, Contabo, Hostinger VPS, Magalu Cloud, AWS Lightsail, Google Cloud, um computador seu |
| **Endereço com HTTPS** | Como o painel chega à internet | **Túnel da Cloudflare**, Caddy (HTTPS automático na própria VPS), Nginx ou Traefik que você já usa |
| **Borda (opcional)** | Serve o script no seu domínio e grava o cookie de 400 dias | **Cloudflare Workers**. Sem borda, o script sai do próprio painel e o visitante é contado por um código diário |

Os guias passo a passo usam **Oracle** e **Cloudflare** porque têm plano gratuito e são os do projeto hoje. Trocar de provedor muda só a parte de criar a máquina e o DNS; o resto é igual.

## Requisitos do servidor

| Item | Mínimo | Recomendado |
|---|---|---|
| Sistema | Qualquer Linux com Docker e Docker Compose | Ubuntu 24.04 |
| Processador | 1 vCPU (x86 ou ARM) | 2 vCPU |
| Memória | 1 GB | 2 GB ou mais |
| Disco | 10 GB | 25 GB ou mais |
| Rede | Saída para a internet (Meta, GA4, Cloudflare) | IPv4 público, se for usar o Caddy |

O banco PostgreSQL roda na mesma máquina, dentro do Docker. Se preferir um banco gerenciado (Neon, Supabase, RDS), aponte `DATABASE_URL` para ele e tire o serviço `postgres` do `docker-compose.yml`.

## Os três jeitos de publicar o painel

Escolha em `COMPOSE_PROFILES`, no `deploy/.env` ([modelo](../deploy/.env.example)):

| `COMPOSE_PROFILES` | Como funciona | Quando usar | Portas abertas na VPS |
|---|---|---|---|
| `cloudflare` | Um túnel sai da VPS para a Cloudflare, que entrega o HTTPS | Domínio na Cloudflare; mais seguro | Nenhuma (só SSH) |
| `caddy` | O Caddy pede e renova o certificado Let's Encrypt sozinho | Qualquer DNS, sem Cloudflare | 80 e 443 |
| (vazio) | O painel fica em `127.0.0.1:8080` | Você já tem Nginx, Traefik ou outro proxy | As do seu proxy |

**Com Caddy:** crie no DNS um registro **A** com o nome do painel (ex.: `app`) apontando para o IP da VPS, libere as portas 80 e 443 no firewall do provedor e no do sistema (`sudo ufw allow 80,443/tcp`, se usar o ufw), e preencha `DOMAIN=app.seudominio.com.br`.

**Com proxy próprio:** encaminhe para `http://127.0.0.1:8080`, mantendo `X-Forwarded-For` e `X-Forwarded-Proto: https`, e **remova** o cabeçalho `CF-Connecting-IP` vindo do visitante (o painel confia nele para saber o IP).

## Passo a passo em qualquer VPS

1. Crie a máquina no provedor (Ubuntu 24.04), com acesso por chave SSH. Exemplo detalhado: [Oracle](deploy-oracle.md).
2. No servidor, rode o instalador ([deploy/instalar.sh](../deploy/instalar.sh)): `curl -fsSL https://github.com/igs-wbr/sinqfy/releases/latest/download/instalar.sh | bash`. Ele instala o Docker se faltar, baixa a versão mais recente em `~/sinqfy`, pergunta o e-mail do admin, o endereço do painel e o jeito de publicar, gera os segredos no `deploy/.env` e sobe tudo. Rodar de novo atualiza e mantém o `.env` e o banco.
3. Sem o instalador: baixe o [pacote .zip](https://github.com/igs-wbr/sinqfy/releases/latest/download/sinqfy.zip) (ou `git clone`), e na pasta `deploy` faça `cp .env.example .env`, preencha (o que é cada variável: [guia da Oracle, parte 7](deploy-oracle.md#parte-7-as-configurações-env)) e rode `docker compose up -d --build`.
4. Confira com `docker compose logs -f app` até aparecer "Sinqfy rodando".
5. Pacote e instalador saem de cada tag `vX.Y.Z` pelo workflow `.github/workflows/release.yml`.
6. Backup: `deploy/backup.sh` com o rclone apontando para qualquer armazenamento compatível com S3 (Cloudflare R2, Backblaze B2, AWS S3, Wasabi), em `BACKUP_REMOTE`.

## E a Vercel?

A Vercel roda o painel como função serverless ([guia](deploy-vercel.md)), com um banco PostgreSQL gerenciado (Neon ou Supabase têm plano gratuito). Funciona, mas com limites:

- O plano gratuito (Hobby) é **só para uso não comercial**.
- Não há processo ligado: os envios para a Meta e o GA4, a recuperação e a sincronização dos anúncios só rodam quando um agendador externo chama `/cron`.
- Cada página faz várias consultas ao banco, então a distância entre a função e o banco pesa.

Para uso de verdade, uma VPS (mesmo gratuita) é o caminho recomendado.

## E sem Cloudflare?

Tudo funciona, com uma diferença: sem um serviço de borda no seu domínio, o script vem do endereço do painel e o navegador não aceita gravar o cookie primário de 400 dias. O visitante passa a ser contado por um código que muda todo dia (como no [ADR 0002](adr/0002-sem-cookies-salt-diario.md)), e a venda casa com o clique pelas UTMs em vez do `rid`.

Outra borda serve se fizer o mesmo que o `edge/worker.js`: responder em `t.seudominio`, gravar os cookies `_rid`, `_fbp` e `_fbc` e repassar o evento ao painel com o cabeçalho `x-edge-secret`. O código do Worker é JavaScript padrão (`fetch`, `Request`, `Response`) e roda em ambientes parecidos com poucas mudanças.
