/**
 * Section Studio de l'archive de projet (R.1-02) — logique PURE, sans base ni `db/client.ts` : tables couvertes, clés,
 * colonnes de compte et de projet, JSON canonique, manifeste (version de schéma, effectifs et empreintes par table),
 * contrôle d'intégrité d'une section relue (références internes, empreintes de documents, volumes) et préparation des
 * lignes à réinsérer telles quelles (ordre d'insertion, projet et comptes réattribués). L'accès à la base est dans
 * `studio-archive.ts`.
 *
 * Les lignes sont celles de PostgreSQL (`to_jsonb(ligne)`) : colonnes en snake_case, horodatages ISO à la
 * microseconde, `bytea` en texte hexadécimal `\x…`. Elles sont réinsérées telles quelles (`jsonb_populate_recordset`) :
 * aucune révision n'est recalculée, les empreintes de contenu (`payload_hash`, `document_hash`, `package_hash`, volumes)
 * restent identiques ; seuls l'identifiant du projet et, faute du même compte dans la base cible, l'auteur technique
 * changent (réattribution déclarée dans les réserves).
 */
import { createHash } from "node:crypto";

export const STUDIO_ARCHIVE_SCHEMA = "fadi-studio-archive/1";
/** Version du schéma Studio couvert (document des révisions et jeu de tables de `init.sql`). */
export const STUDIO_ARCHIVE_SCHEMA_VERSION = { document: "studio-document/1", tables: "studio-v1/2026-10-19" } as const;

/** Tables archivées, dans l'ordre d'insertion (parents d'abord). `project_members` porte les droits du projet. */
export const STUDIO_ARCHIVE_TABLES = [
  "studio_studies",
  "studio_variants",
  "studio_revisions",
  "studio_comments",
  "studio_observations",
  "studio_observation_events",
  "studio_study_steps",
  "volumes",
  "studio_publications",
  "studio_publication_events",
  "project_members",
  "studio_tool_preferences",
] as const;
export type StudioArchiveTable = (typeof STUDIO_ARCHIVE_TABLES)[number];
export type StudioArchiveRow = Record<string, unknown>;
export type StudioArchiveTables = Record<StudioArchiveTable, StudioArchiveRow[]>;

/** Clé de chaque table (comparaison ligne à ligne, tri déterministe). */
export const STUDIO_TABLE_KEYS: Readonly<Record<StudioArchiveTable, readonly string[]>> = Object.freeze({
  studio_studies: ["id"],
  studio_variants: ["id"],
  studio_revisions: ["id"],
  studio_comments: ["id"],
  studio_observations: ["comment_id"],
  studio_observation_events: ["id"],
  studio_study_steps: ["study_id", "step_number"],
  volumes: ["id"],
  studio_publications: ["id"],
  studio_publication_events: ["id"],
  project_members: ["project_id", "user_id"],
  studio_tool_preferences: ["user_id"],
});

/** Colonnes qui désignent un compte (réattribuées par adresse électronique à l'import). */
export const STUDIO_USER_COLUMNS: Readonly<Record<StudioArchiveTable, readonly string[]>> = Object.freeze({
  studio_studies: [],
  studio_variants: [],
  studio_revisions: ["author_id"],
  studio_comments: ["author_id"],
  studio_observations: ["responsable_id", "created_by"],
  studio_observation_events: ["actor_id", "responsable_id"],
  studio_study_steps: ["created_by"],
  volumes: [],
  studio_publications: ["approved_by", "diffused_by", "created_by"],
  studio_publication_events: ["author_id"],
  // `invited_by` garde l'adresse de l'invitant (texte, sans clé étrangère) : historique conservé tel quel.
  project_members: ["user_id"],
  studio_tool_preferences: ["user_id"],
});

/** Colonnes qui portent l'identifiant du projet (remplacé par celui du projet restauré). */
export const STUDIO_PROJECT_COLUMNS: Readonly<Partial<Record<StudioArchiveTable, readonly string[]>>> = Object.freeze({
  studio_studies: ["project_id"],
  studio_publications: ["project_id"],
  project_members: ["project_id"],
});

/** Tables dont les identifiants sont globaux : une collision dans la base cible empêche la restauration Studio. */
export const STUDIO_IDENTITY_TABLES: readonly StudioArchiveTable[] = [
  "studio_studies", "studio_variants", "studio_revisions", "studio_comments", "studio_observations",
  "studio_observation_events", "studio_publications", "studio_publication_events",
];

export interface StudioArchiveAccount { id: string; email: string }
export interface StudioTableManifest { count: number; hash: string }
export interface StudioArchiveManifest {
  schema: typeof STUDIO_ARCHIVE_SCHEMA;
  schemaVersion: typeof STUDIO_ARCHIVE_SCHEMA_VERSION;
  tables: Record<StudioArchiveTable, StudioTableManifest>;
  /** Empreinte globale : SHA-256 du JSON canonique des empreintes par table. */
  hash: string;
}
export interface StudioArchiveSection {
  schema: typeof STUDIO_ARCHIVE_SCHEMA;
  schemaVersion: typeof STUDIO_ARCHIVE_SCHEMA_VERSION;
  sourceProjectId: string;
  /** Propriétaire du projet d'origine (droits : il n'est pas membre, il possède le projet). */
  ownerId: string;
  /** Comptes cités par les lignes (identifiant d'origine → adresse), pour la réattribution à l'import. */
  accounts: StudioArchiveAccount[];
  tables: StudioArchiveTables;
  manifest: StudioArchiveManifest;
  /** HMAC-SHA256 de `manifest.hash` par une clé du serveur exportateur (`archive-signature.ts`) ; absente des archives antérieures. */
  signature?: { algorithm: string; keyId: string; value: string };
}

/** JSON canonique (clés triées, valeurs indéfinies omises) — même règle que `studioDocumentHash` (studio-publications.ts). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((k) => record[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
/** Empreinte d'un document de révision Studio, identique à `studioDocumentHash`. */
export const studioArchiveDocumentHash = (document: unknown): string => sha256(canonicalJson(document));

const keyOf = (table: StudioArchiveTable, row: StudioArchiveRow): string => STUDIO_TABLE_KEYS[table].map((k) => String(row[k] ?? "")).join("|");
/** Lignes triées par clé (copie) : l'ordre de lecture de la base n'influe ni sur le manifeste ni sur la comparaison. */
export function sortStudioRows(table: StudioArchiveTable, rows: readonly StudioArchiveRow[]): StudioArchiveRow[] {
  return [...rows].sort((a, b) => (keyOf(table, a) < keyOf(table, b) ? -1 : keyOf(table, a) > keyOf(table, b) ? 1 : 0));
}
export const studioTableHash = (table: StudioArchiveTable, rows: readonly StudioArchiveRow[]): string => sha256(canonicalJson(sortStudioRows(table, rows)));

export function emptyStudioTables(): StudioArchiveTables {
  return Object.fromEntries(STUDIO_ARCHIVE_TABLES.map((t) => [t, []])) as unknown as StudioArchiveTables;
}

/** Identité couverte par l'empreinte globale (et donc par la signature) en plus des lignes. */
export interface StudioArchiveIdentity { sourceProjectId: string; ownerId: string; accounts: readonly StudioArchiveAccount[] }

/**
 * Manifeste : effectif et empreinte par table ; l'empreinte globale couvre aussi le projet, le propriétaire et les
 * comptes cités (identifiant → adresse) — une adresse réécrite change l'empreinte, donc invalide la signature.
 */
export function buildStudioManifest(tables: StudioArchiveTables, identity: StudioArchiveIdentity): StudioArchiveManifest {
  const perTable = Object.fromEntries(STUDIO_ARCHIVE_TABLES.map((t) => [t, { count: tables[t].length, hash: studioTableHash(t, tables[t]) }])) as Record<StudioArchiveTable, StudioTableManifest>;
  const accounts = [...identity.accounts].map((a) => ({ id: a.id, email: a.email })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hash = sha256(canonicalJson({ tables: perTable, sourceProjectId: identity.sourceProjectId, ownerId: identity.ownerId, accounts }));
  return { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, tables: perTable, hash };
}

/** Identifiants de compte cités par les lignes (et le propriétaire), triés. */
export function studioAccountIds(tables: StudioArchiveTables, ownerId: string): string[] {
  const ids = new Set<string>([ownerId]);
  for (const t of STUDIO_ARCHIVE_TABLES) for (const row of tables[t]) for (const c of STUDIO_USER_COLUMNS[t]) if (typeof row[c] === "string" && row[c]) ids.add(row[c] as string);
  return [...ids].sort();
}

/** Volumes cités par les paquets diffusés (identifiant = SHA-256 du contenu). */
export function packageVolumeIds(publications: readonly StudioArchiveRow[]): string[] {
  const ids = new Set<string>();
  for (const p of publications) {
    const files = (p["package"] as { files?: { sha256?: unknown }[] } | null | undefined)?.files;
    if (Array.isArray(files)) for (const f of files) if (typeof f?.sha256 === "string") ids.add(f.sha256);
  }
  return [...ids].sort();
}

/** Contenu d'un volume tel que `to_jsonb` l'écrit (`\x` + hexadécimal). */
export function volumeBytes(content: unknown): Buffer | null {
  if (typeof content !== "string" || !/^\\x([0-9a-f]{2})*$/i.test(content)) return null;
  return Buffer.from(content.slice(2), "hex");
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 256;

/**
 * Relecture d'une section Studio : forme, manifeste recalculé, références internes, empreintes de contenu. Toute
 * anomalie est une erreur (la section n'est pas restaurée en partie). Ne lit jamais la base.
 */
export function checkStudioArchive(raw: unknown): { ok: true; section: StudioArchiveSection } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ["section Studio illisible"] };
  if (raw["schema"] !== STUDIO_ARCHIVE_SCHEMA) return { ok: false, errors: [`schéma de section Studio non pris en charge : ${String(raw["schema"])}`] };
  const sv = raw["schemaVersion"];
  if (!isRecord(sv) || sv["document"] !== STUDIO_ARCHIVE_SCHEMA_VERSION.document) errors.push("version du document Studio non prise en charge");
  if (!isId(raw["sourceProjectId"]) || !isId(raw["ownerId"])) errors.push("projet ou propriétaire d'origine absent");
  const accounts = Array.isArray(raw["accounts"]) ? raw["accounts"] : null;
  if (!accounts || accounts.some((a) => !isRecord(a) || !isId(a["id"]) || typeof a["email"] !== "string")) errors.push("comptes cités illisibles");
  const rawTables = raw["tables"];
  if (!isRecord(rawTables)) return { ok: false, errors: [...errors, "tables absentes"] };
  const tables = emptyStudioTables();
  for (const t of STUDIO_ARCHIVE_TABLES) {
    const rows = rawTables[t];
    if (!Array.isArray(rows) || rows.some((r) => !isRecord(r))) { errors.push(`table ${t} illisible`); continue; }
    tables[t] = rows as StudioArchiveRow[];
    const keys = new Set<string>();
    for (const r of tables[t]) {
      if (STUDIO_TABLE_KEYS[t].some((k) => r[k] === undefined || r[k] === null)) errors.push(`${t} : ligne sans clé`);
      const k = keyOf(t, r);
      if (keys.has(k)) errors.push(`${t} : clé en double ${k}`);
      keys.add(k);
    }
  }
  if (errors.length) return { ok: false, errors };

  // Manifeste : effectifs et empreintes recalculés depuis les lignes reçues.
  const manifest = raw["manifest"];
  const expected = buildStudioManifest(tables, { sourceProjectId: raw["sourceProjectId"] as string, ownerId: raw["ownerId"] as string, accounts: accounts as StudioArchiveAccount[] });
  if (!isRecord(manifest) || !isRecord(manifest["tables"])) errors.push("manifeste Studio absent");
  else {
    for (const t of STUDIO_ARCHIVE_TABLES) {
      const m = (manifest["tables"] as Record<string, unknown>)[t];
      if (!isRecord(m) || m["count"] !== expected.tables[t].count) errors.push(`${t} : effectif différent du manifeste`);
      else if (m["hash"] !== expected.tables[t].hash) errors.push(`${t} : empreinte différente du manifeste`);
    }
    if (manifest["hash"] !== expected.hash) errors.push("empreinte globale différente du manifeste");
  }

  // Références internes : tout parent cité est dans la section (aucune ligne ne pointe hors du projet archivé).
  const ids = (t: StudioArchiveTable, col = "id") => new Set(tables[t].map((r) => r[col] as string));
  const studies = ids("studio_studies"), variants = ids("studio_variants"),observations = ids("studio_observations", "comment_id"), publications = ids("studio_publications"), vols = ids("volumes");
  const revisionVariant = new Map(tables.studio_revisions.map((r) => [r["id"] as string, r["variant_id"] as string]));
  const commentVariant = new Map(tables.studio_comments.map((r) => [r["id"] as string, r["variant_id"] as string]));
  const sameVariantRevision = (variant: unknown, revision: unknown) => revision === null || revision === undefined || revisionVariant.get(revision as string) === variant;
  for (const r of tables.studio_studies) {
    if (r["project_id"] !== raw["sourceProjectId"]) errors.push(`étude ${String(r["id"])} : autre projet`);
    const initial = tables.studio_variants.find((v) => v["id"] === r["initial_variant_id"]);
    if (!initial || initial["study_id"] !== r["id"]) errors.push(`étude ${String(r["id"])} : variante initiale absente`);
  }
  for (const r of tables.studio_variants) {
    if (!studies.has(r["study_id"] as string)) errors.push(`variante ${String(r["id"])} : étude absente`);
    if (revisionVariant.get(r["head_revision_id"] as string) !== r["id"]) errors.push(`variante ${String(r["id"])} : tête absente`);
    if (r["derived_from_revision_id"] && revisionVariant.get(r["derived_from_revision_id"] as string) !== r["derived_from_variant_id"]) errors.push(`variante ${String(r["id"])} : provenance absente`);
  }
  for (const r of tables.studio_revisions) {
    if (!variants.has(r["variant_id"] as string)) errors.push(`révision ${String(r["id"])} : variante absente`);
    if (!sameVariantRevision(r["variant_id"], r["parent_revision_id"])) errors.push(`révision ${String(r["id"])} : parente absente`);
    if (typeof r["payload_hash"] !== "string" || !/^[0-9a-f]{64}$/.test(r["payload_hash"])) errors.push(`révision ${String(r["id"])} : empreinte de requête invalide`);
    if (!isRecord(r["document"])) errors.push(`révision ${String(r["id"])} : document absent`);
  }
  for (const r of tables.studio_comments) {
    if (!variants.has(r["variant_id"] as string)) errors.push(`commentaire ${String(r["id"])} : variante absente`);
    if (!sameVariantRevision(r["variant_id"], r["revision_id"])) errors.push(`commentaire ${String(r["id"])} : révision absente`);
    if (r["parent_id"] && commentVariant.get(r["parent_id"] as string) !== r["variant_id"]) errors.push(`commentaire ${String(r["id"])} : parent absent`);
  }
  for (const r of tables.studio_observations) {
    if (commentVariant.get(r["comment_id"] as string) !== r["variant_id"]) errors.push(`observation ${String(r["comment_id"])} : commentaire absent`);
    if (!sameVariantRevision(r["variant_id"], r["correction_revision_id"]) || !sameVariantRevision(r["variant_id"], r["recontrole_revision_id"])) errors.push(`observation ${String(r["comment_id"])} : révision absente`);
  }
  for (const r of tables.studio_observation_events) if (!observations.has(r["observation_id"] as string)) errors.push(`passage ${String(r["id"])} : observation absente`);
  for (const r of tables.studio_study_steps) if (!studies.has(r["study_id"] as string)) errors.push(`lien d'étape : étude ${String(r["study_id"])} absente`);
  for (const r of tables.volumes) {
    const bytes = volumeBytes(r["content"]);
    if (!bytes || sha256(bytes) !== r["id"]) errors.push(`volume ${String(r["id"])} : contenu différent de son empreinte`);
  }
  const documents = new Map(tables.studio_revisions.map((r) => [r["id"] as string, r["document"]]));
  for (const r of tables.studio_publications) {
    if (r["project_id"] !== raw["sourceProjectId"]) errors.push(`publication ${String(r["id"])} : autre projet`);
    if (!studies.has(r["study_id"] as string) || revisionVariant.get(r["revision_id"] as string) !== r["variant_id"]) errors.push(`publication ${String(r["id"])} : révision absente`);
    else if (studioArchiveDocumentHash(documents.get(r["revision_id"] as string)) !== r["document_hash"]) errors.push(`publication ${String(r["id"])} : empreinte du document différente de la révision`);
    const pkg = r["package"];
    if (pkg !== null && pkg !== undefined) {
      if (!isRecord(pkg) || r["package_hash"] !== sha256(canonicalJson(pkg))) errors.push(`publication ${String(r["id"])} : empreinte du paquet différente`);
      for (const id of packageVolumeIds([r])) if (!vols.has(id)) errors.push(`publication ${String(r["id"])} : fichier ${id} absent`);
    }
  }
  for (const r of tables.studio_publication_events) if (!publications.has(r["publication_id"] as string)) errors.push(`évènement ${String(r["id"])} : publication absente`);
  for (const r of tables.project_members) if (r["project_id"] !== raw["sourceProjectId"]) errors.push(`membre ${String(r["user_id"])} : autre projet`);
  const known = new Set((accounts ?? []).map((a) => (a as StudioArchiveAccount).id));
  for (const id of studioAccountIds(tables, raw["ownerId"] as string)) if (!known.has(id)) errors.push(`compte ${id} cité sans adresse`);

  if (errors.length) return { ok: false, errors };
  return { ok: true, section: { ...(raw as unknown as StudioArchiveSection), tables } };
}

/** Commentaires dans un ordre d'insertion valable (parent avant réponse ; la contrainte n'est pas différée). */
export function orderCommentsForInsert(rows: readonly StudioArchiveRow[]): StudioArchiveRow[] {
  const byId = new Map(rows.map((r) => [r["id"] as string, r]));
  const out: StudioArchiveRow[] = [];
  const done = new Set<string>();
  const visit = (r: StudioArchiveRow, depth: number) => {
    const id = r["id"] as string;
    if (done.has(id) || depth > rows.length) return;
    const parent = r["parent_id"] ? byId.get(r["parent_id"] as string) : undefined;
    if (parent) visit(parent, depth + 1);
    if (!done.has(id)) { done.add(id); out.push(r); }
  };
  for (const r of sortStudioRows("studio_comments", rows)) visit(r, 0);
  return out;
}

/**
 * Lignes prêtes à réinsérer : projet remplacé, comptes réattribués (`accountMap` : identifiant d'origine → identifiant
 * dans la base cible). Les autres colonnes restent strictement identiques.
 */
export function remapStudioRows(table: StudioArchiveTable, rows: readonly StudioArchiveRow[], projectId: string, accountMap: ReadonlyMap<string, string>): StudioArchiveRow[] {
  const projectCols = STUDIO_PROJECT_COLUMNS[table] ?? [];
  const userCols = STUDIO_USER_COLUMNS[table];
  return (table === "studio_comments" ? orderCommentsForInsert(rows) : sortStudioRows(table, rows)).map((row) => {
    const out: StudioArchiveRow = { ...row };
    for (const c of projectCols) out[c] = projectId;
    for (const c of userCols) if (typeof out[c] === "string" && accountMap.has(out[c] as string)) out[c] = accountMap.get(out[c] as string)!;
    return out;
  });
}

/**
 * Réattribution des comptes : même adresse dans la base cible → même personne ; sinon le compte qui restaure
 * (déclaré). `found` : adresse en minuscules → identifiant dans la base cible.
 */
export function mapStudioAccounts(accounts: readonly StudioArchiveAccount[], found: ReadonlyMap<string, string>, importerId: string): { map: Map<string, string>; reassigned: string[] } {
  const map = new Map<string, string>();
  const reassigned: string[] = [];
  for (const a of accounts) {
    const target = found.get(a.email.toLowerCase());
    if (target) map.set(a.id, target);
    else { map.set(a.id, importerId); reassigned.push(a.email || a.id); }
  }
  return { map, reassigned: reassigned.sort() };
}

/** Statuts dont l'approbation est retirée quand l'archive n'est pas vérifiée : ils reviennent « à relire » (soumis). */
export const STUDIO_APPROVED_STATUSES: readonly string[] = ["approuve", "diffuse"];
export const STUDIO_DOWNGRADE_COMMENT = "Restauration d'une archive non vérifiée : approbation d'origine non reprise, nouvelle approbation exigée.";

/**
 * Archive non vérifiée (signature absente, inconnue ou invalide) : rien n'en est cru. Les lignes déjà remappées (tous
 * les comptes → le compte qui restaure) perdent leurs approbations : une publication approuvée ou diffusée revient
 * `soumis` (« à relire »), son paquet et son contenu restent lisibles, et un passage `soumettre` daté de la restauration
 * l'inscrit au journal (append-only : les évènements d'origine ne sont pas réécrits). Pure : identifiants et date fournis.
 */
export function distrustStudioPublications(
  publications: readonly StudioArchiveRow[], variants: readonly StudioArchiveRow[], importerId: string, now: string, newEventId: () => string,
): { publications: StudioArchiveRow[]; events: StudioArchiveRow[]; downgraded: number } {
  const heads = new Map(variants.map((v) => [v["id"] as string, v["head_revision_id"] as string]));
  const events: StudioArchiveRow[] = [];
  let downgraded = 0;
  const out = publications.map((p) => {
    const row: StudioArchiveRow = { ...p, approved_revision_id: null, approved_document_hash: null, approved_by: null, approved_at: null };
    if (STUDIO_APPROVED_STATUSES.includes(p["status"] as string)) {
      downgraded += 1;
      row["status"] = "soumis";
      row["updated_at"] = now;
      events.push({
        id: newEventId(), publication_id: p["id"], action: "soumettre", from_status: p["status"], to_status: "soumis", author_id: importerId,
        comment: STUDIO_DOWNGRADE_COMMENT, revision_id: p["revision_id"], document_hash: p["document_hash"],
        head_revision_id: heads.get(p["variant_id"] as string) ?? p["revision_id"], created_at: now,
      });
    }
    return row;
  });
  return { publications: out, events, downgraded };
}
