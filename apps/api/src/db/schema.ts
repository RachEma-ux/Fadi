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
import { bigint, bigserial, boolean, customType, pgSchema, date, doublePrecision, index, integer, jsonb, pgTable, pgView, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { ConclusionControle, EtatExecution, ExigenceStudio, GrandeurQuantite, ResultatControle, StudioDocument, StudioEnvelope, StudioFeuilleComposeeDefinition, StudioPhaseWorkflow, UniteQuantite } from "@parcours/atelier-model";

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
  /** Ensembles d'affichage personnels de l'Atelier, synchronisés entre les appareils du compte (D-118) ; null tant que rien n'est enregistré. */
  atelierEnsembles: jsonb("atelier_ensembles"),
  /** Date serveur du dernier enregistrement de ces ensembles (version comparée par les appareils). */
  atelierEnsemblesAt: timestamp("atelier_ensembles_at", { withTimezone: true }),
  /** Préférences de notification du compte : `{ typesMasques, projetsMuets }` (lib/notification-preferences.ts) ; null tant que rien n'est réglé (tout est affiché). */
  notificationPreferences: jsonb("notification_preferences"),
  // Gestion des comptes (docs/workstreams/users-management) — états stockés UM-2 ; « verrouillé » = `lockedUntil` futur.
  status: text("status").$type<AccountStatus>().notNull().default("active"),
  platformRole: text("platform_role").$type<PlatformRole>().notNull().default("user"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** D-5 : anonymisation 30 jours après cette date, sauf annulation. */
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  /** D-6 : secret TOTP chiffré (lib/secret-box.ts) ; jamais en clair. */
  totpSecretEnc: text("totp_secret_enc"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** Dernier pas TOTP accepté : un code déjà utilisé est refusé. */
  totpLastStep: bigint("totp_last_step", { mode: "number" }),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  /** D-3 : réservée, aucune logique ne la lit. */
  organizationId: text("organization_id"),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

export type AccountStatus = "active" | "suspended" | "closed";

/**
 * D-7 (docs/workstreams/users-management/AMENDEMENT-D7.md) : nouvelles tables des comptes dans le schéma `auth`,
 * d'audit et d'exploitation dans `admin` ; les requêtes générées sont qualifiées (`"auth"."account_tokens"`).
 */
export const authSchema = pgSchema("auth");
export const adminSchema = pgSchema("admin");
export type PlatformRole = "user" | "admin";

/** Session serveur : seule l'empreinte SHA-256 du jeton du cookie est stockée (UM-5). */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Échéance glissante (inactivité). */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  tokenHash: text("token_hash"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  /** Plafond absolu (30 j utilisateur, 24 h administrateur). */
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  userAgent: text("user_agent"),
  ip: text("ip"),
  /** Mot de passe vérifié, code de double authentification attendu : ne vaut pas authentification. */
  mfaPending: boolean("mfa_pending").notNull().default(false),
  /**
   * Instant où cette session a prouvé la double authentification (code TOTP ou de secours à la connexion, ou activation du
   * TOTP depuis elle). NULL = mot de passe seul : jamais d'administration. Une preuve antérieure à l'activation courante
   * du TOTP du compte ne compte pas.
   */
  mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
}, (t) => [index("sessions_user_id_idx").on(t.userId), uniqueIndex("sessions_token_hash_unique").on(t.tokenHash)]);

export const userRecoveryCodes = authSchema.table("user_recovery_codes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("user_recovery_codes_user_idx").on(t.userId)]);

/** `organization_membership` : phase 5 des organisations (V22-02) — une adhésion naît de son acceptation. */
/** `review_package` : phase 4 (revue externe) — une affectation de revue nominative s'active à son acceptation. */
export type InvitationPurpose = "platform_account" | "project_participation" | "organization_membership" | "review_package";
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled";

/** UM-3 : une invitation est une proposition ; elle ne crée ni compte ni accès avant acceptation par l'adresse visée. */
export const invitations = authSchema.table("invitations", {
  id: text("id").primaryKey(),
  purpose: text("purpose").$type<InvitationPurpose>().notNull(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  projectRole: text("project_role").$type<"lecteur" | "editeur" | null>(),
  /** Null seulement pour l'invitation d'amorçage du premier administrateur (`grantPlatformRole = "admin"`). */
  invitedBy: text("invited_by").references(() => users.id, { onDelete: "cascade" }),
  grantPlatformRole: text("grant_platform_role").$type<"admin" | null>(),
  status: text("status").$type<InvitationStatus>().notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  acceptedUserId: text("accepted_user_id").references(() => users.id, { onDelete: "set null" }),
  /** Finalité `organization_membership` : organisation, rôle et fonction proposés (phase 5). */
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  organizationRole: text("organization_role").$type<OrganizationRole | null>(),
  organizationJobTitle: text("organization_job_title"),
  /** Finalité `review_package` : l'affectation de revue visée (phase 4). */
  reviewAssignmentId: text("review_assignment_id"),
  /**
   * Finalité `project_participation` (phase 3) : participation visée (contact de l'annuaire ou fiche créée à l'envoi) et
   * rôles proposés par portée. Rien n'est accordé avant l'acceptation.
   */
  participationId: text("participation_id"),
  proposedRoles: jsonb("proposed_roles").$type<ProposedRole[] | null>(),
  /** Invitation d'un représentant mandaté (reliquat de la phase 5) : le mandat d'où elle part ; aucun droit avant l'acceptation. */
  mandateId: text("mandate_id"),
}, (t) => [uniqueIndex("invitations_token_hash_unique").on(t.tokenHash)]);

/** Rôle proposé par une invitation de projet (phase 3) : rôle métier et portée exacte. */
export interface ProposedRole { role: ProjectBusinessRole; scopeType: RoleScopeType; scopeId: string | null }

export type AccountTokenPurpose = "verify_email" | "reset_password" | "cancel_deletion";

export const accountTokens = authSchema.table("account_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").$type<AccountTokenPurpose>().notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("account_tokens_token_hash_unique").on(t.tokenHash), index("account_tokens_user_idx").on(t.userId, t.purpose)]);

/** Journal d'audit append-only (déclencheurs `audit_log_no_update` / `_no_delete`) ; jamais d'adresse e-mail. */
export const auditLog = adminSchema.table("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_log_actor_idx").on(t.actorId, t.createdAt), index("audit_log_target_idx").on(t.targetType, t.targetId, t.createdAt)]);
// Phase 3 bis (journal consultable) : index d'expression `audit_log_project_meta_idx` ((metadata->>'projectId'), id) et
// `audit_log_action_idx` (action text_pattern_ops, id), déclarés dans init.sql seulement (expression, classe d'opérateurs).

export type MailStatus = "pending" | "sent" | "failed" | "skipped";

/** D-1 : file d'envoi ; la charge (liens porteurs de jeton) est effacée dès l'envoi ou l'abandon. */
export const mailOutbox = adminSchema.table("mail_outbox", {
  id: text("id").primaryKey(),
  toAddress: text("to_address").notNull(),
  template: text("template").notNull(),
  locale: text("locale").$type<"fr" | "en">().notNull().default("fr"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").$type<MailStatus>().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

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
  /**
   * Partie propriétaire facultative (OP-D1 a, phase 5) : organisation déclarée par le propriétaire, administrateur actif
   * de cette organisation. Elle ne change aucun droit (`lib/owned-project.ts` ne la lit pas).
   */
  organizationId: text("organization_id"),
  /** Clôture déclarative (Issue #262, OP-2) : ne change aucun droit ; départ du délai de conservation des contacts. */
  closedAt: timestamp("closed_at", { withTimezone: true }),
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

/** R2 : données de pilotage séparées des 21 statuts de Parcours. */
export interface ProjectPlanningStep {
  startDate: string | null;
  endDate: string | null;
  responsible: string;
  nextAction: string;
}
export type ProjectPlanningSteps = Record<string, ProjectPlanningStep>;

/** Brouillon courant : révision CAS globale, sans mutation des fiches Parcours. */
export const projectPlans = pgTable("project_plans", {
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  steps: jsonb("steps").notNull().$type<ProjectPlanningSteps>(),
  baselineVersion: integer("baseline_version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
});

/** Chaque référence validée est immuable et consultable après les suivantes. */
export const projectPlanBaselines = pgTable("project_plan_baselines", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  steps: jsonb("steps").notNull().$type<ProjectPlanningSteps>(),
  sourceRevision: integer("source_revision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.version] }),
  index("project_plan_baselines_project_idx").on(t.projectId, t.version),
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
/** Audience d'un commentaire ou d'une observation à l'intérieur du projet (écart E1, `lib/audience.ts`). */
export type CommentAudience = "equipe" | "projet";
/**
 * Audience d'un fil Studio : celle des commentaires du projet, plus `revue` (phase 4, OP-D6 a) — constat d'une revue
 * externe, lu par l'équipe et par les destinataires du paquet (`reviewPackageId`), jamais par un lecteur du projet.
 */
export type StudioCommentAudience = CommentAudience | "revue";

export const projectComments = pgTable("project_comments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number"),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  authorEmail: text("author_email").notNull(),
  body: text("body").notNull(),
  /** Réponse en fil : identifiant du commentaire auquel elle répond (même projet), null au premier niveau. */
  parentId: text("parent_id"),
  /** Entrée du journal de l'Atelier commentée (D-055) : sa révision résultante, null sinon. */
  atelierRevision: integer("atelier_revision"),
  /** Audience (écart E1) : `equipe` = propriétaire et éditeurs ; `projet` = tous les membres, lecteurs compris. */
  audience: text("audience").$type<CommentAudience>().notNull().default("equipe"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("project_comments_project_idx").on(t.projectId, t.createdAt)]);

/**
 * Membres d'un projet (module Collaboration, Lot 4) : le propriétaire reste
 * `projects.owner_id` ; un membre est lecteur (lecture et commentaires) ou
 * éditeur (modifications). Chaque route re-vérifie le rôle côté serveur
 * (`lib/owned-project.ts`) ; la gestion des membres est réservée au
 * propriétaire.
 *
 * Lot OP-PONT (Issue #262) : `project_members` n'est plus une table mais une VUE de compatibilité EN LECTURE, dérivée
 * des participations (init.sql). Déclarée ici avec ses colonnes pour les lectures restantes ; aucune écriture (insert,
 * update, delete) n'est permise — `fadi_app` n'en a pas le droit et un test relit le code (project-access.test.ts). Les
 * écritures du partage passent par `lib/project-access-db.ts`.
 */
export const projectMembers = pgTable("project_members", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"lecteur" | "editeur">(),
  invitedBy: text("invited_by").notNull(),
  /** Export accordé à un lecteur (écart E2) ; NULL (archive antérieure) = TRUE. Ignoré pour un éditeur. */
  canExport: boolean("can_export").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId)]);

/** D-2 / UM-4 : accès support en lecture seule accordé par le propriétaire à un administrateur, ≤ 72 h, révocable. */
export const projectSupportGrants = pgTable("project_support_grants", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  adminId: text("admin_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  grantedBy: text("granted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by"),
}, (t) => [index("project_support_grants_project_idx").on(t.projectId, t.adminId)]);

// ---------------------------------------------------------------------------
// Organisations, participation et revue externe — phase 1 (Issue #262). Miroir de init.sql. Participations et rôles
// portent l'accès (vue `project_effective_access`, phase 2) ; le partage y est écrit directement depuis le lot OP-PONT
// (`lib/project-access-db.ts`, plus de miroir `op_sync_access`). Règles pures : `lib/participations.ts`.
// ---------------------------------------------------------------------------

/** Personne : compte vérifié (`userId`) ou contact sans compte (nom requis, OP-D9). */
export const people = pgTable("people", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  jobTitle: text("job_title"),
  workEmail: text("work_email"),
  workPhone: text("work_phone"),
  /** Contact sans compte effacé (OP-D9) : nom remplacé, coordonnées supprimées, trace conservée. */
  erasedAt: timestamp("erased_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Organisation (OP-D1, OP-D4) ; son espace (adhésions, groupes, gabarits, mandats) est la phase 5 (OP-D10). */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind"),
  status: text("status").notNull().default("active").$type<OrganizationStatus>(),
  /** Coordonnées professionnelles déclarées (saisie libre, phase 5). */
  details: text("details"),
  /** Clé de création rejouable (double soumission = même organisation). */
  creationKey: text("creation_key"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ParticipationStatus = "contact" | "active" | "suspendue" | "terminee";
export type TeamResponsibility = "diriger" | "produire" | "coordonner" | "verifier" | "approuver" | "diffuser";

/** Participation d'une personne OU d'une organisation à un projet, pour une période. */
export const projectParticipations = pgTable("project_participations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  personId: text("person_id").references(() => people.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  representedOrganizationId: text("represented_organization_id").references(() => organizations.id, { onDelete: "set null" }),
  businessRole: text("business_role"),
  responsibilities: text("responsibilities").array().notNull().default([]).$type<TeamResponsibility[]>(),
  status: text("status").notNull().$type<ParticipationStatus>(),
  /** Export accordé à un lecteur (écart E2), écrit par le partage (lib/project-access-db.ts) ; un Concepteur exporte toujours. */
  canExport: boolean("can_export").notNull().default(false),
  /** Échéance de l'accès (phase 3), recopiée de l'invitation acceptée : passée, la participation ne donne plus rien. */
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  /** Partage (lot OP-PONT) : libellé de l'invitant (historiquement son adresse) et date du partage — colonnes
   *  `invited_by` / `created_at` de la vue de compatibilité `project_members`. */
  accessGrantedBy: text("access_granted_by"),
  accessGrantedAt: timestamp("access_granted_at", { withTimezone: true }),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("project_participations_person_idx").on(t.personId)]);

export type ProjectBusinessRole = "lecteur" | "concepteur" | "relecteur" | "coordinateur" | "approbateur" | "diffuseur";
export type RoleScopeType = "projet" | "etude" | "variante" | "revision" | "documents";

/** Rôle métier par portée (OP-D3 c) ; `acces` = rôle du partage (Lecteur / Concepteur), `attribution` = affectation explicite. */
export const projectRoleAssignments = pgTable("project_role_assignments", {
  id: text("id").primaryKey(),
  participationId: text("participation_id").notNull().references(() => projectParticipations.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<ProjectBusinessRole>(),
  scopeType: text("scope_type").notNull().default("projet").$type<RoleScopeType>(),
  scopeId: text("scope_id"),
  origin: text("origin").notNull().default("attribution").$type<"acces" | "attribution">(),
  grantedBy: text("granted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Phase 2 (OP-D3 c) : la seule source de la décision d'accès à un projet (vue SQL, init.sql) — propriétaire, ou
 * participation active portant un rôle métier à la portée projet. Lue par `lib/owned-project.ts` et les listes.
 */
export const projectEffectiveAccess = pgView("project_effective_access", {
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().$type<"proprietaire" | "editeur" | "lecteur">(),
  canExport: boolean("can_export").notNull(),
  canApprove: boolean("can_approve").notNull(),
  canPublish: boolean("can_publish").notNull(),
}).existing();

// ---------------------------------------------------------------------------
// Organisations — phase 5 (concept partie 5). Miroir de init.sql : adhésions, groupes, gabarits versionnés, mandats de
// représentation. Aucune de ces tables ne donne un droit de projet. Règles pures : `lib/organizations-rules.ts`.
// ---------------------------------------------------------------------------
export type OrganizationStatus = "active" | "suspendue" | "close";
export type OrganizationRole = "administrateur" | "membre";
export type MembershipStatus = "active" | "suspendue" | "terminee";
export type MandateStatus = "propose" | "actif" | "refuse" | "annule" | "termine";

export const organizationMemberships = pgTable("organization_memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("membre").$type<OrganizationRole>(),
  jobTitle: text("job_title"),
  status: text("status").notNull().default("active").$type<MembershipStatus>(),
  startsOn: date("starts_on").notNull().defaultNow(),
  endsOn: date("ends_on"),
  endReason: text("end_reason"),
  invitationId: text("invitation_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("organization_memberships_person_idx").on(t.personId)]);

export const organizationGroups = pgTable("organization_groups", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active").$type<"active" | "archive">(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationGroupMembers = pgTable("organization_group_members", {
  groupId: text("group_id").notNull(),
  membershipId: text("membership_id").notNull(),
  organizationId: text("organization_id").notNull(),
  addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.groupId, t.membershipId] })]);

export const organizationTemplates = pgTable("organization_templates", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active").$type<"active" | "archive">(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Version immuable d'un gabarit (déclencheur SQL) : `content.entries` = lignes d'équipe proposées. */
export const organizationTemplateVersions = pgTable("organization_template_versions", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull().references(() => organizationTemplates.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: jsonb("content").notNull().$type<{ entries: unknown[] }>(),
  note: text("note"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationTemplateApplications = pgTable("organization_template_applications", {
  id: text("id").primaryKey(),
  templateVersionId: text("template_version_id").notNull().references(() => organizationTemplateVersions.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  appliedBy: text("applied_by").references(() => users.id, { onDelete: "set null" }),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
  plan: jsonb("plan").notNull().$type<unknown[]>(),
});

export const organizationMandates = pgTable("organization_mandates", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  participationId: text("participation_id").notNull().references(() => projectParticipations.id, { onDelete: "cascade" }),
  membershipId: text("membership_id").notNull(),
  responsibilities: text("responsibilities").array().notNull().default([]).$type<TeamResponsibility[]>(),
  status: text("status").notNull().default("propose").$type<MandateStatus>(),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  endReason: text("end_reason"),
  replacesMandateId: text("replaces_mandate_id"),
  note: text("note"),
  proposedBy: text("proposed_by").references(() => users.id, { onDelete: "set null" }),
  proposedAt: timestamp("proposed_at", { withTimezone: true }).defaultNow().notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [index("organization_mandates_membership_idx").on(t.membershipId)]);

// ---------------------------------------------------------------------------
// Modèle typé de l'Atelier Fadi (cahier des charges §5.5) —
// propriété du module Atelier. Une ligne par entité du modèle
// (`@parcours/atelier-model`, contrat `modele-atelier/1`), toutes scopées par
// projet ; les paramètres canoniques restent du JSON typé (repère local, mètres),
// jamais une géométrie PostGIS. Le journal `atelier_commands` est append-only :
// chaque lot validé (ou son annulation) est une microversion, `projects.model_revision`
// avance d'un à chaque entrée.
// ---------------------------------------------------------------------------

export const atelierNiveaux = pgTable(
  "atelier_niveaux",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    nom: text("nom").notNull(),
    elevation: doublePrecision("elevation").notNull(),
    hauteur: doublePrecision("hauteur"),
    ordre: integer("ordre").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

export const atelierObjets = pgTable(
  "atelier_objets",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    classe: text("classe").notNull(),
    niveauId: text("niveau_id"),
    definitionId: text("definition_id"),
    calqueId: text("calque_id"),
    groupeId: text("groupe_id"),
    phase: text("phase"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    proprietes: jsonb("proprietes").$type<Record<string, unknown>>().notNull().default({}),
    modelRevision: integer("model_revision").notNull(),
    verrouille: boolean("verrouille").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] }), index("atelier_objets_niveau_idx").on(t.projectId, t.niveauId), index("atelier_objets_classe_idx").on(t.projectId, t.classe)],
);

export const atelierRelations = pgTable(
  "atelier_relations",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    sourceId: text("source_id").notNull(),
    targetId: text("target_id").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] }), index("atelier_relations_source_idx").on(t.projectId, t.sourceId), index("atelier_relations_target_idx").on(t.projectId, t.targetId)],
);

export const atelierDefinitions = pgTable(
  "atelier_definitions",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    classe: text("classe").notNull(),
    nom: text("nom").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

export const atelierCalques = pgTable(
  "atelier_calques",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    nom: text("nom").notNull(),
    couleur: text("couleur"),
    remplissage: text("remplissage"),
    visible: boolean("visible").notNull().default(true),
    verrouille: boolean("verrouille").notNull().default(false),
    ordre: integer("ordre").notNull().default(0),
    parentId: text("parent_id"),
    /** Calque gelé (D-103). */
    gele: boolean("gele").notNull().default(false),
    proprietes: jsonb("proprietes").$type<Record<string, unknown> | null>(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

export const atelierGroupes = pgTable(
  "atelier_groupes",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    nom: text("nom").notNull(),
    verrouille: boolean("verrouille").notNull().default(false),
    proprietes: jsonb("proprietes").$type<Record<string, unknown> | null>(),
    /** Réseau associatif (D-115) : paramètres et copies ; null : groupe ordinaire. */
    reseau: jsonb("reseau").$type<Record<string, unknown> | null>(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

export const atelierReferences = pgTable(
  "atelier_references",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    proprietaireId: text("proprietaire_id").notNull(),
    objetId: text("objet_id"),
    caracteristique: text("caracteristique"),
    etat: text("etat").notNull(),
    propositions: jsonb("propositions").$type<unknown[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

export const atelierProblemes = pgTable(
  "atelier_problemes",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    type: text("type").notNull(),
    objetId: text("objet_id"),
    message: text("message").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

/** Site et propriétés de projet du modèle typé ; la présence de la ligne dit qu'un modèle typé existe pour le projet. */
export const atelierSite = pgTable("atelier_site", {
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  parcelle: jsonb("parcelle").$type<Record<string, unknown> | null>(),
  emprise: jsonb("emprise").$type<Record<string, unknown> | null>(),
  hypotheses: jsonb("hypotheses").$type<unknown[]>().notNull().default([]),
  sources: jsonb("sources").$type<unknown[]>().notNull().default([]),
  structure: jsonb("structure").$type<Record<string, unknown> | null>(),
  proprietes: jsonb("proprietes").$type<Record<string, unknown>>().notNull().default({}),
  /** Ontologies activées par le projet en plus du socle (P2-2) ; null = socle seul. */
  ontologies: jsonb("ontologies").$type<string[] | null>(),
  /** Identifiant natif conservé pour les consommateurs de l'analyse (liaisons, empreintes). */
  nativeId: text("native_id").notNull().default("modele-type"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type JournalKind = "commande" | "annulation" | "retablissement";

/** Journal des lots validés (append-only) : `request_id` unique par projet = idempotence (T06). */
export const atelierCommands = pgTable(
  "atelier_commands",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    kind: text("kind").$type<JournalKind>().notNull().default("commande"),
    contract: text("contract").notNull(),
    label: text("label").notNull(),
    baseRevision: integer("base_revision").notNull(),
    resultRevision: integer("result_revision").notNull(),
    commands: jsonb("commands").$type<unknown[]>().notNull(),
    inverse: jsonb("inverse").$type<Record<string, unknown>>().notNull(),
    effets: jsonb("effets").$type<Record<string, unknown>>().notNull(),
    /** Réponse renvoyée au client, rejouée telle quelle pour une requête répétée. */
    reponse: jsonb("reponse").$type<Record<string, unknown>>().notNull(),
    inverseOf: text("inverse_of"),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("atelier_commands_request_unique").on(t.projectId, t.requestId), index("atelier_commands_project_rev_idx").on(t.projectId, t.resultRevision)],
);

/** Boîte de sortie transactionnelle : événements versionnés, traités de façon idempotente après validation. */
export const atelierOutbox = pgTable(
  "atelier_outbox",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    version: integer("version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
  },
  (t) => [index("atelier_outbox_pending_idx").on(t.projectId, t.processedAt)],
);

/** Version nommée (lot 7) : instantané immuable du modèle à une révision, avec son empreinte. */
export const atelierVersions = pgTable("atelier_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  description: text("description").notNull().default(""),
  revision: integer("revision").notNull(),
  empreinte: text("empreinte").notNull(),
  modele: jsonb("modele").$type<Record<string, unknown>>().notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Variante (lot 7) : un projet bifurqué d'un autre à une révision ; fusion par rejeu validé de son journal. */
export const atelierVariants = pgTable("atelier_variants", {
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  parentId: text("parent_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  /** Révision du tronc au moment de la bifurcation. */
  forkRevision: integer("fork_revision").notNull(),
  /** Révision de la variante juste après la bifurcation (son journal propre commence après). */
  baseRevision: integer("base_revision").notNull(),
  forkEmpreinte: text("fork_empreinte").notNull(),
  statut: text("statut").$type<"ouverte" | "fusionnee">().notNull().default("ouverte"),
  fusionRevision: integer("fusion_revision"),
  fusionAt: timestamp("fusion_at", { withTimezone: true }),
  /** Dernière mise à jour de la variante depuis le tronc (D-136) : révision du tronc rejouée jusque-là. */
  syncRevision: integer("sync_revision"),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Volume immuable adressé par son contenu (SHA-256) : fichiers figés des publications. */
export const volumes = pgTable("volumes", {
  id: text("id").primaryKey(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  content: bytea("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export interface DocumentPublie {
  kind: string;
  label: string;
  fileName: string;
  volumeId: string;
  mime: string;
  size: number;
  inputHash: string;
}

/** Publication figée (lot 7) : version, versions des catalogues et documents produits à sa révision. */
export const atelierPublications = pgTable("atelier_publications", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  versionId: text("version_id").notNull().references(() => atelierVersions.id, { onDelete: "restrict" }),
  nom: text("nom").notNull(),
  revision: integer("revision").notNull(),
  empreinte: text("empreinte").notNull(),
  catalogues: jsonb("catalogues").$type<Record<string, string>>().notNull(),
  documents: jsonb("documents").$type<DocumentPublie[]>().notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Verrou logique fin (lot 7) : objet (`<id>`), niveau (`niveau:<id>`) ou zone (`zone:<id>`, D-143) réservé par un compte jusqu'à une échéance. */
export const atelierLocks = pgTable("atelier_locks", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  cle: text("cle").notNull(),
  motif: text("motif").notNull().default(""),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  transmisPar: text("transmis_par"),
}, (t) => [primaryKey({ columns: [t.projectId, t.cle] })]);

/** Prise ou libération d'un verrou fin (D-143), pour les notifications des autres membres ; libellé figé. */
export const atelierLockEvents = pgTable("atelier_lock_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  cle: text("cle").notNull(),
  libelle: text("libelle").notNull(),
  kind: text("kind").$type<"prise" | "liberation">().notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

/** Script de la bibliothèque d'un projet (lot 8) : une ligne par version, immuable. */
export const atelierScripts = pgTable("atelier_scripts", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  scriptId: text("script_id").notNull(),
  version: integer("version").notNull(),
  contenu: jsonb("contenu").$type<Record<string, unknown>>().notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.scriptId, t.version] })]);

export type StatutProposition = "proposee" | "echouee" | "incomprise" | "acceptee" | "refusee";

/** Proposition de l'assistant (lot 8) : séquence inspectable, journal des hypothèses, itérations, décision. */
export const atelierPropositions = pgTable("atelier_propositions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  intention: text("intention").notNull(),
  cle: text("cle").notNull(),
  generateur: text("generateur").notNull(),
  regle: text("regle"),
  explication: text("explication").notNull(),
  commandes: jsonb("commandes").$type<unknown[]>().notNull(),
  hypotheses: jsonb("hypotheses").$type<unknown[]>().notNull(),
  iterations: jsonb("iterations").$type<unknown[]>().notNull(),
  effets: jsonb("effets").$type<Record<string, unknown> | null>(),
  statut: text("statut").$type<StatutProposition>().notNull(),
  depuisCache: boolean("depuis_cache").notNull().default(false),
  revisionBase: integer("revision_base").notNull(),
  revisionResultat: integer("revision_resultat"),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

/** Studio V1 : contexte autonome ; les données Atelier et Parcours restent distinctes. */
export interface StudioContext {
  study: { id: string; name: string; projectId: string };
  variant: { id: string; name: string; studyId: string; headRevisionId: string };
  revision: { id: string; parentRevisionId: string | null; document: StudioDocument };
  canWrite: boolean;
  /** Réponse de création d'une variante : variante et révision sources d'une dérivation, null sinon. */
  derivedFrom?: StudioProvenance | null;
}
/** Provenance d'une variante dérivée : variante et révision de la même étude dont le document a été copié. */
export interface StudioProvenance { variantId: string; revisionId: string }

export const studioStudies = pgTable("studio_studies", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Les FK cycliques initialVariant/head sont différées dans init.sql (section Studio).
  initialVariantId: text("initial_variant_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Création idempotente : unique par projet quand renseigné (index partiel studio_studies_creation_request_unique, init.sql).
  creationRequestId: text("creation_request_id"),
  // Cycle de vie : dernier renommage ou (dés)archivage ; archivée = masquée des listes, lisible, non modifiable.
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  // Étude exemple installée par le serveur (`lib/studio-exemple.ts`) : marquage explicite ; null = étude ordinaire.
  exampleInstall: jsonb("example_install").$type<StudioExampleInstall>(),
  // Phase déclarée du workflow de conception (REF-01 §06) ; null = « non déclarée » (jamais déduite).
  workflowPhase: text("workflow_phase").$type<StudioPhaseWorkflow>(),
}, (t) => [index("studio_studies_project_idx").on(t.projectId)]);

/** Marquage d'une étude exemple (`studio_studies.example_install`). `rapport` : rapport de conversion enregistré. */
export interface StudioExampleInstall {
  exampleId: string;
  /** Version du convertisseur et empreinte (SHA-256 tronquée) des commandes produites. */
  version: number;
  empreinte: string;
  /** Préfixe des identifiants de requête de l'installation (étude, variantes, lots). */
  prefixe: string;
  complete: boolean;
  rapport: unknown;
}

export const studioVariants = pgTable("studio_variants", {
  id: text("id").primaryKey(),
  studyId: text("study_id").notNull().references(() => studioStudies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  headRevisionId: text("head_revision_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Création idempotente : unique par étude quand renseigné (index partiel studio_variants_creation_request_unique, init.sql).
  creationRequestId: text("creation_request_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  // Provenance d'une variante dérivée (paire renseignée ensemble ; FK composite vers la révision source, init.sql).
  derivedFromVariantId: text("derived_from_variant_id"),
  derivedFromRevisionId: text("derived_from_revision_id"),
}, (t) => [uniqueIndex("studio_variants_study_id_unique").on(t.studyId, t.id)]);

/** Append-only : une réponse historique n'est jamais reconstruite depuis le head actuel. */
export const studioRevisions = pgTable("studio_revisions", {
  id: text("id").primaryKey(),
  variantId: text("variant_id").notNull().references(() => studioVariants.id, { onDelete: "cascade" }),
  parentRevisionId: text("parent_revision_id"),
  document: jsonb("document").$type<StudioDocument>().notNull(),
  // null uniquement pour la première révision vide, créée avec l'étude.
  envelope: jsonb("envelope").$type<StudioEnvelope | null>(),
  requestId: text("request_id").notNull(),
  payloadHash: text("payload_hash").notNull(),
  source: text("source").$type<"authenticated-session" | "study-initialization" | "variant-initialization" | "variant-derivation">().notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  response: jsonb("response").$type<StudioContext>().notNull(),
}, (t) => [
  uniqueIndex("studio_revisions_request_unique").on(t.variantId, t.requestId),
  uniqueIndex("studio_revisions_variant_id_unique").on(t.variantId, t.id),
]);

/**
 * Commentaires d'une variante Studio (règles de la Collaboration : tout membre commente, l'auteur seul supprime) ;
 * ancrage facultatif à une révision de la même variante et à des objets de son document. Suppression douce par
 * l'auteur (`deleted_at`) : le fil reste lisible. Les FK composites « même variante » sont dans init.sql.
 */
export const studioComments = pgTable("studio_comments", {
  id: text("id").primaryKey(),
  variantId: text("variant_id").notNull().references(() => studioVariants.id, { onDelete: "cascade" }),
  revisionId: text("revision_id"),
  objectIds: jsonb("object_ids").$type<string[]>().notNull().default([]),
  parentId: text("parent_id"),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  // Création idempotente : unique par variante quand renseigné (index partiel studio_comments_request_unique, init.sql).
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /** Audience du fil (écart E1), portée par le commentaire d'origine ; NULL (archive antérieure) = `projet`. */
  audience: text("audience").$type<StudioCommentAudience>().default("equipe"),
  /** Paquet de revue d'un fil d'audience `revue` (et de lui seul, contrainte init.sql). */
  reviewPackageId: text("review_package_id"),
}, (t) => [
  index("studio_comments_variant_idx").on(t.variantId, t.createdAt),
  uniqueIndex("studio_comments_variant_id_unique").on(t.variantId, t.id),
]);

/** Statuts d'une observation Studio (E.2) ; `rouverte` se corrige comme `ouverte`. */
export type StudioObservationStatut = "ouverte" | "corrigee" | "recontrolee" | "cloturee" | "rouverte";
export type StudioObservationAction = "ouvrir" | "corriger" | "recontroler" | "cloturer" | "rouvrir" | "reattribuer";

/**
 * Observation Studio : un commentaire d'origine promu (même identifiant, une seule identité), responsable membre du
 * projet, échéance facultative, statut et révisions de correction / recontrôle (FK composites « même variante »,
 * init.sql). Le journal des passages est `studioObservationEvents`.
 */
export const studioObservations = pgTable("studio_observations", {
  commentId: text("comment_id").primaryKey(),
  variantId: text("variant_id").notNull().references(() => studioVariants.id, { onDelete: "cascade" }),
  responsableId: text("responsable_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  echeance: date("echeance", { mode: "string" }),
  statut: text("statut").$type<StudioObservationStatut>().notNull(),
  correctionRevisionId: text("correction_revision_id"),
  recontroleRevisionId: text("recontrole_revision_id"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // Contexte de vue déclaré à l'ouverture (E.2-02) ; null pour une observation antérieure ou sans vue citée.
  vueMode: text("vue_mode").$type<StudioObservationVueMode | null>(),
  vueRef: text("vue_ref"),
}, (t) => [index("studio_observations_variant_idx").on(t.variantId), index("studio_observations_responsable_idx").on(t.responsableId)]);

/** Modes de l'espace de travail Studio cités comme contexte de vue d'une observation (E.2-02). */
export type StudioObservationVueMode = "plan" | "3d" | "feuille" | "quantites" | "exigences" | "revue";
/** Domaines où une même observation est réemployée (E.2-01). */
export type StudioObservationDomaine = "exigence" | "metre" | "revue" | "objet";
export type StudioObservationTacheStatut = "a-faire" | "faite" | "annulee";
export type StudioObservationTacheAction = "creer" | "terminer" | "annuler" | "rouvrir" | "reattribuer";
export type StudioObservationDecisionNature = "proposition" | "decision";
export type StudioObservationDecisionPortee = "cloture" | "autre";

/** Journal append-only des passages d'une observation (qui, quand, révision, note), ordonné par `seq`. */
export const studioObservationEvents = pgTable("studio_observation_events", {
  id: text("id").primaryKey(),
  observationId: text("observation_id").notNull().references(() => studioObservations.commentId, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  action: text("action").$type<StudioObservationAction>().notNull(),
  fromStatut: text("from_statut").$type<StudioObservationStatut | null>(),
  toStatut: text("to_statut").$type<StudioObservationStatut>().notNull(),
  actorId: text("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  revisionId: text("revision_id"),
  // Responsable désigné par ce passage (ouverture, réattribution) ; null pour les autres passages.
  responsableId: text("responsable_id"),
  note: text("note"),
  // Passage idempotent : unique par observation quand renseigné (index partiel, init.sql).
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("studio_observation_events_seq_unique").on(t.observationId, t.seq),
  index("studio_observation_events_at_idx").on(t.at),
]);

/**
 * Lien d'une observation vers un élément d'un domaine (E.2-01) : exigence (et contrôle), ligne de métré
 * (`objetId#grandeur`), revue (publication) ou objet du modèle, avec la révision citée. Un élément d'un domaine n'est
 * suivi que par une observation de la variante (index unique `variant_id, domaine, ref`, init.sql). Jamais réécrit.
 */
export const studioObservationLinks = pgTable("studio_observation_links", {
  id: text("id").primaryKey(),
  observationId: text("observation_id").notNull(),
  variantId: text("variant_id").notNull().references(() => studioVariants.id, { onDelete: "cascade" }),
  domaine: text("domaine").$type<StudioObservationDomaine>().notNull(),
  ref: text("ref").notNull(),
  revisionId: text("revision_id"),
  controleId: text("controle_id"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("studio_observation_links_ref_unique").on(t.variantId, t.domaine, t.ref),
  index("studio_observation_links_observation_idx").on(t.observationId),
]);

/** Tâche d'une observation (E.2-03) : état courant ; son journal est `studioObservationTaskEvents`. */
export const studioObservationTasks = pgTable("studio_observation_tasks", {
  id: text("id").primaryKey(),
  observationId: text("observation_id").notNull().references(() => studioObservations.commentId, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
  assigneeId: text("assignee_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  echeance: date("echeance", { mode: "string" }),
  statut: text("statut").$type<StudioObservationTacheStatut>().notNull(),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("studio_observation_tasks_observation_idx").on(t.observationId), index("studio_observation_tasks_assignee_idx").on(t.assigneeId)]);

/** Journal append-only des passages d'une tâche, ordonné par `seq`. */
export const studioObservationTaskEvents = pgTable("studio_observation_task_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => studioObservationTasks.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  action: text("action").$type<StudioObservationTacheAction>().notNull(),
  fromStatut: text("from_statut").$type<StudioObservationTacheStatut | null>(),
  toStatut: text("to_statut").$type<StudioObservationTacheStatut>().notNull(),
  actorId: text("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assigneeId: text("assignee_id"),
  note: text("note"),
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("studio_observation_task_events_seq_unique").on(t.taskId, t.seq),
  index("studio_observation_task_events_at_idx").on(t.at),
]);

/** Décisions et propositions d'une observation (E.2-03 / E.2-04), distinctes des passages ; append-only, par `seq`. */
export const studioObservationDecisions = pgTable("studio_observation_decisions", {
  id: text("id").primaryKey(),
  observationId: text("observation_id").notNull().references(() => studioObservations.commentId, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  nature: text("nature").$type<StudioObservationDecisionNature>().notNull(),
  portee: text("portee").$type<StudioObservationDecisionPortee>().notNull(),
  texte: text("texte").notNull(),
  actorId: text("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorRole: text("actor_role").$type<"proprietaire" | "editeur">().notNull(),
  revisionId: text("revision_id"),
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("studio_observation_decisions_seq_unique").on(t.observationId, t.seq),
  index("studio_observation_decisions_at_idx").on(t.at),
]);

/**
 * Étapes du Parcours auxquelles une étude Studio est rattachée (lien de lecture, facultatif) : une ligne par étude et
 * par numéro d'étape (`project_steps.step_number`, 1 à 21) du même projet, vérifiée par le serveur à l'écriture.
 * Le lien ne modifie ni l'étape ni l'étude ; il disparaît avec l'étude (cascade).
 */
export const studioStudySteps = pgTable("studio_study_steps", {
  studyId: text("study_id").notNull().references(() => studioStudies.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("studio_study_steps_unique").on(t.studyId, t.stepNumber),
  index("studio_study_steps_step_idx").on(t.stepNumber),
]);

/** Statuts d'une publication Studio : travail → soumis → approuve | refuse → diffuse ; retire (jamais supprimée). */
export type StudioPublicationStatus = "travail" | "soumis" | "approuve" | "refuse" | "diffuse" | "retire";
export type StudioPublicationAction = "creer" | "soumettre" | "approuver" | "refuser" | "diffuser" | "retirer" | "actualiser" | "remplacer";
/** Dimensions distinctes du lot E.4 (lib/studio-publication-statuts.ts) ; NULL sur une ligne antérieure (déduites du statut combiné). */
export type StudioPublicationWorkStatus = "brouillon" | "en-revue" | "approuve" | "refuse";
export type StudioPublicationDiffusionStatus = "non-diffuse" | "diffuse" | "retire" | "remplace";
/** Manifeste figé multi-sources d'un dossier (E.4-03) : sources coordonnées, métadonnées gelées, documents du paquet. */
export interface StudioPublicationManifest {
  schema: "studio-publication-manifest/1";
  /** E.3-07 : dessin 2D indépendant (SVG, DXF, feuille PDF ; sans IFC) ; absent : dossier complet. */
  contenu?: "dessin-2d";
  sources: { role: "principale" | "coordonnee"; variantId: string; revisionId: string; documentHash: string }[];
  meta: { projectCode: string; projectName: string; studyName: string; variantName: string; revisionCreatedAt: string };
  documents: { format: string; fileName: string; mime: string; size: number; sha256: string }[];
}
export type StudioPackageFormat = "svg" | "dxf" | "ifc" | "pdf";
/** Fichier figé d'un paquet diffusé : contenu dans `volumes` (identifiant = SHA-256 du contenu). */
export interface StudioPackageFile { format: StudioPackageFormat; fileName: string; mime: string; size: number; sha256: string }
/** Paquet figé à la diffusion : révision, empreinte du document, métadonnées gelées des exports et fichiers. */
export interface StudioPublicationPackage {
  schema: "studio-publication-package/1";
  /** E.3-07 : dessin 2D indépendant ; absent : paquet complet. */
  contenu?: "dessin-2d";
  revisionId: string;
  documentHash: string;
  meta: { projectCode: string; projectName: string; studyName: string; variantName: string; revisionCreatedAt: string };
  files: StudioPackageFile[];
  /** Empreinte du manifeste approuvé dont le paquet est issu (lot E.4 ; absente des paquets antérieurs). */
  manifestHash?: string;
}

/** Publication d'une révision de variante Studio (FK composites « même étude / même variante » dans init.sql). */
export const studioPublications = pgTable("studio_publications", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  studyId: text("study_id").notNull(),
  variantId: text("variant_id").notNull(),
  revisionId: text("revision_id").notNull(),
  documentHash: text("document_hash").notNull(),
  title: text("title").notNull(),
  status: text("status").$type<StudioPublicationStatus>().notNull().default("travail"),
  approvedRevisionId: text("approved_revision_id"),
  approvedDocumentHash: text("approved_document_hash"),
  approvedBy: text("approved_by").references(() => users.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  package: jsonb("package").$type<StudioPublicationPackage | null>(),
  packageHash: text("package_hash"),
  diffusedBy: text("diffused_by").references(() => users.id, { onDelete: "restrict" }),
  diffusedAt: timestamp("diffused_at", { withTimezone: true }),
  workStatus: text("work_status").$type<StudioPublicationWorkStatus | null>(),
  diffusionStatus: text("diffusion_status").$type<StudioPublicationDiffusionStatus | null>(),
  manifest: jsonb("manifest").$type<StudioPublicationManifest | null>(),
  manifestHash: text("manifest_hash"),
  manifestBuiltAt: timestamp("manifest_built_at", { withTimezone: true }),
  approvedManifestHash: text("approved_manifest_hash"),
  replacedByPublicationId: text("replaced_by_publication_id"),
  replacedBy: text("replaced_by").references(() => users.id, { onDelete: "restrict" }),
  replacedAt: timestamp("replaced_at", { withTimezone: true }),
  requestId: text("request_id"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("studio_publications_project_idx").on(t.projectId, t.createdAt),
  index("studio_publications_study_idx").on(t.studyId, t.createdAt),
]);

/** Journal append-only des transitions d'une publication (UPDATE refusée par déclencheur, init.sql). */
export const studioPublicationEvents = pgTable("studio_publication_events", {
  id: text("id").primaryKey(),
  publicationId: text("publication_id").notNull().references(() => studioPublications.id, { onDelete: "cascade" }),
  action: text("action").$type<StudioPublicationAction>().notNull(),
  fromStatus: text("from_status").$type<StudioPublicationStatus | null>(),
  toStatus: text("to_status").$type<StudioPublicationStatus>().notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  comment: text("comment"),
  revisionId: text("revision_id").notNull(),
  documentHash: text("document_hash").notNull(),
  headRevisionId: text("head_revision_id").notNull(),
  manifestHash: text("manifest_hash"),
  workStatus: text("work_status").$type<StudioPublicationWorkStatus | null>(),
  diffusionStatus: text("diffusion_status").$type<StudioPublicationDiffusionStatus | null>(),
  relatedPublicationId: text("related_publication_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("studio_publication_events_publication_idx").on(t.publicationId, t.createdAt)]);
/**
 * Préférences d'outils Studio d'un compte (lib/studio-preferences.ts) : profil des barres (`standard`,
 * `metier:<id>`, `personnel`), favoris et liste personnelle, identifiants du registre `STUDIO_TOOLS`. Une ligne par
 * compte, sans rapport avec les documents : ni géométrie, ni révision, ni droit (B.2-07). Regroupements personnels
 * (`groups`, B.2-02) et version du manifeste d'écriture (`manifest_version`, B.1-06) : colonnes additives facultatives
 * (null = aucun regroupement / ligne antérieure au manifeste), lisibles depuis une archive qui ne les porte pas.
 */
export const studioToolPreferences = pgTable("studio_tool_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  profile: text("profile").notNull().default("standard"),
  favorites: jsonb("favorites").$type<string[]>().notNull().default([]),
  personal: jsonb("personal").$type<string[]>().notNull().default([]),
  groups: jsonb("groups").$type<{ id: string; nom: string; outils: string[] }[]>(),
  manifestVersion: text("manifest_version"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Préférences d'outils du Sandbox d'un compte (lot 5) : profil, barre gauche personnelle, favoris, regroupements nommés
 * (identifiants du registre REGISTRE_SANDBOX, `lib/sandbox-preferences.ts`). Propre au Sandbox ; visibilité seulement.
 */
export const sandboxToolPreferences = pgTable("sandbox_tool_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  profile: text("profile").notNull().default("standard"),
  leftBar: jsonb("left_bar").$type<string[]>().notNull().default([]),
  favorites: jsonb("favorites").$type<string[]>().notNull().default([]),
  groups: jsonb("groups").$type<{ id: string; nom: string; entrees: string[] }[]>().notNull().default([]),
  format: text("format").notNull().default("sandbox-preferences/1"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Exigences Studio (E.1-02 à E.1-06, lib/studio-exigences.ts) : versions append-only d'un jeu d'exigences par étude
 * (UPDATE refusée par déclencheur, init.sql) et résultats de contrôle liés à la révision et à la version examinées
 * (FK composites et contrôles dans init.sql). Aucune exigence n'est fournie par Fadi.
 */
export const studioRequirementSets = pgTable("studio_requirement_sets", {
  id: text("id").primaryKey(),
  studyId: text("study_id").notNull().references(() => studioStudies.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  requirements: jsonb("requirements").$type<ExigenceStudio[]>().notNull(),
  motif: text("motif"),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("studio_requirement_sets_version_unique").on(t.studyId, t.version)]);

export const studioRequirementChecks = pgTable("studio_requirement_checks", {
  id: text("id").primaryKey(),
  studyId: text("study_id").notNull().references(() => studioStudies.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull(),
  revisionId: text("revision_id").notNull(),
  setVersion: integer("set_version"),
  execution: text("execution").$type<EtatExecution>().notNull(),
  conclusion: text("conclusion").$type<ConclusionControle | null>(),
  result: jsonb("result").$type<ResultatControle>().notNull(),
  documentHash: text("document_hash").notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("studio_requirement_checks_variant_idx").on(t.variantId, t.createdAt)]);

/**
 * Ajustements manuels du métré Studio (E.3-05, lib/studio-quantites.ts) : journal en ajout seul, versionné par variante
 * (`seq`), UPDATE refusée par déclencheur (init.sql). La quantité brute n'est jamais stockée comme vérité : elle reste
 * dérivée du document ; `derivedValue` et `targetState` décrivent la cible à la révision de l'ajustement.
 */
export const studioQuantityAdjustments = pgTable("studio_quantity_adjustments", {
  id: text("id").primaryKey(),
  studyId: text("study_id").notNull().references(() => studioStudies.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull(),
  revisionId: text("revision_id").notNull(),
  seq: integer("seq").notNull(),
  targetKind: text("target_kind").$type<"objet" | "calque">().notNull(),
  targetId: text("target_id").notNull(),
  quantity: text("quantity").$type<GrandeurQuantite>().notNull(),
  value: doublePrecision("value"),
  unit: text("unit").$type<UniteQuantite>().notNull(),
  derivedValue: doublePrecision("derived_value"),
  targetState: jsonb("target_state").$type<Record<string, unknown>>().notNull(),
  motif: text("motif").notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("studio_quantity_adjustments_seq_unique").on(t.variantId, t.seq)]);

/** Feuilles composées Studio (E.3-02) : définition propre, lecture d'une révision identifiée ; jamais la planche. */
export const studioSheets = pgTable("studio_sheets", {
  id: text("id").primaryKey(),
  studyId: text("study_id").notNull().references(() => studioStudies.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull(),
  revisionId: text("revision_id").notNull(),
  number: text("number").notNull(),
  definition: jsonb("definition").$type<StudioFeuilleComposeeDefinition>().notNull(),
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("studio_sheets_number_unique").on(t.studyId, t.number)]);

/** Dossiers de conception Studio (E.3-03) : feuilles ordonnées, métré facultatif, fidélité. */
export const studioDossiers = pgTable("studio_dossiers", {
  id: text("id").primaryKey(),
  studyId: text("study_id").notNull().references(() => studioStudies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sheetIds: jsonb("sheet_ids").$type<string[]>().notNull(),
  quantitiesVariantId: text("quantities_variant_id"),
  quantitiesRevisionId: text("quantities_revision_id"),
  /** Borne du journal des ajustements du métré lue par le dossier (séquence max à l'épinglage) ; null : aucun ajustement. */
  quantitiesAdjustmentSeq: integer("quantities_adjustment_seq"),
  includeFidelity: boolean("include_fidelity").notNull().default(true),
  requestId: text("request_id"),
  payloadHash: text("payload_hash"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("studio_dossiers_study_idx").on(t.studyId, t.createdAt)]);

// ---------------------------------------------------------------------------
// Revue externe — phase 4 (concept partie 4). Miroir de init.sql : paquets de revue figés au partage, affectations
// nominatives (relecture / approbation), constats rattachés, notes internes. Règles pures : `lib/review-rules.ts`.
// ---------------------------------------------------------------------------
export type ReviewPackageStatus = "brouillon" | "partage" | "clos" | "remplace";
export type ReviewAssignmentStatus = "en-attente" | "en-cours" | "terminee" | "annulee" | "remplacee";
export type ReviewResponsibility = "relecture" | "approbation";
export type ReviewResult = "constats" | "satisfaisante";
/** Pièce jointe d'un constat : contenu rangé dans `volumes` (identifiant = SHA-256 du contenu). */
export interface ReviewAttachment { name: string; mime: string; size: number; sha256: string }

export const reviewPackages = pgTable("review_packages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  publicationId: text("publication_id").notNull().references(() => studioPublications.id, { onDelete: "cascade" }),
  studyId: text("study_id").notNull(),
  variantId: text("variant_id").notNull(),
  lineageId: text("lineage_id").notNull(),
  version: integer("version").notNull(),
  supersedesPackageId: text("supersedes_package_id"),
  title: text("title").notNull(),
  purpose: text("purpose").notNull(),
  expectedResponse: text("expected_response").notNull(),
  questions: jsonb("questions").$type<string[]>().notNull().default([]),
  coordinatorId: text("coordinator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  correctionsOwnerId: text("corrections_owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  dueOn: date("due_on"),
  status: text("status").$type<ReviewPackageStatus>().notNull().default("brouillon"),
  revisionId: text("revision_id"),
  documentHash: text("document_hash"),
  manifest: jsonb("manifest").$type<StudioPublicationManifest | null>(),
  manifestHash: text("manifest_hash"),
  /** Fichiers figés au partage (format, nom, type, taille, sha256 = identifiant dans `volumes`). */
  files: jsonb("files").$type<StudioPackageFile[] | null>(),
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  sharedBy: text("shared_by").references(() => users.id, { onDelete: "restrict" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: text("closed_by").references(() => users.id, { onDelete: "restrict" }),
  closeReason: text("close_reason"),
  replacedAt: timestamp("replaced_at", { withTimezone: true }),
  replacedByPackageId: text("replaced_by_package_id"),
  requestId: text("request_id"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("review_packages_project_idx").on(t.projectId, t.createdAt)]);

export const reviewAssignments = pgTable("review_assignments", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => reviewPackages.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  participationId: text("participation_id").notNull().references(() => projectParticipations.id),
  personId: text("person_id").notNull().references(() => people.id),
  userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
  responsibility: text("responsibility").$type<ReviewResponsibility>().notNull(),
  canView: boolean("can_view").notNull().default(true),
  canComment: boolean("can_comment").notNull().default(true),
  canAttach: boolean("can_attach").notNull().default(false),
  canDownload: boolean("can_download").notNull().default(false),
  canExport: boolean("can_export").notNull().default(false),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
  invitationId: text("invitation_id"),
  status: text("status").$type<ReviewAssignmentStatus>().notNull().default("en-attente"),
  result: text("result").$type<ReviewResult | null>(),
  responseNote: text("response_note"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by").references(() => users.id, { onDelete: "restrict" }),
  revokeReason: text("revoke_reason"),
  carriedFromAssignmentId: text("carried_from_assignment_id"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("review_assignments_package_idx").on(t.packageId)]);

export const reviewFindings = pgTable("review_findings", {
  observationId: text("observation_id").primaryKey().references(() => studioObservations.commentId, { onDelete: "cascade" }),
  packageId: text("package_id").notNull().references(() => reviewPackages.id, { onDelete: "cascade" }),
  assignmentId: text("assignment_id").references(() => reviewAssignments.id, { onDelete: "set null" }),
  revisionId: text("revision_id").notNull(),
  documentFormat: text("document_format").$type<StudioPackageFormat | null>(),
  /** SHA-256 du document du paquet visé (identifiant dans `volumes`). */
  documentSha256: text("document_digest"),
  attachments: jsonb("attachments").$type<ReviewAttachment[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("review_findings_package_idx").on(t.packageId)]);

export const reviewPackageNotes = pgTable("review_package_notes", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => reviewPackages.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("review_package_notes_package_idx").on(t.packageId, t.createdAt)]);
// ---------------------------------------------------------------------------------------------------------------------
// Communication (COM, Issue #280) — `init.sql` porte les contraintes ; la lisibilité est recalculée à chaque requête
// depuis l'accès courant au projet (`lib/com-audience.ts`).

export type ComMode = "contexte" | "groupe" | "direct";
export type ComAudience = "participants" | "equipe" | "projet";
export type ComContextType = "projet" | "etape" | "document" | "fichier" | "studio-variante" | "revision-atelier";
export type ComNature = "message" | "partage" | "action";
export type ComRefType = "etape" | "document" | "fichier" | "studio-variante" | "observation-studio" | "message" | "demande" | "revision-atelier";
/** Référence à un élément du projet : type et identifiant seulement (libellé résolu pour chaque lecteur). */
export interface ComRef { type: ComRefType; id: string }
/** Épingle (COM-D18) : point sur le plan d'une révision exacte d'une variante Studio, repère local (mètres). */
export interface ComEpingle { type: "studio-variante"; studyId: string; variantId: string; revisionId: string; point: { x: number; y: number }; repere: "local"; objetIds: string[] }
/** Position déclarée par l'auteur (COM-D16) : repère geographic (WGS84), source et précision déclarées. */
export interface ComLocalisation { repere: "geographic"; lat: number; lon: number; precisionM: number | null; source: "appareil"; captureeLe: string | null }
export type ComEventAction = "creer" | "audience" | "participant-ajoute" | "participant-retire" | "animation" | "modification-message" | "retrait-message" | "partage-envoye" | "partage-recu" | "action-liee";

export const comConversations = pgTable("com_conversations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  mode: text("mode").$type<ComMode>().notNull(),
  title: text("title").notNull(),
  audience: text("audience").$type<ComAudience>().notNull(),
  contextType: text("context_type").$type<ComContextType>(),
  contextRef: text("context_ref"),
  contextRevision: text("context_revision"),
  stewardId: text("steward_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("com_conversations_project_idx").on(t.projectId, t.lastMessageAt)]);

export const comParticipants = pgTable("com_participants", {
  conversationId: text("conversation_id").notNull().references(() => comConversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  addedBy: text("added_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  historyFrom: timestamp("history_from", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]);

export const comMessages = pgTable("com_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => comConversations.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  nature: text("nature").$type<ComNature>().notNull().default("message"),
  replyToId: text("reply_to_id"),
  refs: jsonb("refs").$type<ComRef[]>().notNull().default([]),
  mentions: text("mentions").array().notNull().default([]),
  ackRequired: boolean("ack_required").notNull().default(false),
  urgent: boolean("urgent").notNull().default(false),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  clientRequestId: text("client_request_id"),
  payloadHash: text("payload_hash"),
  sharedFrom: jsonb("shared_from").$type<{ conversationId: string; messageIds: string[] } | null>(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  epingle: jsonb("epingle").$type<ComEpingle | null>(),
  localisation: jsonb("localisation").$type<ComLocalisation | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("com_messages_conversation_idx").on(t.conversationId, t.createdAt)]);

/** Photo jointe (COM-D15 à COM-D17) : métadonnées retirées, 2 Mo et 2 560 px au plus. */
export const comPieces = pgTable("com_pieces", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => comConversations.id, { onDelete: "cascade" }),
  messageId: text("message_id"),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  mime: text("mime").$type<"image/jpeg" | "image/png">().notNull(),
  size: integer("size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  empreinte: text("empreinte").notNull(),
  content: bytea("content").notNull(),
  clientRequestId: text("client_request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("com_pieces_message_idx").on(t.messageId)]);

export const comMessageVersions = pgTable("com_message_versions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  messageId: text("message_id").notNull().references(() => comMessages.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  replacedAt: timestamp("replaced_at", { withTimezone: true }).defaultNow().notNull(),
  reason: text("reason").$type<"modification" | "retrait">().notNull(),
});

export const comReceipts = pgTable("com_receipts", {
  messageId: text("message_id").notNull().references(() => comMessages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.messageId, t.userId] })]);

export const comReads = pgTable("com_reads", {
  conversationId: text("conversation_id").notNull().references(() => comConversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]);

export const comEvents = pgTable("com_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => comConversations.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").$type<ComEventAction>().notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

export const comLinks = pgTable("com_links", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => comMessages.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  targetType: text("target_type").$type<"demande" | "observation-studio">().notNull(),
  targetId: text("target_id").notNull(),
  targetScope: jsonb("target_scope").$type<Record<string, string>>().notNull().default({}),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DemandeStatut = "ouverte" | "repondue" | "close";
export type DemandeAction = "ouvrir" | "repondre" | "cloturer" | "rouvrir" | "reattribuer";

/** Demande de précision (Collaboration partagée, COM-D10) : question et réponses jamais réécrites. */
export const collabDemandes = pgTable("collab_demandes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  refs: jsonb("refs").$type<ComRef[]>().notNull().default([]),
  requesterId: text("requester_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  responderId: text("responder_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  echeance: date("echeance", { mode: "string" }),
  statut: text("statut").$type<DemandeStatut>().notNull().default("ouverte"),
  audience: text("audience").$type<CommentAudience>().notNull().default("equipe"),
  sourceMessageId: text("source_message_id"),
  clientRequestId: text("client_request_id"),
  payloadHash: text("payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("collab_demandes_project_idx").on(t.projectId, t.createdAt)]);

export const collabDemandeEvents = pgTable("collab_demande_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  demandeId: text("demande_id").notNull().references(() => collabDemandes.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").$type<DemandeAction>().notNull(),
  body: text("body"),
  fromUser: text("from_user"),
  toUser: text("to_user"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Temps réel (RTC-1, Issue #283) : sessions en direct sur le Studio et leur journal en ajout seul (init.sql).

export type RtPortee = "studio-revision" | "paquet-revue";
export type RtStatutSession = "ouverte" | "close" | "expiree";
export type RtActionSession = "ouvrir" | "rejoindre" | "quitter" | "presentateur" | "hote" | "reprendre" | "changer-revision" | "clore" | "expirer";

/** Session en direct : épingle une révision Studio ou une publication figée ; l'hôte n'en tire aucun droit (RT-R2). */
export const rtSessions = pgTable("rt_sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").$type<RtPortee>().notNull(),
  studyId: text("study_id").notNull(),
  variantId: text("variant_id").notNull(),
  revisionId: text("revision_id").notNull(),
  publicationId: text("publication_id").references(() => studioPublications.id, { onDelete: "cascade" }),
  /** Revue (RTC-4) : empreinte du manifeste examiné, figée à l'ouverture ; null pour une session de travail. */
  publicationManifestHash: text("publication_manifest_hash"),
  title: text("title").notNull(),
  hostId: text("host_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  presenterId: text("presenter_id").references(() => users.id, { onDelete: "restrict" }),
  status: text("status").$type<RtStatutSession>().notNull().default("ouverte"),
  requestId: text("request_id"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => [index("rt_sessions_project_idx").on(t.projectId, t.status, t.createdAt)]);

/** Journal d'une session (ouverture, entrées, sorties, transferts, clôture) : UPDATE refusée par déclencheur. */
export const rtSessionEvents = pgTable("rt_session_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => rtSessions.id, { onDelete: "cascade" }),
  action: text("action").$type<RtActionSession>().notNull(),
  actorId: text("actor_id").references(() => users.id, { onDelete: "restrict" }),
  targetId: text("target_id").references(() => users.id, { onDelete: "restrict" }),
  revisionId: text("revision_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("rt_session_events_session_idx").on(t.sessionId, t.createdAt)]);

/** Point de vue d'une annotation temps réel : cadre plan (`local-2d`, m) et / ou caméra (`local-3d`, m), repères déclarés. */
export interface RtPointDeVue {
  affichage: "2d" | "3d" | "double";
  plan?: { x: number; y: number; w: number; h: number };
  camera?: unknown;
  reperes: { plan: "local-2d"; camera: "local-3d" };
  unites: "m";
}

/** Annotation enregistrée en session (RTC-3) : point de vue et session d'origine d'un commentaire Studio (même identifiant). */
export const rtAnnotations = pgTable("rt_annotations", {
  commentId: text("comment_id").primaryKey().references(() => studioComments.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull(),
  sessionId: text("session_id").references(() => rtSessions.id, { onDelete: "set null" }),
  sourceRevisionId: text("source_revision_id").notNull(),
  viewpoint: jsonb("viewpoint").$type<RtPointDeVue>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("rt_annotations_variant_idx").on(t.variantId, t.createdAt), index("rt_annotations_session_idx").on(t.sessionId)]);
