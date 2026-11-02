/**
 * Commandes de la barre « Axes et repères » (chantier Axes, lot AX-2 ; concept Axes 1.0, § 4.2). Chacune a son
 * pictogramme, sa place dans la barre et un raccourci (règle d'or), lus au registre unique du Sandbox. Leur
 * disponibilité se calcule ici, sans React ni DOM, pour que la barre, « Outils ▾ » et le clavier disent la même chose :
 * une commande grisée explique ce qui manque (sélection, plan, contexte), elle ne se tait jamais.
 */
import { type ContexteTravail, type Pictogramme, type PlanRepere, OUTILS_PLAN_VERROUILLABLE, PLANS_REPERE, entreeCommande } from "@parcours/sandbox-planche-model";
import type { CleMessage } from "../messages";

export type IdCommandeRepere =
  | "choisir-repere"
  | "aligner-repere"
  | "pivoter-repere"
  | "plan-de-travail"
  | "verrouiller-plan"
  | "vue-normale-plan"
  | "repere-precedent"
  | "repere-modele"
  | "affichage-axes"
  | "enregistrer-repere"
  | "gerer-reperes"
  | "origine-composant";

export interface CommandeRepere {
  readonly id: IdCommandeRepere;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  /** Nom court, visible dans la barre compacte. */
  readonly court: CleMessage;
  readonly raccourci: string;
  /** Commande principale (toujours dans la barre) ou secondaire (menu « Plus »). */
  readonly principale: boolean;
}

function depuisRegistre(id: IdCommandeRepere): { picto: Pictogramme; raccourci: string } {
  const e = entreeCommande(id);
  if (e.raccourci === null) throw new Error(`Registre du Sandbox : commande « ${id} » sans raccourci`);
  return { picto: e.pictogramme, raccourci: e.raccourci };
}

const c = (id: IdCommandeRepere, principale: boolean): CommandeRepere => ({
  id,
  ...depuisRegistre(id),
  libelle: `planche.reperes.cmd.${id}` as CleMessage,
  court: `planche.reperes.court.${id}` as CleMessage,
  principale,
});

/**
 * Ordre de la barre (§ 4.1) : sélecteur du repère actif, Placer (l'outil Axes), Aligner, Plan, Précédent, Modèle, puis
 * « Plus » : Pivoter, Verrouiller le plan, Vue normale au plan, Affichage des axes.
 */
export const COMMANDES_REPERES: readonly CommandeRepere[] = [
  c("choisir-repere", true),
  c("aligner-repere", true),
  c("plan-de-travail", true),
  c("repere-precedent", true),
  c("repere-modele", true),
  c("pivoter-repere", false),
  c("verrouiller-plan", false),
  c("vue-normale-plan", false),
  c("affichage-axes", false),
  c("enregistrer-repere", false),
  c("gerer-reperes", false),
  c("origine-composant", false),
];

export const commandeRepere = (id: IdCommandeRepere): CommandeRepere => COMMANDES_REPERES.find((x) => x.id === id) as CommandeRepere;

/** Ce que la disponibilité doit savoir. */
export interface EtatReperes {
  readonly contexte: ContexteTravail;
  /** Nombre de contextes antérieurs (« Repère précédent »). */
  readonly precedents: number;
  /** Une face est sélectionnée (Aligner). */
  readonly face: boolean;
  /** Un groupe ou un composant est sélectionné (Origine du composant). */
  readonly objet?: boolean;
  /** Lecture seule : l'origine d'un composant est une édition d'objet, refusée au lecteur. */
  readonly lecture?: boolean;
}

export interface DisponibiliteRepere {
  readonly disponible: boolean;
  readonly motif: CleMessage | null;
}

/**
 * Le contexte de travail est personnel (AX-D3) : un lecteur peut en changer comme de point de vue ; aucune de ces
 * commandes ne modifie le document.
 */
export function disponibiliteRepere(id: IdCommandeRepere, e: EtatReperes): DisponibiliteRepere {
  if (id === "aligner-repere" && !e.face) return { disponible: false, motif: "planche.reperes.motif.face" };
  if (id === "origine-composant" && e.lecture) return { disponible: false, motif: "planche.objets.motif.lecture" };
  if (id === "origine-composant" && !e.objet) return { disponible: false, motif: "planche.reperes.motif.objet" };
  if (id === "repere-precedent" && e.precedents === 0) return { disponible: false, motif: "planche.reperes.motif.precedent" };
  if (id === "repere-modele" && e.contexte.source.genre === "modele" && e.contexte.plan === "xy" && !e.contexte.verrou) return { disponible: false, motif: "planche.reperes.motif.modele" };
  return { disponible: true, motif: null };
}

/** Plan suivant du cycle XY → XZ → YZ → XY. */
export function planSuivant(p: PlanRepere): PlanRepere {
  return PLANS_REPERE[(PLANS_REPERE.indexOf(p) + 1) % PLANS_REPERE.length] as PlanRepere;
}

/** Le verrou du plan s'applique-t-il à l'outil actif ? Sinon l'interface le dit avant le premier point (§ 5.3). */
export const verrouApplicable = (outil: string): boolean => OUTILS_PLAN_VERROUILLABLE.includes(outil);

/** Nom du repère actif (clé de message), d'après sa source. */
export function cleNomRepere(c: ContexteTravail): CleMessage {
  return c.source.genre === "modele" ? "planche.reperes.nom.modele" : c.source.genre === "temporaire" ? "planche.reperes.nom.temporaire" : "planche.reperes.nom.enregistre";
}

/** Nom affiché du repère actif : le nom d'un repère enregistré (lu au document), sinon le nom de sa source. */
export function nomRepereActif(c: ContexteTravail, noms: Readonly<Record<string, { readonly nom: string }>>, t: (cle: CleMessage) => string): string {
  if (c.source.genre === "enregistre") return noms[c.source.id]?.nom ?? t("planche.reperes.nom.enregistre");
  if (c.source.genre === "temporaire" && c.source.depuis && noms[c.source.depuis.id]) return noms[c.source.depuis.id]!.nom;
  return t(cleNomRepere(c));
}
