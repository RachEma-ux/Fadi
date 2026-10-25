/**
 * Règles pures des modèles externes (partenaires) d'une variante Studio (lot F3, TR-EX-066) : aucune requête, aucun
 * DOM. Le serveur (`routes/studio-modeles-externes.ts`) les applique sous transaction, sous le verrou du projet, et
 * journalise chaque passage ; les tests les éprouvent sans base (`studio-modeles-externes.test.ts`).
 *
 * - Réception (`modify` : propriétaire ou éditeur) : le fichier est relu **par le serveur** (`lireModeleExterne`, qui
 *   fait autorité), dans un document à part, puis comparé à la tête de la variante ; la variante n'est jamais modifiée.
 * - Comparer de nouveau (`modify`) : avec la tête courante, tant que rien n'est décidé.
 * - Accepter ou refuser (`approve` : propriétaire ou approbateur du projet) : décision explicite, définitive pour cette
 *   réception ; un refus porte un motif ; accepter exige une comparaison faite avec la tête courante et une unité lue.
 * La réception est idempotente par `requestId` (même auteur et même contenu, sinon 409) ; un passage déjà fait est refusé
 * (409 `deja_decide`), jamais rejoué en double.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  comparerModeleExterne, lireModeleExterne, passageModeleExterne, StudioValidationError, validerMetaModeleExterne, STUDIO_LIMITES_MODELE_EXTERNE,
  type StudioActionModeleExterne, type StudioComparaisonModeleExterne, type StudioDocument, type StudioIfcRapport, type StudioMetaModeleExterne,
  type StudioRefusModeleExterne, type StudioStatutModeleExterne,
} from "@parcours/atelier-model";
import { canonique } from "./studio-exigences.js";

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
/** Fichier reçu : 5 Mo de texte au plus (borne du lecteur STEP). */
export const STUDIO_MODELE_EXTERNE_OCTETS = 5 * 1024 * 1024;

export const studioModeleReceptionSchema = z.object({
  reference: z.string().max(STUDIO_LIMITES_MODELE_EXTERNE.reference + 50),
  auteur: z.string().max(STUDIO_LIMITES_MODELE_EXTERNE.auteur + 50),
  discipline: z.string().max(STUDIO_LIMITES_MODELE_EXTERNE.discipline + 50),
  format: z.literal("ifc"),
  version: z.string().max(STUDIO_LIMITES_MODELE_EXTERNE.version + 50),
  uniteDeclaree: z.enum(["m", "cm", "mm", "ft", "in"]),
  transformation: z.object({ dx: z.number(), dy: z.number(), dz: z.number(), rotation: z.number() }).strict().nullable(),
  nomFichier: z.string().max(STUDIO_LIMITES_MODELE_EXTERNE.nomFichier + 50),
  contenu: z.string().min(1).max(STUDIO_MODELE_EXTERNE_OCTETS),
  requestId: identifier.optional(),
}).strict();
export type StudioModeleReception = z.infer<typeof studioModeleReceptionSchema>;

export const studioModelePassageSchema = z.object({
  motif: z.string().trim().min(1).max(STUDIO_LIMITES_MODELE_EXTERNE.motif).optional(),
}).strict();
export type StudioModelePassage = z.infer<typeof studioModelePassageSchema>;

export interface RefusModele { status: number; body: Record<string, unknown> }
export type Decision<T> = { ok: T } | { refus: RefusModele };

export const sha256 = (t: string): string => createHash("sha256").update(t, "utf8").digest("hex");
export const empreinteRequete = (value: unknown): string => createHash("sha256").update(canonique(value)).digest("hex");

export interface ReceptionDecidee {
  meta: StudioMetaModeleExterne;
  rapport: StudioIfcRapport;
  comparaison: StudioComparaisonModeleExterne;
  contentSha256: string;
}

/** Réception : métadonnées déclarées validées, fichier relu par le serveur, comparaison avec la tête de la variante. */
export function deciderReception(input: StudioModeleReception, tete: { revisionId: string; document: StudioDocument }): Decision<ReceptionDecidee> {
  let meta: StudioMetaModeleExterne;
  try {
    const { contenu: _c, requestId: _r, ...declare } = input;
    meta = validerMetaModeleExterne(declare);
  } catch (e) {
    if (e instanceof StudioValidationError) return { refus: { status: 400, body: { error: "invalid_input", message: e.message, path: e.path } } };
    throw e;
  }
  try {
    const lecture = lireModeleExterne(input.contenu, meta);
    const comparaison = comparerModeleExterne(tete.document, tete.revisionId, lecture, meta);
    return { ok: { meta, rapport: lecture.rapport, comparaison, contentSha256: sha256(input.contenu) } };
  } catch (e) {
    if (e instanceof StudioValidationError) return { refus: { status: 422, body: { error: "fichier_illisible", message: e.message, path: e.path } } };
    throw e;
  }
}

/** Nouvelle comparaison (avec la tête courante) du fichier déjà reçu ; le fichier est relu, jamais repris du client. */
export function decideComparaison(contenu: string, meta: StudioMetaModeleExterne, tete: { revisionId: string; document: StudioDocument }): StudioComparaisonModeleExterne {
  return comparerModeleExterne(tete.document, tete.revisionId, lireModeleExterne(contenu, meta), meta);
}

const MESSAGES: Record<StudioRefusModeleExterne, { status: number; message: string }> = {
  "deja-decide": { status: 409, message: "Ce modèle reçu est déjà accepté ou refusé : une nouvelle version se reçoit à part." },
  "role-insuffisant": { status: 403, message: "Accepter ou refuser un modèle externe est réservé au propriétaire du projet et aux approbateurs." },
  "motif-obligatoire": { status: 400, message: "Un refus porte un motif." },
  "comparaison-perimee": { status: 409, message: "La variante a changé depuis la comparaison : comparez de nouveau avant d’accepter." },
  "unite-non-evaluee": { status: 409, message: "L’unité du fichier n’est pas évaluée : le modèle ne peut pas être accepté." },
};

/** Passage d'un modèle reçu, motif de refus traduit en statut HTTP. */
export function deciderPassage(
  etat: { statut: StudioStatutModeleExterne; revisionComparee: string; uniteLue: boolean },
  action: StudioActionModeleExterne,
  contexte: { habilite: boolean; revisionCourante: string; motif?: string | null },
): Decision<StudioStatutModeleExterne> {
  const r = passageModeleExterne(etat, action, contexte);
  if ("refus" in r) {
    const m = MESSAGES[r.refus];
    return { refus: { status: m.status, body: { error: r.refus.replace(/-/g, "_"), message: m.message } } };
  }
  return { ok: r.statut };
}

/** Rejeu d'une écriture identifiée par `requestId` : même auteur et même contenu, sinon 409. */
export function rejeuAdmis(stocke: { authorId: string; payloadHash: string | null }, acteurId: string, payloadHash: string): RefusModele | null {
  if (stocke.authorId === acteurId && stocke.payloadHash === payloadHash) return null;
  return { status: 409, body: { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur." } };
}
