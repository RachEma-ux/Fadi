/**
 * Règles pures des observations Studio (E.2-01 à E.2-05) : aucune requête, aucun DOM. Le serveur
 * (`studio-commentaires.ts`) les applique sous transaction ; le panneau web en relit le résultat (`possibles`).
 *
 * Cycle : ouverte → corrigée → recontrôlée → clôturée ; rouverte depuis corrigée, recontrôlée ou clôturée ;
 * une observation rouverte se corrige comme une ouverte. La réattribution ne change pas le statut.
 *
 * Correspondance avec les rôles existants (`owned-project.ts`, aucun rôle nouveau) :
 *   - promouvoir un commentaire : son auteur ou le propriétaire du projet, avec le droit `comment` ;
 *   - responsable désigné (à l'ouverture comme à la réattribution) : le propriétaire ou un membre `editeur`
 *     (droit `write` : il peut produire la révision de correction ; un `lecteur` ne le peut pas), vérifié à ce moment ;
 *   - corriger : le responsable, **s'il a encore le droit `write`** (rétrogradé lecteur ou sorti du projet : refusé),
 *     en citant la révision de la variante où la correction a été faite ;
 *   - recontrôler : l'auteur de l'observation ou le propriétaire, contre une révision descendante (ou égale) de la
 *     révision de correction ;
 *   - clôturer : le propriétaire seul (droit `owner`, seul rôle « autorisé » du contrat existant), après recontrôle, avec
 *     un motif (consigné comme décision de clôture, journal des décisions) et sans tâche restant « à faire » ; un
 *     éditeur PROPOSE la clôture (décision de nature « proposition »), il ne la décide pas ;
 *   - rouvrir : l'auteur de l'observation ou le propriétaire ; une observation clôturée, le propriétaire seul ;
 *   - réattribuer : le propriétaire seul, tant que l'observation n'est pas clôturée.
 *
 * Suivi (E.2-01 à E.2-03, écritures dans `studio-observations-suivi.ts`) : liens de domaines (auteur, responsable
 * éditeur ou propriétaire), tâches (création par le propriétaire ou le responsable éditeur ; terminer : personne chargée
 * éditrice ou propriétaire ; annuler, réattribuer : créateur éditeur ou propriétaire ; rouvrir : propriétaire),
 * propositions (éditeur ou propriétaire) et décisions (propriétaire). Une observation clôturée n'en reçoit plus.
 */
import type {
  StudioObservationAction, StudioObservationDecisionNature, StudioObservationDecisionPortee, StudioObservationDomaine, StudioObservationStatut,
  StudioObservationTacheAction, StudioObservationTacheStatut, StudioObservationVueMode,
} from "../db/schema.js";

export type ObservationTransition = Exclude<StudioObservationAction, "ouvrir">;
export const OBSERVATION_TRANSITIONS: readonly ObservationTransition[] = ["corriger", "recontroler", "cloturer", "rouvrir", "reattribuer"];

/** Statuts de départ admis et statut d'arrivée de chaque passage (`null` : statut inchangé). */
export const OBSERVATION_CYCLE: Record<ObservationTransition, { depuis: readonly StudioObservationStatut[]; vers: StudioObservationStatut | null }> = {
  corriger: { depuis: ["ouverte", "rouverte"], vers: "corrigee" },
  recontroler: { depuis: ["corrigee"], vers: "recontrolee" },
  cloturer: { depuis: ["recontrolee"], vers: "cloturee" },
  rouvrir: { depuis: ["corrigee", "recontrolee", "cloturee"], vers: "rouverte" },
  reattribuer: { depuis: ["ouverte", "rouverte", "corrigee", "recontrolee"], vers: null },
};

/** Passages qui exigent une révision citée. */
export const REVISION_EXIGEE: Readonly<Record<ObservationTransition, boolean>> = { corriger: true, recontroler: true, cloturer: false, rouvrir: false, reattribuer: false };

export interface ActeurObservation {
  estResponsable: boolean;
  estAuteur: boolean;
  /** Rôle `proprietaire` du projet (droit `owner`). */
  estProprietaire: boolean;
  /** Droit `write` actuel (propriétaire ou éditeur). */
  peutEcrire: boolean;
}

/** Le statut d'arrivée, ou null si le passage n'est pas permis depuis ce statut. */
export function statutApres(statut: StudioObservationStatut, action: ObservationTransition): StudioObservationStatut | null {
  const regle = OBSERVATION_CYCLE[action];
  return regle.depuis.includes(statut) ? regle.vers ?? statut : null;
}

/**
 * Qui peut faire quel passage. Rouvrir une observation CLÔTURÉE revient à défaire la décision du propriétaire
 * (E.2-04, E.2-05) : seul le propriétaire le peut ; avant clôture, l'auteur rouvre aussi.
 */
export function acteurAutorise(action: ObservationTransition, a: ActeurObservation, statut?: StudioObservationStatut): boolean {
  if (action === "rouvrir" && statut === "cloturee") return a.estProprietaire;
  switch (action) {
    case "corriger": return a.estResponsable && a.peutEcrire;
    case "recontroler": return a.estAuteur || a.estProprietaire;
    case "cloturer": return a.estProprietaire;
    case "rouvrir": return a.estAuteur || a.estProprietaire;
    case "reattribuer": return a.estProprietaire;
  }
}

export const REFUS_ACTEUR: Record<ObservationTransition, string> = {
  corriger: "Seul le responsable de l'observation, propriétaire ou éditeur du projet, la déclare corrigée.",
  recontroler: "Seul l'auteur de l'observation ou le propriétaire du projet la recontrôle.",
  cloturer: "Seul le propriétaire du projet clôture une observation.",
  rouvrir: "Seul l'auteur de l'observation ou le propriétaire du projet la rouvre ; une observation clôturée, le propriétaire seul.",
  reattribuer: "Seul le propriétaire du projet réattribue une observation.",
};

/** `true` quand `ancetre` est `descendant` ou l'un de ses parents (chaîne des révisions d'une même variante). */
export function estAncetreOuEgale(parents: ReadonlyMap<string, string | null>, ancetre: string, descendant: string): boolean {
  const vus = new Set<string>();
  for (let r: string | null | undefined = descendant; r && !vus.has(r); r = parents.get(r)) {
    if (r === ancetre) return true;
    vus.add(r);
  }
  return false;
}

/** Échéance au format AAAA-MM-JJ et date réelle du calendrier. */
export function echeanceValide(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ---------------------------------------------------------------------------
// Clôture (E.2-04 / E.2-05) : décision du propriétaire, motivée, sans tâche en cours.

/**
 * Préalables de la décision de clôture, vérifiés APRÈS le rôle (403) et le statut (409 invalid_transition) : le motif de
 * la décision est exigé (il est consigné comme décision distincte) et aucune tâche de l'observation ne reste « à faire ».
 */
export function refusCloture(note: string | undefined, tachesAFaire: number): { status: number; body: Record<string, unknown> } | null {
  if (note === undefined || note.trim() === "") {
    return { status: 400, body: { error: "invalid_input", code: "motif_exige", message: "Motivez la décision de clôture : le motif est consigné au journal des décisions." } };
  }
  if (tachesAFaire > 0) {
    return { status: 409, body: { error: "taches_ouvertes", message: "Des tâches de cette observation restent à faire : terminez-les ou annulez-les avant la clôture.", count: tachesAFaire } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contexte de vue (E.2-02) et domaines (E.2-01)

export const VUE_MODES: readonly StudioObservationVueMode[] = ["plan", "3d", "feuille", "quantites", "exigences", "revue"];
export const OBSERVATION_DOMAINES: readonly StudioObservationDomaine[] = ["exigence", "metre", "revue", "objet"];

/** Référence d'une ligne de métré : objet et grandeur, séparés par `#` (un identifiant d'objet n'en contient pas). */
export function refMetre(objetId: string, grandeur: string): string { return `${objetId}#${grandeur}`; }
export function lireRefMetre(ref: string): { objetId: string; grandeur: string } | null {
  const i = ref.lastIndexOf("#");
  if (i <= 0 || i === ref.length - 1) return null;
  return { objetId: ref.slice(0, i), grandeur: ref.slice(i + 1) };
}

/** Révision exigée par le domaine (l'élément n'existe que dans une révision du document). */
export const DOMAINE_AVEC_REVISION: Readonly<Record<StudioObservationDomaine, boolean>> = { exigence: false, metre: true, revue: false, objet: true };

/** Qui ajoute un lien : l'auteur de l'observation, son responsable ou le propriétaire, toujours avec le droit `write`. */
export function peutLier(a: ActeurObservation): boolean {
  // Un lien réserve l'élément à cette observation (unicité par variante) : il exige le droit `write`, jamais un simple
  // droit de commenter (un lecteur ne verrouille aucun élément).
  return a.peutEcrire && (a.estAuteur || a.estProprietaire || a.estResponsable);
}

// ---------------------------------------------------------------------------
// Tâches (E.2-03)

export type TacheTransition = Exclude<StudioObservationTacheAction, "creer">;
export const TACHE_TRANSITIONS: readonly TacheTransition[] = ["terminer", "annuler", "rouvrir", "reattribuer"];
export const TACHE_CYCLE: Record<TacheTransition, { depuis: readonly StudioObservationTacheStatut[]; vers: StudioObservationTacheStatut | null }> = {
  terminer: { depuis: ["a-faire"], vers: "faite" },
  annuler: { depuis: ["a-faire"], vers: "annulee" },
  rouvrir: { depuis: ["faite", "annulee"], vers: "a-faire" },
  reattribuer: { depuis: ["a-faire"], vers: null },
};
export function tacheApres(statut: StudioObservationTacheStatut, action: TacheTransition): StudioObservationTacheStatut | null {
  const r = TACHE_CYCLE[action];
  return r.depuis.includes(statut) ? r.vers ?? statut : null;
}

export interface ActeurTache {
  estProprietaire: boolean;
  peutEcrire: boolean;
  estResponsableObservation: boolean;
  estChargee: boolean;
  estCreateur: boolean;
}
/** Création : le propriétaire, ou le responsable de l'observation s'il a encore le droit `write`. */
export function peutCreerTache(a: Pick<ActeurTache, "estProprietaire" | "peutEcrire" | "estResponsableObservation">): boolean {
  return a.estProprietaire || (a.estResponsableObservation && a.peutEcrire);
}
/** Passages d'une tâche : terminer (personne chargée avec `write`, ou propriétaire) ; annuler et réattribuer (créateur avec `write`, ou propriétaire) ; rouvrir (propriétaire). */
export function tacheAutorisee(action: TacheTransition, a: ActeurTache): boolean {
  if (a.estProprietaire) return true;
  if (!a.peutEcrire) return false;
  switch (action) {
    case "terminer": return a.estChargee;
    case "annuler":
    case "reattribuer": return a.estCreateur;
    case "rouvrir": return false;
  }
}
export const REFUS_TACHE: Record<TacheTransition | "creer", string> = {
  creer: "Seul le propriétaire du projet ou le responsable de l'observation (éditeur) crée une tâche.",
  terminer: "Seule la personne chargée de la tâche (éditeur) ou le propriétaire du projet la déclare faite.",
  annuler: "Seul le créateur de la tâche (éditeur) ou le propriétaire du projet l'annule.",
  rouvrir: "Seul le propriétaire du projet rouvre une tâche.",
  reattribuer: "Seul le créateur de la tâche (éditeur) ou le propriétaire du projet la réattribue.",
};

// ---------------------------------------------------------------------------
// Décisions (E.2-03 / E.2-05) : un éditeur propose, le propriétaire décide ; la clôture se décide par le passage.

/**
 * Refus d'une décision ou d'une proposition écrite par la route des décisions (null : admise). Le lecteur ne propose
 * ni ne décide ; l'éditeur propose seulement ; une décision de clôture ne s'écrit que par le passage « clôturer »
 * (propriétaire, observation recontrôlée), jamais ici.
 */
export function refusDecision(nature: StudioObservationDecisionNature, portee: StudioObservationDecisionPortee, a: Pick<ActeurObservation, "estProprietaire" | "peutEcrire">): { status: number; body: Record<string, unknown> } | null {
  if (!a.peutEcrire) return { status: 403, body: { error: "forbidden", message: "Seuls le propriétaire et les éditeurs du projet proposent ou décident." } };
  if (nature === "decision" && !a.estProprietaire) return { status: 403, body: { error: "forbidden", message: "Seul le propriétaire du projet décide ; un éditeur propose." } };
  if (nature === "decision" && portee === "cloture") {
    return { status: 400, body: { error: "invalid_input", code: "cloture_par_passage", message: "La décision de clôture se prend par le passage « clôturer », après recontrôle." } };
  }
  return null;
}
