#!/bin/sh
# BD-9.2 (chantier base-donnees, D-BD-9, constat M10) : contrôles avant / après la montée PostgreSQL 16 → 18
# (docs/montee-postgresql-18.md). Lecture seule sur la base.
#
#   sh ops/pg18/verifier.sh releve   <url> <fichier>   relevé trié « clé<TAB>valeur » (versions, extensions, index
#                                                      invalides, collations, comptes de lignes exacts par table…)
#   sh ops/pg18/verifier.sh comparer <avant> <apres>   comptes de lignes, tables, index, contraintes et migrations
#                                                      identiques, aucun index invalide, extensions à jour ; code 1 sinon
#   sh ops/pg18/verifier.sh reindex  <url>             instructions REINDEX ... CONCURRENTLY des index qui dépendent
#                                                      d'une collation, des trigrammes (pg_trgm) ou du plein texte
#
# <url> : rôle qui lit toutes les tables (fadi_backup, ou le super-utilisateur pendant la fenêtre). VERIF_COMPTES=estimation
# remplace count(*) par reltuples (base très grosse ; la comparaison des comptes n'est alors qu'indicative).
set -eu
usage() { sed -n '2,15p' "$0" >&2; exit 2; }
[ $# -ge 2 ] || usage

releve() {
  url=$1; sortie=$2
  psql "$url" -XtAq -v ON_ERROR_STOP=1 -F "$(printf '\t')" -v comptes="${VERIF_COMPTES:-exact}" <<'SQL' | LC_ALL=C sort > "$sortie"
SELECT 'serveur.version', current_setting('server_version_num');
SELECT 'serveur.checksums', current_setting('data_checksums');
SELECT 'serveur.encodage', pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database();
SELECT 'serveur.collation', datcollate || ' / ' || datctype || ' / fournisseur ' || datlocprovider::text FROM pg_database WHERE datname = current_database();
-- Version de collation enregistrée et version fournie par la bibliothèque du système (glibc) : différentes après un
-- changement d'image (Debian bookworm → trixie) = index de texte à reconstruire puis ALTER DATABASE ... REFRESH.
SELECT 'serveur.collation_version_enregistree', coalesce(datcollversion, '-') FROM pg_database WHERE datname = current_database();
SELECT 'serveur.collation_version_systeme', coalesce(pg_database_collation_actual_version(oid), '-') FROM pg_database WHERE datname = current_database();
SELECT 'extension.' || e.extname, e.extversion || ' (disponible ' || coalesce(a.default_version, '?') || ')'
  FROM pg_extension e LEFT JOIN pg_available_extensions a ON a.name = e.extname;
SELECT 'postgis.complet', postgis_full_version() WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis');
SELECT 'schema.tables', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%';
SELECT 'schema.index', count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%';
SELECT 'schema.index_invalides', count(*) FROM pg_index WHERE NOT indisvalid OR NOT indisready;
SELECT 'schema.contraintes', count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema');
SELECT 'schema.contraintes_non_validees', count(*) FROM pg_constraint WHERE NOT convalidated;
SELECT 'schema.fonctions', count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
SELECT 'schema.declencheurs', count(*) FROM pg_trigger WHERE NOT tgisinternal;
-- Mots de passe encore en MD5 (déprécié en 18) : lisible par un super-utilisateur seulement.
SELECT has_table_privilege('pg_catalog.pg_authid', 'SELECT') AS lit_authid \gset
\if :lit_authid
SELECT 'roles.md5', count(*) FROM pg_authid WHERE rolpassword LIKE 'md5%';
\endif
SELECT 'migrations.nombre', count(*) FROM schema_migrations WHERE to_regclass('schema_migrations') IS NOT NULL;
-- Comptes de lignes de chaque table des schémas de l'application.
SELECT CASE WHEN :'comptes' = 'estimation'
         THEN format('SELECT %L, greatest(reltuples, 0)::bigint FROM pg_class WHERE oid = %s', 'lignes.' || n.nspname || '.' || c.relname, c.oid)
         ELSE format('SELECT %L, count(*) FROM %I.%I', 'lignes.' || n.nspname || '.' || c.relname, n.nspname, c.relname) END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND NOT c.relispartition
  ORDER BY 1 \gexec
SQL
  echo "relevé écrit : $sortie ($(wc -l < "$sortie") lignes)"
}

comparer() {
  avant=$1; apres=$2; echec=0
  [ -r "$avant" ] && [ -r "$apres" ] || { echo "relevé illisible" >&2; exit 2; }
  # Doivent être identiques : structure et données. Les versions (serveur, extensions, collation) changent normalement.
  for motif in '^lignes\.' '^schema\.(tables|index|contraintes|contraintes_non_validees|fonctions|declencheurs)	' '^migrations\.' '^serveur\.encodage' '^serveur\.collation	'; do
    if ! diff -u "$(f "$avant" "$motif")" "$(f "$apres" "$motif")" > "$T/diff"; then
      echo "✗ différence ($motif) :"; sed -n '3,40p' "$T/diff"; echec=1
    fi
  done
  inv=$(awk -F '\t' '$1 == "schema.index_invalides" { print $2 }' "$apres")
  if [ "${inv:-x}" = 0 ]; then echo "✓ aucun index invalide"; else echo "✗ index invalides après : ${inv:-?}"; echec=1; fi
  # Extension en retard sur la version fournie par les paquets : ALTER EXTENSION ... UPDATE à faire.
  retard=$(awk -F '\t' '$1 ~ /^extension\./ { split($2, v, " "); d = $2; sub(/.*disponible /, "", d); sub(/\)$/, "", d); if (v[1] != d) print $1 " " $2 }' "$apres")
  if [ -z "$retard" ]; then echo "✓ extensions à la version des paquets"; else echo "✗ extensions à mettre à jour :"; echo "$retard"; echec=1; fi
  cv=$(awk -F '\t' '$1 == "serveur.collation_version_enregistree" { e = $2 } $1 == "serveur.collation_version_systeme" { s = $2 } END { if (e != s) print e " → " s }' "$apres")
  if [ -z "$cv" ]; then echo "✓ version de collation inchangée"; else echo "✗ version de collation différente ($cv) : REINDEX (mode reindex) puis ALTER DATABASE ... REFRESH COLLATION VERSION"; echec=1; fi
  echo "versions : $(awk -F '\t' '$1 == "serveur.version" { print $2 }' "$avant") → $(awk -F '\t' '$1 == "serveur.version" { print $2 }' "$apres")"
  if [ $echec = 0 ]; then echo "COMPARAISON_OK"; else echo "COMPARAISON_ECHEC"; fi
  return $echec
}
f() { o="$T/$(basename "$1").$(printf '%s' "$2" | cksum | cut -d' ' -f1)"; grep -E "$2" "$1" > "$o" || true; echo "$o"; }

reindex() {
  psql "$1" -XtAq -v ON_ERROR_STOP=1 <<'SQL'
-- Index dont l'ordre dépend d'une collation non « C », index GIN/GiST de pg_trgm et index sur tsvector.
SELECT DISTINCT format('REINDEX INDEX CONCURRENTLY %I.%I;', n.nspname, ci.relname)
  FROM pg_index i
  JOIN pg_class ci ON ci.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = ci.relnamespace
  LEFT JOIN LATERAL unnest(i.indcollation::oid[]) AS k(coll) ON true
  LEFT JOIN pg_collation co ON co.oid = k.coll
  LEFT JOIN LATERAL unnest(i.indclass::oid[]) AS o(opc) ON true
  LEFT JOIN pg_opclass oc ON oc.oid = o.opc
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND ((k.coll <> 0 AND co.collname NOT IN ('C', 'POSIX', 'ucs_basic')
          AND NOT (co.collname = 'default' AND (SELECT datcollate IN ('C', 'POSIX') FROM pg_database WHERE datname = current_database())))
      OR oc.opcname LIKE '%trgm%' OR oc.opcname LIKE 'tsvector%')
  ORDER BY 1;
SQL
}

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mode=$1; shift
case "$mode" in
  releve) [ $# = 2 ] || usage; releve "$1" "$2" ;;
  comparer) [ $# = 2 ] || usage; comparer "$1" "$2" ;;
  reindex) [ $# = 1 ] || usage; reindex "$1" ;;
  *) usage ;;
esac
