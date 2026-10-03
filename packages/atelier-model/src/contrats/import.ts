/**
 * Contrat de l'importeur P.118 (cahier §6, D-002, D-021) : fonction pure `importerP118(dataset) →
 * { modele, rapport }` dans `src/importeur/**` (L1.4). Types seulement.
 *
 * Rien n'est omis (R7) : chaque famille source a une ligne de rapport (effectif source, effectif cible,
 * transformations), chaque donnée non importée dans le modèle est listée avec son motif (ex. `ui`, R10),
 * chaque rôle inconnu est listé. Aucun arrondi. Import idempotent : deux imports → même empreinte.
 */
import type { IdObjet } from "../ontologie/classes.js";
import type { EtatModele } from "./etat.js";
import type { Probleme } from "./probleme.js";

/**
 * Jeu de données P.118 (`apps/api/src/data/examples/p118-native-model.json`). Typage volontairement
 * minimal : l'importeur valide la structure à l'exécution et cite tout écart dans le rapport.
 */
export interface JeuDonneesP118 {
  readonly sourceVersion?: unknown;
  readonly exampleId?: unknown;
  readonly registry?: unknown;
  readonly domains: {
    readonly nativeParcel?: unknown;
    readonly levels?: unknown;
    readonly buildingFootprint?: unknown;
    readonly floorDesign?: unknown;
    readonly ui?: unknown;
    readonly [autre: string]: unknown;
  };
  readonly [autre: string]: unknown;
}

/** Familles du rapport (cahier §6, R7). */
export const FAMILLES_IMPORT = [
  "niveaux",
  "murs",
  "portes",
  "fenetres",
  "escaliers",
  "poteaux",
  "pieces",
  "traces",
  "cotations",
  "textes",
  "calques",
  "parcelle",
  "emprise",
  "structure",
  "hypotheses",
  "sources",
  "proprietes-projet",
] as const;
export type FamilleImport = (typeof FAMILLES_IMPORT)[number];

export interface EffectifsNiveau {
  readonly source: number;
  readonly cible: number;
}

export interface LigneRapportImport {
  readonly famille: FamilleImport;
  readonly effectifSource: number;
  readonly effectifCible: number;
  /** Par niveau source (`ss`, `rdc`…), quand la famille est portée par les niveaux. */
  readonly parNiveau?: Readonly<Record<string, EffectifsNiveau>>;
  /** Répartition des cibles par classe (ex. tracés → dalle, toiture, solide, zone…). */
  readonly parClasseCible?: Readonly<Record<string, number>>;
  /** Transformations appliquées, en phrases (« `area` → `aireDeclaree`, provenance prototype »). */
  readonly transformations: readonly string[];
}

export interface RoleInconnu {
  readonly role: string;
  readonly effectif: number;
  readonly objetIds: readonly IdObjet[];
}

/** Donnée source non portée par le modèle, avec motif (ex. `domains.ui.activeLevel` : état d'affichage, R10). */
export interface DonneeNonImportee {
  readonly chemin: string;
  readonly motif: string;
}

export interface RapportImport {
  readonly source: { readonly exampleId?: string; readonly sourceVersion?: string; readonly empreinteSource?: string };
  readonly lignes: readonly LigneRapportImport[];
  readonly rolesInconnus: readonly RoleInconnu[];
  readonly nonImporte: readonly DonneeNonImportee[];
  readonly problemes: readonly Probleme[];
  /** Questions ouvertes pour le maître d'ouvrage (ex. divergence de calque entre niveaux). */
  readonly questions: readonly string[];
  /** Empreinte du modèle produit (= `modele.empreinte`). */
  readonly empreinte: string;
}

export interface ResultatImport {
  readonly modele: EtatModele;
  readonly rapport: RapportImport;
}

/** Signature de l'importeur (pur, sans E/S). `projetId` facultatif : préfixe des identifiants stables `${projetId}_${id}` (absent = identifiants source). */
export type ImporterP118 = (dataset: JeuDonneesP118, options?: { readonly projetId?: string }) => ResultatImport;
