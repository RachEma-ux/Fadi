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
TABLES="users projects project_steps atelier_niveaux atelier_objets atelier_relations atelier_definitions atelier_calques atelier_groupes atelier_references atelier_problemes atelier_site atelier_commands atelier_outbox atelier_versions atelier_variants atelier_publications atelier_locks volumes parcels programme_cases programme_repartitions project_members project_comments produced_documents step_files drawing_exports studio_studies studio_variants studio_revisions studio_comments studio_observations studio_observation_events studio_study_steps studio_publications studio_publication_events studio_tool_preferences studio_requirement_sets studio_requirement_checks studio_quantity_adjustments user_recovery_codes project_support_grants invitations account_tokens audit_log mail_outbox"
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
# Studio (R.1-02) : révisions immuables (document, empreinte de requête), journaux et publications identiques.
for q in "SELECT coalesce(md5(string_agg(id || ':' || variant_id || ':' || coalesce(parent_revision_id, '-') || ':' || payload_hash || ':' || md5(document::text) || ':' || created_at, ',' ORDER BY id)), 'vide') FROM studio_revisions" "SELECT coalesce(md5(string_agg(id || ':' || head_revision_id || ':' || name, ',' ORDER BY id)), 'vide') FROM studio_variants" "SELECT coalesce(md5(string_agg(id || ':' || md5(body) || ':' || coalesce(deleted_at::text, '-'), ',' ORDER BY id)), 'vide') FROM studio_comments" "SELECT coalesce(md5(string_agg(id || ':' || seq || ':' || action || ':' || at, ',' ORDER BY id)), 'vide') FROM studio_observation_events" "SELECT coalesce(md5(string_agg(id || ':' || status || ':' || document_hash || ':' || coalesce(package_hash, '-') || ':' || coalesce(work_status, '-') || ':' || coalesce(diffusion_status, '-') || ':' || coalesce(manifest_hash, '-') || ':' || coalesce(md5(manifest::text), '-') || ':' || coalesce(manifest_built_at::text, '-') || ':' || coalesce(approved_manifest_hash, '-') || ':' || coalesce(replaced_by_publication_id, '-') || ':' || coalesce(replaced_by, '-') || ':' || coalesce(replaced_at::text, '-'), ',' ORDER BY id)), 'vide') FROM studio_publications" "SELECT coalesce(md5(string_agg(id || ':' || action || ':' || created_at || ':' || coalesce(manifest_hash, '-') || ':' || coalesce(work_status, '-') || ':' || coalesce(diffusion_status, '-') || ':' || coalesce(related_publication_id, '-'), ',' ORDER BY id)), 'vide') FROM studio_publication_events" "SELECT coalesce(md5(string_agg(id || ':' || study_id || ':' || version || ':' || md5(requirements::text) || ':' || coalesce(motif, '-') || ':' || coalesce(payload_hash, '-') || ':' || created_at, ',' ORDER BY id)), 'vide') FROM studio_requirement_sets" "SELECT coalesce(md5(string_agg(id || ':' || revision_id || ':' || coalesce(set_version::text, '-') || ':' || execution || ':' || coalesce(conclusion, '-') || ':' || md5(result::text) || ':' || document_hash || ':' || created_at, ',' ORDER BY id)), 'vide') FROM studio_requirement_checks" "SELECT coalesce(md5(string_agg(id || ':' || variant_id || ':' || revision_id || ':' || seq || ':' || target_kind || ':' || target_id || ':' || quantity || ':' || coalesce(value::text, '-') || ':' || unit || ':' || coalesce(derived_value::text, '-') || ':' || md5(target_state::text) || ':' || md5(motif) || ':' || coalesce(payload_hash, '-') || ':' || created_at, ',' ORDER BY id)), 'vide') FROM studio_quantity_adjustments"; do
  a="$(psql -h "$HOST" -U "$USER" -d "$SRC" -tAc "$q")"
  b="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "$q")"
  if [ "$a" != "$b" ]; then echo "❌ empreinte Studio différente : $q"; exit 1; fi
done
t="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "SELECT count(*) FROM pg_trigger WHERE tgname IN ('studio_revisions_no_update', 'studio_observation_events_no_update', 'studio_publication_events_no_update', 'studio_publication_events_no_delete', 'studio_publications_no_delete', 'studio_requirement_sets_no_update', 'studio_requirement_checks_no_update', 'studio_quantity_adjustments_no_update') AND tgenabled <> 'D'")"
if [ "$t" != "8" ]; then echo "❌ déclencheurs d'immuabilité Studio absents après restauration ($t / 8)"; exit 1; fi
echo "✓ Studio : révisions, variantes, commentaires, observations, publications identiques ; déclencheurs d'immuabilité présents"
# Gestion des comptes (#253) : journal d'audit identique et toujours append-only après restauration.
a="$(psql -h "$HOST" -U "$USER" -d "$SRC" -tAc "SELECT coalesce(md5(string_agg(id || ':' || action || ':' || coalesce(actor_id, '-') || ':' || md5(metadata::text) || ':' || created_at, ',' ORDER BY id)), 'vide') FROM audit_log")"
b="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "SELECT coalesce(md5(string_agg(id || ':' || action || ':' || coalesce(actor_id, '-') || ':' || md5(metadata::text) || ':' || created_at, ',' ORDER BY id)), 'vide') FROM audit_log")"
if [ "$a" != "$b" ]; then echo "❌ journal d'audit différent après restauration"; exit 1; fi
t="$(psql -h "$HOST" -U "$USER" -d "$DST" -tAc "SELECT count(*) FROM pg_trigger WHERE tgname IN ('audit_log_no_update', 'audit_log_no_delete') AND tgenabled <> 'D'")"
if [ "$t" != "2" ]; then echo "❌ déclencheurs append-only du journal d'audit absents après restauration ($t / 2)"; exit 1; fi
echo "✓ comptes : journal d'audit identique, déclencheurs append-only présents"
# Comparaison ligne à ligne de chaque projet Studio (outil R.1-03) quand Node est disponible.
if command -v node > /dev/null 2>&1 && [ -f "$(dirname "$0")/validation/studio-compare-restore.mjs" ]; then
  PORT_PG="${PGPORT:-5432}"
  node "$(dirname "$0")/validation/studio-compare-restore.mjs" --all \
    --a "postgresql://$USER:${PGPASSWORD:-}@$HOST:$PORT_PG/$SRC" --b "postgresql://$USER:${PGPASSWORD:-}@$HOST:$PORT_PG/$DST" \
    --out "$DIR/studio-compare-restore.md"
fi
echo "✅ restauration vérifiée ($FILE → $DST)"
