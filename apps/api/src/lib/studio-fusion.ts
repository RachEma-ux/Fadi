/**
 * Fusion de variantes Studio (lot W3-D, X.1-06) : fusion à trois voies d'une variante SOURCE dans une variante CIBLE de
 * la même étude, à partir de leur ancêtre commun (`studioAncetreCommun` : révision de dérivation, ou dernière révision de
 * la source déjà fusionnée), par élément et par propriété (`studioFusionnerVariantes`, modèle pur). Trois opérations :
 *
 *  - aperçu (`apercuFusionStudio`, droit `read`) : changements de chaque côté, ce que la fusion apporterait à la cible,
 *    conflits et leur résolution éventuelle, validité, empreinte du document fusionné ; rien n'est écrit ;
 *  - application (`appliquerFusionStudio`, droit `modify` sur la CIBLE) : une révision `variant-merge` de la cible, en
 *    une transaction, sous les verrous du projet et de la cible (même orchestration que les lots de commandes), journal
 *    des changements (IF-011) avec ses effets, quota d'invocation, notification temps réel après l'engagement. Refus :
 *    cible archivée (409 `archived`), verrou d'édition d'un autre compte (423), étude non basculée (409
 *    `chemin_ecriture`), tête de la cible changée (409 `stale_revision`), tête de la source changée (409
 *    `source_changee`), aperçu périmé (409 `apercu_perime` : le document fusionné n'a plus l'empreinte acceptée),
 *    conflit sans résolution (409 `conflits_non_resolus`), résolution qui ne désigne aucun conflit (400
 *    `resolutions_inconnues`), document invalide (422 `fusion_invalide`), rien à fusionner (409 `rien_a_fusionner`),
 *    aucun ancêtre commun (409 `fusion_sans_ancetre`, variantes créées séparément ou copie indépendante — TR-INV-003 :
 *    aucune propagation entre copies) ou ancêtre ambigu (409 `fusion_ancetre_ambigu`). Rejeu par `requestId` ;
 *  - annulation (`annulerFusionStudio`, droit `modify`) : une nouvelle révision `variant-merge-undo` qui rend le document
 *    d'avant la fusion, tant que la fusion est la tête de la cible (EX-012 : une annulation est une nouvelle opération,
 *    jamais une réécriture ; les révisions restent immuables). L'annulation retire la fusion de l'histoire suivie :
 *    une nouvelle fusion de la même source repart de l'ancêtre d'avant.
 *
 * Une variante source archivée reste lisible : elle peut être fusionnée (seule la cible est écrite). Aucune exigence
 * réglementaire n'est lue ni produite ici.
 */
import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { studioAncetreCommun, studioFusionnerVariantes, validateStudioDocument, type StudioApercuFusion, type StudioCoteFusion, type StudioDocument, type StudioNoeudRevision } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioRevisions, studioVariants, type StudioFusionRevision } from "../db/schema.js";
import { loadProjectAccess, projectAccessRefusal } from "./owned-project.js";
import type { Querier } from "./step-rows.js";
import { assertAccess, ecrireRevisionFusionStudio, notFound, readStudioContext, studioIdentifierSchema, StudioRequestError, type StudioFusionEcrite, type StudioScope } from "./studio-commands.js";

/** Au plus tant de résolutions dans une requête (une par conflit ; au-delà, l'aperçu est trop large pour une décision). */
export const STUDIO_FUSION_RESOLUTIONS_MAX = 2000;
const resolutionsSchema = z.record(z.string().min(1).max(600), z.enum(["source", "cible"]))
  .refine((r) => Object.keys(r).length <= STUDIO_FUSION_RESOLUTIONS_MAX, `${STUDIO_FUSION_RESOLUTIONS_MAX} résolutions au plus`);

/** Corps d'un aperçu : variante source (même étude) et résolutions envisagées. */
export const studioFusionApercuSchema = z.object({ sourceVariantId: studioIdentifierSchema, resolutions: resolutionsSchema.optional() }).strict();
/** Corps d'une application : aperçu accepté (têtes et empreinte), résolutions explicites, identifiant de requête. */
export const studioFusionAppliquerSchema = z.object({
  requestId: studioIdentifierSchema, sourceVariantId: studioIdentifierSchema, sourceRevisionId: studioIdentifierSchema,
  baseRevisionId: studioIdentifierSchema, empreinte: z.string().regex(/^[0-9a-f]{64}$/), resolutions: resolutionsSchema.optional(),
}).strict();
/** Corps d'une annulation : la révision de fusion (tête de la cible) et un identifiant de requête. */
export const studioFusionAnnulerSchema = z.object({ requestId: studioIdentifierSchema, revisionId: studioIdentifierSchema }).strict();

export type StudioApercuFusionPublic = Omit<StudioApercuFusion, "document">;
export interface StudioFusionLue {
  cible: { variantId: string; revisionId: string };
  source: { variantId: string; revisionId: string };
  ancetre: { variantId: string; revisionId: string };
  /** Droit d'écrire la fusion dans la cible (rôle et cible active) ; l'application revérifie tout. */
  canWrite: boolean;
  apercu: StudioApercuFusionPublic;
}
export type { StudioFusionEcrite } from "./studio-commands.js";

function invalide(error: z.ZodError): never {
  throw new StudioRequestError(400, { error: "invalid_input", details: error.flatten() });
}
const sansDocument = ({ document: _d, ...reste }: StudioApercuFusion): StudioApercuFusionPublic => reste;

/**
 * Graphe des révisions de l'étude : parent dans la variante ; révision initiale d'une dérivation (`version`) → révision
 * source ; fusion → aussi la révision source fusionnée ; annulation → révision rendue (la fusion annulée sort de
 * l'histoire suivie). Une copie indépendante n'a pas de parent : ses identités sont nouvelles.
 */
async function grapheEtude(q: Querier, studyId: string): Promise<{ noeuds: StudioNoeudRevision[]; variantes: Map<string, string> }> {
  const variantes = await q.select({ id: studioVariants.id, derivedFromRevisionId: studioVariants.derivedFromRevisionId, derivationMode: studioVariants.derivationMode })
    .from(studioVariants).where(eq(studioVariants.studyId, studyId));
  const parVariante = new Map(variantes.map((v) => [v.id, v]));
  const ids = variantes.map((v) => v.id);
  const lignes = ids.length ? await q.select({ id: studioRevisions.id, variantId: studioRevisions.variantId, parentRevisionId: studioRevisions.parentRevisionId, fusion: studioRevisions.fusion })
    .from(studioRevisions).where(inArray(studioRevisions.variantId, ids)) : [];
  const variantesDesRevisions = new Map(lignes.map((r) => [r.id, r.variantId]));
  const noeuds = lignes.map((r): StudioNoeudRevision => {
    const f = r.fusion as StudioFusionRevision | null;
    if (f?.type === "annulation") return { id: r.id, parents: [f.revisionRendue] };
    const parents: string[] = [];
    if (r.parentRevisionId) parents.push(r.parentRevisionId);
    else {
      const v = parVariante.get(r.variantId);
      if (v?.derivedFromRevisionId && v.derivationMode !== "copie") parents.push(v.derivedFromRevisionId);
    }
    if (f?.type === "fusion") parents.push(f.sourceRevisionId);
    return { id: r.id, parents };
  });
  return { noeuds, variantes: variantesDesRevisions };
}

interface Preparation {
  cible: { variantId: string; revisionId: string; document: StudioDocument; archived: boolean };
  source: { variantId: string; revisionId: string; document: StudioDocument };
  ancetre: { variantId: string; revisionId: string; document: StudioDocument };
}

/** Têtes de la cible et de la source, ancêtre commun et son document (lecture, droits `read`). */
async function preparer(q: Querier, scope: StudioScope, actorId: string, sourceVariantId: string): Promise<Preparation> {
  if (sourceVariantId === scope.variantId) throw new StudioRequestError(400, { error: "invalid_input", code: "meme_variante", message: "La variante source et la variante cible doivent être différentes." });
  const cible = await readStudioContext(q, scope, actorId);
  const source = await readStudioContext(q, { ...scope, variantId: sourceVariantId }, actorId);
  const { noeuds, variantes } = await grapheEtude(q, cible.study.id);
  const lca = studioAncetreCommun(noeuds, source.revision.id, cible.revision.id);
  if (lca.ancetre === null) {
    if (lca.motif === "aucun") throw new StudioRequestError(409, { error: "fusion_sans_ancetre", message: "Ces deux variantes n’ont aucune révision commune (créées séparément, ou copie indépendante) : aucune fusion n’est possible." });
    throw new StudioRequestError(409, { error: "fusion_ancetre_ambigu", candidats: lca.candidats, message: "Plusieurs ancêtres communs possibles (fusions croisées) : la fusion n’en choisit aucun au hasard." });
  }
  const ancetreVariant = variantes.get(lca.ancetre);
  if (!ancetreVariant) return notFound();
  const [ligne] = await q.select({ document: studioRevisions.document }).from(studioRevisions)
    .where(and(eq(studioRevisions.id, lca.ancetre), eq(studioRevisions.variantId, ancetreVariant))).limit(1);
  if (!ligne) return notFound();
  return {
    cible: { variantId: cible.variant.id, revisionId: cible.revision.id, document: cible.revision.document, archived: cible.archived },
    source: { variantId: source.variant.id, revisionId: source.revision.id, document: source.revision.document },
    ancetre: { variantId: ancetreVariant, revisionId: lca.ancetre, document: validateStudioDocument(ligne.document) },
  };
}

function fusionner(p: Preparation, resolutions: Record<string, StudioCoteFusion>): StudioApercuFusion {
  return studioFusionnerVariantes(p.ancetre.document, p.source.document, p.cible.document, resolutions);
}

/** Aperçu (lecture seule) : rien n'est écrit, aucun quota consommé. */
export async function apercuFusionStudio(scope: StudioScope, actorId: string, input: unknown): Promise<StudioFusionLue> {
  const parsed = studioFusionApercuSchema.safeParse(input);
  if (!parsed.success) invalide(parsed.error);
  const access = assertAccess(await loadProjectAccess(scope.projectId, actorId), actorId, "read");
  const p = await preparer(db, scope, actorId, parsed.data.sourceVariantId);
  const apercu = fusionner(p, parsed.data.resolutions ?? {});
  return {
    cible: { variantId: p.cible.variantId, revisionId: p.cible.revisionId },
    source: { variantId: p.source.variantId, revisionId: p.source.revisionId },
    ancetre: { variantId: p.ancetre.variantId, revisionId: p.ancetre.revisionId },
    canWrite: !p.cible.archived && projectAccessRefusal(access, actorId, "modify", { studyId: scope.studyId, variantIds: [scope.variantId] }) === null,
    apercu: sansDocument(apercu),
  };
}

const empreinteCorps = (o: unknown): string => {
  const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object"
    ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v) ?? "null");
  return createHash("sha256").update(canon(o)).digest("hex");
};

/** Application d'une fusion acceptée : une révision `variant-merge` de la cible (voir l'en-tête pour les refus). */
export async function appliquerFusionStudio(scope: StudioScope, actorId: string, input: unknown): Promise<StudioFusionEcrite> {
  const parsed = studioFusionAppliquerSchema.safeParse(input);
  if (!parsed.success) invalide(parsed.error);
  const corps = parsed.data;
  const resolutions = corps.resolutions ?? {};
  const payloadHash = empreinteCorps({ operation: "fusion", ...corps, resolutions });
  return ecrireRevisionFusionStudio(scope, actorId, corps.requestId, payloadHash, async (t, tete) => {
    if (corps.baseRevisionId !== tete.revisionId) throw new StudioRequestError(409, { error: "stale_revision", headRevisionId: tete.revisionId, baseRevisionId: corps.baseRevisionId });
    const p = await preparer(t, scope, actorId, corps.sourceVariantId);
    if (p.source.revisionId !== corps.sourceRevisionId) {
      throw new StudioRequestError(409, { error: "source_changee", sourceHeadRevisionId: p.source.revisionId, sourceRevisionId: corps.sourceRevisionId, message: "La variante source a changé depuis l’aperçu : relancez l’aperçu de la fusion." });
    }
    const a = fusionner(p, resolutions);
    if (a.resolutionsInconnues.length) throw new StudioRequestError(400, { error: "resolutions_inconnues", ids: a.resolutionsInconnues.slice(0, 100), message: "Des résolutions ne désignent aucun conflit de cette fusion : relancez l’aperçu." });
    if (a.nonResolus.length) throw new StudioRequestError(409, { error: "conflits_non_resolus", nonResolus: a.nonResolus.slice(0, 100), total: a.nonResolus.length, message: "Chaque conflit doit être résolu explicitement (garder la source ou la cible) avant la fusion." });
    if (!a.valide || !a.document) throw new StudioRequestError(422, { error: "fusion_invalide", path: a.erreur?.path ?? null, message: a.erreur?.message ?? "Document fusionné invalide." });
    if (!a.aFusionner) throw new StudioRequestError(409, { error: "rien_a_fusionner", message: "La fusion ne changerait rien à la variante cible." });
    if (a.empreinte !== corps.empreinte) throw new StudioRequestError(409, { error: "apercu_perime", empreinte: a.empreinte, message: "Le résultat de la fusion n’est plus celui de l’aperçu accepté : relancez l’aperçu." });
    return {
      document: a.document, source: "variant-merge",
      fusion: { type: "fusion", sourceVariantId: p.source.variantId, sourceRevisionId: p.source.revisionId, ancetreRevisionId: p.ancetre.revisionId, resolutions, conflits: a.conflits.length, empreinte: a.empreinte! },
    };
  });
}

/** Annulation de la dernière fusion de la cible (sa tête) : une révision `variant-merge-undo` qui rend le document d'avant. */
export async function annulerFusionStudio(scope: StudioScope, actorId: string, input: unknown): Promise<StudioFusionEcrite> {
  const parsed = studioFusionAnnulerSchema.safeParse(input);
  if (!parsed.success) invalide(parsed.error);
  const corps = parsed.data;
  const payloadHash = empreinteCorps({ operation: "annulation", ...corps });
  return ecrireRevisionFusionStudio(scope, actorId, corps.requestId, payloadHash, async (t, tete) => {
    if (corps.revisionId !== tete.revisionId) throw new StudioRequestError(409, { error: "stale_revision", headRevisionId: tete.revisionId, baseRevisionId: corps.revisionId, message: "Seule la fusion qui est la tête de la variante s’annule." });
    const [r] = await t.select({ source: studioRevisions.source, parentRevisionId: studioRevisions.parentRevisionId }).from(studioRevisions)
      .where(and(eq(studioRevisions.id, tete.revisionId), eq(studioRevisions.variantId, scope.variantId))).limit(1);
    if (!r) return notFound();
    if (r.source !== "variant-merge" || !r.parentRevisionId) throw new StudioRequestError(409, { error: "pas_une_fusion", message: "La tête de la variante n’est pas une fusion : rien à annuler." });
    const [avant] = await t.select({ document: studioRevisions.document }).from(studioRevisions)
      .where(and(eq(studioRevisions.id, r.parentRevisionId), eq(studioRevisions.variantId, scope.variantId))).limit(1);
    if (!avant) return notFound();
    return { document: validateStudioDocument(avant.document), source: "variant-merge-undo", fusion: { type: "annulation", revisionAnnulee: tete.revisionId, revisionRendue: r.parentRevisionId } };
  });
}
