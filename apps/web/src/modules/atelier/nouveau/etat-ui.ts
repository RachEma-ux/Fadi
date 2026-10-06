/**
 * État d'affichage du nouvel Atelier (R10 : jamais dans le modèle, jamais dans la révision) : niveau actif,
 * sélection, outil courant et ses paramètres, vue 2D (centre, échelle), niveau d'affichage UX1, accrochages,
 * panneau mobile. Petit magasin externe (`useSyncExternalStore`), sans dépendance.
 */
import { useSyncExternalStore } from "react";
import type { Point2 } from "@parcours/atelier-model";
import { lireReglagesNavigation } from "./navigation";

export type NiveauAffichage = "essentiel" | "contextuel" | "complet";
/** Plan, 3D, documents dérivés (vues, feuilles, tableaux — lot 5), ou Planche (géométrie libre, cahier-planche MO-1). */
export type ModeTravail = "2d" | "3d" | "documents" | "planche";
export type PanneauMobile = "travail" | "objets" | "inspecteur" | "problemes";

export interface Accrochages {
  extremite: boolean;
  milieu: boolean;
  centre: boolean;
  perpendiculaire: boolean;
  intersection: boolean;
  orthogonal: boolean;
  grille: boolean;
  pasGrille: number;
  /** Point le plus proche sur un tracé ou une face de mur (D-061) ; absent des préférences anciennes : désactivé. */
  proche?: boolean;
  /** Pas du repérage polaire, en degrés (D-071) ; absent des préférences anciennes : 45°. */
  pasPolaire?: number;
  /** Parallèle (D-158) : pendant un tracé, la direction parallèle à la dernière arête survolée ; absent : désactivé. */
  parallele?: boolean;
  /** Arête de référence du parallèle (posée par le plan, jamais enregistrée). */
  referenceParallele?: { a: Point2; b: Point2; objetId: string } | null;
  /** Orientation du repère de saisie (D-091), en degrés, posée par l'état d'interface ; absente : repère global. */
  angleRepere?: number;
}

export interface Vue2D {
  /** Centre de la vue, repère local (m). */
  cx: number;
  cy: number;
  /** Pixels par mètre. */
  echelle: number;
}

export interface EtatUi {
  niveauId: string | null;
  selection: string[];
  outil: string;
  /** Paramètres de l'outil en cours (épaisseur, hauteur, classe d'ouverture…), persistés entre deux tracés. */
  parametresOutil: Record<string, unknown>;
  /** Points déjà posés par l'outil en cours (tracé en plusieurs clics). */
  pointsEnCours: Point2[];
  /** Position du pointeur accrochée (aperçu). */
  curseur: Point2 | null;
  mode: ModeTravail;
  vue: Vue2D;
  affichage: NiveauAffichage;
  accrochages: Accrochages;
  paletteOuverte: boolean;
  panneauMobile: PanneauMobile;
  favoris: string[];
  /** Objet survolé (mise en évidence) */
  survol: string | null;
  aide: string;
  /**
   * Filtres d'affichage locaux (DA-05-02, DA-05-03, D-066) : classes et calques masqués pour cet utilisateur
   * seulement ; ils réduisent l'affichage et la sélection, jamais le modèle.
   */
  filtres: FiltresAffichage;
  /** Isolement (DA-18-04) : seuls ces objets sont affichés, pour cet utilisateur et cette session ; null = inactif. */
  isolement: string[] | null;
  /**
   * Repère de saisie (D-091, DA-02-16) : origine et orientation (degrés) d'un repère temporaire — saisies « dx;dy »,
   * repérage polaire et flèches du manipulateur s'y rapportent. Affichage seul, jamais dans le modèle (R10).
   */
  repere: { origine: Point2; angle: number } | null;
  /** Ensembles d'affichage personnels (préréglages nommés), conservés sur l'appareil et synchronisés avec le compte (D-118). */
  ensembles: EnsembleLocal[];
  /** Styles graphiques par classe en 3D (D-135) : couleur et opacité choisies pour soi ; affichage seulement. */
  stylesClasses: Record<string, { couleur: string | null; opacite: number | null }>;
  /** Disposition (D-156), panneau flottant ouvert, barre d'outils repliée, outil précédent (Échap en Canevas). */
  disposition: Disposition;
  panneauFlottant: PanneauFlottant | null;
  outilsReplies: boolean;
  outilPrecedent: string;
  /** Réglages de navigation (D-157). */
  navigation: ReglagesNavigation;
  /** Raccourcis personnalisés (D-158) : identifiant d'outil → touche ; vide = raccourci par défaut. */
  raccourcis: Record<string, string>;
  /** Objets masqués pour soi (D-159), et pile des masquages pour « réafficher le dernier ». */
  masques: string[];
  pileMasques: string[][];
  /** Ombres en 3D (D-159) : option d'affichage locale. */
  ombres: boolean;
}

/** Disposition de l'Atelier (D-156) : grille à cinq repères (défaut) ou canevas plein écran à panneaux flottants. */
export type Disposition = "classique" | "canevas";
/** Panneaux flottants exclusifs de la disposition Canevas (D-156). */
export type PanneauFlottant = "instructeur" | "entite" | "outliner" | "modifications" | "versions" | "affichage" | "navigation" | "raccourcis" | "modele" | "materiaux";

/** Réglages de navigation (D-157), propres à l'appareil. */
export interface ReglagesNavigation {
  peripherique: "souris" | "trackpad";
  /** Geste à deux doigts (tactile et trackpad) en 3D : orbite ou panoramique (le pincement zoome toujours). */
  deuxDoigts: "orbite" | "pan";
  inverserZoom: boolean;
  inverserPan: boolean;
  inverserOrbite: boolean;
  /** Facteurs de sensibilité (0,25 à 4 ; 1 = normal). */
  sensibiliteZoom: number;
  sensibilitePan: number;
  sensibiliteOrbite: number;
}

export const NAVIGATION_DEFAUT: ReglagesNavigation = { peripherique: "souris", deuxDoigts: "pan", inverserZoom: false, inverserPan: false, inverserOrbite: false, sensibiliteZoom: 1, sensibilitePan: 1, sensibiliteOrbite: 1 };

export interface FiltresAffichage {
  classesMasquees: string[];
  calquesMasques: string[];
}

export interface EnsembleLocal extends FiltresAffichage {
  nom: string;
  niveauId: string | null;
}

const CLE_PREFS = "fadi.atelier.prefs";

const CLES_PERSISTEES = ["affichage", "accrochages", "favoris", "parametresOutil", "filtres", "ensembles", "stylesClasses", "disposition", "outilsReplies", "navigation", "raccourcis", "ombres"] as const;

function lirePrefs(): Partial<Pick<EtatUi, (typeof CLES_PERSISTEES)[number]>> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CLE_PREFS) : null;
    return raw ? (JSON.parse(raw) as Partial<EtatUi>) : {};
  } catch {
    return {};
  }
}

function ecrirePrefs(e: EtatUi): void {
  try {
    localStorage?.setItem(CLE_PREFS, JSON.stringify(Object.fromEntries(CLES_PERSISTEES.map((k) => [k, e[k]]))));
  } catch {
    /* stockage indisponible : préférences non conservées */
  }
}

const prefs = lirePrefs();

let etat: EtatUi = {
  niveauId: null,
  selection: [],
  outil: "selection",
  parametresOutil: { epaisseur: 0.2, hauteur: 3, classeOuverture: "porte", largeurOuverture: 0.9, hauteurOuverture: 2.1, allege: 0.9, largeurEscalier: 1.2, taille: 0.3, hauteurGardeCorps: 1, epaisseurGardeCorps: 0.05, penteToiture: 0, ...(prefs.parametresOutil ?? {}) },
  pointsEnCours: [],
  curseur: null,
  mode: "2d",
  vue: { cx: 0, cy: 0, echelle: 24 },
  affichage: prefs.affichage ?? "essentiel",
  accrochages: prefs.accrochages ?? { extremite: true, milieu: true, centre: true, perpendiculaire: true, intersection: true, orthogonal: true, grille: true, pasGrille: 0.5 },
  paletteOuverte: false,
  panneauMobile: "travail",
  favoris: prefs.favoris ?? ["mur", "porte", "fenetre", "dalle", "escalier", "piece"],
  survol: null,
  aide: "",
  filtres: { classesMasquees: prefs.filtres?.classesMasquees ?? [], calquesMasques: prefs.filtres?.calquesMasques ?? [] },
  ensembles: Array.isArray(prefs.ensembles) ? prefs.ensembles : [],
  stylesClasses: prefs.stylesClasses && typeof prefs.stylesClasses === "object" ? prefs.stylesClasses : {},
  isolement: null,
  repere: null,
  disposition: prefs.disposition === "canevas" ? "canevas" : "classique",
  panneauFlottant: null,
  outilsReplies: prefs.outilsReplies === true,
  outilPrecedent: "selection",
  navigation: lireReglagesNavigation(prefs.navigation, NAVIGATION_DEFAUT),
  raccourcis: prefs.raccourcis && typeof prefs.raccourcis === "object" ? prefs.raccourcis : {},
  masques: [],
  pileMasques: [],
  ombres: prefs.ombres === true,
};

const ecouteurs = new Set<() => void>();

export const etatUi = {
  get: (): EtatUi => etat,
  set(patch: Partial<EtatUi> | ((e: EtatUi) => Partial<EtatUi>)): void {
    const p = typeof patch === "function" ? patch(etat) : patch;
    etat = { ...etat, ...p };
    if (CLES_PERSISTEES.some((k) => k in p)) ecrirePrefs(etat);
    for (const fn of ecouteurs) fn();
  },
  subscribe(fn: () => void): () => void {
    ecouteurs.add(fn);
    return () => ecouteurs.delete(fn);
  },
  /** Choisir un outil remet le tracé en cours à zéro ; la sélection est conservée (les transformations s'y appliquent). */
  choisirOutil(outil: string, aide = ""): void {
    etatUi.set((e) => ({ outil, pointsEnCours: [], aide, paletteOuverte: false, ...(e.outil !== outil ? { outilPrecedent: e.outil } : {}) }));
  },
  /** Panneau flottant exclusif (D-156) : en ouvrir un ferme l'autre ; le rouvrir le ferme. */
  basculerPanneau(p: PanneauFlottant): void {
    etatUi.set((e) => ({ panneauFlottant: e.panneauFlottant === p ? null : p }));
  },
  selectionner(ids: string[], ajouter = false): void {
    etatUi.set((e) => ({ selection: ajouter ? [...new Set([...e.selection, ...ids])] : ids }));
  },
  basculerFavori(outil: string): void {
    etatUi.set((e) => ({ favoris: e.favoris.includes(outil) ? e.favoris.filter((f) => f !== outil) : [...e.favoris, outil] }));
  },
};

export function useEtatUi(): EtatUi {
  return useSyncExternalStore(etatUi.subscribe, etatUi.get, etatUi.get);
}

/** Objet affiché selon les filtres locaux (D-066) : ni sa classe ni son calque ne sont masqués localement. */
export function visibleSelonFiltres(o: { classe: string; calqueId: string | null }, f: FiltresAffichage): boolean {
  return !f.classesMasquees.includes(o.classe) && !(o.calqueId && f.calquesMasques.includes(o.calqueId));
}
