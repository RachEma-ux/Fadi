-- Schéma initial. Tenu à la main et volontairement en miroir exact de
-- schema.ts (voir ce fichier pour la justification de chaque choix,
-- notamment pourquoi seule `projects.parcel_footprint` est une géométrie
-- PostGIS). `npm run db:migrate` l'exécute avec IF NOT EXISTS, donc il est
-- sûr de le relancer (idempotent) ; ce n'est pas un outil de migrations
-- versionnées — à l'échelle de l'équipe, Drizzle Kit (ou équivalent) devra
-- prendre le relais dès que le schéma évolue après le premier déploiement.

CREATE EXTENSION IF NOT EXISTS postgis;

-- D-7 (docs/workstreams/users-management/AMENDEMENT-D7.md) : rôles au moindre privilège et schémas `auth` / `admin`.
-- Les rôles sont créés sans mot de passe (définis hors dépôt par l'administrateur du serveur, RUNBOOK.md) et seulement
-- par un rôle qui en a le droit ; ailleurs, rien n'est créé. `fadi_migrator`, membre de `fadi_owner`, agit en
-- propriétaire pendant la migration (les objets créés appartiennent à `fadi_owner`).
DO $$
BEGIN
  IF (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_owner') THEN CREATE ROLE fadi_owner NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_migrator') THEN CREATE ROLE fadi_migrator LOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_app') THEN CREATE ROLE fadi_app LOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_retention') THEN CREATE ROLE fadi_retention LOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_backup') THEN CREATE ROLE fadi_backup LOGIN; END IF;
    IF NOT pg_has_role('fadi_migrator', 'fadi_owner', 'MEMBER') THEN GRANT fadi_owner TO fadi_migrator; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_owner')
     AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
     AND pg_has_role(current_user, 'fadi_owner', 'MEMBER') THEN
    SET ROLE fadi_owner;
  END IF;
  -- `CREATE SCHEMA IF NOT EXISTS` exige le droit CREATE sur la base même quand le schéma existe : vérifié d'abord.
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_owner') AND pg_has_role(current_user, 'fadi_owner', 'MEMBER') THEN
      CREATE SCHEMA auth AUTHORIZATION fadi_owner;
    ELSE
      CREATE SCHEMA auth;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'admin') THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_owner') AND pg_has_role(current_user, 'fadi_owner', 'MEMBER') THEN
      CREATE SCHEMA admin AUTHORIZATION fadi_owner;
    ELSE
      CREATE SCHEMA admin;
    END IF;
  END IF;
END $$;

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
-- Audience d'un commentaire (écart E1, 2026-10-24) : `equipe` = propriétaire et éditeurs, `projet` = tous les membres,
-- lecteurs compris. Ajout additif : les commentaires existants reçoivent `projet` (aucun changement silencieux de qui
-- les lit), puis le défaut passe à `equipe` pour les nouveaux (l'API écrit toujours la valeur choisie).
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'projet'
  CONSTRAINT project_comments_audience_check CHECK (audience IN ('equipe', 'projet'));
ALTER TABLE project_comments ALTER COLUMN audience SET DEFAULT 'equipe';

-- Table historique du partage. Lot OP-PONT (Issue #262, retrait du pont `op_sync_access`) : elle est reprise une
-- dernière fois dans les participations puis REMPLACÉE par la vue de compatibilité `project_members` (bloc « retrait du
-- pont », fin de la section organisations-participation). Ces instructions ne s'appliquent donc plus qu'à une base qui
-- porte encore la table (base neuve : créée ici, reprise puis remplacée plus bas, dans la même migration).
DO $$
BEGIN
  IF coalesce((SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = 'project_members'), 'r') = 'r' THEN
CREATE TABLE IF NOT EXISTS project_members (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL,
  invited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id);
-- Droit d'export explicite d'un lecteur (écart E2, 2026-10-24 ; tranche CR-D4) : ajout additif, les lignes existantes
-- reçoivent TRUE (aucun lecteur actuel ne perd l'export), puis le défaut passe à FALSE pour les nouvelles lignes. Seul le
-- rôle `lecteur` le consulte (propriétaire et éditeur exportent toujours, l'accès support jamais). NULL — ligne restaurée
-- d'une archive antérieure à cette colonne — vaut le droit d'origine : TRUE.
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS can_export boolean DEFAULT true;
ALTER TABLE project_members ALTER COLUMN can_export SET DEFAULT false;
  END IF;
END $$;

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
-- Audience d'un fil Studio (écart E1, 2026-10-24) : `equipe` = propriétaire et éditeurs, `projet` = tous les membres,
-- lecteurs compris ; portée par le commentaire d'origine (ses réponses, son observation, ses tâches et décisions la
-- suivent). Ajout additif : les commentaires existants reçoivent `projet`, puis le défaut passe à `equipe`. Colonne
-- nullable (convention des archives Studio) : NULL — ligne restaurée d'une archive antérieure — vaut `projet`.
ALTER TABLE studio_comments ADD COLUMN IF NOT EXISTS audience text DEFAULT 'projet'
  CONSTRAINT studio_comments_audience_check CHECK (audience IS NULL OR audience IN ('equipe', 'projet'));
ALTER TABLE studio_comments ALTER COLUMN audience SET DEFAULT 'equipe';
-- Observations Studio (E.2) : un commentaire d'origine devient au plus une observation (même identifiant que le
-- commentaire : une seule identité), avec un responsable (membre du projet), une échéance facultative et un statut
-- ouverte → corrigée (révision de la correction) → recontrôlée (révision ≥ correction) → clôturée, ou rouverte. Chaque
-- passage est journalisé (qui, quand, révision, note) dans un journal append-only, ordonné par `seq`. Tables nouvelles,
-- additives : aucun commentaire existant n'est réécrit.
CREATE TABLE IF NOT EXISTS studio_observations (
  comment_id text PRIMARY KEY,
  variant_id text NOT NULL REFERENCES studio_variants(id) ON DELETE CASCADE,
  responsable_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  echeance date,
  statut text NOT NULL CONSTRAINT studio_observations_statut_check
    CHECK (statut IN ('ouverte', 'corrigee', 'recontrolee', 'cloturee', 'rouverte')),
  correction_revision_id text,
  recontrole_revision_id text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_observations_comment_same_variant FOREIGN KEY(variant_id, comment_id)
    REFERENCES studio_comments(variant_id, id) ON DELETE CASCADE,
  CONSTRAINT studio_observations_correction_same_variant FOREIGN KEY(variant_id, correction_revision_id)
    REFERENCES studio_revisions(variant_id, id),
  CONSTRAINT studio_observations_recontrole_same_variant FOREIGN KEY(variant_id, recontrole_revision_id)
    REFERENCES studio_revisions(variant_id, id)
);
CREATE INDEX IF NOT EXISTS studio_observations_variant_idx ON studio_observations(variant_id);
CREATE INDEX IF NOT EXISTS studio_observations_responsable_idx ON studio_observations(responsable_id);
CREATE TABLE IF NOT EXISTS studio_observation_events (
  id text PRIMARY KEY,
  observation_id text NOT NULL REFERENCES studio_observations(comment_id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 1),
  action text NOT NULL CONSTRAINT studio_observation_events_action_check
    CHECK (action IN ('ouvrir', 'corriger', 'recontroler', 'cloturer', 'rouvrir', 'reattribuer')),
  from_statut text,
  to_statut text NOT NULL,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revision_id text,
  note text CONSTRAINT studio_observation_events_note_length CHECK (note IS NULL OR length(note) BETWEEN 1 AND 2000),
  request_id text,
  payload_hash text CONSTRAINT studio_observation_events_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_observation_events_seq_unique UNIQUE(observation_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_observation_events_request_unique ON studio_observation_events(observation_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS studio_observation_events_at_idx ON studio_observation_events(at);
-- Réattribution (propriétaire seul, journalisée) : action admise et responsable désigné par le passage. Colonne
-- nullable ajoutée sans réécrire le journal ; contrainte recréée à chaque application, NOT VALID.
ALTER TABLE studio_observation_events ADD COLUMN IF NOT EXISTS responsable_id text REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE studio_observation_events DROP CONSTRAINT IF EXISTS studio_observation_events_action_check,
  ADD CONSTRAINT studio_observation_events_action_check
  CHECK (action IN ('ouvrir', 'corriger', 'recontroler', 'cloturer', 'rouvrir', 'reattribuer')) NOT VALID;
-- Le journal ne se réécrit pas : toute UPDATE d'un passage est refusée (les suppressions suivent la cascade).
CREATE OR REPLACE FUNCTION studio_observation_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_observation_event_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_observation_events_no_update BEFORE UPDATE ON studio_observation_events
  FOR EACH ROW EXECUTE FUNCTION studio_observation_event_immutable();
-- Observations Studio, suite (E.2-01 à E.2-05) — additif : colonnes nullables et tables nouvelles, aucune ligne réécrite.
-- Contexte de vue (E.2-02) : mode de l'espace de travail où l'observation a été faite (plan, 3D, feuille, quantités,
-- exigences, revue) et repère facultatif dans ce mode (niveau, feuille…), déclarés par le client, jamais devinés.
ALTER TABLE studio_observations ADD COLUMN IF NOT EXISTS vue_mode text;
ALTER TABLE studio_observations ADD COLUMN IF NOT EXISTS vue_ref text;
ALTER TABLE studio_observations DROP CONSTRAINT IF EXISTS studio_observations_vue_check,
  ADD CONSTRAINT studio_observations_vue_check CHECK (
    (vue_mode IS NULL OR vue_mode IN ('plan', '3d', 'feuille', 'quantites', 'exigences', 'revue'))
    AND (vue_ref IS NULL OR (vue_mode IS NOT NULL AND length(vue_ref) BETWEEN 1 AND 256))) NOT VALID;
-- Paire (variante, observation) unique (la clé primaire l'est déjà) : cible des clés composites « même variante ».
CREATE UNIQUE INDEX IF NOT EXISTS studio_observations_variant_comment_unique ON studio_observations(variant_id, comment_id);
-- Identité unique d'une observation réemployée dans plusieurs domaines (E.2-01) : une observation porte des liens vers
-- une exigence BIM (et le contrôle où son écart a été vu), une ligne de métré (objet et grandeur d'une révision), une
-- revue (publication de la même variante) ou un objet du modèle (d'une révision). Un même élément d'un domaine n'est
-- suivi que par UNE observation de la variante (index unique) : on réemploie l'observation existante, on n'en crée pas
-- une seconde. Les liens ne se réécrivent pas (déclencheur) ; ils disparaissent avec l'observation (cascade).
CREATE TABLE IF NOT EXISTS studio_observation_links (
  id text PRIMARY KEY,
  observation_id text NOT NULL,
  variant_id text NOT NULL REFERENCES studio_variants(id) ON DELETE CASCADE,
  domaine text NOT NULL CONSTRAINT studio_observation_links_domaine_check CHECK (domaine IN ('exigence', 'metre', 'revue', 'objet')),
  ref text NOT NULL CONSTRAINT studio_observation_links_ref_length CHECK (length(ref) BETWEEN 1 AND 300),
  revision_id text,
  controle_id text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id text,
  payload_hash text CONSTRAINT studio_observation_links_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_observation_links_observation_same_variant FOREIGN KEY(variant_id, observation_id)
    REFERENCES studio_observations(variant_id, comment_id) ON DELETE CASCADE,
  CONSTRAINT studio_observation_links_revision_same_variant FOREIGN KEY(variant_id, revision_id)
    REFERENCES studio_revisions(variant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_observation_links_ref_unique ON studio_observation_links(variant_id, domaine, ref);
CREATE INDEX IF NOT EXISTS studio_observation_links_observation_idx ON studio_observation_links(observation_id);
CREATE UNIQUE INDEX IF NOT EXISTS studio_observation_links_request_unique ON studio_observation_links(observation_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE OR REPLACE FUNCTION studio_observation_link_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_observation_link_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_observation_links_no_update BEFORE UPDATE ON studio_observation_links
  FOR EACH ROW EXECUTE FUNCTION studio_observation_link_immutable();
-- Tâches d'une observation (E.2-03) : libellé, personne chargée (propriétaire ou éditeur), échéance facultative, statut
-- à faire → faite | annulée (rouverte par le propriétaire). La ligne porte l'état courant ; chaque passage est journalisé
-- dans studio_observation_task_events (append-only).
CREATE TABLE IF NOT EXISTS studio_observation_tasks (
  id text PRIMARY KEY,
  observation_id text NOT NULL REFERENCES studio_observations(comment_id) ON DELETE CASCADE,
  libelle text NOT NULL CONSTRAINT studio_observation_tasks_libelle_length CHECK (length(libelle) BETWEEN 1 AND 500),
  assignee_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  echeance date,
  statut text NOT NULL CONSTRAINT studio_observation_tasks_statut_check CHECK (statut IN ('a-faire', 'faite', 'annulee')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_observation_tasks_observation_idx ON studio_observation_tasks(observation_id);
CREATE INDEX IF NOT EXISTS studio_observation_tasks_assignee_idx ON studio_observation_tasks(assignee_id);
CREATE TABLE IF NOT EXISTS studio_observation_task_events (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES studio_observation_tasks(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 1),
  action text NOT NULL CONSTRAINT studio_observation_task_events_action_check
    CHECK (action IN ('creer', 'terminer', 'annuler', 'rouvrir', 'reattribuer')),
  from_statut text,
  to_statut text NOT NULL,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assignee_id text REFERENCES users(id) ON DELETE RESTRICT,
  note text CONSTRAINT studio_observation_task_events_note_length CHECK (note IS NULL OR length(note) BETWEEN 1 AND 2000),
  request_id text,
  payload_hash text CONSTRAINT studio_observation_task_events_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_observation_task_events_seq_unique UNIQUE(task_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_observation_task_events_request_unique ON studio_observation_task_events(task_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS studio_observation_task_events_at_idx ON studio_observation_task_events(at);
CREATE OR REPLACE TRIGGER studio_observation_task_events_no_update BEFORE UPDATE ON studio_observation_task_events
  FOR EACH ROW EXECUTE FUNCTION studio_observation_event_immutable();
-- Décisions d'une observation (E.2-03 / E.2-04), distinctes des passages et des tâches : une proposition (éditeur ou
-- propriétaire) ou une décision (propriétaire seul), de portée « clôture » ou « autre », avec son texte, le rôle de son
-- auteur au moment de l'écrire et, facultativement, la révision examinée. La décision de clôture est écrite par le
-- passage « clôturer » lui-même (même transaction). Journal append-only ordonné par `seq`.
CREATE TABLE IF NOT EXISTS studio_observation_decisions (
  id text PRIMARY KEY,
  observation_id text NOT NULL REFERENCES studio_observations(comment_id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 1),
  nature text NOT NULL CONSTRAINT studio_observation_decisions_nature_check CHECK (nature IN ('proposition', 'decision')),
  portee text NOT NULL CONSTRAINT studio_observation_decisions_portee_check CHECK (portee IN ('cloture', 'autre')),
  texte text NOT NULL CONSTRAINT studio_observation_decisions_texte_length CHECK (length(texte) BETWEEN 1 AND 2000),
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CONSTRAINT studio_observation_decisions_role_check CHECK (actor_role IN ('proprietaire', 'editeur')),
  revision_id text,
  request_id text,
  payload_hash text CONSTRAINT studio_observation_decisions_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_observation_decisions_seq_unique UNIQUE(observation_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_observation_decisions_request_unique ON studio_observation_decisions(observation_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS studio_observation_decisions_at_idx ON studio_observation_decisions(at);
CREATE OR REPLACE TRIGGER studio_observation_decisions_no_update BEFORE UPDATE ON studio_observation_decisions
  FOR EACH ROW EXECUTE FUNCTION studio_observation_event_immutable();
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
-- Étude exemple installée par le serveur (`lib/studio-exemple.ts`) : marquage EXPLICITE (exemple, version et empreinte
-- de la conversion, préfixe des identifiants de requête, état complet ou non, rapport de conversion enregistré avec
-- l'installation). NULL = étude ordinaire. Colonne nullable additive : les archives antérieures se restaurent telles
-- quelles (colonne absente → NULL), la version des tables archivées est inchangée.
ALTER TABLE studio_studies ADD COLUMN IF NOT EXISTS example_install jsonb;
-- Phase DÉCLARÉE du workflow de conception de l'étude (REF-01 §06 : cadrer → explorer → concevoir → contrôler →
-- coordonner et corriger → approuver → publier ; `STUDIO_PHASES_WORKFLOW` du modèle). Déclarée par le propriétaire ou un
-- éditeur (PATCH …/studies/:id/workflow), jamais déduite du contenu ; NULL = « non déclarée ». Colonne nullable
-- additive : les lignes existantes et les archives antérieures restent valides (colonne absente → NULL), la version des
-- tables archivées est inchangée ; contrainte recréée à chaque application, NOT VALID.
ALTER TABLE studio_studies ADD COLUMN IF NOT EXISTS workflow_phase text;
ALTER TABLE studio_studies DROP CONSTRAINT IF EXISTS studio_studies_workflow_phase,
  ADD CONSTRAINT studio_studies_workflow_phase
  CHECK (workflow_phase IS NULL OR workflow_phase IN ('cadrer', 'explorer', 'concevoir', 'controler', 'coordonner', 'approuver', 'publier')) NOT VALID;
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
-- Mode de dérivation (TR-EX-013 / TR-INV-003, ADR-STUDIO-PILOTE-01 P-12) : NULL = version du même ensemble d'objets
-- (identifiants conservés, comportement historique) ; 'copie' = copie indépendante à nouvelles identités, avec sa
-- provenance par élément (nouvel identifiant → identifiant source). Colonnes nullables, aucune ligne réécrite.
ALTER TABLE studio_variants ADD COLUMN IF NOT EXISTS derivation_mode text;
ALTER TABLE studio_variants ADD COLUMN IF NOT EXISTS derivation_identities jsonb;
ALTER TABLE studio_variants DROP CONSTRAINT IF EXISTS studio_variants_derivation_mode_check,
  ADD CONSTRAINT studio_variants_derivation_mode_check
  CHECK ((derivation_mode IS NULL OR (derivation_mode = 'copie' AND derived_from_variant_id IS NOT NULL))
    AND ((derivation_mode IS NULL) = (derivation_identities IS NULL))) NOT VALID;
-- Publications Studio (E.4-01 à E.4-06, E.3-06) : une publication porte sur UNE révision d'une variante, identifiée par
-- son identifiant et l'empreinte SHA-256 de son document ; statuts travail → soumis → approuve | refuse → diffuse, et
-- retire (jamais de suppression). L'approbation est liée à la révision et à l'empreinte examinées ; la diffusion fige
-- un paquet d'exports (SVG, DXF, IFC, feuille PDF) rangés dans les volumes immuables (SHA-256). Chaque transition est
-- journalisée (auteur, date, commentaire) dans studio_publication_events, dont les lignes ne sont jamais modifiées.
-- Additif et idempotent : tables nouvelles, aucune ligne existante réécrite.
CREATE TABLE IF NOT EXISTS studio_publications (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  study_id text NOT NULL,
  variant_id text NOT NULL,
  revision_id text NOT NULL,
  document_hash text NOT NULL CONSTRAINT studio_publications_document_hash_check CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  title text NOT NULL CONSTRAINT studio_publications_title_length CHECK (length(title) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'travail' CONSTRAINT studio_publications_status_check
    CHECK (status IN ('travail', 'soumis', 'approuve', 'refuse', 'diffuse', 'retire')),
  approved_revision_id text,
  approved_document_hash text,
  approved_by text REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  package jsonb,
  package_hash text CONSTRAINT studio_publications_package_hash_check CHECK (package_hash IS NULL OR package_hash ~ '^[0-9a-f]{64}$'),
  diffused_by text REFERENCES users(id) ON DELETE RESTRICT,
  diffused_at timestamptz,
  request_id text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_publications_variant_of_study FOREIGN KEY(study_id, variant_id)
    REFERENCES studio_variants(study_id, id) ON DELETE CASCADE,
  CONSTRAINT studio_publications_revision_of_variant FOREIGN KEY(variant_id, revision_id)
    REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE,
  CONSTRAINT studio_publications_approval_same_revision CHECK (approved_revision_id IS NULL OR approved_revision_id = revision_id),
  CONSTRAINT studio_publications_approval_complete CHECK ((approved_revision_id IS NULL) = (approved_document_hash IS NULL)),
  CONSTRAINT studio_publications_package_complete CHECK ((package IS NULL) = (package_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS studio_publications_project_idx ON studio_publications(project_id, created_at);
CREATE INDEX IF NOT EXISTS studio_publications_study_idx ON studio_publications(study_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS studio_publications_request_unique ON studio_publications(variant_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS studio_publication_events (
  id text PRIMARY KEY,
  publication_id text NOT NULL REFERENCES studio_publications(id) ON DELETE CASCADE,
  action text NOT NULL CONSTRAINT studio_publication_events_action_check
    CHECK (action IN ('creer', 'soumettre', 'approuver', 'refuser', 'diffuser', 'retirer')),
  from_status text,
  to_status text NOT NULL,
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment text CONSTRAINT studio_publication_events_comment_length CHECK (comment IS NULL OR length(comment) BETWEEN 1 AND 2000),
  revision_id text NOT NULL,
  document_hash text NOT NULL,
  head_revision_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_publication_events_publication_idx ON studio_publication_events(publication_id, created_at);
-- Journal append-only : toute UPDATE d'un évènement de publication est refusée (les suppressions suivent la cascade du projet).
CREATE OR REPLACE FUNCTION studio_publication_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_publication_event_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_publication_events_no_update BEFORE UPDATE ON studio_publication_events
  FOR EACH ROW EXECUTE FUNCTION studio_publication_event_immutable();
-- Préférences d'outils Studio d'un compte (B.2-02/04/05) : profil des barres d'outils, favoris et liste personnelle
-- (identifiants du registre STUDIO_TOOLS, vérifiés par le serveur). Visibilité seulement : aucune géométrie,
-- révision ni droit n'en dépend (B.2-06/07). Table nouvelle, additive ; disparaît avec le compte (cascade).
CREATE TABLE IF NOT EXISTS studio_tool_preferences (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile text NOT NULL DEFAULT 'standard',
  favorites jsonb NOT NULL DEFAULT '[]'::jsonb,
  personal jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE studio_tool_preferences DROP CONSTRAINT IF EXISTS studio_tool_preferences_profile_check,
  ADD CONSTRAINT studio_tool_preferences_profile_check
  CHECK (profile ~ '^(standard|personnel|metier:[a-z0-9-]{1,40})$') NOT VALID;
ALTER TABLE studio_tool_preferences DROP CONSTRAINT IF EXISTS studio_tool_preferences_lists_check,
  ADD CONSTRAINT studio_tool_preferences_lists_check
  CHECK (jsonb_typeof(favorites) = 'array' AND jsonb_typeof(personal) = 'array') NOT VALID;
-- Regroupements personnels d'outils (B.2-02) et version du manifeste du catalogue sous laquelle la ligne a été écrite
-- (B.1-06, « studio-tool-manifest/<n> ») : colonnes additives facultatives (null = aucun regroupement / ligne écrite
-- avant le manifeste), pour qu'une ligne d'archive antérieure se relise sans elles.
ALTER TABLE studio_tool_preferences ADD COLUMN IF NOT EXISTS groups jsonb;
ALTER TABLE studio_tool_preferences ADD COLUMN IF NOT EXISTS manifest_version text;
ALTER TABLE studio_tool_preferences DROP CONSTRAINT IF EXISTS studio_tool_preferences_groups_check,
  ADD CONSTRAINT studio_tool_preferences_groups_check
  CHECK (groups IS NULL OR (jsonb_typeof(groups) = 'array' AND jsonb_array_length(groups) <= 20)) NOT VALID;
ALTER TABLE studio_tool_preferences DROP CONSTRAINT IF EXISTS studio_tool_preferences_manifest_check,
  ADD CONSTRAINT studio_tool_preferences_manifest_check
  CHECK (manifest_version IS NULL OR manifest_version ~ '^studio-tool-manifest/[1-9][0-9]*$') NOT VALID;
-- Préférences d'outils du Sandbox d'un compte (lot 5, décision du maître d'ouvrage du 20 octobre 2026) : profil des
-- barres (standard, personnel, metier:<id>), barre gauche personnelle, favoris et regroupements nommés, identifiants du
-- registre REGISTRE_SANDBOX vérifiés par le serveur. Table PROPRE au Sandbox (jamais studio_tool_preferences du 01) ;
-- visibilité des outils seulement, aucun dessin (le brouillon du Sandbox reste dans le navigateur). Additive ;
-- disparaît avec le compte (cascade).
CREATE TABLE IF NOT EXISTS sandbox_tool_preferences (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile text NOT NULL DEFAULT 'standard',
  left_bar jsonb NOT NULL DEFAULT '[]'::jsonb,
  favorites jsonb NOT NULL DEFAULT '[]'::jsonb,
  groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  format text NOT NULL DEFAULT 'sandbox-preferences/1',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sandbox_tool_preferences DROP CONSTRAINT IF EXISTS sandbox_tool_preferences_profile_check,
  ADD CONSTRAINT sandbox_tool_preferences_profile_check
  CHECK (profile ~ '^(standard|personnel|metier:[a-z0-9-]{1,40})$') NOT VALID;
ALTER TABLE sandbox_tool_preferences DROP CONSTRAINT IF EXISTS sandbox_tool_preferences_lists_check,
  ADD CONSTRAINT sandbox_tool_preferences_lists_check
  CHECK (jsonb_typeof(left_bar) = 'array' AND jsonb_typeof(favorites) = 'array' AND jsonb_typeof(groups) = 'array'
    AND jsonb_array_length(groups) <= 20) NOT VALID;
-- Publications Studio, jamais de suppression (E.4-06) : une DELETE directe d'un évènement du journal est refusée tant
-- que sa publication existe ; une DELETE directe d'une publication diffusée ou retirée est refusée tant que son projet
-- existe. Seule la cascade (parent déjà supprimé dans la même instruction, donc invisible) passe ; la route
-- DELETE /projects/:id refuse elle-même (409 publications_diffusees) un projet portant une publication diffusée ou retirée.
CREATE OR REPLACE FUNCTION studio_publication_event_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM studio_publications WHERE id = OLD.publication_id) THEN
    RAISE EXCEPTION 'studio_publication_event_undeletable';
  END IF;
  RETURN OLD;
END;
$$;
CREATE OR REPLACE TRIGGER studio_publication_events_no_delete BEFORE DELETE ON studio_publication_events
  FOR EACH ROW EXECUTE FUNCTION studio_publication_event_no_delete();
CREATE OR REPLACE FUNCTION studio_publication_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('diffuse', 'retire') AND EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id) THEN
    RAISE EXCEPTION 'studio_publication_undeletable';
  END IF;
  RETURN OLD;
END;
$$;
CREATE OR REPLACE TRIGGER studio_publications_no_delete BEFORE DELETE ON studio_publications
  FOR EACH ROW EXECUTE FUNCTION studio_publication_no_delete();
-- Publications Studio, lot E.4 (E.4-01 à E.4-06) : trois dimensions distinctes — travail (brouillon, en-revue,
-- approuve, refuse), diffusion (non-diffuse, diffuse, retire, remplace) et actualité (calculée, jamais stockée) —,
-- manifeste figé multi-sources (révisions et empreintes des variantes sources, empreintes des documents du paquet),
-- approbation liée à l'empreinte exacte du manifeste examiné, remplacement d'une diffusion journalisé. Le statut
-- combiné `status` reste tenu pour les lecteurs existants. Colonnes nullables ajoutées sans réécrire les lignes
-- existantes (dimensions déduites du statut combiné, manifeste à actualiser) ; contraintes recréées, NOT VALID.
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS work_status text;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS diffusion_status text;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS manifest jsonb;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS manifest_hash text;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS manifest_built_at timestamptz;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS approved_manifest_hash text;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS replaced_by_publication_id text REFERENCES studio_publications(id);
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS replaced_by text REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS replaced_at timestamptz;
ALTER TABLE studio_publications DROP CONSTRAINT IF EXISTS studio_publications_work_status_check,
  ADD CONSTRAINT studio_publications_work_status_check
  CHECK (work_status IS NULL OR work_status IN ('brouillon', 'en-revue', 'approuve', 'refuse')) NOT VALID;
ALTER TABLE studio_publications DROP CONSTRAINT IF EXISTS studio_publications_diffusion_status_check,
  ADD CONSTRAINT studio_publications_diffusion_status_check
  CHECK (diffusion_status IS NULL OR diffusion_status IN ('non-diffuse', 'diffuse', 'retire', 'remplace')) NOT VALID;
ALTER TABLE studio_publications DROP CONSTRAINT IF EXISTS studio_publications_manifest_complete,
  ADD CONSTRAINT studio_publications_manifest_complete
  CHECK ((manifest IS NULL) = (manifest_hash IS NULL) AND (manifest_hash IS NULL OR manifest_hash ~ '^[0-9a-f]{64}$')) NOT VALID;
ALTER TABLE studio_publications DROP CONSTRAINT IF EXISTS studio_publications_approved_manifest_check,
  ADD CONSTRAINT studio_publications_approved_manifest_check
  CHECK (approved_manifest_hash IS NULL OR (approved_manifest_hash ~ '^[0-9a-f]{64}$' AND approved_revision_id IS NOT NULL)) NOT VALID;
ALTER TABLE studio_publications DROP CONSTRAINT IF EXISTS studio_publications_replacement_complete,
  ADD CONSTRAINT studio_publications_replacement_complete
  CHECK ((replaced_by_publication_id IS NULL) = (replaced_at IS NULL) AND (replaced_by_publication_id IS NULL OR replaced_by_publication_id <> id)) NOT VALID;
ALTER TABLE studio_publication_events ADD COLUMN IF NOT EXISTS manifest_hash text;
ALTER TABLE studio_publication_events ADD COLUMN IF NOT EXISTS work_status text;
ALTER TABLE studio_publication_events ADD COLUMN IF NOT EXISTS diffusion_status text;
ALTER TABLE studio_publication_events ADD COLUMN IF NOT EXISTS related_publication_id text;
ALTER TABLE studio_publication_events DROP CONSTRAINT IF EXISTS studio_publication_events_action_check,
  ADD CONSTRAINT studio_publication_events_action_check
  CHECK (action IN ('creer', 'soumettre', 'approuver', 'refuser', 'diffuser', 'retirer', 'actualiser', 'remplacer')) NOT VALID;
ALTER TABLE studio_publication_events DROP CONSTRAINT IF EXISTS studio_publication_events_manifest_hash_check,
  ADD CONSTRAINT studio_publication_events_manifest_hash_check
  CHECK (manifest_hash IS NULL OR manifest_hash ~ '^[0-9a-f]{64}$') NOT VALID;
CREATE INDEX IF NOT EXISTS studio_publications_variant_idx ON studio_publications(variant_id, diffused_at);
-- Publication non réécrite (EX-082) : une fois diffusée (paquet figé), une publication garde son paquet, son manifeste,
-- la révision et l'empreinte publiées, l'approbation et la diffusion qui les couvrent. Toute UPDATE qui changerait l'un
-- d'eux est refusée ; retrait et remplacement (statuts, `replaced_*`, `updated_at`) restent de nouveaux évènements.
-- Diffusée s'entend d'une diffusion en vigueur ou historique (diffusée, retirée, remplacée ; statut combiné pour une ligne
-- antérieure au lot E.4) : une publication restaurée d'une archive non vérifiée, remise « non diffusée » à relire,
-- n'est la diffusion de personne et repasse par le circuit complet. Aucune ligne existante n'est réécrite.
CREATE OR REPLACE FUNCTION studio_publication_package_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.package_hash IS NOT NULL AND (OLD.diffusion_status IN ('diffuse', 'retire', 'remplace')
    OR (OLD.diffusion_status IS NULL AND OLD.status IN ('diffuse', 'retire'))) AND (
    NEW.package IS DISTINCT FROM OLD.package OR NEW.package_hash IS DISTINCT FROM OLD.package_hash
    OR NEW.manifest IS DISTINCT FROM OLD.manifest OR NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash
    OR NEW.approved_manifest_hash IS DISTINCT FROM OLD.approved_manifest_hash
    OR NEW.revision_id IS DISTINCT FROM OLD.revision_id OR NEW.document_hash IS DISTINCT FROM OLD.document_hash
    OR NEW.diffused_by IS DISTINCT FROM OLD.diffused_by OR NEW.diffused_at IS DISTINCT FROM OLD.diffused_at
  ) THEN
    RAISE EXCEPTION 'studio_publication_package_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER studio_publications_package_frozen BEFORE UPDATE ON studio_publications
  FOR EACH ROW EXECUTE FUNCTION studio_publication_package_frozen();
-- Clé de signature des archives de projet propre à la base (lib/archive-signing-key.ts) : utilisée seulement quand
-- ARCHIVE_SIGNING_KEY n'est pas fournie, créée à la première signature (une ligne, id 'local'). La clé ne sort jamais
-- du serveur : l'archive ne porte que son identifiant. Table nouvelle, additive.
CREATE TABLE IF NOT EXISTS archive_signing_keys (
  id text PRIMARY KEY,
  secret text NOT NULL CONSTRAINT archive_signing_keys_secret_length CHECK (length(secret) >= 32),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Exigences Studio (E.1-02 à E.1-06) : un jeu d'exigences versionné par étude, rangé à part des révisions dessinées.
-- Chaque modification crée la version suivante (append-only : UPDATE refusée par déclencheur) ; aucune exigence n'est
-- fournie par Fadi (aucune ligne insérée ici). Les contrôles enregistrent leur résultat calculé, lié à la révision et à la
-- version du jeu examinées ; l'état d'exécution (execute / non-execute / erreur) est distinct de la conclusion, qui
-- n'existe que pour un contrôle exécuté. Un résultat n'est jamais réécrit dans l'exigence ni dans le document.
-- Additif et idempotent : tables nouvelles, contraintes recréées à chaque application (DROP … IF EXISTS puis ADD, NOT VALID).
CREATE TABLE IF NOT EXISTS studio_requirement_sets (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  requirements jsonb NOT NULL,
  motif text,
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id text,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_requirement_sets_version_unique ON studio_requirement_sets(study_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS studio_requirement_sets_request_unique ON studio_requirement_sets(study_id, request_id)
  WHERE request_id IS NOT NULL;
ALTER TABLE studio_requirement_sets DROP CONSTRAINT IF EXISTS studio_requirement_sets_version_check,
  ADD CONSTRAINT studio_requirement_sets_version_check CHECK (version >= 1) NOT VALID;
ALTER TABLE studio_requirement_sets DROP CONSTRAINT IF EXISTS studio_requirement_sets_requirements_array,
  ADD CONSTRAINT studio_requirement_sets_requirements_array CHECK (jsonb_typeof(requirements) = 'array') NOT VALID;
ALTER TABLE studio_requirement_sets DROP CONSTRAINT IF EXISTS studio_requirement_sets_motif_length,
  ADD CONSTRAINT studio_requirement_sets_motif_length CHECK (motif IS NULL OR length(motif) BETWEEN 1 AND 2000) NOT VALID;
ALTER TABLE studio_requirement_sets DROP CONSTRAINT IF EXISTS studio_requirement_sets_payload_hash_check,
  ADD CONSTRAINT studio_requirement_sets_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$') NOT VALID;
CREATE OR REPLACE FUNCTION studio_requirement_set_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_requirement_set_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_requirement_sets_no_update BEFORE UPDATE ON studio_requirement_sets
  FOR EACH ROW EXECUTE FUNCTION studio_requirement_set_immutable();
CREATE TABLE IF NOT EXISTS studio_requirement_checks (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  variant_id text NOT NULL,
  revision_id text NOT NULL,
  set_version integer,
  execution text NOT NULL,
  conclusion text,
  result jsonb NOT NULL,
  document_hash text NOT NULL,
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_requirement_checks_variant_idx ON studio_requirement_checks(variant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS studio_requirement_checks_request_unique ON studio_requirement_checks(variant_id, request_id)
  WHERE request_id IS NOT NULL;
ALTER TABLE studio_requirement_checks DROP CONSTRAINT IF EXISTS studio_requirement_checks_variant_of_study,
  ADD CONSTRAINT studio_requirement_checks_variant_of_study FOREIGN KEY(study_id, variant_id)
  REFERENCES studio_variants(study_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_requirement_checks DROP CONSTRAINT IF EXISTS studio_requirement_checks_revision_of_variant,
  ADD CONSTRAINT studio_requirement_checks_revision_of_variant FOREIGN KEY(variant_id, revision_id)
  REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_requirement_checks DROP CONSTRAINT IF EXISTS studio_requirement_checks_set_version,
  ADD CONSTRAINT studio_requirement_checks_set_version FOREIGN KEY(study_id, set_version)
  REFERENCES studio_requirement_sets(study_id, version) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_requirement_checks DROP CONSTRAINT IF EXISTS studio_requirement_checks_execution_check,
  ADD CONSTRAINT studio_requirement_checks_execution_check CHECK (execution IN ('execute', 'non-execute', 'erreur')) NOT VALID;
ALTER TABLE studio_requirement_checks DROP CONSTRAINT IF EXISTS studio_requirement_checks_conclusion_check,
  ADD CONSTRAINT studio_requirement_checks_conclusion_check
  CHECK ((conclusion IS NULL OR conclusion IN ('satisfaite', 'non-satisfaite', 'non-evaluee')) AND ((execution = 'execute') = (conclusion IS NOT NULL))) NOT VALID;
ALTER TABLE studio_requirement_checks DROP CONSTRAINT IF EXISTS studio_requirement_checks_document_hash_check,
  ADD CONSTRAINT studio_requirement_checks_document_hash_check CHECK (document_hash ~ '^[0-9a-f]{64}$') NOT VALID;
ALTER TABLE studio_requirement_checks DROP CONSTRAINT IF EXISTS studio_requirement_checks_result_object,
  ADD CONSTRAINT studio_requirement_checks_result_object CHECK (jsonb_typeof(result) = 'object') NOT VALID;
CREATE OR REPLACE FUNCTION studio_requirement_check_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_requirement_check_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_requirement_checks_no_update BEFORE UPDATE ON studio_requirement_checks
  FOR EACH ROW EXECUTE FUNCTION studio_requirement_check_immutable();
-- Ajustements manuels du métré Studio (E.3-05) : journal en ajout seul, versionné par variante (`seq` = 1, 2, … ; la
-- version du journal est sa dernière séquence). Un ajustement vise un objet (une grandeur de l'objet) ou un calque (le
-- total d'une grandeur), porte la valeur ajustée et son unité (NULL = retour à la valeur brute), un motif obligatoire,
-- l'auteur, la date et la révision sur laquelle il a été saisi ; la quantité brute de la cible à cette révision
-- (`derived_value`, NULL = non évaluée) et l'état de la cible (`target_state`, calculé par le serveur) permettent de
-- montrer « à revoir » un ajustement dont la cible a changé depuis — il n'est jamais appliqué en silence. La quantité
-- brute n'est jamais réécrite : elle reste dérivée du document. UPDATE refusée par déclencheur. Additif et idempotent :
-- table nouvelle, contraintes recréées à chaque application (DROP … IF EXISTS puis ADD, NOT VALID).
CREATE TABLE IF NOT EXISTS studio_quantity_adjustments (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  variant_id text NOT NULL,
  revision_id text NOT NULL,
  seq integer NOT NULL,
  target_kind text NOT NULL,
  target_id text NOT NULL,
  quantity text NOT NULL,
  value double precision,
  unit text NOT NULL,
  derived_value double precision,
  target_state jsonb NOT NULL,
  motif text NOT NULL,
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id text,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_quantity_adjustments_seq_unique ON studio_quantity_adjustments(variant_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS studio_quantity_adjustments_request_unique ON studio_quantity_adjustments(variant_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS studio_quantity_adjustments_study_idx ON studio_quantity_adjustments(study_id);
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_variant_of_study,
  ADD CONSTRAINT studio_quantity_adjustments_variant_of_study FOREIGN KEY(study_id, variant_id)
  REFERENCES studio_variants(study_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_revision_of_variant,
  ADD CONSTRAINT studio_quantity_adjustments_revision_of_variant FOREIGN KEY(variant_id, revision_id)
  REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_seq_check,
  ADD CONSTRAINT studio_quantity_adjustments_seq_check CHECK (seq >= 1) NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_target_check,
  ADD CONSTRAINT studio_quantity_adjustments_target_check
  CHECK (target_kind IN ('objet', 'calque') AND length(target_id) BETWEEN 1 AND 128) NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_quantity_check,
  ADD CONSTRAINT studio_quantity_adjustments_quantity_check
  CHECK (quantity ~ '^[a-z]+(-[a-z]+)*$' AND length(quantity) <= 40) NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_unit_check,
  ADD CONSTRAINT studio_quantity_adjustments_unit_check CHECK (unit IN ('m', 'm2', 'm3')) NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_value_check,
  ADD CONSTRAINT studio_quantity_adjustments_value_check
  CHECK ((value IS NULL OR (value >= 0 AND value < 'Infinity'::double precision)) AND (derived_value IS NULL OR (derived_value > '-Infinity'::double precision AND derived_value < 'Infinity'::double precision))) NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_motif_length,
  ADD CONSTRAINT studio_quantity_adjustments_motif_length CHECK (length(btrim(motif)) BETWEEN 1 AND 2000) NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_target_state_object,
  ADD CONSTRAINT studio_quantity_adjustments_target_state_object CHECK (jsonb_typeof(target_state) = 'object') NOT VALID;
ALTER TABLE studio_quantity_adjustments DROP CONSTRAINT IF EXISTS studio_quantity_adjustments_payload_hash_check,
  ADD CONSTRAINT studio_quantity_adjustments_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$') NOT VALID;
CREATE OR REPLACE FUNCTION studio_quantity_adjustment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_quantity_adjustment_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_quantity_adjustments_no_update BEFORE UPDATE ON studio_quantity_adjustments
  FOR EACH ROW EXECUTE FUNCTION studio_quantity_adjustment_immutable();
-- Production documentaire Studio (E.3-01 à E.3-03) : feuilles composées et dossiers de conception, rangés À PART des
-- révisions (une feuille ne modifie jamais la planche de travail). Une feuille lit une révision IDENTIFIÉE d'une
-- variante de l'étude (`revision_id`, réépinglée explicitement à la demande) ; sa définition (numéro, titre, format,
-- échelle, vue source, cartouche saisi) est un objet JSON contrôlé par `@parcours/atelier-model`. Un dossier est une
-- liste ordonnée de feuilles de la même étude, un métré facultatif (variante et révision identifiées) et le choix de
-- joindre le rapport de fidélité. Additif et idempotent : tables nouvelles, contraintes recréées (NOT VALID).
CREATE TABLE IF NOT EXISTS studio_sheets (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  variant_id text NOT NULL,
  revision_id text NOT NULL,
  number text NOT NULL,
  definition jsonb NOT NULL,
  request_id text,
  payload_hash text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_sheets_number_unique ON studio_sheets(study_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS studio_sheets_request_unique ON studio_sheets(study_id, request_id) WHERE request_id IS NOT NULL;
ALTER TABLE studio_sheets DROP CONSTRAINT IF EXISTS studio_sheets_variant_of_study,
  ADD CONSTRAINT studio_sheets_variant_of_study FOREIGN KEY(study_id, variant_id)
  REFERENCES studio_variants(study_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_sheets DROP CONSTRAINT IF EXISTS studio_sheets_revision_of_variant,
  ADD CONSTRAINT studio_sheets_revision_of_variant FOREIGN KEY(variant_id, revision_id)
  REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_sheets DROP CONSTRAINT IF EXISTS studio_sheets_number_length,
  ADD CONSTRAINT studio_sheets_number_length CHECK (length(btrim(number)) BETWEEN 1 AND 20) NOT VALID;
ALTER TABLE studio_sheets DROP CONSTRAINT IF EXISTS studio_sheets_definition_object,
  ADD CONSTRAINT studio_sheets_definition_object CHECK (jsonb_typeof(definition) = 'object') NOT VALID;
ALTER TABLE studio_sheets DROP CONSTRAINT IF EXISTS studio_sheets_payload_hash_check,
  ADD CONSTRAINT studio_sheets_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$') NOT VALID;
CREATE TABLE IF NOT EXISTS studio_dossiers (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  title text NOT NULL,
  sheet_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantities_variant_id text,
  quantities_revision_id text,
  include_fidelity boolean NOT NULL DEFAULT true,
  request_id text,
  payload_hash text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_dossiers_request_unique ON studio_dossiers(study_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS studio_dossiers_study_idx ON studio_dossiers(study_id, created_at);
ALTER TABLE studio_dossiers DROP CONSTRAINT IF EXISTS studio_dossiers_quantities_variant_of_study,
  ADD CONSTRAINT studio_dossiers_quantities_variant_of_study FOREIGN KEY(study_id, quantities_variant_id)
  REFERENCES studio_variants(study_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_dossiers DROP CONSTRAINT IF EXISTS studio_dossiers_quantities_revision_of_variant,
  ADD CONSTRAINT studio_dossiers_quantities_revision_of_variant FOREIGN KEY(quantities_variant_id, quantities_revision_id)
  REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_dossiers DROP CONSTRAINT IF EXISTS studio_dossiers_quantities_complete,
  ADD CONSTRAINT studio_dossiers_quantities_complete CHECK ((quantities_variant_id IS NULL) = (quantities_revision_id IS NULL)) NOT VALID;
ALTER TABLE studio_dossiers DROP CONSTRAINT IF EXISTS studio_dossiers_title_length,
  ADD CONSTRAINT studio_dossiers_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200) NOT VALID;
ALTER TABLE studio_dossiers DROP CONSTRAINT IF EXISTS studio_dossiers_sheet_ids_array,
  ADD CONSTRAINT studio_dossiers_sheet_ids_array CHECK (jsonb_typeof(sheet_ids) = 'array') NOT VALID;
ALTER TABLE studio_dossiers DROP CONSTRAINT IF EXISTS studio_dossiers_payload_hash_check,
  ADD CONSTRAINT studio_dossiers_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$') NOT VALID;
-- Borne du journal des ajustements du métré (E.3-05) lue par le dossier : séquence maximale du journal de la variante
-- au moment où le métré est épinglé. Null : aucun ajustement pris en compte (journal vide à l'épinglage, ou pas de métré).
ALTER TABLE studio_dossiers ADD COLUMN IF NOT EXISTS quantities_adjustment_seq integer;
ALTER TABLE studio_dossiers DROP CONSTRAINT IF EXISTS studio_dossiers_quantities_adjustment_seq_check,
  ADD CONSTRAINT studio_dossiers_quantities_adjustment_seq_check
  CHECK (quantities_adjustment_seq IS NULL OR (quantities_adjustment_seq >= 1 AND quantities_variant_id IS NOT NULL)) NOT VALID;
-- Modèles externes (partenaires) d'une variante Studio (lot F3, TR-EX-066, lib/studio-modeles-externes.ts) : une ligne
-- par réception, avec ce que l'émetteur déclare (référence, auteur, discipline, format, version, unité, transformation),
-- le fichier reçu tel quel et son empreinte SHA-256 (`content_digest`), le rapport du lecteur (unité lue, pertes, éléments non natifs), la dernière
-- comparaison avec une révision de la variante, et le statut (compare → accepte | refuse). Un modèle reçu ne modifie
-- jamais la variante. Le journal des passages (`studio_external_model_events`) est en ajout seul (UPDATE refusée par
-- déclencheur). Additif et idempotent : tables nouvelles, contraintes recréées à chaque application (NOT VALID).
CREATE TABLE IF NOT EXISTS studio_external_models (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  variant_id text NOT NULL,
  reference text NOT NULL,
  author_name text NOT NULL,
  discipline text NOT NULL,
  format text NOT NULL,
  version_label text NOT NULL,
  declared_unit text NOT NULL,
  transformation jsonb,
  file_name text NOT NULL,
  content text NOT NULL,
  content_digest text NOT NULL,
  report jsonb NOT NULL,
  comparison jsonb NOT NULL,
  compared_revision_id text NOT NULL,
  status text NOT NULL,
  decided_by text REFERENCES users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  decision_motif text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id text,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_external_models_variant_idx ON studio_external_models(variant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS studio_external_models_request_unique ON studio_external_models(variant_id, request_id) WHERE request_id IS NOT NULL;
ALTER TABLE studio_external_models DROP CONSTRAINT IF EXISTS studio_external_models_variant_of_study,
  ADD CONSTRAINT studio_external_models_variant_of_study FOREIGN KEY(study_id, variant_id)
  REFERENCES studio_variants(study_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_external_models DROP CONSTRAINT IF EXISTS studio_external_models_status_check,
  ADD CONSTRAINT studio_external_models_status_check CHECK (status IN ('compare', 'accepte', 'refuse')) NOT VALID;
ALTER TABLE studio_external_models DROP CONSTRAINT IF EXISTS studio_external_models_format_check,
  ADD CONSTRAINT studio_external_models_format_check CHECK (format IN ('ifc')) NOT VALID;
ALTER TABLE studio_external_models DROP CONSTRAINT IF EXISTS studio_external_models_unit_check,
  ADD CONSTRAINT studio_external_models_unit_check CHECK (declared_unit IN ('m', 'cm', 'mm', 'ft', 'in')) NOT VALID;
ALTER TABLE studio_external_models DROP CONSTRAINT IF EXISTS studio_external_models_decision_check,
  ADD CONSTRAINT studio_external_models_decision_check
  CHECK ((status = 'compare') = (decided_by IS NULL AND decided_at IS NULL) AND (status <> 'refuse' OR length(btrim(coalesce(decision_motif, ''))) BETWEEN 1 AND 2000)) NOT VALID;
ALTER TABLE studio_external_models DROP CONSTRAINT IF EXISTS studio_external_models_sha_check,
  ADD CONSTRAINT studio_external_models_sha_check CHECK (content_digest ~ '^[0-9a-f]{64}$' AND (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$')) NOT VALID;
ALTER TABLE studio_external_models DROP CONSTRAINT IF EXISTS studio_external_models_text_lengths,
  ADD CONSTRAINT studio_external_models_text_lengths CHECK (length(btrim(reference)) BETWEEN 1 AND 200 AND length(btrim(author_name)) BETWEEN 1 AND 200
    AND length(btrim(discipline)) BETWEEN 1 AND 80 AND length(btrim(version_label)) BETWEEN 1 AND 80 AND length(btrim(file_name)) BETWEEN 1 AND 255) NOT VALID;
CREATE TABLE IF NOT EXISTS studio_external_model_events (
  id text PRIMARY KEY,
  model_id text NOT NULL REFERENCES studio_external_models(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revision_id text,
  motif text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_external_model_events_seq_unique ON studio_external_model_events(model_id, seq);
ALTER TABLE studio_external_model_events DROP CONSTRAINT IF EXISTS studio_external_model_events_action_check,
  ADD CONSTRAINT studio_external_model_events_action_check CHECK (action IN ('recevoir', 'comparer', 'accepter', 'refuser')) NOT VALID;
CREATE OR REPLACE FUNCTION studio_external_model_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_external_model_event_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_external_model_events_no_update BEFORE UPDATE ON studio_external_model_events
  FOR EACH ROW EXECUTE FUNCTION studio_external_model_event_immutable();

-- Journal d'accès Studio (TR-EX-046, ADR-STUDIO-PILOTE-01 P-12, lib/studio-journal-acces.ts) : événements sensibles du
-- serveur — refus d'accès (401, 403, 404, 423) et sorties de contenu (exports, fichiers) des routes Studio. Minimisation :
-- ni adresse IP, ni courriel, ni corps, ni géométrie ; la route est enregistrée sous sa forme générique (`:studyId`…).
-- Conservation : 12 mois par défaut (STUDIO_ACCESS_RETENTION_MONTHS), puis purge par la tâche horaire, chaque purge
-- datée dans `studio_access_purges`. Les lignes ne sont jamais modifiées (UPDATE refusée) ; seule la purge les supprime.
-- Le journal d'audit des publications (`studio_publication_events`) n'est pas concerné : il reste immuable.
CREATE TABLE IF NOT EXISTS studio_access_events (
  id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Compte : clé vers users (EX-001) ; la suppression d'un compte efface ses événements (minimisation).
  actor_id text REFERENCES users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  method text NOT NULL,
  route text NOT NULL CONSTRAINT studio_access_events_route_length CHECK (length(route) BETWEEN 1 AND 300),
  status integer NOT NULL,
  kind text NOT NULL CONSTRAINT studio_access_events_kind_check CHECK (kind IN ('refus', 'export')),
  motif text
);
CREATE INDEX IF NOT EXISTS studio_access_events_occurred_idx ON studio_access_events(occurred_at);
CREATE INDEX IF NOT EXISTS studio_access_events_project_idx ON studio_access_events(project_id, occurred_at);
CREATE OR REPLACE FUNCTION studio_access_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_access_event_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_access_events_no_update BEFORE UPDATE ON studio_access_events
  FOR EACH ROW EXECUTE FUNCTION studio_access_event_immutable();
CREATE TABLE IF NOT EXISTS studio_access_purges (
  id text PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  cutoff timestamptz NOT NULL,
  retention_months integer NOT NULL CONSTRAINT studio_access_purges_retention_check CHECK (retention_months BETWEEN 1 AND 120),
  deleted integer NOT NULL CONSTRAINT studio_access_purges_deleted_check CHECK (deleted >= 0)
);

-- Délégation contrôlée de l'approbation (EX-085, lib/studio-delegations.ts) : délégant, délégué distinct, portée
-- (projet, étude, variante, publication), période (début inclus, fin exclue), motif ; seule la révocation motivée
-- modifie la ligne. Journal en ajout seul : création, révocation et chaque emploi (publication et transition).
-- Additif et idempotent : tables et colonnes nouvelles, contraintes recréées (DROP … IF EXISTS puis ADD, NOT VALID).
CREATE TABLE IF NOT EXISTS studio_approval_delegations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  delegator_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delegate_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scope_type text NOT NULL,
  scope_id text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text REFERENCES users(id) ON DELETE RESTRICT,
  revoke_reason text
);
CREATE INDEX IF NOT EXISTS studio_approval_delegations_project_idx ON studio_approval_delegations(project_id, delegate_id);
CREATE UNIQUE INDEX IF NOT EXISTS studio_approval_delegations_request_unique ON studio_approval_delegations(project_id, delegator_id, request_id)
  WHERE request_id IS NOT NULL;
ALTER TABLE studio_approval_delegations DROP CONSTRAINT IF EXISTS studio_approval_delegations_scope_check,
  ADD CONSTRAINT studio_approval_delegations_scope_check
  CHECK ((scope_type = 'projet' AND scope_id IS NULL) OR (scope_type IN ('etude', 'variante', 'publication') AND scope_id IS NOT NULL)) NOT VALID;
ALTER TABLE studio_approval_delegations DROP CONSTRAINT IF EXISTS studio_approval_delegations_period_check,
  ADD CONSTRAINT studio_approval_delegations_period_check CHECK (ends_at > starts_at) NOT VALID;
ALTER TABLE studio_approval_delegations DROP CONSTRAINT IF EXISTS studio_approval_delegations_distinct_check,
  ADD CONSTRAINT studio_approval_delegations_distinct_check CHECK (delegate_id <> delegator_id) NOT VALID;
ALTER TABLE studio_approval_delegations DROP CONSTRAINT IF EXISTS studio_approval_delegations_reason_length,
  ADD CONSTRAINT studio_approval_delegations_reason_length CHECK (length(btrim(reason)) BETWEEN 1 AND 2000) NOT VALID;
ALTER TABLE studio_approval_delegations DROP CONSTRAINT IF EXISTS studio_approval_delegations_revocation_complete,
  ADD CONSTRAINT studio_approval_delegations_revocation_complete
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL)) NOT VALID;
CREATE TABLE IF NOT EXISTS studio_approval_delegation_events (
  id text PRIMARY KEY,
  delegation_id text NOT NULL REFERENCES studio_approval_delegations(id) ON DELETE CASCADE,
  action text NOT NULL CONSTRAINT studio_approval_delegation_events_action_check CHECK (action IN ('creer', 'revoquer', 'employer')),
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  publication_id text,
  publication_action text CONSTRAINT studio_approval_delegation_events_publication_action_check
    CHECK (publication_action IS NULL OR publication_action IN ('approuver', 'refuser')),
  comment text CONSTRAINT studio_approval_delegation_events_comment_length CHECK (comment IS NULL OR length(comment) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_approval_delegation_events_delegation_idx ON studio_approval_delegation_events(delegation_id, created_at);
CREATE OR REPLACE TRIGGER studio_approval_delegation_events_no_update BEFORE UPDATE ON studio_approval_delegation_events
  FOR EACH ROW EXECUTE FUNCTION studio_publication_event_immutable();
ALTER TABLE studio_publication_events ADD COLUMN IF NOT EXISTS delegation_id text;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS approved_delegation_id text;
-- Rapprochement des observations avec une nouvelle révision (EX-086, lib/studio-observations-rapprochement.ts) : un
-- résultat par observation et par contrôle, en ajout seul ; le statut de l'observation n'est jamais modifié ici.
CREATE TABLE IF NOT EXISTS studio_observation_reconciliations (
  id text PRIMARY KEY,
  variant_id text NOT NULL REFERENCES studio_variants(id) ON DELETE CASCADE,
  observation_id text NOT NULL,
  revision_id text NOT NULL,
  check_id text,
  observation_status text NOT NULL,
  suivi text NOT NULL CONSTRAINT studio_observation_reconciliations_suivi_check
    CHECK (suivi IN ('objet-disparu', 'persiste', 'a-recontroler', 'non-rapprochable')),
  elements jsonb NOT NULL,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_observation_reconciliations_variant_idx ON studio_observation_reconciliations(variant_id, created_at);
CREATE INDEX IF NOT EXISTS studio_observation_reconciliations_observation_idx ON studio_observation_reconciliations(observation_id);
CREATE OR REPLACE TRIGGER studio_observation_reconciliations_no_update BEFORE UPDATE ON studio_observation_reconciliations
  FOR EACH ROW EXECUTE FUNCTION studio_observation_event_immutable();

-- Lot F (décision P-12) : illustrations depuis une vue (EX-071, EX-072, AC-007), adaptateur d'agents MCP (TEST-033,
-- F.3-02), journal agent / humain (INV-010). Additif et idempotent : tables nouvelles, contraintes recréées (DROP … IF
-- EXISTS puis ADD, NOT VALID). Une révision confirmée depuis une proposition d'agent porte la source `agent-mcp`.
ALTER TABLE studio_revisions DROP CONSTRAINT IF EXISTS studio_revisions_source_check,
  ADD CONSTRAINT studio_revisions_source_check
  CHECK (source IN ('authenticated-session', 'study-initialization', 'variant-initialization', 'variant-derivation', 'agent-mcp')) NOT VALID;
CREATE TABLE IF NOT EXISTS studio_illustrations (
  id text PRIMARY KEY,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  variant_id text NOT NULL,
  revision_id text NOT NULL,
  provider_id text NOT NULL,
  provider_nature text NOT NULL,
  parameters jsonb NOT NULL,
  provenance jsonb NOT NULL,
  source_digest text NOT NULL,
  document_digest text NOT NULL,
  image_base64 text NOT NULL,
  image_digest text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_illustrations_variant_idx ON studio_illustrations(variant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS studio_illustrations_request_unique ON studio_illustrations(variant_id, request_id);
ALTER TABLE studio_illustrations DROP CONSTRAINT IF EXISTS studio_illustrations_variant_of_study,
  ADD CONSTRAINT studio_illustrations_variant_of_study FOREIGN KEY(study_id, variant_id)
  REFERENCES studio_variants(study_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_illustrations DROP CONSTRAINT IF EXISTS studio_illustrations_revision_of_variant,
  ADD CONSTRAINT studio_illustrations_revision_of_variant FOREIGN KEY(variant_id, revision_id)
  REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE studio_illustrations DROP CONSTRAINT IF EXISTS studio_illustrations_nature_check,
  ADD CONSTRAINT studio_illustrations_nature_check CHECK (provider_nature IN ('local-deterministe', 'ia-externe')) NOT VALID;
ALTER TABLE studio_illustrations DROP CONSTRAINT IF EXISTS studio_illustrations_sha_check,
  ADD CONSTRAINT studio_illustrations_sha_check CHECK (source_digest ~ '^[0-9a-f]{64}$' AND document_digest ~ '^[0-9a-f]{64}$'
    AND image_digest ~ '^[0-9a-f]{64}$' AND payload_hash ~ '^[0-9a-f]{64}$') NOT VALID;
CREATE OR REPLACE FUNCTION studio_illustration_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_illustration_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_illustrations_no_update BEFORE UPDATE ON studio_illustrations
  FOR EACH ROW EXECUTE FUNCTION studio_illustration_immutable();
-- Jetons d'agent : liés à un compte et à un projet ; seule l'empreinte SHA-256 est gardée ; révocables.
CREATE TABLE IF NOT EXISTS studio_agent_tokens (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CONSTRAINT studio_agent_tokens_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  key_digest text NOT NULL CONSTRAINT studio_agent_tokens_hash_check CHECK (key_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_agent_tokens_hash_unique ON studio_agent_tokens(key_digest);
CREATE INDEX IF NOT EXISTS studio_agent_tokens_user_idx ON studio_agent_tokens(project_id, user_id);
-- Propositions d'agent : rien n'est écrit avant la confirmation humaine (point d'entrée commun des commandes).
CREATE TABLE IF NOT EXISTS studio_agent_proposals (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES studio_variants(id) ON DELETE CASCADE,
  agent_key_id text NOT NULL REFERENCES studio_agent_tokens(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  payload_hash text NOT NULL CONSTRAINT studio_agent_proposals_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  envelope jsonb NOT NULL,
  base_revision_id text NOT NULL,
  preview jsonb NOT NULL,
  status text NOT NULL CONSTRAINT studio_agent_proposals_status_check CHECK (status IN ('en-attente', 'confirmee', 'refusee', 'expiree', 'echec')),
  revision_id text,
  failure jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_agent_proposals_request_unique ON studio_agent_proposals(variant_id, user_id, request_id);
CREATE INDEX IF NOT EXISTS studio_agent_proposals_user_idx ON studio_agent_proposals(project_id, user_id, created_at);
-- Journal agent / humain (INV-010), en ajout seul : qui (compte), sous quelle forme (agent par jeton, ou humain en session).
CREATE TABLE IF NOT EXISTS studio_agent_events (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_kind text NOT NULL CONSTRAINT studio_agent_events_kind_check CHECK (actor_kind IN ('agent', 'humain')),
  agent_key_id text,
  action text NOT NULL CONSTRAINT studio_agent_events_action_check
    CHECK (action IN ('jeton.creer', 'jeton.revoquer', 'outil.appeler', 'proposition.creer', 'proposition.confirmer', 'proposition.refuser', 'proposition.echec')),
  tool text,
  proposal_id text,
  revision_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_agent_events_project_idx ON studio_agent_events(project_id, created_at);
CREATE OR REPLACE FUNCTION studio_agent_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_agent_event_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_agent_events_no_update BEFORE UPDATE ON studio_agent_events
  FOR EACH ROW EXECUTE FUNCTION studio_agent_event_immutable();

-- ---------------------------------------------------------------------------
-- Gestion des comptes (docs/workstreams/users-management, Issue #253) — Phase 1.
-- Additif et idempotent : colonnes avec défaut ou nullables, contraintes posées une seule fois, aucune suppression.
-- Un compte existant reste `active` / `user`, sans changement de comportement.
-- ---------------------------------------------------------------------------
-- États stockés (UM-2) : active | suspended | closed (anonymisé, D-5). « Verrouillé » est dérivé de `locked_until`.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role text NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
-- D-5 : demande de suppression ; anonymisation 30 jours plus tard sauf annulation.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
-- D-6 : secret TOTP chiffré (AES-256-GCM, clé FADI_ENCRYPTION_KEY hors base) ; dernier pas accepté (anti-rejeu).
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
-- D-3 : réservée, aucune logique ne la lit (organisations hors périmètre, UM-1).
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_platform_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_platform_role_check CHECK (platform_role IN ('user', 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_failed_login_count_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_failed_login_count_check CHECK (failed_login_count >= 0);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS users_platform_role_idx ON users (platform_role) WHERE platform_role <> 'user';
CREATE INDEX IF NOT EXISTS users_deletion_requested_idx ON users (deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;

-- Sessions serveur (UM-5) : le jeton du cookie n'est jamais stocké, seulement son empreinte SHA-256. Les sessions déjà
-- ouvertes sont converties une fois (empreinte du jeton, nouvel identifiant interne) : personne n'est déconnecté.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS absolute_expires_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip text;
-- Connexion en deux étapes (D-6) : mot de passe vérifié, code TOTP attendu (5 min au plus) ; ne vaut pas authentification.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_pending boolean NOT NULL DEFAULT false;
-- Assurance de la session (revue de sécurité de la PR #255) : instant où CETTE session a prouvé la double
-- authentification (connexion par code TOTP ou de secours, ou activation du TOTP depuis elle). NULL = mot de passe seul,
-- y compris pour toute session antérieure à cette colonne : l'administration la refuse (échec fermé).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
DO $$
BEGIN
  UPDATE sessions
     SET token_hash = encode(sha256(convert_to(id, 'UTF8')), 'hex'),
         id = 'ses_' || md5(id || clock_timestamp()::text || random()::text),
         last_seen_at = coalesce(last_seen_at, created_at),
         absolute_expires_at = coalesce(absolute_expires_at, expires_at)
   WHERE token_hash IS NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions (token_hash);

-- D-7 (docs/workstreams/users-management/AMENDEMENT-D7.md) : les nouvelles tables des comptes vivent dans le schéma
-- `auth`, celles d'audit et d'exploitation dans `admin` ; `users`, `sessions` et les autres tables existantes restent
-- dans `public`. Noms toujours qualifiés : aucune dépendance au search_path.

-- D-6 : 10 codes de secours par activation de la double authentification, hachés, à usage unique.
CREATE TABLE IF NOT EXISTS auth.user_recovery_codes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_recovery_codes_user_idx ON auth.user_recovery_codes (user_id);

-- D-2 / UM-4 : accès support en lecture seule, accordé par le propriétaire à un administrateur nommé, ≤ 72 h, révocable.
-- Lié aux projets : schéma `public` (D-7).
CREATE TABLE IF NOT EXISTS public.project_support_grants (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  admin_id text NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  granted_by text NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  purpose text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by text REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT project_support_grants_duration CHECK (expires_at > granted_at AND expires_at <= granted_at + interval '72 hours'),
  CONSTRAINT project_support_grants_purpose CHECK (length(btrim(purpose)) BETWEEN 3 AND 500)
);
CREATE INDEX IF NOT EXISTS project_support_grants_project_idx ON public.project_support_grants (project_id, admin_id);

-- UM-3 : une invitation est une proposition, jamais un compte ni un accès. Une seule invitation en attente par
-- (adresse, finalité, projet) : un renvoi remplace son jeton au lieu de multiplier les invitations. `invited_by` est
-- nul seulement pour l'invitation d'amorçage du premier administrateur (apps/api/scripts/create-admin.mjs), autorité de
-- l'exploitant, qui donne le rôle administrateur à l'activation.
CREATE TABLE IF NOT EXISTS auth.invitations (
  id text PRIMARY KEY,
  purpose text NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL,
  project_id text REFERENCES public.projects (id) ON DELETE CASCADE,
  project_role text,
  invited_by text REFERENCES public.users (id) ON DELETE CASCADE,
  grant_platform_role text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  access_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  accepted_user_id text REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT invitations_purpose_check CHECK (purpose IN ('platform_account', 'project_participation')),
  CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  CONSTRAINT invitations_project_check CHECK ((purpose = 'project_participation') = (project_id IS NOT NULL AND project_role IN ('lecteur', 'editeur'))),
  CONSTRAINT invitations_grant_role_check CHECK (grant_platform_role IS NULL OR (grant_platform_role = 'admin' AND purpose = 'platform_account')),
  CONSTRAINT invitations_inviter_check CHECK (invited_by IS NOT NULL OR grant_platform_role = 'admin')
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_unique ON auth.invitations (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_unique ON auth.invitations (email, purpose, coalesce(project_id, '')) WHERE status = 'pending';

-- Jetons de compte à usage unique (vérification d'e-mail 24 h, réinitialisation 1 h, annulation de suppression 30 j).
CREATE TABLE IF NOT EXISTS auth.account_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  purpose text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_tokens_purpose_check CHECK (purpose IN ('verify_email', 'reset_password', 'cancel_deletion'))
);
CREATE UNIQUE INDEX IF NOT EXISTS account_tokens_token_hash_unique ON auth.account_tokens (token_hash);
CREATE INDEX IF NOT EXISTS account_tokens_user_idx ON auth.account_tokens (user_id, purpose);

-- Journal d'audit append-only (même modèle que l'immuabilité de studio_revisions) : ni UPDATE ni DELETE. Aucune clé
-- étrangère : l'identifiant de l'acteur survit à l'anonymisation ; aucune adresse e-mail n'y est jamais écrite (D-5).
-- Seule exception (D-7) : le rôle `fadi_retention` peut anonymiser `actor_id`, `ip` et `metadata` d'une entrée, sans en
-- changer l'action, la cible ni la date ; la suppression reste refusée à tous.
CREATE TABLE IF NOT EXISTS admin.audit_log (
  id bigserial PRIMARY KEY,
  actor_id text,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON admin.audit_log (actor_id, created_at);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON admin.audit_log (target_type, target_id, created_at);
CREATE OR REPLACE FUNCTION admin.audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_user = 'fadi_retention'
     AND NEW.id = OLD.id AND NEW.action = OLD.action AND NEW.target_type IS NOT DISTINCT FROM OLD.target_type
     AND NEW.target_id IS NOT DISTINCT FROM OLD.target_id AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log_append_only';
END;
$$;
CREATE OR REPLACE TRIGGER audit_log_no_update BEFORE UPDATE ON admin.audit_log FOR EACH ROW EXECUTE FUNCTION admin.audit_log_append_only();
CREATE OR REPLACE TRIGGER audit_log_no_delete BEFORE DELETE ON admin.audit_log FOR EACH ROW EXECUTE FUNCTION admin.audit_log_append_only();

-- D-1 : file d'envoi des courriels (les routes ne dépendent jamais du SMTP). Le lien porteur d'un jeton n'y reste que
-- jusqu'à l'envoi ou l'abandon : la charge est alors effacée (`payload = '{}'`).
CREATE TABLE IF NOT EXISTS admin.mail_outbox (
  id text PRIMARY KEY,
  to_address text NOT NULL,
  template text NOT NULL,
  locale text NOT NULL DEFAULT 'fr',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT mail_outbox_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT mail_outbox_locale_check CHECK (locale IN ('fr', 'en'))
);
CREATE INDEX IF NOT EXISTS mail_outbox_pending_idx ON admin.mail_outbox (next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS mail_outbox_created_idx ON admin.mail_outbox (created_at);
CREATE INDEX IF NOT EXISTS mail_outbox_to_idx ON admin.mail_outbox (to_address, created_at);

-- ---------------------------------------------------------------------------
-- Organisations, participation et revue externe — phase 1 (Issue #262, docs/workstreams/organisations-participation/).
-- Personnes (compte vérifié ou contact sans compte), organisations minimales, participations au projet et rôles métier
-- par portée (OP-D3 c). Phase 1 : participations et rôles d'origine `acces` étaient le miroir de `project_members`, tenu
-- par déclencheurs ; phase 2 : la vue `project_effective_access` en tire seule la décision d'accès ; lot OP-PONT : le
-- miroir est retiré, l'application écrit directement participations et rôles, `project_members` devient une vue.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS people (
  id text PRIMARY KEY,
  -- Liaison à un compte : vérifiée seulement (activation d'une invitation, accès existant), jamais par ressemblance.
  user_id text REFERENCES users (id) ON DELETE CASCADE,
  -- Contact sans compte (OP-D9) : nom requis ; pour un compte, l'identité affichée reste celle du compte.
  display_name text,
  job_title text,
  work_email text,
  work_phone text,
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT people_identity_check CHECK (user_id IS NOT NULL OR length(btrim(coalesce(display_name, ''))) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS people_user_unique ON people (user_id) WHERE user_id IS NOT NULL;

-- Organisation minimale (OP-D1, OP-D4) : partie représentée ou partie propriétaire ; l'espace d'organisation
-- (adhésions, groupes, administration) viendra avec la partie 5 du concept (OP-D10).
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  -- Type déclaré en saisie libre tant que les listes du maître d'ouvrage manquent (OP-D4).
  kind text,
  status text NOT NULL DEFAULT 'active',
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_check CHECK (length(btrim(name)) > 0),
  CONSTRAINT organizations_status_check CHECK (status IN ('active', 'suspendue', 'close'))
);

-- Participation : une personne OU une organisation dans un projet, pour une période. Annuaire et équipe en sont deux
-- vues (concept, partie 1) ; une fin de participation garde l'enregistrement, un retour ouvre une nouvelle période.
CREATE TABLE IF NOT EXISTS project_participations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  person_id text REFERENCES people (id) ON DELETE CASCADE,
  organization_id text REFERENCES organizations (id) ON DELETE CASCADE,
  represented_organization_id text REFERENCES organizations (id) ON DELETE SET NULL,
  -- Rôle métier déclaré (« ingénieur structure »…), saisie libre tant que les listes manquent (OP-D4).
  business_role text,
  -- Responsabilités d'équipe du concept : diriger, produire, coordonner, vérifier, approuver, diffuser.
  responsibilities text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  starts_on date,
  ends_on date,
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_participations_party_check CHECK ((person_id IS NULL) <> (organization_id IS NULL)),
  CONSTRAINT project_participations_status_check CHECK (status IN ('contact', 'active', 'suspendue', 'terminee')),
  CONSTRAINT project_participations_period_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT project_participations_ended_check CHECK ((status = 'terminee') = (ends_on IS NOT NULL)),
  CONSTRAINT project_participations_responsibilities_check
    CHECK (responsibilities <@ ARRAY['diriger', 'produire', 'coordonner', 'verifier', 'approuver', 'diffuser']::text[])
);
CREATE UNIQUE INDEX IF NOT EXISTS project_participations_current_person ON project_participations (project_id, person_id)
  WHERE person_id IS NOT NULL AND status <> 'terminee';
CREATE UNIQUE INDEX IF NOT EXISTS project_participations_current_org ON project_participations (project_id, organization_id)
  WHERE organization_id IS NOT NULL AND status <> 'terminee';
CREATE INDEX IF NOT EXISTS project_participations_person_idx ON project_participations (person_id);
-- Phase 2 (bascule de l'accès, OP-D3 c) : l'export accordé à un lecteur (écart E2) suit la participation, seule source
-- de la décision d'accès ; écrit par le partage (lib/project-access-db.ts ; NULL d'archive = TRUE à la restauration).
ALTER TABLE project_participations ADD COLUMN IF NOT EXISTS can_export boolean NOT NULL DEFAULT false;
-- Phase 3 (invitations acceptées) : échéance de l'accès, indépendante de celle de l'invitation. Passée, la participation
-- ne donne plus rien (vue `project_effective_access`) ; placée ici pour être disponible à la définition de la vue.
ALTER TABLE project_participations ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;

-- Rôles métier par portée (OP-D3 c, concept partie 2) : Lecteur, Concepteur, Relecteur, Coordinateur, Approbateur,
-- Diffuseur. Origine `acces` : accès de base du partage (lecteur → lecteur, editeur → concepteur), un seul par
-- participation, écrit par le partage (lib/project-access-db.ts, lot OP-PONT ; miroir par déclencheurs auparavant) ;
-- origine `attribution` : affectation explicite (phase 2), jamais touchée par le partage.
CREATE TABLE IF NOT EXISTS project_role_assignments (
  id text PRIMARY KEY,
  participation_id text NOT NULL REFERENCES project_participations (id) ON DELETE CASCADE,
  role text NOT NULL,
  scope_type text NOT NULL DEFAULT 'projet',
  scope_id text,
  origin text NOT NULL DEFAULT 'attribution',
  granted_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_role_assignments_role_check
    CHECK (role IN ('lecteur', 'concepteur', 'relecteur', 'coordinateur', 'approbateur', 'diffuseur')),
  CONSTRAINT project_role_assignments_scope_check CHECK (scope_type IN ('projet', 'etude', 'variante', 'revision', 'documents')),
  CONSTRAINT project_role_assignments_scope_id_check
    CHECK (CASE WHEN scope_type = 'projet' THEN scope_id IS NULL ELSE length(btrim(coalesce(scope_id, ''))) > 0 END),
  CONSTRAINT project_role_assignments_origin_check CHECK (origin IN ('acces', 'attribution'))
);
CREATE UNIQUE INDEX IF NOT EXISTS project_role_assignments_unique
  ON project_role_assignments (participation_id, role, scope_type, coalesce(scope_id, ''), origin);

-- Le miroir `op_sync_access` (fonction et déclencheurs sur `project_members` et `projects.owner_id`) et la reprise de
-- l'existant qui l'appelait vivaient ici jusqu'au lot OP-PONT. Ils sont retirés : la reprise d'une base qui porte
-- encore la table `project_members` (et ses déclencheurs) se fait UNE fois, dans le bloc « retrait du pont » (fin de la
-- section organisations-participation), avec la même règle ; l'application écrit ensuite directement participations et
-- rôles (lib/project-access-db.ts).

-- Organisations-participation, phase 3 bis — journal d'activité consultable par audience (OP-D13 a). Aucune table ni
-- droit nouveau : `admin.audit_log` reste append-only (déclencheurs ci-dessus, `fadi_app` sans UPDATE ni DELETE, bloc
-- D-7). Deux index de lecture, additifs : l'historique d'un projet rattache les invitations par `metadata.projectId`, et
-- le filtre par famille d'actions de l'administration lit un préfixe d'action.
CREATE INDEX IF NOT EXISTS audit_log_project_meta_idx ON admin.audit_log ((metadata->>'projectId'), id)
  WHERE metadata ? 'projectId';
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON admin.audit_log (action text_pattern_ops, id);

-- ---------------------------------------------------------------------------
-- Organisations, participation et revue externe — phase 5 : espace d'organisation (concept, partie 5 ; OP-D1 a, OP-D4 b,
-- OP-D10). Adhésions (rôle, fonction déclarée, période, statut), groupes de travail, gabarits d'équipe versionnés,
-- mandats de représentation dans un projet, organisation propriétaire facultative d'un projet, invitation de finalité
-- `organization_membership`. Rien ici n'ouvre un projet : une adhésion, un groupe, un gabarit ou un mandat ne donne
-- aucun droit de projet (concept : une adhésion n'est pas une participation) ; les droits restent ceux de
-- `projects.owner_id` / `project_members` (lib/owned-project.ts). Règles pures : apps/api/src/lib/organizations-rules.ts.
-- ---------------------------------------------------------------------------
-- Fiche : coordonnées professionnelles déclarées (saisie libre) ; clé de création rejouable (double soumission = même
-- organisation, concept partie 3 « Repeated submission must not create duplicate »).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS details text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS creation_key text;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_creation_key_unique ON organizations (created_by, creation_key)
  WHERE creation_key IS NOT NULL;

-- Adhésion d'une personne liée à un compte vérifié : rôle dans l'organisation (administrateur / membre), fonction en
-- saisie libre (OP-D4 b), période et statut (concept partie 3 : active, suspendue, terminée). Une adhésion terminée ne
-- revit pas : un retour ouvre une nouvelle adhésion (nouvelle période).
CREATE TABLE IF NOT EXISTS organization_memberships (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'membre',
  job_title text,
  status text NOT NULL DEFAULT 'active',
  starts_on date NOT NULL DEFAULT current_date,
  ends_on date,
  end_reason text,
  invitation_id text REFERENCES auth.invitations (id) ON DELETE SET NULL,
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_role_check CHECK (role IN ('administrateur', 'membre')),
  CONSTRAINT organization_memberships_status_check CHECK (status IN ('active', 'suspendue', 'terminee')),
  CONSTRAINT organization_memberships_ended_check CHECK ((status = 'terminee') = (ends_on IS NOT NULL)),
  CONSTRAINT organization_memberships_period_check CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT organization_memberships_id_org_unique UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_memberships_current ON organization_memberships (organization_id, person_id)
  WHERE status <> 'terminee';
CREATE INDEX IF NOT EXISTS organization_memberships_person_idx ON organization_memberships (person_id);

-- Groupe de travail (discipline, service…) : sert à sélectionner des personnes, n'ouvre rien (concept partie 5).
CREATE TABLE IF NOT EXISTS organization_groups (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_groups_name_check CHECK (length(btrim(name)) > 0),
  CONSTRAINT organization_groups_status_check CHECK (status IN ('active', 'archive')),
  CONSTRAINT organization_groups_id_org_unique UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_groups_name_unique ON organization_groups (organization_id, lower(btrim(name)))
  WHERE status = 'active';

-- Membre d'un groupe : une adhésion de la MÊME organisation (clés étrangères composées).
CREATE TABLE IF NOT EXISTS organization_group_members (
  group_id text NOT NULL,
  membership_id text NOT NULL,
  organization_id text NOT NULL,
  added_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, membership_id),
  CONSTRAINT organization_group_members_group_fk FOREIGN KEY (group_id, organization_id)
    REFERENCES organization_groups (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT organization_group_members_membership_fk FOREIGN KEY (membership_id, organization_id)
    REFERENCES organization_memberships (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS organization_group_members_membership_idx ON organization_group_members (membership_id);

-- Gabarit d'équipe (concept partie 5 « Shared templates ») : propriétaire = l'organisation ; ses versions sont
-- immuables (déclencheur) ; une modification = une nouvelle version ; aucune application rétroactive.
CREATE TABLE IF NOT EXISTS organization_templates (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_templates_name_check CHECK (length(btrim(name)) > 0),
  CONSTRAINT organization_templates_status_check CHECK (status IN ('active', 'archive'))
);
CREATE TABLE IF NOT EXISTS organization_template_versions (
  id text PRIMARY KEY,
  template_id text NOT NULL REFERENCES organization_templates (id) ON DELETE CASCADE,
  version integer NOT NULL,
  content jsonb NOT NULL,
  note text,
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_template_versions_version_check CHECK (version >= 1),
  CONSTRAINT organization_template_versions_content_check CHECK (coalesce(jsonb_typeof(content -> 'entries'), '') = 'array'),
  CONSTRAINT organization_template_versions_unique UNIQUE (template_id, version)
);
CREATE OR REPLACE FUNCTION op_org_template_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'organization_template_version_immutable';
END $$;
CREATE OR REPLACE TRIGGER organization_template_versions_no_update BEFORE UPDATE ON organization_template_versions
  FOR EACH ROW EXECUTE FUNCTION op_org_template_version_immutable();

-- Application d'une version à un projet : tracée, une seule fois par (version, projet) — rejouer ne double rien.
CREATE TABLE IF NOT EXISTS organization_template_applications (
  id text PRIMARY KEY,
  template_version_id text NOT NULL REFERENCES organization_template_versions (id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  applied_by text REFERENCES users (id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT organization_template_applications_unique UNIQUE (template_version_id, project_id)
);

-- Mandat de représentation (concept parties 1, 2 et 5) : un membre représente l'organisation dans un projet où
-- l'organisation est partie (participation d'organisation). Proposé par un administrateur, accepté par le représentant
-- lui-même ; un remplacement est un NOUVEAU mandat accepté, jamais une substitution d'office. Le mandat ne donne aucun
-- droit de projet : l'accès du représentant reste une participation accordée par le projet.
CREATE TABLE IF NOT EXISTS organization_mandates (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  participation_id text NOT NULL REFERENCES project_participations (id) ON DELETE CASCADE,
  membership_id text NOT NULL,
  responsibilities text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'propose',
  starts_on date,
  ends_on date,
  end_reason text,
  replaces_mandate_id text REFERENCES organization_mandates (id) ON DELETE SET NULL,
  -- Note de l'administrateur au représentant (le nom d'un projet qu'il ne voit pas encore lui reste masqué).
  note text,
  proposed_by text REFERENCES users (id) ON DELETE SET NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  ended_at timestamptz,
  CONSTRAINT organization_mandates_membership_fk FOREIGN KEY (membership_id, organization_id)
    REFERENCES organization_memberships (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT organization_mandates_status_check CHECK (status IN ('propose', 'actif', 'refuse', 'annule', 'termine')),
  CONSTRAINT organization_mandates_ended_check CHECK ((status = 'termine') = (ended_at IS NOT NULL)),
  CONSTRAINT organization_mandates_period_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT organization_mandates_responsibilities_check
    CHECK (responsibilities <@ ARRAY['diriger', 'produire', 'coordonner', 'verifier', 'approuver', 'diffuser']::text[])
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_mandates_active ON organization_mandates (organization_id, project_id)
  WHERE status = 'actif';
CREATE UNIQUE INDEX IF NOT EXISTS organization_mandates_pending ON organization_mandates (organization_id, project_id, membership_id)
  WHERE status = 'propose';
CREATE INDEX IF NOT EXISTS organization_mandates_membership_idx ON organization_mandates (membership_id);

-- La participation d'un mandat est celle de l'organisation elle-même, dans ce projet (quel que soit le chemin d'écriture).
CREATE OR REPLACE FUNCTION op_org_mandate_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM project_participations
                  WHERE id = NEW.participation_id AND project_id = NEW.project_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'organization_mandate_participation_mismatch';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER organization_mandates_check BEFORE INSERT OR UPDATE OF participation_id, project_id, organization_id
  ON organization_mandates FOR EACH ROW EXECUTE FUNCTION op_org_mandate_check();

-- Départ (adhésion terminée) : les appartenances aux groupes sont retirées, les mandats actifs prennent fin et les
-- propositions en attente sont annulées — quel que soit le chemin d'écriture (départ, clôture de l'organisation).
-- Les participations de projet de la personne ne sont PAS modifiées (travail autorisé indépendamment, concept partie 2).
CREATE OR REPLACE FUNCTION op_org_membership_ended() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'terminee' AND OLD.status <> 'terminee' THEN
    DELETE FROM organization_group_members WHERE membership_id = NEW.id;
    UPDATE organization_mandates SET status = 'termine', ended_at = now(), ends_on = greatest(current_date, coalesce(starts_on, current_date)),
           end_reason = CASE WHEN NEW.end_reason = 'cloture' THEN 'cloture' ELSE 'depart' END
     WHERE membership_id = NEW.id AND status = 'actif';
    UPDATE organization_mandates SET status = 'annule', responded_at = now(),
           end_reason = CASE WHEN NEW.end_reason = 'cloture' THEN 'cloture' ELSE 'depart' END
     WHERE membership_id = NEW.id AND status = 'propose';
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER organization_memberships_ended AFTER UPDATE OF status ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION op_org_membership_ended();

-- Une adhésion terminée n'entre dans aucun groupe.
CREATE OR REPLACE FUNCTION op_org_group_member_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM organization_memberships WHERE id = NEW.membership_id AND status = 'terminee') THEN
    RAISE EXCEPTION 'organization_group_member_ended';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER organization_group_members_check BEFORE INSERT ON organization_group_members
  FOR EACH ROW EXECUTE FUNCTION op_org_group_member_check();

-- Clôture d'une organisation : définitive ; elle termine ses adhésions (et donc ses mandats, ci-dessus). Les
-- participations de projet et l'historique restent ; les projets dont elle est la partie propriétaire gardent la
-- déclaration (décision explicite de continuité attendue, concept partie 5).
CREATE OR REPLACE FUNCTION op_org_status_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'close' AND NEW.status <> 'close' THEN
    RAISE EXCEPTION 'organization_closed_final';
  END IF;
  IF NEW.status = 'close' AND OLD.status <> 'close' THEN
    UPDATE organization_memberships SET status = 'terminee', ends_on = greatest(current_date, starts_on), end_reason = 'cloture',
           updated_at = now()
     WHERE organization_id = NEW.id AND status <> 'terminee';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER organizations_status_change BEFORE UPDATE OF status ON organizations
  FOR EACH ROW EXECUTE FUNCTION op_org_status_change();

-- Organisation propriétaire facultative d'un projet (OP-D1 a) : la colonne réservée par D-3 reçoit sa clé étrangère
-- (NOT VALID : les lignes existantes, toutes nulles faute de logique, ne sont pas relues). Elle ne change aucun droit.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_organization_fk') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_organization_fk FOREIGN KEY (organization_id)
      REFERENCES organizations (id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- Invitation de finalité `organization_membership` (V22-02, PLAN § 7) : organisation, rôle et fonction proposés ; une
-- adhésion naît de son acceptation par l'identité visée. Ajout additif : les finalités existantes restent valides.
ALTER TABLE auth.invitations ADD COLUMN IF NOT EXISTS organization_id text REFERENCES public.organizations (id) ON DELETE CASCADE;
ALTER TABLE auth.invitations ADD COLUMN IF NOT EXISTS organization_role text;
ALTER TABLE auth.invitations ADD COLUMN IF NOT EXISTS organization_job_title text;
-- Finalité `review_package` (phase 4, revue externe) : l'affectation de revue visée. La colonne est posée ici, sans clé
-- étrangère (la table `review_assignments` est créée plus bas, bloc de la phase 4, qui ajoute la clé et la règle), pour
-- que l'index d'unicité ci-dessous la couvre dès la première application.
ALTER TABLE auth.invitations ADD COLUMN IF NOT EXISTS review_assignment_id text;
DO $$
BEGIN
  -- Bloc unique des finalités : chaque phase y ajoute la sienne (phase 5 : `organization_membership` ; phase 4 :
  -- `review_package`). Remplacé une seule fois par définition détectée, jamais deux remplacements concurrents.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_purpose_check'
                    AND pg_get_constraintdef(oid) LIKE '%organization_membership%'
                    AND pg_get_constraintdef(oid) LIKE '%review_package%') THEN
    ALTER TABLE auth.invitations DROP CONSTRAINT IF EXISTS invitations_purpose_check;
    ALTER TABLE auth.invitations ADD CONSTRAINT invitations_purpose_check
      CHECK (purpose IN ('platform_account', 'project_participation', 'organization_membership', 'review_package'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_organization_check') THEN
    ALTER TABLE auth.invitations ADD CONSTRAINT invitations_organization_check
      CHECK ((purpose = 'organization_membership') = (organization_id IS NOT NULL AND organization_role IN ('administrateur', 'membre')));
  END IF;
  -- Une invitation en attente par (adresse, finalité, projet, organisation, affectation de revue) : deux organisations,
  -- ou deux paquets de revue, peuvent inviter la même adresse. L'ancien index (sans organisation, ou sans affectation de
  -- revue) est remplacé une fois.
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'auth' AND indexname = 'invitations_pending_unique'
                AND (indexdef NOT LIKE '%organization_id%' OR indexdef NOT LIKE '%review_assignment_id%')) THEN
    DROP INDEX auth.invitations_pending_unique;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_unique
  ON auth.invitations (email, purpose, coalesce(project_id, ''), coalesce(organization_id, ''), coalesce(review_assignment_id, ''))
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Organisations, participation et revue externe — phase 4 : revue externe (concept, partie 4 ; OP-D5 a, OP-D6 a,
-- OP-D7 a, OP-D8 a, OP-D12). Un paquet de revue copie, au partage, le manifeste d'une publication Studio candidate et
-- range ses fichiers dans `volumes` (empreintes SHA-256 vérifiées) ; il ne se modifie plus ensuite : un changement est
-- une nouvelle version qui remplace l'ancienne. Une affectation de revue (relecture ou approbation, nominative) donne un
-- accès borné au seul paquet, évalué par les routes `/reviews` — jamais un rôle de projet : la participation d'un
-- destinataire externe ne porte aucun rôle (`project_role_assignments`) et n'ouvre donc aucun projet. Les constats sont
-- des observations Studio d'audience `revue` rattachées au paquet ; les notes internes ne sont jamais servies aux
-- destinataires. Règles pures : apps/api/src/lib/review-rules.ts. Additif et rejouable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_packages (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  publication_id text NOT NULL REFERENCES studio_publications (id) ON DELETE CASCADE,
  study_id text NOT NULL,
  variant_id text NOT NULL,
  -- Lignée : identifiant de la première version ; une nouvelle version porte le numéro suivant et désigne celle qu'elle
  -- remplace (une seule remplaçante par version).
  lineage_id text NOT NULL,
  version integer NOT NULL CONSTRAINT review_packages_version_check CHECK (version >= 1),
  supersedes_package_id text REFERENCES review_packages (id),
  title text NOT NULL CONSTRAINT review_packages_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  purpose text NOT NULL CONSTRAINT review_packages_purpose_check CHECK (length(btrim(purpose)) BETWEEN 1 AND 2000),
  expected_response text NOT NULL CONSTRAINT review_packages_expected_check CHECK (length(btrim(expected_response)) BETWEEN 1 AND 2000),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT review_packages_questions_check CHECK (jsonb_typeof(questions) = 'array'),
  coordinator_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  corrections_owner_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Date de réponse attendue : une échéance dépassée n'est jamais un accord.
  due_on date,
  status text NOT NULL DEFAULT 'brouillon'
    CONSTRAINT review_packages_status_check CHECK (status IN ('brouillon', 'partage', 'clos', 'remplace')),
  -- Copie figée au partage (jamais avant) : révision, empreinte du document, manifeste et son empreinte, fichiers.
  revision_id text,
  document_hash text,
  manifest jsonb,
  manifest_hash text,
  files jsonb,
  shared_at timestamptz,
  shared_by text REFERENCES users (id) ON DELETE RESTRICT,
  closed_at timestamptz,
  closed_by text REFERENCES users (id) ON DELETE RESTRICT,
  close_reason text,
  replaced_at timestamptz,
  replaced_by_package_id text,
  request_id text,
  created_by text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_packages_frozen_check CHECK (status = 'brouillon' OR (
    shared_at IS NOT NULL AND shared_by IS NOT NULL AND revision_id IS NOT NULL AND document_hash ~ '^[0-9a-f]{64}$'
    AND manifest IS NOT NULL AND manifest_hash ~ '^[0-9a-f]{64}$' AND jsonb_typeof(files) = 'array')),
  CONSTRAINT review_packages_closed_check CHECK ((status = 'clos') <= (closed_at IS NOT NULL)),
  CONSTRAINT review_packages_replaced_check CHECK ((status = 'remplace') = (replaced_by_package_id IS NOT NULL)),
  CONSTRAINT review_packages_version_unique UNIQUE (lineage_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS review_packages_supersedes_unique ON review_packages (supersedes_package_id)
  WHERE supersedes_package_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS review_packages_request_unique ON review_packages (project_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS review_packages_project_idx ON review_packages (project_id, created_at);
CREATE INDEX IF NOT EXISTS review_packages_publication_idx ON review_packages (publication_id);

-- Un paquet partagé ne se réécrit pas : seuls changent son statut (partage → clos | remplace, clos → remplace), sa
-- clôture, son remplacement, l'échéance, le coordinateur et le responsable des corrections (réaffectation tracée).
CREATE OR REPLACE FUNCTION review_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'brouillon' AND (
       NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.publication_id IS DISTINCT FROM OLD.publication_id
    OR NEW.lineage_id IS DISTINCT FROM OLD.lineage_id OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.supersedes_package_id IS DISTINCT FROM OLD.supersedes_package_id OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.expected_response IS DISTINCT FROM OLD.expected_response
    OR NEW.questions IS DISTINCT FROM OLD.questions OR NEW.revision_id IS DISTINCT FROM OLD.revision_id
    OR NEW.document_hash IS DISTINCT FROM OLD.document_hash OR NEW.manifest IS DISTINCT FROM OLD.manifest
    OR NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash OR NEW.files IS DISTINCT FROM OLD.files
    OR NEW.shared_at IS DISTINCT FROM OLD.shared_at OR NEW.shared_by IS DISTINCT FROM OLD.shared_by) THEN
    RAISE EXCEPTION 'review_package_frozen';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'brouillon' AND NEW.status = 'partage')
    OR (OLD.status = 'partage' AND NEW.status IN ('clos', 'remplace'))
    OR (OLD.status = 'clos' AND NEW.status = 'remplace')) THEN
    RAISE EXCEPTION 'review_package_invalid_transition';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER review_packages_guard BEFORE UPDATE ON review_packages
  FOR EACH ROW EXECUTE FUNCTION review_package_guard();
-- Anti-suppression : un paquet partagé (clos ou remplacé compris) reste lisible ; seul un brouillon s'efface. La
-- suppression du projet (cascade, ligne parente déjà effacée) n'est pas bloquée ici : la route la refuse avant.
CREATE OR REPLACE FUNCTION review_package_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'brouillon' AND EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id) THEN
    RAISE EXCEPTION 'review_package_undeletable';
  END IF;
  RETURN OLD;
END $$;
CREATE OR REPLACE TRIGGER review_packages_no_delete BEFORE DELETE ON review_packages
  FOR EACH ROW EXECUTE FUNCTION review_package_no_delete();

-- Destinataire nommé d'un paquet : participation (personne contact ou compte), responsabilité distincte (relecture ou
-- approbation, OP-D7 a), permissions explicites (OP-D8 a : consulter et commenter par défaut ; joindre, télécharger et
-- exporter seulement si accordés), expiration d'accès (distincte de l'échéance de réponse et de celle de l'invitation),
-- statut et résultat. Le compte n'est connu qu'après acceptation de l'invitation par l'identité visée.
CREATE TABLE IF NOT EXISTS review_assignments (
  id text PRIMARY KEY,
  package_id text NOT NULL REFERENCES review_packages (id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  participation_id text NOT NULL REFERENCES project_participations (id),
  person_id text NOT NULL REFERENCES people (id),
  user_id text REFERENCES users (id) ON DELETE RESTRICT,
  responsibility text NOT NULL CONSTRAINT review_assignments_responsibility_check CHECK (responsibility IN ('relecture', 'approbation')),
  can_view boolean NOT NULL DEFAULT true CONSTRAINT review_assignments_view_check CHECK (can_view),
  can_comment boolean NOT NULL DEFAULT true,
  can_attach boolean NOT NULL DEFAULT false,
  can_download boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  access_expires_at timestamptz NOT NULL,
  invitation_id text,
  status text NOT NULL DEFAULT 'en-attente'
    CONSTRAINT review_assignments_status_check CHECK (status IN ('en-attente', 'en-cours', 'terminee', 'annulee', 'remplacee')),
  result text CONSTRAINT review_assignments_result_value CHECK (result IS NULL OR result IN ('constats', 'satisfaisante')),
  response_note text CONSTRAINT review_assignments_note_check CHECK (response_note IS NULL OR length(response_note) BETWEEN 1 AND 4000),
  responded_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by text REFERENCES users (id) ON DELETE RESTRICT,
  revoke_reason text,
  carried_from_assignment_id text REFERENCES review_assignments (id),
  created_by text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Le résultat (constats / revue satisfaisante) est celui d'une relecture terminée ; l'approbation s'enregistre par les
  -- transitions Studio (aucun statut d'approbation concurrent). Une relecture terminée puis révoquée (`annulee`) garde
  -- son résultat : la révocation coupe l'accès sans effacer la réponse rendue.
  CONSTRAINT review_assignments_result_check CHECK (result IS NULL OR (responsibility = 'relecture' AND status IN ('terminee', 'remplacee', 'annulee'))),
  CONSTRAINT review_assignments_revoked_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL OR status = 'annulee'))
);
CREATE UNIQUE INDEX IF NOT EXISTS review_assignments_current_unique ON review_assignments (package_id, participation_id, responsibility)
  WHERE status NOT IN ('annulee', 'remplacee');
CREATE INDEX IF NOT EXISTS review_assignments_user_idx ON review_assignments (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS review_assignments_package_idx ON review_assignments (package_id);
-- Bases créées avant le correctif (revue Codex, PR #290) : la contrainte du résultat n'admettait pas `annulee`, si bien
-- qu'une relecture terminée ne pouvait plus être révoquée (transaction annulée, accès maintenu). Remplacée une seule fois,
-- reconnue à sa définition.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_assignments_result_check'
             AND conrelid = 'public.review_assignments'::regclass AND pg_get_constraintdef(oid) NOT LIKE '%annulee%') THEN
    ALTER TABLE review_assignments DROP CONSTRAINT review_assignments_result_check;
    ALTER TABLE review_assignments ADD CONSTRAINT review_assignments_result_check
      CHECK (result IS NULL OR (responsibility = 'relecture' AND status IN ('terminee', 'remplacee', 'annulee')));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_assignments_invitation_fk') THEN
    ALTER TABLE review_assignments ADD CONSTRAINT review_assignments_invitation_fk FOREIGN KEY (invitation_id)
      REFERENCES auth.invitations (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_review_assignment_fk') THEN
    ALTER TABLE auth.invitations ADD CONSTRAINT invitations_review_assignment_fk FOREIGN KEY (review_assignment_id)
      REFERENCES public.review_assignments (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_review_check') THEN
    ALTER TABLE auth.invitations ADD CONSTRAINT invitations_review_check
      CHECK ((purpose = 'review_package') = (review_assignment_id IS NOT NULL));
  END IF;
END $$;

-- Constats (OP-D6 a) : observations Studio d'audience `revue`, rattachées au paquet. L'audience admet `revue` (une
-- seule redéfinition, détectée) ; un fil `revue` porte son paquet, et lui seul.
ALTER TABLE studio_comments ADD COLUMN IF NOT EXISTS review_package_id text REFERENCES review_packages (id) ON DELETE CASCADE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_comments_audience_check'
                    AND pg_get_constraintdef(oid) LIKE '%revue%') THEN
    ALTER TABLE studio_comments DROP CONSTRAINT IF EXISTS studio_comments_audience_check;
    ALTER TABLE studio_comments ADD CONSTRAINT studio_comments_audience_check
      CHECK (audience IS NULL OR audience IN ('equipe', 'projet', 'revue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_comments_review_check') THEN
    ALTER TABLE studio_comments ADD CONSTRAINT studio_comments_review_check
      CHECK ((coalesce(audience, 'projet') = 'revue') = (review_package_id IS NOT NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS studio_comments_review_idx ON studio_comments (review_package_id) WHERE review_package_id IS NOT NULL;

-- Rattachement exact d'un constat : paquet, affectation, révision figée du paquet, document du paquet (format et
-- empreinte), pièces jointes (contenu rangé dans `volumes`, identifiant = SHA-256). Écrit une fois, jamais réécrit.
CREATE TABLE IF NOT EXISTS review_findings (
  observation_id text PRIMARY KEY REFERENCES studio_observations (comment_id) ON DELETE CASCADE,
  package_id text NOT NULL REFERENCES review_packages (id) ON DELETE CASCADE,
  assignment_id text REFERENCES review_assignments (id) ON DELETE SET NULL,
  revision_id text NOT NULL,
  document_format text CONSTRAINT review_findings_format_check CHECK (document_format IS NULL OR document_format IN ('svg', 'dxf', 'ifc', 'pdf')),
  document_digest text CONSTRAINT review_findings_digest_check CHECK (document_digest IS NULL OR document_digest ~ '^[0-9a-f]{64}$'),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT review_findings_attachments_check CHECK (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_findings_document_check CHECK ((document_format IS NULL) = (document_digest IS NULL))
);
CREATE INDEX IF NOT EXISTS review_findings_package_idx ON review_findings (package_id);
CREATE OR REPLACE FUNCTION review_finding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.observation_id IS DISTINCT FROM OLD.observation_id OR NEW.package_id IS DISTINCT FROM OLD.package_id
     OR NEW.revision_id IS DISTINCT FROM OLD.revision_id OR NEW.document_format IS DISTINCT FROM OLD.document_format
     OR NEW.document_digest IS DISTINCT FROM OLD.document_digest OR NEW.attachments IS DISTINCT FROM OLD.attachments
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'review_finding_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER review_findings_immutable BEFORE UPDATE ON review_findings
  FOR EACH ROW EXECUTE FUNCTION review_finding_immutable();

-- Notes internes de l'équipe sur un paquet : jamais servies par les routes `/reviews`, ni notifiées aux destinataires.
CREATE TABLE IF NOT EXISTS review_package_notes (
  id text PRIMARY KEY,
  package_id text NOT NULL REFERENCES review_packages (id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body text NOT NULL CONSTRAINT review_package_notes_body_check CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_package_notes_package_idx ON review_package_notes (package_id, created_at);

-- ---------------------------------------------------------------------------
-- Organisations, participation et revue externe — phase 2 (Issue #262) : bascule de l'accès (OP-D3 c), contacts,
-- clôture déclarative du projet et effacement des contacts sans compte (OP-D9, OP-2).
-- La décision d'accès a UNE source : la vue `project_effective_access` — le propriétaire (`projects.owner_id`), sinon
-- une participation `active`, commencée, d'une personne liée à ce compte, portant au moins un rôle métier à la portée
-- `projet` (une participation sans rôle de projet, « revue seule » de la phase 4, ne donne aucun accès). Concepteur →
-- modifier (rôle API `editeur`) ; tout autre rôle de projet → lire et commenter (`lecteur`) ; Approbateur et Diffuseur →
-- approbation et diffusion Studio ; export : concepteur, ou export accordé (`can_export`). Le miroir `acces` par
-- déclencheurs, conservé comme pont jusqu'au lot OP-PONT, est retiré (bloc « retrait du pont » plus bas).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW project_effective_access AS
SELECT p.id AS project_id, p.owner_id AS user_id, 'proprietaire'::text AS role, true AS can_export, true AS can_approve,
       true AS can_publish
  FROM projects p
UNION ALL
SELECT pp.project_id, pe.user_id,
       CASE WHEN bool_or(ra.role = 'concepteur') THEN 'editeur' ELSE 'lecteur' END,
       bool_or(ra.role = 'concepteur') OR bool_or(pp.can_export),
       bool_or(ra.role = 'approbateur'),
       bool_or(ra.role = 'diffuseur')
  FROM project_participations pp
  JOIN people pe ON pe.id = pp.person_id AND pe.user_id IS NOT NULL
  JOIN projects p ON p.id = pp.project_id AND p.owner_id <> pe.user_id
  JOIN project_role_assignments ra ON ra.participation_id = pp.id AND ra.scope_type = 'projet'
 WHERE pp.status = 'active' AND (pp.starts_on IS NULL OR pp.starts_on <= current_date)
   AND (pp.access_expires_at IS NULL OR pp.access_expires_at > now())
 GROUP BY pp.project_id, pe.user_id;

-- Clôture déclarative (OP-2) : ne change aucun droit ; elle date le départ du délai de conservation des contacts.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at timestamptz;
-- Effacement d'un contact sans compte (sur demande, ou 2 ans après la clôture de tous ses projets) : nom remplacé,
-- coordonnées supprimées, fiche et participations gardées comme trace sans donnée personnelle.
ALTER TABLE people ADD COLUMN IF NOT EXISTS erased_at timestamptz;
CREATE INDEX IF NOT EXISTS people_contacts_retention_idx ON people (id) WHERE user_id IS NULL AND erased_at IS NULL;
CREATE INDEX IF NOT EXISTS project_participations_org_idx ON project_participations (organization_id);
CREATE INDEX IF NOT EXISTS project_participations_represented_idx ON project_participations (represented_organization_id);

-- ---------------------------------------------------------------------------
-- Organisations, participation et revue externe — phase 3 (Issue #262, OP-D2 a) : toute participation active naît d'une
-- invitation ACCEPTÉE par l'identité visée, compte existant compris (fin de l'ajout direct UM-8). L'invitation de projet
-- désigne la participation visée (contact de l'annuaire, ou fiche créée à l'envoi) et les rôles proposés par portée ;
-- rien n'est accordé avant l'acceptation, qui lie le compte vérifié à la fiche, active la participation et pose les rôles
-- (lib/project-invitations-db.ts). `access_expires_at` (colonne UM-3 existante) est recopiée sur la participation à
-- l'acceptation et appliquée par la vue `project_effective_access` (ci-dessus). L'accès de base (lecteur / concepteur)
-- passait par le pont `op_sync_access` (phase-3.md) jusqu'au lot OP-PONT, qui l'écrit directement (lot-pont.md).
-- ---------------------------------------------------------------------------
ALTER TABLE auth.invitations ADD COLUMN IF NOT EXISTS participation_id text
  REFERENCES public.project_participations (id) ON DELETE SET NULL;
-- Rôles proposés : [{ "role", "scopeType", "scopeId" }] ; au moins un rôle de portée projet (contrôlé par l'API).
ALTER TABLE auth.invitations ADD COLUMN IF NOT EXISTS proposed_roles jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_participation_check') THEN
    ALTER TABLE auth.invitations ADD CONSTRAINT invitations_participation_check
      CHECK ((participation_id IS NULL AND proposed_roles IS NULL) OR purpose = 'project_participation');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_proposed_roles_check') THEN
    ALTER TABLE auth.invitations ADD CONSTRAINT invitations_proposed_roles_check
      CHECK (proposed_roles IS NULL OR jsonb_typeof(proposed_roles) = 'array');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS invitations_participation_idx ON auth.invitations (participation_id) WHERE participation_id IS NOT NULL;
-- Notification « invitation en attente » du compte visé : lecture par adresse des invitations en attente.
CREATE INDEX IF NOT EXISTS invitations_pending_email_idx ON auth.invitations (lower(email)) WHERE status = 'pending';
-- ---------------------------------------------------------------------------
-- Organisations, participation — reliquat de la phase 5 (Issue #262) : invitation de projet d'un REPRÉSENTANT MANDATÉ.
-- Le propriétaire du projet invite, depuis l'annuaire, le représentant d'un mandat actif d'une organisation partie au
-- projet ; l'invitation garde le mandat (`mandate_id`). Un mandat ne donne toujours aucun droit : seule l'acceptation par
-- l'identité visée active la participation, qui porte alors la partie représentée (`represented_organization_id` =
-- l'organisation du mandat). L'acceptation est refusée si le mandat n'est plus actif. Additif et rejouable.
-- ---------------------------------------------------------------------------
ALTER TABLE auth.invitations ADD COLUMN IF NOT EXISTS mandate_id text
  REFERENCES public.organization_mandates (id) ON DELETE SET NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_mandate_check') THEN
    ALTER TABLE auth.invitations ADD CONSTRAINT invitations_mandate_check
      CHECK (mandate_id IS NULL OR purpose = 'project_participation');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS invitations_mandate_idx ON auth.invitations (mandate_id) WHERE mandate_id IS NOT NULL;
-- ---------------------------------------------------------------------------
-- Organisations, participation — lot OP-PONT (Issue #262, autorisé par le maître d'ouvrage le 2026-10-25) : retrait du
-- pont `op_sync_access`. L'application écrit DIRECTEMENT participations et rôles (lib/project-access-db.ts : partage,
-- changement de rôle ou d'export, retrait, départ, transfert de propriété, invitations acceptées, anonymisation,
-- restauration d'archive, création de projet), dans la transaction de l'action et avec son journal. Le partage garde son
-- rôle d'origine `acces` (accès de base : Lecteur ou Concepteur, un seul par participation) ; `attribution` reste
-- l'affectation explicite. `project_members` devient une VUE DE COMPATIBILITÉ en lecture, dérivée des participations,
-- avec les mêmes colonnes, pour les lectures restantes (listes des membres, exports de données personnelles, archives,
-- notifications, Communication, simulation de migration R-MEMBRES…). Docs : lot-pont.md, RUNBOOK-deploiement.md § 9.
--
-- Une seule fois, sur une base qui porte encore la TABLE `project_members` (base neuve comprise : table vide créée plus
-- haut), dans la transaction unique de la migration. Règle : depuis la phase 2, les participations DÉCIDENT de l'accès ;
-- la table n'est plus la source que d'un partage qu'aucun miroir n'a jamais repris (base antérieure à la phase 1).
--  1. reprise : un partage lecteur / éditeur (hors propriétaire) SANS participation en cours reçoit personne,
--     participation active datée de son partage, export accordé (NULL d'archive = TRUE) et rôle `acces` — exactement
--     l'ancien miroir. Une participation en cours n'est JAMAIS modifiée (aucun rôle retiré n'est rendu, aucun export
--     changé, une suspension reste) : les écarts de dérive (écriture SQL directe) sont comptés et signalés ;
--  2. l'invitant (`invited_by`, libellé historique) et la date du partage (`created_at`) passent sur la participation
--     qui porte le partage (`access_granted_by`, `access_granted_at`) ; le `can_export` d'un éditeur, jamais consulté
--     (un éditeur exporte toujours), n'est pas repris ;
--  3. preuve dans la migration : (a) chaque accès effectif relevé avant le bloc existe encore, identique (rôle, export,
--     approbation, diffusion) ; (b) chaque partage repris ou déjà tenu par le miroir se retrouve À L'IDENTIQUE dans la
--     vue de compatibilité (rôle, export effectif, invitant, date). Sinon : exception, la migration entière est annulée
--     et rien n'est supprimé ;
--  4. déclencheurs et fonctions du miroir supprimés, table supprimée, vue créée.
-- Rejoué ensuite : la vue existe, rien n'est repris ni supprimé (seule la participation des propriétaires est réparée).
-- ---------------------------------------------------------------------------
ALTER TABLE project_participations ADD COLUMN IF NOT EXISTS access_granted_by text;
ALTER TABLE project_participations ADD COLUMN IF NOT EXISTS access_granted_at timestamptz;

DO $$
DECLARE
  r record;
  v_person text; v_part text;
  v_before text[];
  v_lost text[];
  v_missing text[];
  v_created integer := 0;
  v_gained integer;
  v_drift integer;
  v_ignored integer;
BEGIN
  IF coalesce((SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = 'project_members'), 'v') <> 'r' THEN
    RETURN;
  END IF;
  -- Plus aucune écriture par le miroir pendant le retrait.
  DROP TRIGGER IF EXISTS project_members_op_mirror ON project_members;
  DROP TRIGGER IF EXISTS projects_op_owner_mirror ON projects;
  -- Accès effectifs avant le retrait (la vue `project_effective_access` ne lit pas `project_members`).
  SELECT coalesce(array_agg(concat_ws('|', project_id, user_id, role, can_export, can_approve, can_publish) ORDER BY 1), '{}')
    INTO v_before FROM project_effective_access;
  -- 1. Reprise des partages qu'aucun miroir n'a repris (règle de l'ancien `op_sync_access`).
  FOR r IN
    SELECT m.project_id, m.user_id, m.role, m.can_export, m.created_at FROM project_members m
      JOIN projects p ON p.id = m.project_id AND p.owner_id <> m.user_id
      JOIN users u ON u.id = m.user_id
     WHERE m.role IN ('lecteur', 'editeur')
       AND NOT EXISTS (SELECT 1 FROM people pe JOIN project_participations pp ON pp.person_id = pe.id
                        WHERE pe.user_id = m.user_id AND pp.project_id = m.project_id AND pp.status <> 'terminee')
  LOOP
    INSERT INTO people (id, user_id) VALUES ('per_' || gen_random_uuid(), r.user_id) ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING;
    SELECT id INTO v_person FROM people WHERE user_id = r.user_id;
    v_part := 'ppa_' || gen_random_uuid();
    INSERT INTO project_participations (id, project_id, person_id, status, starts_on, can_export)
    VALUES (v_part, r.project_id, v_person, 'active', least(r.created_at::date, current_date), r.role = 'lecteur' AND coalesce(r.can_export, true));
    INSERT INTO project_role_assignments (id, participation_id, role, scope_type, origin)
    VALUES ('pra_' || gen_random_uuid(), v_part, CASE r.role WHEN 'lecteur' THEN 'lecteur' ELSE 'concepteur' END, 'projet', 'acces');
    v_created := v_created + 1;
  END LOOP;
  -- 2. Invitant et date du partage portés par la participation en cours qui porte le partage.
  UPDATE project_participations pp SET access_granted_by = m.invited_by, access_granted_at = m.created_at
    FROM project_members m JOIN people pe ON pe.user_id = m.user_id
   WHERE pp.project_id = m.project_id AND pp.person_id = pe.id AND pp.status <> 'terminee'
     AND EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.origin = 'acces' AND ra.scope_type = 'projet')
     AND (pp.access_granted_by IS DISTINCT FROM m.invited_by OR pp.access_granted_at IS DISTINCT FROM m.created_at);
  -- 3a. Aucun accès effectif perdu ni modifié.
  SELECT coalesce(array_agg(b ORDER BY b), '{}') INTO v_lost FROM unnest(v_before) b
   WHERE b NOT IN (SELECT concat_ws('|', project_id, user_id, role, can_export, can_approve, can_publish) FROM project_effective_access);
  IF cardinality(v_lost) > 0 THEN
    RAISE EXCEPTION 'OP-PONT : % accès effectif(s) perdu(s) ou modifié(s), rien n''est supprimé : %',
      cardinality(v_lost), array_to_string(v_lost[1:5], ', ');
  END IF;
  SELECT count(*) INTO v_gained FROM project_effective_access
   WHERE concat_ws('|', project_id, user_id, role, can_export, can_approve, can_publish) <> ALL (v_before);
  -- 3b. Chaque partage (lecteur / éditeur, hors propriétaire) dont la participation porte le rôle de partage du même rôle
  -- et le même export se retrouve à l'identique dans la vue de compatibilité (même requête que la vue, plus bas).
  WITH compat AS (
    SELECT pp.project_id, pe.user_id,
           CASE WHEN EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.origin = 'acces'
                              AND ra.scope_type = 'projet' AND ra.role = 'concepteur') THEN 'editeur' ELSE 'lecteur' END AS role,
           coalesce(pp.access_granted_by, '') AS invited_by, coalesce(pp.access_granted_at, pp.created_at) AS created_at, pp.can_export
      FROM project_participations pp
      JOIN people pe ON pe.id = pp.person_id AND pe.user_id IS NOT NULL
      JOIN projects p ON p.id = pp.project_id AND p.owner_id <> pe.user_id
     WHERE pp.status <> 'terminee'
       AND EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.origin = 'acces' AND ra.scope_type = 'projet')
  ), legacy AS (
    SELECT m.project_id, m.user_id, m.role, (m.role = 'editeur' OR coalesce(m.can_export, true)) AS exports, m.invited_by, m.created_at
      FROM project_members m JOIN projects p ON p.id = m.project_id AND p.owner_id <> m.user_id
     WHERE m.role IN ('lecteur', 'editeur')
  ), classified AS (
    SELECT l.*, c.role AS c_role, c.can_export AS c_export, c.invited_by AS c_by, c.created_at AS c_at FROM legacy l
      LEFT JOIN compat c ON c.project_id = l.project_id AND c.user_id = l.user_id
  )
  SELECT coalesce(array_agg(concat_ws('|', project_id, user_id, role) ORDER BY 1) FILTER (
           WHERE c_role = role AND (c_role = 'editeur' OR c_export) = exports AND (c_by IS DISTINCT FROM invited_by OR c_at IS DISTINCT FROM created_at)), '{}'),
         count(*) FILTER (WHERE c_role IS NULL OR c_role <> role OR (c_role = 'editeur' OR c_export) <> exports)
    INTO v_missing, v_drift FROM classified;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'OP-PONT : % partage(s) différent(s) dans la vue de compatibilité, rien n''est supprimé : %',
      cardinality(v_missing), array_to_string(v_missing[1:5], ', ');
  END IF;
  IF v_drift > 0 THEN
    -- Écart de dérive (écriture SQL directe) : la participation, qui décide de l'accès depuis la phase 2, est gardée
    -- telle quelle ; aucun accès n'est donné ni retiré (3a). Liste : RUNBOOK-deploiement.md § 9.2.
    RAISE NOTICE 'OP-PONT : % partage(s) dont la participation diffère de la ligne de partage (dérive) : participation conservée, accès inchangé', v_drift;
  END IF;
  SELECT count(*) INTO v_ignored FROM project_members m JOIN projects p ON p.id = m.project_id
   WHERE p.owner_id = m.user_id OR m.role NOT IN ('lecteur', 'editeur');
  IF v_ignored > 0 THEN
    -- Ligne du propriétaire ou rôle inconnu : l'ancien miroir n'en tirait aucun rôle, donc aucun accès ; rien ne change.
    RAISE NOTICE 'OP-PONT : % ligne(s) de partage sans accès de base (propriétaire ou rôle inconnu) non reprises', v_ignored;
  END IF;
  -- 4. Table remplacée par la vue (créée juste après ce bloc).
  DROP TABLE project_members;
  RAISE NOTICE 'OP-PONT : pont retiré ; % accès effectif(s) relevés avant, tous conservés ; % partage(s) repris, % accès complété(s)',
    cardinality(v_before), v_created, v_gained;
END $$;
-- Fonctions et déclencheurs du miroir supprimés (rejouable) ; dans un bloc DO : init.sql ne porte au premier niveau que
-- CREATE / ALTER / DO (contrôle du profil Studio V1, scripts/validation/studio-v1-profile.py).
DO $$
BEGIN
  DROP TRIGGER IF EXISTS projects_op_owner_mirror ON projects;
  DROP FUNCTION IF EXISTS op_projects_owner_mirror();
  DROP FUNCTION IF EXISTS op_project_members_mirror();
  DROP FUNCTION IF EXISTS op_sync_access(text, text, date);
END $$;

-- Vue de compatibilité (lecture seule : non modifiable par construction — jointures — et `fadi_app` n'y a que SELECT,
-- bloc D-7) : une ligne par partage en cours = participation non terminée d'un compte, hors propriétaire, portant le rôle
-- de partage (origine `acces`, portée projet). Rôle : `editeur` pour Concepteur, sinon `lecteur`. `can_export` : export
-- accordé à un lecteur (un éditeur exporte toujours). Comme l'ancienne table, elle liste aussi un partage suspendu ou
-- échu : la DÉCISION d'accès reste `project_effective_access`.
CREATE OR REPLACE VIEW project_members AS
SELECT pp.project_id, pe.user_id,
       CASE WHEN EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.origin = 'acces'
                          AND ra.scope_type = 'projet' AND ra.role = 'concepteur') THEN 'editeur' ELSE 'lecteur' END AS role,
       coalesce(pp.access_granted_by, '') AS invited_by,
       coalesce(pp.access_granted_at, pp.created_at) AS created_at,
       pp.can_export
  FROM project_participations pp
  JOIN people pe ON pe.id = pp.person_id AND pe.user_id IS NOT NULL
  JOIN projects p ON p.id = pp.project_id AND p.owner_id <> pe.user_id
 WHERE pp.status <> 'terminee'
   AND EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.origin = 'acces' AND ra.scope_type = 'projet');

-- Propriétaire : sa participation au projet (ancien déclencheur `projects_op_owner_mirror`) est désormais écrite par
-- l'application à la création, à l'import ou au transfert (`ensureOwnerParticipation`). Réparation idempotente d'un
-- projet créé hors de l'application (script, essai) : personne et participation active, sans rôle de partage.
DO $$
BEGIN
  INSERT INTO people (id, user_id)
  SELECT 'per_' || gen_random_uuid(), o.owner_id FROM (SELECT DISTINCT owner_id FROM projects) o
   WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = o.owner_id) AND NOT EXISTS (SELECT 1 FROM people pe WHERE pe.user_id = o.owner_id)
  ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING;
  UPDATE project_participations pp SET status = 'active', updated_at = now()
    FROM projects p JOIN people pe ON pe.user_id = p.owner_id
   WHERE pp.project_id = p.id AND pp.person_id = pe.id AND pp.status = 'contact';
  INSERT INTO project_participations (id, project_id, person_id, status, starts_on)
  SELECT 'ppa_' || gen_random_uuid(), p.id, pe.id, 'active', least(p.created_at::date, current_date)
    FROM projects p JOIN people pe ON pe.user_id = p.owner_id
   WHERE NOT EXISTS (SELECT 1 FROM project_participations pp WHERE pp.project_id = p.id AND pp.person_id = pe.id AND pp.status <> 'terminee');
END $$;

-- Communication (COM, Issue #280, docs/workstreams/communication/PLAN.md) — tables nouvelles, additif.
-- Une conversation appartient à un projet et porte une audience explicite : `participants` (personnes nommées),
-- `equipe` (propriétaire et éditeurs) ou `projet` (tous les membres). La lisibilité est recalculée à chaque requête
-- depuis l'accès courant au projet (lib/com-audience.ts) : rien ici n'accorde d'accès.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS com_conversations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  mode text NOT NULL CONSTRAINT com_conversations_mode_check CHECK (mode IN ('contexte', 'groupe', 'direct')),
  title text NOT NULL,
  audience text NOT NULL CONSTRAINT com_conversations_audience_check CHECK (audience IN ('participants', 'equipe', 'projet')),
  -- Contexte d'un fil contextuel : type, référence et révision exacte (R03 reste R03), jamais déplacés en silence.
  context_type text CONSTRAINT com_conversations_context_check
    CHECK (context_type IS NULL OR context_type IN ('projet', 'etape', 'document', 'fichier', 'studio-variante', 'revision-atelier')),
  context_ref text,
  context_revision text,
  steward_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_by text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT com_conversations_mode_audience CHECK (mode = 'contexte' OR audience = 'participants')
);
CREATE INDEX IF NOT EXISTS com_conversations_project_idx ON com_conversations (project_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS com_conversations_context_idx ON com_conversations (project_id, context_type, context_ref);

CREATE TABLE IF NOT EXISTS com_participants (
  conversation_id text NOT NULL REFERENCES com_conversations (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  added_by text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  -- Historique reçu (COM-D4) : NULL = tout l'historique ; sinon les messages à partir de cette date.
  history_from timestamptz,
  removed_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS com_participants_user_idx ON com_participants (user_id);

CREATE TABLE IF NOT EXISTS com_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES com_conversations (id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body text NOT NULL,
  nature text NOT NULL DEFAULT 'message' CONSTRAINT com_messages_nature_check CHECK (nature IN ('message', 'partage', 'action')),
  reply_to_id text REFERENCES com_messages (id) ON DELETE SET NULL,
  -- Références à des éléments du projet : type et identifiant seulement, libellés résolus à la lecture (COM-D8).
  refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  mentions text[] NOT NULL DEFAULT '{}',
  ack_required boolean NOT NULL DEFAULT false,
  urgent boolean NOT NULL DEFAULT false,
  -- Heure de capture déclarée par l'appareil (hors ligne), distincte de la réception par le serveur (`created_at`).
  captured_at timestamptz,
  client_request_id text,
  payload_hash text,
  -- Provenance d'un partage (serveur seul, jamais renvoyée à la cible) : conversation et messages source.
  shared_from jsonb,
  edited_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS com_messages_conversation_idx ON com_messages (conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS com_messages_request_unique ON com_messages (author_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS com_messages_mentions_idx ON com_messages USING gin (mentions);

-- Textes remplacés par une modification ou un retrait (COM-D6) : ajout seulement.
CREATE TABLE IF NOT EXISTS com_message_versions (
  id bigserial PRIMARY KEY,
  message_id text NOT NULL REFERENCES com_messages (id) ON DELETE CASCADE,
  body text NOT NULL,
  replaced_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CONSTRAINT com_message_versions_reason_check CHECK (reason IN ('modification', 'retrait'))
);

-- Ouverture et accusé de réception par personne (COM-R6 : ni revue, ni approbation).
CREATE TABLE IF NOT EXISTS com_receipts (
  message_id text NOT NULL REFERENCES com_messages (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS com_reads (
  conversation_id text NOT NULL REFERENCES com_conversations (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  last_read_at timestamptz NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

-- Journal d'une conversation : ajout seulement (aucune UPDATE ; les suppressions suivent la cascade du projet).
CREATE TABLE IF NOT EXISTS com_events (
  id bigserial PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES com_conversations (id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action text NOT NULL CONSTRAINT com_events_action_check CHECK (action IN (
    'creer', 'audience', 'participant-ajoute', 'participant-retire', 'animation', 'modification-message', 'retrait-message',
    'partage-envoye', 'partage-recu', 'action-liee')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS com_events_conversation_idx ON com_events (conversation_id, id);
CREATE OR REPLACE FUNCTION com_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'com_event_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER com_events_no_update BEFORE UPDATE ON com_events
  FOR EACH ROW EXECUTE FUNCTION com_event_immutable();
CREATE OR REPLACE TRIGGER com_message_versions_no_update BEFORE UPDATE ON com_message_versions
  FOR EACH ROW EXECUTE FUNCTION com_event_immutable();

-- Photos et épingles (lot COM-13, COM-D15 à COM-D19) — additif. Une photo est téléversée par son auteur dans une
-- conversation (JPEG ou PNG, 2 Mo et 2 560 px au plus, métadonnées retirées par le serveur), puis jointe à un message ;
-- tant qu'elle n'est pas jointe, seul son auteur la lit. Rejeu idempotent par (auteur, client_request_id).
CREATE TABLE IF NOT EXISTS com_pieces (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  conversation_id text NOT NULL REFERENCES com_conversations (id) ON DELETE CASCADE,
  message_id text REFERENCES com_messages (id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  mime text NOT NULL CONSTRAINT com_pieces_mime_check CHECK (mime IN ('image/jpeg', 'image/png')),
  size integer NOT NULL CONSTRAINT com_pieces_size_check CHECK (size > 0 AND size <= 2097152),
  width integer NOT NULL CONSTRAINT com_pieces_width_check CHECK (width > 0 AND width <= 2560),
  height integer NOT NULL CONSTRAINT com_pieces_height_check CHECK (height > 0 AND height <= 2560),
  -- Empreinte SHA-256 du contenu nettoyé (rejeu idempotent) ; le contenu est dans la ligne, aucun volume cité.
  empreinte text NOT NULL,
  content bytea NOT NULL,
  client_request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS com_pieces_message_idx ON com_pieces (message_id);
CREATE INDEX IF NOT EXISTS com_pieces_conversation_idx ON com_pieces (conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS com_pieces_request_unique ON com_pieces (author_id, client_request_id) WHERE client_request_id IS NOT NULL;
-- Épingle (point sur le plan d'une révision exacte d'une variante Studio, repère local, mètres) et position déclarée par
-- l'auteur (repère geographic, WGS84) : deux données distinctes, jamais converties l'une en l'autre (AGENTS.md).
ALTER TABLE com_messages ADD COLUMN IF NOT EXISTS epingle jsonb;
ALTER TABLE com_messages ADD COLUMN IF NOT EXISTS localisation jsonb;

-- Lien d'un message vers l'enregistrement de référence créé par une action liée (COM-R7) : l'état est relu à la source.
CREATE TABLE IF NOT EXISTS com_links (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES com_messages (id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  target_type text NOT NULL CONSTRAINT com_links_target_check CHECK (target_type IN ('demande', 'observation-studio')),
  target_id text NOT NULL,
  target_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS com_links_message_idx ON com_links (message_id);

-- Demandes de précision (Collaboration partagée, COM-D10) : question, références, demandeur, répondant tenu, échéance,
-- audience (E1), état et journal de réponse et de clôture. La question et les réponses ne sont jamais réécrites.
CREATE TABLE IF NOT EXISTS collab_demandes (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  question text NOT NULL,
  refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  requester_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  responder_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  echeance date,
  statut text NOT NULL DEFAULT 'ouverte' CONSTRAINT collab_demandes_statut_check CHECK (statut IN ('ouverte', 'repondue', 'close')),
  audience text NOT NULL DEFAULT 'equipe' CONSTRAINT collab_demandes_audience_check CHECK (audience IN ('equipe', 'projet')),
  source_message_id text REFERENCES com_messages (id) ON DELETE SET NULL,
  client_request_id text,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collab_demandes_project_idx ON collab_demandes (project_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS collab_demandes_request_unique ON collab_demandes (requester_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS collab_demande_events (
  id bigserial PRIMARY KEY,
  demande_id text NOT NULL REFERENCES collab_demandes (id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action text NOT NULL CONSTRAINT collab_demande_events_action_check CHECK (action IN ('ouvrir', 'repondre', 'cloturer', 'rouvrir', 'reattribuer')),
  body text,
  from_user text REFERENCES users (id) ON DELETE RESTRICT,
  to_user text REFERENCES users (id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collab_demande_events_demande_idx ON collab_demande_events (demande_id, id);
CREATE OR REPLACE TRIGGER collab_demande_events_no_update BEFORE UPDATE ON collab_demande_events
  FOR EACH ROW EXECUTE FUNCTION com_event_immutable();

-- ---------------------------------------------------------------------------
-- Temps réel (RTC-1, Issue #283, décisions RT-D3 à RT-D5) : sessions en direct sur le Studio. Une session n'est ni une
-- révision ni une approbation (RT-R3) : elle épingle une révision Studio (portée `studio-revision`) ou une publication
-- figée (portée `paquet-revue`), et son hôte n'en tire aucun droit (RT-R2). Présence, pointeurs et caméra ne sont jamais
-- enregistrés (RT-D5 § 9) ; seul le journal de session (ouverture, entrées, sorties, transferts, clôture) est gardé, en
-- ajout seul, avec le projet. Tables nouvelles, additives.
CREATE TABLE IF NOT EXISTS rt_sessions (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_type text NOT NULL CONSTRAINT rt_sessions_scope_check CHECK (scope_type IN ('studio-revision', 'paquet-revue')),
  study_id text NOT NULL,
  variant_id text NOT NULL,
  revision_id text NOT NULL,
  publication_id text REFERENCES studio_publications(id) ON DELETE CASCADE,
  title text NOT NULL CONSTRAINT rt_sessions_title_length CHECK (length(title) BETWEEN 1 AND 120),
  host_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  presenter_id text REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ouverte' CONSTRAINT rt_sessions_status_check CHECK (status IN ('ouverte', 'close', 'expiree')),
  request_id text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT rt_sessions_scope_publication CHECK ((scope_type = 'paquet-revue') = (publication_id IS NOT NULL)),
  CONSTRAINT rt_sessions_closed CHECK ((status = 'ouverte') = (closed_at IS NULL)),
  CONSTRAINT rt_sessions_variant_fk FOREIGN KEY (study_id, variant_id) REFERENCES studio_variants(study_id, id) ON DELETE CASCADE,
  CONSTRAINT rt_sessions_revision_fk FOREIGN KEY (variant_id, revision_id) REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS rt_sessions_project_idx ON rt_sessions (project_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rt_sessions_request_unique ON rt_sessions (project_id, created_by, request_id) WHERE request_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS rt_session_events (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES rt_sessions(id) ON DELETE CASCADE,
  action text NOT NULL CONSTRAINT rt_session_events_action_check
    CHECK (action IN ('ouvrir', 'rejoindre', 'quitter', 'presentateur', 'hote', 'reprendre', 'changer-revision', 'clore', 'expirer')),
  actor_id text REFERENCES users(id) ON DELETE RESTRICT,
  target_id text REFERENCES users(id) ON DELETE RESTRICT,
  revision_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rt_session_events_session_idx ON rt_session_events (session_id, created_at);
-- Journal en ajout seul : toute UPDATE est refusée (les suppressions suivent la cascade du projet).
CREATE OR REPLACE FUNCTION rt_session_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rt_session_event_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER rt_session_events_no_update BEFORE UPDATE ON rt_session_events
  FOR EACH ROW EXECUTE FUNCTION rt_session_event_immutable();

-- Temps réel RTC-3 : annotation enregistrée délibérément pendant une session. Le texte, l'auteur, l'audience, la
-- révision source et les objets cités restent ceux du commentaire Studio (même identifiant, promu en observation par
-- le circuit existant) ; cette ligne ajoute le point de vue (repères et unités déclarés) et la session d'origine. Elle
-- survit à la clôture de la session (aucune cascade depuis rt_sessions : SET NULL si la session disparaît).
CREATE TABLE IF NOT EXISTS rt_annotations (
  comment_id text PRIMARY KEY REFERENCES studio_comments(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  variant_id text NOT NULL,
  session_id text REFERENCES rt_sessions(id) ON DELETE SET NULL,
  source_revision_id text NOT NULL,
  viewpoint jsonb NOT NULL CONSTRAINT rt_annotations_viewpoint_object CHECK (jsonb_typeof(viewpoint) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rt_annotations_revision_fk FOREIGN KEY (variant_id, source_revision_id) REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS rt_annotations_variant_idx ON rt_annotations (variant_id, created_at);
CREATE INDEX IF NOT EXISTS rt_annotations_session_idx ON rt_annotations (session_id);
-- Temps réel RTC-4 : empreinte du manifeste de la publication à l'ouverture d'une revue. Une publication actualisée,
-- retirée ou remplacée ensuite est signalée à la lecture de la revue, qui reste sur la révision examinée.
ALTER TABLE rt_sessions ADD COLUMN IF NOT EXISTS publication_manifest_hash text;

-- ---------------------------------------------------------------------------
-- GeoData (9ᵉ module, ADR-GEODATA-01 et ADR-GEODATA-02, D-GD-02) : tables préfixées `geodata_`, AUCUNE clé ni colonne
-- vers les projets (GEO 04) ; seule l'identité des comptes (`users`) est référencée. Un espace personnel par compte
-- (création idempotente) ; cartes, collections, zones, analyses, imports et exports appartiennent à un espace. Versions
-- de données publiées immuables (déclencheurs) ; une version commune publiée n'est jamais effacée, seulement retirée avec
-- motif ; une valeur absente porte un motif et n'est jamais zéro (INV-06). Additif et rejouable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geodata_espaces (
  id text PRIMARY KEY,
  type text NOT NULL DEFAULT 'personnel' CHECK (type IN ('personnel', 'collectif')),
  proprietaire_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  nom text,
  etat text NOT NULL DEFAULT 'actif' CHECK (etat IN ('actif', 'archive')),
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS geodata_espaces_personnel_uniq ON geodata_espaces (proprietaire_id) WHERE type = 'personnel';
-- Membres d'un espace collectif (extension préparée, D-GD-09 : aucune action exposée en V1).
CREATE TABLE IF NOT EXISTS geodata_membres (
  espace_id text NOT NULL REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('lecteur', 'contributeur')),
  valide_jusqu_au timestamptz,
  PRIMARY KEY (espace_id, user_id)
);
-- Rôles GeoData à l'échelle du module (jamais déduits d'un rôle de projet ou de plateforme).
CREATE TABLE IF NOT EXISTS geodata_roles (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('gestionnaire-donnees', 'responsable-publication', 'administrateur')),
  attribue_par text REFERENCES users (id) ON DELETE SET NULL,
  attribue_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
-- Source : identité stable d'un jeu, indépendante de ses versions. `espace_id` nul = catalogue commun ; sinon import privé.
CREATE TABLE IF NOT EXISTS geodata_sources (
  id text PRIMARY KEY,
  cle text NOT NULL UNIQUE,
  espace_id text REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  titre text NOT NULL,
  producteur text NOT NULL,
  theme text NOT NULL,
  couverture text NOT NULL,
  description text NOT NULL DEFAULT '',
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS geodata_versions (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES geodata_sources (id),
  espace_id text REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  libelle text NOT NULL,
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  fichier_nom text,
  fichier_taille bigint,
  url_source text,
  recupere_le timestamptz,
  periode text,
  licence text NOT NULL,
  attribution text NOT NULL,
  droits jsonb NOT NULL,
  crs_source text NOT NULL,
  precision_donnees text,
  transformations jsonb NOT NULL DEFAULT '[]'::jsonb,
  controles jsonb NOT NULL DEFAULT '{}'::jsonb,
  synthetique boolean NOT NULL DEFAULT false,
  etat text NOT NULL DEFAULT 'preparation' CHECK (etat IN ('preparation', 'publiee', 'retiree')),
  preparee_par text REFERENCES users (id) ON DELETE SET NULL,
  preparee_le timestamptz NOT NULL DEFAULT now(),
  publiee_par text REFERENCES users (id) ON DELETE SET NULL,
  publiee_le timestamptz,
  retiree_le timestamptz,
  motif_retrait text,
  CONSTRAINT geodata_versions_retrait_motif CHECK (etat <> 'retiree' OR (motif_retrait IS NOT NULL AND length(btrim(motif_retrait)) >= 3))
);
CREATE INDEX IF NOT EXISTS geodata_versions_source_idx ON geodata_versions (source_id, etat);
CREATE TABLE IF NOT EXISTS geodata_couches (
  id text PRIMARY KEY,
  version_id text NOT NULL REFERENCES geodata_versions (id) ON DELETE CASCADE,
  titre text NOT NULL,
  description text NOT NULL DEFAULT '',
  type_geometrie text NOT NULL CHECK (type_geometrie IN ('polygone', 'ligne', 'point', 'mixte')),
  niveau text,
  proprietes_exposees jsonb NOT NULL DEFAULT '[]'::jsonb,
  style_defaut jsonb NOT NULL DEFAULT '{"mode":"simple","couleur":"#2b8cbe"}'::jsonb,
  emprise geometry(Polygon, 4326),
  nombre_objets integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS geodata_couches_version_idx ON geodata_couches (version_id);
-- Objets : géométrie de RÉFÉRENCE (WGS 84) ; les simplifications d'affichage sont calculées à la volée pour les tuiles,
-- jamais pour les calculs (INV-09). Code texte : les zéros initiaux sont conservés.
CREATE TABLE IF NOT EXISTS geodata_objets (
  id bigserial PRIMARY KEY,
  couche_id text NOT NULL REFERENCES geodata_couches (id) ON DELETE CASCADE,
  code text NOT NULL,
  nom text,
  niveau text,
  parent_code text,
  proprietes jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326) NOT NULL,
  geometrie_reparee boolean NOT NULL DEFAULT false,
  CONSTRAINT geodata_objets_code_uniq UNIQUE (couche_id, code)
);
CREATE INDEX IF NOT EXISTS geodata_objets_geom_idx ON geodata_objets USING gist (geom);
CREATE INDEX IF NOT EXISTS geodata_objets_nom_idx ON geodata_objets (couche_id, lower(nom));
CREATE TABLE IF NOT EXISTS geodata_indicateurs (
  id text PRIMARY KEY,
  couche_id text NOT NULL REFERENCES geodata_couches (id) ON DELETE CASCADE,
  titre text NOT NULL,
  unite text NOT NULL,
  periode text,
  nature text NOT NULL CHECK (nature IN ('source', 'calcule')),
  methode text NOT NULL,
  denominateur text,
  description text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS geodata_valeurs (
  indicateur_id text NOT NULL REFERENCES geodata_indicateurs (id) ON DELETE CASCADE,
  code text NOT NULL,
  valeur double precision,
  motif_absence text CHECK (motif_absence IN ('non-publiee', 'secret-statistique', 'hors-couverture', 'non-appariee', 'non-comparable', 'non-evaluee')),
  PRIMARY KEY (indicateur_id, code),
  CONSTRAINT geodata_valeurs_absence CHECK ((valeur IS NULL) <> (motif_absence IS NULL))
);
CREATE TABLE IF NOT EXISTS geodata_collections (
  id text PRIMARY KEY,
  espace_id text NOT NULL REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  nom text NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
  etat text NOT NULL DEFAULT 'active' CHECK (etat IN ('active', 'archivee')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geodata_collections_espace_uniq UNIQUE (id, espace_id)
);
-- Une carte et sa collection sont du même espace (clé composite) : aucun rattachement croisé.
CREATE TABLE IF NOT EXISTS geodata_cartes (
  id text PRIMARY KEY,
  espace_id text NOT NULL REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  proprietaire_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  nom text NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
  collection_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  etat text NOT NULL DEFAULT 'active' CHECK (etat IN ('active', 'archivee')),
  composition jsonb NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geodata_cartes_espace_uniq UNIQUE (id, espace_id),
  CONSTRAINT geodata_cartes_collection_fk FOREIGN KEY (collection_id, espace_id) REFERENCES geodata_collections (id, espace_id)
);
CREATE INDEX IF NOT EXISTS geodata_cartes_espace_idx ON geodata_cartes (espace_id, etat, modifie_le DESC);
CREATE TABLE IF NOT EXISTS geodata_zones (
  id text PRIMARY KEY,
  espace_id text NOT NULL REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  auteur_id text REFERENCES users (id) ON DELETE SET NULL,
  nature text NOT NULL CHECK (nature IN ('zone', 'annotation')),
  nom text NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
  texte text NOT NULL DEFAULT '' CHECK (length(texte) <= 2000),
  provenance text NOT NULL CHECK (provenance IN ('dessin', 'import', 'coordonnees')),
  provenance_detail text,
  crs text NOT NULL DEFAULT 'EPSG:4326' CHECK (crs = 'EPSG:4326'),
  geom geometry(Geometry, 4326) NOT NULL,
  geometrie_reparee boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  etat text NOT NULL DEFAULT 'active' CHECK (etat IN ('active', 'archivee')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geodata_zones_espace_uniq UNIQUE (id, espace_id)
);
CREATE INDEX IF NOT EXISTS geodata_zones_geom_idx ON geodata_zones USING gist (geom);
-- Analyses : entrées FIGÉES (géométrie copiée, révision de la zone, version de la couche, méthode) ; immuables. Recalculer
-- crée une nouvelle analyse (GEO 10).
CREATE TABLE IF NOT EXISTS geodata_analyses (
  id text PRIMARY KEY,
  espace_id text NOT NULL REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  auteur_id text REFERENCES users (id) ON DELETE SET NULL,
  zone_id text NOT NULL,
  zone_revision integer NOT NULL,
  geom_entree geometry(Geometry, 4326) NOT NULL,
  couche_id text NOT NULL,
  version_id text NOT NULL REFERENCES geodata_versions (id),
  methode text NOT NULL,
  version_methode text NOT NULL,
  parametres jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultat jsonb NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geodata_analyses_zone_fk FOREIGN KEY (zone_id, espace_id) REFERENCES geodata_zones (id, espace_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS geodata_analyses_espace_idx ON geodata_analyses (espace_id, cree_le DESC);
CREATE TABLE IF NOT EXISTS geodata_imports (
  id text PRIMARY KEY,
  espace_id text NOT NULL REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  demandeur_id text REFERENCES users (id) ON DELETE SET NULL,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 8 AND 80),
  etat text NOT NULL CHECK (etat IN ('valide', 'rejete', 'confirme', 'annule', 'expire')),
  nom_fichier text NOT NULL,
  taille integer NOT NULL,
  empreinte text NOT NULL,
  rapport jsonb NOT NULL,
  contenu jsonb,
  version_id text REFERENCES geodata_versions (id) ON DELETE SET NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL,
  CONSTRAINT geodata_imports_request_uniq UNIQUE (espace_id, request_id)
);
CREATE TABLE IF NOT EXISTS geodata_exports (
  id text PRIMARY KEY,
  espace_id text NOT NULL REFERENCES geodata_espaces (id) ON DELETE CASCADE,
  demandeur_id text REFERENCES users (id) ON DELETE SET NULL,
  carte_id text NOT NULL,
  carte_revision integer NOT NULL,
  composition jsonb NOT NULL,
  etat text NOT NULL CHECK (etat IN ('autorise', 'refuse')),
  refus jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributions jsonb NOT NULL DEFAULT '[]'::jsonb,
  fiche_html text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL,
  CONSTRAINT geodata_exports_carte_fk FOREIGN KEY (carte_id, espace_id) REFERENCES geodata_cartes (id, espace_id) ON DELETE CASCADE
);
-- Journal GeoData : acteur, action, ressource, résultat — ni secret, ni coordonnées (D-GD-10).
CREATE TABLE IF NOT EXISTS geodata_journal (
  id bigserial PRIMARY KEY,
  acteur_id text REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL,
  ressource text,
  resultat text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geodata_journal_le_idx ON geodata_journal (le DESC);

-- Immuabilité d'une version hors préparation (INV-07) : seul le retrait (etat, date, motif) reste possible ; une version
-- commune publiée ou retirée ne s'efface pas (une version privée part avec son espace).
CREATE OR REPLACE FUNCTION geodata_version_immuable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.etat <> 'preparation' AND OLD.espace_id IS NULL THEN RAISE EXCEPTION 'geodata_version_publiee_non_effacable'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.etat = 'preparation' THEN RETURN NEW; END IF;
  IF OLD.etat = 'retiree' THEN RAISE EXCEPTION 'geodata_version_immuable'; END IF;
  IF NEW.etat <> 'retiree' OR (to_jsonb(NEW) - ARRAY['etat', 'retiree_le', 'motif_retrait']) <> (to_jsonb(OLD) - ARRAY['etat', 'retiree_le', 'motif_retrait']) THEN
    RAISE EXCEPTION 'geodata_version_immuable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER geodata_versions_immuables BEFORE UPDATE OR DELETE ON geodata_versions
  FOR EACH ROW EXECUTE FUNCTION geodata_version_immuable();
-- Contenu d'une version (couches, objets, indicateurs, valeurs) figé dès qu'elle n'est plus en préparation.
-- Couches raster (D-GD-13) : type de couche « raster » et grille de valeurs (Float32 petit-boutiste compressé par deflate),
-- figée comme les objets une fois la version sortie de préparation.
ALTER TABLE geodata_couches DROP CONSTRAINT IF EXISTS geodata_couches_type_geometrie_check;
ALTER TABLE geodata_couches ADD CONSTRAINT geodata_couches_type_geometrie_check CHECK (type_geometrie IN ('polygone', 'ligne', 'point', 'mixte', 'raster'));
CREATE TABLE IF NOT EXISTS geodata_rasters (
  couche_id text PRIMARY KEY REFERENCES geodata_couches (id) ON DELETE CASCADE,
  largeur integer NOT NULL CHECK (largeur > 0),
  hauteur integer NOT NULL CHECK (hauteur > 0),
  ouest double precision NOT NULL,
  sud double precision NOT NULL,
  est double precision NOT NULL,
  nord double precision NOT NULL,
  nodata double precision,
  valeurs bytea NOT NULL,
  description jsonb NOT NULL,
  CHECK (largeur::bigint * hauteur <= 4000000 AND est > ouest AND nord > sud)
);
-- Catégories du catalogue (D-GD-14) : communes à tous les comptes, gérées par un gestionnaire de données (créer, renommer,
-- ordonner, supprimer) ; une source y est rangée explicitement, sinon par les thèmes déclarés de la catégorie, sinon
-- « Autres ». Les catégories initiales (modèle `CATEGORIES_CATALOGUE`) sont semées une seule fois par l'API, à la
-- première lecture (repère geodata_reglages) : une base neuve reste vide et une catégorie supprimée ne réapparaît pas.
CREATE TABLE IF NOT EXISTS geodata_categories (
  id text PRIMARY KEY,
  libelle text NOT NULL CHECK (char_length(libelle) BETWEEN 2 AND 80),
  ordre integer NOT NULL DEFAULT 0,
  themes text[] NOT NULL DEFAULT '{}',
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS geodata_categories_libelle_idx ON geodata_categories (lower(libelle));
CREATE TABLE IF NOT EXISTS geodata_categories_sources (
  source_id text PRIMARY KEY REFERENCES geodata_sources (id) ON DELETE CASCADE,
  categorie_id text NOT NULL REFERENCES geodata_categories (id) ON DELETE CASCADE,
  affectee_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geodata_categories_sources_categorie_idx ON geodata_categories_sources (categorie_id);
CREATE TABLE IF NOT EXISTS geodata_reglages (
  cle text PRIMARY KEY,
  valeur jsonb NOT NULL DEFAULT 'true'::jsonb,
  le timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION geodata_contenu_fige() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  IF TG_TABLE_NAME = 'geodata_couches' THEN
    SELECT etat INTO v FROM geodata_versions WHERE id = NEW.version_id;
  ELSIF TG_TABLE_NAME = 'geodata_objets' OR TG_TABLE_NAME = 'geodata_indicateurs' OR TG_TABLE_NAME = 'geodata_rasters' THEN
    SELECT ve.etat INTO v FROM geodata_couches c JOIN geodata_versions ve ON ve.id = c.version_id WHERE c.id = NEW.couche_id;
  ELSE
    SELECT ve.etat INTO v FROM geodata_indicateurs i JOIN geodata_couches c ON c.id = i.couche_id JOIN geodata_versions ve ON ve.id = c.version_id WHERE i.id = NEW.indicateur_id;
  END IF;
  IF v IS DISTINCT FROM 'preparation' THEN RAISE EXCEPTION 'geodata_contenu_fige'; END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER geodata_couches_figees BEFORE INSERT OR UPDATE ON geodata_couches FOR EACH ROW EXECUTE FUNCTION geodata_contenu_fige();
CREATE OR REPLACE TRIGGER geodata_objets_figes BEFORE INSERT OR UPDATE ON geodata_objets FOR EACH ROW EXECUTE FUNCTION geodata_contenu_fige();
CREATE OR REPLACE TRIGGER geodata_indicateurs_figes BEFORE INSERT OR UPDATE ON geodata_indicateurs FOR EACH ROW EXECUTE FUNCTION geodata_contenu_fige();
CREATE OR REPLACE TRIGGER geodata_valeurs_figees BEFORE INSERT OR UPDATE ON geodata_valeurs FOR EACH ROW EXECUTE FUNCTION geodata_contenu_fige();
CREATE OR REPLACE TRIGGER geodata_rasters_figes BEFORE INSERT OR UPDATE ON geodata_rasters FOR EACH ROW EXECUTE FUNCTION geodata_contenu_fige();
CREATE OR REPLACE FUNCTION geodata_analyse_immuable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'geodata_analyse_immuable';
END;
$$;
CREATE OR REPLACE TRIGGER geodata_analyses_immuables BEFORE UPDATE ON geodata_analyses FOR EACH ROW EXECUTE FUNCTION geodata_analyse_immuable();
-- Lot CMD (achèvement de Studio, 25/10/2026) : contexte d'étude (IF-001), jobs serveur (EX-088, EX-045), journal des
-- changements de révision (IF-011, EX-010), migrations de schéma simulées / accordées / retirées (EX-019, EX-091) et
-- chemin d'écriture unique Atelier → Studio (MIG-COEX-06). Tables nouvelles, additives : aucune ligne existante réécrite.
-- Contexte validé d'une étude : site (parcelles et révisions), sources (pièces d'étape), version du contrat.
CREATE TABLE IF NOT EXISTS studio_study_contexts (
  study_id text PRIMARY KEY REFERENCES studio_studies(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version text NOT NULL CONSTRAINT studio_study_contexts_version_check CHECK (version = 'studio-contexte-etude/1'),
  context jsonb NOT NULL CONSTRAINT studio_study_contexts_context_object CHECK (jsonb_typeof(context) = 'object'),
  validated_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  validated_at timestamptz NOT NULL DEFAULT now()
);
-- Jobs serveur Studio : essai de commandes (prévisualisation à portée de révision, recalcul exact compris) et
-- simulation de migration. Le résultat est lu sous l'autorisation de l'étude source (EX-088).
CREATE TABLE IF NOT EXISTS studio_jobs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  variant_id text REFERENCES studio_variants(id) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT studio_jobs_kind_check CHECK (kind IN ('essai-commandes', 'simulation-migration')),
  status text NOT NULL CONSTRAINT studio_jobs_status_check CHECK (status IN ('en-calcul', 'termine', 'echec', 'abandonne', 'confirme')),
  source_revision_id text,
  payload jsonb,
  payload_hash text CONSTRAINT studio_jobs_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_jobs_study_idx ON studio_jobs(study_id, created_at);
-- Journal des changements de révision (IF-011) : un événement par révision engagée, écrit dans la MÊME transaction que
-- la révision (rien n'existe si elle échoue) ; `xact_id` = transaction PostgreSQL, `created_at` = horloge du serveur.
CREATE TABLE IF NOT EXISTS studio_revision_events (
  event_id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES studio_variants(id) ON DELETE CASCADE,
  revision_id text NOT NULL,
  base_revision_id text,
  transaction_id text NOT NULL,
  xact_id text NOT NULL DEFAULT (txid_current()::text),
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id text,
  effects jsonb NOT NULL,
  job_id text REFERENCES studio_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_revision_events_revision_unique UNIQUE(variant_id, revision_id),
  CONSTRAINT studio_revision_events_revision_same_variant FOREIGN KEY(variant_id, revision_id)
    REFERENCES studio_revisions(variant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS studio_revision_events_variant_idx ON studio_revision_events(variant_id, created_at);
CREATE OR REPLACE FUNCTION studio_revision_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'studio_revision_event_immutable';
END;
$$;
CREATE OR REPLACE TRIGGER studio_revision_events_no_update BEFORE UPDATE ON studio_revision_events
  FOR EACH ROW EXECUTE FUNCTION studio_revision_event_immutable();
-- Migrations de schéma d'une étude (EX-091) : simulée → accordée (propriétaire) → appliquée (copies migrées des
-- révisions, sources /1 intactes) → retour arrière (copies retirées) ; point de retour = têtes des variantes.
CREATE TABLE IF NOT EXISTS studio_migrations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES studio_jobs(id) ON DELETE CASCADE,
  target_schema text NOT NULL CONSTRAINT studio_migrations_target_check CHECK (target_schema = 'studio-document/2'),
  status text NOT NULL CONSTRAINT studio_migrations_status_check CHECK (status IN ('simulee', 'accordee', 'appliquee', 'retour-arriere')),
  rollback_point jsonb NOT NULL,
  verdict text NOT NULL,
  agreed_by text REFERENCES users(id) ON DELETE RESTRICT,
  agreed_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_migrations_study_idx ON studio_migrations(study_id, created_at);
CREATE TABLE IF NOT EXISTS studio_document_migrations (
  migration_id text NOT NULL REFERENCES studio_migrations(id) ON DELETE CASCADE,
  revision_id text NOT NULL REFERENCES studio_revisions(id) ON DELETE CASCADE,
  schema_version text NOT NULL CONSTRAINT studio_document_migrations_schema_check CHECK (schema_version = 'studio-document/2'),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (migration_id, revision_id)
);
-- Chemin d'écriture unique d'une bascule Atelier → Studio (MIG-COEX-06) : par projet, l'étude qui reçoit le modèle
-- Atelier et l'autorité d'écriture courante ('atelier' ou 'studio'). L'orchestrateur commun refuse toute écriture de
-- l'autre chaîne ; la consultation historique (lectures) reste ouverte aux deux. Historique des passages en ajout seul.
CREATE TABLE IF NOT EXISTS studio_bascules (
  project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  study_id text NOT NULL REFERENCES studio_studies(id) ON DELETE CASCADE,
  authority text NOT NULL CONSTRAINT studio_bascules_authority_check CHECK (authority IN ('atelier', 'studio')),
  rollback_point jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT studio_bascules_history_array CHECK (jsonb_typeof(history) = 'array'),
  updated_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Lot OP-AUTOCONTROLE (décision OP-6 du 2026-10-25) : séparation des responsabilités. Option « Auto-contrôle » du
-- compte, changée par l'administration de la plateforme : TRUE (par défaut) = la personne peut approuver un dossier
-- qu'elle a produit ou soumis, l'approbation est alors marquée ; FALSE = l'API refuse cette approbation (422).
-- Marque d'une approbation : NULL = approuvée avant ce lot (rien n'est re-marqué, aucune rétroactivité) ou non
-- approuvée. Colonnes additives, hors manifeste et hors paquet : aucune empreinte ne change.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS self_control_allowed boolean NOT NULL DEFAULT true;
ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS approved_self_control boolean;
-- Évènement `approuver` du journal append-only : marque figée au moment de l'approbation (NULL pour les autres actions
-- et pour les approbations antérieures au lot).
ALTER TABLE studio_publication_events ADD COLUMN IF NOT EXISTS self_control boolean;

-- ---------------------------------------------------------------------------
-- D-7 : droits au moindre privilège. Exécuté par un super-utilisateur (amorçage, CI) : propriété de tout transférée à
-- `fadi_owner` ; exécuté par `fadi_migrator` (membre de `fadi_owner`) : droits rejoués ; sinon, simple avis (rôles non
-- provisionnés : rien n'est changé). `fadi_app` : lecture / écriture des tables, aucun DDL, journal d'audit en lecture et
-- ajout seulement ; `fadi_retention` : anonymisation de colonnes du journal ; `fadi_backup` : lecture seule.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  su boolean := (SELECT rolsuper FROM pg_roles WHERE rolname = current_user);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_owner') THEN
    RAISE NOTICE 'D-7 : rôles fadi_* absents, droits inchangés (voir RUNBOOK.md)';
    RETURN;
  END IF;
  IF su THEN
    FOR r IN
      SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('public', 'auth', 'admin') AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('e', 'a', 'i'))
         AND pg_get_userbyid(c.relowner) <> 'fadi_owner'
    LOOP
      EXECUTE format('ALTER %s %I.%I OWNER TO fadi_owner',
        CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.nspname, r.relname);
    END LOOP;
    FOR r IN
      SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname IN ('public', 'admin', 'auth') AND pg_get_userbyid(p.proowner) <> 'fadi_owner'
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
      EXECUTE format('ALTER FUNCTION %s OWNER TO fadi_owner', r.f);
    END LOOP;
    ALTER SCHEMA auth OWNER TO fadi_owner;
    ALTER SCHEMA admin OWNER TO fadi_owner;
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE, CREATE ON SCHEMA public TO fadi_owner;
    ALTER ROLE fadi_app SET search_path = public, auth, admin;
    ALTER ROLE fadi_migrator SET search_path = public, auth, admin;
  ELSIF NOT pg_has_role(current_user, 'fadi_owner', 'MEMBER') THEN
    RAISE NOTICE 'D-7 : % n''est ni super-utilisateur ni membre de fadi_owner, droits inchangés', current_user;
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA public, auth, admin TO fadi_app, fadi_retention, fadi_backup;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, auth, admin TO fadi_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, auth, admin TO fadi_app;
  REVOKE UPDATE, DELETE, TRUNCATE ON admin.audit_log FROM fadi_app;
  REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public, auth, admin FROM fadi_app;
  -- Lot OP-PONT : `project_members` est une vue de compatibilité en LECTURE ; le partage s'écrit dans les participations.
  REVOKE INSERT, UPDATE, DELETE ON public.project_members FROM fadi_app;
  REVOKE ALL ON ALL TABLES IN SCHEMA public, auth, admin FROM fadi_retention;
  GRANT SELECT ON admin.audit_log TO fadi_retention;
  GRANT UPDATE (actor_id, ip, metadata) ON admin.audit_log TO fadi_retention;
  GRANT SELECT ON ALL TABLES IN SCHEMA public, auth, admin TO fadi_backup;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, auth, admin TO fadi_backup;
  ALTER DEFAULT PRIVILEGES FOR ROLE fadi_owner IN SCHEMA public, auth, admin GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fadi_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE fadi_owner IN SCHEMA public, auth, admin GRANT USAGE, SELECT ON SEQUENCES TO fadi_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE fadi_owner IN SCHEMA public, auth, admin GRANT SELECT ON TABLES TO fadi_backup;
END $$;
