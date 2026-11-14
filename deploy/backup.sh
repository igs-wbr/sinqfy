#!/bin/sh
# Backup diário do Postgres para o R2. Agende no crontab da VM: 0 4 * * * /home/ubuntu/rastro/deploy/backup.sh
# Requer o rclone configurado com um remoto chamado "r2" (veja docs/deploy-oracle.md).
set -eu
cd "$(dirname "$0")"
f="rastro-$(date +%F).sql.gz"
docker compose exec -T postgres pg_dump -U rastro rastro | gzip > "/tmp/$f"
rclone copy "/tmp/$f" r2:rastro-backups/
rm "/tmp/$f"
rclone delete --min-age 30d r2:rastro-backups/
