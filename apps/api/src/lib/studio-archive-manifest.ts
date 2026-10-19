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
import { dimensionsDe, statutCombine, type Dimensions, type StatutCombine, type StatutDiffusion, type StatutTravail } from "./studio-publication-statuts.js";

export const STUDIO_ARCHIVE_SCHEMA = "fadi-studio-archive/1";
/** Version du schéma Studio couvert (document des révisions et jeu de tables de `init.sql`). */
export const STUDIO_ARCHIVE_SCHEMA_VERSION = { document: "studio-document/1", tables: "studio-v1/2026-10-19.3" } as const;
/**
 * Versions antérieures des tables encore relues, avec les tables qu'elles ne portaient pas encore (lues vides, hors
 * manifeste : l'empreinte d'une archive antérieure reste celle de ses propres tables). Toute autre version est refusée.
 * `studio-v1/2026-10-19` : avant les ajustements du métré (E.3-05, `studio_quantity_adjustments`) ;
 * `studio-v1/2026-10-19.2` : avant les feuilles composées et les dossiers de conception (E.3-02 / E.3-03).
 */
export const STUDIO_ARCHIVE_PREVIOUS_TABLE_VERSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "studio-v1/2026-10-19": ["studio_quantity_adjustments", "studio_sheets", "studio_dossiers"],
  "studio-v1/2026-10-19.2": ["studio_sheets", "studio_dossiers"],
});

/** Tables archivées, dans l'ordre d'insertion (parents d'abord). `project_members` porte les droits du projet. */
export const STUDIO_ARCHIVE_TABLES = [
  "studio_studies",
  "studio_variants",
  "studio_revisions",
  "studio_comments",
  "studio_observations",
  "studio_observation_events",
  "studio_study_steps",
  "studio_requirement_sets",
  "studio_requirement_checks",
  "studio_quantity_adjustments",
  "studio_sheets",
  "studio_dossiers",
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
  studio_requirement_sets: ["id"],
  studio_requirement_checks: ["id"],
  studio_quantity_adjustments: ["id"],
  studio_sheets: ["id"],
  studio_dossiers: ["id"],
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
  studio_requirement_sets: ["author_id"],
  studio_requirement_checks: ["author_id"],
  studio_quantity_adjustments: ["author_id"],
  studio_sheets: ["created_by"],
  studio_dossiers: ["created_by"],
  volumes: [],
  studio_publications: ["approved_by", "diffused_by", "created_by", "replaced_by"],
  studio_publication_events: ["author_id"],
  // `invited_by` garde l'adresse de l'invitant (texte, sans clé étrangère) : historique conservé tel quel.
  project_members: ["user_id"],
  studio_tool_preferences: ["user_id"],
});

/**
 * Inventaire des champs JSON (`jsonb`) des tables archivées qui citent un compte, réattribués à l'import d'une archive
 * vérifiée par la même règle que les colonnes (adresse → compte de la base cible, sinon le compte qui restaure).
 * Seul champ concerné : l'acceptation d'une référence partenaire (lot E.1), `par` (identifiant) et `parEmail` (adresse).
 */
export const STUDIO_JSON_ACCOUNT_FIELDS: Readonly<Partial<Record<StudioArchiveTable, readonly string[]>>> = Object.freeze({
  studio_requirement_sets: ["requirements[].origine.acceptation.par", "requirements[].origine.acceptation.parEmail"],
});
/**
 * Champs JSON des tables archivées examinés et sans compte : document, enveloppe et réponse des révisions (géométrie,
 * commandes, contexte étude / variante / révision), ancrages des commentaires, résultat d'un contrôle (écarts par
 * exigence), paquet et manifeste figés d'une publication (sources, métadonnées, fichiers), préférences d'outils
 * (identifiants d'outils). Les journaux (publications, observations) n'ont pas de champ JSON : leurs acteurs sont des
 * colonnes (`STUDIO_USER_COLUMNS`). Un test confronte ces deux listes aux colonnes `jsonb` de `init.sql`.
 */
export const STUDIO_JSON_FIELDS_WITHOUT_ACCOUNTS: Readonly<Partial<Record<StudioArchiveTable, readonly string[]>>> = Object.freeze({
  studio_revisions: ["document", "envelope", "response"],
  studio_comments: ["object_ids"],
  studio_requirement_checks: ["result"],
  // État de la cible d'un ajustement du métré (objet du document, quantités brutes) : aucun compte.
  studio_quantity_adjustments: ["target_state"],
  // Définition d'une feuille composée (numéro, titre, format, vue source, auteur saisi en texte) et feuilles d'un
  // dossier (identifiants) : aucun compte (l'auteur du cartouche est un texte saisi, jamais un identifiant de compte).
  studio_sheets: ["definition"],
  studio_dossiers: ["sheet_ids"],
  studio_publications: ["package", "manifest"],
  studio_tool_preferences: ["favorites", "personal"],
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
  "studio_observation_events", "studio_requirement_sets", "studio_requirement_checks", "studio_quantity_adjustments", "studio_sheets", "studio_dossiers", "studio_publications", "studio_publication_events",
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
export function buildStudioManifest(tables: StudioArchiveTables, identity: StudioArchiveIdentity, covered: readonly StudioArchiveTable[] = STUDIO_ARCHIVE_TABLES): StudioArchiveManifest {
  const perTable = Object.fromEntries(covered.map((t) => [t, { count: tables[t].length, hash: studioTableHash(t, tables[t]) }])) as Record<StudioArchiveTable, StudioTableManifest>;
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

/** Acceptations de référence partenaire d'une version de jeu d'exigences (objets lus tels quels). */
function acceptationsOf(set: StudioArchiveRow): Record<string, unknown>[] {
  const list = Array.isArray(set["requirements"]) ? (set["requirements"] as unknown[]) : [];
  return list.flatMap((e) => (isRecord(e) && isRecord(e["origine"]) && isRecord(e["origine"]["acceptation"]) ? [e["origine"]["acceptation"]] : []));
}

/** Identifiants de compte cités dans les champs JSON (`STUDIO_JSON_ACCOUNT_FIELDS`), triés. */
export function studioJsonAccountIds(tables: StudioArchiveTables): string[] {
  const ids = new Set<string>();
  for (const s of tables.studio_requirement_sets) for (const a of acceptationsOf(s)) if (typeof a["par"] === "string" && a["par"]) ids.add(a["par"]);
  return [...ids].sort();
}

/** Comptes à exporter : colonnes, propriétaire et champs JSON (l'adresse de chacun accompagne l'archive). */
export function studioExportAccountIds(tables: StudioArchiveTables, ownerId: string): string[] {
  return [...new Set([...studioAccountIds(tables, ownerId), ...studioJsonAccountIds(tables)])].sort();
}

/**
 * Archive vérifiée : réattribution des comptes cités dans les champs JSON, par la même table de correspondance que les
 * colonnes (`found` : identifiant d'origine → compte RETROUVÉ par son adresse dans la base cible, identifiant et
 * adresse). `parEmail`, quand il est présent, prend l'adresse du compte retrouvé. Une acceptation dont l'acceptant
 * n'est pas retrouvé (compte absent de la base cible, ou cité sans adresse dans l'archive) n'est jamais attribuée à
 * quelqu'un d'autre : elle est retirée, comme pour une archive non vérifiée (`distrustRequirementSets`), la référence
 * redevient « non acceptée » ; `cleared` compte les acceptations retirées, `clearedAccounts` liste leurs acceptants
 * d'origine. Le reste du contenu est inchangé. Pure, sans effet sur l'entrée.
 */
export function remapStudioJsonAccounts(
  sets: readonly StudioArchiveRow[], found: ReadonlyMap<string, { id: string; email: string }>,
): { sets: StudioArchiveRow[]; remapped: number; cleared: number; clearedAccounts: string[] } {
  let remapped = 0;
  let cleared = 0;
  const lost = new Set<string>();
  const out = sets.map((s) => {
    if (!Array.isArray(s["requirements"])) return { ...s };
    return {
      ...s,
      requirements: (s["requirements"] as unknown[]).map((e) => {
        if (!isRecord(e) || !isRecord(e["origine"]) || !isRecord(e["origine"]["acceptation"])) return e;
        const acc = e["origine"]["acceptation"];
        const source = typeof acc["par"] === "string" ? acc["par"] : "";
        const target = found.get(source);
        if (!target) {
          cleared += 1;
          lost.add(source || "(vide)");
          const { acceptation: _retiree, ...origine } = e["origine"];
          void _retiree;
          return { ...e, origine };
        }
        remapped += 1;
        return { ...e, origine: { ...e["origine"], acceptation: { ...acc, par: target.id, ...(acc["parEmail"] !== undefined ? { parEmail: target.email } : {}) } } };
      }),
    };
  });
  return { sets: out, remapped, cleared, clearedAccounts: [...lost].sort() };
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
  // Disposition des lignes lue par `jsonb_populate_recordset` : une autre version des tables est refusée, jamais devinée ;
  // une version antérieure déclarée (`STUDIO_ARCHIVE_PREVIOUS_TABLE_VERSIONS`) est relue sans les tables qu'elle n'avait pas.
  const tableVersion = isRecord(sv) ? sv["tables"] : undefined;
  const absentes = typeof tableVersion === "string" && Object.hasOwn(STUDIO_ARCHIVE_PREVIOUS_TABLE_VERSIONS, tableVersion) ? STUDIO_ARCHIVE_PREVIOUS_TABLE_VERSIONS[tableVersion]! : null;
  if (tableVersion !== STUDIO_ARCHIVE_SCHEMA_VERSION.tables && !absentes) errors.push("version des tables Studio non prise en charge");
  const covered = STUDIO_ARCHIVE_TABLES.filter((t) => !(absentes ?? []).includes(t));
  if (!isId(raw["sourceProjectId"]) || !isId(raw["ownerId"])) errors.push("projet ou propriétaire d'origine absent");
  const accounts = Array.isArray(raw["accounts"]) ? raw["accounts"] : null;
  if (!accounts || accounts.some((a) => !isRecord(a) || !isId(a["id"]) || typeof a["email"] !== "string")) errors.push("comptes cités illisibles");
  const rawTables = raw["tables"];
  if (!isRecord(rawTables)) return { ok: false, errors: [...errors, "tables absentes"] };
  const tables = emptyStudioTables();
  for (const t of STUDIO_ARCHIVE_TABLES) {
    const rows = rawTables[t];
    if (!covered.includes(t)) {
      if (rows !== undefined) errors.push(`table ${t} inattendue dans cette version`);
      continue;
    }
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
  const expected = buildStudioManifest(tables, { sourceProjectId: raw["sourceProjectId"] as string, ownerId: raw["ownerId"] as string, accounts: accounts as StudioArchiveAccount[] }, covered);
  if (!isRecord(manifest) || !isRecord(manifest["tables"])) errors.push("manifeste Studio absent");
  else {
    for (const t of covered) {
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
  // Lot E.1 : jeux d'exigences versionnés (append-only) et contrôles liés à une révision et à une version du jeu.
  const setVersions = new Set<string>();
  for (const r of tables.studio_requirement_sets) {
    if (!studies.has(r["study_id"] as string)) errors.push(`jeu d'exigences ${String(r["id"])} : étude absente`);
    if (!Array.isArray(r["requirements"])) errors.push(`jeu d'exigences ${String(r["id"])} : exigences illisibles`);
    const k = `${String(r["study_id"])}|${String(r["version"])}`;
    if (setVersions.has(k)) errors.push(`jeu d'exigences ${String(r["id"])} : version en double`);
    setVersions.add(k);
  }
  const variantStudy = new Map(tables.studio_variants.map((v) => [v["id"] as string, v["study_id"] as string]));
  const revisionDocuments = new Map(tables.studio_revisions.map((r) => [r["id"] as string, r["document"]]));
  for (const r of tables.studio_requirement_checks) {
    if (variantStudy.get(r["variant_id"] as string) !== r["study_id"]) errors.push(`contrôle ${String(r["id"])} : variante absente`);
    if (revisionVariant.get(r["revision_id"] as string) !== r["variant_id"]) errors.push(`contrôle ${String(r["id"])} : révision absente`);
    else if (studioArchiveDocumentHash(revisionDocuments.get(r["revision_id"] as string)) !== r["document_hash"]) errors.push(`contrôle ${String(r["id"])} : empreinte du document différente de la révision`);
    if (r["set_version"] !== null && r["set_version"] !== undefined && !setVersions.has(`${String(r["study_id"])}|${String(r["set_version"])}`)) errors.push(`contrôle ${String(r["id"])} : version du jeu absente`);
  }
  // Ajustements du métré (E.3-05) : journal d'une variante de l'étude, lié à une révision de cette variante, séquence unique.
  const sequences = new Set<string>();
  for (const r of tables.studio_quantity_adjustments) {
    if (variantStudy.get(r["variant_id"] as string) !== r["study_id"]) errors.push(`ajustement ${String(r["id"])} : variante absente`);
    if (revisionVariant.get(r["revision_id"] as string) !== r["variant_id"]) errors.push(`ajustement ${String(r["id"])} : révision absente`);
    const k = `${String(r["variant_id"])}|${String(r["seq"])}`;
    if (sequences.has(k)) errors.push(`ajustement ${String(r["id"])} : séquence en double`);
    sequences.add(k);
    if (!isRecord(r["target_state"])) errors.push(`ajustement ${String(r["id"])} : état de la cible illisible`);
    if (typeof r["motif"] !== "string" || !r["motif"].trim()) errors.push(`ajustement ${String(r["id"])} : motif absent`);
  }
  // Feuilles composées (E.3-02) : variante de l'étude, révision de cette variante, définition lisible, numéro unique par
  // étude ; dossiers (E.3-03) : étude de la section, feuilles de la même étude, métré complet (variante et révision).
  const numeros = new Set<string>();
  const sheetStudy = new Map(tables.studio_sheets.map((r) => [r["id"] as string, r["study_id"] as string]));
  for (const r of tables.studio_sheets) {
    if (variantStudy.get(r["variant_id"] as string) !== r["study_id"]) errors.push(`feuille ${String(r["id"])} : variante absente`);
    if (revisionVariant.get(r["revision_id"] as string) !== r["variant_id"]) errors.push(`feuille ${String(r["id"])} : révision absente`);
    if (!isRecord(r["definition"])) errors.push(`feuille ${String(r["id"])} : définition illisible`);
    const k = `${String(r["study_id"])}|${String(r["number"])}`;
    if (numeros.has(k)) errors.push(`feuille ${String(r["id"])} : numéro en double`);
    numeros.add(k);
  }
  for (const r of tables.studio_dossiers) {
    if (!studies.has(r["study_id"] as string)) errors.push(`dossier ${String(r["id"])} : étude absente`);
    const feuilles = Array.isArray(r["sheet_ids"]) ? (r["sheet_ids"] as unknown[]) : null;
    if (!feuilles) errors.push(`dossier ${String(r["id"])} : feuilles illisibles`);
    else for (const id of feuilles) if (sheetStudy.get(id as string) !== r["study_id"]) errors.push(`dossier ${String(r["id"])} : feuille ${String(id)} absente`);
    const qv = r["quantities_variant_id"], qr = r["quantities_revision_id"];
    if ((qv === null || qv === undefined) !== (qr === null || qr === undefined)) errors.push(`dossier ${String(r["id"])} : métré incomplet`);
    else if (qv !== null && qv !== undefined && (variantStudy.get(qv as string) !== r["study_id"] || revisionVariant.get(qr as string) !== qv)) errors.push(`dossier ${String(r["id"])} : révision du métré absente`);
  }
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
    // Lot E.4 : manifeste figé multi-sources (empreinte, sources de la section), approbation liée au manifeste, remplacement.
    const manifest = r["manifest"];
    if (manifest !== null && manifest !== undefined) {
      if (!isRecord(manifest) || r["manifest_hash"] !== sha256(canonicalJson(manifest))) errors.push(`publication ${String(r["id"])} : empreinte du manifeste différente`);
      else {
        const sources = Array.isArray(manifest["sources"]) ? manifest["sources"] : [];
        for (const s of sources) {
          const src = isRecord(s) ? s : {};
          if (revisionVariant.get(src["revisionId"] as string) !== src["variantId"]) errors.push(`publication ${String(r["id"])} : source ${String(src["variantId"])} absente`);
          else if (studioArchiveDocumentHash(documents.get(src["revisionId"] as string)) !== src["documentHash"]) errors.push(`publication ${String(r["id"])} : empreinte d'une source du manifeste différente`);
        }
      }
    } else if (r["manifest_hash"] !== null && r["manifest_hash"] !== undefined) errors.push(`publication ${String(r["id"])} : empreinte de manifeste sans manifeste`);
    if (r["approved_manifest_hash"] !== null && r["approved_manifest_hash"] !== undefined && r["approved_manifest_hash"] !== r["manifest_hash"]) errors.push(`publication ${String(r["id"])} : approbation d'un autre manifeste`);
    if (r["replaced_by_publication_id"] && !publications.has(r["replaced_by_publication_id"] as string)) errors.push(`publication ${String(r["id"])} : dossier remplaçant absent`);
  }
  for (const r of tables.studio_publication_events) {
    if (!publications.has(r["publication_id"] as string)) errors.push(`évènement ${String(r["id"])} : publication absente`);
    if (r["related_publication_id"] && !publications.has(r["related_publication_id"] as string)) errors.push(`évènement ${String(r["id"])} : dossier lié absent`);
  }
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

/** Publications dans un ordre d'insertion valable : le dossier remplaçant avant le dossier remplacé (clé non différée). */
export function orderPublicationsForInsert(rows: readonly StudioArchiveRow[]): StudioArchiveRow[] {
  const byId = new Map(rows.map((r) => [r["id"] as string, r]));
  const out: StudioArchiveRow[] = [];
  const done = new Set<string>();
  const visit = (r: StudioArchiveRow, depth: number) => {
    const id = r["id"] as string;
    if (done.has(id) || depth > rows.length) return;
    const target = r["replaced_by_publication_id"] ? byId.get(r["replaced_by_publication_id"] as string) : undefined;
    if (target) visit(target, depth + 1);
    if (!done.has(id)) { done.add(id); out.push(r); }
  };
  for (const r of sortStudioRows("studio_publications", rows)) visit(r, 0);
  return out;
}

/**
 * Lignes prêtes à réinsérer : projet remplacé, comptes réattribués (`accountMap` : identifiant d'origine → identifiant
 * dans la base cible). Les autres colonnes restent strictement identiques.
 */
export function remapStudioRows(table: StudioArchiveTable, rows: readonly StudioArchiveRow[], projectId: string, accountMap: ReadonlyMap<string, string>): StudioArchiveRow[] {
  const projectCols = STUDIO_PROJECT_COLUMNS[table] ?? [];
  const userCols = STUDIO_USER_COLUMNS[table];
  const ordered = table === "studio_comments" ? orderCommentsForInsert(rows) : table === "studio_publications" ? orderPublicationsForInsert(rows) : sortStudioRows(table, rows);
  return ordered.map((row) => {
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


export const STUDIO_DOWNGRADE_COMMENT = "Restauration d'une archive non vérifiée : approbation d'origine non reprise, diffusion d'origine retirée à la restauration (paquet conservé et lisible, plus en vigueur) ; nouvelle approbation exigée avant toute diffusion.";

/**
 * Archive non vérifiée (signature absente, inconnue ou invalide) : rien n'en est cru. Projection sur le modèle E.4
 * (`studio-publication-statuts.ts`), lignes déjà remappées (tout acteur → le compte qui restaure) :
 *   - travail : `approuve` → `en-revue` ; approbation effacée (révision, empreintes du document et du manifeste, auteur, date) ;
 *   - diffusion : `diffuse` → `non-diffuse` (« retiré à la restauration ») — seul état depuis lequel E.4 admet une nouvelle
 *     approbation puis une nouvelle diffusion ; `retire` et `remplace`, déjà hors vigueur, restent tels quels ;
 *   - statut combiné historique recalculé par `statutCombine`, comme E.4 le tient ;
 *   - manifeste, paquet et empreintes conservés (contenu lisible) ; un passage `soumettre` daté de la restauration
 *     l'inscrit au journal (append-only : les évènements d'origine ne sont pas réécrits).
 * Pure : identifiants et date fournis.
 */
export function distrustStudioPublications(
  publications: readonly StudioArchiveRow[], variants: readonly StudioArchiveRow[], importerId: string, now: string, newEventId: () => string,
): { publications: StudioArchiveRow[]; events: StudioArchiveRow[]; downgraded: number } {
  const heads = new Map(variants.map((v) => [v["id"] as string, v["head_revision_id"] as string]));
  const events: StudioArchiveRow[] = [];
  let downgraded = 0;
  const out = publications.map((p) => {
    const before = dimensionsDe({
      status: p["status"] as StatutCombine, workStatus: (p["work_status"] ?? null) as StatutTravail | null, diffusionStatus: (p["diffusion_status"] ?? null) as StatutDiffusion | null,
      approvedRevisionId: (p["approved_revision_id"] ?? null) as string | null, replacedAt: p["replaced_at"] ? new Date(p["replaced_at"] as string) : null,
    });
    const after: Dimensions = { travail: before.travail === "approuve" ? "en-revue" : before.travail, diffusion: before.diffusion === "diffuse" ? "non-diffuse" : before.diffusion };
    const row: StudioArchiveRow = {
      ...p, approved_revision_id: null, approved_document_hash: null, approved_manifest_hash: null, approved_by: null, approved_at: null,
      work_status: after.travail, diffusion_status: after.diffusion, status: statutCombine(after),
    };
    if (after.travail !== before.travail || after.diffusion !== before.diffusion) {
      downgraded += 1;
      row["updated_at"] = now;
      events.push({
        id: newEventId(), publication_id: p["id"], action: "soumettre", from_status: p["status"], to_status: row["status"], work_status: after.travail, diffusion_status: after.diffusion,
        author_id: importerId, comment: STUDIO_DOWNGRADE_COMMENT, revision_id: p["revision_id"], document_hash: p["document_hash"], manifest_hash: p["manifest_hash"] ?? null,
        head_revision_id: heads.get(p["variant_id"] as string) ?? p["revision_id"], related_publication_id: null, created_at: now,
      });
    }
    return row;
  });
  return { publications: out, events, downgraded };
}

/**
 * Archive non vérifiée, lot E.1 : l'acceptation d'une référence partenaire (qui, quand) n'est pas crue. Elle est retirée
 * de chaque version du jeu d'exigences réinsérée (lignes INSÉRÉES, jamais mises à jour : le jeu reste append-only) ;
 * la référence redevient « non acceptée » et doit être acceptée à nouveau dans le projet restauré. Le reste du contenu
 * (exigences, sources déclarées, motifs, empreintes de requête) est inchangé. Pure.
 */
export function distrustRequirementSets(sets: readonly StudioArchiveRow[]): { sets: StudioArchiveRow[]; cleared: number } {
  let cleared = 0;
  const out = sets.map((s) => {
    const list = Array.isArray(s["requirements"]) ? (s["requirements"] as unknown[]) : null;
    if (!list) return { ...s };
    return {
      ...s,
      requirements: list.map((e) => {
        if (!isRecord(e) || !isRecord(e["origine"]) || !("acceptation" in e["origine"])) return e;
        cleared += 1;
        const { acceptation: _retiree, ...origine } = e["origine"];
        void _retiree;
        return { ...e, origine };
      }),
    };
  });
  return { sets: out, cleared };
}
