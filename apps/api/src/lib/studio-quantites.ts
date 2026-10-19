/**
 * Règles pures des ajustements manuels du métré Studio (E.3-05) : aucune requête, aucun DOM. Le serveur
 * (`routes/studio-quantites.ts`) les applique sous transaction, sous le verrou du projet ; les tests les éprouvent
 * sans base (`studio-quantites.test.ts`). Le métré et l'état d'une cible viennent du modèle
 * (`quantites-ajustements.ts` de `@parcours/atelier-model`).
 *
 * - Journal **en ajout seul**, versionné par variante : chaque ajustement reçoit la séquence suivante ; `baseSequence`
 *   = dernière séquence lue par le client, sinon 409 `journal_perime`. Une ligne n'est jamais réécrite.
 * - Un ajustement se saisit sur la révision de **tête** de la variante (409 `revision_perimee` sinon) : le serveur
 *   calcule lui-même, depuis le document de cette révision, la quantité brute et l'état de la cible ; il ne croit rien
 *   du client que la saisie (cible, grandeur, unité, valeur, motif). Auteur et date : compte et horloge du serveur.
 * - La quantité brute n'est jamais remplacée ; un ajustement dont la cible a changé depuis sa révision est « à revoir »
 *   (`evaluerAjustementsQuantites`), jamais appliqué en silence.
 *
 * Droits (rôles de projet existants) : lire `read` ; ajuster `modify`. Étude ou variante archivée : écritures refusées
 * (409 `archived`, refus existant `studioArchivedRefusal`).
 */
import { z } from "zod";
import {
  controlerSaisieAjustement, etatCibleQuantite, GRANDEURS_QUANTITE, quantitesStudio, STUDIO_LIMITES_AJUSTEMENTS, validateStudioDocument,
  type AjustementQuantiteEnregistre, type GrandeurQuantite, type RefusAjustementEnregistre, type SaisieAjustementQuantite, type StudioDocument,
} from "@parcours/atelier-model";
import { empreinte, type Decision } from "./studio-exigences.js";

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
/** Identifiant d'objet ou de calque Studio : non vide, 128 caractères au plus, sans caractère nul (règle du document). */
const cibleId = z.string().min(1).max(128).refine((v) => v.trim().length > 0 && !v.includes("\0"), { message: "identifiant non vide attendu" });

export const studioAjustementSchema = z.object({
  /** Dernière séquence du journal lue par le client ; 0 = journal vide. */
  baseSequence: z.number().int().min(0),
  /** Révision affichée par le client : doit être la tête de la variante. */
  revisionId: identifier,
  cible: z.object({ type: z.enum(["objet", "calque"]), id: cibleId }).strict(),
  grandeur: z.enum(GRANDEURS_QUANTITE as [GrandeurQuantite, ...GrandeurQuantite[]]),
  unite: z.enum(["m", "m2", "m3"]),
  /** Valeur ajustée ; null = retour explicite à la valeur brute. */
  valeur: z.number().finite().min(0).nullable(),
  motif: z.string().trim().min(1).max(STUDIO_LIMITES_AJUSTEMENTS.motif),
  requestId: identifier.optional(),
}).strict();
export type StudioAjustementSaisi = z.infer<typeof studioAjustementSchema>;

/** Ligne du journal (colonnes de `studio_quantity_adjustments`). */
export interface LigneAjustement {
  id: string; studyId: string; variantId: string; revisionId: string; seq: number;
  targetKind: "objet" | "calque"; targetId: string; quantity: GrandeurQuantite; value: number | null; unit: "m" | "m2" | "m3";
  derivedValue: number | null; targetState: Record<string, unknown>; motif: string; authorId: string;
  requestId: string | null; payloadHash: string | null; createdAt: Date;
}

/** Ajustement tel que l'API le rend (forme du modèle `AjustementQuantiteEnregistre`). */
export function ajustementDe(row: LigneAjustement, email: ReadonlyMap<string, string>): AjustementQuantiteEnregistre {
  return {
    id: row.id, sequence: row.seq, revisionId: row.revisionId, cible: { type: row.targetKind, id: row.targetId }, grandeur: row.quantity,
    unite: row.unit, valeur: row.value, motif: row.motif, derivee: row.derivedValue, etatCible: row.targetState,
    auteur: row.authorId, auteurEmail: email.get(row.authorId) ?? null, date: row.createdAt.toISOString(),
  };
}

const MESSAGES_REFUS: Readonly<Record<RefusAjustementEnregistre, string>> = Object.freeze({
  "objet-inconnu": "Objet absent du métré de cette révision.",
  "calque-inconnu": "Calque absent du métré de cette révision.",
  "grandeur-non-applicable": "Cette grandeur est sans objet pour cette cible.",
  "grandeur-non-cumulable": "Cette grandeur ne s’additionne pas : le total d’un calque ne s’ajuste pas.",
  "unite-incoherente": "L’unité ne correspond pas à la grandeur.",
  "valeur-invalide": "Valeur positive ou nulle attendue.",
  "motif-obligatoire": "Le motif est obligatoire.",
  "motif-trop-long": "Motif de 2000 caractères au plus.",
  "auteur-obligatoire": "L’auteur est obligatoire.",
  "date-invalide": "Date illisible.",
});

/** Empreinte de la saisie (rejeu par `requestId` : même auteur et même contenu). */
export const empreinteAjustement = (input: StudioAjustementSaisi): string => empreinte({
  action: "ajuster", baseSequence: input.baseSequence, revisionId: input.revisionId, cible: input.cible, grandeur: input.grandeur,
  unite: input.unite, valeur: input.valeur, motif: input.motif,
});

/** Colonnes d'un ajustement à insérer (hors identifiant, auteur et date posés par le serveur). */
export interface AjustementDecide {
  seq: number; targetKind: "objet" | "calque"; targetId: string; quantity: GrandeurQuantite; value: number | null; unit: "m" | "m2" | "m3";
  derivedValue: number | null; targetState: Record<string, unknown>; motif: string;
}

/**
 * Décision d'un ajustement : journal à jour (`derniereSequence`), révision de tête, saisie recevable contre le métré
 * du document de cette révision ; quantité brute et état de la cible calculés ici.
 */
export function deciderAjustement(
  input: StudioAjustementSaisi, contexte: { derniereSequence: number; headRevisionId: string; document: unknown },
): Decision<AjustementDecide> {
  if (input.baseSequence !== contexte.derniereSequence) {
    return { refus: { status: 409, body: { error: "journal_perime", message: "Le journal des ajustements a changé depuis votre lecture : relisez-le.", currentSequence: contexte.derniereSequence } } };
  }
  if (input.revisionId !== contexte.headRevisionId) {
    return { refus: { status: 409, body: { error: "revision_perimee", message: "Un ajustement se saisit sur la dernière révision enregistrée de la variante.", headRevisionId: contexte.headRevisionId } } };
  }
  const doc: StudioDocument = validateStudioDocument(contexte.document);
  const q = quantitesStudio(doc);
  const saisie: SaisieAjustementQuantite = { cible: input.cible, grandeur: input.grandeur, unite: input.unite, valeur: input.valeur, motif: input.motif };
  const refus = controlerSaisieAjustement(doc, q, saisie);
  if (refus) return { refus: { status: 400, body: { error: refus.replace(/-/g, "_"), message: MESSAGES_REFUS[refus] } } };
  const e = etatCibleQuantite(doc, q, input.cible, input.grandeur);
  if ("refus" in e) return { refus: { status: 400, body: { error: e.refus.replace(/-/g, "_"), message: MESSAGES_REFUS[e.refus] } } };
  return {
    ok: {
      seq: contexte.derniereSequence + 1, targetKind: input.cible.type, targetId: input.cible.id, quantity: input.grandeur, value: input.valeur,
      unit: input.unite, derivedValue: e.derivee, targetState: e.etat as Record<string, unknown>, motif: input.motif,
    },
  };
}
