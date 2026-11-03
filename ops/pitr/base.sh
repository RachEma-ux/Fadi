#!/bin/bash
# BD-7 — sauvegarde de base quotidienne (dans le conteneur `db`, utilisateur postgres) : pg_basebackup compressé dans
# PITR_BASE/<horodatage> (défaut /pitr/base), par le rôle de sauvegarde fadi_backup (lecture et réplication, aucun droit
# d'écriture) sur le socket local ; le journal nécessaire est pris dans l'archive (-X none : PostgreSQL attend que le
# dernier segment soit archivé). Puis rétention LOCALE : PITR_GARDER (2) bases les plus récentes, et les segments
# antérieurs à la plus ancienne base gardée retirés (pg_archivecleanup). La rétention hors VPS (14 jours) est celle de
# restic (ops/pitr/fadi-pitr).
set -euo pipefail
base=${PITR_BASE:-/pitr/base} wal=${PITR_WAL:-/pitr/wal} garder=${PITR_GARDER:-2}
socket=${PITR_SOCKET:-/var/run/postgresql} role=${PITR_ROLE:-fadi_backup} port=${PITR_PORT:-5432}
[[ $garder =~ ^[1-9][0-9]*$ ]] || { echo "base : PITR_GARDER invalide" >&2; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
cible=$base/$stamp
pg_basebackup -h "$socket" -p "$port" -U "$role" -D "$cible.part" -Ft -z -X none -c fast --no-password
mv "$cible.part" "$cible"
# Premier segment nécessaire à cette base : lu dans son étiquette (backup_label du tar), relié au fichier .backup archivé.
debut=$(tar -xzOf "$cible/base.tar.gz" backup_label | sed -n 's/^START WAL LOCATION: .* (file \([0-9A-F]\{24\}\))$/\1/p')
[[ $debut =~ ^[0-9A-F]{24}$ ]] || { echo "base : étiquette de sauvegarde illisible" >&2; exit 1; }
printf '%s\n' "$debut" > "$cible/wal-debut"
echo "base écrite : $cible (début du journal $debut, $(du -sb "$cible" | cut -f1) octets)"
# Rétention locale : les plus anciennes au-delà de PITR_GARDER, puis le journal antérieur à la plus ancienne gardée.
mapfile -t bases < <(find "$base" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z' -printf '%f\n' | sort)
n=${#bases[@]}
for ((i = 0; i < n - garder; i++)); do rm -rf -- "${base:?}/${bases[i]}"; echo "base retirée : ${bases[i]}"; done
plus_ancienne=$(find "$base" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z' -printf '%f\n' | sort | head -1)
seg=$(cat "$base/$plus_ancienne/wal-debut")
[[ $seg =~ ^[0-9A-F]{24}$ ]] && pg_archivecleanup "$wal" "$seg"
find "$base" -mindepth 1 -maxdepth 1 -name '*.part' -mmin +1440 -exec rm -rf -- {} +
