#!/bin/bash
# Backup diário do Postgres, cifrado, para qualquer armazenamento do rclone (R2, Backblaze B2, S3...). Agende no crontab da VM: 0 4 * * * bash /home/ubuntu/sinqfy/deploy/backup.sh
# Requer o rclone com um remoto cifrado (tipo crypt), indicado em BACKUP_REMOTE no .env (padrão r2crypt:; veja docs/deploy-oracle.md).
# O dump tem tokens da Meta e do GA4 e hashes de senha: nunca envie sem cifra.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
remote="$(grep -E '^BACKUP_REMOTE=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r')"; remote="${remote:-r2crypt:}"
f="$(mktemp -d)/sinqfy-$(date +%F).sql.gz"
docker compose exec -T postgres pg_dump -U rastro rastro | gzip > "$f"
# dump vazio ou quebrado não substitui os bons
if [ "$(stat -c %s "$f")" -lt 2048 ]; then echo "backup pequeno demais, abortado" >&2; exit 1; fi
rclone copy "$f" "$remote"
rm -rf "$(dirname "$f")"
rclone delete --min-age 30d "$remote"
