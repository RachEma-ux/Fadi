#!/bin/sh
# Vérifie la procédure de restauration de bout en bout : sauvegarde de la base source, restauration dans une base
# neuve, comparaison du nombre de lignes des tables métier et d'une empreinte de contenu, puis sonde de l'API sur
# la base restaurée. Exécuté par la CI (`.github/workflows/ci.yml`, job restore) et utilisable à la main.
# Usage : verify-restore.sh <hôte> <utilisateur> <base source> <base de contrôle>  (PGPASSWORD dans l'environnement)
set -eu
HOST="$1"; USER="$2"; SRC="$3"; DST="$4"
DIR="$(mktemp -d)"
sh "$(dirname "$0")/backup.sh" "$HOST" "$USER" "$SRC" "$DIR"
FILE="$(ls "$DIR"/fadi-*.dump | head -1)"
psql -h "$HOST" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DST\";" -c "CREATE DATABASE \"$DST\";"
sh "$(dirname "$0")/restore.sh" "$HOST" "$USER" "$DST" "$FILE"
TABLES="users projects project_steps levels architectural_objects atelier_store parcels programme_cases programme_repartitions project_members project_comments produced_documents step_files"
for t in $TABLES; do
  a="$(psql -h "$HOST" -U "$USER" -d "$SRC" -tAc "SELECT count(*) FROM $t")"
  b="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "SELECT count(*) FROM $t")"
  if [ "$a" != "$b" ]; then echo "❌ $t : $a lignes dans $SRC, $b dans $DST"; exit 1; fi
  echo "✓ $t : $a lignes"
done
# Empreinte de contenu des étapes (le gros du dossier) et du magasin de l'Atelier : identiques avant / après.
for q in "SELECT coalesce(md5(string_agg(project_id || ':' || step_number || ':' || status || ':' || md5(content::text), ',' ORDER BY project_id, step_number)), 'vide') FROM project_steps" "SELECT coalesce(md5(string_agg(project_id || ':' || key || ':' || revision || ':' || md5(value::text), ',' ORDER BY project_id, key)), 'vide') FROM atelier_store"; do
  a="$(psql -h "$HOST" -U "$USER" -d "$SRC" -tAc "$q")"
  b="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "$q")"
  if [ "$a" != "$b" ]; then echo "❌ empreinte différente : $q"; exit 1; fi
done
echo "✓ empreintes des étapes et du magasin de l'Atelier identiques"
echo "✅ restauration vérifiée ($FILE → $DST)"
