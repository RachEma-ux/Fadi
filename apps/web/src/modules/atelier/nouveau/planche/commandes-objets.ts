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
  /** Nom court, visible sous l'icône dans la barre d'actions. */
  readonly court: CleMessage;
  /** Raccourci canonique (forme du catalogue : « Ctrl+Maj+G »). */
  readonly raccourci: string;
}

/** Ordre d'affichage dans la barre d'actions : créer un objet, puis le dissoudre. */
export const COMMANDES_OBJETS: readonly CommandeObjet[] = [
  { id: "groupe", picto: "⊞", libelle: "planche.menu.groupe", court: "planche.objets.court.groupe", raccourci: "Ctrl+G" },
  { id: "composant", picto: "❖", libelle: "planche.menu.composant", court: "planche.objets.court.composant", raccourci: "G" },
  { id: "eclater", picto: "⊠", libelle: "planche.menu.eclater", court: "planche.objets.court.eclater", raccourci: "Ctrl+Maj+G" },
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

/** Raccourcis des commandes d'objet, normalisés (pour le contrôle des collisions). */
export const raccourcisObjets = (): readonly string[] => COMMANDES_OBJETS.map((c) => normaliserRaccourci(c.raccourci));

/**
 * Liens d'extrusion rompus par une opération (Grouper, Créer un composant) : les surfaces liées à leurs arêtes sources
 * ne le restent qu'à la racine de la Planche (D-196) ; l'interface le dit au lieu de le taire (EX-LINK-02).
 */
export function liensRompus(avant: Modele, apres: Modele): number {
  const n = (m: Modele) => Object.keys(m.annotations?.extrusions ?? {}).length;
  return Math.max(0, n(avant) - n(apres));
}
