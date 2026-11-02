/**
 * Solidification d'une surface de subdivision fermée dans l'interface (X.1-05), sur le modèle de l'épaississement
 * (`epaississement-session.ts`) — la part pure, sans React ni Worker : capture (modèle : `studioCaptureSolidification`,
 * maillage subdivisé en entrée `polyedre` du noyau), tâche soumise à l'ordonnanceur exact, jugement du retour (périmé,
 * panne, refus du noyau), engagement explicite de la commande `studio.subdivision.solidifier` après vérification.
 */
import {
  studioCaptureSolidification, studioCommandeSolidification, studioVerifierSolidification,
  type StudioCaptureSolidification, type StudioCommand, type StudioDocument, type StudioResultatExact,
} from "@parcours/atelier-model";
import { hacher } from "../taches/empreinte";
import type { DemandeTache, IssueTache } from "../taches/ordonnanceur";
import { MESSAGES_BOOLEEN, resultatDe } from "./booleen-session";
import { MESSAGES_EPAISSISSEMENT } from "./epaississement-session";

export interface DemandeSolidification { readonly capture: StudioCaptureSolidification; readonly revision: string; readonly id: string }

export type EtatSolidification =
  | { etape: "inactif" }
  | { etape: "calcul"; demande: DemandeSolidification }
  | { etape: "pret"; demande: DemandeSolidification; resultat: StudioResultatExact }
  | { etape: "perime"; demande: DemandeSolidification; resultat: StudioResultatExact | null; message: string }
  | { etape: "echec"; demande: DemandeSolidification; message: string; relancer: boolean }
  | { etape: "engage"; id: string };

export const CLE_TACHE_SOLIDIFICATION = "studio.exact.solidification";

export function demandeSolidification(doc: StudioDocument, revision: string, subdivision: string, id: string): { ok: true; demande: DemandeSolidification } | { ok: false; message: string } {
  const c = studioCaptureSolidification(doc, { subdivision });
  return c.ok ? { ok: true, demande: Object.freeze({ capture: c.capture, revision, id }) } : { ok: false, message: c.message };
}

export function tacheSolidification(d: DemandeSolidification): DemandeTache<{ entrees: StudioCaptureSolidification["entrees"] }, unknown> {
  return { cle: CLE_TACHE_SOLIDIFICATION, classe: "interactive", nature: "solidification", charge: { entrees: d.capture.entrees }, empreinte: { revision: d.revision, parametres: hacher(d.capture.entrees) } };
}

export function etatApresSolidification(d: DemandeSolidification, issue: IssueTache<unknown>, revisionCourante: string): EtatSolidification {
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

export function etatCourantSolidification(e: EtatSolidification, revisionCourante: string): EtatSolidification {
  return e.etape === "pret" && e.demande.revision !== revisionCourante ? { etape: "perime", demande: e.demande, resultat: e.resultat, message: MESSAGES_EPAISSISSEMENT.perimeRevision } : e;
}

export function engagementSolidification(e: EtatSolidification, courant: { doc: StudioDocument; revision: string; modifiable: boolean }): { ok: true; commandes: StudioCommand[] } | { ok: false; etat: EtatSolidification; message: string } {
  if (e.etape !== "pret") return { ok: false, etat: e, message: MESSAGES_EPAISSISSEMENT.aucunResultat };
  if (e.demande.revision !== courant.revision) return { ok: false, etat: { etape: "perime", demande: e.demande, resultat: e.resultat, message: MESSAGES_EPAISSISSEMENT.perimeRevision }, message: MESSAGES_EPAISSISSEMENT.perimeRevision };
  const v = studioVerifierSolidification(courant.doc, e.demande.capture, courant.modifiable);
  if (!v.ok) return { ok: false, etat: v.motif === "perime" ? { etape: "perime", demande: e.demande, resultat: e.resultat, message: v.message } : e, message: v.message };
  return { ok: true, commandes: [studioCommandeSolidification(e.demande.capture, e.demande.id, e.resultat)] };
}
