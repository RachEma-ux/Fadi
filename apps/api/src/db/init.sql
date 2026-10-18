-- Schéma initial. Tenu à la main et volontairement en miroir exact de
-- schema.ts (voir ce fichier pour la justification de chaque choix,
-- notamment pourquoi seule `projects.parcel_footprint` est une géométrie
-- PostGIS). `npm run db:migrate` l'exécute avec IF NOT EXISTS, donc il est
-- sûr de le relancer (idempotent) ; ce n'est pas un outil de migrations
-- versionnées — à l'échelle de l'équipe, Drizzle Kit (ou équivalent) devra
-- prendre le relais dès que le schéma évolue après le premier déploiement.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_seen_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS atelier_ensembles jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS atelier_ensembles_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences jsonb;

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  model_revision integer NOT NULL DEFAULT 0,
  parcel_footprint geography(Polygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON projects (owner_id);
-- Colonnes ajoutées après la création initiale de la table (import d'exemples
-- Parcours) : IF NOT EXISTS les rend sûres à rejouer sur une base existante.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_example_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_attachment jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parcels_initialized boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parcel_transmission jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_observations jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS programme_state jsonb;
-- Dossier Harmony du projet (Parcours.Harmony, schéma 1 : observations, références directionnelles, locaux, ambiances, revues, revue de conception).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS harmony jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS example_mode text;
-- Verrou d'édition optionnel (« un seul éditeur actif ») : { userId, email, since, expiresAt } ; null = libre.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS editing_lock jsonb;
-- Contexte extérieur déclaré pour le bilan du bâtiment (siteContextV62 du prototype).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_context jsonb;
UPDATE projects SET example_mode = 'reference' WHERE source_example_id IS NOT NULL AND example_mode IS NULL;

-- Contenu réel des 21 étapes du Parcours, une ligne par étape et par projet.
CREATE TABLE IF NOT EXISTS project_steps (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  status text NOT NULL DEFAULT 'a-faire',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (project_id, step_number)
);
CREATE INDEX IF NOT EXISTS project_steps_project_id_idx ON project_steps (project_id);

-- R2 · Planning métier par projet : champs indépendants du Parcours et version CAS.
CREATE TABLE IF NOT EXISTS project_plans (
  project_id text PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline_version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES users (id) ON DELETE SET NULL
);

-- Les références de planning sont des instantanés immuables (une version = une ligne).
CREATE TABLE IF NOT EXISTS project_plan_baselines (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  version integer NOT NULL,
  steps jsonb NOT NULL,
  source_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (project_id, version)
);
CREATE INDEX IF NOT EXISTS project_plan_baselines_project_idx
  ON project_plan_baselines (project_id, version);

-- Répartition programmatique (module Programmation), une ligne par projet,
-- créée à la première modification ; voir schema.ts.
CREATE TABLE IF NOT EXISTS programme_repartitions (
  project_id text PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  type text NOT NULL,
  base_area double precision NOT NULL,
  mode text NOT NULL,
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- (Lot 4) L'ancien magasin du moteur V14 `atelier_store` est converti puis supprimé par db/bascule.ts.

-- Fichiers de l'outil Parcelle (étape 01), contrat /api/parcels scopé par projet.
CREATE TABLE IF NOT EXISTS parcels (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  number integer NOT NULL,
  name text NOT NULL,
  crs text NOT NULL,
  parcel_number text NOT NULL DEFAULT '',
  data jsonb NOT NULL,
  revision integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);

-- Cas de programme appliqués (bibliothèque des bâtiments) : une ligne par révision, la plus haute est courante.
CREATE TABLE IF NOT EXISTS programme_cases (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  revision integer NOT NULL,
  case_id text NOT NULL,
  scenario_id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, revision)
);

-- Sources de l'étape : pièces jointes par étape et par projet (FILE_DB du prototype, côté serveur).
CREATE TABLE IF NOT EXISTS step_files (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  size integer NOT NULL,
  content bytea NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS step_files_project_step_idx ON step_files (project_id, step_number);

-- (Lot 4) `levels` et `architectural_objects` (projection de l'ancien moteur) sont supprimées par db/bascule.ts.

CREATE TABLE IF NOT EXISTS drawing_exports (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind text NOT NULL,
  file_name text NOT NULL,
  mime text NOT NULL,
  content bytea NOT NULL,
  size integer NOT NULL,
  level_id text,
  level_name text,
  view jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_revision integer NOT NULL,
  native_hash text NOT NULL,
  created_by text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drawing_exports_project_idx ON drawing_exports (project_id);

CREATE TABLE IF NOT EXISTS produced_documents (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  file_name text NOT NULL,
  model_revision integer NOT NULL,
  input_hash text NOT NULL,
  step_number integer,
  produced_at timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, kind)
);

CREATE TABLE IF NOT EXISTS project_comments (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  step_number integer,
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  author_email text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_comments_project_idx ON project_comments (project_id, created_at);
-- Réponses en fil : le commentaire auquel on répond (même projet) ; null pour un commentaire de premier niveau.
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS parent_id text REFERENCES project_comments (id) ON DELETE CASCADE;
-- Commentaire attaché à une entrée du journal de l'Atelier (D-055) : sa révision résultante, null sinon.
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS atelier_revision integer;

CREATE TABLE IF NOT EXISTS project_members (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL,
  invited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id);

-- ---------------------------------------------------------------------------
-- Modèle typé de l'Atelier Fadi (cahier des charges §5.5).
-- Section « atelier » : propriété du module Atelier ; miroir de schema.ts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atelier_niveaux (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  nom text NOT NULL,
  elevation double precision NOT NULL,
  hauteur double precision,
  ordre integer NOT NULL,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS atelier_objets (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  classe text NOT NULL,
  niveau_id text,
  definition_id text,
  calque_id text,
  groupe_id text,
  phase text,
  params jsonb NOT NULL,
  proprietes jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_revision integer NOT NULL,
  PRIMARY KEY (project_id, id)
);
CREATE INDEX IF NOT EXISTS atelier_objets_niveau_idx ON atelier_objets (project_id, niveau_id);
CREATE INDEX IF NOT EXISTS atelier_objets_classe_idx ON atelier_objets (project_id, classe);
-- Verrou d'objet (D-052).
ALTER TABLE atelier_objets ADD COLUMN IF NOT EXISTS verrouille boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS atelier_relations (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  kind text NOT NULL,
  source_id text NOT NULL,
  target_id text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (project_id, id)
);
CREATE INDEX IF NOT EXISTS atelier_relations_source_idx ON atelier_relations (project_id, source_id);
CREATE INDEX IF NOT EXISTS atelier_relations_target_idx ON atelier_relations (project_id, target_id);

CREATE TABLE IF NOT EXISTS atelier_definitions (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  classe text NOT NULL,
  nom text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS atelier_calques (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  nom text NOT NULL,
  couleur text,
  remplissage text,
  visible boolean NOT NULL DEFAULT true,
  verrouille boolean NOT NULL DEFAULT false,
  ordre integer NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, id)
);
-- Calques imbriqués (D-080) : calque parent (null : à la racine).
ALTER TABLE atelier_calques ADD COLUMN IF NOT EXISTS parent_id text;
-- Calques gelés (D-103) : hors de tout affichage, des vues et des exports ; objets non modifiables.
ALTER TABLE atelier_calques ADD COLUMN IF NOT EXISTS gele boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS atelier_groupes (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  nom text NOT NULL,
  PRIMARY KEY (project_id, id)
);
-- Verrou de groupe (D-052).
ALTER TABLE atelier_groupes ADD COLUMN IF NOT EXISTS verrouille boolean NOT NULL DEFAULT false;
-- Propriétés des groupes et des calques (D-088).
ALTER TABLE atelier_groupes ADD COLUMN IF NOT EXISTS proprietes jsonb;
ALTER TABLE atelier_calques ADD COLUMN IF NOT EXISTS proprietes jsonb;
-- Réseaux associatifs (D-115) : paramètres et copies d'un groupe-réseau.
ALTER TABLE atelier_groupes ADD COLUMN IF NOT EXISTS reseau jsonb;

CREATE TABLE IF NOT EXISTS atelier_references (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  proprietaire_id text NOT NULL,
  objet_id text,
  caracteristique text,
  etat text NOT NULL,
  propositions jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS atelier_problemes (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  type text NOT NULL,
  objet_id text,
  message text NOT NULL,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS atelier_site (
  project_id text PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  parcelle jsonb,
  emprise jsonb,
  hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  structure jsonb,
  proprietes jsonb NOT NULL DEFAULT '{}'::jsonb,
  native_id text NOT NULL DEFAULT 'modele-type',
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- P2-2 : ontologies activées par le projet en plus du socle (mechanical…), null = socle seul. Après la création de
-- la table (base neuve) ; IF NOT EXISTS pour une base existante.
ALTER TABLE atelier_site ADD COLUMN IF NOT EXISTS ontologies jsonb;

CREATE TABLE IF NOT EXISTS atelier_commands (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  request_id text NOT NULL,
  kind text NOT NULL DEFAULT 'commande',
  contract text NOT NULL,
  label text NOT NULL,
  base_revision integer NOT NULL,
  result_revision integer NOT NULL,
  commands jsonb NOT NULL,
  inverse jsonb NOT NULL,
  effets jsonb NOT NULL,
  reponse jsonb NOT NULL,
  inverse_of text,
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS atelier_commands_request_unique ON atelier_commands (project_id, request_id);
CREATE INDEX IF NOT EXISTS atelier_commands_project_rev_idx ON atelier_commands (project_id, result_revision);

CREATE TABLE IF NOT EXISTS atelier_outbox (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS atelier_outbox_pending_idx ON atelier_outbox (project_id, processed_at);

-- Lot 7 : versions nommées (instantanés immuables), variantes (projets bifurqués), publications figées, verrous
-- logiques fins, volumes immuables (contenu adressé par SHA-256).
CREATE TABLE IF NOT EXISTS atelier_versions (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  nom text NOT NULL,
  description text NOT NULL DEFAULT '',
  revision integer NOT NULL,
  empreinte text NOT NULL,
  modele jsonb NOT NULL,
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS atelier_versions_nom_unique ON atelier_versions (project_id, lower(nom));

CREATE TABLE IF NOT EXISTS atelier_variants (
  project_id text PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  parent_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  nom text NOT NULL,
  fork_revision integer NOT NULL,
  base_revision integer NOT NULL,
  fork_empreinte text NOT NULL,
  statut text NOT NULL DEFAULT 'ouverte',
  fusion_revision integer,
  fusion_at timestamptz,
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atelier_variants_parent_idx ON atelier_variants (parent_id);
ALTER TABLE atelier_variants ADD COLUMN IF NOT EXISTS sync_revision integer;

CREATE TABLE IF NOT EXISTS volumes (
  id text PRIMARY KEY,
  mime text NOT NULL,
  size integer NOT NULL,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atelier_publications (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  version_id text NOT NULL REFERENCES atelier_versions (id) ON DELETE RESTRICT,
  nom text NOT NULL,
  revision integer NOT NULL,
  empreinte text NOT NULL,
  catalogues jsonb NOT NULL,
  documents jsonb NOT NULL,
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atelier_publications_project_idx ON atelier_publications (project_id, created_at);

CREATE TABLE IF NOT EXISTS atelier_locks (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  cle text NOT NULL,
  motif text NOT NULL DEFAULT '',
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, cle)
);
-- Verrou transmis (D-089) : courriel de qui l'a transmis, pour la notification du destinataire.
ALTER TABLE atelier_locks ADD COLUMN IF NOT EXISTS transmis_par text;
-- Prises et libérations de verrous (D-143) : notifiées aux autres membres du projet ; libellé figé à l'écriture.
CREATE TABLE IF NOT EXISTS atelier_lock_events (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  cle text NOT NULL,
  libelle text NOT NULL,
  kind text NOT NULL,
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atelier_lock_events_project_idx ON atelier_lock_events (project_id, at);

-- Lot 8 : bibliothèque de scripts versionnée (par projet) et propositions de l'assistant (boucle contrôlée).
CREATE TABLE IF NOT EXISTS atelier_scripts (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  script_id text NOT NULL,
  version integer NOT NULL,
  contenu jsonb NOT NULL,
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, script_id, version)
);

CREATE TABLE IF NOT EXISTS atelier_propositions (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  intention text NOT NULL,
  cle text NOT NULL,
  generateur text NOT NULL,
  regle text,
  explication text NOT NULL,
  commandes jsonb NOT NULL,
  hypotheses jsonb NOT NULL,
  iterations jsonb NOT NULL,
  effets jsonb,
  statut text NOT NULL,
  depuis_cache boolean NOT NULL DEFAULT false,
  revision_base integer NOT NULL,
  revision_resultat integer,
  author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS atelier_propositions_project_idx ON atelier_propositions (project_id, created_at);
CREATE INDEX IF NOT EXISTS atelier_propositions_cle_idx ON atelier_propositions (project_id, cle, statut);

-- Studio (décisions du propriétaire D-0 et D-A du 18/10/2026, #166) : le modèle V1 fusionné par #181 est le seul
-- Studio et son schéma vit ici, dans le schéma idempotent. Additif : aucune table Fadi existante n'est modifiée.
-- Étude → variantes → révisions immuables ; la tête et la variante initiale sont des clés étrangères différées,
-- recréées à chaque application (DROP … IF EXISTS puis ADD dans la même instruction) pour rester idempotentes.
-- NOT VALID : appliquées à toute nouvelle écriture sans rebalayer à chaque démarrage les lignes déjà contrôlées.
CREATE TABLE IF NOT EXISTS studio_studies (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  initial_variant_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  creation_request_id text
);
CREATE INDEX IF NOT EXISTS studio_studies_project_idx ON studio_studies(project_id);
CREATE TABLE IF NOT EXISTS studio_variants (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  name text NOT NULL,
  head_revision_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  creation_request_id text,
  CONSTRAINT studio_variants_study_id_unique UNIQUE(study_id, id)
);
-- Bases créées avant l'ordre de création des variantes : colonne ajoutée sans réécrire les lignes existantes.
ALTER TABLE studio_variants ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS studio_revisions (
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
  source text NOT NULL CONSTRAINT studio_revisions_source_check
    CHECK (source IN ('authenticated-session', 'study-initialization', 'variant-initialization', 'variant-derivation')),
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  response jsonb NOT NULL,
  CONSTRAINT studio_revisions_request_unique UNIQUE(variant_id, request_id),
  CONSTRAINT studio_revisions_variant_id_unique UNIQUE(variant_id, id),
  CONSTRAINT studio_revisions_parent_same_variant FOREIGN KEY(variant_id, parent_revision_id)
    REFERENCES studio_revisions(variant_id, id) DEFERRABLE INITIALLY DEFERRED
);
-- Le nom explicite reprend celui que PostgreSQL donnait à l'ancien CHECK anonyme : recréé à chaque application.
-- 'variant-derivation' : révision initiale d'une variante dérivée (copie du document d'une révision de la même étude).
ALTER TABLE studio_revisions DROP CONSTRAINT IF EXISTS studio_revisions_source_check,
  ADD CONSTRAINT studio_revisions_source_check
  CHECK (source IN ('authenticated-session', 'study-initialization', 'variant-initialization', 'variant-derivation')) NOT VALID;
ALTER TABLE studio_studies DROP CONSTRAINT IF EXISTS studio_studies_initial_variant,
  ADD CONSTRAINT studio_studies_initial_variant FOREIGN KEY(id, initial_variant_id)
  REFERENCES studio_variants(study_id, id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE studio_variants DROP CONSTRAINT IF EXISTS studio_variants_head_same_variant,
  ADD CONSTRAINT studio_variants_head_same_variant FOREIGN KEY(id, head_revision_id)
  REFERENCES studio_revisions(variant_id, id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
-- Création idempotente d'étude et de variante (requestId facultatif du client) : colonnes nullables ajoutées sans
-- réécrire les lignes existantes (NULL = création sans identifiant), uniques seulement quand elles sont renseignées.
ALTER TABLE studio_studies ADD COLUMN IF NOT EXISTS creation_request_id text;
ALTER TABLE studio_variants ADD COLUMN IF NOT EXISTS creation_request_id text;
CREATE UNIQUE INDEX IF NOT EXISTS studio_studies_creation_request_unique ON studio_studies(project_id, creation_request_id)
  WHERE creation_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS studio_variants_creation_request_unique ON studio_variants(study_id, creation_request_id)
  WHERE creation_request_id IS NOT NULL;
-- Toute UPDATE d'une révision Studio, même accidentelle, est refusée (les suppressions suivent la cascade du projet).
CREATE OR REPLACE FUNCTION studio_v1_immutable_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_revision_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_revisions_no_update BEFORE UPDATE ON studio_revisions
  FOR EACH ROW EXECUTE FUNCTION studio_v1_immutable_revision();
-- Commentaires d'une variante Studio (mêmes règles que la Collaboration : tout membre du projet commente, l'auteur
-- seul supprime — ici en suppression douce, `deleted_at`, pour garder le fil lisible). Ancrage facultatif à une
-- révision et à des objets du document ; la révision et le commentaire parent sont de la même variante (FK
-- composites). Table nouvelle, additive : aucune ligne Studio existante n'est réécrite.
CREATE TABLE IF NOT EXISTS studio_comments (
  id text PRIMARY KEY,
  variant_id text NOT NULL REFERENCES studio_variants(id) ON DELETE CASCADE,
  revision_id text,
  object_ids jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT studio_comments_object_ids_array CHECK (jsonb_typeof(object_ids) = 'array'),
  parent_id text,
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body text NOT NULL CONSTRAINT studio_comments_body_length CHECK (length(body) BETWEEN 1 AND 4000),
  request_id text,
  payload_hash text CONSTRAINT studio_comments_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT studio_comments_variant_id_unique UNIQUE(variant_id, id),
  CONSTRAINT studio_comments_revision_same_variant FOREIGN KEY(variant_id, revision_id)
    REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE,
  CONSTRAINT studio_comments_parent_same_variant FOREIGN KEY(variant_id, parent_id)
    REFERENCES studio_comments(variant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS studio_comments_variant_idx ON studio_comments(variant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS studio_comments_request_unique ON studio_comments(variant_id, request_id)
  WHERE request_id IS NOT NULL;
-- Rattachement facultatif d'une étude Studio à des étapes du Parcours du même projet (numéro d'étape de
-- project_steps, vérifié par le serveur). Table nouvelle, additive : aucune étape ni aucune étude n'est réécrite.
CREATE TABLE IF NOT EXISTS studio_study_steps (
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_study_steps_unique UNIQUE(study_id, step_number)
);
CREATE INDEX IF NOT EXISTS studio_study_steps_step_idx ON studio_study_steps(step_number);
-- Cycle de vie des études et variantes Studio : renommage (updated_at, created_at conservé), archivage sans
-- suppression (archived_at ; NULL = active) et provenance d'une variante dérivée (variante et révision sources, de la
-- même étude — vérifié par le serveur ; la paire de colonnes est renseignée ensemble ou pas du tout). Colonnes
-- nullables ajoutées sans réécrire les lignes existantes ; contraintes recréées à chaque application, NOT VALID.
ALTER TABLE studio_studies ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE studio_studies ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE studio_variants ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE studio_variants ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE studio_variants ADD COLUMN IF NOT EXISTS derived_from_variant_id text;
ALTER TABLE studio_variants ADD COLUMN IF NOT EXISTS derived_from_revision_id text;
ALTER TABLE studio_variants DROP CONSTRAINT IF EXISTS studio_variants_derived_from_pair,
  ADD CONSTRAINT studio_variants_derived_from_pair
  CHECK ((derived_from_variant_id IS NULL) = (derived_from_revision_id IS NULL)) NOT VALID;
ALTER TABLE studio_variants DROP CONSTRAINT IF EXISTS studio_variants_derived_from_revision,
  ADD CONSTRAINT studio_variants_derived_from_revision FOREIGN KEY(derived_from_variant_id, derived_from_revision_id)
  REFERENCES studio_revisions(variant_id, id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
