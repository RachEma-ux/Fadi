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
import { boolean, customType, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  /** Dernière consultation des notifications dans l'application (les plus récentes sont « non lues ») ; null tant qu'aucune n'a été consultée. */
  notificationsSeenAt: timestamp("notifications_seen_at", { withTimezone: true }),
  /** Nom affiché (accueil « Bonjour … », initiales de l'avatar) ; facultatif, saisi dans Paramètres — jamais déduit d'ailleurs que de la saisie. */
  displayName: text("display_name"),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("sessions_user_id_idx").on(t.userId)]);

import type { SiteContextDeclaration } from "@parcours/domain-model";

export interface EditingLock {
  userId: string;
  email: string;
  since: string;
  expiresAt: string;
}

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
  /** Exemple résolu importé : `reference` (présentation protégée du prototype, « Essayer une autre répartition en copie ») ou `editable` (copie de travail). Null pour un projet ordinaire. */
  exampleMode: text("example_mode").$type<"reference" | "editable" | null>(),
  /** Verrou d'édition optionnel (« un seul éditeur actif ») : qui l'a réservé et jusqu'à quand ; null = libre. Expiré, il est ignoré. */
  editingLock: jsonb("editing_lock").$type<EditingLock | null>(),
  /** Données annexes de l'exemple importé (faits, critères, hypothèses, données de zone) — non structurées dans le modèle de domaine, conservées telles quelles pour consultation. */
  sourceAttachment: jsonb("source_attachment").$type<Record<string, unknown> | null>(),
  /** L'outil Parcelle a-t-il déjà enregistré (ou supprimé) une parcelle ? (`initialized` de son API : sans parcelle ET non initialisé, il propose sa parcelle d'exemple.) */
  parcelsInitialized: boolean("parcels_initialized").notNull().default(false),
  /** Dernière transmission de la parcelle (étape 01) vers le modèle : statut, motif, signature — voir lib/parcel-transmission.ts. */
  parcelTransmission: jsonb("parcel_transmission").$type<Record<string, unknown> | null>(),
  /** Données du site déclarées à l'étape 01 (côté d'approche, priorité, contextes, source, note…) — `harmonieEtapesV7.site` du prototype, voir `SiteObservations`. */
  siteObservations: jsonb("site_observations").$type<Record<string, unknown> | null>(),
  /** Contexte extérieur déclaré par l'utilisateur pour le bilan du bâtiment (`siteContextV62` du prototype : observation, statut, date) ; null tant que rien n'est déclaré. */
  siteContext: jsonb("site_context").$type<SiteContextDeclaration | null>(),
  /** État du programme appliqué (bibliothèque des bâtiments) : textes générés par étape, écarts conservés, décision à réexaminer et son historique. */
  programmeState: jsonb("programme_state").$type<Record<string, unknown> | null>(),
  /** Dossier Harmony du projet (`p.data.harmony` du prototype, schéma `Parcours.Harmony` 1) : observations par règle, références directionnelles, carte temporelle, fiches de locaux, ambiances, actions, revues, revue de conception archivée. Conservé tel quel ; lu par `@parcours/domain-model` (`harmony-engine.ts`, `design-review.ts`). */
  harmony: jsonb("harmony").$type<Record<string, unknown> | null>(),
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

/**
 * Répartition programmatique du projet (module Programmation) : type de
 * bâtiment, surface de référence, position dans la fourchette et ratios
 * forcés — `programmeRepartition` du prototype, une ligne par projet,
 * créée à la première modification (les valeurs par défaut viennent de
 * `data/programme-repartition.json`, pas de la base). `components` porte
 * les composantes déclarées d'un bâtiment mixte (profil Harmonie).
 */
export const programmeRepartitions = pgTable("programme_repartitions", {
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  baseArea: doublePrecision("base_area").notNull(),
  mode: text("mode").notNull(),
  custom: jsonb("custom").notNull().$type<Record<string, number>>(),
  components: jsonb("components").notNull().$type<string[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Magasin du moteur de l'Atelier natif (module Atelier, propriétaire du
 * modèle du bâtiment) : les clés `design.v13.*` que le moteur lit et écrit
 * telles quelles (registre, projet actif, domaines `levels`, `floorDesign`,
 * `nativeParcel`, `buildingFootprint`, `ui`, `views`, `sources`…), une ligne
 * par clé et par projet. `revision` est la révision contrôlée de la clé :
 * une écriture doit annoncer la révision qu'elle a lue (détection de
 * conflit). La projection vers `levels` / `architectural_objects` est
 * dérivée de ce magasin (lib/native-projection.ts), jamais l'inverse.
 */
export const atelierStore = pgTable(
  "atelier_store",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull().$type<unknown>(),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.key] })],
);

/**
 * Fichiers de parcelle de l'outil Parcelle (étape 01), un par ligne : le
 * contrat `/api/parcels` de l'outil (`project-files.js`), scopé par projet.
 * `data` est le fichier tel que l'outil le capture (`ParcelFileData.clean`),
 * `revision` la révision contrôlée que chaque écriture doit annoncer.
 */
export const parcels = pgTable(
  "parcels",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    crs: text("crs").notNull(),
    parcelNumber: text("parcel_number").notNull().default(""),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    revision: integer("revision").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

export const levels = pgTable("levels", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  /**
   * Élévation du niveau, mètres, repère local du bâtiment. `double
   * precision`, pas un entier : le modèle natif P.118 porte des altitudes
   * décimales (ex. -3,2 m) et les arrondir perdrait de la donnée — interdit
   * par AGENTS.md.
   */
  elevation: doublePrecision("elevation").notNull().default(0),
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

/** Contenu binaire tel quel (bytea) : pièces jointes des étapes. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Sources de l'étape (module Projets et sources) : les fichiers rattachés à
 * une étape d'un projet — `FILE_DB` (IndexedDB) du prototype, ici sur le
 * serveur, propriété du projet. Le contenu est conservé tel quel ; le type
 * déclaré par le navigateur est enregistré mais jamais utilisé pour servir
 * le fichier autrement qu'en pièce jointe.
 */
export const stepFiles = pgTable("step_files", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  content: bytea("content").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("step_files_project_step_idx").on(t.projectId, t.stepNumber)]);

/**
 * Cas de programme appliqués à un projet (bibliothèque des bâtiments,
 * `Parcours.ProgrammeCase`) : une ligne par révision, la révision courante
 * est la plus haute ; les précédentes sont l'historique des variantes
 * appliquées (`programmeHistory` du prototype, borné à 12 par le routeur).
 * Les cas sources restent immuables dans `data/building-library.json`.
 */
export const programmeCases = pgTable("programme_cases", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  caseId: text("case_id").notNull(),
  scenarioId: text("scenario_id").notNull(),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.revision] })]);

/**
 * Documents produits (module Documents) : la dernière production de chaque
 * document du projet, avec la révision du modèle et l'empreinte des entrées
 * dont il provient — c'est ce qui permet de dire « à jour » ou « périmé »
 * sans relire le document (docs/architecture.md, « Document produit :
 * révision du projet utilisée et état d'actualisation »). Les fichiers
 * eux-mêmes sont régénérés à la demande, jamais stockés ici.
 */
/**
 * Dessins techniques et exports de l'Atelier (DXF, SVG, PNG, CSV, JSON) : chaque fichier produit par le moteur est
 * enregistré avec son projet, son niveau, sa vue et la révision du modèle dont il vient — le catalogue des documents
 * dit ensuite s'il est à jour ou périmé (révision / empreinte du modèle courantes).
 */
export const drawingExports = pgTable("drawing_exports", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  /** dxf | svg | png | csv | json. */
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  mime: text("mime").notNull(),
  content: bytea("content").notNull(),
  size: integer("size").notNull(),
  levelId: text("level_id"),
  levelName: text("level_name"),
  /** Vue du moteur au moment de l'export (`captureView` : mode, tech, portée, angles…). */
  view: jsonb("view").$type<Record<string, unknown>>().notNull().default({}),
  modelRevision: integer("model_revision").notNull(),
  nativeHash: text("native_hash").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("drawing_exports_project_idx").on(t.projectId)]);

export const producedDocuments = pgTable("produced_documents", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  /** Identifiant stable du document (`harmonie-etape-02`, `bilan-batiment`, `plan-lecture-rdc`, `archive-projet`…). */
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  fileName: text("file_name").notNull(),
  modelRevision: integer("model_revision").notNull(),
  /** Empreinte des entrées du document au moment de la production. */
  inputHash: text("input_hash").notNull(),
  stepNumber: integer("step_number"),
  producedAt: timestamp("produced_at", { withTimezone: true }).defaultNow().notNull(),
  /** Nombre de productions successives. */
  count: integer("count").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.projectId, t.kind] })]);

/**
 * Commentaires de projet (module Collaboration) : un fil par projet, chaque
 * commentaire pouvant viser une étape. L'auteur est enregistré (identifiant
 * et courriel au moment de l'écriture) pour la traçabilité ; la suppression
 * n'est permise qu'à l'auteur.
 */
export const projectComments = pgTable("project_comments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number"),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  authorEmail: text("author_email").notNull(),
  body: text("body").notNull(),
  /** Réponse en fil : identifiant du commentaire auquel elle répond (même projet), null au premier niveau. */
  parentId: text("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("project_comments_project_idx").on(t.projectId, t.createdAt)]);

/**
 * Membres d'un projet (module Collaboration, Lot 4) : le propriétaire reste
 * `projects.owner_id` ; un membre est lecteur (lecture et commentaires) ou
 * éditeur (modifications). Chaque route re-vérifie le rôle côté serveur
 * (`lib/owned-project.ts`) ; la gestion des membres est réservée au
 * propriétaire.
 */
export const projectMembers = pgTable("project_members", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"lecteur" | "editeur">(),
  invitedBy: text("invited_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId)]);

// >>> module: atelier
// Nouvel Atelier (cahier des charges §5.5 ; propriétaire : équipier « base », §9). Miroir de la section `atelier`
// de init.sql (qui fait autorité, contraintes comprises) ; figé pour la phase 2 du lot 2. Le passage
// EtatModele ⇄ lignes est dans lib/atelier-rows.ts : seul écrivain des tables de modèle (R9).

import type {
  Classification,
  ClasseObjet,
  Commande,
  ContratCommandes,
  DefinitionType,
  Effets,
  ObjetModele,
  Ontologie,
  Provenance,
  Representation,
  Statut,
  Tracabilite,
  TypeRelation,
  ValeurPropriete,
} from "@parcours/atelier-model";
import { bigint } from "drizzle-orm/pg-core";

/** Tête du modèle typé d'un projet (absente = pas encore de modèle). La révision qui fait autorité reste `projects.model_revision`. */
export const atelierModels = pgTable("atelier_models", {
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  /** Révision à laquelle `fingerprint` a été écrite. */
  modelRevision: integer("model_revision").notNull(),
  /** Empreinte `atelier-empreinte/1` (`sha256-…`) du modèle courant. */
  fingerprint: text("fingerprint").notNull(),
  fingerprintAlgorithm: text("fingerprint_algorithm").notNull().default("atelier-empreinte/1"),
  ontologyVersion: integer("ontology_version").notNull(),
  catalogueVersion: integer("catalogue_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Définitions de types du catalogue : `key` = `${classe}:${id}`, `content` = `DefinitionType` entière. */
export const atelierDefinitions = pgTable("atelier_definitions", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  definitionId: text("definition_id").notNull(),
  class: text("class").notNull(),
  catalogueVersion: integer("catalogue_version").notNull(),
  content: jsonb("content").notNull().$type<DefinitionType>(),
  modelRevision: integer("model_revision").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.key] })]);

/** Colonnes communes aux trois tables d'objets (atelier_objects, atelier_layers, atelier_site). */
function colonnesObjet() {
  return {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    ontology: text("ontology").$type<Ontologie>(),
    class: text("class").$type<ClasseObjet>(),
    levelId: text("level_id"),
    definitionId: text("definition_id"),
    params: jsonb("params").$type<ObjetModele["params"]>(),
    layerId: text("layer_id"),
    groupId: text("group_id"),
    /** Réservée (phases existant / projet / démoli) : toujours nulle au lot 2. */
    phase: text("phase"),
    provenance: text("provenance").$type<Provenance>(),
    status: text("status").$type<Statut>(),
    sourceId: text("source_id"),
    note: text("note"),
    classifications: jsonb("classifications").$type<readonly Classification[]>(),
    annotations: jsonb("annotations").$type<Readonly<Partial<Record<string, Tracabilite>>>>(),
    /** Champs d'objet non portés par une colonne (rien n'est perdu). */
    extra: jsonb("extra").$type<Record<string, unknown>>(),
    modelRevision: integer("model_revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /** Objet supprimé (identité réservée, `EtatModele.supprimes`). */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Ordre dans `EtatModele.supprimes` (croissant) ; nul si non supprimé. */
    deletedRank: integer("deleted_rank"),
  };
}

/**
 * Objets placés hors calques et site. Seule table qui admet une trace de suppression sans contenu (`class`,
 * `params`… nuls, `deleted_at` posé) ; coordonnées `local` seulement (contrainte SQL).
 */
export const atelierObjects = pgTable("atelier_objects", colonnesObjet(), (t) => [
  primaryKey({ columns: [t.projectId, t.id] }),
  index("atelier_objects_project_level_idx").on(t.projectId, t.levelId),
  index("atelier_objects_project_revision_idx").on(t.projectId, t.modelRevision),
  index("atelier_objects_project_class_idx").on(t.projectId, t.class),
]);

/** Calques (classe `calque`) ; contenu toujours présent. */
export const atelierLayers = pgTable("atelier_layers", colonnesObjet(), (t) => [
  primaryKey({ columns: [t.projectId, t.id] }),
  index("atelier_layers_project_revision_idx").on(t.projectId, t.modelRevision),
]);

/** Site et données de projet (parcelle, emprise, hypothèses, sources, structure déclarée) : seuls repères cadastral / géographique admis. */
export const atelierSite = pgTable("atelier_site", colonnesObjet(), (t) => [
  primaryKey({ columns: [t.projectId, t.id] }),
  index("atelier_site_project_revision_idx").on(t.projectId, t.modelRevision),
]);

/** Propriétés typées d'un objet, ou du projet quand `objectId` est nul ; ordre = `position`. Unicité (projet, coalesce(objet, ''), position) dans init.sql. */
export const atelierProperties = pgTable("atelier_properties", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  objectId: text("object_id"),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  /** Valeur JSON (JSON `null` admis). */
  value: jsonb("value").notNull().$type<ValeurPropriete>(),
  unit: text("unit"),
  provenance: text("provenance").notNull().$type<Provenance>(),
  status: text("status").notNull().$type<Statut>(),
  sourceId: text("source_id"),
  note: text("note"),
  extra: jsonb("extra").$type<Record<string, unknown>>(),
  modelRevision: integer("model_revision").notNull(),
}, (t) => [index("atelier_properties_project_name_idx").on(t.projectId, t.name)]);

/** Relations orientées ; unicité (projet, type, source, cible, coalesce(rôle, '')) dans init.sql. */
export const atelierRelations = pgTable("atelier_relations", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<TypeRelation>(),
  sourceId: text("source_id").notNull(),
  targetId: text("target_id").notNull(),
  role: text("role"),
  derived: boolean("derived").notNull(),
  extra: jsonb("extra").$type<Record<string, unknown>>(),
  modelRevision: integer("model_revision").notNull(),
}, (t) => [index("atelier_relations_project_target_idx").on(t.projectId, t.targetId)]);

/** Représentations d'un objet, dans leur ordre. */
export const atelierRepresentations = pgTable("atelier_representations", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  objectId: text("object_id").notNull(),
  position: integer("position").notNull(),
  usage: text("usage").notNull().$type<Representation["usage"]>(),
  authority: text("authority").notNull().$type<Representation["autorite"]>(),
  engine: text("engine").notNull(),
  engineVersion: text("engine_version").notNull(),
  inputsHash: text("inputs_hash").notNull(),
  extra: jsonb("extra").$type<Record<string, unknown>>(),
  modelRevision: integer("model_revision").notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.objectId, t.position] })]);

export type NatureJournal = "commande" | "annulation" | "retablissement" | "import";

/**
 * Journal des lots de commandes (§5.4). Idempotence : unicité (projet, request_id) ; `response` = réponse
 * enregistrée, renvoyée telle quelle à une requête répétée. `inverse` : commandes inverses produites par le
 * serveur (seules restaurations admises, D-024). `inverseOf` : entrée annulée (nature `annulation`) ou annulation
 * rétablie (`retablissement`) ; unique : une entrée ne s'inverse qu'une fois. `resultRevision` = `baseRevision`
 * (lot sans changement, D-024) ou `baseRevision + 1`.
 */
export const atelierCommands = pgTable("atelier_commands", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  contract: text("contract").notNull().$type<ContratCommandes>(),
  nature: text("nature").notNull().default("commande").$type<NatureJournal>(),
  label: text("label").notNull(),
  baseRevision: integer("base_revision").notNull(),
  resultRevision: integer("result_revision").notNull(),
  commands: jsonb("commands").notNull().$type<readonly Commande[]>(),
  inverse: jsonb("inverse").notNull().$type<readonly Commande[]>(),
  effets: jsonb("effets").notNull().$type<Effets>(),
  response: jsonb("response").notNull().$type<unknown>(),
  baseFingerprint: text("base_fingerprint").notNull(),
  resultFingerprint: text("result_fingerprint").notNull(),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  inverseOf: text("inverse_of"),
}, (t) => [
  uniqueIndex("atelier_commands_request_unique").on(t.projectId, t.requestId),
  index("atelier_commands_project_revision_idx").on(t.projectId, t.resultRevision),
]);

/** Boîte de sortie : événements écrits dans la transaction du lot, traités après validation (idempotents). */
export const atelierOutbox = pgTable("atelier_outbox", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  commandId: text("command_id").notNull().references(() => atelierCommands.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
}, (t) => [uniqueIndex("atelier_outbox_command_event_unique").on(t.commandId, t.event)]);

/** Volumes immuables adressés par contenu : `id` = SHA-256 hexadécimal du contenu (vérifié par la base). */
export const volumes = pgTable("volumes", {
  id: text("id").primaryKey(),
  mime: text("mime").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  content: bytea("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// <<< module: atelier
