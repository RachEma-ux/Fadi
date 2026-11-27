/**
 * Commandes d'objet de la Planche (lot Objets O-1, D-202, D-203) : Grouper, Créer un composant, Éclater. Chacune a sa
 * propre icône, sa place dans la barre d'actions flottante et un raccourci clavier (règle d'or, `AGENTS.md`) ; leur
 * disponibilité se calcule ici, sans React ni DOM, pour que le menu, la barre et le clavier disent la même chose.
 */
import { type Modele, type Pictogramme, contexte, definitionsAtteintes, entreeCommande, normaliserRaccourci } from "@parcours/sandbox-planche-model";
import type { CleMessage } from "../messages";

/** Pictogramme et raccourci d'une commande : lus au registre unique du Sandbox (`REGISTRE_SANDBOX`, lot 2), jamais recopiés. */
function depuisRegistre(id: string): { readonly picto: Pictogramme; readonly raccourci: string } {
  const e = entreeCommande(id);
  if (e.raccourci === null) throw new Error(`Registre du Sandbox : commande « ${id} » sans raccourci`);
  return { picto: e.pictogramme, raccourci: e.raccourci };
}

export type IdCommandeObjet = "groupe" | "composant" | "eclater" | "rendre-unique" | "diviser-courbe";

export interface CommandeObjet {
  readonly id: IdCommandeObjet;
  /** Pictogramme propre (registre), jamais partagé avec un outil ni avec le type d'objet du Navigateur. */
  readonly picto: Pictogramme;
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
  { id: "groupe", ...depuisRegistre("groupe"), libelle: "planche.menu.groupe", court: "planche.objets.court.groupe" },
  { id: "composant", ...depuisRegistre("composant"), libelle: "planche.menu.composant", court: "planche.objets.court.composant" },
  { id: "eclater", ...depuisRegistre("eclater"), libelle: "planche.menu.eclater", court: "planche.objets.court.eclater" },
  { id: "rendre-unique", ...depuisRegistre("rendre-unique"), libelle: "planche.menu.rendre-unique", court: "planche.objets.court.rendre-unique" },
  { id: "diviser-courbe", ...depuisRegistre("diviser-courbe"), libelle: "planche.menu.diviser-courbe", court: "planche.objets.court.diviser-courbe", contextuelle: true },
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
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_CONTEXTE: readonly CommandeContexte[] = [
  { id: "fermer", ...depuisRegistre("fermer"), libelle: "planche.contexte.fermer" },
  { id: "fermer-tout", ...depuisRegistre("fermer-tout"), libelle: "planche.contexte.fermer-tout" },
];

/**
 * Commande des liens d'extrusion (Objets O-2, EX-UI-06) : Détacher le lien. Sa barre est la barre d'état, à côté du statut
 * « Liée aux arêtes sources » qu'elle lève (visible au toucher) ; elle figure aussi dans « Outils ▾ » et au menu.
 */
export interface CommandeLien {
  readonly id: "detacher-lien";
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDE_DETACHER_LIEN: CommandeLien = { id: "detacher-lien", ...depuisRegistre("detacher-lien"), libelle: "planche.lien.detacher", court: "planche.lien.detacher.court" };


/**
 * Commandes du Navigateur (Objets O-4) : Nouveau groupe vide, Déplacer vers un groupe…, Renommer. Leur barre est celle du
 * Navigateur (l'arbre qu'elles modifient) ; elles figurent aussi dans « Outils ▾ » et au menu contextuel.
 */
export type IdCommandeNavigateur = "groupe-vide" | "deplacer-vers" | "renommer";
export interface CommandeNavigateur {
  readonly id: IdCommandeNavigateur;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_NAVIGATEUR: readonly CommandeNavigateur[] = [
  { id: "groupe-vide", ...depuisRegistre("groupe-vide"), libelle: "planche.menu.groupe-vide" },
  { id: "deplacer-vers", ...depuisRegistre("deplacer-vers"), libelle: "planche.menu.deplacer-vers" },
  { id: "renommer", ...depuisRegistre("renommer"), libelle: "planche.menu.renommer" },
];

export function disponibiliteNavigateur(id: IdCommandeNavigateur, s: EtatSelectionObjets): Disponibilite {
  if (s.lecture) return { disponible: false, motif: "planche.objets.motif.lecture" };
  if (id === "groupe-vide") return { disponible: true, motif: null };
  if (s.objets === 0 || s.objets !== s.entites) return { disponible: false, motif: id === "renommer" ? "planche.objets.motif.renommer" : "planche.objets.motif.deplacer" };
  if (id === "renommer") return s.objets === 1 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.objets.motif.renommer" };
  if (s.verrouilles) return { disponible: false, motif: "planche.objets.motif.verrouille" };
  return { disponible: true, motif: null };
}

/** Raccourcis des commandes d'objet, de contexte, du Navigateur, de lien et de vue, normalisés (pour le contrôle des collisions). */
export const raccourcisObjets = (): readonly string[] => [...COMMANDES_OBJETS, ...COMMANDES_CONTEXTE, ...COMMANDES_NAVIGATEUR, COMMANDE_DETACHER_LIEN, ...COMMANDES_VUE, ...COMMANDES_DEBIT, ...COMMANDES_PIECE, ...COMMANDES_CONTROLE, ...COMMANDES_DYNAMIQUE, ...COMMANDES_EMPLACEMENT, ...COMMANDES_SCRIPTS, ...COMMANDES_NIVEAUX, ...COMMANDES_LOCAUX].map((c) => normaliserRaccourci(c.raccourci));

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
  // Revue O-4 : ni une autre occurrence du composant d'où l'on part (même contenu), ni une définition contenue par un
  // objet déplacé (cycle par un composant partagé).
  const ici = contexte(m, dans).occurrences;
  const interdites = new Set<string>(deplaces.flatMap((id) => (ici[id] ? [...definitionsAtteintes(m, ici[id]!.definition)] : [])));
  let defDans: string | undefined;
  const trouver = (c: Modele["racine"], p: number): void => {
    if (p > 16 || defDans !== undefined) return;
    for (const o of Object.values(c.occurrences)) {
      if (o.id === dans) defDans = o.definition;
      const d = m.definitions[o.definition];
      if (d) trouver(d.contenu, p + 1);
    }
  };
  if (dans !== undefined) trouver(m.racine, 0);
  const parcourir = (c: Modele["racine"], profondeur: number) => {
    if (profondeur > 16) return;
    for (const o of Object.values(c.occurrences)) {
      if (exclus.has(o.id)) continue;
      const d = m.definitions[o.definition];
      if (o.id !== dans && !o.verrouille && o.definition !== defDans && !interdites.has(o.definition)) r.push({ id: o.id, nom: nom(o.id, d?.nom ?? ""), profondeur: profondeur + 1 });
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
export type IdCommandeVue = "isoler" | "masquer-reste" | "zoom-plus" | "zoom-moins";
export interface CommandeVue {
  readonly id: IdCommandeVue;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_VUE: readonly CommandeVue[] = [
  { id: "isoler", ...depuisRegistre("isoler"), libelle: "planche.menu.isoler", court: "planche.objets.court.isoler" },
  { id: "masquer-reste", ...depuisRegistre("masquer-reste"), libelle: "planche.affichage.masquer-reste", court: "planche.objets.court.masquer-reste" },
  // Lot 4 : zoom par pas, toujours disponible (barre d'actions au toucher, raccourci partout).
  { id: "zoom-plus", ...depuisRegistre("zoom-plus"), libelle: "actions.zoom.plus", court: "actions.zoom.plus" },
  { id: "zoom-moins", ...depuisRegistre("zoom-moins"), libelle: "actions.zoom.moins", court: "actions.zoom.moins" },
];
/** Facteur de chaque pas de zoom (avant, arrière). */
export const PAS_ZOOM: Readonly<Record<"zoom-plus" | "zoom-moins", number>> = { "zoom-plus": 1.25, "zoom-moins": 0.8 };

/**
 * Lot L14 : commandes de la liste de débit de la Planche (règle d'or : icône, barre du panneau, raccourci). Ouvrir la
 * liste, renuméroter les repères, poser les étiquettes, les effacer ensemble, exporter le CSV.
 */
export type IdCommandeDebit = "liste-debit" | "renumeroter" | "etiquettes" | "effacer-etiquettes" | "exporter-debit";
export interface CommandeDebit {
  readonly id: IdCommandeDebit;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_DEBIT: readonly CommandeDebit[] = [
  { id: "liste-debit", ...depuisRegistre("liste-debit"), libelle: "planche.debit.ouvrir", court: "planche.debit.court.ouvrir" },
  { id: "renumeroter", ...depuisRegistre("renumeroter"), libelle: "planche.debit.renumeroter", court: "planche.debit.court.renumeroter" },
  { id: "etiquettes", ...depuisRegistre("etiquettes"), libelle: "planche.debit.etiquettes", court: "planche.debit.court.etiquettes" },
  { id: "effacer-etiquettes", ...depuisRegistre("effacer-etiquettes"), libelle: "planche.debit.effacer-etiquettes", court: "planche.debit.court.effacer-etiquettes" },
  { id: "exporter-debit", ...depuisRegistre("exporter-debit"), libelle: "planche.debit.exporter", court: "planche.debit.court.exporter" },
];

/**
 * Extension « Contrôle et nettoyage » : ouvrir le relevé, nettoyer ce qui est coché (règle d'or : icône, barre du
 * panneau, raccourci).
 */
export type IdCommandeControle = "controler" | "nettoyer";
export interface CommandeControle {
  readonly id: IdCommandeControle;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_CONTROLE: readonly CommandeControle[] = [
  { id: "controler", ...depuisRegistre("controler"), libelle: "planche.controle.controler", court: "planche.controle.court.controler" },
  { id: "nettoyer", ...depuisRegistre("nettoyer"), libelle: "planche.controle.nettoyer", court: "planche.controle.court.nettoyer" },
];

/** Disponibilité : le contrôle toujours ; le nettoyage hors lecture, à la racine, avec quelque chose de coché à retirer. */
export function disponibiliteControle(id: IdCommandeControle, s: { readonly aNettoyer: boolean; readonly dansObjet: boolean; readonly lecture: boolean }): Disponibilite {
  if (id === "controler") return { disponible: true, motif: null };
  if (s.lecture) return { disponible: false, motif: "planche.debit.motif.lecture" };
  if (s.dansObjet) return { disponible: false, motif: "planche.controle.motif.objet" };
  return s.aNettoyer ? { disponible: true, motif: null } : { disponible: false, motif: "planche.controle.motif.rien" };
}

/** Extension « Composants dynamiques » : ouvrir le panneau, redessiner le composant sélectionné (règle d'or). */
export type IdCommandeDynamique = "composant-dynamique" | "redessiner-composant";
export interface CommandeDynamique {
  readonly id: IdCommandeDynamique;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_DYNAMIQUE: readonly CommandeDynamique[] = [
  { id: "composant-dynamique", ...depuisRegistre("composant-dynamique"), libelle: "planche.dynamique.ouvrir", court: "planche.dynamique.court.ouvrir" },
  { id: "redessiner-composant", ...depuisRegistre("redessiner-composant"), libelle: "planche.dynamique.redessiner", court: "planche.dynamique.court.redessiner" },
];

/** Disponibilité : le panneau toujours ; redessiner hors lecture, avec un composant dynamique sélectionné seul. */
export function disponibiliteDynamique(id: IdCommandeDynamique, s: { readonly dynamique: boolean; readonly lecture: boolean }): Disponibilite {
  if (id === "composant-dynamique") return { disponible: true, motif: null };
  if (s.lecture) return { disponible: false, motif: "planche.debit.motif.lecture" };
  return s.dynamique ? { disponible: true, motif: null } : { disponible: false, motif: "planche.dynamique.motif.selection" };
}

/** Extension « Emplacement » : ouvrir le panneau, aligner le nord sur l'arête sélectionnée, afficher la flèche du nord. */
export type IdCommandeEmplacement = "emplacement" | "nord-arete" | "afficher-nord" | "point-de-base";
export interface CommandeEmplacement {
  readonly id: IdCommandeEmplacement;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_EMPLACEMENT: readonly CommandeEmplacement[] = [
  { id: "emplacement", ...depuisRegistre("emplacement"), libelle: "planche.emplacement.ouvrir", court: "planche.emplacement.court.ouvrir" },
  { id: "nord-arete", ...depuisRegistre("nord-arete"), libelle: "planche.emplacement.nord-arete", court: "planche.emplacement.court.nord-arete" },
  { id: "afficher-nord", ...depuisRegistre("afficher-nord"), libelle: "planche.emplacement.afficher-nord", court: "planche.emplacement.court.afficher-nord" },
  { id: "point-de-base", ...depuisRegistre("point-de-base"), libelle: "planche.point-de-base.ouvrir", court: "planche.point-de-base.court" },
];

/** Disponibilité : panneau et flèche toujours ; le nord par une arête hors lecture, avec une seule arête non verticale. */
export function disponibiliteEmplacement(id: IdCommandeEmplacement, s: { readonly arete: boolean; readonly position: boolean; readonly lecture: boolean }): Disponibilite {
  if (id !== "nord-arete") return { disponible: true, motif: null };
  if (s.lecture) return { disponible: false, motif: "planche.debit.motif.lecture" };
  // Le nord s'enregistre avec la position : sans position saisie, rien n'est créé (aucune coordonnée inventée).
  if (!s.position) return { disponible: false, motif: "planche.emplacement.motif.position" };
  return s.arete ? { disponible: true, motif: null } : { disponible: false, motif: "planche.emplacement.motif.arete" };
}

/** Extension « Scripts » : ouvrir le panneau, exécuter le script affiché. */
export type IdCommandeScripts = "scripts" | "executer-script";
export interface CommandeScripts {
  readonly id: IdCommandeScripts;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_SCRIPTS: readonly CommandeScripts[] = [
  { id: "scripts", ...depuisRegistre("scripts"), libelle: "planche.scripts.ouvrir", court: "planche.scripts.court.ouvrir" },
  { id: "executer-script", ...depuisRegistre("executer-script"), libelle: "planche.scripts.executer", court: "planche.scripts.court.executer" },
];

/**
 * Disponibilité : le panneau toujours ; exécuter avec un texte non vide et aucun script en cours. Un projet en lecture
 * seule peut lancer un script (une mesure, par exemple) : son résultat n'est simplement jamais appliqué au dessin.
 */
export function disponibiliteScripts(id: IdCommandeScripts, s: { readonly vide: boolean; readonly enCours: boolean }): Disponibilite {
  if (id === "scripts") return { disponible: true, motif: null };
  if (s.enCours) return { disponible: false, motif: "planche.scripts.motif.encours" };
  return s.vide ? { disponible: false, motif: "planche.scripts.motif.vide" } : { disponible: true, motif: null };
}

/**
 * Niveaux d'étage (cas 4 du catalogue, étape 1) : ouvrir le panneau, ajouter un niveau, travailler sur le niveau
 * choisi (plan de travail à son altitude), rattacher la sélection au niveau choisi (règle d'or : icône, barre, raccourci).
 */
export type IdCommandeNiveau = "niveaux" | "ajouter-niveau" | "travailler-niveau" | "rattacher-niveau" | "supprimer-niveau";
export interface CommandeNiveau {
  readonly id: IdCommandeNiveau;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_NIVEAUX: readonly CommandeNiveau[] = [
  { id: "niveaux", ...depuisRegistre("niveaux"), libelle: "planche.niveaux.ouvrir", court: "planche.niveaux.court.ouvrir" },
  { id: "ajouter-niveau", ...depuisRegistre("ajouter-niveau"), libelle: "planche.niveaux.ajouter", court: "planche.niveaux.court.ajouter" },
  { id: "travailler-niveau", ...depuisRegistre("travailler-niveau"), libelle: "planche.niveaux.travailler", court: "planche.niveaux.court.travailler" },
  { id: "rattacher-niveau", ...depuisRegistre("rattacher-niveau"), libelle: "planche.niveaux.rattacher", court: "planche.niveaux.court.rattacher" },
  { id: "supprimer-niveau", ...depuisRegistre("supprimer-niveau"), libelle: "planche.niveaux.supprimer.libelle", court: "planche.niveaux.supprimer" },
];

/**
 * Disponibilité : le panneau toujours ; ajouter hors lecture ; travailler avec un niveau choisi (le plan de travail est
 * un état d'interface, permis en lecture) ; rattacher hors lecture, à la racine, avec un niveau choisi et au moins un
 * objet (groupe ou composant) sélectionné.
 */
export function disponibiliteNiveau(id: IdCommandeNiveau, s: { readonly choisi: boolean; readonly objets: number; readonly dansObjet: boolean; readonly lecture: boolean }): Disponibilite {
  if (id === "niveaux") return { disponible: true, motif: null };
  if (id === "travailler-niveau") return s.choisi ? { disponible: true, motif: null } : { disponible: false, motif: "planche.niveaux.motif.choisi" };
  if (s.lecture) return { disponible: false, motif: "planche.debit.motif.lecture" };
  if (id === "ajouter-niveau") return { disponible: true, motif: null };
  if (!s.choisi) return { disponible: false, motif: "planche.niveaux.motif.choisi" };
  if (id === "supprimer-niveau") return { disponible: true, motif: null };
  if (s.dansObjet) return { disponible: false, motif: "planche.niveaux.motif.racine" };
  return s.objets > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.niveaux.motif.objets" };
}

/**
 * Locaux (cas 4 du catalogue, étape 3) : ouvrir le panneau, créer un local sur la face de sol choisie (règle d'or :
 * icône, barre, raccourci).
 */
export type IdCommandeLocal = "locaux" | "creer-local" | "supprimer-local";
export interface CommandeLocal {
  readonly id: IdCommandeLocal;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_LOCAUX: readonly CommandeLocal[] = [
  { id: "locaux", ...depuisRegistre("locaux"), libelle: "planche.locaux.ouvrir", court: "planche.locaux.court.ouvrir" },
  { id: "creer-local", ...depuisRegistre("creer-local"), libelle: "planche.locaux.creer", court: "planche.locaux.court.creer" },
  { id: "supprimer-local", ...depuisRegistre("supprimer-local"), libelle: "planche.locaux.supprimer.libelle", court: "planche.locaux.supprimer" },
];

/** Disponibilité : le panneau toujours ; créer hors lecture, à la racine, avec une face de sol (horizontale) sans local choisie seule. */
export function disponibiliteLocal(id: IdCommandeLocal, s: { readonly face: "aucune" | "horizontale" | "inclinee" | "prise"; readonly dansObjet: boolean; readonly lecture: boolean; readonly choisi?: boolean }): Disponibilite {
  if (id === "locaux") return { disponible: true, motif: null };
  if (s.lecture) return { disponible: false, motif: "planche.debit.motif.lecture" };
  if (id === "supprimer-local") return s.choisi ? { disponible: true, motif: null } : { disponible: false, motif: "planche.locaux.motif.choisi" };
  if (s.dansObjet) return { disponible: false, motif: "planche.locaux.motif.racine" };
  if (s.face === "aucune") return { disponible: false, motif: "planche.locaux.motif.face" };
  if (s.face === "inclinee") return { disponible: false, motif: "planche.locaux.motif.inclinee" };
  if (s.face === "prise") return { disponible: false, motif: "planche.locaux.motif.prise" };
  return { disponible: true, motif: null };
}

/** Lot L17 : commandes d'édition d'une pièce (bloc de l'Info entité ; règle d'or : icône, barre, raccourci). */
export type IdCommandePiece = "piece-section" | "piece-rotation";
export interface CommandePiece {
  readonly id: IdCommandePiece;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_PIECE: readonly CommandePiece[] = [
  { id: "piece-section", ...depuisRegistre("piece-section"), libelle: "planche.piece.section", court: "planche.piece.court.section" },
  { id: "piece-rotation", ...depuisRegistre("piece-rotation"), libelle: "planche.piece.rotation", court: "planche.piece.court.rotation" },
];

/** Disponibilité des commandes de pièce : une seule pièce sélectionnée, hors lecture, une section choisie (section). */
export function disponibilitePiece(id: IdCommandePiece, s: { readonly piece: boolean; readonly section: boolean; readonly lecture: boolean }): Disponibilite {
  if (s.lecture) return { disponible: false, motif: "planche.debit.motif.lecture" };
  if (!s.piece) return { disponible: false, motif: "planche.piece.motif.piece" };
  if (id === "piece-section" && !s.section) return { disponible: false, motif: "planche.piece.motif.section" };
  return { disponible: true, motif: null };
}

/** Disponibilité des commandes de débit : une liste non vide (hors lecture pour les écritures) ; des étiquettes à effacer. */
export function disponibiliteDebit(id: IdCommandeDebit, s: { readonly lignes: number; readonly etiquettes: number; readonly lecture: boolean }): Disponibilite {
  if (id === "liste-debit") return { disponible: true, motif: null };
  if (id === "exporter-debit") return s.lignes > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.debit.motif.vide" };
  if (s.lecture) return { disponible: false, motif: "planche.debit.motif.lecture" };
  if (id === "effacer-etiquettes") return s.etiquettes > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.debit.motif.sans-etiquette" };
  return s.lignes > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.debit.motif.vide" };
}

export function disponibiliteVue(id: IdCommandeVue, s: { readonly entites: number; readonly isole: boolean; readonly dansObjet: boolean }): Disponibilite {
  if (id === "zoom-plus" || id === "zoom-moins") return { disponible: true, motif: null };
  if (id === "isoler") return s.isole || s.entites > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.objets.motif.isoler" };
  return s.dansObjet ? { disponible: true, motif: null } : { disponible: false, motif: "planche.contexte.motif" };
}
