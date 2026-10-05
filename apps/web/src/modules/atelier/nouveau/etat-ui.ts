/**
 * État d'affichage du nouvel Atelier (R10 : jamais dans le modèle, jamais dans la révision) : niveau actif,
 * sélection, outil courant et ses paramètres, vue 2D (centre, échelle), niveau d'affichage UX1, accrochages,
 * panneau mobile. Petit magasin externe (`useSyncExternalStore`), sans dépendance.
 */
import { useSyncExternalStore } from "react";
import type { Point2 } from "@parcours/atelier-model";

export type NiveauAffichage = "essentiel" | "contextuel" | "complet";
/** Plan, 3D, ou documents dérivés (vues, feuilles, tableaux — lot 5). */
export type ModeTravail = "2d" | "3d" | "documents";
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
}

const CLE_PREFS = "fadi.atelier.prefs";

function lirePrefs(): Partial<Pick<EtatUi, "affichage" | "accrochages" | "favoris" | "parametresOutil">> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CLE_PREFS) : null;
    return raw ? (JSON.parse(raw) as Partial<EtatUi>) : {};
  } catch {
    return {};
  }
}

function ecrirePrefs(e: EtatUi): void {
  try {
    localStorage?.setItem(CLE_PREFS, JSON.stringify({ affichage: e.affichage, accrochages: e.accrochages, favoris: e.favoris, parametresOutil: e.parametresOutil }));
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
};

const ecouteurs = new Set<() => void>();

export const etatUi = {
  get: (): EtatUi => etat,
  set(patch: Partial<EtatUi> | ((e: EtatUi) => Partial<EtatUi>)): void {
    const p = typeof patch === "function" ? patch(etat) : patch;
    etat = { ...etat, ...p };
    if ("affichage" in p || "accrochages" in p || "favoris" in p || "parametresOutil" in p) ecrirePrefs(etat);
    for (const fn of ecouteurs) fn();
  },
  subscribe(fn: () => void): () => void {
    ecouteurs.add(fn);
    return () => ecouteurs.delete(fn);
  },
  /** Choisir un outil remet le tracé en cours à zéro ; la sélection est conservée (les transformations s'y appliquent). */
  choisirOutil(outil: string, aide = ""): void {
    etatUi.set({ outil, pointsEnCours: [], aide, paletteOuverte: false });
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
