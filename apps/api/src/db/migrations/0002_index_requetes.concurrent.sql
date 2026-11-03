-- BD-3.2, BD-3.4, BD-3.5 (constats S5, S7, Q3) : index alignés sur les requêtes réelles.
-- Cloche des notifications (GET /notifications, sondée chaque minute) : messages et commandes de l'auteur, commandes
-- récentes d'un projet, verrous et exports de l'auteur.
CREATE INDEX CONCURRENTLY IF NOT EXISTS com_messages_author_conv_idx ON com_messages (author_id, conversation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS atelier_commands_author_project_idx ON atelier_commands (author_id, project_id, result_revision);
CREATE INDEX CONCURRENTLY IF NOT EXISTS atelier_commands_project_created_idx ON atelier_commands (project_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS atelier_locks_author_idx ON atelier_locks (author_id, expires_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS drawing_exports_author_idx ON drawing_exports (created_by, created_at DESC);
-- File d'événements de l'Atelier : seulement les lignes à traiter, dans l'ordre de lecture (la table ne fait que grossir).
CREATE INDEX CONCURRENTLY IF NOT EXISTS atelier_outbox_unprocessed_idx ON atelier_outbox (project_id, created_at) WHERE processed_at IS NULL;
-- Liste des révisions d'une variante, la plus récente d'abord (évite le tri de toutes les révisions et de leur document).
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_revisions_variant_created_idx ON studio_revisions (variant_id, created_at DESC, id DESC);
-- Purge des sessions expirées (BD-6.1).
CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
-- Recherche d'un compte par adresse sans tenir compte de la casse, et unicité garantie en base : deux comptes ne peuvent
-- plus différer par la seule casse. Échoue (index laissé invalide, repris au passage suivant) si de tels doublons
-- existent : les repérer avec SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_email_lower_unique ON users (lower(email));
-- Accès en consultation des versions GeoData (droits->>'consultation', six requêtes) : index d'expression, sans
-- réécriture de la table (au lieu d'une colonne générée).
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_versions_consultation_idx ON geodata_versions ((droits->>'consultation'));
-- Future clé primaire de studio_study_steps (BD-3.7, migration 0004), construite sans bloquer les écritures.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS studio_study_steps_pk_idx ON studio_study_steps (study_id, step_number);
ANALYZE com_messages;
ANALYZE atelier_commands;
ANALYZE users;
