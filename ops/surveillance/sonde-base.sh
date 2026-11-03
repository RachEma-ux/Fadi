#!/bin/sh
# BD-5.5 (chantier base-donnees, constat M13) : sonde de santé de la base, en lecture seule, pour la supervision
# (timer de l'hôte + Healthchecks, ou tout outil qui lit un code de retour). Une ligne JSON ; code 1 si un seuil est
# dépassé, 2 si la base ne répond pas. Seuils techniques, ajustables :
#   SONDE_CONNEXIONS_PCT (80)  part de max_connections utilisée
#   SONDE_TRANSACTION_S  (300) âge de la plus vieille transaction ouverte
#   SONDE_VERROUS        (10)  requêtes en attente d'un verrou
#   SONDE_ARCHIVE_S      (900) âge du dernier WAL archivé, si l'archivage est actif (PITR, BD-5.1) ; primaire seulement
#   SONDE_URL            URL de connexion (rôle en lecture : fadi_backup ou fadi_app)
# BD-9.3 (standby en streaming, D-BD-10, docs/haute-disponibilite.md) — la même sonde tourne sur le primaire et sur le
# standby ; elle reconnaît le rôle du serveur (pg_is_in_recovery) :
#   SONDE_RETARD_S       (600) retard de réplication toléré. Sonde toutes les 5 min + alerte à 10 min : l'alerte part
#                              avant que le retard n'atteigne le RPO de 15 min (D-BD-1).
#   SONDE_STANDBYS       (0)   nombre de standbys attendus en streaming sur le primaire (1 une fois BD-9.3 en place).
# Alertes ajoutées : replication-en-retard, standby-absent (primaire), reception-wal-arretee (standby), slot-inactif
# (un slot sans standby retient les WAL et remplit le disque du primaire). Les colonnes de retard de pg_stat_replication
# et pg_stat_wal_receiver ne sont visibles que d'un membre de pg_monitor (GRANT dans ops/standby/role-replication.sql).
set -eu
: "${SONDE_URL:?SONDE_URL manquant}"
J=$(psql "$SONDE_URL" -XtAq -v ON_ERROR_STOP=1 \
  -v cpct="${SONDE_CONNEXIONS_PCT:-80}" -v ts="${SONDE_TRANSACTION_S:-300}" -v vr="${SONDE_VERROUS:-10}" -v ar="${SONDE_ARCHIVE_S:-900}" \
  -v rs="${SONDE_RETARD_S:-600}" -v ns="${SONDE_STANDBYS:-0}" <<'SQL'
WITH m AS (
  SELECT
    (SELECT count(*) FROM pg_stat_activity)::int AS connexions,
    current_setting('max_connections')::int AS max_connexions,
    coalesce((SELECT extract(epoch FROM max(now() - xact_start)) FROM pg_stat_activity WHERE xact_start IS NOT NULL AND pid <> pg_backend_pid()), 0)::int AS transaction_s,
    (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock')::int AS en_attente_verrou,
    pg_database_size(current_database()) AS taille_octets,
    current_setting('archive_mode') <> 'off' AND NOT pg_is_in_recovery() AS archivage,
    (SELECT failed_count FROM pg_stat_archiver)::int AS archivage_echecs,
    (SELECT extract(epoch FROM now() - last_archived_time) FROM pg_stat_archiver)::int AS archive_s,
    (SELECT count(*) FROM pg_index WHERE NOT indisvalid)::int AS index_invalides,
    pg_is_in_recovery() AS standby,
    CASE WHEN pg_is_in_recovery() THEN NULL
      ELSE (SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming') END::int AS standbys,
    CASE WHEN pg_is_in_recovery() THEN (SELECT status FROM pg_stat_wal_receiver) END AS reception,
    -- Retard en secondes : sur le primaire, le plus grand replay_lag des standbys (NULL quand tout est rejoué et que le
    -- primaire est inactif → 0) ; sur le standby, âge de la dernière transaction rejouée s'il reste des WAL reçus à rejouer.
    CASE WHEN pg_is_in_recovery() THEN
        CASE WHEN pg_last_wal_receive_lsn() IS NULL OR pg_last_wal_receive_lsn() <= pg_last_wal_replay_lsn() THEN 0
          ELSE coalesce(extract(epoch FROM now() - pg_last_xact_replay_timestamp()), 0) END
      ELSE coalesce((SELECT extract(epoch FROM max(replay_lag)) FROM pg_stat_replication), 0) END::int AS retard_s,
    CASE WHEN pg_is_in_recovery() THEN NULL
      ELSE (SELECT max(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) FROM pg_stat_replication) END::bigint AS retard_octets,
    (SELECT count(*) FROM pg_replication_slots WHERE slot_type = 'physical' AND NOT active)::int AS slots_inactifs
)
SELECT json_build_object(
  'connexions', connexions, 'max_connexions', max_connexions, 'transaction_s', transaction_s,
  'en_attente_verrou', en_attente_verrou, 'taille_octets', taille_octets, 'archivage', archivage,
  'archivage_echecs', archivage_echecs, 'archive_s', archive_s, 'index_invalides', index_invalides,
  'role', CASE WHEN standby THEN 'standby' ELSE 'primaire' END, 'standbys', standbys, 'reception', reception,
  'retard_s', retard_s, 'retard_octets', retard_octets, 'slots_inactifs', slots_inactifs,
  'alertes', array_remove(ARRAY[
    CASE WHEN connexions * 100 >= max_connexions * :cpct THEN 'connexions' END,
    CASE WHEN transaction_s >= :ts THEN 'transaction-longue' END,
    CASE WHEN en_attente_verrou >= :vr THEN 'verrous' END,
    CASE WHEN archivage AND (archive_s IS NULL OR archive_s >= :ar) THEN 'archivage-en-retard' END,
    CASE WHEN index_invalides > 0 THEN 'index-invalides' END,
    CASE WHEN retard_s >= :rs THEN 'replication-en-retard' END,
    CASE WHEN NOT standby AND standbys < :ns THEN 'standby-absent' END,
    CASE WHEN standby AND reception IS DISTINCT FROM 'streaming' THEN 'reception-wal-arretee' END,
    CASE WHEN slots_inactifs > 0 THEN 'slot-inactif' END
  ], NULL))
FROM m;
SQL
) || { echo '{"alertes":["base-injoignable"]}'; exit 2; }
echo "$J"
echo "$J" | grep -q '"alertes" : \[\]' && exit 0
exit 1
