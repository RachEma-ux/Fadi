#!/bin/bash
# BD-7 — archive_command de PostgreSQL : copie un segment du journal de transactions dans l'archive locale
# (PITR_WAL, défaut /pitr/wal), écrite sur disque (sync) puis renommée, jamais écrasée. Code 0 seulement quand le
# segment est archivé (PostgreSQL ne recycle le segment qu'à ce moment) ; un segment déjà archivé à l'identique est
# accepté (reprise après une coupure), un segment différent du même nom est refusé.
#   archive_command = '/opt/fadi-pitr/archiver-wal.sh %p %f'
set -euo pipefail
source=$1 nom=$2
dest=${PITR_WAL:-/pitr/wal}
[[ $nom =~ ^[0-9A-F]{24}(\.partial|\.[0-9A-F]{8}\.backup)?$|^[0-9A-F]{8}\.history$ ]] || { echo "archiver-wal : nom refusé : $nom" >&2; exit 1; }
cible=$dest/$nom
if [ -e "$cible" ]; then
  cmp -s "$source" "$cible" && exit 0
  echo "archiver-wal : $nom déjà archivé avec un contenu différent" >&2; exit 1
fi
cp "$source" "$cible.part"
sync "$cible.part"
mv "$cible.part" "$cible"
sync "$dest"
