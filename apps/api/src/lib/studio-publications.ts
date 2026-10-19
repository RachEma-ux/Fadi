/**
 * Publications Studio (E.4-01 à E.4-06, E.3-06) — une publication porte sur UNE révision d'une variante, identifiée par
 * son identifiant et l'empreinte SHA-256 de son document (JSON canonique, clés triées). Le serveur fait seul autorité.
 *
 * Trois dimensions distinctes (E.4-01) :
 *   - statut de travail : `travail` → `soumis` → `approuve` | `refuse` ;
 *   - diffusion : `approuve` → `diffuse` → `retire` (le retrait vaut pour tout statut non retiré ; jamais de suppression) ;
 *   - actualité (calculée, jamais stockée) : `a-jour` si la tête de la variante est encore la révision publiée,
 *     `perimee` sinon ; une diffusion plus récente de la même variante la marque `remplaceePar`.
 *
 * Droits (E.4-02), repris des rôles de projet existants (`owned-project.ts`, besoin → rôles) :
 *   - revue (lire le dossier, son journal, ses fichiers ; commenter la variante) : `read` / `comment` → propriétaire,
 *     éditeur, lecteur ;
 *   - préparer et soumettre (créer une publication, `soumettre`) : `write` → propriétaire, éditeur ;
 *   - approuver / refuser : `owner` → propriétaire seul ;
 *   - diffuser (publication) : `write` → propriétaire, éditeur, et seulement une publication approuvée ;
 *   - retirer : `owner` → propriétaire seul.
 * Une publication ne modifie pas le modèle : besoin `write` (et non `modify`), comme les publications de l'Atelier ;
 * la réservation d'édition d'un autre compte bloque les écritures (423), jamais la lecture.
 *
 * Approbation liée à l'ensemble examiné (E.4-04) : `approuver` exige `revisionId` et `documentHash` ; tous deux doivent
 * être ceux de la publication, recalculés depuis la révision immuable, sinon 409 `revision_mismatch`.
 * Approbation périmée (E.4-05) : `diffuser` est refusé (409 `stale_approval`, avec la révision approuvée et la tête)
 * dès que la tête de la variante n'est plus la révision approuvée ; le nouveau contrôle prévu est une nouvelle
 * publication de la nouvelle tête, soumise puis approuvée à son tour.
 * Retrait et remplacement (E.4-06) : chaque transition est journalisée (auteur, date, commentaire, révision, empreinte,
 * tête à l'instant) ; le journal est append-only (UPDATE refusée par déclencheur) et un paquet retiré reste lisible.
 *
 * Paquet figé (E.4-03, pour une variante) : à la diffusion, le serveur appelle les exporteurs purs de
 * `@parcours/atelier-model` (SVG, DXF, IFC, feuille PDF A3 paysage ajustée) sur le document de la révision approuvée,
 * avec des métadonnées gelées (noms, date de la révision) ; chaque fichier est rangé dans `volumes` (identifiant =
 * SHA-256) et le manifeste porte une empreinte globale. `verifierPaquet` recalcule les exports à partir des mêmes
 * entrées et compare les empreintes (déterminisme). Les documents produits ne sont pas traduits.
 *
 * Catalogue des Documents (E.3-06) : aucun point d'extension générique n'existe dans `lib/documents.ts` (groupes
 * figés) ; `listProjectStudioPackages` sert `GET /projects/:p/studio/publications`, que le module Documents peut lire
 * pour ajouter un groupe « Studio » (point d'intégration : `documentCatalogue`, hors du périmètre de ce lot).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { composerFeuilleStudio, exportStudioDxf, exportStudioIfc, exportStudioSvg, studioSheetPdf, validateStudioDocument, type StudioDocument } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import {
  studioPublicationEvents, studioPublications, studioRevisions, studioStudies, studioVariants, users, volumes,
  type StudioPackageFile, type StudioPackageFormat, type StudioPublicationAction, type StudioPublicationPackage, type StudioPublicationStatus,
} from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import { newId } from "./ids.js";
import { loadProjectAccess, projectAccessRefusal, type AccessibleProject, type ProjectNeed } from "./owned-project.js";
import type { Querier } from "./step-rows.js";
import { assertAccess, lockedAccess, notFound, StudioRequestError, studioArchivedRefusal, studioFileSegment, studioIdentifierSchema, studyOf } from "./studio-commands.js";

export const STUDIO_PUBLICATION_ACTIONS = ["soumettre", "approuver", "refuser", "diffuser", "retirer"] as const;
export type StudioPublicationTransition = (typeof STUDIO_PUBLICATION_ACTIONS)[number];
export const STUDIO_PACKAGE_FORMATS: readonly StudioPackageFormat[] = ["svg", "dxf", "ifc", "pdf"];
const MIME: Readonly<Record<StudioPackageFormat, string>> = Object.freeze({
  svg: "image/svg+xml; charset=utf-8", dxf: "application/dxf", ifc: "application/x-step", pdf: "application/pdf",
});

/** Transitions admises : statut de départ, statut d'arrivée, besoin de droit. */
const TRANSITIONS: Readonly<Record<StudioPublicationTransition, { from: readonly StudioPublicationStatus[]; to: StudioPublicationStatus; need: ProjectNeed; comment: "facultatif" | "requis" }>> = Object.freeze({
  soumettre: { from: ["travail"], to: "soumis", need: "write", comment: "facultatif" },
  approuver: { from: ["soumis"], to: "approuve", need: "owner", comment: "facultatif" },
  refuser: { from: ["soumis"], to: "refuse", need: "owner", comment: "requis" },
  diffuser: { from: ["approuve"], to: "diffuse", need: "write", comment: "facultatif" },
  retirer: { from: ["travail", "soumis", "approuve", "refuse", "diffuse"], to: "retire", need: "owner", comment: "requis" },
});

const comment = z.string().trim().min(1).max(2000);
export const studioPublicationCreateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  revisionId: studioIdentifierSchema.optional(),
  comment: comment.optional(),
  requestId: studioIdentifierSchema.optional(),
}).strict();
export const studioPublicationTransitionSchema = z.object({
  comment: comment.optional(),
  revisionId: studioIdentifierSchema.optional(),
  documentHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict();
export type StudioPublicationCreateInput = z.infer<typeof studioPublicationCreateSchema>;
export type StudioPublicationTransitionInput = z.infer<typeof studioPublicationTransitionSchema>;

/** JSON canonique (clés triées, ordre des tableaux conservé) : jsonb ne garde pas l'ordre des clés. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
/** Empreinte du document d'une révision : SHA-256 de son JSON canonique. */
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
/** Empreinte globale d'un paquet : SHA-256 du manifeste canonique. */
export const studioPackageHash = (pkg: StudioPublicationPackage): string => sha256(canonicalJson(pkg));

export interface StudioPublicationEventView {
  id: string; action: StudioPublicationAction; fromStatus: StudioPublicationStatus | null; toStatus: StudioPublicationStatus;
  author: { id: string; email: string }; comment: string | null; revisionId: string; documentHash: string; headRevisionId: string; createdAt: string;
}
export interface StudioPublicationView {
  id: string; projectId: string; studyId: string; variantId: string; variantName: string; title: string;
  revisionId: string; documentHash: string; status: StudioPublicationStatus;
  createdBy: { id: string; email: string }; createdAt: string; updatedAt: string;
  approval: { revisionId: string; documentHash: string; by: { id: string; email: string } | null; at: string | null } | null;
  diffusion: { by: { id: string; email: string } | null; at: string | null; packageHash: string; files: StudioPackageFile[] } | null;
  /** Actualité des contenus dérivés : la tête de la variante est-elle encore la révision publiée ? */
  headRevisionId: string; freshness: "a-jour" | "perimee";
  /** Diffusion plus récente de la même variante (remplacement), sinon null. */
  replacedBy: string | null;
  /** Indications d'interface ; le serveur revérifie chaque transition. */
  allowed: StudioPublicationTransition[];
  events?: StudioPublicationEventView[];
}

type PublicationRow = typeof studioPublications.$inferSelect;

async function emails(q: Querier, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}

function allowedFor(access: AccessibleProject, actorId: string, row: PublicationRow, archived: boolean): StudioPublicationTransition[] {
  return STUDIO_PUBLICATION_ACTIONS.filter((action) => {
    const t = TRANSITIONS[action];
    if (!t.from.includes(row.status)) return false;
    if (archived && action !== "retirer") return false;
    return projectAccessRefusal(access, actorId, t.need) === null;
  });
}

/** Vues des publications : variantes (nom, tête, archive), remplacement et droits calculés en une passe. */
async function views(q: Querier, access: AccessibleProject, actorId: string, rows: PublicationRow[], withEvents = false): Promise<StudioPublicationView[]> {
  if (!rows.length) return [];
  const variantIds = [...new Set(rows.map((r) => r.variantId))];
  const variants = await q.select({ id: studioVariants.id, name: studioVariants.name, headRevisionId: studioVariants.headRevisionId, archivedAt: studioVariants.archivedAt, studyArchivedAt: studioStudies.archivedAt })
    .from(studioVariants).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId)).where(inArray(studioVariants.id, variantIds));
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  // Remplacement : diffusions (même retirées ensuite) de chaque variante, par date de diffusion.
  const diffused = await q.select({ id: studioPublications.id, variantId: studioPublications.variantId, diffusedAt: studioPublications.diffusedAt, status: studioPublications.status })
    .from(studioPublications).where(inArray(studioPublications.variantId, variantIds));
  const eventsRows = withEvents
    ? await q.select().from(studioPublicationEvents).where(inArray(studioPublicationEvents.publicationId, rows.map((r) => r.id))).orderBy(asc(studioPublicationEvents.createdAt), asc(studioPublicationEvents.id))
    : [];
  const mails = await emails(q, [...rows.flatMap((r) => [r.createdBy, r.approvedBy, r.diffusedBy]), ...eventsRows.map((e) => e.authorId)]);
  const who = (id: string | null) => (id ? { id, email: mails.get(id) ?? "" } : null);
  return rows.map((row) => {
    const variant = byVariant.get(row.variantId);
    const later = row.diffusedAt
      ? diffused.filter((d) => d.variantId === row.variantId && d.id !== row.id && d.diffusedAt && d.status === "diffuse" && d.diffusedAt.getTime() > row.diffusedAt!.getTime())
        .sort((a, b) => a.diffusedAt!.getTime() - b.diffusedAt!.getTime())[0]
      : undefined;
    const head = variant?.headRevisionId ?? row.revisionId;
    const view: StudioPublicationView = {
      id: row.id, projectId: row.projectId, studyId: row.studyId, variantId: row.variantId, variantName: variant?.name ?? "", title: row.title,
      revisionId: row.revisionId, documentHash: row.documentHash, status: row.status,
      createdBy: who(row.createdBy)!, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      approval: row.approvedRevisionId && row.approvedDocumentHash
        ? { revisionId: row.approvedRevisionId, documentHash: row.approvedDocumentHash, by: who(row.approvedBy), at: row.approvedAt?.toISOString() ?? null } : null,
      diffusion: row.package && row.packageHash
        ? { by: who(row.diffusedBy), at: row.diffusedAt?.toISOString() ?? null, packageHash: row.packageHash, files: row.package.files } : null,
      headRevisionId: head, freshness: head === row.revisionId ? "a-jour" : "perimee",
      replacedBy: later?.id ?? null,
      allowed: allowedFor(access, actorId, row, variant ? variant.archivedAt !== null || variant.studyArchivedAt !== null : true),
    };
    if (withEvents) {
      view.events = eventsRows.filter((e) => e.publicationId === row.id).map((e) => ({
        id: e.id, action: e.action, fromStatus: e.fromStatus, toStatus: e.toStatus, author: who(e.authorId)!, comment: e.comment,
        revisionId: e.revisionId, documentHash: e.documentHash, headRevisionId: e.headRevisionId, createdAt: e.createdAt.toISOString(),
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

async function journal(tx: Tx, row: Pick<PublicationRow, "id" | "revisionId" | "documentHash">, action: StudioPublicationAction, from: StudioPublicationStatus | null, to: StudioPublicationStatus, authorId: string, text: string | undefined, headRevisionId: string, at: Date) {
  await tx.insert(studioPublicationEvents).values({
    id: newId("studio_publication_event"), publicationId: row.id, action, fromStatus: from, toStatus: to, authorId, comment: text ?? null,
    revisionId: row.revisionId, documentHash: row.documentHash, headRevisionId, createdAt: at,
  });
}

/** Publications d'une étude (tous statuts), plus récentes d'abord ; droit `read`. */
export async function listStudyPublications(projectId: string, studyId: string, actorId: string): Promise<{ publications: StudioPublicationView[] }> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const study = await studyOf(db, projectId, studyId);
  const rows = await db.select().from(studioPublications).where(and(eq(studioPublications.projectId, projectId), eq(studioPublications.studyId, study.id)))
    .orderBy(desc(studioPublications.createdAt), desc(studioPublications.id));
  return { publications: await views(db, access, actorId, rows) };
}

/** Paquets diffusés du projet (diffusés puis retirés compris, marqués) : liste servie au module Documents (E.3-06). */
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

/** Nouvelle publication (statut `travail`) d'une révision de la variante (tête par défaut) ; droit `write`. */
export async function createStudioPublication(projectId: string, studyId: string, variantId: string, actorId: string, input: StudioPublicationCreateInput): Promise<StudioPublicationView & { replayed: boolean }> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    const variant = await variantOf(tx, study.id, variantId);
    assertAccess(access, actorId, "write");
    const revision = await revisionOf(tx, variant.id, input.revisionId ?? variant.headRevisionId);
    const documentHash = studioDocumentHash(validateStudioDocument(revision.document));
    const title = input.title ?? `${study.name} — ${variant.name}`;
    if (input.requestId !== undefined) {
      const [previous] = await tx.select().from(studioPublications).where(and(eq(studioPublications.variantId, variant.id), eq(studioPublications.requestId, input.requestId))).limit(1);
      if (previous) {
        if (previous.createdBy !== actorId || previous.revisionId !== revision.id || previous.title !== title) {
          throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur." });
        }
        return { ...(await views(tx, access, actorId, [previous], true))[0]!, replayed: true };
      }
    }
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    const now = new Date();
    const row = {
      id: newId("studio_publication"), projectId, studyId: study.id, variantId: variant.id, revisionId: revision.id, documentHash, title,
      status: "travail" as const, requestId: input.requestId ?? null, createdBy: actorId, createdAt: now, updatedAt: now,
    };
    await tx.insert(studioPublications).values(row);
    await journal(tx, row, "creer", null, "travail", actorId, input.comment, variant.headRevisionId, now);
    const [stored] = await tx.select().from(studioPublications).where(eq(studioPublications.id, row.id)).limit(1);
    return { ...(await views(tx, access, actorId, [stored!], true))[0]!, replayed: false };
  });
}

/** Transition d'une publication : statut de départ, droit, commentaire, liaison à la révision examinée, tête. */
export async function transitionStudioPublication(projectId: string, studyId: string, publicationId: string, actorId: string, action: StudioPublicationTransition, input: StudioPublicationTransitionInput): Promise<StudioPublicationView> {
  const rule = TRANSITIONS[action];
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    const [row] = await tx.select().from(studioPublications)
      .where(and(eq(studioPublications.id, publicationId), eq(studioPublications.studyId, study.id), eq(studioPublications.projectId, projectId))).for("update");
    if (!row) return notFound();
    assertAccess(access, actorId, rule.need);
    const variant = await variantOf(tx, study.id, row.variantId);
    if (!rule.from.includes(row.status)) {
      throw new StudioRequestError(409, { error: "invalid_transition", status: row.status, action, message: `Transition « ${action} » impossible depuis le statut « ${row.status} ».` });
    }
    if (action !== "retirer" && (study.archivedAt !== null || variant.archivedAt !== null)) return studioArchivedRefusal();
    if (rule.comment === "requis" && !input.comment) {
      throw new StudioRequestError(400, { error: "invalid_input", code: "comment_required", message: "Un commentaire est requis pour cette transition." });
    }
    // Empreinte recalculée depuis la révision immuable : jamais crue sur parole.
    const revision = await revisionOf(tx, variant.id, row.revisionId);
    const actualHash = studioDocumentHash(validateStudioDocument(revision.document));
    if (actualHash !== row.documentHash) throw new Error("studio_publication_hash_drift");
    const now = new Date();
    const patch: Partial<typeof studioPublications.$inferInsert> = { status: rule.to, updatedAt: now };
    if (action === "approuver") {
      if (!input.revisionId || !input.documentHash) {
        throw new StudioRequestError(400, { error: "invalid_input", code: "examined_set_required", message: "L'approbation porte sur la révision et l'empreinte examinées : revisionId et documentHash sont requis." });
      }
      if (input.revisionId !== row.revisionId || input.documentHash !== actualHash) {
        throw new StudioRequestError(409, { error: "revision_mismatch", publicationRevisionId: row.revisionId, publicationDocumentHash: actualHash, examinedRevisionId: input.revisionId, examinedDocumentHash: input.documentHash, message: "L'ensemble examiné n'est pas celui de la publication." });
      }
      Object.assign(patch, { approvedRevisionId: row.revisionId, approvedDocumentHash: actualHash, approvedBy: actorId, approvedAt: now });
    }
    if (action === "diffuser") {
      if (!row.approvedRevisionId || row.approvedDocumentHash !== actualHash) throw new Error("studio_publication_without_approval");
      if (variant.headRevisionId !== row.approvedRevisionId) {
        throw new StudioRequestError(409, {
          error: "stale_approval", approvedRevisionId: row.approvedRevisionId, headRevisionId: variant.headRevisionId,
          message: "La variante a changé depuis l'approbation : publiez la nouvelle révision, soumise et approuvée à son tour.",
        });
      }
      const meta = { projectCode: access.code, projectName: access.name, studyName: study.name, variantName: variant.name, revisionCreatedAt: revision.createdAt.toISOString() };
      const files: StudioPackageFile[] = [];
      for (const file of studioPackageFiles(validateStudioDocument(revision.document), row.revisionId, meta, `${row.studyId}|${row.variantId}`)) {
        const id = sha256(file.body);
        await tx.insert(volumes).values({ id, mime: file.mime, size: file.body.byteLength, content: file.body, createdAt: now }).onConflictDoNothing();
        files.push({ format: file.format, fileName: file.fileName, mime: file.mime, size: file.body.byteLength, sha256: id });
      }
      const pkg: StudioPublicationPackage = { schema: "studio-publication-package/1", revisionId: row.revisionId, documentHash: actualHash, meta, files };
      Object.assign(patch, { package: pkg, packageHash: studioPackageHash(pkg), diffusedBy: actorId, diffusedAt: now });
    }
    await tx.update(studioPublications).set(patch).where(eq(studioPublications.id, row.id));
    await journal(tx, row, action, row.status, rule.to, actorId, input.comment, variant.headRevisionId, now);
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

/** Fichier figé d'un paquet (diffusé ou retiré : l'historique reste lisible) ; contenu vérifié contre son empreinte. */
export async function readStudioPackageFile(projectId: string, studyId: string, publicationId: string, actorId: string, format: string) {
  const { row, pkg } = await packageOf(projectId, studyId, publicationId, actorId);
  const file = pkg.files.find((f) => f.format === format);
  if (!file) return notFound();
  const [volume] = await db.select().from(volumes).where(eq(volumes.id, file.sha256)).limit(1);
  if (!volume || sha256(volume.content) !== file.sha256) throw new Error("studio_package_volume_corrupt");
  return { file, content: volume.content, status: row.status, packageHash: row.packageHash! };
}

/** Recalcule les exports depuis la révision et les métadonnées gelées : mêmes empreintes = paquet reproductible. */
export async function verifierPaquet(projectId: string, studyId: string, publicationId: string, actorId: string) {
  const { row, pkg } = await packageOf(projectId, studyId, publicationId, actorId);
  const revision = await revisionOf(db, row.variantId, pkg.revisionId);
  const recomputed = studioPackageFiles(validateStudioDocument(revision.document), pkg.revisionId, pkg.meta, `${row.studyId}|${row.variantId}`);
  const files = pkg.files.map((f) => {
    const again = recomputed.find((r) => r.format === f.format);
    const hash = again ? sha256(again.body) : null;
    return { format: f.format, stored: f.sha256, recomputed: hash, identical: hash === f.sha256 };
  });
  return {
    publicationId: row.id, packageHash: row.packageHash!, packageHashRecomputed: studioPackageHash(pkg),
    documentHash: studioDocumentHash(validateStudioDocument(revision.document)), files,
    identical: files.every((f) => f.identical) && studioPackageHash(pkg) === row.packageHash,
  };
}
