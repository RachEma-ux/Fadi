-- BD-3.1 (constat S4) : index côté enfant des clés étrangères en cascade vers projets, études, variantes, révisions et
-- messages. Sans eux, supprimer un projet (ou anonymiser son propriétaire) parcourt chaque table enfant entièrement,
-- récursivement, en gardant les verrous. Les 128 clés vers `users` ne sont pas indexées : les comptes sont anonymisés,
-- jamais supprimés. Hors transaction : aucune écriture bloquée pendant la construction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS invitations_project_idx ON auth.invitations (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS review_assignments_project_idx ON review_assignments (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS organization_mandates_project_idx ON organization_mandates (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS organization_template_applications_project_idx ON organization_template_applications (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS com_pieces_project_idx ON com_pieces (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS com_links_project_idx ON com_links (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS rt_annotations_project_idx ON rt_annotations (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_study_contexts_project_idx ON studio_study_contexts (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_jobs_project_idx ON studio_jobs (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_jobs_variant_idx ON studio_jobs (variant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_revision_events_project_idx ON studio_revision_events (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_revision_events_study_idx ON studio_revision_events (study_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_migrations_project_idx ON studio_migrations (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_requirement_checks_study_variant_idx ON studio_requirement_checks (study_id, variant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_external_models_study_variant_idx ON studio_external_models (study_id, variant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_illustrations_study_variant_idx ON studio_illustrations (study_id, variant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_agent_proposals_study_idx ON studio_agent_proposals (study_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_bascules_study_idx ON studio_bascules (study_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_sheets_variant_revision_idx ON studio_sheets (variant_id, revision_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_section_views_variant_revision_idx ON studio_section_views (variant_id, revision_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_dossiers_quantities_idx ON studio_dossiers (quantities_variant_id, quantities_revision_id) WHERE quantities_variant_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS rt_sessions_variant_revision_idx ON rt_sessions (variant_id, revision_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_document_migrations_revision_idx ON studio_document_migrations (revision_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS com_message_versions_message_idx ON com_message_versions (message_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS project_comments_parent_idx ON project_comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS com_messages_reply_to_idx ON com_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS collab_demandes_source_message_idx ON collab_demandes (source_message_id) WHERE source_message_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_indicateurs_couche_idx ON geodata_indicateurs (couche_id);
