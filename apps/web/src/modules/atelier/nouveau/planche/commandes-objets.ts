/**
 * Commandes d'objet de la Planche (lot Objets O-1, D-202, D-203) : Grouper, Créer un composant, Éclater. Chacune a sa
 * propre icône, sa place dans la barre d'actions flottante et un raccourci clavier (règle d'or, `AGENTS.md`) ; leur
 * disponibilité se calcule ici, sans React ni DOM, pour que le menu, la barre et le clavier disent la même chose.
 */
import { type Modele, normaliserRaccourci } from "@parcours/planche-model";
import type { CleMessage } from "../messages";

export type IdCommandeObjet = "groupe" | "composant" | "eclater";

export interface CommandeObjet {
  readonly id: IdCommandeObjet;
  /** Icône propre (texte court, comme les outils), jamais partagée avec un outil ni avec le type d'objet du Navigateur. */
  readonly picto: string;
  /** Libellé au catalogue de messages. */
  readonly libelle: CleMessage;
  /** Raccourci canonique (forme du catalogue : « Ctrl+Maj+G »). */
  readonly raccourci: string;
}

/** Ordre d'affichage dans la barre d'actions : créer un objet, puis le dissoudre. */
export const COMMANDES_OBJETS: readonly CommandeObjet[] = [
  { id: "groupe", picto: "⊞", libelle: "planche.menu.groupe", raccourci: "Ctrl+G" },
  { id: "composant", picto: "❖", libelle: "planche.menu.composant", raccourci: "G" },
  { id: "eclater", picto: "⊠", libelle: "planche.menu.eclater", raccourci: "Ctrl+Maj+G" },
];

export const commandeObjet = (id: IdCommandeObjet): CommandeObjet => COMMANDES_OBJETS.find((c) => c.id === id) as CommandeObjet;

/** Ce que la disponibilité doit savoir de la sélection, dans le contexte d'édition courant. */
export interface EtatSelectionObjets {
  readonly lecture: boolean;
  /** Entités de géométrie ou objets sélectionnés (annotations exclues). */
  readonly entites: number;
  /** Groupes et composants sélectionnés. */
  readonly objets: number;
  /** Tous les objets sélectionnés sont verrouillés. */
  readonly verrouilles: boolean;
}

/** Disponibilité et motif (clé du catalogue de messages) quand la commande est grisée. */
export interface Disponibilite {
  readonly disponible: boolean;
  readonly motif: CleMessage | null;
}

export function disponibiliteObjet(id: IdCommandeObjet, s: EtatSelectionObjets): Disponibilite {
  if (s.lecture) return { disponible: false, motif: "planche.objets.motif.lecture" };
  if (id === "eclater") {
    if (s.objets === 0) return { disponible: false, motif: "planche.objets.motif.eclater" };
    if (s.verrouilles) return { disponible: false, motif: "planche.objets.motif.verrouille" };
    return { disponible: true, motif: null };
  }
  if (s.entites === 0) return { disponible: false, motif: "planche.objets.motif.vide" };
  return { disponible: true, motif: null };
}

/**
 * Commandes du contexte d'édition (Objets O-2) : Fermer remonte d'un niveau, Fermer tout revient à la racine. Leur barre
 * est le fil d'Ariane (au-dessus du dessin, visible seulement dans un groupe ou un composant) ; leurs raccourcis
 * marchent avec n'importe quel outil (Échap seul ne sort d'un objet qu'avec Sélection, comme SketchUp).
 */
export type IdCommandeContexte = "fermer" | "fermer-tout";
export interface CommandeContexte {
  readonly id: IdCommandeContexte;
  readonly picto: string;
  readonly libelle: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_CONTEXTE: readonly CommandeContexte[] = [
  { id: "fermer", picto: "⤴", libelle: "planche.contexte.fermer", raccourci: "Maj+Échap" },
  { id: "fermer-tout", picto: "⤒", libelle: "planche.contexte.fermer-tout", raccourci: "Maj+Origine" },
];

/** Raccourcis des commandes d'objet et de contexte, normalisés (pour le contrôle des collisions). */
export const raccourcisObjets = (): readonly string[] => [...COMMANDES_OBJETS, ...COMMANDES_CONTEXTE].map((c) => normaliserRaccourci(c.raccourci));

/** Étape du fil d'Ariane : `id` absent = racine de la Planche. */
export interface EtapeFil {
  readonly id: string | undefined;
  readonly nom: string;
}

/** Fil d'Ariane du contexte ouvert : racine, puis chaque objet du chemin, le dernier étant le contexte courant. */
export function filAriane(chemin: readonly string[], nom: (id: string) => string, racine: string): EtapeFil[] {
  return [{ id: undefined, nom: racine }, ...chemin.map((id) => ({ id, nom: nom(id) }))];
}

/**
 * Liens d'extrusion rompus par une opération (Grouper, Créer un composant) : les surfaces liées à leurs arêtes sources
 * ne le restent qu'à la racine de la Planche (D-196) ; l'interface le dit au lieu de le taire (EX-LINK-02).
 */
export function liensRompus(avant: Modele, apres: Modele): number {
  const n = (m: Modele) => Object.keys(m.annotations?.extrusions ?? {}).length;
  return Math.max(0, n(avant) - n(apres));
}
