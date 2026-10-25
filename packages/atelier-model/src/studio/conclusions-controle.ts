import type { ResultatControle, StatutExigence } from "./composition/ecarts.js";
import type { JeuExigences } from "./exigences/exigences.js";

/**
 * Conclusion normative d'un contrôle (EX-068). Pur : ni React, ni DOM, ni stockage.
 *
 * Deux dimensions qui ne se confondent jamais :
 * - **statut d'exécution** : `en-attente` (demandé, pas de résultat, délai non échu), `delai-depasse` (aucun résultat à
 *   l'échéance), `echec-technique` (le contrôle n'a pas pu lire ou métrer la révision), `non-execute` (rien à contrôler),
 *   `execute` ;
 * - **conclusion normative**, seulement si le contrôle est `execute` : `conforme`, `non-conforme`, `non-teste`,
 *   `non-applicable-justifie`. Tout autre statut d'exécution donne une conclusion **absente** (null) : il n'est jamais
 *   interprété comme conforme (`estConforme`).
 *
 * « Non applicable » n'est admis que **justifié et vérifiable** : une justification nomme l'exigence (présente dans la
 * version examinée du jeu), la version, un motif, son auteur et sa date ; `verifierJustification` la recontrôle contre
 * le jeu et le résultat. Une justification invalide ne vaut rien : l'exigence garde sa conclusion mesurée. La mesure de
 * l'exigence reste rapportée à côté (`statutMesure`), jamais effacée.
 */

export type StudioConclusionNormative = "conforme" | "non-conforme" | "non-teste" | "non-applicable-justifie";
export type StudioStatutExecutionControle = "en-attente" | "delai-depasse" | "echec-technique" | "non-execute" | "execute";
export const STUDIO_CONCLUSIONS_NORMATIVES: readonly StudioConclusionNormative[] = Object.freeze(["conforme", "non-conforme", "non-teste", "non-applicable-justifie"] as const);

export interface JustificationNonApplicable {
  exigenceId: string;
  /** Version du jeu à laquelle la justification se rapporte. */
  version: number;
  motif: string;
  auteur: string;
  /** Date ISO 8601. */
  date: string;
}

export type RefusJustification = "exigence-inconnue" | "version-differente" | "motif-obligatoire" | "auteur-obligatoire" | "date-invalide";

/** Vérifie une justification de non-applicabilité contre la version examinée du jeu : null si elle est recevable. */
export function verifierJustification(j: JustificationNonApplicable, jeu: Pick<JeuExigences, "version" | "exigences"> | null): RefusJustification | null {
  if (!jeu || !jeu.exigences.some((e) => e.id === j?.exigenceId)) return "exigence-inconnue";
  if (j.version !== jeu.version) return "version-differente";
  if (typeof j.motif !== "string" || !j.motif.trim()) return "motif-obligatoire";
  if (typeof j.auteur !== "string" || !j.auteur.trim()) return "auteur-obligatoire";
  if (typeof j.date !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(j.date) || Number.isNaN(Date.parse(j.date))) return "date-invalide";
  return null;
}

export interface ConclusionExigence {
  exigenceId: string;
  /** Statut mesuré par le contrôle (inchangé). */
  statutMesure: StatutExigence;
  conclusion: StudioConclusionNormative;
  /** Justification retenue (conclusion `non-applicable-justifie`). */
  justification?: JustificationNonApplicable;
  /** Justification fournie mais refusée, avec son motif. */
  justificationRefusee?: RefusJustification;
}

export interface ConclusionControleNormative {
  revisionId: string;
  version: number | null;
  execution: StudioStatutExecutionControle;
  /** Null hors exécution : jamais « conforme » par défaut. */
  conclusion: StudioConclusionNormative | null;
  exigences: ConclusionExigence[];
}

const MESURE: Readonly<Record<StatutExigence, StudioConclusionNormative>> = Object.freeze({
  satisfaite: "conforme", "non-satisfaite": "non-conforme", "non-evaluee": "non-teste", "non-utilisee": "non-teste",
});

/** Statut d'exécution d'un résultat enregistré (le contrôle a rendu quelque chose). */
export const executionDe = (r: Pick<ResultatControle, "execution">): StudioStatutExecutionControle =>
  r.execution === "execute" ? "execute" : r.execution === "erreur" ? "echec-technique" : "non-execute";

/** Conclusion normative d'un contrôle exécuté, avec les justifications de non-applicabilité fournies. */
export function conclureControle(r: ResultatControle, jeu: Pick<JeuExigences, "version" | "exigences"> | null, justifications: readonly JustificationNonApplicable[] = []): ConclusionControleNormative {
  const execution = executionDe(r);
  const tete = { revisionId: r.revisionId, version: r.version, execution };
  if (execution !== "execute") return { ...tete, conclusion: null, exigences: [] };
  const exigences: ConclusionExigence[] = r.ecarts.map((e) => {
    const base = { exigenceId: e.exigenceId, statutMesure: e.statut };
    const j = justifications.filter((x) => x.exigenceId === e.exigenceId).at(-1);
    if (!j) return { ...base, conclusion: MESURE[e.statut] };
    // La justification doit porter sur la version examinée par CE résultat.
    const refus = r.version === null || r.version !== jeu?.version ? "version-differente" as const : verifierJustification(j, jeu);
    return refus ? { ...base, conclusion: MESURE[e.statut], justificationRefusee: refus } : { ...base, conclusion: "non-applicable-justifie", justification: j };
  });
  const c = (x: StudioConclusionNormative) => exigences.some((e) => e.conclusion === x);
  const conclusion: StudioConclusionNormative = c("non-conforme") ? "non-conforme" : c("non-teste") ? "non-teste"
    : exigences.length && exigences.every((e) => e.conclusion === "non-applicable-justifie") ? "non-applicable-justifie" : "conforme";
  return { ...tete, conclusion, exigences };
}

/** Demande de contrôle en cours : date de la demande et délai admis. */
export interface DemandeControle {
  id: string;
  revisionId: string;
  /** Date ISO 8601 de la demande. */
  demandeLe: string;
  /** Délai admis (ms) avant « délai dépassé ». */
  delaiMs: number;
}

/**
 * État d'une demande de contrôle : sans résultat, `en-attente` avant l'échéance et `delai-depasse` après ; avec un
 * résultat, son exécution. Un résultat arrivé après l'échéance reste rapporté tel quel (exécution du résultat).
 */
export function etatDemandeControle(d: DemandeControle, resultat: Pick<ResultatControle, "execution"> | null, maintenant: Date): StudioStatutExecutionControle {
  if (resultat) return executionDe(resultat);
  const echeance = Date.parse(d.demandeLe) + d.delaiMs;
  if (!Number.isFinite(echeance)) return "en-attente";
  return maintenant.getTime() > echeance ? "delai-depasse" : "en-attente";
}

/** Conclusion affichable d'une demande : null tant que le contrôle n'est pas exécuté (jamais « conforme »). */
export function conclusionDemande(d: DemandeControle, resultat: ResultatControle | null, jeu: Pick<JeuExigences, "version" | "exigences"> | null, maintenant: Date, justifications: readonly JustificationNonApplicable[] = []): ConclusionControleNormative {
  const execution = etatDemandeControle(d, resultat, maintenant);
  if (!resultat || execution !== "execute") return { revisionId: d.revisionId, version: resultat?.version ?? null, execution, conclusion: null, exigences: [] };
  return conclureControle(resultat, jeu, justifications);
}

/** Vrai seulement pour un contrôle exécuté et conclu conforme. */
export const estConforme = (c: Pick<ConclusionControleNormative, "execution" | "conclusion">): boolean => c.execution === "execute" && c.conclusion === "conforme";
