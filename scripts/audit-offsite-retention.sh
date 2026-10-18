#!/usr/bin/env bash
# Audit de conservation Fadi / Restic Swift — lecture seule.
# Aucune commande forget sans --dry-run, ni prune.
# Prévu pour Restic 0.16.4.
set -Eeuo pipefail

fail() { printf 'FADI_RETENTION_AUDIT_ERROR: %s\n' "$*" >&2; exit 1; }
[[ $(id -u) -eq 0 ]] || fail 'Exécuter via sudo sur le VPS Fadi-Serv.'

cfg=/etc/fadi/restic.env
swift_file=/etc/fadi/swift-password
[[ -f "$cfg" && -f "$swift_file" ]] || fail 'Configuration Swift manquante.'

for secret in "$cfg" "$swift_file" /etc/fadi/restic-password; do
  [[ -f "$secret" ]] || fail "Fichier requis absent : $secret"
  [[ $(stat -c %u "$secret") == 0 ]] || fail "Propriétaire root requis : $secret"
  mode=$(stat -c %a "$secret")
  (( (8#$mode & 077) == 0 )) || fail "Permissions non sécurisées : $secret"
done

command -v restic >/dev/null || fail 'Restic non installé.'
command -v python3 >/dev/null || fail 'Python3 non installé.'
umask 077

set -a
# Fichier root uniquement, contrôlé ci-dessus.
source "$cfg"
set +a

[[ $(readlink -f "${RESTIC_PASSWORD_FILE:-/dev/null}") == /etc/fadi/restic-password ]] || fail 'Clé Restic inattendue.'
[[ ${RESTIC_REPOSITORY:-} == swift:* ]] || fail 'Le dépôt Restic doit utiliser Swift.'

export OS_PASSWORD
OS_PASSWORD=$(<"$swift_file")
[[ -n "$OS_PASSWORD" ]] || fail 'Mot de passe Swift vide.'
trap 'unset OS_PASSWORD' EXIT

export RESTIC_CACHE_DIR=/mnt/data/fadi/restic-cache
install -d -m 700 "$RESTIC_CACHE_DIR"

printf '\n=== FADI : SNAPSHOTS AVANT SIMULATION ===\n'
restic snapshots

printf '\n=== FADI : VOLUME LOGIQUE DES DONNEES UNIQUES ===\n'
restic stats --mode raw-data

printf '\n=== FADI : ANALYSE DE RETENTION, SANS SUPPRESSION ===\n'
echo 'Critères : --tag fadi,postgres ; --group-by host,paths'
echo 'Conserver : derniers 5 ; 14 quotidiens ; 8 hebdomadaires ; 12 mensuels'
echo 'AUCUN forget reel, AUCUN prune'

# Vérifier qu'au moins un snapshot attendu appartient à cette sélection.
json=$(restic snapshots --json --tag fadi,postgres)
count=$(python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' <<< "$json")
(( count > 0 )) || fail 'Aucun snapshot tagué fadi,postgres. Aucun audit de rétention exécuté.'
printf 'Snapshots tagués fadi,postgres : %s\n' "$count"

restic forget \
  --dry-run \
  --tag fadi,postgres \
  --group-by host,paths \
  --keep-last 5 \
  --keep-daily 14 \
  --keep-weekly 8 \
  --keep-monthly 12

printf '\nFADI_RETENTION_DRY_RUN_OK : aucune suppression effectuée.\n'
