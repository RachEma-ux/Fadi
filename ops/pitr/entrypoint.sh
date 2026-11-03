#!/bin/bash
# BD-7 — démarrage du conteneur `db` de production (docker-compose.yml) : prépare l'archive du journal de transactions
# (volume fadi-pitr, monté en /pitr), réservée à l'utilisateur postgres, puis passe la main au démarrage habituel de
# l'image (docker-entrypoint.sh), avec les mêmes arguments.
set -euo pipefail
install -d -o postgres -g postgres -m 0700 /pitr /pitr/wal /pitr/base
exec docker-entrypoint.sh "$@"
