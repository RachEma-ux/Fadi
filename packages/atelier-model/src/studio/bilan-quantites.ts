import { studioQuantitesArchitecture } from "./architecture/quantites.js";
import type { StudioDocument } from "./document-2d.js";
import { quantitesStudio, type MotifNonEvalue, type NatureQuantite, type QuantitesStudio } from "./quantites.js";

/**
 * Bilan brut / déductions / net du métré Studio (E.3-04). Pur : ni React, ni DOM, ni stockage.
 *
 * Les trois quantités sont calculées et rapportées **séparément**, objet par objet puis en totaux distincts :
 * - **brut** : volume dérivé de la seule géométrie saisie (`quantitesStudio`) ;
 * - **déductions** : détaillées une à une, chacune rattachée à sa source déclarée. Seules existent celles des ouvertures
 *   **créées comme ouvertures** d'un mur architectural (A.4) : largeur × hauteur × épaisseur du mur hôte. Rien n'est
 *   déduit d'un recouvrement deviné ; un objet hors architecture n'a aucune déduction déclarable : sa déduction et son
 *   net sont « non évalués » (`deductions-non-declarees`), jamais pris égaux au brut ;
 * - **net** : brut − somme des déductions, pour un mur architectural seulement (un mur sans ouverture a une déduction
 *   déclarée nulle : net = brut).
 * Un contrôle vérifie, ligne par ligne, que le net rapporté par le métré égale le brut moins ses déductions détaillées.
 * C'est un **contrôle d'arithmétique** sur une même source (le net et les déductions proviennent du même calcul
 * architectural) : il détecte une incohérence de report entre colonnes, il ne constitue PAS une vérification
 * indépendante des quantités (aucun second calcul, aucune mesure extérieure).
 * Aucun arrondi ici ; les ajustements manuels (E.3-05) restent à part et ne modifient jamais ce bilan.
 *
 * Totaux : le total brut porte sur toutes les lignes, le total net sur les seules lignes qui ont un net. Pour que les
 * totaux se lisent ensemble, `sousTotauxAvecNet` donne le brut et les déductions des seules lignes qui ont un net : le
 * sous-total brut moins ces déductions égale le total net.
 */

export const STUDIO_BILAN_QUANTITES_SCHEMA = "studio-bilan-quantites/1" as const;

export type MotifBilanNonEvalue = MotifNonEvalue | "deductions-non-declarees" | "brut-non-evalue";

export interface DeductionDeclaree {
  /** Ouverture déclarée qui porte la déduction. */
  sourceId: string;
  sourceType: "opening";
  /** Volume déduit (m³). */
  valeur: number;
}

export interface LigneBilanQuantites {
  objetId: string;
  type: string;
  nature: NatureQuantite;
  calqueId: string;
  calqueMasque: boolean;
  grandeur: "volume";
  unite: "m3";
  brut: number | null;
  motifBrut?: MotifNonEvalue;
  deductions: DeductionDeclaree[];
  /** Somme des déductions déclarées ; null si l'objet n'en admet aucune. */
  deduit: number | null;
  motifDeduit?: MotifBilanNonEvalue;
  net: number | null;
  motifNet?: MotifBilanNonEvalue;
}

export interface TotalBilan {
  /** Somme des valeurs évaluées ; null si aucune ne l'est. */
  valeur: number | null;
  evalues: number;
  /** Lignes non évaluées pour cette quantité : le total est alors partiel. */
  nonEvalues: number;
}

export interface BilanQuantitesStudio {
  schema: typeof STUDIO_BILAN_QUANTITES_SCHEMA;
  documentId: string;
  unites: "m";
  repere: "local-2d";
  grandeur: "volume";
  lignes: LigneBilanQuantites[];
  totaux: { brut: TotalBilan; deduit: TotalBilan; net: TotalBilan };
  /** Nombre total de déductions déclarées détaillées. */
  deductionsDeclarees: number;
  /**
   * Contrôle d'arithmétique (même source, pas une vérification indépendante) : net = brut − Σ déductions, à 1e-9 près
   * (relatif), pour chaque ligne qui a un net.
   */
  controle: { coherent: boolean; ecartMax: number; lignesControlees: number };
}

const total = (valeurs: readonly (number | null)[]): TotalBilan => {
  let somme = 0, evalues = 0, nonEvalues = 0;
  for (const v of valeurs) {
    if (v === null) nonEvalues++;
    else { somme += v; evalues++; }
  }
  return { valeur: evalues ? somme : null, evalues, nonEvalues };
};

/**
 * Sous-totaux des seules lignes qui ont un net (dérivés des lignes, hors empreinte du bilan) : brut et déductions de ces
 * lignes, qui se lisent à côté du total net (sous-total brut − déductions = net). Les valeurs par ligne ne changent pas ;
 * une ligne sans net (objet hors architecture, brut non évalué) n'y entre pas.
 */
export function sousTotauxAvecNet(b: Pick<BilanQuantitesStudio, "lignes">): { brut: TotalBilan; deduit: TotalBilan } {
  const avecNet = b.lignes.filter((l) => l.net !== null);
  return { brut: total(avecNet.map((l) => l.brut)), deduit: total(avecNet.map((l) => l.deduit)) };
}

/** Bilan brut / déductions / net du document (volume), à partir du métré brut (calculé s'il n'est pas fourni). */
export function bilanQuantitesStudio(doc: StudioDocument, metre: QuantitesStudio = quantitesStudio(doc)): BilanQuantitesStudio {
  // Déductions détaillées par mur hôte, dans l'ordre du document ; un ensemble architectural invalide n'en a aucune.
  const parHote = new Map<string, DeductionDeclaree[]>();
  let lues: ReturnType<typeof studioQuantitesArchitecture> = [];
  try { lues = studioQuantitesArchitecture(doc.architecture ?? []); } catch { lues = []; }
  for (const l of lues) {
    if (l.type !== "opening") continue;
    parHote.set(l.hostId, [...(parHote.get(l.hostId) ?? []), { sourceId: l.id, sourceType: "opening", valeur: l.volumeDeduit }]);
  }
  const murs = new Set(lues.filter((l) => l.type === "wall").map((l) => l.id));
  const lignes: LigneBilanQuantites[] = [];
  let ecartMax = 0, lignesControlees = 0, coherent = true;
  for (const o of metre.objets) {
    const v = o.valeurs.find((x) => x.grandeur === "volume");
    if (!v) continue;
    const base = { objetId: o.objetId, type: o.type, nature: o.nature, calqueId: o.calqueId, calqueMasque: o.calqueMasque, grandeur: "volume" as const, unite: "m3" as const };
    const brut = v.valeur;
    const motifBrut = v.valeur === null ? { motifBrut: v.motif ?? "geometrie-invalide" } : {};
    if (o.nature !== "mur-architectural" || !murs.has(o.objetId)) {
      // Mur d'un ensemble architectural invalide : rien n'est évalué ; tout autre objet n'admet aucune déduction.
      const motif: MotifBilanNonEvalue = o.nature === "mur-architectural" ? "brut-non-evalue" : "deductions-non-declarees";
      lignes.push({ ...base, brut, ...motifBrut, deductions: [], deduit: null, motifDeduit: motif, net: null, motifNet: motif });
      continue;
    }
    const deductions = parHote.get(o.objetId) ?? [];
    const deduit = deductions.reduce((s, d) => s + d.valeur, 0);
    const netMetre = o.valeurs.find((x) => x.grandeur === "volume-net")?.valeur ?? null;
    const net = brut === null ? null : netMetre;
    if (brut !== null && net !== null) {
      lignesControlees++;
      const ecart = Math.abs(net - (brut - deduit));
      ecartMax = Math.max(ecartMax, ecart);
      if (ecart > 1e-9 * Math.max(1, Math.abs(brut))) coherent = false;
    }
    lignes.push({ ...base, brut, ...motifBrut, deductions, deduit, net, ...(net === null ? { motifNet: "brut-non-evalue" as const } : {}) });
  }
  return {
    schema: STUDIO_BILAN_QUANTITES_SCHEMA, documentId: metre.documentId, unites: "m", repere: "local-2d", grandeur: "volume", lignes,
    totaux: { brut: total(lignes.map((l) => l.brut)), deduit: total(lignes.map((l) => l.deduit)), net: total(lignes.map((l) => l.net)) },
    deductionsDeclarees: lignes.reduce((s, l) => s + l.deductions.length, 0),
    controle: { coherent, ecartMax, lignesControlees },
  };
}
