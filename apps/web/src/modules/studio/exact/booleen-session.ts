/**
 * Déroulé d'un booléen exact dans l'interface (lot F2, IF-003 ① à ⑦) — la part pure, sans React ni Worker :
 *
 * ① ② `demandeBooleen` : collecte et capture immuable (modèle : `studioCaptureBooleen`), plus la **révision** du
 *    brouillon au moment de la capture et l'identifiant du futur solide ;
 * ③ `tacheBooleen` : la demande soumise à l'ordonnanceur des tâches exactes (clé, classe, empreinte = révision +
 *    entrées du noyau) ;
 * ⑤ ⑥ `etatApresIssue` : le retour du Worker est jugé — résultat d'une **ancienne révision** : périmé, jamais engagé
 *    (TEST-014) ; aperçu provisoire comparé au résultat exact, refusé au-delà de la tolérance (TR-EX-058) ; panne du
 *    Worker : échec annoncé, relance explicite (TEST-015) ;
 * ⑦ `engagement` : la commande `studio.solide.booleen` du seul résultat exact, après une dernière vérification du
 *    contexte (révision, opérandes, droits).
 *
 * Aucune fonction ne modifie le document : seule la commande rendue par `engagement`, appliquée par l'éditeur, le fait.
 */
import {
  studioCaptureBooleen, studioCommandeBooleen, studioComparerApercu, studioVerifierEngagement, validerResultatExact,
  type StudioCaptureBooleen, type StudioCommand, type StudioComparaisonApercu, type StudioDocument, type StudioResultatExact,
} from "@parcours/atelier-model";
import { hacher } from "../taches/empreinte";
import type { DemandeTache, IssueTache } from "../taches/ordonnanceur";

export interface DemandeBooleen {
  readonly capture: StudioCaptureBooleen;
  /** Révision du brouillon au moment de la capture (IF-003 ②). */
  readonly revision: string;
  /** Identifiant du solide exact à engager. */
  readonly id: string;
}

export type EtatBooleen =
  | { etape: "inactif" }
  | { etape: "calcul"; demande: DemandeBooleen }
  | { etape: "pret"; demande: DemandeBooleen; resultat: StudioResultatExact; comparaison: StudioComparaisonApercu }
  | { etape: "perime"; demande: DemandeBooleen; resultat: StudioResultatExact | null; message: string }
  | { etape: "echec"; demande: DemandeBooleen; message: string; relancer: boolean }
  | { etape: "engage"; id: string };

export const CLE_TACHE_BOOLEEN = "studio.exact.booleen";

export const MESSAGES_BOOLEEN = Object.freeze({
  perimeRevision: "Résultat périmé : le dessin a changé depuis le calcul ; il n’est pas engagé (conservé pour information seulement).",
  apercuConfirme: "Aperçu provisoire confirmé par le calcul exact (écart dans la tolérance).",
  apercuRefuse: "Aperçu provisoire refusé : il s’écarte du calcul exact au-delà de la tolérance. Seul le résultat exact peut être engagé.",
  calculRefuse: "Calcul exact refusé par le noyau : {0}",
  resultatIllisible: "Résultat du noyau exact illisible : rien n’est engagé.",
});

export type ResultatDemande = { ok: true; demande: DemandeBooleen } | { ok: false; message: string };

/** ① ② : capture des paramètres saisis sur le brouillon courant et de sa révision. */
export function demandeBooleen(doc: StudioDocument, revision: string, params: { operation: string; a: string; b: string }, id: string): ResultatDemande {
  const c = studioCaptureBooleen(doc, { operation: params.operation, operandes: [params.a, params.b] });
  return c.ok ? { ok: true, demande: Object.freeze({ capture: c.capture, revision, id }) } : { ok: false, message: c.message };
}

/** ③ : la tâche soumise à l'ordonnanceur des tâches exactes (une nouvelle demande sur la même clé périme la précédente). */
export function tacheBooleen(d: DemandeBooleen): DemandeTache<{ entrees: StudioCaptureBooleen["entrees"] }, unknown> {
  return { cle: CLE_TACHE_BOOLEEN, classe: "interactive", nature: "booleen", charge: { entrees: d.capture.entrees }, empreinte: { revision: d.revision, parametres: hacher(d.capture.entrees) } };
}

/** Résultat du Worker ramené au contrat du modèle (champs du résultat exact seulement, validés). */
export function resultatDe(valeur: unknown): StudioResultatExact | null {
  if (!valeur || typeof valeur !== "object") return null;
  const v = valeur as Record<string, unknown>;
  try {
    return validerResultatExact({ brep: v.brep, maillage: v.maillage, volume: v.volume, aire: v.aire, faces: v.faces, solides: v.solides, moteur: v.moteur, versionMoteur: v.versionMoteur, empreinte: v.empreinte }, "resultat");
  } catch { return null; }
}

/** ⑤ ⑥ : état après le retour de la tâche, jugé sur la révision courante du brouillon. */
export function etatApresIssue(d: DemandeBooleen, issue: IssueTache<unknown>, revisionCourante: string): EtatBooleen {
  if (issue.etat === "cancelled") return { etape: "inactif" };
  if (issue.etat === "timed-out") return { etape: "echec", demande: d, message: "Le noyau exact n’a pas répondu à temps : le calcul est abandonné, le document n’a pas été modifié. Relancez le noyau exact.", relancer: true };
  if (issue.etat === "failed") {
    if (issue.code === "calcul") return { etape: "echec", demande: d, message: MESSAGES_BOOLEEN.calculRefuse.replace("{0}", issue.message), relancer: false };
    return { etape: "echec", demande: d, message: issue.message, relancer: true };
  }
  const resultat = resultatDe(issue.valeur);
  if (!resultat) return { etape: "echec", demande: d, message: MESSAGES_BOOLEEN.resultatIllisible, relancer: false };
  if (revisionCourante !== d.revision) return { etape: "perime", demande: d, resultat, message: MESSAGES_BOOLEEN.perimeRevision };
  return { etape: "pret", demande: d, resultat, comparaison: studioComparerApercu(d.capture.apercu, resultat) };
}

/** Un résultat prêt devient périmé dès que la révision du brouillon change (affichage : jamais présenté comme à jour). */
export function etatCourant(e: EtatBooleen, revisionCourante: string): EtatBooleen {
  return e.etape === "pret" && e.demande.revision !== revisionCourante ? { etape: "perime", demande: e.demande, resultat: e.resultat, message: MESSAGES_BOOLEEN.perimeRevision } : e;
}

export type ResultatEngagement = { ok: true; commandes: StudioCommand[] } | { ok: false; etat: EtatBooleen; message: string };

/** ⑦ : commande d'engagement du résultat exact, après une dernière vérification du contexte et des droits. */
export function engagement(e: EtatBooleen, courant: { doc: StudioDocument; revision: string; modifiable: boolean }): ResultatEngagement {
  if (e.etape !== "pret") return { ok: false, etat: e, message: "Aucun résultat exact prêt à engager." };
  if (e.demande.revision !== courant.revision) return { ok: false, etat: { etape: "perime", demande: e.demande, resultat: e.resultat, message: MESSAGES_BOOLEEN.perimeRevision }, message: MESSAGES_BOOLEEN.perimeRevision };
  const v = studioVerifierEngagement(courant.doc, e.demande.capture, courant.modifiable);
  if (!v.ok) return { ok: false, etat: v.motif === "perime" ? { etape: "perime", demande: e.demande, resultat: e.resultat, message: v.message } : e, message: v.message };
  return { ok: true, commandes: [studioCommandeBooleen(e.demande.capture, e.demande.id, e.resultat)] };
}
