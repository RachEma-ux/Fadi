/**
 * Lectures pures du panneau « Observations » de Studio (E.2-01 à E.2-05) : libellés, filtres, éléments de domaine
 * proposés à partir de la révision affichée et de la sélection, recherche de l'observation qui suit déjà un élément
 * (identité réemployée). Aucun DOM, aucune requête ; les droits ne sont pas recalculés (le serveur renvoie `possibles`
 * et `peut`).
 */
import { quantitesStudio, type GrandeurQuantite, type StudioDocument } from "@parcours/atelier-model";
import { ApiError } from "../../../lib/api";
import { LIBELLE_GRANDEUR } from "../quantites/quantites-vue";
import type { DecisionObservation, DomaineObservation, ObservationSuivie, PassageTache, PassageTacheLu, RapprochementLu, StatutTache, SuiviRapprochement, VueObservation } from "./api-observations";

export const DOMAINES: readonly DomaineObservation[] = ["objet", "metre", "exigence", "revue"];
export const LIBELLE_DOMAINE: Record<DomaineObservation, string> = {
  objet: "Objet du modèle",
  metre: "Ligne de métré",
  exigence: "Exigence BIM",
  revue: "Revue (publication)",
};
export const LIBELLE_VUE: Record<VueObservation, string> = {
  plan: "Plan", "3d": "Vue 3D", feuille: "Feuille", quantites: "Quantités", exigences: "Exigences", revue: "Revue",
};
export const LIBELLE_STATUT_TACHE: Record<StatutTache, string> = { "a-faire": "À faire", faite: "Faite", annulee: "Annulée" };
export const LIBELLE_PASSAGE_TACHE: Record<PassageTache, string> = { terminer: "Déclarer faite", annuler: "Annuler la tâche", rouvrir: "Rouvrir", reattribuer: "Réattribuer" };
export const LIBELLE_JOURNAL_TACHE: Record<PassageTacheLu["action"], string> = { creer: "Créée", terminer: "Faite", annuler: "Annulée", rouvrir: "Rouverte", reattribuer: "Réattribuée" };

/** Statuts de suivi d'un rapprochement avec une révision ultérieure (EX-086) : jamais une clôture. */
export const LIBELLE_SUIVI_RAPPROCHEMENT: Record<SuiviRapprochement, string> = {
  "objet-disparu": "Objet disparu de la révision : résolution explicite requise",
  persiste: "Écart persistant dans la révision",
  "a-recontroler": "Éléments retrouvés : à recontrôler",
  "non-rapprochable": "Aucun élément rapprochable",
};
/**
 * Rapprochement affiché pour chaque observation : le plus récent avec la révision affichée s'il en existe un, sinon le
 * plus récent tout court (par date, puis par identifiant).
 */
export function dernierRapprochement(liste: readonly RapprochementLu[], revisionAffichee?: string): Map<string, RapprochementLu> {
  const out = new Map<string, RapprochementLu>();
  const rang = (r: RapprochementLu) => (r.revisionId === revisionAffichee ? 1 : 0);
  for (const r of liste) {
    const prec = out.get(r.observationId);
    if (!prec || rang(r) > rang(prec) || (rang(r) === rang(prec) && (prec.createdAt < r.createdAt || (prec.createdAt === r.createdAt && prec.id < r.id)))) out.set(r.observationId, r);
  }
  return out;
}

export function libelleDecision(d: Pick<DecisionObservation, "nature" | "portee">): string {
  if (d.nature === "decision") return d.portee === "cloture" ? "Décision de clôture" : "Décision";
  return d.portee === "cloture" ? "Proposition de clôture" : "Proposition";
}

export type FiltreSuivi = "toutes" | "mes-taches" | "ouvertes" | "a-cloturer";
export const FILTRES_SUIVI: readonly FiltreSuivi[] = ["toutes", "mes-taches", "ouvertes", "a-cloturer"];
export const LIBELLE_FILTRE_SUIVI: Record<FiltreSuivi, string> = {
  toutes: "Toutes", "mes-taches": "Mes tâches à faire", ouvertes: "Ouvertes", "a-cloturer": "À clôturer",
};
/** « Mes tâches » : une tâche à faire m'est confiée ; « ouvertes » : ouverte ou rouverte ; « à clôturer » : recontrôlée. */
export function passeFiltreSuivi(o: ObservationSuivie, f: FiltreSuivi): boolean {
  if (f === "toutes") return true;
  if (f === "mes-taches") return o.taches.some((t) => t.assignedToMe && t.statut === "a-faire");
  if (f === "ouvertes") return o.statut === "ouverte" || o.statut === "rouverte";
  return o.statut === "recontrolee";
}
export function compterSuivi(list: readonly ObservationSuivie[]): Record<FiltreSuivi, number> {
  return Object.fromEntries(FILTRES_SUIVI.map((f) => [f, list.filter((o) => passeFiltreSuivi(o, f)).length])) as Record<FiltreSuivi, number>;
}

/** L'observation de la variante qui suit déjà cet élément de domaine (au plus une), sinon null. */
export function suiviPar(list: readonly ObservationSuivie[], domaine: DomaineObservation, ref: string): ObservationSuivie | null {
  return list.find((o) => o.liens.some((l) => l.domaine === domaine && l.ref === ref)) ?? null;
}

export interface OptionLien { ref: string; libelle: string }
export interface SourcesLien {
  /** Révision affichée (enregistrée) : les objets et le métré y sont lus. */
  revision: StudioDocument;
  selection: readonly string[];
  exigences: readonly { id: string; libelle: string }[];
  publications: readonly { id: string; title: string }[];
}

/**
 * Éléments proposés pour un domaine : objets sélectionnés présents dans la révision ; leurs lignes de métré
 * (`objet#grandeur`) ; exigences du jeu courant de l'étude ; publications de la variante. Rien n'est inventé : un
 * domaine sans source donne une liste vide.
 */
export function optionsLien(domaine: DomaineObservation, s: SourcesLien): OptionLien[] {
  if (domaine === "exigence") return s.exigences.map((x) => ({ ref: x.id, libelle: x.libelle ? `${x.libelle} (${x.id})` : x.id }));
  if (domaine === "revue") return s.publications.map((p) => ({ ref: p.id, libelle: p.title }));
  // Objets du modèle : formes et cotes 2D, objets architecturaux (murs, ouvertures) et solides (même règle que le serveur).
  const r = s.revision;
  const known = new Set([...r.objects, ...(r.dimensions ?? []), ...(r.architecture ?? []), ...(r.solides ?? [])].map((o) => o.id));
  const objets = s.selection.filter((id) => known.has(id));
  if (domaine === "objet") return objets.map((id) => ({ ref: id, libelle: id }));
  const q = quantitesStudio(r);
  return objets.flatMap((id) => (q.objets.find((o) => o.objetId === id)?.valeurs ?? []).map((v) => ({
    ref: `${id}#${v.grandeur}`, libelle: `${id} · ${LIBELLE_GRANDEUR[v.grandeur as GrandeurQuantite] ?? v.grandeur}`,
  })));
}

/** Libellé d'un lien lu : domaine et élément (avec la grandeur d'une ligne de métré). */
export function libelleLien(domaine: DomaineObservation, ref: string): string {
  if (domaine === "metre") {
    const i = ref.lastIndexOf("#");
    const g = ref.slice(i + 1) as GrandeurQuantite;
    if (i > 0) return `${LIBELLE_DOMAINE.metre} : ${ref.slice(0, i)} · ${LIBELLE_GRANDEUR[g] ?? g}`;
  }
  return `${LIBELLE_DOMAINE[domaine]} : ${ref}`;
}

/** Refus du serveur affiché tel quel ; `observationId` quand l'élément est déjà suivi (identité à réemployer). */
export function lireRefus(err: unknown, defaut: string): { message: string; observationId: string | null } {
  if (err instanceof ApiError && err.status < 500 && err.status !== 408) {
    const body = (err.body ?? {}) as { observationId?: unknown };
    const observationId = (err.code === "deja_suivie" || err.code === "deja_liee") && typeof body.observationId === "string" ? body.observationId : null;
    return { message: err.serverMessage ?? defaut, observationId };
  }
  return { message: "Envoi non confirmé. Réessayez : la même demande sera rejouée sans doublon.", observationId: null };
}
