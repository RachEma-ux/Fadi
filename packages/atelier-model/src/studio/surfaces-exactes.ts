import { studioLayerState, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { studioEmpreinteContenu } from "./projections.js";
import {
  STUDIO_SENS_EPAISSEUR, studioOperationNurbs, type StudioOperationNurbs, type StudioSensEpaisseur,
} from "./objets-3d/surfaces-libres.js";
import type { StudioResultatExact } from "./objets-3d/exacts.js";
import { studioOperationPolyedre, type StudioOperationPolyedre } from "./objets-3d/subdivisions.js";

/**
 * Épaississement exact d'une surface libre (X.1-05) — la part pure, sans noyau ni Worker, sur le modèle du booléen
 * exact (lot F2, IF-003) :
 *
 * ① ② capture immuable (`studioCaptureEpaississement`) : surface, épaisseur et côté saisis (rien par défaut), entrée
 *    du noyau (opération `nurbs`) et empreinte du contenu de la surface au moment de la capture ;
 * ⑥ vérification avant engagement (`studioVerifierEpaississement`) : droit d'écriture, surface toujours là et inchangée
 *    — sinon le résultat est **périmé** et n'est pas engagé ;
 * ⑦ engagement explicite (`studioCommandeEpaississement`) : la commande `studio.surface.epaissir`, avec le seul
 *    résultat exact (le serveur le recalcule et fait autorité).
 *
 * Pur : ni React, ni DOM, ni WebAssembly.
 */

export interface StudioCaptureEpaississement {
  surface: string;
  epaisseur: number;
  sens: StudioSensEpaisseur;
  /** Entrée du noyau exact (opération `nurbs` de `@parcours/geometry-exact`). */
  entrees: StudioOperationNurbs;
  /** Empreinte du contenu de la surface au moment de la capture (immuable). */
  empreinteSurface: string;
}

export type StudioResultatCaptureEpaississement = { ok: true; capture: StudioCaptureEpaississement } | { ok: false; message: string };

const trouver = (doc: StudioDocument, id: string) => doc.surfaces?.find((s) => s.id === id) ?? null;

/** ① ② : capture d'un épaississement sur le document (validé d'abord) ; refus explicite (message), rien n'est choisi d'office. */
export function studioCaptureEpaississement(document: StudioDocument, params: { surface: string; epaisseur: number | null; sens: string }): StudioResultatCaptureEpaississement {
  const doc = validateStudioDocument(document);
  if (!params.surface) return { ok: false, message: "Choisissez la surface à épaissir." };
  const s = trouver(doc, params.surface);
  if (!s) return { ok: false, message: `Surface introuvable : ${params.surface}.` };
  if (studioLayerState(doc, s.layerId)?.locked) return { ok: false, message: "La surface est sur un calque verrouillé." };
  const e = params.epaisseur;
  if (e === null || !Number.isFinite(e) || e < 1e-6 || e > 1e6) return { ok: false, message: "Saisissez l’épaisseur (de 0,000001 à 1 000 000 m)." };
  if (!(STUDIO_SENS_EPAISSEUR as readonly string[]).includes(params.sens)) return { ok: false, message: "Choisissez le côté de l’épaisseur : le long de la normale ou à l’opposé." };
  const sens = params.sens as StudioSensEpaisseur;
  return { ok: true, capture: Object.freeze({ surface: s.id, epaisseur: e, sens, entrees: studioOperationNurbs(s, e, sens), empreinteSurface: studioEmpreinteContenu([s]) }) };
}

export type StudioVerificationEpaississement = { ok: true } | { ok: false; motif: "droits" | "perime"; message: string };

/** ⑥ : le résultat peut-il être engagé dans `document` ? Droit d'écriture, surface présente et identique à la capture. */
export function studioVerifierEpaississement(document: StudioDocument, capture: StudioCaptureEpaississement, modifiable: boolean): StudioVerificationEpaississement {
  if (!modifiable) return { ok: false, motif: "droits", message: "Lecture seule : le résultat ne peut pas être engagé." };
  const s = trouver(validateStudioDocument(document), capture.surface);
  if (!s || studioEmpreinteContenu([s]) !== capture.empreinteSurface) return { ok: false, motif: "perime", message: "Résultat périmé : la surface a changé depuis le calcul ; il n’est pas engagé." };
  return { ok: true };
}

/** ⑦ : commande d'engagement explicite du résultat exact. */
export function studioCommandeEpaississement(capture: StudioCaptureEpaississement, id: string, resultat: StudioResultatExact): StudioCommand {
  return { toolId: "studio.surface.epaissir", params: { id, surface: capture.surface, epaisseur: capture.epaisseur, sens: capture.sens, resultat } };
}

// ——— Solidification d'une surface de subdivision fermée (X.1-05) ———

export interface StudioCaptureSolidification {
  subdivision: string;
  /** Entrée du noyau exact (opération `polyedre` : maillage subdivisé de la surface). */
  entrees: StudioOperationPolyedre;
  /** Empreinte du contenu de la surface au moment de la capture (immuable). */
  empreinteSurface: string;
}

export type StudioResultatCaptureSolidification = { ok: true; capture: StudioCaptureSolidification } | { ok: false; message: string };

/** ① ② : capture d'une solidification (maillage fermé seulement ; un maillage ouvert est refusé avec sa raison). */
export function studioCaptureSolidification(document: StudioDocument, params: { subdivision: string }): StudioResultatCaptureSolidification {
  const doc = validateStudioDocument(document);
  if (!params.subdivision) return { ok: false, message: "Choisissez la surface de subdivision à solidifier." };
  const s = doc.subdivisions?.find((x) => x.id === params.subdivision);
  if (!s) return { ok: false, message: `Surface de subdivision introuvable : ${params.subdivision}.` };
  if (studioLayerState(doc, s.layerId)?.locked) return { ok: false, message: "La surface est sur un calque verrouillé." };
  const op = studioOperationPolyedre(s);
  if (typeof op === "string") return { ok: false, message: `Solidification impossible : ${op}.` };
  return { ok: true, capture: Object.freeze({ subdivision: s.id, entrees: op, empreinteSurface: studioEmpreinteContenu([s]) }) };
}

/** ⑥ : droit d'écriture, surface présente et identique à la capture ; sinon refus (résultat périmé, jamais engagé). */
export function studioVerifierSolidification(document: StudioDocument, capture: StudioCaptureSolidification, modifiable: boolean): StudioVerificationEpaississement {
  if (!modifiable) return { ok: false, motif: "droits", message: "Lecture seule : le résultat ne peut pas être engagé." };
  const s = validateStudioDocument(document).subdivisions?.find((x) => x.id === capture.subdivision);
  if (!s || studioEmpreinteContenu([s]) !== capture.empreinteSurface) return { ok: false, motif: "perime", message: "Résultat périmé : la surface a changé depuis le calcul ; il n’est pas engagé." };
  return { ok: true };
}

/** ⑦ : commande d'engagement explicite du solide polyédrique du noyau. */
export function studioCommandeSolidification(capture: StudioCaptureSolidification, id: string, resultat: StudioResultatExact): StudioCommand {
  return { toolId: "studio.subdivision.solidifier", params: { id, subdivision: capture.subdivision, resultat } };
}
