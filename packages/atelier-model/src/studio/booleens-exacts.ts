import { studioLayerState, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { studioLienSolide } from "./commandes/liens-solides.js";
import { studioVolumeSolide } from "./composition/quantites-solides.js";
import { studioEmpreinteContenu } from "./projections.js";
import {
  OP_NOYAU, STUDIO_OPERATIONS_BOOLEENNES, studioBoiteEnglobante, studioOperandeNoyau,
  type StudioBoiteEnglobante, type StudioOperandeExact, type StudioOperationBooleenne, type StudioOperationNoyau, type StudioResultatExact,
} from "./objets-3d/exacts.js";

/**
 * Calcul lourd d'un booléen exact (lot F2, IF-003) — la part pure, sans noyau ni Worker :
 *
 * ① collecte des paramètres et ② capture immuable (`studioCaptureBooleen`) : opération, opérandes, entrées du noyau et
 *    empreinte du contenu des deux opérandes au moment de la capture (la révision de la vue est capturée par
 *    l'appelant avec la tâche) ;
 * — aperçu **provisoire** (EX-058, TR-EX-058) : volume estimé par les emprises englobantes alignées sur les axes, sans
 *    noyau ; il est toujours marqué provisoire et n'est **jamais** engagé ;
 * ⑤ comparaison aperçu / exact (`studioComparerApercu`) : au-delà de la tolérance, l'aperçu est refusé et l'écart dit ;
 * ⑥ vérification du contexte avant engagement (`studioVerifierEngagement`) : droits d'écriture, opérandes toujours là et
 *    inchangés — sinon le résultat est **périmé** (TEST-014) et n'est pas engagé dans le modèle courant ;
 * ⑦ engagement explicite (`studioCommandeBooleen`) : la commande `studio.solide.booleen`, avec le seul résultat exact.
 *
 * Pur : ni React, ni DOM, ni WebAssembly.
 */

/** Tolérance de comparaison aperçu / exact : borne choisie par Fadi (précision numérique), pas une valeur métier. */
export const STUDIO_TOLERANCE_APERCU = Object.freeze({ relative: 1e-6, absolue: 1e-9 } as const);

export interface StudioApercuBooleen {
  /** Toujours provisoire : jamais engagé, jamais présenté comme le résultat. */
  nature: "provisoire";
  /** Méthode d'estimation déclarée : emprises englobantes alignées sur les axes du repère `local-3d`. */
  methode: "emprises-englobantes";
  /** Volume estimé, m³. */
  volume: number;
  /** Emprise englobante estimée du résultat ; null si l'estimation la donne vide. */
  boite: StudioBoiteEnglobante | null;
}

export interface StudioCaptureBooleen {
  operation: StudioOperationBooleenne;
  operandes: [string, string];
  /** Entrées du noyau exact (contrat `booleen` de `@parcours/geometry-exact`). */
  entrees: StudioOperationNoyau;
  /** Empreinte du contenu des deux opérandes au moment de la capture (immuable). */
  empreinteOperandes: string;
  apercu: StudioApercuBooleen;
}

export type StudioResultatCapture = { ok: true; capture: StudioCaptureBooleen } | { ok: false; message: string };

function trouver(doc: StudioDocument, id: string): StudioOperandeExact | null {
  return doc.solides?.find((s) => s.id === id) ?? doc.exacts?.find((s) => s.id === id) ?? null;
}

const volumeDe = (s: StudioOperandeExact): number => (s.type === "exact" ? s.resultat.volume : studioVolumeSolide(s));

function interBoites(a: StudioBoiteEnglobante, b: StudioBoiteEnglobante): StudioBoiteEnglobante | null {
  const min = { x: Math.max(a.min.x, b.min.x), y: Math.max(a.min.y, b.min.y), z: Math.max(a.min.z, b.min.z) };
  const max = { x: Math.min(a.max.x, b.max.x), y: Math.min(a.max.y, b.max.y), z: Math.min(a.max.z, b.max.z) };
  return min.x < max.x && min.y < max.y && min.z < max.z ? { min, max } : null;
}
const volumeBoite = (b: StudioBoiteEnglobante | null) => (b ? (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z) : 0);

/** Aperçu provisoire d'un booléen : estimation par emprises englobantes, exacte seulement pour des boîtes non tournées. */
export function studioApercuBooleen(operation: StudioOperationBooleenne, a: StudioOperandeExact, b: StudioOperandeExact): StudioApercuBooleen {
  const ba = studioBoiteEnglobante(a), bb = studioBoiteEnglobante(b), va = volumeDe(a), vb = volumeDe(b);
  const bi = interBoites(ba, bb);
  const inter = Math.min(volumeBoite(bi), va, vb);
  if (operation === "intersection") return { nature: "provisoire", methode: "emprises-englobantes", volume: inter, boite: inter > 0 ? bi : null };
  if (operation === "difference") return { nature: "provisoire", methode: "emprises-englobantes", volume: Math.max(0, va - inter), boite: va - inter > 0 ? ba : null };
  const boite = { min: { x: Math.min(ba.min.x, bb.min.x), y: Math.min(ba.min.y, bb.min.y), z: Math.min(ba.min.z, bb.min.z) }, max: { x: Math.max(ba.max.x, bb.max.x), y: Math.max(ba.max.y, bb.max.y), z: Math.max(ba.max.z, bb.max.z) } };
  return { nature: "provisoire", methode: "emprises-englobantes", volume: va + vb - inter, boite };
}

/** Empreinte du contenu des opérandes (dans l'ordre A, B) ; null si l'un d'eux manque. */
export function studioEmpreinteOperandes(doc: StudioDocument, ids: readonly [string, string]): string | null {
  const a = trouver(doc, ids[0]), b = trouver(doc, ids[1]);
  return a && b ? studioEmpreinteContenu([a, b]) : null;
}

/**
 * ① et ② : collecte et capture immuable d'un booléen sur le document (validé d'abord). Refus explicite (message) quand
 * l'opération n'est pas choisie, qu'un opérande manque, est répété, sur un calque verrouillé, lié « à résoudre » ou
 * oblique. Rien n'est choisi d'office.
 */
export function studioCaptureBooleen(document: StudioDocument, params: { operation: string; operandes: readonly string[] }): StudioResultatCapture {
  const doc = validateStudioDocument(document);
  if (!(STUDIO_OPERATIONS_BOOLEENNES as readonly string[]).includes(params.operation)) return { ok: false, message: "Choisissez l’opération : union, différence ou intersection." };
  const [ia, ib] = params.operandes;
  if (!ia || !ib) return { ok: false, message: "Choisissez les deux solides (A et B)." };
  if (ia === ib) return { ok: false, message: "Choisissez deux solides différents." };
  const ops: StudioOperandeExact[] = [];
  for (const id of [ia, ib]) {
    const s = trouver(doc, id);
    if (!s) return { ok: false, message: `Solide introuvable : ${id}.` };
    if (studioLayerState(doc, s.layerId)?.locked) return { ok: false, message: "Un des solides est sur un calque verrouillé." };
    if (s.type !== "exact" && studioLienSolide(doc, s)?.etat === "a-resoudre") return { ok: false, message: "Un des solides est lié à une polyligne et « à résoudre » : résolvez son lien d’abord." };
    ops.push(s);
  }
  const [a, b] = ops as [StudioOperandeExact, StudioOperandeExact];
  const na = studioOperandeNoyau(a), nb = studioOperandeNoyau(b);
  if (typeof na === "string" || typeof nb === "string") return { ok: false, message: `Booléen impossible : ${typeof na === "string" ? na : nb}.` };
  const operation = params.operation as StudioOperationBooleenne;
  return {
    ok: true,
    capture: Object.freeze({
      operation, operandes: [ia, ib] as [string, string], entrees: { type: "booleen" as const, op: OP_NOYAU[operation], a: na, b: nb },
      empreinteOperandes: studioEmpreinteContenu([a, b]), apercu: studioApercuBooleen(operation, a, b),
    }),
  };
}

export interface StudioComparaisonApercu {
  /** L'aperçu provisoire est-il dans la tolérance du résultat exact ? */
  conforme: boolean;
  /** |volume exact − volume estimé|, m³. */
  ecart: number;
  /** Écart admis, m³. */
  limite: number;
}

/** ⑤ : compare l'aperçu provisoire au résultat exact ; au-delà de la tolérance, l'aperçu est refusé (jamais engagé). */
export function studioComparerApercu(apercu: StudioApercuBooleen, exact: Pick<StudioResultatExact, "volume">, tolerance = STUDIO_TOLERANCE_APERCU): StudioComparaisonApercu {
  const ecart = Math.abs(exact.volume - apercu.volume);
  const limite = tolerance.absolue + tolerance.relative * Math.max(Math.abs(exact.volume), Math.abs(apercu.volume));
  return { conforme: ecart <= limite, ecart, limite };
}

export type StudioVerificationEngagement =
  | { ok: true }
  | { ok: false; motif: "droits" | "perime"; message: string };

/**
 * ⑥ : le résultat d'une capture peut-il être engagé dans `document` ? Il faut le droit d'écriture, et que les deux
 * opérandes soient toujours là, identiques à la capture : sinon le résultat est **périmé** (il porte sur une ancienne
 * révision) et n'est jamais appliqué au modèle courant. Il peut être conservé à titre historique, pas engagé.
 */
export function studioVerifierEngagement(document: StudioDocument, capture: StudioCaptureBooleen, modifiable: boolean): StudioVerificationEngagement {
  if (!modifiable) return { ok: false, motif: "droits", message: "Lecture seule : le résultat ne peut pas être engagé." };
  const actuelle = studioEmpreinteOperandes(validateStudioDocument(document), capture.operandes);
  if (actuelle !== capture.empreinteOperandes) return { ok: false, motif: "perime", message: "Résultat périmé : les solides ont changé depuis le calcul ; il n’est pas engagé." };
  return { ok: true };
}

/** ⑦ : commande d'engagement explicite du résultat exact (jamais de l'aperçu). */
export function studioCommandeBooleen(capture: StudioCaptureBooleen, id: string, resultat: StudioResultatExact): StudioCommand {
  return { toolId: "studio.solide.booleen", params: { id, operation: capture.operation, operandes: [capture.operandes[0], capture.operandes[1]], resultat } };
}
