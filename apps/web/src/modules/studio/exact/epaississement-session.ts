/**
 * Déroulé de l'épaississement exact d'une surface libre dans l'interface (X.1-05), sur le modèle du booléen exact
 * (lot F2, IF-003 ① à ⑦) — la part pure, sans React ni Worker :
 *
 * ① ② `demandeEpaississement` : capture immuable (modèle : `studioCaptureEpaississement`), plus la **révision** du
 *    brouillon au moment de la capture et l'identifiant du futur solide exact ;
 * ③ `tacheEpaississement` : la demande soumise à l'ordonnanceur des tâches exactes (même noyau, même Worker) ;
 * ⑤ ⑥ `etatApresEpaississement` : résultat d'une **ancienne révision** périmé, jamais engagé ; panne du Worker
 *    annoncée, relance explicite ; refus du noyau (surface invalide) dit tel quel ;
 * ⑦ `engagementEpaississement` : la commande `studio.surface.epaissir` du seul résultat exact, après une dernière
 *    vérification du contexte (révision, surface inchangée, droits). Le serveur recalcule et fait autorité.
 *
 * Aucune fonction ne modifie le document : seule la commande rendue par l'engagement, appliquée par l'éditeur, le fait.
 */
import {
  studioCaptureEpaississement, studioCommandeEpaississement, studioVerifierEpaississement,
  type StudioCaptureEpaississement, type StudioCommand, type StudioDocument, type StudioResultatExact,
} from "@parcours/atelier-model";
import { hacher } from "../taches/empreinte";
import type { DemandeTache, IssueTache } from "../taches/ordonnanceur";
import { MESSAGES_BOOLEEN, resultatDe } from "./booleen-session";

export interface DemandeEpaississement {
  readonly capture: StudioCaptureEpaississement;
  readonly revision: string;
  readonly id: string;
}

export type EtatEpaississement =
  | { etape: "inactif" }
  | { etape: "calcul"; demande: DemandeEpaississement }
  | { etape: "pret"; demande: DemandeEpaississement; resultat: StudioResultatExact }
  | { etape: "perime"; demande: DemandeEpaississement; resultat: StudioResultatExact | null; message: string }
  | { etape: "echec"; demande: DemandeEpaississement; message: string; relancer: boolean }
  | { etape: "engage"; id: string };

export const CLE_TACHE_EPAISSISSEMENT = "studio.exact.epaississement";

export const MESSAGES_EPAISSISSEMENT = Object.freeze({
  perimeRevision: "Résultat périmé : le dessin a changé depuis le calcul ; il n’est pas engagé (conservé pour information seulement).",
  aucunResultat: "Aucun résultat exact prêt à engager.",
});

export type ResultatDemandeEpaississement = { ok: true; demande: DemandeEpaississement } | { ok: false; message: string };

/** ① ② : capture des valeurs saisies (surface, épaisseur, côté) sur le brouillon courant et de sa révision. */
export function demandeEpaississement(doc: StudioDocument, revision: string, params: { surface: string; epaisseur: number; sens: string }, id: string): ResultatDemandeEpaississement {
  const c = studioCaptureEpaississement(doc, { surface: params.surface, epaisseur: Number.isFinite(params.epaisseur) ? params.epaisseur : null, sens: params.sens });
  return c.ok ? { ok: true, demande: Object.freeze({ capture: c.capture, revision, id }) } : { ok: false, message: c.message };
}

/** ③ : la tâche soumise à l'ordonnanceur des tâches exactes (une nouvelle demande sur la même clé périme la précédente). */
export function tacheEpaississement(d: DemandeEpaississement): DemandeTache<{ entrees: StudioCaptureEpaississement["entrees"] }, unknown> {
  return { cle: CLE_TACHE_EPAISSISSEMENT, classe: "interactive", nature: "epaississement", charge: { entrees: d.capture.entrees }, empreinte: { revision: d.revision, parametres: hacher(d.capture.entrees) } };
}

/** ⑤ ⑥ : état après le retour de la tâche, jugé sur la révision courante du brouillon. */
export function etatApresEpaississement(d: DemandeEpaississement, issue: IssueTache<unknown>, revisionCourante: string): EtatEpaississement {
  if (issue.etat === "cancelled" || issue.etat === "superseded") return { etape: "inactif" };
  if (issue.etat === "timed-out") return { etape: "echec", demande: d, message: "Le noyau exact n’a pas répondu à temps : le calcul est abandonné, le document n’a pas été modifié. Relancez le noyau exact.", relancer: true };
  if (issue.etat === "failed") {
    if (issue.code === "calcul") return { etape: "echec", demande: d, message: MESSAGES_BOOLEEN.calculRefuse.replace("{0}", issue.message), relancer: false };
    return { etape: "echec", demande: d, message: issue.message, relancer: true };
  }
  const resultat = resultatDe(issue.valeur);
  if (!resultat) return { etape: "echec", demande: d, message: MESSAGES_BOOLEEN.resultatIllisible, relancer: false };
  if (revisionCourante !== d.revision) return { etape: "perime", demande: d, resultat, message: MESSAGES_EPAISSISSEMENT.perimeRevision };
  return { etape: "pret", demande: d, resultat };
}

/** Un résultat prêt devient périmé dès que la révision du brouillon change. */
export function etatCourantEpaississement(e: EtatEpaississement, revisionCourante: string): EtatEpaississement {
  return e.etape === "pret" && e.demande.revision !== revisionCourante ? { etape: "perime", demande: e.demande, resultat: e.resultat, message: MESSAGES_EPAISSISSEMENT.perimeRevision } : e;
}

export type ResultatEngagementEpaississement = { ok: true; commandes: StudioCommand[] } | { ok: false; etat: EtatEpaississement; message: string };

/** ⑦ : commande d'engagement du résultat exact, après une dernière vérification du contexte et des droits. */
export function engagementEpaississement(e: EtatEpaississement, courant: { doc: StudioDocument; revision: string; modifiable: boolean }): ResultatEngagementEpaississement {
  if (e.etape !== "pret") return { ok: false, etat: e, message: MESSAGES_EPAISSISSEMENT.aucunResultat };
  if (e.demande.revision !== courant.revision) return { ok: false, etat: { etape: "perime", demande: e.demande, resultat: e.resultat, message: MESSAGES_EPAISSISSEMENT.perimeRevision }, message: MESSAGES_EPAISSISSEMENT.perimeRevision };
  const v = studioVerifierEpaississement(courant.doc, e.demande.capture, courant.modifiable);
  if (!v.ok) return { ok: false, etat: v.motif === "perime" ? { etape: "perime", demande: e.demande, resultat: e.resultat, message: v.message } : e, message: v.message };
  return { ok: true, commandes: [studioCommandeEpaississement(e.demande.capture, e.demande.id, e.resultat)] };
}
