# Servidor na Oracle: o Sinqfy no ar 24 horas, de graça

Passo a passo para quem nunca mexeu com servidor, usando a **Oracle Cloud** como exemplo de VPS gratuita. O Sinqfy roda em **qualquer VPS com Docker** (Hetzner, DigitalOcean, Contabo, Hostinger, Magalu Cloud...): nesses provedores, troque as partes 1 e 2 pela criação da máquina no painel deles e siga daqui da parte 3 em diante. Comparação e alternativas em [Onde hospedar](hospedagem.md).

No fim você terá o painel em `https://app.seudominio.com.br`, o banco de dados na mesma máquina, nenhuma porta aberta na internet e backup todo dia.

![Onde cada peça roda: Cloudflare na frente, VPS da Oracle com Docker atrás](img/hospedagem.svg)

**Tempo:** cerca de 1 hora. **Custo:** zero dentro do plano gratuito (Always Free) da Oracle e do plano grátis da Cloudflare. Leia [Como não ser cobrado](#como-não-ser-cobrado-pela-oracle) antes de criar qualquer coisa.

Antes, deixe o domínio na Cloudflare ([guia da Cloudflare, parte 1](guia-cloudflare.md#parte-1-colocar-o-domínio-na-cloudflare)) ou escolha outro jeito de publicar ([Onde hospedar](hospedagem.md#os-três-jeitos-de-publicar-o-painel)).

> As telas da Oracle mudam de vez em quando. Se um nome de botão estiver diferente, procure pela palavra em **negrito**.

## Como não ser cobrado pela Oracle

A Oracle tem dois tipos de recurso: os **Always Free** (grátis para sempre, dentro de limites) e os pagos. O risco é criar um pago sem perceber.

**Os dois tipos de conta:**

| Conta | O que acontece | Risco de cobrança |
|---|---|---|
| **Free Tier** (como toda conta começa) | 30 dias com US$ 300 de crédito para testar qualquer coisa. Depois, só o que é Always Free continua; o resto é **desligado e apagado** | Nenhum: sem upgrade, o cartão não é cobrado |
| **Pay As You Go** (depois do upgrade) | O Always Free continua grátis. Tudo o que passar dos limites é **cobrado no cartão** | Existe, se você criar algo fora do Always Free |

**Vale fazer o upgrade?** Na conta Free Tier, a Oracle pode **recuperar (desligar) máquinas gratuitas paradas**: as que, por 7 dias, usam menos de 20% de processador, rede e memória. O Sinqfy usa pouco e pode cair nessa regra. Na Pay As You Go isso não acontece. Recomendamos o upgrade **só depois** de criar a máquina e com o alerta de orçamento ligado (abaixo).

**Os limites gratuitos que este guia usa** (confira a lista oficial "Always Free Resources" na documentação da Oracle, porque ela muda):

| Recurso | Limite grátis | Este guia usa |
|---|---|---|
| Máquinas Ampere A1 (ARM) | 4 OCPUs e 24 GB de memória no total da conta | 2 OCPUs e 12 GB |
| Disco (boot + volumes) | 200 GB no total | cerca de 47 GB |
| Backups de volume | 5 | nenhum (o backup vai para o R2) |
| Tráfego de saída | 10 TB por mês | muito menos |

**Nunca escolha** (custa dinheiro):

- Máquinas **AMD** ou **Intel** (`VM.Standard.E4`, `E5`, `Standard3`...) ou com **GPU**. A única AMD grátis é a `VM.Standard.E2.1.Micro`, fraca demais para o Sinqfy.
- Mais de **4 OCPUs** ou **24 GB** somando todas as máquinas Ampere.
- Disco de boot ou volumes que passem de **200 GB** no total.
- Imagens do **Marketplace** com licença paga, ou **Windows**.
- Banco gerenciado, Load Balancer acima do gratuito, Kubernetes (OKE), "Dedicated" ou "Bare Metal": o Sinqfy não precisa de nada disso.

**Antes de criar a máquina:**

1. Confira a etiqueta **"Always Free-eligible"** ao lado da imagem e do formato (shape). Sem ela, não é grátis.
2. Crie um **alerta de orçamento:** menu ☰ → **Billing & Cost Management** → **Budgets** → **Create Budget**. Nome `alerta`, alvo: o compartimento raiz, **Budget amount:** `1` (na moeda da conta), regra de alerta em **Actual spend** com **1%** do valor e o seu e-mail. Ele **avisa**, mas não bloqueia gasto: se o e-mail chegar, abra **Cost Analysis** e veja o que está cobrando.
3. Na primeira semana, abra **Billing & Cost Management** → **Cost Analysis** uma vez por dia. O esperado é zero.

**Para apagar a máquina sem deixar disco pago:** em **Terminate**, marque **Permanently delete the attached boot volume**.

## Parte 1: a conta na Oracle

1. Acesse **cloud.oracle.com** → **Sign up** (ou **Sign in**, se já criou).
2. No cadastro, escolha a **Home Region** mais perto do seu público: **Brazil East (Sao Paulo)** ou **Brazil Southeast (Vinhedo)**. Ela **não pode ser trocada depois**, e as máquinas gratuitas só existem nela.
3. A Oracle pede um cartão para verificar a identidade. Pode aparecer uma cobrança de teste pequena que é estornada.
4. Para entrar depois: **cloud.oracle.com** → **Cloud Account Name** (o nome da conta que você escolheu no cadastro) → e-mail e senha.
5. Ligue a **verificação em duas etapas** quando a Oracle pedir (ela usa o app Oracle Mobile Authenticator ou outro app de código).

## Parte 2: criar a máquina virtual (VPS)

1. Confira no canto superior direito se a região é a sua **Home Region**.
2. Menu ☰ (canto superior esquerdo) → **Compute** → **Instances** → **Create instance**.
3. Preencha, de cima para baixo:

   | Campo | O que pôr | Observação |
   |---|---|---|
   | **Name** | `sinqfy` | Só um nome |
   | **Compartment** | o que já vem (o raiz da conta) | Não precisa criar outro |
   | **Placement** | o que já vem (AD-1) | São Paulo e Vinhedo têm um só |
   | **Security** (Shielded instance) | deixe desligado | Não existe para Ampere |
   | **Image and shape** | clique em **Edit** (veja abaixo) | Aqui é que mora o risco de cobrança |
   | **Primary VNIC** | **Create new virtual cloud network** e **Create new public subnet** | Os nomes sugeridos servem |
   | **Assign a public IPv4 address** | **Yes** | Você precisa dele para o SSH |
   | **Add SSH keys** | **Generate a key pair for me** → **Save private key** e **Save public key** | Guarde o `.key` num lugar seguro: não dá para baixar de novo |
   | **Boot volume** | deixe como está | Não marque tamanho personalizado acima de 200 GB |
   | **Advanced options** | não mexa | |

4. Em **Image and shape** → **Edit**:
   - **Change image** → **Ubuntu** → **Canonical Ubuntu 24.04** (a versão normal, não a "Minimal") → **Select image**.
   - **Change shape** → **Virtual machine** → **Ampere** → marque **VM.Standard.A1.Flex** → **Number of OCPUs:** `2` → **Amount of memory (GB):** `12` → **Select shape**.
   - Confira a etiqueta **Always Free-eligible** nos dois.
5. Antes de **Create**, olhe o resumo de custo no rodapé ou na lateral, se aparecer: tem que mostrar **0**.
6. **Create**. Em 1 ou 2 minutos o status fica **Running**. Anote o **Public IP address** na página da máquina.

> **"Out of capacity for shape VM.Standard.A1.Flex"?** As máquinas gratuitas acabam em algumas horas do dia. Tente de novo mais tarde (de madrugada costuma funcionar) ou com 1 OCPU e 6 GB. Na conta Pay As You Go a fila anda mais rápido.

Com o túnel da Cloudflare, não precisa abrir porta nenhuma: só a 22 (SSH) fica aberta, para você. Se for usar o **Caddy** ([Onde hospedar](hospedagem.md#os-três-jeitos-de-publicar-o-painel)), libere as portas 80 e 443: na página da máquina → **Subnet** → **Security Lists** → **Default Security List** → **Add Ingress Rules** → Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port Range `80,443`. Na imagem Ubuntu da Oracle, libere também no sistema: `sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save`.

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

Deu certo quando o terminal mostra `ubuntu@sinqfy:~$`. A partir daqui, os comandos são digitados **dentro da máquina**.

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

## Parte 5: baixar o Sinqfy

```bash
git clone https://github.com/igs-wbr/sinqfy.git
cd sinqfy/deploy
```

Se o repositório for **privado**, o Git pede usuário e senha. A senha **não** é a do GitHub: crie um token em GitHub → Settings → Developer settings → **Personal access tokens** → **Fine-grained tokens**, só com permissão de leitura (**Contents: Read-only**) nesse repositório, e cole o token como senha.

## Parte 6: criar o túnel da Cloudflare

Siga a [parte 2 do guia da Cloudflare](guia-cloudflare.md#parte-2-túnel-do-painel-appseudominio) e volte com o **token do túnel** copiado. Sem Cloudflare, pule esta parte e use o Caddy ou o seu proxy ([Onde hospedar](hospedagem.md#os-três-jeitos-de-publicar-o-painel)).

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
| `COMPOSE_PROFILES` | `cloudflare` (túnel), `caddy` (HTTPS na própria VPS) ou vazio (proxy seu) |
| `DOMAIN` | Só com `caddy`: o endereço do painel, ex.: `app.seudominio.com.br` |
| `POSTGRES_PASSWORD` | 1º segredo gerado |
| `TUNNEL_TOKEN` | Só com `cloudflare`: o token do túnel (só o valor depois de `--token`) |
| `ADMIN_EMAIL` e `ADMIN_PASSWORD` | O seu login no painel. Senha com 12 caracteres ou mais (`openssl rand -base64 18`) |
| `PUBLIC_URL` | `https://app.seudominio.com.br` (sem barra no fim) |
| `CRON_SECRET` | 2º segredo |
| `DATA_KEY` | 3º segredo. **Guarde uma cópia fora do servidor** (gerenciador de senhas): sem ela, os contatos cifrados ficam ilegíveis para sempre |
| `EDGE_SECRET` | 4º segredo (o mesmo vai para o Worker no [guia da Cloudflare](guia-cloudflare.md#parte-3-worker-da-borda-tseudominio)) |
| `EDGE_URL` | O endereço do Worker: `https://t.seudominio.com.br` com domínio, ou `https://trackify.sua-conta.workers.dev` |
| `CF_API_TOKEN`, `CF_ZONE_ID`, `CF_SAAS_TARGET` | Só se for cadastrar domínio de clientes ([guia da Cloudflare, parte 4](guia-cloudflare.md#parte-4-domínio-dos-clientes-cloudflare-for-saas)). Pode deixar vazio |
| `BACKUP_REMOTE` | Destino do backup no rclone. Padrão `r2crypt:` (parte 10); serve qualquer S3 |
| `GEMINI_API_KEY` | Opcional (sugestão de coluna do CRM por IA). Pode deixar vazio |

No `nano`: as setas andam, **Ctrl+O** e **Enter** salvam, **Ctrl+X** sai.

> Nunca use `LOGIN=off` aqui. Esse modo é só para uso no próprio computador, e o servidor o ignora de propósito.

## Parte 8: ligar

```bash
docker compose up -d --build
docker compose logs -f app
```

A primeira vez demora alguns minutos. Espere aparecer **"Sinqfy rodando"** e saia do log com **Ctrl+C** (o sistema continua rodando).

**Deu certo quando:** `https://app.seudominio.com.br` abre a tela de login e você entra com o `ADMIN_EMAIL` e a `ADMIN_PASSWORD`.

## Parte 9: garantir que fica no ar 24 horas

Cada parte (banco, painel e túnel) está configurada para **reiniciar sozinha** se cair e quando a máquina religar. Teste uma vez:

```bash
sudo reboot
```

Espere 2 minutos, abra o painel no navegador. Ele deve voltar sozinho. Para conferir pela máquina: `cd ~/sinqfy/deploy && docker compose ps` mostra os três como `running`.

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
   - `r2crypt`: tipo **crypt**, apontando para `r2:sinqfy-backups`, com uma senha forte **guardada fora da máquina**.
3. Teste e agende para as 4h da manhã:
   ```bash
   chmod +x ~/sinqfy/deploy/backup.sh && ~/sinqfy/deploy/backup.sh
   (crontab -l 2>/dev/null; echo "0 4 * * * $HOME/sinqfy/deploy/backup.sh") | crontab -
   ```

**Restaurar um backup:** `rclone copy r2crypt:sinqfy-AAAA-MM-DD.sql.gz .` e depois `gunzip -c sinqfy-AAAA-MM-DD.sql.gz | docker compose exec -T postgres psql -U rastro rastro`.

## Atualizar para a versão nova

```bash
cd ~/sinqfy && git pull && cd deploy && docker compose up -d --build app
```

Os dados ficam; só o painel é trocado. Mudanças no banco são aplicadas sozinhas na subida.

## Comandos úteis

| Para | Comando (dentro de `~/sinqfy/deploy`) |
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

Trocar a senha de um usuário (dentro de `~/sinqfy/deploy`; troque o e-mail e a senha):

```bash
docker compose exec app node --input-type=module -e "import { db, hashPassword, ready } from './src/db.js'; await ready; const r = await db.run('UPDATE users SET pass=? WHERE lower(email)=lower(?)', [hashPassword('SENHA_NOVA'), 'voce@exemplo.com']); console.log('usuários alterados:', r.rowCount); process.exit(0)"
```

## Desenvolvimento local

```bash
docker run -d --name rastro-pg -e POSTGRES_USER=rastro -e POSTGRES_PASSWORD=rastro -e POSTGRES_DB=rastro -p 55432:5432 postgres:17-alpine
npm start   # usa postgres://rastro:rastro@127.0.0.1:55432/rastro se DATABASE_URL estiver vazio
npm test    # cada arquivo cria e apaga um schema próprio
```
