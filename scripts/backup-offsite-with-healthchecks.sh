#!/usr/bin/env bash
# Wrapper facultatif : signale l'état d'une sauvegarde Fadi vers Healthchecks.io.
# N'envoie aucun contenu de base de données. Non actif avant surcharge systemd.
# L'URL de ping est un secret : elle reste uniquement dans un fichier root 0600.
set -Eeuo pipefail

fail() { echo "FADI_BACKUP_MONITOR_ERROR: $*" >&2; exit 1; }

[[ $(id -u) -eq 0 ]] || fail "Ce script doit être exécuté par root via systemd."
backup_script="${FADI_BACKUP_SCRIPT:-/usr/local/sbin/fadi-backup-offsite}"
url_file="${FADI_HEALTHCHECK_URL_FILE:-/etc/fadi/healthchecks-url}"

[[ -x "$backup_script" ]] || fail "Script de sauvegarde absent ou non exécutable."
[[ -f "$url_file" ]] || fail "Le fichier URL Healthchecks est absent."
[[ $(stat -c '%u' "$url_file") == 0 ]] || fail "Le fichier URL Healthchecks doit appartenir à root."
mode=$(stat -c '%a' "$url_file")
(( (8#$mode & 077) == 0 )) || fail "Le fichier URL Healthchecks doit être inaccessible au groupe et aux autres."
command -v python3 >/dev/null || fail "Python 3 absent."

# Python lit l'URL privée depuis le fichier, jamais depuis les arguments du
# processus curl, l'environnement ou un message de journalisation.
notify() {
  local event="$1"
  FADI_HC_EVENT="$event" FADI_HC_URL_FILE="$url_file" python3 - <<'PY'
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    url = Path(os.environ["FADI_HC_URL_FILE"]).read_text(encoding="utf-8").strip()
except (OSError, UnicodeError):
    print("HEALTHCHECK_PING_ERROR: lecture impossible", file=sys.stderr)
    sys.exit(1)

# Le format attendu correspond au Ping URL UUID affiché par Healthchecks.io.
pattern = r"https://hc-ping[.]com/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
if re.fullmatch(pattern, url) is None:
    print("HEALTHCHECK_PING_ERROR: URL de ping invalide", file=sys.stderr)
    sys.exit(1)

event = os.environ.get("FADI_HC_EVENT", "")
if event not in ("", "/start", "/fail"):
    print("HEALTHCHECK_PING_ERROR: signal inconnu", file=sys.stderr)
    sys.exit(1)

for attempt in range(3):
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url + event, method="GET"), timeout=12
        ) as response:
            if 200 <= response.status < 300:
                sys.exit(0)
    except (urllib.error.URLError, TimeoutError):
        pass
    if attempt < 2:
        time.sleep(2)

print("HEALTHCHECK_PING_ERROR: aucune confirmation HTTPS reçue", file=sys.stderr)
sys.exit(1)
PY
}

if ! notify /start; then
  echo "FADI_BACKUP_MONITOR_WARNING: signal de début non confirmé" >&2
fi

# Le résultat du script de sauvegarde détermine TOUJOURS l'état du service.
result=0
"$backup_script" || result=$?

if (( result == 0 )); then
  if notify ""; then
    echo "FADI_BACKUP_MONITOR: sauvegarde réussie, succès signalé"
  else
    # Le succès de la sauvegarde ne doit pas être remplacé par un échec de réseau
    # du système d'alerte ; Healthchecks détecte l'absence de ping ultérieurement.
    echo "FADI_BACKUP_MONITOR_WARNING: sauvegarde réussie, signal de succès non confirmé" >&2
  fi
else
  notify /fail || true
  echo "FADI_BACKUP_MONITOR_ERROR: sauvegarde échouée (code $result)" >&2
fi

exit "$result"
