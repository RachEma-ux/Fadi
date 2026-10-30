/**
 * Contrat du moteur cartographique de GeoData (D-GD-03), sans aucun import du moteur : la page et ses panneaux ne
 * connaissent que ce contrat ; l'implantation MapLibre (`moteur-maplibre.ts`) est chargée à la demande. La carte n'est
 * jamais le seul accès à l'information : recherche, table et fiches fonctionnent sans elle (repli sans WebGL, GEO 11).
 */
import type { Composition, RangAdministratif, ValeurIndicateur } from "@parcours/geodata-model";
import type { Fond } from "../client";

export type OutilCarte = "navigation" | "distance" | "surface" | "zone" | "annotation";

export interface ObjetDesigne { readonly coucheId: string; readonly code: string }

export interface DonneesAffichage {
  /** Valeurs par indicateur (code → valeur), pour les styles thématiques. */
  readonly valeurs: ReadonlyMap<string, ReadonlyMap<string, ValeurIndicateur>>;
  /** Couleur de chaque unité (code → couleur) des couches au style « une couleur par entité ». */
  readonly categories: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Rang administratif des couches de limites (1 région, 2 province, 3 commune ; D-GD-16) : ordre et épaisseur des contours. */
  readonly rangs: ReadonlyMap<string, RangAdministratif>;
  /** Couches raster de la composition (tuiles d'image, D-GD-13). */
  readonly rasters: ReadonlySet<string>;
  /** Codes retenus par le filtre d'une couche ; absent = pas de filtre. */
  readonly filtres: ReadonlyMap<string, readonly string[]>;
  readonly selection: ObjetDesigne | null;
  /** Valeur abrégée (code → texte) de l'indicateur actif, par couche où il est affiché (D-GD-32) ; absente = aucun texte. */
  readonly valeursAffichees: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Zones et annotations de l'espace, en GeoJSON WGS 84. */
  readonly zones: { readonly type: "FeatureCollection"; readonly features: readonly unknown[] };
  /** Attributions des couches affichées (toujours visibles sur la carte). */
  readonly attributions: readonly string[];
}

export interface EvenementsMoteur {
  surDeplacement(camera: Composition["camera"]): void;
  /**
   * Emprise visible changée sans que la caméra le dise (D-GD-39) : carte prête (`load`) ou canevas redimensionné
   * (fenêtre, rotation, plein écran). La synthèse de la vue s'y relit.
   */
  surEmprise?(): void;
  /**
   * Clic en navigation : objets touchés (toutes les couches, la plus haute d'abord ; vide = aucun), point cliqué et rang du
   * clic dans sa série (1 = premier, 2 = second clic rapide au même endroit… ; D-GD-34). Aucun retard : chaque clic est
   * transmis tout de suite, le double-clic ne zoome jamais.
   */
  surClic(objets: readonly ObjetDesigne[], point: { lon: number; lat: number }, nbClics: number): void;
  /** Tracé en cours : sommets [lon, lat] (mesures en direct). */
  surTrace(outil: OutilCarte, sommets: readonly [number, number][]): void;
  /** Tracé terminé (double-clic, Entrée ou « Terminer »). */
  surTraceTermine(outil: OutilCarte, sommets: readonly [number, number][]): void;
  surErreur(message: string): void;
  /** Tuiles du fond refusées (clé absente, invalide, quota) : avis non bloquant, la carte reste utilisable. */
  surErreurFond?(message: string): void;
}

export interface MoteurCarte {
  appliquer(composition: Composition, fond: Fond, donnees: DonneesAffichage): void;
  /** Centre (et, pour une carte rouverte, zoom et orientation enregistrés) ou emprise. */
  allerA(cible: { emprise: readonly [number, number, number, number] } | { lon: number; lat: number; zoom?: number; cap?: number }): void;
  /** Zoom d'un cran (barre d'outils verticale). */
  zoomer(delta: 1 | -1): void;
  /** Nord en haut, vue de dessus. */
  orienterNord(): void;
  /** Recalcule la taille du canevas (plein écran, panneau replié). */
  redimensionner(): void;
  definirOutil(outil: OutilCarte): void;
  terminerTrace(): void;
  annulerTrace(): void;
  /** Toutes les tuiles visibles sont-elles chargées (export sans trou) ? Attend au plus `delaiMs`. */
  attendreChargement(delaiMs: number): Promise<boolean>;
  /** Image de la carte telle qu'affichée (canevas WebGL). */
  canevas(): HTMLCanvasElement;
  /** Emprise de la vue (ouest, sud, est, nord, WGS 84) pour la lecture de l'emprise (D-GD-39) ; null tant que la carte n'est pas prête. */
  emprise(): readonly [number, number, number, number] | null;
  /** Échelle approximative au centre : mètres par pixel. */
  metresParPixel(): number;
  /**
   * Mini-carte de situation (lot G, D-GD-27) dans `conteneur` (null : retirée) : contours de la couche `coucheId`
   * (null : fond seul), emprise de la vue courante en rectangle ; un clic y recentre la carte.
   */
  afficherMiniCarte(conteneur: HTMLElement | null, coucheId: string | null): void;
  /** Contour de l'unité choisie dans la barre territoriale (lot H), en GeoJSON WGS 84 ; null : retiré. */
  afficherTerritoire(contour: unknown | null): void;
  /** Entité sélectionnée par clic sans couche chargée (D-GD-34) : contour et mise en évidence, ou rien. */
  afficherEntite(contour: unknown | null): void;
  /** Masque (ou rétablit) le contour territorial le temps d'une capture ; résolu une fois la carte redessinée. */
  masquerTerritoire(masque: boolean): Promise<void>;
  /** Image de la mini-carte (impression), ou null si elle n'est pas affichée. */
  canevasMiniCarte(): HTMLCanvasElement | null;
  detruire(): void;
}

/** WebGL est-il disponible ? Sinon la page reste utilisable sans carte (recherche, table, fiches). */
export function webglDisponible(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
