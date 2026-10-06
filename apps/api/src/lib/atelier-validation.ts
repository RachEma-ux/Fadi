/**
 * Cœur transactionnel des commandes de l'Atelier (cahier §5.4), partagé par la route `POST /commands` et par les
 * écritures internes au serveur (transmission de la parcelle) : idempotence par `requestId`, contrôle de la
 * révision de base, mêmes réducteurs que le navigateur, différentiel + journal + boîte de sortie +
 * `projects.model_revision + 1`, dans la transaction de l'appelant (verrou de ligne déjà pris).
 */
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { appliquerLot, clesReservation, CONTRAT_COMMANDES, ErreurCommande, identifiantsCibles, type Commande, type Effets, type Enveloppe, type ModeleAtelier } from "@parcours/atelier-model";
import type { db } from "../db/client.js";
import { atelierCommands, atelierLocks, projects, users, type JournalKind } from "../db/schema.js";
import { EVENEMENT_COMMANDE_VALIDEE, enregistrerEvenement } from "./atelier-events.js";
import { chargerModele, creerModeleVide, persisterDifferentiel } from "./atelier-modele.js";
import { controlerRattachements } from "./atelier-refexterne.js";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Objets touchés par les entrées du journal postérieures à `baseRevision` qui recoupent les cibles du lot. */
export async function conflitsDepuis(tx: Tx, projectId: string, baseRevision: number, cibles: string[], etat: ModeleAtelier) {
  const entrees = await tx.select({ effets: atelierCommands.effets, label: atelierCommands.label, resultRevision: atelierCommands.resultRevision, authorId: atelierCommands.authorId }).from(atelierCommands).where(and(eq(atelierCommands.projectId, projectId), gt(atelierCommands.resultRevision, baseRevision)));
  const conflits: { objetId: string; motif: string; revision: number; etatServeur: unknown }[] = [];
  for (const e of entrees) {
    const ef = e.effets as Partial<Effets>;
    const touches = new Set([...(ef.crees ?? []), ...(ef.modifies ?? []), ...(ef.supprimes ?? [])]);
    for (const id of cibles) if (touches.has(id)) conflits.push({ objetId: id, motif: `modifié par « ${e.label || "lot"} » (révision ${e.resultRevision})`, revision: e.resultRevision, etatServeur: etat.objets[id] ?? null });
  }
  return conflits;
}

export interface ResultatValidation {
  reponse: Record<string, unknown>;
  status: number;
  revision: number;
  journalId?: string;
}

/**
 * Cœur transactionnel : rejoue une requête déjà validée (idempotence), vérifie la révision de base, applique
 * les commandes, persiste le différentiel, journalise, enregistre l'événement, avance la révision.
 */
export class EchecLot extends Error {
  constructor(public readonly resultat: ResultatValidation) {
    super("lot refusé");
  }
}

/** Valide un lot dans la transaction de l'appelant, qui a déjà verrouillé la ligne du projet. */
export async function validerDansTransaction(tx: Tx, projectId: string, auteurId: string, enveloppe: Enveloppe, kind: JournalKind, inverseOf: string | null, label: string): Promise<ResultatValidation> {
  const deja = (await tx.select().from(atelierCommands).where(and(eq(atelierCommands.projectId, projectId), eq(atelierCommands.requestId, enveloppe.requestId))).limit(1))[0];
  if (deja) return { reponse: { ...deja.reponse, rejouee: true }, status: 200, revision: deja.resultRevision, journalId: deja.id };
  const courant = (await tx.select({ modelRevision: projects.modelRevision }).from(projects).where(eq(projects.id, projectId)).limit(1))[0]!;
  const charge = (await chargerModele(tx, projectId)) ?? (await creerModeleVide(tx, projectId, `fadi-${projectId}`));
  if (enveloppe.baseRevision !== courant.modelRevision) {
    const conflits = await conflitsDepuis(tx, projectId, enveloppe.baseRevision, identifiantsCibles(enveloppe), charge.etat);
    throw new EchecLot({ reponse: { erreur: "conflit", motif: "revision", baseRevision: enveloppe.baseRevision, revisionCourante: courant.modelRevision, conflits }, status: 409, revision: courant.modelRevision });
  }
  // Références externes (DA-05-11) : droits sur la source, publication épinglée, absence de cycle.
  if (enveloppe.commands.some((c) => c.type === "refexterne.rattacher")) {
    const refus = await controlerRattachements(tx, projectId, auteurId, enveloppe.commands);
    if (refus) throw new EchecLot({ ...refus, revision: courant.modelRevision });
  }
  let resultat;
  try {
    resultat = appliquerLot(charge.etat, enveloppe);
  } catch (err) {
    if (err instanceof ErreurCommande) {
      throw new EchecLot({
        status: err.code === "precondition" ? 409 : 400,
        revision: courant.modelRevision,
        reponse: err.code === "precondition" ? { erreur: "conflit", motif: "precondition", baseRevision: enveloppe.baseRevision, revisionCourante: courant.modelRevision, conflits: [{ chemin: err.chemin, motif: err.message }] } : { erreur: "invalide", details: [{ chemin: err.chemin, message: err.message }] },
      });
    }
    throw err;
  }
  // Verrous logiques fins (lot 7) : un objet ou un niveau réservé par un autre compte refuse le lot entier (423).
  const touches = [...resultat.effets.crees, ...resultat.effets.modifies, ...resultat.effets.supprimes];
  if (touches.length) {
    // Objet, niveau et zones qui le contiennent, avant et après (D-143).
    const cles = new Set(clesReservation(charge.etat, resultat.etat, touches));
    const tenus = await tx
      .select({ cle: atelierLocks.cle, motif: atelierLocks.motif, expiresAt: atelierLocks.expiresAt, authorId: atelierLocks.authorId, email: users.email })
      .from(atelierLocks)
      .innerJoin(users, eq(users.id, atelierLocks.authorId))
      .where(and(eq(atelierLocks.projectId, projectId), gt(atelierLocks.expiresAt, new Date()), ne(atelierLocks.authorId, auteurId), inArray(atelierLocks.cle, [...cles])));
    if (tenus.length) {
      throw new EchecLot({
        status: 423,
        revision: courant.modelRevision,
        reponse: { erreur: "verrou", message: `Verrouillé par ${tenus[0]!.email} jusqu'à ${tenus[0]!.expiresAt.toISOString()}${tenus[0]!.motif ? ` (${tenus[0]!.motif})` : ""}.`, verrous: tenus.map((t) => ({ cle: t.cle, motif: t.motif, auteur: t.email, expiresAt: t.expiresAt.toISOString() })) },
      });
    }
  }
  const revision = courant.modelRevision + 1;
  await persisterDifferentiel(tx, projectId, charge.etat, resultat.etat, revision);
  await tx.update(projects).set({ modelRevision: revision, updatedAt: new Date() }).where(eq(projects.id, projectId));
  const journalId = randomUUID();
  const reponse = {
    revision,
    journalId,
    applique: enveloppe.commands.map((c, i) => ({ type: c.type, objetIds: [...(resultat.parCommande[i]?.crees ?? []), ...(resultat.parCommande[i]?.modifies ?? []), ...(resultat.parCommande[i]?.supprimes ?? [])] })),
    effets: resultat.effets,
    problemes: resultat.effets.problemes,
    referencesAReparer: resultat.effets.referencesAReparer,
  };
  await tx.insert(atelierCommands).values({
    id: journalId,
    projectId: projectId,
    requestId: enveloppe.requestId,
    kind,
    contract: enveloppe.contract,
    label: label || enveloppe.label,
    baseRevision: enveloppe.baseRevision,
    resultRevision: revision,
    commands: enveloppe.commands,
    inverse: resultat.inverse as unknown as Record<string, unknown>,
    effets: resultat.effets as unknown as Record<string, unknown>,
    reponse,
    inverseOf,
    authorId: auteurId,
    createdAt: new Date(),
  });
  await enregistrerEvenement(tx, projectId, EVENEMENT_COMMANDE_VALIDEE, {
    projectId: projectId,
    revision,
    journalId,
    kind,
    objetIds: [...resultat.effets.crees, ...resultat.effets.modifies, ...resultat.effets.supprimes],
    types: enveloppe.commands.map((c) => c.type),
    auteurId,
  });
  return { reponse, status: 200, revision, journalId };
}

/**
 * Écriture interne au serveur (transmission de la parcelle…) : le lot est appliqué sur la révision courante, dans
 * la transaction de l'appelant. Un refus lève `EchecLot` (la transaction de l'appelant est annulée).
 */
export async function appliquerCommandesInternes(tx: Tx, projectId: string, auteurId: string, commandes: Commande[], label: string): Promise<ResultatValidation> {
  const courant = (await tx.select({ modelRevision: projects.modelRevision }).from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  if (!courant) throw new Error(`projet introuvable : ${projectId}`);
  const enveloppe: Enveloppe = { requestId: `serveur-${randomUUID()}`, baseRevision: courant.modelRevision, contract: CONTRAT_COMMANDES, label, commands: commandes };
  const r = await validerDansTransaction(tx, projectId, auteurId, enveloppe, "commande", null, label);
  if (r.status !== 200) throw new EchecLot(r);
  return r;
}
