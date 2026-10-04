-- Schéma initial. Tenu à la main et volontairement en miroir exact de
-- schema.ts (voir ce fichier pour la justification de chaque choix,
-- notamment pourquoi seule `projects.parcel_footprint` est une géométrie
-- PostGIS). `npm run db:migrate` l'exécute avec IF NOT EXISTS, donc il est
-- sûr de le relancer (idempotent) ; ce n'est pas un outil de migrations
-- versionnées — à l'échelle de l'équipe, Drizzle Kit (ou équivalent) devra
-- prendre le relais dès que le schéma évolue après le premier déploiement.

-- Sections par module (L0.5) : chaque module possède le bloc délimité par
-- « -- >>> module: <nom> » et « -- <<< module: <nom> » ; on n'écrit que dans
-- sa section. L'ordre des sections respecte les clés étrangères (comptes et
-- projets d'abord) ; chaque instruction reste idempotente (IF NOT EXISTS).

-- >>> module: socle
-- Extensions communes à tous les modules.

CREATE EXTENSION IF NOT EXISTS postgis;

-- <<< module: socle

-- >>> module: comptes
-- Comptes et sessions (routes auth, notifications).

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

-- <<< module: comptes

-- >>> module: projets
-- Projets et sources : projets (colonnes Harmony, verrou d'édition, contexte du site comprises), parcelles, sources des étapes.

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

-- <<< module: projets

-- >>> module: parcours
-- Parcours : contenu des 21 étapes.

-- Contenu réel des 21 étapes du Parcours, une ligne par étape et par projet.
CREATE TABLE IF NOT EXISTS project_steps (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  status text NOT NULL DEFAULT 'a-faire',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (project_id, step_number)
);
CREATE INDEX IF NOT EXISTS project_steps_project_id_idx ON project_steps (project_id);

-- <<< module: parcours

-- >>> module: programmation
-- Programmation : répartition et cas de programme appliqués.

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

-- <<< module: programmation

-- >>> module: atelier
-- Nouvel Atelier (tables atelier_*, cahier des charges §5.5 ; propriétaire : équipier « base », §9). Lot 2 (L2.1).
--
-- Passage EtatModele (@parcours/atelier-model) ⇄ lignes : apps/api/src/lib/atelier-rows.ts (seul écrivain du
-- modèle, appelé par le service de commandes ; aucune route n'écrit ici directement, R9).
-- - Révision : `projects.model_revision` (colonne existante) fait autorité, verrouillée par `SELECT … FOR UPDATE`
--   sur la ligne du projet ; `atelier_models.model_revision` est la révision à laquelle l'empreinte a été écrite.
-- - Objets : une ligne par objet du modèle, répartie selon la classe : `atelier_layers` (calque), `atelier_site`
--   (parcelle, emprise, hypothèse, source, structure déclarée), `atelier_objects` (toutes les autres classes).
--   Identité jamais réutilisée : un objet supprimé garde sa ligne (`deleted_at`, `deleted_rank` = ordre dans
--   `EtatModele.supprimes`) ; un identifiant supprimé dont le contenu n'a jamais été écrit (créé puis supprimé dans
--   le même lot) est une trace sans contenu dans `atelier_objects`.
-- - Repères (R5) : `atelier_objects` et `atelier_layers` n'admettent que des coordonnées `local` ; `atelier_site`
--   admet `cadastral`, `geographic`, `local`, chacune dans son champ (sommets cadastraux, sommets locaux).
-- - JSON : `jsonb` conserve les nombres sans arrondi (numeric) ; l'ordre des clés n'est pas une donnée
--   (empreinte `atelier-empreinte/1` à clés triées), l'ordre des tableaux l'est et il est conservé.

-- Tête du modèle d'un projet : empreinte `atelier-empreinte/1`, versions d'ontologie et du catalogue de types.
-- Absente = le projet n'a pas encore de modèle typé.
CREATE TABLE IF NOT EXISTS atelier_models (
  project_id text PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  model_revision integer NOT NULL CHECK (model_revision >= 0),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^sha256-[0-9a-f]{64}$'),
  fingerprint_algorithm text NOT NULL DEFAULT 'atelier-empreinte/1' CHECK (fingerprint_algorithm = 'atelier-empreinte/1'),
  ontology_version integer NOT NULL CHECK (ontology_version >= 1),
  catalogue_version integer NOT NULL DEFAULT 0 CHECK (catalogue_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Définitions de types (catalogue versionné, DA-05-14) : `key` = `${classe}:${id}`, `content` = DefinitionType entière.
CREATE TABLE IF NOT EXISTS atelier_definitions (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  key text NOT NULL,
  definition_id text NOT NULL,
  "class" text NOT NULL,
  catalogue_version integer NOT NULL,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  model_revision integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, key),
  CHECK (key = "class" || ':' || definition_id)
);

-- Objets placés (occurrences) hors calques et site. `params` = paramètres canoniques de la classe ; `phase` réservée
-- (phases existant / projet / démoli, après le lot 2 : toujours nulle aujourd'hui) ; `extra` = champs d'objet non
-- portés par une colonne (rien n'est perdu).
CREATE TABLE IF NOT EXISTS atelier_objects (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  ontology text CHECK (ontology IN ('building.architecture', 'building.structure', 'drawing', 'annotation', 'projet')),
  "class" text CHECK ("class" NOT IN ('calque', 'parcelle', 'emprise', 'hypothese', 'source', 'structureDeclaree')),
  level_id text,
  definition_id text,
  params jsonb CHECK (params IS NULL OR NOT jsonb_path_exists(params, 'lax $.**.frame ? (@ != "local")')),
  layer_id text,
  group_id text,
  phase text,
  provenance text CHECK (provenance IN ('import', 'prototype', 'calcul', 'saisie', 'regle')),
  status text CHECK (status IN ('declaree', 'verifiee', 'a-verifier', 'a-confirmer', 'non-evaluee')),
  source_id text,
  note text,
  classifications jsonb,
  annotations jsonb,
  extra jsonb,
  model_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_rank integer,
  PRIMARY KEY (project_id, id),
  CHECK ((deleted_at IS NULL) = (deleted_rank IS NULL)),
  -- Seule une trace de suppression peut être sans contenu.
  CHECK (deleted_at IS NOT NULL OR (ontology IS NOT NULL AND "class" IS NOT NULL AND params IS NOT NULL AND provenance IS NOT NULL AND status IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS atelier_objects_project_level_idx ON atelier_objects (project_id, level_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS atelier_objects_project_revision_idx ON atelier_objects (project_id, model_revision);
CREATE INDEX IF NOT EXISTS atelier_objects_project_class_idx ON atelier_objects (project_id, "class");

-- Calques (classe `calque`) : mêmes colonnes que atelier_objects, contenu toujours présent.
CREATE TABLE IF NOT EXISTS atelier_layers (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  ontology text NOT NULL CHECK (ontology IN ('building.architecture', 'building.structure', 'drawing', 'annotation', 'projet')),
  "class" text NOT NULL CHECK ("class" IN ('calque')),
  level_id text,
  definition_id text,
  params jsonb NOT NULL CHECK (NOT jsonb_path_exists(params, 'lax $.**.frame ? (@ != "local")')),
  layer_id text,
  group_id text,
  phase text,
  provenance text NOT NULL CHECK (provenance IN ('import', 'prototype', 'calcul', 'saisie', 'regle')),
  status text NOT NULL CHECK (status IN ('declaree', 'verifiee', 'a-verifier', 'a-confirmer', 'non-evaluee')),
  source_id text,
  note text,
  classifications jsonb,
  annotations jsonb,
  extra jsonb,
  model_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_rank integer,
  PRIMARY KEY (project_id, id),
  CHECK ((deleted_at IS NULL) = (deleted_rank IS NULL))
);
CREATE INDEX IF NOT EXISTS atelier_layers_project_revision_idx ON atelier_layers (project_id, model_revision);

-- Site et données de projet (classes `parcelle`, `emprise`, `hypothese`, `source`, `structureDeclaree`) : les seules
-- lignes qui portent des coordonnées cadastrales ou géographiques, chacune dans son champ, jamais mélangées (R5).
CREATE TABLE IF NOT EXISTS atelier_site (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id text NOT NULL,
  ontology text NOT NULL CHECK (ontology IN ('building.architecture', 'building.structure', 'drawing', 'annotation', 'projet')),
  "class" text NOT NULL CHECK ("class" IN ('parcelle', 'emprise', 'hypothese', 'source', 'structureDeclaree')),
  level_id text,
  definition_id text,
  params jsonb NOT NULL CHECK (
    NOT jsonb_path_exists(params, 'lax $.**.frame ? (@ != "local" && @ != "cadastral" && @ != "geographic")')
    AND NOT jsonb_path_exists(params, 'lax $.sommetsCadastraux[*].frame ? (@ != "cadastral")')
    AND NOT jsonb_path_exists(params, 'lax $.enveloppeRecul[*].frame ? (@ != "cadastral")')
    AND NOT jsonb_path_exists(params, 'lax $.sommetsLocaux[*].frame ? (@ != "local")')
  ),
  layer_id text,
  group_id text,
  phase text,
  provenance text NOT NULL CHECK (provenance IN ('import', 'prototype', 'calcul', 'saisie', 'regle')),
  status text NOT NULL CHECK (status IN ('declaree', 'verifiee', 'a-verifier', 'a-confirmer', 'non-evaluee')),
  source_id text,
  note text,
  classifications jsonb,
  annotations jsonb,
  extra jsonb,
  model_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_rank integer,
  PRIMARY KEY (project_id, id),
  CHECK ((deleted_at IS NULL) = (deleted_rank IS NULL))
);
CREATE INDEX IF NOT EXISTS atelier_site_project_revision_idx ON atelier_site (project_id, model_revision);

-- Propriétés typées (DA-06-07) d'un objet (`object_id`) ou du projet (`object_id` nul : `EtatModele.proprietesProjet`),
-- dans leur ordre (`position`). `value` est la valeur JSON (JSON `null` admis, jamais une absence SQL).
CREATE TABLE IF NOT EXISTS atelier_properties (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  object_id text,
  "position" integer NOT NULL CHECK ("position" >= 0),
  name text NOT NULL,
  value jsonb NOT NULL,
  unit text,
  provenance text NOT NULL CHECK (provenance IN ('import', 'prototype', 'calcul', 'saisie', 'regle')),
  status text NOT NULL CHECK (status IN ('declaree', 'verifiee', 'a-verifier', 'a-confirmer', 'non-evaluee')),
  source_id text,
  note text,
  extra jsonb,
  model_revision integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS atelier_properties_owner_position_unique ON atelier_properties (project_id, coalesce(object_id, ''), "position");
CREATE INDEX IF NOT EXISTS atelier_properties_project_name_idx ON atelier_properties (project_id, name);

-- Relations orientées source → cible (ontologie/relations.ts). L'ordre n'est pas une donnée (empreinte triée).
CREATE TABLE IF NOT EXISTS atelier_relations (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  type text NOT NULL,
  source_id text NOT NULL,
  target_id text NOT NULL,
  role text,
  derived boolean NOT NULL,
  extra jsonb,
  model_revision integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS atelier_relations_unique ON atelier_relations (project_id, type, source_id, target_id, coalesce(role, ''));
CREATE INDEX IF NOT EXISTS atelier_relations_project_target_idx ON atelier_relations (project_id, target_id);

-- Représentations dérivées ou importées d'un objet (cahier §5.2 « Identités »), dans leur ordre.
CREATE TABLE IF NOT EXISTS atelier_representations (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  object_id text NOT NULL,
  "position" integer NOT NULL CHECK ("position" >= 0),
  usage text NOT NULL CHECK (usage IN ('plan-2d', 'solide-3d', 'symbole', 'brep')),
  authority text NOT NULL CHECK (authority IN ('parametrique', 'derivee', 'importee')),
  engine text NOT NULL,
  engine_version text NOT NULL,
  inputs_hash text NOT NULL,
  extra jsonb,
  model_revision integer NOT NULL,
  PRIMARY KEY (project_id, object_id, "position")
);

-- Journal des lots de commandes (contrat atelier-commands/1, cahier §5.4) : idempotence par (projet, request_id),
-- réponse enregistrée renvoyée telle quelle, inverse produit par le serveur (seule source admise d'une
-- `restauration`, D-024), empreintes avant / après. `inverse_of` : entrée annulée (annulation) ou annulation
-- rétablie (rétablissement) ; une entrée ne peut être inversée qu'une fois (double restauration refusée).
CREATE TABLE IF NOT EXISTS atelier_commands (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  request_id text NOT NULL,
  contract text NOT NULL CHECK (contract = 'atelier-commands/1'),
  nature text NOT NULL DEFAULT 'commande' CHECK (nature IN ('commande', 'annulation', 'retablissement', 'import')),
  label text NOT NULL,
  base_revision integer NOT NULL CHECK (base_revision >= 0),
  result_revision integer NOT NULL,
  commands jsonb NOT NULL CHECK (jsonb_typeof(commands) = 'array'),
  inverse jsonb NOT NULL CHECK (jsonb_typeof(inverse) = 'array'),
  effets jsonb NOT NULL CHECK (jsonb_typeof(effets) = 'object'),
  response jsonb NOT NULL,
  base_fingerprint text NOT NULL CHECK (base_fingerprint ~ '^sha256-[0-9a-f]{64}$'),
  result_fingerprint text NOT NULL CHECK (result_fingerprint ~ '^sha256-[0-9a-f]{64}$'),
  author_id text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  inverse_of text REFERENCES atelier_commands (id),
  -- Lot sans changement du modèle : révision inchangée (D-024) ; sinon +1.
  CHECK (result_revision = base_revision OR result_revision = base_revision + 1),
  CHECK ((nature IN ('annulation', 'retablissement')) = (inverse_of IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS atelier_commands_request_unique ON atelier_commands (project_id, request_id);
CREATE UNIQUE INDEX IF NOT EXISTS atelier_commands_inverse_of_unique ON atelier_commands (inverse_of) WHERE inverse_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS atelier_commands_project_revision_idx ON atelier_commands (project_id, result_revision);

-- Boîte de sortie (événements `atelier.commande.validee`…) écrite dans la transaction du lot, traitée après
-- validation ; idempotente par identifiant et par (commande, événement).
CREATE TABLE IF NOT EXISTS atelier_outbox (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  command_id text NOT NULL REFERENCES atelier_commands (id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE UNIQUE INDEX IF NOT EXISTS atelier_outbox_command_event_unique ON atelier_outbox (command_id, event);
CREATE INDEX IF NOT EXISTS atelier_outbox_pending_idx ON atelier_outbox (created_at) WHERE processed_at IS NULL;

-- Volumes immuables adressés par contenu (`id` = SHA-256 hexadécimal du contenu), derrière `VolumeStore`
-- (apps/api/src/lib/volume-store.ts) ; stockage objet plus tard, hors dépôt (§10.1, point 4).
CREATE TABLE IF NOT EXISTS volumes (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime <> ''),
  size bigint NOT NULL CHECK (size >= 0),
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (size = octet_length(content)),
  CHECK (id = encode(sha256(content), 'hex'))
);

-- <<< module: atelier

-- >>> module: documents
-- Documents : exports de dessins et productions enregistrées.

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

-- <<< module: documents

-- >>> module: collaboration
-- Collaboration : commentaires et membres.

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

-- <<< module: collaboration
