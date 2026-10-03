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
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;

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

-- Magasin du moteur de l'Atelier natif (clés design.v13.*), voir schema.ts.
CREATE TABLE IF NOT EXISTS atelier_store (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, key)
);

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

CREATE TABLE IF NOT EXISTS levels (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  label text NOT NULL,
  -- double precision, pas integer : le modèle natif P.118 porte des altitudes
  -- décimales (ex. -3.2 m, 3.2 m) — les arrondir à l'entier serait une perte
  -- de donnée interdite par AGENTS.md (« N'arrondis pas les mètres en
  -- nombres entiers »). Migration en place pour une base déjà créée avec
  -- l'ancien type integer.
  elevation double precision NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0
);
ALTER TABLE levels ALTER COLUMN elevation TYPE double precision;
CREATE INDEX IF NOT EXISTS levels_project_id_idx ON levels (project_id);

CREATE TABLE IF NOT EXISTS architectural_objects (
  id text PRIMARY KEY,
  level_id text NOT NULL REFERENCES levels (id) ON DELETE CASCADE,
  kind text NOT NULL,
  properties jsonb NOT NULL,
  relations jsonb NOT NULL,
  model_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS architectural_objects_level_id_idx ON architectural_objects (level_id);

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
-- Modèle typé de l'Atelier (chantier DrawAll V4.1, cahier des charges §5.5).
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

CREATE TABLE IF NOT EXISTS atelier_groupes (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  nom text NOT NULL,
  PRIMARY KEY (project_id, id)
);

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
