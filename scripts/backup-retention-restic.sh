#!/usr/bin/env bash
# Rétention RÉELLE du dépôt Restic hors VPS (chantier bases-de-donnees, BD-7 ; décision du maître d'ouvrage du
# 3 novembre 2026). Tâche séparée de la sauvegarde quotidienne, comme prévu par docs/retention-swiss-backup.md.
#   - copies quotidiennes (étiquettes fadi,postgres) : 5 dernières, 14 quotidiennes, 8 hebdomadaires, 12 mensuelles
#     (politique simulée et relue avec scripts/audit-offsite-retention.sh) ;
#   - sauvegarde continue (étiquette pitr) : 14 jours ;
#   - puis prune (blocs devenus inutiles) et check.
# Garde-fou : rien n'est oublié si aucune copie quotidienne de moins de 48 heures n'existe (sauvegarde en panne : on
# garde tout ce qui reste). Installé en /usr/local/sbin/fadi-backup-retention (installer-bases.sh), lancé chaque semaine.
set -Eeuo pipefail
fail() { printf 'FADI_RETENTION_ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf 'FADI_RETENTION: %s\n' "$*"; }
[[ $(id -u) -eq 0 ]] || fail 'Exécuter sous root via systemd.'
[[ -n ${RESTIC_REPOSITORY:-} ]] || fail 'RESTIC_REPOSITORY manquant.'
[[ -n ${RESTIC_PASSWORD_FILE:-} && -f ${RESTIC_PASSWORD_FILE:-} ]] || fail 'RESTIC_PASSWORD_FILE manquant.'
swift_password_file=${FADI_SWIFT_PASSWORD_FILE:-/etc/fadi/swift-password}
[[ -f "$swift_password_file" && $(stat -c '%u' "$swift_password_file") == 0 ]] || fail 'Secret Swift absent ou non détenu par root.'
mode=$(stat -c '%a' "$swift_password_file"); (( (8#$mode & 077) == 0 )) || fail 'Secret Swift accessible au groupe ou aux autres.'
export OS_PASSWORD; OS_PASSWORD=$(<"$swift_password_file")
command -v restic > /dev/null || fail 'Restic non installé.'
command -v python3 > /dev/null || fail 'Python 3 absent.'

recent=$(restic snapshots --json --tag fadi,postgres | python3 -c '
import datetime, json, re, sys
now = datetime.datetime.now(datetime.timezone.utc)
def t(x):
    return datetime.datetime.fromisoformat(re.sub(r"(\.\d{6})\d+", r"\1", x["time"]).replace("Z", "+00:00"))
print(sum(1 for x in json.load(sys.stdin) if (now - t(x)).total_seconds() < 48 * 3600))')
(( recent > 0 )) || fail "Aucune copie quotidienne de moins de 48 h : rétention suspendue, rien n'est oublié."
log "copies quotidiennes récentes : $recent"

restic forget --retry-lock 30m \
  --tag fadi,postgres \
  --group-by host,paths \
  --keep-last 5 \
  --keep-daily 14 \
  --keep-weekly 8 \
  --keep-monthly 12
restic forget --retry-lock 30m --tag pitr --group-by tags --keep-within 14d
log 'nettoyage des blocs (prune)…'
restic prune --retry-lock 30m
restic check --retry-lock 30m
log 'rétention appliquée et dépôt vérifié.'
