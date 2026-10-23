#!/bin/sh
# Sauvegarde de la base Fadi : pg_dump au format « custom » (compressé, restaurable table par table), horodatée,
# puis rotation (BACKUP_KEEP_DAYS, 14 par défaut). Usage : backup.sh <hôte> <utilisateur> <base> <dossier>
# (PGPASSWORD dans l'environnement). Utilisé par le service `backup` de docker-compose.yml et à la main.
set -eu
HOST="$1"; USER="$2"; DB="$3"; DIR="$4"
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/fadi-$STAMP.dump"
pg_dump -h "$HOST" -U "$USER" -d "$DB" -Fc -f "$OUT.part"
mv "$OUT.part" "$OUT"
# D-7 : définition des rôles (sans mots de passe), pour recréer fadi_owner / fadi_app / … avant une restauration.
pg_dumpall -h "$HOST" -U "$USER" --roles-only --no-role-passwords 2>/dev/null | grep -E "^(CREATE|ALTER) ROLE fadi_|^GRANT fadi_" > "$DIR/fadi-roles-$STAMP.sql" || echo "rôles : non exportés par ce compte"
echo "sauvegarde écrite : $OUT ($(wc -c < "$OUT") octets)"
find "$DIR" \( -name 'fadi-*.dump' -o -name 'fadi-roles-*.sql' \) -mtime +"$KEEP" -delete
