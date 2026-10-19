import type { StudioDocument } from "../composition/types.js";
import { validateStudioDocument } from "../composition/document.js";
import { quantitesStudio, type QuantitesStudio } from "../quantites.js";
import { exigenceUtilisable, UNITE_NOMBRE, type ComparaisonExigence, type ExigenceStudio, type JeuExigences, type MetriqueExigence } from "./exigences.js";

/**
 * Écarts entre un jeu d'exigences (une version) et le métré d'une révision (E.1-02 / E.1-03 / E.1-05). Pur : le
 * résultat est **calculé et affiché**, jamais réécrit dans l'exigence ni dans le document ; aucune exigence n'est
 * corrigée, aucune valeur n'est proposée.
 *
 * Deux dimensions distinctes :
 * - **état d'exécution** du contrôle : `execute` (le contrôle a tourné), `non-execute` (rien à contrôler : aucun jeu,
 *   ou aucune exigence utilisable), `erreur` (le document de la révision n'a pas pu être lu ou métré) ;
 * - **conclusion de conformité**, seulement quand le contrôle a tourné : par exigence `satisfaite`, `non-satisfaite`,
 *   `non-evaluee` (métrique absente ou non évaluée, total partiel, unité incompatible) ou `non-utilisee` (référence
 *   partenaire non acceptée : elle n'entre pas dans la conclusion) ; globale `non-satisfaite` dès qu'une exigence l'est,
 *   sinon `non-evaluee` dès qu'une l'est, sinon `satisfaite`.
 *
 * Chaque résultat est lié à la révision et à la version du jeu examinées (`revisionId`, `version`).
 */

export type EtatExecution = "execute" | "non-execute" | "erreur";
export type StatutExigence = "satisfaite" | "non-satisfaite" | "non-evaluee" | "non-utilisee";
export type ConclusionControle = "satisfaite" | "non-satisfaite" | "non-evaluee";
export type MotifNonEvaluee = "metrique-absente" | "metrique-non-evaluee" | "total-partiel" | "unite-incompatible" | "valeur-non-numerique";

export interface MesureExigence {
  /** Valeur mesurée (pleine précision) ou `null`. */
  valeur: number | null;
  unite: string;
  motif?: MotifNonEvaluee;
}

export interface EcartExigence {
  exigenceId: string;
  statut: StatutExigence;
  /** Mesure lue dans la révision ; absente pour une exigence non utilisée. */
  mesure?: MesureExigence;
  /** Écart signé mesure − valeur exigée, dans l'unité de l'exigence ; `null` si non évaluée. */
  ecart?: number | null;
  /** Rappel de ce qui a été examiné (l'exigence elle-même n'est jamais modifiée). */
  comparaison: ComparaisonExigence;
  valeurExigee: number;
  unite: string;
}

export interface ResultatControle {
  studyId: string;
  /** Révision examinée. */
  revisionId: string;
  /** Version du jeu examinée ; `null` : aucun jeu n'existait. */
  version: number | null;
  execution: EtatExecution;
  /** Motif d'un contrôle non exécuté ou en erreur. */
  motifExecution?: "aucun-jeu" | "aucune-exigence-utilisable" | "document-illisible";
  messageErreur?: string;
  /** Conclusion de conformité : seulement si `execution === "execute"`. */
  conclusion: ConclusionControle | null;
  ecarts: EcartExigence[];
  compte: Record<StatutExigence, number>;
}

/** Mesure d'une métrique dans le métré (et les propriétés déclarées) d'une révision. */
export function mesurerMetrique(m: MetriqueExigence, q: QuantitesStudio, doc: StudioDocument): MesureExigence {
  if (m.type === "propriete") {
    const p = doc.proprietes?.find((x) => x.cibleId === m.cibleId && x.nom === m.nom);
    if (!p) return { valeur: null, unite: "", motif: "metrique-absente" };
    if (p.valeur === undefined) return { valeur: null, unite: p.unite ?? "", motif: "metrique-non-evaluee" };
    if (typeof p.valeur !== "number") return { valeur: null, unite: p.unite ?? "", motif: "valeur-non-numerique" };
    return { valeur: p.valeur, unite: p.unite ?? "" };
  }
  if (m.type === "nombre") {
    const objets = (m.calqueId === undefined ? q.objets : q.objets.filter((o) => o.calqueId === m.calqueId))
      .filter((o) => m.nature === undefined || o.nature === m.nature);
    // Un calque visé inconnu du document : métrique absente (jamais « zéro objet » par défaut).
    if (m.calqueId !== undefined && !q.calques.some((c) => c.calqueId === m.calqueId)) return { valeur: null, unite: UNITE_NOMBRE, motif: "metrique-absente" };
    return { valeur: objets.length, unite: UNITE_NOMBRE };
  }
  if (m.type === "objet") {
    const o = q.objets.find((x) => x.objetId === m.objetId);
    const v = o?.valeurs.find((x) => x.grandeur === m.grandeur);
    if (!v) return { valeur: null, unite: "", motif: "metrique-absente" };
    return v.valeur === null ? { valeur: null, unite: v.unite, motif: "metrique-non-evaluee" } : { valeur: v.valeur, unite: v.unite };
  }
  const totaux = m.calqueId === undefined ? q.totaux : q.calques.find((c) => c.calqueId === m.calqueId)?.totaux;
  const t = totaux?.find((x) => x.grandeur === m.grandeur);
  if (!t) return { valeur: null, unite: "", motif: "metrique-absente" };
  if (t.valeur === null) return { valeur: null, unite: t.unite, motif: "metrique-non-evaluee" };
  // Un total partiel (au moins un objet non évalué) ne conclut pas : il pourrait masquer un dépassement.
  if (t.nonEvalues > 0) return { valeur: null, unite: t.unite, motif: "total-partiel" };
  return { valeur: t.valeur, unite: t.unite };
}

export function comparer(mesure: number, c: ComparaisonExigence, valeur: number, tolerance = 0): boolean {
  switch (c) {
    case "<=": return mesure <= valeur;
    case "<": return mesure < valeur;
    case ">=": return mesure >= valeur;
    case ">": return mesure > valeur;
    case "=": return Math.abs(mesure - valeur) <= tolerance;
  }
}

function ecartDe(e: ExigenceStudio, q: QuantitesStudio, doc: StudioDocument): EcartExigence {
  const base = { exigenceId: e.id, comparaison: e.comparaison, valeurExigee: e.valeur, unite: e.unite };
  if (!exigenceUtilisable(e)) return { ...base, statut: "non-utilisee" };
  const mesure = mesurerMetrique(e.metrique, q, doc);
  if (mesure.valeur === null) return { ...base, statut: "non-evaluee", mesure, ecart: null };
  // Unité jamais convertie : une propriété déclarée dans une autre unité n'est pas comparée.
  if (mesure.unite !== e.unite) return { ...base, statut: "non-evaluee", mesure: { valeur: mesure.valeur, unite: mesure.unite, motif: "unite-incompatible" }, ecart: null };
  return { ...base, statut: comparer(mesure.valeur, e.comparaison, e.valeur, e.tolerance) ? "satisfaite" : "non-satisfaite", mesure, ecart: mesure.valeur - e.valeur };
}

const compteVide = (): Record<StatutExigence, number> => ({ satisfaite: 0, "non-satisfaite": 0, "non-evaluee": 0, "non-utilisee": 0 });

/**
 * Contrôle d'une révision (`revisionId`, son document) par une version du jeu (`null` : aucun jeu). Ne lève jamais :
 * un document illisible donne `execution: "erreur"`, sans conclusion.
 */
export function controlerExigences(studyId: string, revisionId: string, document: unknown, jeu: Pick<JeuExigences, "version" | "exigences"> | null): ResultatControle {
  const tete = { studyId, revisionId, version: jeu?.version ?? null };
  if (!jeu) return { ...tete, execution: "non-execute", motifExecution: "aucun-jeu", conclusion: null, ecarts: [], compte: compteVide() };
  let doc: StudioDocument;
  let q: QuantitesStudio;
  try {
    doc = validateStudioDocument(document);
    q = quantitesStudio(doc);
  } catch (e) {
    return { ...tete, execution: "erreur", motifExecution: "document-illisible", messageErreur: e instanceof Error ? e.message : String(e), conclusion: null, ecarts: [], compte: compteVide() };
  }
  const ecarts = jeu.exigences.map((e) => ecartDe(e, q, doc));
  const compte = compteVide();
  for (const x of ecarts) compte[x.statut]++;
  const utilisees = ecarts.length - compte["non-utilisee"];
  if (utilisees === 0) return { ...tete, execution: "non-execute", motifExecution: "aucune-exigence-utilisable", conclusion: null, ecarts, compte };
  const conclusion: ConclusionControle = compte["non-satisfaite"] > 0 ? "non-satisfaite" : compte["non-evaluee"] > 0 ? "non-evaluee" : "satisfaite";
  return { ...tete, execution: "execute", conclusion, ecarts, compte };
}
