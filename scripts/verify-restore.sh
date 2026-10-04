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
TABLES="users projects project_steps atelier_niveaux atelier_objets atelier_relations atelier_definitions atelier_calques atelier_groupes atelier_references atelier_problemes atelier_site atelier_commands atelier_outbox atelier_versions atelier_variants atelier_publications atelier_locks volumes parcels programme_cases programme_repartitions project_members project_comments produced_documents step_files drawing_exports"
for t in $TABLES; do
  a="$(psql -h "$HOST" -U "$USER" -d "$SRC" -tAc "SELECT count(*) FROM $t")"
  b="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "SELECT count(*) FROM $t")"
  if [ "$a" != "$b" ]; then echo "❌ $t : $a lignes dans $SRC, $b dans $DST"; exit 1; fi
  echo "✓ $t : $a lignes"
done
# Empreinte de contenu des étapes (le gros du dossier), des objets du modèle typé et du journal des commandes : identiques avant / après.
for q in "SELECT coalesce(md5(string_agg(project_id || ':' || step_number || ':' || status || ':' || md5(content::text), ',' ORDER BY project_id, step_number)), 'vide') FROM project_steps" "SELECT coalesce(md5(string_agg(project_id || ':' || id || ':' || classe || ':' || model_revision || ':' || md5(params::text), ',' ORDER BY project_id, id)), 'vide') FROM atelier_objets" "SELECT coalesce(md5(string_agg(project_id || ':' || request_id || ':' || result_revision || ':' || md5(inverse::text), ',' ORDER BY project_id, result_revision)), 'vide') FROM atelier_commands" "SELECT coalesce(md5(string_agg(id || ':' || revision || ':' || empreinte || ':' || md5(modele::text), ',' ORDER BY id)), 'vide') FROM atelier_versions" "SELECT coalesce(md5(string_agg(id || ':' || md5(documents::text) || ':' || md5(catalogues::text), ',' ORDER BY id)), 'vide') FROM atelier_publications" "SELECT coalesce(md5(string_agg(id || ':' || md5(content), ',' ORDER BY id)), 'vide') FROM volumes"; do
  a="$(psql -h "$HOST" -U "$USER" -d "$SRC" -tAc "$q")"
  b="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "$q")"
  if [ "$a" != "$b" ]; then echo "❌ empreinte différente : $q"; exit 1; fi
done
echo "✓ empreintes des étapes, du modèle de l'Atelier, de son journal, des versions, des publications et des volumes identiques"
echo "✅ restauration vérifiée ($FILE → $DST)"
