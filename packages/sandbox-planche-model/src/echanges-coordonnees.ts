/**
 * Coordonnées des exports (chantier Axes, lot AX-5 ; concept Axes 1.0, § 9 ; décision AX-D10). Pur.
 *
 * Choix explicite : « modèle » (défaut, coordonnées stockées), « travail » (coordonnées exprimées dans le repère de
 * travail : origine et axes du repère, mètres) ou « source » (unité du fichier importé, seulement si une
 * correspondance a été consignée à l'import et qu'elle est unique). Un choix non pris en charge est refusé avec son
 * motif, jamais approché en silence. Le document n'est jamais modifié : on exporte une copie transformée.
 */
import type { Repere } from "./annotations.js";
import { type Matrice4, type Modele, appliquer, composer, redimensionner, transformerNormale } from "./geometrie-libre.js";
import { normalize } from "./vecteur.js";
import { REPERE_DU_MODELE, validerRepere } from "./reperes.js";

export type CoordonneesExport = "modele" | "travail" | "source";
export type FormatExport = "obj" | "stl" | "ifc";

export const MOTIFS_COORDONNEES = Object.freeze({
  source: "Aucune correspondance d'import consignée dans cette Planche : les coordonnées d'origine ne sont pas connues.",
  sourceMultiple: "Plusieurs imports d'unités différentes : aucune coordonnée d'origine unique.",
  sourceIfc: "L'export IFC déclare ses unités (mètres) : un export en unité source y serait faux. Choisissez OBJ ou STL.",
  repere: "Repère de travail invalide.",
});

/** Copie du modèle exprimée dans le repère `r` (monde → local) ; la géométrie stockée n'est pas touchée. */
export function modeleDansRepere(m: Modele, r: Repere): Modele {
  // T : monde → local (transposée de la base, puis translation).
  const T: Matrice4 = [
    r.x.x, r.x.y, r.x.z, -(r.x.x * r.origine.x + r.x.y * r.origine.y + r.x.z * r.origine.z),
    r.y.x, r.y.y, r.y.z, -(r.y.x * r.origine.x + r.y.y * r.origine.y + r.y.z * r.origine.z),
    r.z.x, r.z.y, r.z.z, -(r.z.x * r.origine.x + r.z.y * r.origine.y + r.z.z * r.origine.z),
    0, 0, 0, 1,
  ];
  const c = m.racine;
  const sommets = Object.fromEntries(Object.entries(c.sommets).map(([k, s]) => [k, { ...s, position: appliquer(T, s.position) }]));
  const faces = Object.fromEntries(Object.entries(c.faces).map(([k, f]) => [k, { ...f, normale: normalize(transformerNormale(T, f.normale)) }]));
  const courbes = Object.fromEntries(Object.entries(c.courbes).map(([k, kc]) => [k, { ...kc, centre: appliquer(T, kc.centre), normale: normalize(transformerNormale(T, kc.normale)) }]));
  const occurrences = Object.fromEntries(Object.entries(c.occurrences).map(([k, o]) => [k, { ...o, transformation: composer(T, o.transformation) }]));
  return { ...m, racine: { ...c, sommets, faces, courbes, occurrences } };
}

export type ResultatCoordonnees =
  | { readonly ok: true; readonly modele: Modele; readonly unite: string; readonly repere: Repere | null }
  | { readonly ok: false; readonly motif: string };

/** Disponibilité d'un choix (motif sinon), pour l'interface. */
export function disponibiliteCoordonnees(m: Modele, choix: CoordonneesExport, format: FormatExport): string | null {
  if (choix !== "source") return null;
  if (format === "ifc") return MOTIFS_COORDONNEES.sourceIfc;
  const unites = new Set(Object.values(m.annotations?.correspondances ?? {}).map((c) => c.metresParUnite));
  if (unites.size === 0) return MOTIFS_COORDONNEES.source;
  if (unites.size > 1) return MOTIFS_COORDONNEES.sourceMultiple;
  return null;
}

/** Modèle à exporter selon le choix ; refus explicite si le choix n'est pas pris en charge. */
export function modeleAExporter(m: Modele, choix: CoordonneesExport, format: FormatExport, repereTravail: Repere | null): ResultatCoordonnees {
  const motif = disponibiliteCoordonnees(m, choix, format);
  if (motif) return { ok: false, motif };
  if (choix === "modele") return { ok: true, modele: m, unite: "m", repere: null };
  if (choix === "travail") {
    const r = repereTravail ?? REPERE_DU_MODELE;
    if (!validerRepere(r).ok) return { ok: false, motif: MOTIFS_COORDONNEES.repere };
    return { ok: true, modele: modeleDansRepere(m, r), unite: "m", repere: r };
  }
  const k = Object.values(m.annotations?.correspondances ?? {})[0]!.metresParUnite;
  const unite = k === 1 ? "m" : k === 0.01 ? "cm" : k === 0.001 ? "mm" : `${k} m`;
  return { ok: true, modele: k === 1 ? m : redimensionner(m, 1 / k).modele, unite, repere: null };
}
