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
TABLES="users projects project_steps parcels programme_cases programme_repartitions project_members project_comments produced_documents step_files atelier_models atelier_definitions atelier_objects atelier_layers atelier_site atelier_properties atelier_relations atelier_representations atelier_commands atelier_outbox volumes"
for t in $TABLES; do
  a="$(psql -h "$HOST" -U "$USER" -d "$SRC" -tAc "SELECT count(*) FROM $t")"
  b="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "SELECT count(*) FROM $t")"
  if [ "$a" != "$b" ]; then echo "❌ $t : $a lignes dans $SRC, $b dans $DST"; exit 1; fi
  echo "✓ $t : $a lignes"
done
# Empreinte de contenu des étapes (le gros du dossier), du modèle typé de l'Atelier (objets des trois tables, propriétés, relations, tête et empreinte atelier-empreinte/1), du journal et des
# volumes : identiques avant / après.
Q_ETAPES="SELECT coalesce(md5(string_agg(project_id || ':' || step_number || ':' || status || ':' || md5(content::text), ',' ORDER BY project_id, step_number)), 'vide') FROM project_steps"
Q_OBJETS="SELECT coalesce(md5(string_agg(t || ':' || project_id || ':' || id || ':' || coalesce(\"class\", '-') || ':' || md5(coalesce(params::text, '-')) || ':' || model_revision || ':' || coalesce(deleted_rank::text, '-'), ',' ORDER BY t, project_id, id)), 'vide') FROM (SELECT 'o' AS t, * FROM atelier_objects UNION ALL SELECT 'l', * FROM atelier_layers UNION ALL SELECT 's', * FROM atelier_site) x"
Q_PROPRIETES="SELECT coalesce(md5(string_agg(project_id || ':' || coalesce(object_id, '-') || ':' || \"position\" || ':' || name || ':' || md5(value::text), ',' ORDER BY project_id, coalesce(object_id, '-'), \"position\")), 'vide') FROM atelier_properties"
Q_RELATIONS="SELECT coalesce(md5(string_agg(project_id || ':' || type || ':' || source_id || ':' || target_id || ':' || coalesce(role, '-') || ':' || derived, ',' ORDER BY project_id, type, source_id, target_id, coalesce(role, '-'))), 'vide') FROM atelier_relations"
Q_TETES="SELECT coalesce(md5(string_agg(project_id || ':' || model_revision || ':' || fingerprint || ':' || catalogue_version, ',' ORDER BY project_id)), 'vide') FROM atelier_models"
Q_JOURNAL="SELECT coalesce(md5(string_agg(id || ':' || request_id || ':' || result_revision || ':' || result_fingerprint || ':' || md5(commands::text) || ':' || md5(inverse::text), ',' ORDER BY id)), 'vide') FROM atelier_commands"
Q_VOLUMES="SELECT coalesce(md5(string_agg(id || ':' || size || ':' || md5(content), ',' ORDER BY id)), 'vide') FROM volumes"
for q in "$Q_ETAPES" "$Q_OBJETS" "$Q_PROPRIETES" "$Q_RELATIONS" "$Q_TETES" "$Q_JOURNAL" "$Q_VOLUMES"; do
  a="$(psql -h "$HOST" -U "$USER" -d "$SRC" -tAc "$q")"
  b="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "$q")"
  if [ "$a" != "$b" ]; then echo "❌ empreinte différente : $q"; exit 1; fi
done
echo "✓ empreintes des étapes, du modèle typé, du journal et des volumes identiques"
echo "✅ restauration vérifiée ($FILE → $DST)"
