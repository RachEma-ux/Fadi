/**
 * Schéma Drizzle — PostgreSQL + PostGIS.
 *
 * `parcelFootprint` est le seul endroit où la base de données connaît une
 * géométrie spatiale réelle (polygone en coordonnées géographiques WGS84,
 * SRID 4326) : c'est la donnée cadastrale/géographique d'entrée, utile pour
 * des requêtes spatiales (recouvrement de parcelles, recherche par zone).
 * La géométrie du bâtiment (murs, niveaux, prismes — repère local) N'EST PAS
 * stockée comme géométrie PostGIS : elle n'a pas de sens hors de son projet,
 * elle est manipulée par `@parcours/core-geometry` et persistée comme JSON
 * typé par `@parcours/domain-model`. Mélanger les deux serait exactement
 * l'erreur de repères que `docs/architecture.md` interdit.
 */
import { customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Colonne PostGIS brute : on ne fait pas transiter la géométrie par du JS côté serveur, on la laisse en WKT/EWKT et on laisse Postgres faire le travail spatial. */
const geography = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Polygon, 4326)";
  },
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("sessions_user_id_idx").on(t.userId)]);

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  /** Révision courante du modèle (voir `Revisioned` dans @parcours/domain-model). Incrémentée à chaque commande appliquée. */
  modelRevision: integer("model_revision").notNull().default(0),
  /** Polygone de la parcelle en WGS84, nullable tant que la parcelle n'a pas été localisée. */
  parcelFootprint: geography("parcel_footprint"),
  /** Identifiant de l'exemple importé (apps/api/src/data/examples), null pour un projet créé de toutes pièces. Traçabilité de la provenance, jamais effacée. */
  sourceExampleId: text("source_example_id"),
  /** Données annexes de l'exemple importé (faits, critères, hypothèses, données de zone) — non structurées dans le modèle de domaine, conservées telles quelles pour consultation. */
  sourceAttachment: jsonb("source_attachment").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("projects_owner_id_idx").on(t.ownerId)]);

/**
 * Contenu réel d'une étape du Parcours pour un projet donné. La définition
 * générique de l'étape (titre, phase, propositions Harmonie) vit dans
 * `apps/api/src/data/parcours-steps.json`, pas en base — seul ce qui est
 * propre à CE projet (statut, décision retenue, justification) est persisté
 * ici. Une ligne par étape et par projet, créée dès la création du projet
 * (21 lignes, jamais plus, jamais moins).
 */
export const projectSteps = pgTable("project_steps", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  status: text("status").notNull().default("a-faire"),
  content: jsonb("content").notNull().$type<Record<string, unknown>>(),
}, (t) => [
  uniqueIndex("project_steps_project_id_step_number_unique").on(t.projectId, t.stepNumber),
  index("project_steps_project_id_idx").on(t.projectId),
]);

export const levels = pgTable("levels", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  /** Élévation du niveau, mètres, repère local du bâtiment. */
  elevation: integer("elevation").notNull().default(0),
  position: integer("position").notNull().default(0),
}, (t) => [index("levels_project_id_idx").on(t.projectId)]);

/**
 * Un objet architectural au sens de @parcours/domain-model
 * (`ArchitecturalObject`) : mur, porte, fenêtre, colonne, escalier…
 * `properties` et `relations` sont stockés tels quels (JSON), le serveur ne
 * connaît pas le détail de chaque `kind` — ce n'est pas son rôle.
 */
export const architecturalObjects = pgTable("architectural_objects", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull().references(() => levels.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  properties: jsonb("properties").notNull().$type<Record<string, unknown>>(),
  relations: jsonb("relations").notNull().$type<{ kind: string; targetId: string }[]>(),
  modelRevision: integer("model_revision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("architectural_objects_level_id_idx").on(t.levelId)]);
