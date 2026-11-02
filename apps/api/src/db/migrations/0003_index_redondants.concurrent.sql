-- BD-3.3, BD-3.4 (constats S6, S7) : index en double ou remplacés. Chaque suppression ne vient qu'après la création de
-- son remplaçant (0002) ; l'écriture et le WAL de chaque index retiré sont économisés.
-- Doublon exact de la clé primaire (project_id, version).
DROP INDEX CONCURRENTLY IF EXISTS project_plan_baselines_project_idx;
-- Préfixe de la clé primaire (project_id, step_number).
DROP INDEX CONCURRENTLY IF EXISTS project_steps_project_id_idx;
-- Préfixe de studio_observations_variant_comment_unique (variant_id, comment_id).
DROP INDEX CONCURRENTLY IF EXISTS studio_observations_variant_idx;
-- Remplacé par atelier_outbox_unprocessed_idx (partiel, ordonné).
DROP INDEX CONCURRENTLY IF EXISTS atelier_outbox_pending_idx;
