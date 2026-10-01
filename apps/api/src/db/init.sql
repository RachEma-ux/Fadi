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

CREATE TABLE IF NOT EXISTS levels (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  label text NOT NULL,
  elevation integer NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0
);
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
