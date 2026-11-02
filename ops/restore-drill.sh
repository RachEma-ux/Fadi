#!/bin/sh
# BD-5.2 (chantier base-donnees, constat M12) : exercice de restauration, à lancer chaque mois (timer de l'hôte).
# Restaure une sauvegarde dans une base JETABLE (jamais la base de production), rejoue la migration (droits D-7),
# compte les lignes des tables principales et mesure la durée totale (RTO de la restauration logique).
#
#   DRILL_ADMIN_URL=postgresql://<superutilisateur>@<hote-jetable>:5432/postgres \
#   sh ops/restore-drill.sh <fichier.dump>            # ou, sans fichier : dernier snapshot restic (RESTIC_REPOSITORY)
#
# DRILL_ADMIN_URL désigne un serveur PostgreSQL/PostGIS d'exercice (conteneur jetable, sans réseau public). Le script
# refuse un nom de base qui ne commence pas par fadi_exercice_. Sortie : une ligne JSON (succès, durée, comptes) ;
# DRILL_HEALTHCHECKS_FICHIER (0600) contient l'URL de ping Healthchecks à appeler en cas de succès (/fail sinon).
set -eu
: "${DRILL_ADMIN_URL:?DRILL_ADMIN_URL manquant (serveur PostgreSQL d'exercice)}"
DEBUT=$(date +%s)
BASE="fadi_exercice_$(date -u +%Y%m%d%H%M%S)"
TRAVAIL=$(mktemp -d)
ping_hc() { [ -n "${DRILL_HEALTHCHECKS_FICHIER:-}" ] && [ -r "$DRILL_HEALTHCHECKS_FICHIER" ] && curl -fsS -m 10 --retry 3 -o /dev/null --url "$(cat "$DRILL_HEALTHCHECKS_FICHIER")$1" || true; }
fin() { st=$?; [ $st -ne 0 ] && { echo "{\"exercice\":\"echec\",\"base\":\"$BASE\",\"code\":$st}"; ping_hc /fail; }; rm -rf "$TRAVAIL"; psql "$DRILL_ADMIN_URL" -qc "DROP DATABASE IF EXISTS $BASE WITH (FORCE)" >/dev/null 2>&1 || true; exit $st; }
trap fin EXIT
case "$BASE" in fadi_exercice_*) ;; *) echo "nom de base refusé"; exit 2 ;; esac

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  : "${RESTIC_REPOSITORY:?ni fichier ni RESTIC_REPOSITORY}"
  restic restore latest --target "$TRAVAIL" --include '/backups' >/dev/null
  DUMP=$(find "$TRAVAIL" -name 'fadi-*.dump' | sort | tail -1)
fi
[ -r "$DUMP" ] || { echo "sauvegarde introuvable : $DUMP"; exit 3; }

psql "$DRILL_ADMIN_URL" -qc "CREATE DATABASE $BASE" >/dev/null
URL_BASE=$(printf '%s' "$DRILL_ADMIN_URL" | sed -E "s#/[^/?]*(\?|$)#/$BASE\1#")
pg_restore -d "$URL_BASE" --no-owner --no-privileges --exit-on-error "$DUMP"
# Migration du code courant : propriété fadi_owner et droits D-7, base de départ et migrations numérotées.
if [ -f apps/api/dist/db/migrate.js ] || [ -f apps/api/src/db/migrate.ts ]; then
  DATABASE_MIGRATION_URL="$URL_BASE" npx --yes tsx apps/api/src/db/migrate.ts >/dev/null
fi
COMPTES=$(psql "$URL_BASE" -tA -c "SELECT json_build_object('users', (SELECT count(*) FROM users), 'projects', (SELECT count(*) FROM projects), 'studio_revisions', (SELECT count(*) FROM studio_revisions), 'migrations', (SELECT count(*) FROM schema_migrations))")
DUREE=$(( $(date +%s) - DEBUT ))
echo "{\"exercice\":\"reussi\",\"sauvegarde\":\"$(basename "$DUMP")\",\"duree_s\":$DUREE,\"comptes\":$COMPTES}"
ping_hc ""
