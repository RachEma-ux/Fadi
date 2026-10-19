/**
 * Publications Studio (E.4-01 à E.4-06, E.3-06) — un dossier de publication porte sur UNE révision d'une variante
 * principale, éventuellement coordonnée avec d'autres variantes de la même étude ; le serveur fait seul autorité.
 * Règles pures (dimensions de statut, droits, manifeste, concordance de l'approbation) : `studio-publication-statuts.ts`.
 *
 * Trois dimensions distinctes (E.4-01) : travail (`brouillon` → `en-revue` → `approuve` | `refuse`), diffusion
 * (`non-diffuse` → `diffuse` → `retire` | `remplace`) et actualité (`a-jour` | `perimee`, calculée à chaque lecture en
 * comparant le manifeste figé aux têtes des variantes sources et aux métadonnées gelées). Le statut combiné historique
 * `status` reste tenu pour le module Documents et le refus de suppression d'un projet.
 *
 * Droits (E.4-02), correspondance prudente avec les rôles de projet (`owned-project.ts`) :
 *   - lecture (dossier, manifeste, journal, fichiers, vérification) : `read` → propriétaire, éditeur, lecteur ;
 *   - revue (préparer, soumettre, actualiser) : `write` → propriétaire, éditeur ;
 *   - approbation (approuver, refuser) : `owner` → propriétaire seul ;
 *   - publication (diffuser, retirer ; remplacement d'une diffusion antérieure) : `owner` → propriétaire seul.
 * Toute transition est aussi une écriture : la réservation d'édition d'un autre compte la bloque (423), jamais la lecture.
 *
 * Manifeste figé multi-sources (E.4-03) : construit à la préparation et à chaque actualisation — sources (révision et
 * empreinte du document de chaque variante), métadonnées gelées, empreintes des documents du paquet (SVG, DXF, IFC,
 * feuille PDF calculés par les exporteurs purs de `@parcours/atelier-model`). Approbation (E.4-04) : `approuver` exige
 * `manifestHash`, l'empreinte du manifeste examiné (révision et empreinte du document vérifiées si fournies), sinon 409
 * `revision_mismatch`. Diffusion (E.4-05) : le serveur recalcule le manifeste courant depuis les têtes et les noms
 * actuels ; s'il diffère du manifeste approuvé, 409 `manifest_mismatch` (rien n'est écrit) et une nouvelle approbation
 * est requise (actualiser → soumettre → approuver). Les fichiers diffusés sont ceux du manifeste approuvé, rangés dans
 * `volumes` (identifiant = SHA-256). Retrait et remplacement (E.4-06) : journalisés (auteur, date, motif, dossier
 * remplaçant) dans un journal append-only ; rien n'est supprimé, un paquet retiré ou remplacé reste lisible.
 *
 * Catalogue des Documents (E.3-06) : `listProjectStudioPackages` sert `GET /projects/:p/studio/publications`, lu par
 * `lib/documents.ts` (groupe « Studio — paquets diffusés »).
 */
import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { composerFeuilleStudio, exportStudioDxf, exportStudioIfc, exportStudioSvg, studioSheetPdf, validateStudioDocument, type StudioDocument } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import {
  studioPublicationEvents, studioPublications, studioRevisions, studioStudies, studioVariants, users, volumes,
  type StudioPackageFile, type StudioPackageFormat, type StudioPublicationAction, type StudioPublicationDiffusionStatus, type StudioPublicationManifest,
  type StudioPublicationPackage, type StudioPublicationStatus, type StudioPublicationWorkStatus,
} from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import { newId } from "./ids.js";
import { loadProjectAccess, projectAccessRefusal, type AccessibleProject } from "./owned-project.js";
import type { Querier } from "./step-rows.js";
import { assertAccess, lockedAccess, notFound, StudioRequestError, studioArchivedRefusal, studioFileSegment, studioIdentifierSchema, studyOf } from "./studio-commands.js";
import {
  actualiteDe, actualiteParEmpreinte, actualiteVue, besoinTransition, CacheRegeneration, cleRegeneration, type ControleDocuments, canonicalJson, construireManifeste, controlerApprobation, controlerEnsembleExamine, controlerTransition,
  diffusionPlusRecente, dimensionsDe, ecartsManifeste, empreinteManifeste, sha256, statutCombine, STUDIO_PUBLICATION_ACTIONS,
  type Actualite, type Dimensions, type EcartManifeste, type ManifesteDocument, type ManifesteMeta, type ManifesteSource, type StudioPublicationTransition,
} from "./studio-publication-statuts.js";

export { canonicalJson, STUDIO_PUBLICATION_ACTIONS, type StudioPublicationTransition };
export const STUDIO_PACKAGE_FORMATS: readonly StudioPackageFormat[] = ["svg", "dxf", "ifc", "pdf"];
const MIME: Readonly<Record<StudioPackageFormat, string>> = Object.freeze({
  svg: "image/svg+xml; charset=utf-8", dxf: "application/dxf", ifc: "application/x-step", pdf: "application/pdf",
});
/** Au plus dix variantes coordonnées par dossier. */
export const STUDIO_MAX_COORDINATED = 10;

const comment = z.string().trim().min(1).max(2000);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const studioPublicationCreateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  revisionId: studioIdentifierSchema.optional(),
  /** Autres variantes de la même étude coordonnées dans le manifeste (révision courante de chacune). */
  coordinatedVariantIds: z.array(studioIdentifierSchema).max(STUDIO_MAX_COORDINATED).optional(),
  comment: comment.optional(),
  requestId: studioIdentifierSchema.optional(),
}).strict();
export const studioPublicationTransitionSchema = z.object({
  comment: comment.optional(),
  manifestHash: hash.optional(),
  revisionId: studioIdentifierSchema.optional(),
  documentHash: hash.optional(),
}).strict();
export type StudioPublicationCreateInput = z.infer<typeof studioPublicationCreateSchema>;
export type StudioPublicationTransitionInput = z.infer<typeof studioPublicationTransitionSchema>;

/** Empreinte du document d'une révision : SHA-256 du JSON canonique du document tel qu'il est stocké (jamais de sa forme validée). */
export const studioDocumentHash = (doc: StudioDocument): string => sha256(canonicalJson(doc));

/** Fichiers d'un paquet, pur et déterministe : mêmes document et métadonnées, mêmes octets. */
export function studioPackageFiles(doc: StudioDocument, revisionId: string, meta: StudioPublicationPackage["meta"], ifcKey: string): { format: StudioPackageFormat; fileName: string; mime: string; body: Buffer }[] {
  const base = [studioFileSegment(meta.studyName, "etude"), studioFileSegment(meta.variantName, "variante"), studioFileSegment(revisionId.slice(-8), "revision")].join("-");
  const sheet = composerFeuilleStudio(doc, {
    format: "A3", orientation: "paysage", scale: "ajuster",
    titleBlock: { projectCode: meta.projectCode, projectName: meta.projectName, study: meta.studyName, variant: meta.variantName, revisionId, revisionDate: meta.revisionCreatedAt.slice(0, 10) },
  });
  const bodies: Record<StudioPackageFormat, Buffer> = {
    svg: Buffer.from(exportStudioSvg(doc), "utf8"),
    dxf: Buffer.from(exportStudioDxf(doc), "utf8"),
    ifc: Buffer.from(exportStudioIfc(doc, { studyName: meta.studyName, variantName: meta.variantName, revisionId, timestamp: meta.revisionCreatedAt.slice(0, 19), key: ifcKey }), "utf8"),
    pdf: Buffer.from(studioSheetPdf(sheet)),
  };
  return STUDIO_PACKAGE_FORMATS.map((format) => ({ format, fileName: `${base}${format === "pdf" ? "-feuille" : ""}.${format}`, mime: MIME[format], body: bodies[format] }));
}
/**
 * Version des exporteurs du paquet (SVG, DXF, IFC, feuille PDF), entrée de la clé du cache de régénération : à
 * incrémenter avec toute modification des exporteurs ou de `studioPackageFiles`. Le cache vit en mémoire du processus :
 * un déploiement (redémarrage) le vide de toute façon.
 */
export const STUDIO_PACKAGE_EXPORTER_VERSION = "studio-package-exports/1";
/** Cache des empreintes de documents régénérés, lu par les vues de liste et rempli par les lectures exactes. */
const regenerationCache = new CacheRegeneration();
const regenerationKey = (documentHash: string, meta: StudioPublicationPackage["meta"], studyId: string, variantId: string): string =>
  cleRegeneration({ documentHash, meta, ifcKey: `${studyId}|${variantId}`, versionExporteurs: STUDIO_PACKAGE_EXPORTER_VERSION });
const manifestDocumentsOf = (files: ReturnType<typeof studioPackageFiles>) =>
  files.map((f) => ({ format: f.format, fileName: f.fileName, mime: f.mime, size: f.body.byteLength, sha256: sha256(f.body) }));

/** Empreinte globale d'un paquet : SHA-256 du manifeste canonique du paquet. */
export const studioPackageHash = (pkg: StudioPublicationPackage): string => sha256(canonicalJson(pkg));

type Who = { id: string; email: string };
export interface StudioPublicationEventView {
  id: string; action: StudioPublicationAction; fromStatus: StudioPublicationStatus | null; toStatus: StudioPublicationStatus;
  workStatus: StudioPublicationWorkStatus | null; diffusionStatus: StudioPublicationDiffusionStatus | null;
  author: Who; comment: string | null; revisionId: string; documentHash: string; manifestHash: string | null; headRevisionId: string;
  relatedPublicationId: string | null; createdAt: string;
}
export interface StudioPublicationView {
  id: string; projectId: string; studyId: string; variantId: string; variantName: string; title: string;
  revisionId: string; documentHash: string;
  /** Statut combiné historique (lecteurs existants). */
  status: StudioPublicationStatus;
  /** Dimensions distinctes (E.4-01). */
  workStatus: StudioPublicationWorkStatus; diffusionStatus: StudioPublicationDiffusionStatus;
  /** Manifeste figé (null : dossier antérieur au lot E.4, à actualiser). */
  manifest: StudioPublicationManifest | null; manifestHash: string | null; manifestBuiltAt: string | null;
  createdBy: Who; createdAt: string; updatedAt: string;
  approval: { revisionId: string; documentHash: string; manifestHash: string | null; by: Who | null; at: string | null } | null;
  diffusion: { by: Who | null; at: string | null; packageHash: string; manifestHash: string | null; files: StudioPackageFile[] } | null;
  /** Actualité des contenus dérivés et écarts constatés (source déplacée, métadonnée renommée). */
  headRevisionId: string; freshness: Actualite; drift: EcartManifeste[];
  /** Documents régénérés comparés (`verifiee`) ou non (`non-verifiee` : vue de liste sans régénération en cache, ou dossier déjà périmé par ses sources). */
  documentsCheck: ControleDocuments;
  /** Diffusion plus récente qui remplace celle-ci, sinon null. */
  replacedBy: string | null;
  replacement: { publicationId: string; by: Who | null; at: string | null } | null;
  withdrawal: { by: Who; at: string; comment: string | null } | null;
  /** Indications d'interface ; le serveur revérifie chaque transition. */
  allowed: StudioPublicationTransition[];
  events?: StudioPublicationEventView[];
}

type PublicationRow = typeof studioPublications.$inferSelect;
type VariantState = { id: string; studyId: string; name: string; headRevisionId: string; archivedAt: Date | null; studyName: string; studyArchivedAt: Date | null };

async function emails(q: Querier, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}

async function variantStates(q: Querier, ids: string[]): Promise<Map<string, VariantState>> {
  if (!ids.length) return new Map();
  const rows = await q.select({
    id: studioVariants.id, studyId: studioVariants.studyId, name: studioVariants.name, headRevisionId: studioVariants.headRevisionId, archivedAt: studioVariants.archivedAt,
    studyName: studioStudies.name, studyArchivedAt: studioStudies.archivedAt,
  }).from(studioVariants).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId)).where(inArray(studioVariants.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r]));
}

const sourceIds = (row: PublicationRow): string[] => [row.variantId, ...(row.manifest?.sources.map((s) => s.variantId) ?? [])];

/**
 * Écarts et actualité d'un dossier d'après l'état courant de ses sources (dossier antérieur : tête de la variante seule) ;
 * `documents` : documents régénérés maintenant à partir des mêmes entrées, comparés empreinte par empreinte.
 */
function driftOf(access: AccessibleProject, row: PublicationRow, states: Map<string, VariantState>, documents?: ManifesteDocument[] | null): EcartManifeste[] {
  const primary = states.get(row.variantId);
  if (!row.manifest) {
    const head = primary?.headRevisionId ?? null;
    return head === row.revisionId ? [] : [{ type: "source", role: "principale", variantId: row.variantId, revisionFigee: row.revisionId, revisionCourante: head }];
  }
  return ecartsManifeste(row.manifest, currentSources(row.manifest, states), currentNames(access, primary), documents);
}
const currentSources = (m: StudioPublicationManifest, states: Map<string, VariantState>) =>
  m.sources.map((s) => ({ variantId: s.variantId, headRevisionId: states.get(s.variantId)?.headRevisionId ?? null }));
const currentNames = (access: AccessibleProject, primary: VariantState | undefined) =>
  ({ projectCode: access.code, projectName: access.name, studyName: primary?.studyName ?? "", variantName: primary?.name ?? "" });

/**
 * Documents régénérés des dossiers dont les sources et les noms n'ont pas bougé (les autres sont déjà périmés) : mêmes
 * révision et métadonnées figées, exporteurs d'aujourd'hui.
 *   - `exact` (lecture d'un dossier, transitions) : régénération complète, résultat rangé dans le cache ;
 *   - liste : aucune exportation, seul le cache est lu ; un dossier absent du cache a ses documents « non vérifiée ».
 */
async function regeneratedDocuments(q: Querier, access: AccessibleProject, rows: PublicationRow[], states: Map<string, VariantState>, exact: boolean): Promise<Map<string, ManifesteDocument[]>> {
  const out = new Map<string, ManifesteDocument[]>();
  for (const row of rows) {
    if (!row.manifest || driftOf(access, row, states).length) continue;
    const key = regenerationKey(row.documentHash, row.manifest.meta, row.studyId, row.variantId);
    if (!exact) {
      const cached = regenerationCache.get(key);
      if (cached) out.set(row.id, cached);
      continue;
    }
    const revision = await revisionOf(q, row.variantId, row.revisionId);
    const docs = manifestDocumentsOf(studioPackageFiles(validateStudioDocument(revision.document), row.revisionId, row.manifest.meta, `${row.studyId}|${row.variantId}`));
    regenerationCache.set(key, docs);
    out.set(row.id, docs);
  }
  return out;
}

function allowedFor(access: AccessibleProject, actorId: string, dims: Dimensions, row: PublicationRow, freshness: Actualite, archived: boolean): StudioPublicationTransition[] {
  return STUDIO_PUBLICATION_ACTIONS.filter((action) => {
    if (!controlerTransition(action, { ...dims, manifeste: row.manifest !== null, actualite: freshness }, "-").ok) return false;
    if (action === "diffuser" && (freshness === "perimee" || !row.approvedManifestHash)) return false;
    if (archived && action !== "retirer") return false;
    return projectAccessRefusal(access, actorId, besoinTransition(action)) === null;
  });
}

/**
 * Vues des dossiers : variantes sources, actualité, remplacement, retrait et droits calculés en une passe. `withEvents`
 * (lecture d'un dossier, réponse d'une transition) vaut aussi contrôle exact des documents ; une liste lit le cache seul.
 */
async function views(q: Querier, access: AccessibleProject, actorId: string, rows: PublicationRow[], withEvents = false): Promise<StudioPublicationView[]> {
  if (!rows.length) return [];
  const states = await variantStates(q, rows.flatMap(sourceIds));
  const variantIds = [...new Set(rows.map((r) => r.variantId))];
  // Remplacement d'un dossier antérieur au lot E.4 (sans colonne de remplacement) : diffusion plus récente de la même variante.
  const legacy = rows.some((r) => r.diffusionStatus === null && r.diffusedAt);
  const diffused = legacy
    ? await q.select({ id: studioPublications.id, variantId: studioPublications.variantId, diffusedAt: studioPublications.diffusedAt, status: studioPublications.status })
      .from(studioPublications).where(inArray(studioPublications.variantId, variantIds))
    : [];
  const eventsRows = await q.select().from(studioPublicationEvents).where(inArray(studioPublicationEvents.publicationId, rows.map((r) => r.id)))
    .orderBy(asc(studioPublicationEvents.createdAt), asc(studioPublicationEvents.id));
  const mails = await emails(q, [...rows.flatMap((r) => [r.createdBy, r.approvedBy, r.diffusedBy, r.replacedBy]), ...eventsRows.map((e) => e.authorId)]);
  const who = (id: string | null) => (id ? { id, email: mails.get(id) ?? "" } : null);
  const regenerated = await regeneratedDocuments(q, access, rows, states, withEvents);
  return rows.map((row) => {
    const variant = states.get(row.variantId);
    // Documents : comparés si régénérés (lecture exacte ou cache), sinon « non vérifiée » ; jamais « à jour » par défaut.
    const vue = row.manifest ? actualiteVue(row.manifest, currentSources(row.manifest, states), currentNames(access, variant), regenerated.get(row.id)) : null;
    const drift = vue ? vue.ecarts : driftOf(access, row, states);
    const freshness = vue ? vue.actualite : actualiteDe(drift);
    const documentsCheck: ControleDocuments = vue ? vue.documents : "non-verifiee";
    // Dossier antérieur au lot E.4 : remplacement déduit de la diffusion plus récente (statut combiné inchangé).
    const later = row.replacedByPublicationId === null && row.diffusionStatus === null ? diffusionPlusRecente(row, diffused) : null;
    const derived = dimensionsDe(row);
    const dims: Dimensions = later && derived.diffusion === "diffuse" ? { ...derived, diffusion: "remplace" } : derived;
    const replacedBy = row.replacedByPublicationId ?? later;
    const own = eventsRows.filter((e) => e.publicationId === row.id);
    const retrait = dims.diffusion === "retire" ? own.filter((e) => e.action === "retirer").at(-1) : undefined;
    const view: StudioPublicationView = {
      id: row.id, projectId: row.projectId, studyId: row.studyId, variantId: row.variantId, variantName: variant?.name ?? "", title: row.title,
      revisionId: row.revisionId, documentHash: row.documentHash, status: row.status,
      workStatus: dims.travail, diffusionStatus: dims.diffusion,
      manifest: row.manifest, manifestHash: row.manifestHash, manifestBuiltAt: row.manifestBuiltAt?.toISOString() ?? null,
      createdBy: who(row.createdBy)!, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      approval: row.approvedRevisionId && row.approvedDocumentHash
        ? { revisionId: row.approvedRevisionId, documentHash: row.approvedDocumentHash, manifestHash: row.approvedManifestHash, by: who(row.approvedBy), at: row.approvedAt?.toISOString() ?? null } : null,
      diffusion: row.package && row.packageHash
        ? { by: who(row.diffusedBy), at: row.diffusedAt?.toISOString() ?? null, packageHash: row.packageHash, manifestHash: row.package.manifestHash ?? null, files: row.package.files } : null,
      headRevisionId: variant?.headRevisionId ?? row.revisionId, freshness, drift, documentsCheck,
      replacedBy,
      replacement: replacedBy ? { publicationId: replacedBy, by: who(row.replacedBy), at: row.replacedAt?.toISOString() ?? null } : null,
      withdrawal: retrait ? { by: who(retrait.authorId)!, at: retrait.createdAt.toISOString(), comment: retrait.comment } : null,
      allowed: allowedFor(access, actorId, dims, row, freshness, variant ? variant.archivedAt !== null || variant.studyArchivedAt !== null : true),
    };
    if (withEvents) {
      view.events = own.map((e) => ({
        id: e.id, action: e.action, fromStatus: e.fromStatus, toStatus: e.toStatus, workStatus: e.workStatus, diffusionStatus: e.diffusionStatus,
        author: who(e.authorId)!, comment: e.comment, revisionId: e.revisionId, documentHash: e.documentHash, manifestHash: e.manifestHash,
        headRevisionId: e.headRevisionId, relatedPublicationId: e.relatedPublicationId, createdAt: e.createdAt.toISOString(),
      }));
    }
    return view;
  });
}

/** Variante de l'étude (déjà vérifiée du projet), sinon 404. */
async function variantOf(q: Querier, studyId: string, variantId: string) {
  const [variant] = await q.select().from(studioVariants).where(and(eq(studioVariants.id, variantId), eq(studioVariants.studyId, studyId))).limit(1);
  return variant ?? notFound();
}

async function revisionOf(q: Querier, variantId: string, revisionId: string) {
  const [revision] = await q.select({ id: studioRevisions.id, document: studioRevisions.document, createdAt: studioRevisions.createdAt }).from(studioRevisions)
    .where(and(eq(studioRevisions.id, revisionId), eq(studioRevisions.variantId, variantId))).limit(1);
  return revision ?? notFound();
}

type Study = Awaited<ReturnType<typeof studyOf>>;
type Variant = Awaited<ReturnType<typeof variantOf>>;
type Revision = Awaited<ReturnType<typeof revisionOf>>;
interface Dossier {
  manifest: StudioPublicationManifest; manifestHash: string; documentHash: string;
  meta: StudioPublicationPackage["meta"]; files: ReturnType<typeof studioPackageFiles>;
}

/**
 * Dossier calculé depuis l'état présent : révision principale donnée, tête courante de chaque variante coordonnée,
 * noms actuels gelés dans les métadonnées, documents exportés de façon déterministe.
 */
async function construireDossier(q: Querier, access: AccessibleProject, study: Study, variant: Variant, revision: Revision, coordinated: readonly string[]): Promise<Dossier> {
  const documentHash = studioDocumentHash(revision.document);
  const sources: ManifesteSource[] = [{ role: "principale", variantId: variant.id, revisionId: revision.id, documentHash }];
  for (const id of coordinated) {
    const other = await variantOf(q, study.id, id);
    const head = await revisionOf(q, other.id, other.headRevisionId);
    sources.push({ role: "coordonnee", variantId: other.id, revisionId: head.id, documentHash: studioDocumentHash(head.document) });
  }
  const meta: ManifesteMeta = { projectCode: access.code, projectName: access.name, studyName: study.name, variantName: variant.name, revisionCreatedAt: revision.createdAt.toISOString() };
  const files = studioPackageFiles(validateStudioDocument(revision.document), revision.id, meta, `${study.id}|${variant.id}`);
  const documents = manifestDocumentsOf(files);
  regenerationCache.set(regenerationKey(documentHash, meta, study.id, variant.id), documents);
  const manifest = construireManifeste(sources, meta, documents);
  return { manifest, manifestHash: empreinteManifeste(manifest), documentHash, meta, files };
}
const coordinatedOf = (manifest: StudioPublicationManifest | null): string[] => manifest?.sources.filter((s) => s.role === "coordonnee").map((s) => s.variantId) ?? [];

interface JournalEntry {
  action: StudioPublicationAction; from: StudioPublicationStatus | null; to: StudioPublicationStatus; dims: Dimensions;
  authorId: string; comment: string | undefined | null; headRevisionId: string; at: Date; related?: string | null;
}
async function journal(tx: Tx, row: Pick<PublicationRow, "id" | "revisionId" | "documentHash" | "manifestHash">, e: JournalEntry) {
  await tx.insert(studioPublicationEvents).values({
    id: newId("studio_publication_event"), publicationId: row.id, action: e.action, fromStatus: e.from, toStatus: e.to,
    workStatus: e.dims.travail, diffusionStatus: e.dims.diffusion, authorId: e.authorId, comment: e.comment ?? null,
    revisionId: row.revisionId, documentHash: row.documentHash, manifestHash: row.manifestHash, headRevisionId: e.headRevisionId,
    relatedPublicationId: e.related ?? null, createdAt: e.at,
  });
}

/** Refus de suppression d'un projet (E.4-06) : une publication diffusée ou retirée ne s'efface jamais. */
export const PUBLICATIONS_DIFFUSEES_MESSAGE =
  "Ce projet porte des publications Studio diffusées ou retirées : elles sont conservées et le projet ne peut pas être supprimé.";
export async function projectHasIssuedStudioPublications(q: Querier, projectId: string): Promise<boolean> {
  const [row] = await q.select({ id: studioPublications.id }).from(studioPublications)
    .where(and(eq(studioPublications.projectId, projectId), inArray(studioPublications.status, ["diffuse", "retire"]))).limit(1);
  return row !== undefined;
}

/** Publications d'une étude (tous statuts), plus récentes d'abord ; droit `read`. */
export async function listStudyPublications(projectId: string, studyId: string, actorId: string): Promise<{ publications: StudioPublicationView[] }> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const study = await studyOf(db, projectId, studyId);
  const rows = await db.select().from(studioPublications).where(and(eq(studioPublications.projectId, projectId), eq(studioPublications.studyId, study.id)))
    .orderBy(desc(studioPublications.createdAt), desc(studioPublications.id));
  return { publications: await views(db, access, actorId, rows) };
}

/** Paquets diffusés du projet (diffusés puis retirés ou remplacés compris, marqués) : liste servie au module Documents (E.3-06). */
export async function listProjectStudioPackages(projectId: string, actorId: string) {
  const access = assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const rows = await db.select().from(studioPublications)
    .where(and(eq(studioPublications.projectId, projectId), inArray(studioPublications.status, ["diffuse", "retire"])))
    .orderBy(desc(studioPublications.diffusedAt), desc(studioPublications.id));
  const studies = await db.select({ id: studioStudies.id, name: studioStudies.name }).from(studioStudies).where(eq(studioStudies.projectId, projectId));
  const names = new Map(studies.map((s) => [s.id, s.name]));
  const list = (await views(db, access, actorId, rows.filter((r) => r.package !== null))).map((v) => ({ ...v, studyName: names.get(v.studyId) ?? "" }));
  return { packages: list };
}

export async function readStudioPublication(projectId: string, studyId: string, publicationId: string, actorId: string): Promise<StudioPublicationView> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const study = await studyOf(db, projectId, studyId);
  const [row] = await db.select().from(studioPublications)
    .where(and(eq(studioPublications.id, publicationId), eq(studioPublications.studyId, study.id), eq(studioPublications.projectId, projectId))).limit(1);
  if (!row) return notFound();
  return (await views(db, access, actorId, [row], true))[0]!;
}

/** Nouveau dossier (travail `brouillon`, diffusion `non-diffuse`) d'une révision de la variante (tête par défaut), manifeste figé ; droit `write`. */
export async function createStudioPublication(projectId: string, studyId: string, variantId: string, actorId: string, input: StudioPublicationCreateInput): Promise<StudioPublicationView & { replayed: boolean }> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    const variant = await variantOf(tx, study.id, variantId);
    assertAccess(access, actorId, "write");
    const coordinated = [...new Set(input.coordinatedVariantIds ?? [])];
    if (coordinated.includes(variant.id)) {
      throw new StudioRequestError(400, { error: "invalid_input", code: "coordinated_variant_invalid", message: "Une variante coordonnée doit être distincte de la variante publiée." });
    }
    const revision = await revisionOf(tx, variant.id, input.revisionId ?? variant.headRevisionId);
    const title = input.title ?? `${study.name} — ${variant.name}`;
    if (input.requestId !== undefined) {
      const [previous] = await tx.select().from(studioPublications).where(and(eq(studioPublications.variantId, variant.id), eq(studioPublications.requestId, input.requestId))).limit(1);
      if (previous) {
        const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
        if (previous.createdBy !== actorId || (input.revisionId !== undefined && previous.revisionId !== input.revisionId) || (input.title !== undefined && previous.title !== input.title)
          || (input.coordinatedVariantIds !== undefined && !same(coordinated, coordinatedOf(previous.manifest)))) {
          throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur." });
        }
        return { ...(await views(tx, access, actorId, [previous], true))[0]!, replayed: true };
      }
    }
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    for (const id of coordinated) {
      const other = await variantOf(tx, study.id, id).catch(() => {
        throw new StudioRequestError(400, { error: "invalid_input", code: "coordinated_variant_invalid", variantId: id, message: "Variante coordonnée inconnue dans cette étude." });
      });
      if (other.archivedAt !== null) return studioArchivedRefusal();
    }
    const dossier = await construireDossier(tx, access, study, variant, revision, coordinated);
    const now = new Date();
    const dims: Dimensions = { travail: "brouillon", diffusion: "non-diffuse" };
    const row = {
      id: newId("studio_publication"), projectId, studyId: study.id, variantId: variant.id, revisionId: revision.id, documentHash: dossier.documentHash, title,
      status: statutCombine(dims), workStatus: dims.travail, diffusionStatus: dims.diffusion,
      manifest: dossier.manifest, manifestHash: dossier.manifestHash, manifestBuiltAt: now,
      requestId: input.requestId ?? null, createdBy: actorId, createdAt: now, updatedAt: now,
    };
    await tx.insert(studioPublications).values(row);
    await journal(tx, row, { action: "creer", from: null, to: row.status, dims, authorId: actorId, comment: input.comment, headRevisionId: variant.headRevisionId, at: now });
    const [stored] = await tx.select().from(studioPublications).where(eq(studioPublications.id, row.id)).limit(1);
    return { ...(await views(tx, access, actorId, [stored!], true))[0]!, replayed: false };
  });
}

/** Transition d'un dossier : dimensions de départ, droit, commentaire, manifeste examiné ou courant, journal. */
export async function transitionStudioPublication(projectId: string, studyId: string, publicationId: string, actorId: string, action: StudioPublicationTransition, input: StudioPublicationTransitionInput): Promise<StudioPublicationView> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    const [row] = await tx.select().from(studioPublications)
      .where(and(eq(studioPublications.id, publicationId), eq(studioPublications.studyId, study.id), eq(studioPublications.projectId, projectId))).for("update");
    if (!row) return notFound();
    assertAccess(access, actorId, besoinTransition(action));
    // Toute transition est une écriture : la réservation d'édition d'un autre compte la bloque (423), propriétaire compris.
    assertAccess(access, actorId, "write");
    const variant = await variantOf(tx, study.id, row.variantId);
    const dims = dimensionsDe(row);
    // Manifeste recalculé maintenant (têtes, noms et exporteurs actuels) : son empreinte fait foi pour l'actualité, de
    // sorte qu'un dossier dont seuls les octets d'export ont changé peut toujours être actualisé (jamais bloqué).
    const current = row.manifest
      ? await construireDossier(tx, access, study, variant, await revisionOf(tx, variant.id, variant.headRevisionId), coordinatedOf(row.manifest))
      : null;
    const freshness = current ? actualiteParEmpreinte(row.manifestHash, current.manifestHash) : actualiteDe(driftOf(access, row, await variantStates(tx, sourceIds(row))));
    const verdict = controlerTransition(action, { ...dims, manifeste: row.manifest !== null, actualite: freshness }, input.comment);
    if (!verdict.ok) throw new StudioRequestError(verdict.refus.status, verdict.refus.body);
    if (action !== "retirer" && (study.archivedAt !== null || variant.archivedAt !== null)) return studioArchivedRefusal();
    // Empreinte recalculée depuis la révision immuable : jamais crue sur parole.
    const revision = await revisionOf(tx, variant.id, row.revisionId);
    const actualHash = studioDocumentHash(revision.document);
    if (actualHash !== row.documentHash) throw new Error("studio_publication_hash_drift");
    const now = new Date();
    const vers = verdict.vers;
    const patch: Partial<typeof studioPublications.$inferInsert> = { status: statutCombine(vers), workStatus: vers.travail, diffusionStatus: vers.diffusion, updatedAt: now };
    let after: Pick<PublicationRow, "id" | "revisionId" | "documentHash" | "manifestHash"> = row;
    if (action === "approuver") {
      const refus = controlerEnsembleExamine(input, { manifestHash: row.manifestHash!, revisionId: row.revisionId, documentHash: actualHash });
      if (refus) throw new StudioRequestError(refus.status, refus.body);
      Object.assign(patch, { approvedRevisionId: row.revisionId, approvedDocumentHash: actualHash, approvedManifestHash: row.manifestHash, approvedBy: actorId, approvedAt: now });
    }
    if (action === "actualiser") {
      // Nouveau manifeste depuis les têtes courantes ; l'approbation précédente ne vaut plus (elle reste au journal).
      const head = await revisionOf(tx, variant.id, variant.headRevisionId);
      const dossier = current ?? await construireDossier(tx, access, study, variant, head, []);
      Object.assign(patch, {
        revisionId: head.id, documentHash: dossier.documentHash, manifest: dossier.manifest, manifestHash: dossier.manifestHash, manifestBuiltAt: now,
        approvedRevisionId: null, approvedDocumentHash: null, approvedManifestHash: null, approvedBy: null, approvedAt: null,
      });
      after = { id: row.id, revisionId: head.id, documentHash: dossier.documentHash, manifestHash: dossier.manifestHash };
    }
    if (action === "diffuser") {
      // Manifeste courant recalculé depuis les têtes et les noms actuels, comparé au manifeste approuvé (E.4-05).
      const refus = current ? controlerApprobation(row.approvedManifestHash, row.manifestHash, current.manifestHash) : controlerApprobation(null, null, "");
      if (refus || !current) {
        throw new StudioRequestError(refus!.status, {
          ...refus!.body, approvedRevisionId: row.approvedRevisionId, headRevisionId: variant.headRevisionId,
          drift: row.manifest && current
            ? ecartsManifeste(row.manifest, current.manifest.sources.map((s) => ({ variantId: s.variantId, headRevisionId: s.revisionId })), current.meta, current.manifest.documents) : [],
        });
      }
      const files: StudioPackageFile[] = [];
      for (const file of current.files) {
        const id = sha256(file.body);
        await tx.insert(volumes).values({ id, mime: file.mime, size: file.body.byteLength, content: file.body, createdAt: now }).onConflictDoNothing();
        files.push({ format: file.format, fileName: file.fileName, mime: file.mime, size: file.body.byteLength, sha256: id });
      }
      const pkg: StudioPublicationPackage = { schema: "studio-publication-package/1", revisionId: row.revisionId, documentHash: actualHash, meta: current.meta, files, manifestHash: current.manifestHash };
      Object.assign(patch, { package: pkg, packageHash: studioPackageHash(pkg), diffusedBy: actorId, diffusedAt: now });
      // Remplacement (E.4-06) : les diffusions encore en vigueur de la même variante sont marquées remplacées et journalisées.
      const previous = await tx.select().from(studioPublications).where(and(
        eq(studioPublications.variantId, row.variantId), ne(studioPublications.id, row.id),
        or(eq(studioPublications.diffusionStatus, "diffuse"), and(isNull(studioPublications.diffusionStatus), eq(studioPublications.status, "diffuse"), isNull(studioPublications.replacedAt))),
      )).for("update");
      for (const old of previous) {
        // Dossier antérieur au lot E.4 déjà remplacé par une diffusion plus récente : son remplacement (déduit) est conservé.
        if (old.diffusionStatus === null && diffusionPlusRecente(old, previous) !== null) continue;
        const oldDims = dimensionsDe(old);
        const replaced: Dimensions = { travail: oldDims.travail, diffusion: "remplace" };
        await tx.update(studioPublications).set({
          status: statutCombine(replaced), workStatus: replaced.travail, diffusionStatus: replaced.diffusion,
          replacedByPublicationId: row.id, replacedBy: actorId, replacedAt: now, updatedAt: now,
        }).where(eq(studioPublications.id, old.id));
        await journal(tx, old, { action: "remplacer", from: old.status, to: statutCombine(replaced), dims: replaced, authorId: actorId, comment: input.comment, headRevisionId: variant.headRevisionId, at: now, related: row.id });
      }
    }
    await tx.update(studioPublications).set(patch).where(eq(studioPublications.id, row.id));
    await journal(tx, after, { action, from: row.status, to: statutCombine(vers), dims: vers, authorId: actorId, comment: input.comment, headRevisionId: variant.headRevisionId, at: now });
    const [stored] = await tx.select().from(studioPublications).where(eq(studioPublications.id, row.id)).limit(1);
    return (await views(tx, access, actorId, [stored!], true))[0]!;
  });
}

async function packageOf(projectId: string, studyId: string, publicationId: string, actorId: string) {
  assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const study = await studyOf(db, projectId, studyId);
  const [row] = await db.select().from(studioPublications)
    .where(and(eq(studioPublications.id, publicationId), eq(studioPublications.studyId, study.id), eq(studioPublications.projectId, projectId))).limit(1);
  if (!row) return notFound();
  if (!row.package || !row.packageHash) throw new StudioRequestError(404, { error: "not_found", message: "Aucun paquet diffusé pour cette publication." });
  return { row, pkg: row.package };
}

/** Fichier figé d'un paquet (diffusé, remplacé ou retiré : l'historique reste lisible) ; contenu vérifié contre son empreinte. */
export async function readStudioPackageFile(projectId: string, studyId: string, publicationId: string, actorId: string, format: string) {
  const { row, pkg } = await packageOf(projectId, studyId, publicationId, actorId);
  const file = pkg.files.find((f) => f.format === format);
  if (!file) return notFound();
  const [volume] = await db.select().from(volumes).where(eq(volumes.id, file.sha256)).limit(1);
  if (!volume || sha256(volume.content) !== file.sha256) throw new Error("studio_package_volume_corrupt");
  return { file, content: volume.content, status: row.status, diffusionStatus: dimensionsDe(row).diffusion, packageHash: row.packageHash! };
}

/** Recalcule les exports depuis la révision et les métadonnées gelées : mêmes empreintes = paquet reproductible. */
export async function verifierPaquet(projectId: string, studyId: string, publicationId: string, actorId: string) {
  const { row, pkg } = await packageOf(projectId, studyId, publicationId, actorId);
  const revision = await revisionOf(db, row.variantId, pkg.revisionId);
  const recomputed = studioPackageFiles(validateStudioDocument(revision.document), pkg.revisionId, pkg.meta, `${row.studyId}|${row.variantId}`);
  const files = pkg.files.map((f) => {
    const again = recomputed.find((r) => r.format === f.format);
    const h = again ? sha256(again.body) : null;
    return { format: f.format, stored: f.sha256, recomputed: h, identical: h === f.sha256 };
  });
  // Le paquet reprend les empreintes de documents du manifeste approuvé (lot E.4 ; sans objet pour un paquet antérieur).
  const manifestDocuments = row.manifest && pkg.manifestHash === row.approvedManifestHash
    ? pkg.files.every((f) => row.manifest!.documents.some((d) => d.format === f.format && d.sha256 === f.sha256)) : null;
  return {
    publicationId: row.id, packageHash: row.packageHash!, packageHashRecomputed: studioPackageHash(pkg),
    documentHash: studioDocumentHash(revision.document), manifestHash: pkg.manifestHash ?? null, manifestDocuments, files,
    identical: files.every((f) => f.identical) && studioPackageHash(pkg) === row.packageHash && manifestDocuments !== false,
  };
}
