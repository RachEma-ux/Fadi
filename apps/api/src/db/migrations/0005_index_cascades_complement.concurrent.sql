-- BD-3.1, BD-8.6 (constats S4, B10) : complément après relevé sur base migrée. Clés étrangères en cascade dont la colonne
-- enfant n'est en tête d'aucun index, sur des tables volumineuses (prix, territoires) ou parcourues à chaque suppression.
-- Les clés composites (study_id, variant_id …) déjà servies par un index commençant par variant_id ne sont pas reprises.
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_prix_observations_lot_idx ON geodata_prix_observations (lot_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_prix_lots_edition_idx ON geodata_prix_lots (edition_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_prix_lots_source_idx ON geodata_prix_lots (source_cle);
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_prix_valeurs_officielles_edition_idx ON geodata_prix_valeurs_officielles (edition_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_prix_valeurs_officielles_zone_idx ON geodata_prix_valeurs_officielles (zone_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_territoires_version_idx ON geodata_territoires (version_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_migrations_job_idx ON studio_migrations (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_agent_proposals_agent_key_idx ON studio_agent_proposals (agent_key_id) WHERE agent_key_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS rt_sessions_publication_idx ON rt_sessions (publication_id) WHERE publication_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS invitations_review_assignment_idx ON auth.invitations (review_assignment_id) WHERE review_assignment_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS invitations_organization_idx ON auth.invitations (organization_id) WHERE organization_id IS NOT NULL;
