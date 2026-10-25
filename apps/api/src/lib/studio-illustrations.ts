/**
 * Illustrations Studio depuis une vue (TEST-032, EX-071, EX-072, AC-007, EX-094, F.2-03 ; lot F, décision P-12).
 * Le client envoie le **rendu du modèle** de sa vue 3D (PNG portant sa provenance `fadi:rendu`) ; le serveur fait
 * autorité : il relit et vérifie cette provenance (même étude, même variante, révision enregistrée de la variante), fixe
 * les droits (lecture pour voir ; `modify` pour produire ; export en plus pour un service externe), contrôle la politique
 * de transfert **avant** toute transmission, produit l'illustration par le fournisseur choisi (local déterministe par
 * défaut ; externe seulement s'il est configuré), relit le document de la révision **avant et après** (empreintes
 * identiques, sinon refus), et archive une image **séparée** avec ses paramètres et sa provenance complète. Aucune
 * commande Studio n'est émise, aucune révision n'est écrite : le modèle ne peut pas changer. Idempotent par `requestId`.
 */
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { StudioValidationError, type StudioProvenanceRendu } from "@parcours/atelier-model";
import {
  STUDIO_CLE_PROVENANCE_ILLUSTRATION, STUDIO_CLE_PROVENANCE_RENDU, STUDIO_FOURNISSEUR_LOCAL, STUDIO_STYLES_ILLUSTRATION, studioControlerTransfert, studioIllustrationLocale,
  studioLireProvenanceRendu, studioProvenanceIllustration, studioValiderParametresIllustration,
  type StudioFournisseurIllustrationDeclare, type StudioSourceTransfert,
} from "@parcours/atelier-model/studio-agents";
import { db } from "../db/client.js";
import { studioIllustrations, studioRevisions, users } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess } from "./owned-project.js";
import { assertAccess, notFound, readStudioContext, StudioRequestError, studioArchivedRefusal, studioIdentifierSchema, type StudioScope } from "./studio-commands.js";
import { studioDocumentHash } from "./studio-publications.js";
import { canonicalJson } from "./studio-publication-statuts.js";
import { configIllustrationExterne, ErreurFournisseurExterne, genererIllustrationExterne, politiqueTransfert, STUDIO_FOURNISSEUR_EXTERNE_ID } from "./studio-illustration-externe.js";
import { ecrirePng, lirePng, StudioPngError } from "./studio-png.js";

/** 8 Mo d'image PNG au plus (le corps JSON en base64 est borné à 12 Mo par la route). */
export const STUDIO_ILLUSTRATION_OCTETS_MAX = 8 * 1024 * 1024;
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

export const studioIllustrationSchema = z.object({
  requestId: studioIdentifierSchema,
  fournisseur: z.enum([STUDIO_FOURNISSEUR_LOCAL.id, STUDIO_FOURNISSEUR_EXTERNE_ID]),
  image: z.string().min(1).max(Math.ceil((STUDIO_ILLUSTRATION_OCTETS_MAX * 4) / 3) + 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  parametres: z.unknown(),
  classification: z.enum(["publique", "interne", "confidentielle", "inconnue"]).optional(),
  consentement: z.object({
    transfertExterne: z.boolean(),
    coutAccepte: z.object({ montant: z.number().finite().nonnegative(), devise: z.string().regex(/^[A-Z]{3}$/) }).strict().nullable(),
  }).strict().optional(),
}).strict();
export type StudioIllustrationEntree = z.infer<typeof studioIllustrationSchema>;

type Ligne = typeof studioIllustrations.$inferSelect;
export interface StudioIllustrationVue {
  id: string; studyId: string; variantId: string; revisionId: string;
  fournisseur: { id: string; nature: string }; parametres: Record<string, unknown>; provenance: Record<string, unknown>;
  largeur: number; hauteur: number; empreinteImage: string; creePar: string; creeParEmail: string | null; creeLe: string; image: string;
}

const chemin = (s: StudioScope, id: string) => `/projects/${encodeURIComponent(s.projectId)}/studio/studies/${encodeURIComponent(s.studyId)}/variants/${encodeURIComponent(s.variantId)}/illustrations/${encodeURIComponent(id)}/image`;
function vue(s: StudioScope, l: Ligne, email: string | null): StudioIllustrationVue {
  return {
    id: l.id, studyId: l.studyId, variantId: l.variantId, revisionId: l.revisionId, fournisseur: { id: l.providerId, nature: l.providerNature },
    parametres: l.parameters, provenance: l.provenance, largeur: l.width, hauteur: l.height, empreinteImage: l.imageDigest,
    creePar: l.createdBy, creeParEmail: email, creeLe: new Date(l.createdAt as unknown as string).toISOString(), image: chemin(s, l.id),
  };
}
async function email(id: string): Promise<string | null> {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1);
  return u?.email ?? null;
}

/** Fournisseurs proposés à la variante, avec leur disponibilité réelle et ce qui manque (jamais un appel). */
export async function listerFournisseursIllustration(scope: StudioScope, actorId: string) {
  await readStudioContext(db, scope, actorId);
  const c = configIllustrationExterne();
  const p = politiqueTransfert();
  const manque: string[] = [];
  if (!c.active) manque.push("service externe non activé par l’administrateur");
  if (!c.cle) manque.push("aucune clé fournie par l’administrateur");
  if (!c.cout) manque.push("coût par génération non déclaré");
  if (p.transfertsExternes !== "avec-consentement" || !p.fournisseursAutorises.includes(STUDIO_FOURNISSEUR_EXTERNE_ID)) manque.push("politique de transfert : transferts externes interdits");
  return {
    fournisseurs: [
      { id: STUDIO_FOURNISSEUR_LOCAL.id, nom: STUDIO_FOURNISSEUR_LOCAL.nom, nature: STUDIO_FOURNISSEUR_LOCAL.nature, version: STUDIO_FOURNISSEUR_LOCAL.version, reseau: false, disponible: true, manque: [], cout: { montant: 0, devise: null }, styles: [...STUDIO_STYLES_ILLUSTRATION] },
      { id: STUDIO_FOURNISSEUR_EXTERNE_ID, nom: c.nom, nature: "ia-externe", version: c.version ?? "inconnue", reseau: true, disponible: manque.length === 0, manque, cout: c.cout, styles: [...STUDIO_STYLES_ILLUSTRATION], classificationsAdmises: p.classificationsAdmises },
    ],
  };
}

export async function listerIllustrations(scope: StudioScope, actorId: string): Promise<{ illustrations: StudioIllustrationVue[] }> {
  await readStudioContext(db, scope, actorId);
  const rows = await db.select().from(studioIllustrations).where(and(eq(studioIllustrations.variantId, scope.variantId), eq(studioIllustrations.studyId, scope.studyId)))
    .orderBy(desc(studioIllustrations.createdAt)).limit(200);
  return { illustrations: await Promise.all(rows.map(async (r) => vue(scope, r, await email(r.createdBy)))) };
}

export async function lireImageIllustration(scope: StudioScope, actorId: string, id: string): Promise<{ png: Buffer; ligne: Ligne }> {
  await readStudioContext(db, scope, actorId);
  const [r] = await db.select().from(studioIllustrations).where(and(eq(studioIllustrations.id, id), eq(studioIllustrations.variantId, scope.variantId), eq(studioIllustrations.studyId, scope.studyId))).limit(1);
  if (!r) return notFound();
  return { png: Buffer.from(r.imageBase64, "base64"), ligne: r };
}

const refus = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): never => { throw new StudioRequestError(status, { error, message, ...extra }); };

async function documentDe(variantId: string, revisionId: string): Promise<string> {
  const [r] = await db.select({ document: studioRevisions.document }).from(studioRevisions).where(and(eq(studioRevisions.id, revisionId), eq(studioRevisions.variantId, variantId))).limit(1);
  if (!r) return notFound();
  return studioDocumentHash(r.document);
}

export async function creerIllustration(scope: StudioScope, actorId: string, e: StudioIllustrationEntree, maintenant = new Date()): Promise<StudioIllustrationVue & { replayed: boolean }> {
  const payloadHash = sha(canonicalJson(e));
  const rejouer = async (): Promise<(StudioIllustrationVue & { replayed: boolean }) | null> => {
    const [p] = await db.select().from(studioIllustrations).where(and(eq(studioIllustrations.variantId, scope.variantId), eq(studioIllustrations.requestId, e.requestId))).limit(1);
    if (!p) return null;
    if (p.createdBy !== actorId || p.payloadHash !== payloadHash) refus(409, "request_conflict", "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur.");
    return { ...vue(scope, p, await email(p.createdBy)), replayed: true };
  };
  // Droits d'abord (lecture de la variante, puis écriture), avant de lire quoi que ce soit du corps.
  const tete = await readStudioContext(db, scope, actorId);
  const access = assertAccess(await loadProjectAccess(scope.projectId, actorId), actorId, "modify", { studyId: scope.studyId, variantIds: [scope.variantId] });
  const externe = e.fournisseur === STUDIO_FOURNISSEUR_EXTERNE_ID;
  if (externe) assertAccess(access, actorId, "export");
  if (tete.archived) return studioArchivedRefusal();
  const deja = await rejouer();
  if (deja) return deja;

  let parametres;
  try { parametres = studioValiderParametresIllustration(e.parametres); }
  catch (err) { if (err instanceof StudioValidationError) refus(400, "invalid_input", err.message); throw err; }
  const source = Buffer.from(e.image, "base64");
  if (source.length > STUDIO_ILLUSTRATION_OCTETS_MAX) refus(413, "payload_too_large", "Image de plus de 8 Mo.");
  let png;
  try { png = lirePng(source); } catch (err) { if (err instanceof StudioPngError) refus(400, "invalid_input", `Image source : ${err.message}.`); throw err; }
  // Provenance du rendu (EX-094 : provenance connue avant tout traitement) : relue dans l'image, jamais supposée.
  let rendu: StudioProvenanceRendu;
  try { rendu = studioLireProvenanceRendu(JSON.parse(png.textes[STUDIO_CLE_PROVENANCE_RENDU] ?? "null")); }
  catch { return refus(422, "source_inconnue", "L’image ne porte pas la provenance d’un rendu du modèle : aucune illustration n’est produite d’une source inconnue."); }
  if (rendu.etude.id !== scope.studyId || rendu.variante.id !== scope.variantId) refus(422, "source_inconnue", "Le rendu provient d’une autre étude ou d’une autre variante.");
  const empreinteAvant = await documentDe(scope.variantId, rendu.revisionId).catch(() => refus(422, "revision_differente", "La révision du rendu n’est pas une révision enregistrée de cette variante."));
  const empreinteSource = sha(source);

  // Contrôle de politique AVANT toute transmission (EX-094).
  const config = configIllustrationExterne();
  const sources: StudioSourceTransfert[] = externe ? [{ type: "rendu", empreinte: empreinteSource, classification: e.classification ?? "inconnue", provenanceConnue: true }] : [];
  const verdict = studioControlerTransfert(politiqueTransfert(), {
    fournisseur: externe
      ? { id: STUDIO_FOURNISSEUR_EXTERNE_ID, nature: "externe", active: config.active, cleFournie: !!config.cle, cout: config.cout, version: config.version, droits: config.droits, quotas: config.quotas }
      : { id: STUDIO_FOURNISSEUR_LOCAL.id, nature: "local", active: true, cleFournie: true, cout: null, version: STUDIO_FOURNISSEUR_LOCAL.version, droits: null, quotas: null },
    sources, consentement: e.consentement ?? null, droitExport: true,
  });
  if (!verdict.autorise) return refus(422, "transfert_refuse", "Transfert refusé par le contrôle de politique : rien n’a été envoyé.", { refus: verdict.refus, inconnues: verdict.inconnues });

  let image: { largeur: number; hauteur: number; rgba: Uint8Array };
  let fournisseur: StudioFournisseurIllustrationDeclare;
  if (!externe) {
    image = studioIllustrationLocale(png, parametres);
    fournisseur = { id: STUDIO_FOURNISSEUR_LOCAL.id, nom: STUDIO_FOURNISSEUR_LOCAL.nom, nature: "local-deterministe", version: STUDIO_FOURNISSEUR_LOCAL.version, service: null, reseau: false };
  } else {
    let r;
    try { r = await genererIllustrationExterne(config, source, { ...parametres }); }
    catch (err) { if (err instanceof ErreurFournisseurExterne) refus(502, "fournisseur_externe", err.message); throw err; }
    try { image = lirePng(r.png); } catch { return refus(502, "fournisseur_externe", "Le service externe n’a pas rendu une image PNG lisible."); }
    fournisseur = { id: STUDIO_FOURNISSEUR_EXTERNE_ID, nom: config.nom, nature: "ia-externe", version: r.version ?? config.version, service: new URL(config.url!).host, reseau: true };
  }
  const empreinteApres = await documentDe(scope.variantId, rendu.revisionId);
  const sansProvenance = ecrirePng(image);
  let provenance;
  try {
    provenance = studioProvenanceIllustration({
      rendu, empreinteImageSource: empreinteSource, modele: { revisionId: rendu.revisionId, empreinteAvant, empreinteApres }, parametres: { ...parametres },
      auteurId: actorId, date: maintenant, fournisseur, sourcesEnvoyees: sources, droits: externe ? config.droits : null,
      autorisation: externe
        ? { transfert: "externe", politique: "avec-consentement", consentement: { par: actorId, le: maintenant, coutAccepte: e.consentement?.coutAccepte ?? null } }
        : { transfert: "aucun", politique: "aucun transfert : traitement local", consentement: null },
      cout: externe ? config.cout : null, quotas: externe ? config.quotas : null, inconnues: verdict.inconnues,
      resultat: { empreinte: sha(sansProvenance), largeur: image.largeur, hauteur: image.hauteur },
    });
  } catch (err) { if (err instanceof StudioValidationError) refus(409, "modele_modifie", err.message); throw err; }
  const final = ecrirePng(image, { [STUDIO_CLE_PROVENANCE_ILLUSTRATION]: JSON.stringify(provenance) });
  const id = newId("studio_illustration");
  try {
    await db.insert(studioIllustrations).values({
      id, studyId: scope.studyId, variantId: scope.variantId, revisionId: rendu.revisionId, providerId: fournisseur.id, providerNature: fournisseur.nature,
      parameters: { ...parametres }, provenance: provenance as unknown as Record<string, unknown>, sourceDigest: empreinteSource, documentDigest: empreinteApres,
      imageBase64: final.toString("base64"), imageDigest: sha(final), width: image.largeur, height: image.hauteur, createdBy: actorId, requestId: e.requestId, payloadHash, createdAt: maintenant,
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") { const r = await rejouer(); if (r) return r; }
    throw err;
  }
  const [l] = await db.select().from(studioIllustrations).where(eq(studioIllustrations.id, id)).limit(1);
  return { ...vue(scope, l!, await email(actorId)), replayed: false };
}
