/**
 * Commandes d'objet de la Planche (lot Objets O-1, D-202, D-203) : Grouper, Créer un composant, Éclater. Chacune a sa
 * propre icône, sa place dans la barre d'actions flottante et un raccourci clavier (règle d'or, `AGENTS.md`) ; leur
 * disponibilité se calcule ici, sans React ni DOM, pour que le menu, la barre et le clavier disent la même chose.
 */
import { type Modele, contexte, definitionsAtteintes, entreeCommande, normaliserRaccourci } from "@parcours/sandbox-planche-model";
import type { CleMessage } from "../messages";

/** Pictogramme et raccourci d'une commande : lus au registre unique du Sandbox (`REGISTRE_SANDBOX`, lot 2), jamais recopiés. */
function depuisRegistre(id: string): { readonly picto: string; readonly raccourci: string } {
  const e = entreeCommande(id);
  if (e.raccourci === null) throw new Error(`Registre du Sandbox : commande « ${id} » sans raccourci`);
  return { picto: e.picto, raccourci: e.raccourci };
}

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
  { id: "groupe", ...depuisRegistre("groupe"), libelle: "planche.menu.groupe", court: "planche.objets.court.groupe" },
  { id: "composant", ...depuisRegistre("composant"), libelle: "planche.menu.composant", court: "planche.objets.court.composant" },
  { id: "eclater", ...depuisRegistre("eclater"), libelle: "planche.menu.eclater", court: "planche.objets.court.eclater" },
  { id: "rendre-unique", ...depuisRegistre("rendre-unique"), libelle: "planche.menu.rendre-unique", court: "planche.objets.court.rendre-unique" },
  { id: "diviser", ...depuisRegistre("diviser"), libelle: "planche.menu.diviser", court: "planche.objets.court.diviser", contextuelle: true },
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
  { id: "fermer", ...depuisRegistre("fermer"), libelle: "planche.contexte.fermer" },
  { id: "fermer-tout", ...depuisRegistre("fermer-tout"), libelle: "planche.contexte.fermer-tout" },
];

/**
 * Commande des liens d'extrusion (Objets O-2, EX-UI-06) : Détacher le lien. Sa barre est la barre d'état, à côté du statut
 * « Liée aux arêtes sources » qu'elle lève (visible au toucher) ; elle figure aussi dans « Outils ▾ » et au menu.
 */
export interface CommandeLien {
  readonly id: "detacher-lien";
  readonly picto: string;
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
  readonly picto: string;
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
export const raccourcisObjets = (): readonly string[] => [...COMMANDES_OBJETS, ...COMMANDES_CONTEXTE, ...COMMANDES_NAVIGATEUR, COMMANDE_DETACHER_LIEN, ...COMMANDES_VUE, ...COMMANDES_DEBIT, ...COMMANDES_PIECE].map((c) => normaliserRaccourci(c.raccourci));

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
export type IdCommandeVue = "isoler" | "masquer-reste";
export interface CommandeVue {
  readonly id: IdCommandeVue;
  readonly picto: string;
  readonly libelle: CleMessage;
  readonly court: CleMessage;
  readonly raccourci: string;
}
export const COMMANDES_VUE: readonly CommandeVue[] = [
  { id: "isoler", ...depuisRegistre("isoler"), libelle: "planche.menu.isoler", court: "planche.objets.court.isoler" },
  { id: "masquer-reste", ...depuisRegistre("masquer-reste"), libelle: "planche.affichage.masquer-reste", court: "planche.objets.court.masquer-reste" },
];

/**
 * Lot L14 : commandes de la liste de débit de la Planche (règle d'or : icône, barre du panneau, raccourci). Ouvrir la
 * liste, renuméroter les repères, poser les étiquettes, les effacer ensemble, exporter le CSV.
 */
export type IdCommandeDebit = "liste-debit" | "renumeroter" | "etiquettes" | "effacer-etiquettes" | "exporter-debit";
export interface CommandeDebit {
  readonly id: IdCommandeDebit;
  readonly picto: string;
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

/** Lot L17 : commandes d'édition d'une pièce (bloc de l'Info entité ; règle d'or : icône, barre, raccourci). */
export type IdCommandePiece = "piece-section" | "piece-rotation";
export interface CommandePiece {
  readonly id: IdCommandePiece;
  readonly picto: string;
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
  if (id === "isoler") return s.isole || s.entites > 0 ? { disponible: true, motif: null } : { disponible: false, motif: "planche.objets.motif.isoler" };
  return s.dansObjet ? { disponible: true, motif: null } : { disponible: false, motif: "planche.contexte.motif" };
}
