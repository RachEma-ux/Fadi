#!/bin/sh
# BD-5.5 (chantier base-donnees, constat M13) : sonde de santé de la base, en lecture seule, pour la supervision
# (timer de l'hôte + Healthchecks, ou tout outil qui lit un code de retour). Une ligne JSON ; code 1 si un seuil est
# dépassé, 2 si la base ne répond pas. Seuils techniques, ajustables :
#   SONDE_CONNEXIONS_PCT (80)  part de max_connections utilisée
#   SONDE_TRANSACTION_S  (300) âge de la plus vieille transaction ouverte
#   SONDE_VERROUS        (10)  requêtes en attente d'un verrou
#   SONDE_ARCHIVE_S      (900) âge du dernier WAL archivé, si l'archivage est actif (PITR, BD-5.1)
#   SONDE_URL            URL de connexion (rôle en lecture : fadi_backup ou fadi_app)
set -eu
: "${SONDE_URL:?SONDE_URL manquant}"
J=$(psql "$SONDE_URL" -XtAq -v ON_ERROR_STOP=1 \
  -v cpct="${SONDE_CONNEXIONS_PCT:-80}" -v ts="${SONDE_TRANSACTION_S:-300}" -v vr="${SONDE_VERROUS:-10}" -v ar="${SONDE_ARCHIVE_S:-900}" <<'SQL'
WITH m AS (
  SELECT
    (SELECT count(*) FROM pg_stat_activity)::int AS connexions,
    current_setting('max_connections')::int AS max_connexions,
    coalesce((SELECT extract(epoch FROM max(now() - xact_start)) FROM pg_stat_activity WHERE xact_start IS NOT NULL AND pid <> pg_backend_pid()), 0)::int AS transaction_s,
    (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock')::int AS en_attente_verrou,
    pg_database_size(current_database()) AS taille_octets,
    current_setting('archive_mode') <> 'off' AS archivage,
    (SELECT failed_count FROM pg_stat_archiver)::int AS archivage_echecs,
    (SELECT extract(epoch FROM now() - last_archived_time) FROM pg_stat_archiver)::int AS archive_s,
    (SELECT count(*) FROM pg_index WHERE NOT indisvalid)::int AS index_invalides
)
SELECT json_build_object(
  'connexions', connexions, 'max_connexions', max_connexions, 'transaction_s', transaction_s,
  'en_attente_verrou', en_attente_verrou, 'taille_octets', taille_octets, 'archivage', archivage,
  'archivage_echecs', archivage_echecs, 'archive_s', archive_s, 'index_invalides', index_invalides,
  'alertes', array_remove(ARRAY[
    CASE WHEN connexions * 100 >= max_connexions * :cpct THEN 'connexions' END,
    CASE WHEN transaction_s >= :ts THEN 'transaction-longue' END,
    CASE WHEN en_attente_verrou >= :vr THEN 'verrous' END,
    CASE WHEN archivage AND (archive_s IS NULL OR archive_s >= :ar) THEN 'archivage-en-retard' END,
    CASE WHEN index_invalides > 0 THEN 'index-invalides' END
  ], NULL))
FROM m;
SQL
) || { echo '{"alertes":["base-injoignable"]}'; exit 2; }
echo "$J"
echo "$J" | grep -q '"alertes" : \[\]' && exit 0
exit 1
