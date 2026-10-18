-- Extension additive Studio V1. À appliquer seulement au profil jetable autorisé.
-- Aucun ALTER d'une table Fadi existante ; le migrateur historique reste inchangé.
BEGIN;
CREATE TABLE studio_studies (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  initial_variant_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_studies_project_idx ON studio_studies(project_id);
CREATE TABLE studio_variants (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  name text NOT NULL,
  head_revision_id text NOT NULL,
  CONSTRAINT studio_variants_study_id_unique UNIQUE(study_id, id)
);
CREATE TABLE studio_revisions (
  id text PRIMARY KEY,
  variant_id text NOT NULL REFERENCES studio_variants(id) ON DELETE CASCADE,
  parent_revision_id text,
  document jsonb NOT NULL CHECK ((
    document->>'schemaVersion' = 'studio-document/1' AND
    document->>'units' = 'm' AND document->>'frame' = 'local-2d' AND
    jsonb_typeof(document->'objects') = 'array'
  ) IS TRUE),
  envelope jsonb,
  request_id text NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  response jsonb NOT NULL,
  CONSTRAINT studio_revisions_request_unique UNIQUE(variant_id, request_id),
  CONSTRAINT studio_revisions_variant_id_unique UNIQUE(variant_id, id),
  CONSTRAINT studio_revisions_parent_same_variant FOREIGN KEY(variant_id, parent_revision_id)
    REFERENCES studio_revisions(variant_id, id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE studio_studies ADD CONSTRAINT studio_studies_initial_variant
  FOREIGN KEY(id, initial_variant_id) REFERENCES studio_variants(study_id, id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE studio_variants ADD CONSTRAINT studio_variants_head_same_variant
  FOREIGN KEY(id, head_revision_id) REFERENCES studio_revisions(variant_id, id)
  DEFERRABLE INITIALLY DEFERRED;
-- Les suppressions d'un projet conservent le comportement Fadi existant (cascade).
-- Toute UPDATE d'un instantané Studio, même accidentelle, est refusée.
CREATE FUNCTION studio_v1_immutable_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_revision_immutable';
END;
$$;
CREATE TRIGGER studio_revisions_no_update BEFORE UPDATE ON studio_revisions
  FOR EACH ROW EXECUTE FUNCTION studio_v1_immutable_revision();
COMMIT;
