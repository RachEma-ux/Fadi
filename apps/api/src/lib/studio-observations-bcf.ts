/**
 * Échange BCF 2.1 minimal des observations Studio (IF-010, E.6-04 ; lot PUB). Règles pures : `@parcours/atelier-model`
 * (`studio/echanges/bcf-observations.ts`).
 *
 *   - Export (`read`) : les observations lisibles par l'acteur (audience respectée) en `.bcfzip` ; Guid de sujet dérivé
 *     de l'identité interne, jamais l'identité interne elle-même.
 *   - Import (`write` : propriétaire ou éditeur ; l'importateur devient responsable des sujets créés, à réattribuer) :
 *     chaque sujet NOUVEAU dans son contexte (projet BCF déclaré, sinon empreinte du fichier) devient une observation
 *     distincte (note d'origine = titre et description, catégorie / gravité reprises seulement si elles appartiennent au
 *     vocabulaire décidé, sinon « non évaluée »), avec la référence BCF (Guid, contexte, fichier, date). Un sujet déjà
 *     importé dans le même contexte est reconnu sans rien réécrire ; un même Guid venu d'un autre contexte ne touche à
 *     aucune observation existante ; un sujet absent ne clôt rien ; un objet cité inconnu reste une référence.
 * Pièces justificatives : téléchargées par leur empreinte (`GET …/observations/:id/pieces/:sha256`), droit `read`.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  studioContexteBcf, studioExporterBcf, studioLireBcf, studioPlanImportBcf, studioSujetsBcf, validateStudioDocument, type StudioObservationPourBcf, type StudioPlanImportBcf,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioComments, studioObservations, studioRevisions, studioVariants, users, volumes, type StudioObservationCategorie, type StudioObservationGravite } from "../db/schema.js";
import { newId } from "./ids.js";
import { roleAllows } from "./owned-project.js";
import { StudioRequestError, studioArchivedRefusal, studioIdentifierSchema, type StudioScope } from "./studio-commands.js";
import { assignable, audienceFilter, constaterDans, hashOf, insertObservationRows, lockedVariant, notFound, observationViews, scopedVariant, type Lecteur } from "./studio-commentaires.js";
import { OBSERVATION_CATEGORIES, OBSERVATION_GRAVITES } from "./studio-observations.js";
import { inflateBcfBorne } from "./studio-bcf-inflate.js";

export const studioBcfImportSchema = z.object({
  /** Fichier `.bcfzip` encodé en base64 (8 Mo au plus une fois décodé). */
  fichierBase64: z.string().min(1).max(11_200_000),
  requestId: studioIdentifierSchema.optional(),
}).strict();

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** `.bcfzip` des observations de la variante lisibles par l'acteur. */
export async function exporterObservationsBcf(scope: StudioScope, actorId: string): Promise<{ body: Buffer; fileName: string; sujets: number }> {
  const variant = await scopedVariant(scope, actorId, "read");
  const lecteur: Lecteur = { actorId, role: variant.access.role, archived: variant.archived !== null || variant.studyArchived !== null, constater: constaterDans(variant.access, scope.studyId, variant.id) };
  const vues = await observationViews(variant.id, null, lecteur);
  const ids = [...vues.keys()];
  const notes = ids.length ? await db.select({ id: studioComments.id, body: studioComments.body, objectIds: studioComments.objectIds, createdAt: studioComments.createdAt, email: users.email })
    .from(studioComments).leftJoin(users, eq(users.id, studioComments.authorId)).where(inArray(studioComments.id, ids)).orderBy(asc(studioComments.createdAt), asc(studioComments.id)) : [];
  const obs: StudioObservationPourBcf[] = notes.map((n) => {
    const v = vues.get(n.id)!;
    const body = n.body ?? "";
    return {
      issueId: v.issueId, titre: body.split("\n")[0]!.slice(0, 200) || v.issueId, description: body, statut: v.statut, categorie: v.categorie, gravite: v.gravite,
      creeLe: n.createdAt.toISOString(), auteur: n.email ?? v.authorId, responsable: v.responsableEmail || v.responsableId, objets: n.objectIds ?? [],
      journal: v.journal.map((e) => ({ seq: e.seq, action: e.action, at: e.at, acteur: e.actorEmail || e.actorId, note: e.note })),
    };
  });
  const body = Buffer.from(studioExporterBcf(studioSujetsBcf(obs), { id: variant.access.id, nom: variant.access.name }));
  return { body, fileName: `observations-${variant.id.slice(-8)}.bcfzip`, sujets: obs.length };
}

export interface ResultatImportBcf extends Omit<StudioPlanImportBcf, "nouveaux"> {
  crees: { guid: string; observationId: string; issueId: string }[];
  avertissements: string[];
  version: string | null;
}

/** Import d'un `.bcfzip` dans la variante : création des seuls sujets nouveaux dans leur contexte. */
export async function importerObservationsBcf(scope: StudioScope, actorId: string, input: z.infer<typeof studioBcfImportSchema>): Promise<ResultatImportBcf> {
  const octets = new Uint8Array(Buffer.from(input.fichierBase64, "base64"));
  if (octets.byteLength === 0 || octets.byteLength > 8 * 1024 * 1024) throw new StudioRequestError(400, { error: "invalid_input", code: "bcf_taille", message: "Fichier BCF vide ou de plus de 8 Mo." });
  let lecture: Awaited<ReturnType<typeof studioLireBcf>>;
  // Entrées DEFLATE (méthode 8) décompressées par `node:zlib`, bornées par entrée et par archive.
  try { lecture = await studioLireBcf(octets, inflateBcfBorne()); }
  catch (e) { throw new StudioRequestError(400, { error: "invalid_input", code: "bcf_illisible", message: e instanceof Error ? e.message : "Fichier BCF illisible." }); }
  const fichierSha256 = sha(octets);
  const contexte = studioContexteBcf(lecture.projetId, fichierSha256);
  return db.transaction(async (tx) => {
    const variant = await lockedVariant(tx, scope, actorId, "write");
    if (variant.lecteur.archived) studioArchivedRefusal();
    if (!roleAllows(variant.access.role, "write")) throw new StudioRequestError(403, { error: "forbidden", message: "Importer des observations exige le droit d'écriture (propriétaire ou éditeur)." });
    const responsable = await assignable(tx, variant.access, actorId);
    // Références BCF existantes de la variante (toutes audiences : la reconnaissance ne dépend pas de qui importe).
    const existantes = (await tx.select({ issueId: studioObservations.issueId, refs: studioObservations.bcfRefs }).from(studioObservations).where(eq(studioObservations.variantId, variant.id)))
      .flatMap((o) => (o.refs ?? []).map((r) => ({ issueId: o.issueId, guid: r.guid, contexte: r.contexte })));
    // Objets connus : ceux de la révision de tête (un objet cité absent reste une référence, jamais une clôture).
    const connus = new Set<string>();
    const [tete] = await tx.select({ document: studioRevisions.document }).from(studioRevisions)
      .innerJoin(studioVariants, and(eq(studioVariants.id, studioRevisions.variantId), eq(studioVariants.headRevisionId, studioRevisions.id)))
      .where(eq(studioRevisions.variantId, variant.id)).limit(1);
    if (tete) { const d = validateStudioDocument(tete.document); for (const o of d.objects) connus.add(o.id); for (const a of d.architecture ?? []) connus.add(a.id); }
    const plan = studioPlanImportBcf(lecture, contexte, existantes, connus);
    const crees: ResultatImportBcf["crees"] = [];
    const maintenant = new Date().toISOString();
    for (const s of plan.nouveaux) {
      const id = newId("studio_comment");
      const body = [s.titre, s.description].filter(Boolean).join("\n").slice(0, 4000) || s.guid;
      await tx.insert(studioComments).values({ id, variantId: variant.id, revisionId: null, objectIds: [], parentId: null, authorId: actorId, body, audience: "equipe", payloadHash: hashOf({ action: "bcf", guid: s.guid, contexte }) });
      const categorie = (OBSERVATION_CATEGORIES as readonly string[]).includes(s.type ?? "") ? s.type as StudioObservationCategorie : undefined;
      const gravite = (OBSERVATION_GRAVITES as readonly string[]).includes(s.priorite ?? "") ? s.priorite as StudioObservationGravite : undefined;
      const note = `Importée de BCF (sujet ${s.guid}, contexte ${contexte})${s.objets.length ? ` ; objets cités : ${s.objets.join(", ")}` : ""}`.slice(0, 2000);
      await insertObservationRows(tx, {
        commentId: id, variantId: variant.id, responsableId: responsable, input: { note, ...(categorie ? { categorie } : {}), ...(gravite ? { gravite } : {}) }, actorId,
        hash: hashOf({ action: "bcf", guid: s.guid, contexte }), bcfRefs: [{ guid: s.guid, contexte, fichierSha256, importeLe: maintenant }],
      });
      const [o] = await tx.select({ issueId: studioObservations.issueId }).from(studioObservations).where(eq(studioObservations.commentId, id)).limit(1);
      crees.push({ guid: s.guid, observationId: id, issueId: o!.issueId });
    }
    const { nouveaux: _n, ...reste } = plan;
    return { ...reste, crees, avertissements: lecture.avertissements, version: lecture.version };
  });
}

/** Pièce justificative d'une observation lisible par l'acteur, vérifiée contre son empreinte. */
export async function lirePieceObservation(scope: StudioScope, actorId: string, observationId: string, sha256: string): Promise<{ body: Buffer; mime: string; name: string; sha256: string }> {
  const variant = await scopedVariant(scope, actorId, "read");
  const [o] = await db.select({ pieces: studioObservations.pieces }).from(studioObservations).innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId))
    .where(and(eq(studioObservations.variantId, variant.id), eq(studioObservations.commentId, observationId), audienceFilter(variant.access.role))).limit(1);
  const piece = o?.pieces?.find((p) => p.sha256 === sha256);
  if (!piece) return notFound();
  const [v] = await db.select().from(volumes).where(eq(volumes.id, piece.sha256)).limit(1);
  if (!v || sha(v.content) !== piece.sha256) throw new Error("studio_observation_piece_corrupt");
  return { body: Buffer.from(v.content), mime: piece.mime, name: piece.name, sha256: piece.sha256 };
}
