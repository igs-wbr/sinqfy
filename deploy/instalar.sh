#!/usr/bin/env bash
# Instala ou atualiza o Sinqfy numa VPS Linux (Ubuntu, Debian e afins) com um comando:
#   curl -fsSL https://github.com/igs-wbr/sinqfy/releases/latest/download/instalar.sh | bash
# Baixa a versão mais recente em ~/sinqfy, instala o Docker se faltar, gera os segredos e sobe o painel.
# Rodar de novo atualiza o código e mantém deploy/.env (configuração e segredos) e o banco.
set -euo pipefail

REPO=igs-wbr/sinqfy
DIR="${SINQFY_DIR:-$HOME/sinqfy}"
ask() { local v; read -r -p "$1" v </dev/tty; printf '%s' "$v"; }
hex() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
setenv() { grep -v "^$1=" .env > .env.tmp || true; mv .env.tmp .env; printf '%s=%s\n' "$1" "$2" >> .env; }

if ! command -v docker >/dev/null; then
  echo "Instalando o Docker..."
  curl -fsSL https://get.docker.com | sudo sh
fi
DOCKER=docker
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

echo "Baixando a versão mais recente do Sinqfy em $DIR..."
mkdir -p "$DIR"
curl -fsSL "https://github.com/$REPO/releases/latest/download/sinqfy.tar.gz" | tar -xz -C "$DIR" --strip-components=1
cd "$DIR/deploy"

first=
if [ ! -f .env ]; then
  first=1
  cp .env.example .env
  chmod 600 .env
  email=
  until [[ "$email" == ?*@?*.?* ]]; do email=$(ask "E-mail do administrador do painel: "); done
  echo
  echo "Como o painel vai chegar à internet?"
  echo "  1) HTTPS automático nesta VPS (Caddy): precisa de um domínio apontando (registro A) para o IP dela e das portas 80 e 443 abertas"
  echo "  2) Túnel da Cloudflare: precisa do token do túnel, nenhuma porta aberta"
  echo "  3) Tenho meu próprio proxy (Nginx, Traefik): o painel fica em 127.0.0.1:8080"
  case "$(ask 'Escolha 1, 2 ou 3 [1]: ')" in
    2) profile=cloudflare; setenv TUNNEL_TOKEN "$(ask 'Token do túnel: ')" ;;
    3) profile= ;;
    *) profile=caddy ;;
  esac
  domain=
  until [ -n "$domain" ]; do domain=$(ask "Endereço do painel (ex.: app.seudominio.com.br): "); done
  domain=${domain#https://}; domain=${domain#http://}; domain=${domain%%/*}
  pass=$(head -c 18 /dev/urandom | base64 | tr '+/' '-_')

  setenv COMPOSE_PROFILES "$profile"
  setenv DOMAIN "$domain"
  setenv PUBLIC_URL "https://$domain"
  setenv ADMIN_EMAIL "$email"
  setenv ADMIN_PASSWORD "$pass"
  setenv POSTGRES_PASSWORD "$(hex)"
  setenv CRON_SECRET "$(hex)"
  setenv DATA_KEY "$(hex)"
fi

echo "Subindo o Sinqfy (a primeira vez leva alguns minutos)..."
$DOCKER compose up -d --build

for _ in $(seq 60); do curl -fs -o /dev/null http://127.0.0.1:8080/login && break; sleep 2; done
curl -fs -o /dev/null http://127.0.0.1:8080/login || { echo "O painel não respondeu. Veja o motivo com: cd $DIR/deploy && $DOCKER compose logs app"; exit 1; }

url=$(grep '^PUBLIC_URL=' .env | cut -d= -f2-)
echo
echo "Sinqfy no ar em $url"
if [ -n "$first" ]; then
  echo "Login: $email"
  echo "Senha: $pass"
  echo
  echo "Guarde a senha e uma cópia de $DIR/deploy/.env fora do servidor: a DATA_KEY dele abre os contatos do CRM."
  [ "$profile" = caddy ] && echo "Se o endereço não abrir, confira o registro A do domínio e as portas 80 e 443 no firewall do provedor."
fi
