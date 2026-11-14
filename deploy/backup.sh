#!/bin/bash
# Backup diário do Postgres para o R2, cifrado. Agende no crontab da VM: 0 4 * * * /home/ubuntu/rastro/deploy/backup.sh
# Requer o rclone com um remoto cifrado "r2crypt" (tipo crypt por cima do remoto "r2"; veja docs/deploy-oracle.md).
# O dump tem tokens da Meta e do GA4 e hashes de senha: nunca envie sem cifra.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
f="$(mktemp -d)/rastro-$(date +%F).sql.gz"
docker compose exec -T postgres pg_dump -U rastro rastro | gzip > "$f"
# dump vazio ou quebrado não substitui os bons
if [ "$(stat -c %s "$f")" -lt 2048 ]; then echo "backup pequeno demais, abortado" >&2; exit 1; fi
rclone copy "$f" r2crypt:
rm -rf "$(dirname "$f")"
rclone delete --min-age 30d r2crypt:
