# Servidor na Oracle: o Trackify no ar 24 horas, de graça

Passo a passo para quem nunca mexeu com servidor. No fim você terá o painel em `https://app.seudominio.com.br`, o banco de dados na mesma máquina, nenhuma porta aberta na internet e backup todo dia.

![Onde cada peça roda: Cloudflare na frente, VPS da Oracle com Docker atrás](img/hospedagem.svg)

**Tempo:** cerca de 1 hora. **Custo:** zero dentro do plano gratuito (Always Free) da Oracle e do plano grátis da Cloudflare.

Antes, deixe o domínio na Cloudflare ([guia da Cloudflare, parte 1](guia-cloudflare.md#parte-1-colocar-o-domínio-na-cloudflare)).

## Parte 1: criar a conta na Oracle

1. Acesse **cloud.oracle.com** → **Sign up**.
2. Escolha a **região** (Home Region) mais perto do seu público: **Brazil East (Sao Paulo)** ou **Brazil Southeast (Vinhedo)**. Ela não pode ser trocada depois.
3. A Oracle pede um cartão só para verificar a identidade. Dentro dos limites Always Free não há cobrança.
4. Depois que a conta estiver ativa, recomendamos fazer o **upgrade para Pay As You Go** (Billing → Upgrade). Continua grátis dentro dos limites e evita que a Oracle desligue máquinas gratuitas paradas. Se quiser segurança extra, crie um alerta de orçamento de R$ 1 em **Billing → Budgets**.

## Parte 2: criar a máquina virtual (VPS)

1. Menu ☰ → **Compute** → **Instances** → **Create instance**.
2. **Name:** `trackify`.
3. **Image and shape** → **Edit**:
   - Image: **Ubuntu**, versão **24.04** (Canonical).
   - Shape: **Ampere** → **VM.Standard.A1.Flex**, com **2 OCPUs** e **12 GB** de memória. Isso é metade do limite gratuito; sobra a outra metade para outros projetos.
4. **Networking:** deixe criar a rede padrão, com **IP público**.
5. **Add SSH keys** → **Generate a key pair for me** → **Save private key**. Guarde o arquivo `.key` num lugar seguro: é a chave da sua máquina e não dá para baixar de novo.
6. **Create**. Em 1 ou 2 minutos o status fica **Running**. Anote o **Public IP address**.

> **"Out of capacity"?** As máquinas gratuitas acabam em algumas regiões. Tente outro **Availability Domain** na mesma tela ou de novo mais tarde (de madrugada costuma funcionar).

Não precisa abrir porta nenhuma. O acesso pela internet vai entrar pelo túnel da Cloudflare, e só a porta 22 (SSH) fica aberta, para você.

## Parte 3: entrar na máquina pelo Windows

Abra o **PowerShell** e rode, trocando o caminho da chave e o IP:

```powershell
ssh -i C:\Users\SEU_USUARIO\Downloads\ssh-key.key ubuntu@IP_DA_MAQUINA
```

Na primeira vez ele pergunta se confia na máquina: digite `yes`.

**Erro "UNPROTECTED PRIVATE KEY FILE"?** O Windows deixou a chave aberta para outros usuários. Rode uma vez e tente de novo:

```powershell
icacls C:\Users\SEU_USUARIO\Downloads\ssh-key.key /inheritance:r
icacls C:\Users\SEU_USUARIO\Downloads\ssh-key.key /grant:r "$($env:USERNAME):(R)"
```

Deu certo quando o terminal mostra `ubuntu@trackify:~$`. A partir daqui, os comandos são digitados **dentro da máquina**.

## Parte 4: preparar a máquina

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Sao_Paulo
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

O `exit` é para sair e entrar de novo (Parte 3), e o seu usuário passar a usar o Docker sem `sudo`. Confira com `docker run --rm hello-world`: deve aparecer "Hello from Docker!".

O Docker já vem configurado para ligar sozinho quando a máquina liga.

## Parte 5: baixar o Trackify

```bash
git clone https://github.com/igs-wbr/rastro.git
cd rastro/deploy
```

Se o repositório for **privado**, o Git pede usuário e senha. A senha **não** é a do GitHub: crie um token em GitHub → Settings → Developer settings → **Personal access tokens** → **Fine-grained tokens**, só com permissão de leitura (**Contents: Read-only**) nesse repositório, e cole o token como senha.

## Parte 6: criar o túnel da Cloudflare

Siga a [parte 2 do guia da Cloudflare](guia-cloudflare.md#parte-2-túnel-do-painel-appseudominio) e volte com o **token do túnel** copiado.

## Parte 7: as configurações (`.env`)

Gere quatro segredos aleatórios. Rode quatro vezes e copie cada resultado:

```bash
openssl rand -hex 32
```

Crie o arquivo de configuração e abra no editor:

```bash
cp .env.example .env
nano .env
```

Preencha:

| Variável | O que pôr |
|---|---|
| `POSTGRES_PASSWORD` | 1º segredo gerado |
| `TUNNEL_TOKEN` | O token do túnel da Cloudflare (só o valor depois de `--token`) |
| `ADMIN_EMAIL` e `ADMIN_PASSWORD` | O seu login no painel. Use uma senha forte |
| `PUBLIC_URL` | `https://app.seudominio.com.br` (sem barra no fim) |
| `CRON_SECRET` | 2º segredo |
| `DATA_KEY` | 3º segredo. **Guarde uma cópia fora do servidor** (gerenciador de senhas): sem ela, os contatos cifrados ficam ilegíveis para sempre |
| `EDGE_SECRET` | 4º segredo (o mesmo vai para o Worker no [guia da Cloudflare](guia-cloudflare.md#parte-3-worker-da-borda-tseudominio)) |
| `EDGE_URL` | `https://t.seudominio.com.br` |
| `CF_API_TOKEN`, `CF_ZONE_ID`, `CF_SAAS_TARGET` | Só se for cadastrar domínio de clientes ([guia da Cloudflare, parte 4](guia-cloudflare.md#parte-4-domínio-dos-clientes-cloudflare-for-saas)). Pode deixar vazio |
| `GEMINI_API_KEY` | Opcional (sugestão de coluna do CRM por IA). Pode deixar vazio |

No `nano`: as setas andam, **Ctrl+O** e **Enter** salvam, **Ctrl+X** sai.

> Nunca use `LOGIN=off` aqui. Esse modo é só para uso no próprio computador, e o servidor o ignora de propósito.

## Parte 8: ligar

```bash
docker compose up -d --build
docker compose logs -f app
```

A primeira vez demora alguns minutos. Espere aparecer **"Trackify rodando"** e saia do log com **Ctrl+C** (o sistema continua rodando).

**Deu certo quando:** `https://app.seudominio.com.br` abre a tela de login e você entra com o `ADMIN_EMAIL` e a `ADMIN_PASSWORD`.

## Parte 9: garantir que fica no ar 24 horas

Cada parte (banco, painel e túnel) está configurada para **reiniciar sozinha** se cair e quando a máquina religar. Teste uma vez:

```bash
sudo reboot
```

Espere 2 minutos, abra o painel no navegador. Ele deve voltar sozinho. Para conferir pela máquina: `cd ~/rastro/deploy && docker compose ps` mostra os três como `running`.

Para ser avisado se o painel cair, cadastre `https://app.seudominio.com.br/login` num monitor gratuito de disponibilidade (UptimeRobot, Better Stack ou parecido), checando a cada 5 minutos.

O próprio servidor roda as tarefas periódicas: envio de eventos a cada 5 segundos, sincronização da Meta a cada hora e limpeza dos dados antigos. Não precisa de agendador externo.

## Parte 10: backup diário no R2

O banco é copiado todo dia, cifrado, para o R2 da Cloudflare (grátis até 10 GB).

1. Crie o bucket e a chave no [guia da Cloudflare, parte 5](guia-cloudflare.md#parte-5-r2-para-o-backup).
2. Na máquina:
   ```bash
   sudo apt-get install -y rclone
   rclone config
   ```
   Crie dois "remotes":
   - `r2`: tipo **s3**, provider **Cloudflare**, as chaves do token do R2, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
   - `r2crypt`: tipo **crypt**, apontando para `r2:rastro-backups`, com uma senha forte **guardada fora da máquina**.
3. Teste e agende para as 4h da manhã:
   ```bash
   chmod +x ~/rastro/deploy/backup.sh && ~/rastro/deploy/backup.sh
   (crontab -l 2>/dev/null; echo "0 4 * * * $HOME/rastro/deploy/backup.sh") | crontab -
   ```

**Restaurar um backup:** `rclone copy r2crypt:rastro-AAAA-MM-DD.sql.gz .` e depois `gunzip -c rastro-AAAA-MM-DD.sql.gz | docker compose exec -T postgres psql -U rastro rastro`.

## Atualizar para a versão nova

```bash
cd ~/rastro && git pull && cd deploy && docker compose up -d --build app
```

Os dados ficam; só o painel é trocado. Mudanças no banco são aplicadas sozinhas na subida.

## Comandos úteis

| Para | Comando (dentro de `~/rastro/deploy`) |
|---|---|
| Ver se está tudo rodando | `docker compose ps` |
| Ver o log do painel | `docker compose logs -f --tail 100 app` |
| Reiniciar o painel (depois de mudar o `.env`) | `docker compose up -d app` |
| Ver o espaço em disco | `df -h /` |
| Entrar no banco | `docker compose exec postgres psql -U rastro rastro` |

## Deu errado?

| Sintoma | O que fazer |
|---|---|
| Página da Cloudflare com erro **1033** ou **502** | O túnel não alcança o painel. `docker compose ps` e `docker compose logs cloudflared`. Confira o `TUNNEL_TOKEN` e o serviço `http://app:8080` no túnel |
| `docker compose up` reclama de variável | Faltou preencher no `.env` a variável indicada na mensagem |
| Log com "Defina ADMIN_EMAIL e ADMIN_PASSWORD" | Primeira subida sem login de admin no `.env` |
| Esqueci a senha do painel | Rode o comando abaixo da tabela, com o seu e-mail e a senha nova. Nunca apague o volume do banco para "recomeçar" |
| Máquina sumiu ou parou | Veja se a conta virou Pay As You Go (Parte 1); máquinas gratuitas paradas podem ser recuperadas pela Oracle |

Trocar a senha de um usuário (dentro de `~/rastro/deploy`; troque o e-mail e a senha):

```bash
docker compose exec app node --input-type=module -e "import { db, hashPassword, ready } from './src/db.js'; await ready; const r = await db.run('UPDATE users SET pass=? WHERE lower(email)=lower(?)', [hashPassword('SENHA_NOVA'), 'voce@exemplo.com']); console.log('usuários alterados:', r.rowCount); process.exit(0)"
```

## Desenvolvimento local

```bash
docker run -d --name rastro-pg -e POSTGRES_USER=rastro -e POSTGRES_PASSWORD=rastro -e POSTGRES_DB=rastro -p 55432:5432 postgres:17-alpine
npm start   # usa postgres://rastro:rastro@127.0.0.1:55432/rastro se DATABASE_URL estiver vazio
npm test    # cada arquivo cria e apaga um schema próprio
```
