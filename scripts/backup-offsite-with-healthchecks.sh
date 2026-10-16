#!/usr/bin/env bash
# Option de surveillance externe : signale le début, la réussite et l'échec
# d'une sauvegarde Fadi à Healthchecks.io. Aucun contenu ni secret PostgreSQL
# n'est transmis. INACTIF tant que l'unité systemd n'utilise pas ce wrapper.
set -Eeuo pipefail

backup_script="${FADI_BACKUP_SCRIPT:-/usr/local/sbin/fadi-backup-offsite}"
url_file="${FADI_HEALTHCHECK_URL_FILE:-/etc/fadi/healthchecks-url}"

[[ -x "$backup_script" ]] || { echo "FADI_BACKUP_MONITOR_ERROR: script de sauvegarde absent" >&2; exit 1; }
[[ -f "$url_file" ]] || { echo "FADI_BACKUP_MONITOR_ERROR: URL de surveillance non configurée" >&2; exit 1; }
[[ $(stat -c '%u' "$url_file") == 0 ]] || { echo "FADI_BACKUP_MONITOR_ERROR: secret de surveillance non détenu par root" >&2; exit 1; }
mode=$(stat -c '%a' "$url_file")
(( (8#$mode & 077) == 0 )) || { echo "FADI_BACKUP_MONITOR_ERROR: permissions du secret trop larges" >&2; exit 1; }
url=$(<"$url_file")
[[ "$url" =~ ^https://hc-ping\.com/[[:xdigit:]-]{36}$ ]] || { echo "FADI_BACKUP_MONITOR_ERROR: URL Healthchecks non valide" >&2; exit 1; }

notify() {
  local kind="$1"
  if ! curl --fail --silent --show-error --location --max-time 12 --retry 2 \
    --output /dev/null "${url}${kind}" 2>/dev/null; then
    echo "FADI_BACKUP_MONITOR_WARNING: signal ${kind:-success} non reçu par le contrôleur externe" >&2
  fi
}

notify /start
result=0
"$backup_script" || result=$?
if (( result == 0 )); then
  notify ""
  echo "FADI_BACKUP_MONITOR: sauvegarde terminée, signal de succès émis"
else
  notify /fail
  echo "FADI_BACKUP_MONITOR_ERROR: échec de sauvegarde code $result" >&2
fi
exit "$result"
