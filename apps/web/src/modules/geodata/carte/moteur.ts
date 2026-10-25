/**
 * Contrat du moteur cartographique de GeoData (D-GD-03), sans aucun import du moteur : la page et ses panneaux ne
 * connaissent que ce contrat ; l'implantation MapLibre (`moteur-maplibre.ts`) est chargée à la demande. La carte n'est
 * jamais le seul accès à l'information : recherche, table et fiches fonctionnent sans elle (repli sans WebGL, GEO 11).
 */
import type { Composition, ValeurIndicateur } from "@parcours/geodata-model";
import type { Fond } from "../client";

export type OutilCarte = "navigation" | "distance" | "surface" | "zone" | "annotation";

export interface ObjetDesigne { readonly coucheId: string; readonly code: string }

export interface DonneesAffichage {
  /** Valeurs par indicateur (code → valeur), pour les styles thématiques. */
  readonly valeurs: ReadonlyMap<string, ReadonlyMap<string, ValeurIndicateur>>;
  /** Codes retenus par le filtre d'une couche ; absent = pas de filtre. */
  readonly filtres: ReadonlyMap<string, readonly string[]>;
  readonly selection: ObjetDesigne | null;
  /** Zones et annotations de l'espace, en GeoJSON WGS 84. */
  readonly zones: { readonly type: "FeatureCollection"; readonly features: readonly unknown[] };
  /** Attributions des couches affichées (toujours visibles sur la carte). */
  readonly attributions: readonly string[];
}

export interface EvenementsMoteur {
  surDeplacement(camera: Composition["camera"]): void;
  surClic(objet: ObjetDesigne | null): void;
  /** Tracé en cours : sommets [lon, lat] (mesures en direct). */
  surTrace(outil: OutilCarte, sommets: readonly [number, number][]): void;
  /** Tracé terminé (double-clic, Entrée ou « Terminer »). */
  surTraceTermine(outil: OutilCarte, sommets: readonly [number, number][]): void;
  surErreur(message: string): void;
}

export interface MoteurCarte {
  appliquer(composition: Composition, fond: Fond, donnees: DonneesAffichage): void;
  /** Centre (et, pour une carte rouverte, zoom et orientation enregistrés) ou emprise. */
  allerA(cible: { emprise: readonly [number, number, number, number] } | { lon: number; lat: number; zoom?: number; cap?: number }): void;
  definirOutil(outil: OutilCarte): void;
  terminerTrace(): void;
  annulerTrace(): void;
  /** Toutes les tuiles visibles sont-elles chargées (export sans trou) ? Attend au plus `delaiMs`. */
  attendreChargement(delaiMs: number): Promise<boolean>;
  /** Image de la carte telle qu'affichée (canevas WebGL). */
  canevas(): HTMLCanvasElement;
  /** Échelle approximative au centre : mètres par pixel. */
  metresParPixel(): number;
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
