/**
 * Commandes d'objet de la Planche (lot Objets O-1, D-202, D-203) : Grouper, Créer un composant, Éclater. Chacune a sa
 * propre icône, sa place dans la barre d'actions flottante et un raccourci clavier (règle d'or, `AGENTS.md`) ; leur
 * disponibilité se calcule ici, sans React ni DOM, pour que le menu, la barre et le clavier disent la même chose.
 */
import { type Modele, normaliserRaccourci } from "@parcours/planche-model";
import type { CleMessage } from "../messages";

export type IdCommandeObjet = "groupe" | "composant" | "eclater" | "rendre-unique" | "diviser" | "diviser-courbe";

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
  /** Commande d'arête (O-3) : elle n'apparaît dans la barre d'actions que lorsqu'elle s'applique à la sélection. */
  readonly contextuelle?: true;
}

/**
 * Ordre d'affichage dans la barre d'actions : créer un objet, le dissoudre, le rendre unique (O-3) ; puis les commandes
 * d'arête d'O-3 (Diviser, Diviser en segments), présentes seulement quand la sélection en contient.
 */
export const COMMANDES_OBJETS: readonly CommandeObjet[] = [
  { id: "groupe", picto: "⊞", libelle: "planche.menu.groupe", court: "planche.objets.court.groupe", raccourci: "Ctrl+G" },
  { id: "composant", picto: "❖", libelle: "planche.menu.composant", court: "planche.objets.court.composant", raccourci: "G" },
  { id: "eclater", picto: "⊠", libelle: "planche.menu.eclater", court: "planche.objets.court.eclater", raccourci: "Ctrl+Maj+G" },
  { id: "rendre-unique", picto: "⎘", libelle: "planche.menu.rendre-unique", court: "planche.objets.court.rendre-unique", raccourci: "Alt+Maj+U" },
  { id: "diviser", picto: "⦙", libelle: "planche.menu.diviser", court: "planche.objets.court.diviser", raccourci: "Alt+Maj+D", contextuelle: true },
  { id: "diviser-courbe", picto: "⌇", libelle: "planche.menu.diviser-courbe", court: "planche.objets.court.diviser-courbe", raccourci: "Alt+Maj+C", contextuelle: true },
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
  /** Objets sélectionnés dont la définition a plusieurs occurrences (Rendre unique, O-3). */
  readonly partages?: number;
  /** Arêtes sélectionnées, directement ou par leurs faces (Diviser, O-3). */
  readonly aretes?: number;
  /** Courbes touchées par la sélection (Diviser en segments, O-3). */
  readonly courbes?: number;
}

/** Disponibilité et motif (clé du catalogue de messages) quand la commande est grisée. */
export interface Disponibilite {
  readonly disponible: boolean;
  readonly motif: CleMessage | null;
}

export function disponibiliteObjet(id: IdCommandeObjet, s: EtatSelectionObjets): Disponibilite {
  if (s.lecture) return { disponible: false, motif: "planche.objets.motif.lecture" };
  if (id === "rendre-unique") {
    if (s.objets === 0) return { disponible: false, motif: "planche.objets.motif.eclater" };
    if ((s.partages ?? 0) === 0) return { disponible: false, motif: "planche.objets.motif.unique" };
    return { disponible: true, motif: null };
  }
  if (id === "diviser") return (s.aretes ?? 0) > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.objets.motif.arete" };
  if (id === "diviser-courbe") return (s.courbes ?? 0) > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.objets.motif.courbe" };
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

/**
 * Commandes du Navigateur (Objets O-4) : Nouveau groupe vide, Déplacer vers un groupe…, Renommer. Leur barre est celle du
 * Navigateur (l'arbre qu'elles modifient) ; elles figurent aussi dans « Outils ▾ » et au menu contextuel.
 */
export type IdCommandeNavigateur = "groupe-vide" | "deplacer-vers" | "renommer";
export interface CommandeNavigateur {
  readonly id: IdCommandeNavigateur;
  readonly picto: string;
  readonly libelle: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_NAVIGATEUR: readonly CommandeNavigateur[] = [
  { id: "groupe-vide", picto: "⊡", libelle: "planche.menu.groupe-vide", raccourci: "Alt+Maj+G" },
  { id: "deplacer-vers", picto: "⇲", libelle: "planche.menu.deplacer-vers", raccourci: "Alt+Maj+V" },
  { id: "renommer", picto: "✎", libelle: "planche.menu.renommer", raccourci: "F2" },
];

export function disponibiliteNavigateur(id: IdCommandeNavigateur, s: EtatSelectionObjets): Disponibilite {
  if (s.lecture) return { disponible: false, motif: "planche.objets.motif.lecture" };
  if (id === "groupe-vide") return { disponible: true, motif: null };
  if (s.objets === 0 || s.objets !== s.entites) return { disponible: false, motif: id === "renommer" ? "planche.objets.motif.renommer" : "planche.objets.motif.deplacer" };
  if (id === "renommer") return s.objets === 1 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.objets.motif.renommer" };
  if (s.verrouilles) return { disponible: false, motif: "planche.objets.motif.verrouille" };
  return { disponible: true, motif: null };
}

/** Raccourcis des commandes d'objet, de contexte et du Navigateur, normalisés (pour le contrôle des collisions). */
export const raccourcisObjets = (): readonly string[] => [...COMMANDES_OBJETS, ...COMMANDES_CONTEXTE, ...COMMANDES_NAVIGATEUR, ...COMMANDES_VUE].map((c) => normaliserRaccourci(c.raccourci));

/** Cible proposée par « Déplacer vers un groupe… » : `id` absent = racine. */
export interface CibleDeplacement {
  readonly id: string | undefined;
  readonly nom: string;
  readonly profondeur: number;
}

/**
 * Cibles de « Déplacer vers un groupe… » (O-4) : la racine puis chaque groupe ou composant de l'arbre, sauf le contexte
 * d'où l'on part, les objets déplacés et tout ce qu'ils contiennent (un objet n'entre pas dans lui-même).
 */
export function ciblesDeplacement(m: Modele, deplaces: readonly string[], dans: string | undefined, nom: (id: string, defNom: string) => string, racine: string): CibleDeplacement[] {
  const exclus = new Set(deplaces);
  const r: CibleDeplacement[] = dans === undefined ? [] : [{ id: undefined, nom: racine, profondeur: 0 }];
  const parcourir = (c: Modele["racine"], profondeur: number) => {
    if (profondeur > 16) return;
    for (const o of Object.values(c.occurrences)) {
      if (exclus.has(o.id)) continue;
      const d = m.definitions[o.definition];
      if (o.id !== dans && !o.verrouille) r.push({ id: o.id, nom: nom(o.id, d?.nom ?? ""), profondeur: profondeur + 1 });
      if (d) parcourir(d.contenu, profondeur + 1);
    }
  };
  parcourir(m.racine, 0);
  return r;
}

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

/**
 * Commandes de vue (Objets O-5) : Isoler (bascule avec restauration : la vue seule change, rien n'est masqué dans le
 * modèle) et Masquer le reste du modèle (bascule, effective dans un groupe ou un composant ouvert). Isoler vit dans la
 * barre d'actions (avec une sélection, ou pendant l'isolement) ; Masquer le reste dans le fil d'Ariane ; toutes deux dans
 * « Outils ▾ ».
 */
export type IdCommandeVue = "isoler" | "masquer-reste";
export interface CommandeVue {
  readonly id: IdCommandeVue;
  readonly picto: string;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_VUE: readonly CommandeVue[] = [
  { id: "isoler", picto: "⦿", libelle: "planche.menu.isoler", court: "planche.objets.court.isoler", raccourci: "Alt+Maj+I" },
  { id: "masquer-reste", picto: "⬒", libelle: "planche.affichage.masquer-reste", court: "planche.objets.court.masquer-reste", raccourci: "Alt+Maj+R" },
];

export function disponibiliteVue(id: IdCommandeVue, s: { readonly entites: number; readonly isole: boolean; readonly dansObjet: boolean }): Disponibilite {
  if (id === "isoler") return s.isole || s.entites > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.objets.motif.isoler" };
  return s.dansObjet ? { disponible: true, motif: null } : { disponible: false, motif: "planche.contexte.motif" };
}
