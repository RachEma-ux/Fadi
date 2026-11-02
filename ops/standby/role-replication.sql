-- BD-9.3 (chantier base-donnees, D-BD-10, docs/haute-disponibilite.md) : rôle de réplication, slot physique et droits de
-- supervision, sur le PRIMAIRE, avec un super-utilisateur. Idempotent. Le mot de passe vient de l'environnement de
-- l'administrateur (jamais dans Git, jamais dans l'historique du shell) :
--
--   psql "$URL_ADMIN" -X -v ON_ERROR_STOP=1 -v mdp="$FADI_REPLICATION_DB_PASSWORD" -f ops/standby/role-replication.sql
--
-- Variables facultatives : slot (fadi_standby), sonde (rôle de la sonde, fadi_backup).
\set ON_ERROR_STOP on
\if :{?mdp}
\else
  DO $$ BEGIN RAISE EXCEPTION 'variable psql « mdp » manquante (-v mdp="$FADI_REPLICATION_DB_PASSWORD")'; END $$;
\endif
\if :{?slot}
\else
  \set slot fadi_standby
\endif
\if :{?sonde}
\else
  \set sonde fadi_backup
\endif

-- SCRAM seulement : l'authentification MD5 est dépréciée depuis PostgreSQL 18.
SET password_encryption = 'scram-sha-256';

SELECT 'CREATE ROLE fadi_replication' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_replication') \gexec
-- Réplication seule : ni super-utilisateur, ni création de base ou de rôle.
SELECT format('ALTER ROLE fadi_replication WITH LOGIN REPLICATION NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L', :'mdp') \gexec

-- pg_rewind (remise d'un ancien primaire en standby) sans super-utilisateur : fonctions de lecture de fichiers du
-- serveur source (documentation de pg_rewind). Le rôle lit déjà toute l'instance par pg_basebackup : rien de plus exposé.
GRANT EXECUTE ON FUNCTION pg_catalog.pg_ls_dir(text, boolean, boolean) TO fadi_replication;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_stat_file(text, boolean) TO fadi_replication;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_binary_file(text) TO fadi_replication;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_binary_file(text, bigint, bigint, boolean) TO fadi_replication;

-- Slot physique : le primaire garde les WAL tant que le standby ne les a pas reçus (borné par max_slot_wal_keep_size).
SELECT format('SELECT pg_create_physical_replication_slot(%L)', :'slot')
  WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = :'slot') \gexec

-- Sonde (ops/surveillance/sonde-base.sh) : retards de pg_stat_replication / pg_stat_wal_receiver visibles.
SELECT format('GRANT pg_monitor TO %I', :'sonde') WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'sonde') \gexec

SELECT rolname, rolreplication, rolsuper FROM pg_roles WHERE rolname = 'fadi_replication';
SELECT slot_name, slot_type, active FROM pg_replication_slots WHERE slot_name = :'slot';
