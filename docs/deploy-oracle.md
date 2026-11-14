# Colocar o Rastro no ar na Oracle

Etapa 0 do [plano v2](plano-v2/plano.html). Resultado: painel em `https://app.seudominio.com.br`, banco Postgres na mesma VM, nenhuma porta aberta na internet e backup diário no R2.

## O que você precisa
- Conta na Oracle Cloud (Always Free) convertida para **Pay As You Go**. Continua gratuita dentro dos limites e evita que a VM ociosa seja recuperada.
- Domínio na Cloudflare.
- Bucket no Cloudflare R2 chamado `rastro-backups` e um token de API do R2 (leitura e escrita).

## 1. Criar a VM
1. Oracle Cloud → Compute → Instances → Create instance.
2. Imagem **Ubuntu 24.04**, shape **VM.Standard.A1.Flex** (Ampere ARM) com 2 OCPUs e 12 GB. Sobra metade do limite gratuito para outros projetos.
3. Baixe a chave SSH. Não precisa liberar nenhuma porta além da 22 (o tráfego entra pelo túnel da Cloudflare).
4. Se aparecer "Out of capacity", tente outro Availability Domain ou de novo mais tarde.

## 2. Instalar o Docker
```bash
ssh -i chave.key ubuntu@IP_DA_VM
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit
```

## 3. Criar o túnel da Cloudflare
1. Cloudflare → Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared → nome `rastro`.
2. Copie o **token** que aparece no comando de instalação do Docker (só o valor depois de `--token`).
3. Em Public Hostnames: `app.seudominio.com.br` → Service `HTTP` → `app:8080`.

## 4. Subir
Copie o projeto para a VM (pelo GitHub ou `scp`) e:
```bash
cd rastro/deploy
cp .env.example .env   # preencha: POSTGRES_PASSWORD, TUNNEL_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD, PUBLIC_URL, CRON_SECRET
docker compose up -d --build
docker compose logs -f app   # espere "Rastro rodando"
```
Abra `https://app.seudominio.com.br` e entre com o admin do `.env`.

## 5. Backup diário no R2
```bash
sudo apt-get install -y rclone
rclone config   # 1) remoto "r2", tipo s3, provider Cloudflare, chaves do token do R2, endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com
                # 2) remoto "r2crypt", tipo crypt, apontando para r2:rastro-backups, com senha forte guardada fora da VM
chmod +x ~/rastro/deploy/backup.sh && ~/rastro/deploy/backup.sh   # teste manual
(crontab -l 2>/dev/null; echo "0 4 * * * $HOME/rastro/deploy/backup.sh") | crontab -
```
Para restaurar: `rclone copy r2crypt:rastro-AAAA-MM-DD.sql.gz .` e `gunzip -c rastro-AAAA-MM-DD.sql.gz | docker compose exec -T postgres psql -U rastro rastro`.

## 6. Worker da borda
O Worker grava os cookies no seu domínio e repassa os eventos ao painel.
```bash
openssl rand -hex 32   # gere o EDGE_SECRET e coloque também no deploy/.env do painel
cd edge
npx wrangler login
npx wrangler r2 bucket create rastro-raw
npx wrangler r2 bucket lifecycle add rastro-raw expira-30d failed/ --expire-days 30
npx wrangler secret put EDGE_SECRET
npx wrangler deploy     # antes, troque t.seudominio.com.br e ORIGIN no wrangler.toml
```
Confira: abra `https://t.seudominio.com.br/s.js` (precisa mostrar o snippet) e, depois de colar o snippet no site, veja os eventos chegando em Tráfego → Eventos com o selo `fbc` ao abrir uma URL com `?fbclid=teste123`.

## 7. Domínio dos clientes (Cloudflare for SaaS)
Para cada cliente usar o próprio `t.dominiodele.com.br`:
1. Na zona do seu domínio: SSL/TLS, Custom Hostnames, ative o Cloudflare for SaaS e defina o **fallback origin** (ex.: `edge.seudominio.com.br`, um registro com proxy laranja). Os primeiros 100 domínios são gratuitos.
2. Crie um token de API com permissão **SSL and Certificates: Edit** nessa zona.
3. No `deploy/.env` do painel: `CF_API_TOKEN`, `CF_ZONE_ID` (Visão geral da zona) e `CF_SAAS_TARGET=edge.seudominio.com.br`. Reinicie o app.
4. Publique o Worker com a rota `*/*` (já está no `edge/wrangler.toml`).

O cliente cadastra o domínio no assistente (Primeiros passos), cria o CNAME `t` apontando para `CF_SAAS_TARGET`, e o painel confere o DNS e o SSL sozinho a cada 5 minutos.

## Atualizar
```bash
cd rastro && git pull && cd deploy && docker compose up -d --build app
```

## Desenvolvimento local
```bash
docker run -d --name rastro-pg -e POSTGRES_USER=rastro -e POSTGRES_PASSWORD=rastro -e POSTGRES_DB=rastro -p 55432:5432 postgres:17-alpine
npm start   # usa postgres://rastro:rastro@127.0.0.1:55432/rastro se DATABASE_URL estiver vazio
npm test    # cada arquivo cria e apaga um schema próprio
```
