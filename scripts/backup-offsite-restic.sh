#!/usr/bin/env bash
# Sauvegarde chiffrée, versionnée et hors VPS via Restic (Swift/S3/rclone selon l'offre).
# Préparation inerte : le dépôt externe et l'activation systemd sont configurés séparément.
set -Eeuo pipefail

fail() { printf 'FADI_OFFSITE_BACKUP_ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf 'FADI_OFFSITE_BACKUP: %s\n' "$*"; }

[[ $(id -u) -eq 0 ]] || fail 'Exécuter sous root via systemd, pour accéder aux volumes Docker.'
[[ -n ${RESTIC_REPOSITORY:-} ]] || fail 'RESTIC_REPOSITORY manquant.'
[[ -n ${RESTIC_PASSWORD_FILE:-} && -f ${RESTIC_PASSWORD_FILE:-} ]] || fail 'RESTIC_PASSWORD_FILE manquant.'
[[ $(stat -c '%u' "$RESTIC_PASSWORD_FILE") == 0 ]] || fail 'Le secret Restic doit appartenir à root.'
pass_mode=$(stat -c '%a' "$RESTIC_PASSWORD_FILE")
(( (8#$pass_mode & 077) == 0 )) || fail 'Le secret Restic ne doit être accessible ni au groupe ni aux autres.'

command -v restic >/dev/null || fail 'Restic non installé.'
command -v docker >/dev/null || fail 'Docker non installé.'
command -v findmnt >/dev/null || fail 'findmnt absent.'

app_dir=${FADI_COMPOSE_DIR:-/mnt/data/fadi/app}
data_mount=${FADI_DATA_MOUNT:-/mnt/data}
[[ -d "$app_dir" && -f "$app_dir/docker-compose.yml" && -f "$app_dir/.env.deploy" ]] || fail 'Configuration Fadi absente.'
[[ $(findmnt -n -T "$app_dir" -o TARGET) == "$data_mount" ]] || fail 'Projet hors du disque de données prévu.'

compose=(docker compose --project-directory "$app_dir" --env-file "$app_dir/.env.deploy" -f "$app_dir/docker-compose.yml")
container_id=$("${compose[@]}" ps -q backup)
[[ -n "$container_id" ]] || fail 'Conteneur de sauvegarde Fadi absent.'
[[ $(docker inspect --format '{{.State.Running}}' "$container_id") == true ]] || fail 'Le conteneur de sauvegarde est arrêté.'

# Le service écrit temporairement un fichier .part, renommé après pg_dump réussi.
log 'Création du dump PostgreSQL...'
"${compose[@]}" exec -T backup fadi-backup db fadi fadi /backups
backup_dir=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}' "$container_id")
[[ -n "$backup_dir" && -d "$backup_dir" ]] || fail 'Volume de sauvegarde introuvable.'
[[ $(findmnt -n -T "$backup_dir" -o TARGET) == "$data_mount" ]] || fail 'Sauvegardes hors du disque de données prévu.'
if ! find "$backup_dir" -maxdepth 1 -type f -name 'fadi-*.dump' -size +0c -mmin -120 -print -quit | grep -q .; then
  fail 'Aucun dump PostgreSQL complet et récent.'
fi

# La configuration contient des secrets : le dépôt Restic reste chiffré.
log 'Copie chiffrée vers le dépôt Restic externe...'
restic backup --tag fadi --tag postgres --exclude '*.part' "$backup_dir" "$app_dir/.env.deploy"
log 'Vérification des métadonnées du dépôt...'
restic check
log 'Sauvegarde externe terminée. Une restauration de contrôle demeure obligatoire.'
