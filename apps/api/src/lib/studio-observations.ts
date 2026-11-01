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
 *   - rouvrir : l'auteur de l'observation ou le propriétaire ;
 *   - réattribuer : le propriétaire seul, tant que l'observation n'est pas clôturée.
 *
 * Suivi (E.2-01 à E.2-03, écritures dans `studio-observations-suivi.ts`) : liens de domaines (auteur, responsable
 * éditeur ou propriétaire), tâches (création par le propriétaire ou le responsable éditeur ; terminer : personne chargée
 * éditrice ou propriétaire ; annuler, réattribuer : créateur éditeur ou propriétaire ; rouvrir : propriétaire),
 * propositions (éditeur ou propriétaire) et décisions (propriétaire). Une observation clôturée n'en reçoit plus.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  StudioObservationAction, StudioObservationBcfRef, StudioObservationCategorie, StudioObservationDecisionNature, StudioObservationDecisionPortee, StudioObservationDomaine,
  StudioObservationGravite, StudioObservationPiece, StudioObservationStatut,
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
  /**
   * Relecteur à une portée étroite qui couvre cette observation (étude, variante, ou révision où elle est ancrée) :
   * capacité `constater` (`@parcours/domain-model`, portées étroites) — recontrôler et rouvrir, rien d'autre.
   */
  estRelecteur?: boolean;
}

/** Le statut d'arrivée, ou null si le passage n'est pas permis depuis ce statut. */
export function statutApres(statut: StudioObservationStatut, action: ObservationTransition): StudioObservationStatut | null {
  const regle = OBSERVATION_CYCLE[action];
  return regle.depuis.includes(statut) ? regle.vers ?? statut : null;
}

/**
 * Qui peut faire quel passage (indépendant du statut). Rouvrir, même une observation clôturée, reste permis à l'auteur
 * (contrat d'origine) : le passage est consigné au journal des passages ; réserver la réouverture d'une clôture au
 * propriétaire est une décision du maître d'ouvrage, non prise ici.
 */
export function acteurAutorise(action: ObservationTransition, a: ActeurObservation, _statut?: StudioObservationStatut): boolean {
  switch (action) {
    case "corriger": return a.estResponsable && a.peutEcrire;
    case "recontroler": return a.estAuteur || a.estProprietaire || a.estRelecteur === true;
    case "cloturer": return a.estProprietaire;
    case "rouvrir": return a.estAuteur || a.estProprietaire || a.estRelecteur === true;
    case "reattribuer": return a.estProprietaire;
  }
}

export const REFUS_ACTEUR: Record<ObservationTransition, string> = {
  corriger: "Seul le responsable de l'observation, propriétaire ou éditeur du projet, la déclare corrigée.",
  recontroler: "Seuls l'auteur de l'observation, le propriétaire du projet ou un Relecteur de sa portée la recontrôlent.",
  cloturer: "Seul le propriétaire du projet clôture une observation.",
  rouvrir: "Seuls l'auteur de l'observation, le propriétaire du projet ou un Relecteur de sa portée la rouvrent.",
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

// ---------------------------------------------------------------------------
// Contrat d'une observation (IF-010, EX-084 ; lot PUB) et observations bloquantes (IF-009).

/**
 * Vocabulaires décidés par le lot PUB (aucune règle de gravité n'est fournie par un référentiel) : une catégorie dit de
 * quel domaine relève le constat ; une gravité `bloquante` empêche la publication tant que l'observation n'est ni
 * résolue (clôturée) ni dérogée (décision « dérogation » du propriétaire). Absentes : « non évaluée », jamais devinées.
 */
export const OBSERVATION_CATEGORIES: readonly StudioObservationCategorie[] = Object.freeze(["coordination", "conformite", "geometrie", "documentation", "metre", "autre"] as const);
export const OBSERVATION_GRAVITES: readonly StudioObservationGravite[] = Object.freeze(["bloquante", "majeure", "mineure", "information"] as const);
export const OBSERVATION_PIECES_MAX = 5;

export type ResolutionObservation = "resolue" | "derogee" | "ouverte";

/**
 * Résolution d'une observation pour une publication : `resolue` si clôturée ; `derogee` si une DÉCISION (pas une
 * proposition) de portée « dérogation » a été prise et que l'observation n'a pas été rouverte depuis ; sinon `ouverte`.
 * Une tâche terminée, un commentaire ou une proposition ne résolvent rien (EX-084 : aucune transition implicite).
 */
export function resolutionObservation(
  statut: StudioObservationStatut,
  decisions: readonly { nature: string; portee: string; at: string }[],
  journal: readonly { action: string; at: string }[] = [],
): { resolution: ResolutionObservation; derogation?: { at: string } } {
  if (statut === "cloturee") return { resolution: "resolue" };
  const derniere = decisions.filter((d) => d.nature === "decision" && d.portee === "derogation").at(-1);
  if (!derniere) return { resolution: "ouverte" };
  const rouverteApres = journal.some((e) => e.action === "rouvrir" && e.at > derniere.at);
  return rouverteApres ? { resolution: "ouverte" } : { resolution: "derogee", derogation: { at: derniere.at } };
}

/** Contrat IF-010 d'une observation, relu depuis sa vue (aucun champ inventé : absent = null ou liste vide). */
export interface ContratObservation {
  issueId: string;
  /** Note d'origine (le commentaire promu) : objet distinct, relié (EX-084). */
  noteId: string;
  categorie: StudioObservationCategorie | null;
  /** Contrôles (exigences) d'où procède le constat, par les liens de domaine. */
  sourcesControle: string[];
  revisionsExaminees: string[];
  objets: string[];
  vue: { mode: string; ref: string | null } | null;
  auteur: string;
  gravite: StudioObservationGravite | null;
  description: string | null;
  pieces: StudioObservationPiece[];
  responsable: string;
  etat: StudioObservationStatut;
  journalDecisions: { seq: number; nature: string; portee: string; at: string }[];
  recontroles: string[];
  conditionCloture: string;
  referencesBcf: StudioObservationBcfRef[];
}

export const CONDITION_CLOTURE = "Clôture par le propriétaire, après recontrôle sur une révision descendante de la correction, motivée, sans tâche restant à faire.";

export function contratObservation(v: {
  id: string; issueId: string; categorie: StudioObservationCategorie | null; gravite: StudioObservationGravite | null; pieces: StudioObservationPiece[]; bcfRefs: StudioObservationBcfRef[];
  authorId: string; responsableId: string; statut: StudioObservationStatut; vue: { mode: string; ref: string | null } | null;
  liens: readonly { controleId: string | null; revisionId: string | null }[]; decisions: readonly { seq: number; nature: string; portee: string; at: string }[];
  journal: readonly { action: string; revisionId: string | null }[];
}, note: { body: string | null; revisionId: string | null; objectIds: readonly string[] }): ContratObservation {
  const revisions = new Set<string>();
  if (note.revisionId) revisions.add(note.revisionId);
  for (const l of v.liens) if (l.revisionId) revisions.add(l.revisionId);
  return {
    issueId: v.issueId, noteId: v.id, categorie: v.categorie, sourcesControle: [...new Set(v.liens.map((l) => l.controleId).filter((x): x is string => !!x))],
    revisionsExaminees: [...revisions], objets: [...note.objectIds], vue: v.vue, auteur: v.authorId, gravite: v.gravite, description: note.body, pieces: v.pieces,
    responsable: v.responsableId, etat: v.statut, journalDecisions: v.decisions.map((d) => ({ seq: d.seq, nature: d.nature, portee: d.portee, at: d.at })),
    recontroles: v.journal.filter((e) => e.action === "recontroler" && e.revisionId).map((e) => e.revisionId!), conditionCloture: CONDITION_CLOTURE, referencesBcf: v.bcfRefs,
  };
}

/** IF-010 (lot PUB) : catégorie, gravité et pièces justificatives (PDF, PNG ou JPEG, 2 Mo au plus chacune). */
export const studioObservationCategorieSchema = z.enum(OBSERVATION_CATEGORIES as [StudioObservationCategorie, ...StudioObservationCategorie[]]);
export const studioObservationGraviteSchema = z.enum(OBSERVATION_GRAVITES as [StudioObservationGravite, ...StudioObservationGravite[]]);
export const studioObservationPiecesSchema = z.array(z.object({
  name: z.string().trim().min(1).max(200), mime: z.enum(["application/pdf", "image/png", "image/jpeg"]), contentBase64: z.string().min(1).max(3_000_000),
}).strict()).max(OBSERVATION_PIECES_MAX);
/** Champs IF-010 cités (catégorie, gravité, pièces) : n'entrent dans l'empreinte de rejeu que s'ils sont cités. */
export function contenuIf010(input: { categorie?: string | undefined; gravite?: string | undefined; pieces?: readonly { name: string; mime: string; contentBase64: string }[] | undefined }): Record<string, unknown> {
  return {
    ...(input.categorie ? { categorie: input.categorie } : {}), ...(input.gravite ? { gravite: input.gravite } : {}),
    ...(input.pieces?.length ? { pieces: input.pieces.map((p) => ({ name: p.name, mime: p.mime, sha256: createHash("sha256").update(Buffer.from(p.contentBase64, "base64")).digest("hex") })) } : {}),
  };
}

