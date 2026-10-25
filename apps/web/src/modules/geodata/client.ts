/**
 * Client minimal de GeoData : le SEUL fichier du module qui appelle le serveur, et seulement sous `/geodata/api` (test
 * d'indépendance). Le client d'API général de Fadi n'est jamais importé : aucune notion de projet, aucun contexte de projet.
 */
import type { Composition, DescriptionRaster, DroitsVersion, MotifAbsence, RapportImport, StyleCouche } from "@parcours/geodata-model";

export const RACINE_API = "/geodata/api";

/** Erreur d'un appel : `statut` HTTP (0 = réseau indisponible), code métier et corps reçu. */
export class ErreurGeoData extends Error {
  constructor(readonly statut: number, readonly code: string, message: string, readonly corps: Record<string, unknown> = {}) {
    super(message);
  }
}

async function appeler<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${RACINE_API}${chemin}`, { credentials: "include", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  } catch {
    throw new ErreurGeoData(0, "reseau", "Réseau indisponible : vos modifications locales sont conservées dans cette page.");
  }
  if (r.status === 204) return undefined as T;
  const corps = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ErreurGeoData(r.status, typeof corps["error"] === "string" ? corps["error"] : "erreur", typeof corps["message"] === "string" ? corps["message"] : `Réponse ${r.status}`, corps);
  return corps as T;
}
const envoyer = <T,>(chemin: string, methode: string, corps?: unknown) => appeler<T>(chemin, { method: methode, ...(corps === undefined ? {} : { body: JSON.stringify(corps) }) });

export interface Fond { id: string; libelle: string; type: "neutre" | "raster"; tuiles: string[] | null; attribution: string; export: boolean; zoomMax: number | null }
export interface EspaceRecu { espace: { id: string; type: string; creeLe: string }; roles: string[]; capacites: string[]; fonds: Fond[]; geocodage: { externe: boolean; message: string } }

export interface IndicateurRecu { id: string; titre: string; unite: string; periode: string | null; nature: "source" | "calcule"; methode: string; denominateur: string | null; description: string; absentes: number; total: number }
export interface VersionRecue {
  id: string; libelle: string; empreinte: string; urlSource: string | null; recupereLe: string | null; periode: string | null; licence: string; attribution: string;
  droits: DroitsVersion; crsSource: string; precision: string | null; transformations: string[]; synthetique: boolean; etat: string; publieeLe: string | null; privee: boolean;
  source: { id: string; titre: string; producteur: string; theme: string; couverture: string; description: string };
}
export interface CoucheRecue {
  id: string; titre: string; description: string; typeGeometrie: "polygone" | "ligne" | "point" | "mixte" | "raster"; niveau: string | null; proprietesExposees: string[];
  styleDefaut: StyleCouche; nombreObjets: number; emprise: { type: "Polygon"; coordinates: number[][][] } | null; indicateurs: IndicateurRecu[]; version: VersionRecue;
  /** Couche raster (D-GD-13) : grandeur, unité et symbologie ; null pour une couche d'objets. */
  raster: DescriptionRaster | null;
}
export type ResultatRecherche =
  | { type: "coordonnees"; libelle: string; point: { lon: number; lat: number }; provenance: string }
  | { type: "unite"; code: string; libelle: string; niveau: string | null; coucheId: string; coucheTitre: string; emprise: { coordinates: number[][][] }; centre: { coordinates: [number, number] }; provenance: string };
export interface ValeurRasterRecue { lon: number; lat: number; valeur: number | null; classe: string | null; unite: string | null; grandeur: string }
export interface ValeurRecue { valeur: number | null; motifAbsence: MotifAbsence | null }
export interface LigneTable { code: string; nom: string | null; niveau: string | null; geometrieReparee: boolean; proprietes: Record<string, unknown>; valeurs: Record<string, ValeurRecue> }
export interface FicheRecue {
  code: string; nom: string | null; niveau: string | null; geometrieReparee: boolean; emprise: { coordinates: number[][][] }; centre: { coordinates: [number, number] };
  proprietes: Record<string, unknown>; indicateurs: (IndicateurRecu & ValeurRecue)[]; couche: CoucheRecue;
}
export type Disponibilite = { etat: "disponible"; versionPlusRecente: string | null } | { etat: "retiree" | "inaccessible"; motif: string };
export interface CarteRecue { id: string; nom: string; revision: number; etat: "active" | "archivee"; collectionId: string | null; creeLe: string; modifieLe: string; composition: Composition; disponibilite: Record<string, Disponibilite> }
export interface ResumeCarte { id: string; nom: string; revision: number; etat: string; collectionId: string | null; modifieLe: string; couches: number }
export interface CollectionRecue { id: string; nom: string; etat: string; cartes: number }
export interface ZoneRecue { id: string; nature: "zone" | "annotation"; nom: string; texte: string; provenance: string; revision: number; geometrieReparee: boolean; geometrie: { type: string; coordinates: unknown }; aireM2: number | null; avertissement: string; creeLe: string }
export interface AnalyseRecue {
  id: string; zoneId: string; zoneRevision: number; coucheId: string; versionId: string; methode: string; versionMethode: string; creeLe: string; aRecalculer: boolean; motifsRecalcul: string[];
  resultat: { aireZoneM2: number; unitesIntersectees: number; aireHorsCouvertureM2: number; methode: string; limites: string; couche: { id: string; titre: string }; version: { id: string; libelle: string; attribution: string };
    unites: { code: string; nom: string | null; aireIntersectionM2: number; aireUniteM2: number; partDeLaZone: number | null; partDeLUnite: number | null }[] };
}
export interface ImportRecu { id: string; requestId: string; etat: "valide" | "rejete" | "confirme" | "annule" | "expire"; nomFichier: string; taille: number; rapport: RapportImport; versionId: string | null; coucheId?: string | null; expireLe: string }
export interface ExportRecu { id: string; etat: "autorise" | "refuse"; carteRevision: number; refus: { coucheId: string | null; titre: string; motif: string }[]; attributions: string[]; sources: { titre: string; version: string; licence: string; attribution: string; periode: string | null }[]; fiche: string | null; expireLe: string }

export interface CategorieRecue { readonly id: string; readonly libelle: string; readonly ordre: number; readonly themes: readonly string[] }
export interface RangementRecu { readonly categories: readonly CategorieRecue[]; readonly affectations: Readonly<Record<string, string>>; readonly modifiable: boolean }

export const api = {
  espace: () => appeler<EspaceRecu>("/espace"),
  catalogue: (q = "") => appeler<{ couches: CoucheRecue[] }>(`/catalogue${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  couche: (id: string) => appeler<CoucheRecue>(`/couches/${encodeURIComponent(id)}`),
  rechercher: (q: string) => appeler<{ resultats: ResultatRecherche[]; avertissement?: { code: string; message: string } }>(`/recherche?q=${encodeURIComponent(q)}`),
  table: (id: string, p: { page: number; taille: number; tri: "nom" | "code"; ordre: "asc" | "desc"; propriete?: string; operateur?: "egal" | "contient"; valeur?: string }) => {
    const q = new URLSearchParams({ page: String(p.page), taille: String(p.taille), tri: p.tri, ordre: p.ordre, ...(p.propriete && p.valeur ? { propriete: p.propriete, operateur: p.operateur ?? "contient", valeur: p.valeur } : {}) });
    return appeler<{ page: number; taille: number; total: number; lignes: LigneTable[] }>(`/couches/${encodeURIComponent(id)}/table?${q}`);
  },
  codesFiltres: (id: string, f: { propriete: string; operateur: "egal" | "contient"; valeur: string }) => appeler<{ codes: string[] }>(`/couches/${encodeURIComponent(id)}/codes?${new URLSearchParams(f)}`),
  fiche: (coucheId: string, code: string) => appeler<FicheRecue>(`/couches/${encodeURIComponent(coucheId)}/objets/${encodeURIComponent(code)}`),
  valeurRaster: (coucheId: string, lon: number, lat: number) => appeler<ValeurRasterRecue>(`/raster/${encodeURIComponent(coucheId)}/valeur?lon=${lon}&lat=${lat}`),
  categories: (coucheId: string) => appeler<{ categories: { code: string; nom: string | null; rang: number }[] }>(`/couches/${encodeURIComponent(coucheId)}/categories`),
  // Catégories du catalogue (D-GD-14) : lecture pour tous, gestion réservée au gestionnaire de données.
  rangement: () => appeler<RangementRecu>("/categories"),
  creerCategorie: (libelle: string) => envoyer<CategorieRecue>("/categories", "POST", { libelle }),
  renommerCategorie: (id: string, libelle: string) => envoyer<CategorieRecue>(`/categories/${encodeURIComponent(id)}`, "PATCH", { libelle }),
  ordonnerCategories: (ids: string[]) => envoyer<{ ids: string[] }>("/categories-ordre", "PUT", { ids }),
  supprimerCategorie: (id: string) => envoyer<null>(`/categories/${encodeURIComponent(id)}`, "DELETE"),
  rangerSource: (categorieId: string, sourceId: string) => envoyer<{ sourceId: string; categorieId: string }>(`/categories/${encodeURIComponent(categorieId)}/sources/${encodeURIComponent(sourceId)}`, "PUT", {}),
  libererSource: (sourceId: string) => envoyer<null>(`/categories-sources/${encodeURIComponent(sourceId)}`, "DELETE"),
  valeurs: (indicateurId: string) => appeler<{ valeurs: ({ code: string } & ValeurRecue)[] }>(`/indicateurs/${encodeURIComponent(indicateurId)}/valeurs`),
  cartes: (etat: "active" | "archivee" = "active") => appeler<{ cartes: ResumeCarte[] }>(`/cartes?etat=${etat}`),
  carte: (id: string) => appeler<CarteRecue>(`/cartes/${encodeURIComponent(id)}`),
  creerCarte: (nom: string, composition: Composition, collectionId: string | null) => envoyer<CarteRecue>("/cartes", "POST", { nom, composition, collectionId }),
  reviserCarte: (id: string, corps: { revisionAttendue: number; nom?: string; composition?: Composition; collectionId?: string | null }) => envoyer<CarteRecue>(`/cartes/${encodeURIComponent(id)}`, "PUT", corps),
  dupliquerCarte: (id: string, corps: { nom?: string; composition?: Composition } = {}) => envoyer<CarteRecue>(`/cartes/${encodeURIComponent(id)}/dupliquer`, "POST", corps),
  archiverCarte: (id: string, restaurer = false) => envoyer<CarteRecue>(`/cartes/${encodeURIComponent(id)}/${restaurer ? "restaurer" : "archiver"}`, "POST", {}),
  collections: () => appeler<{ collections: CollectionRecue[] }>("/collections"),
  creerCollection: (nom: string) => envoyer<CollectionRecue>("/collections", "POST", { nom }),
  zones: () => appeler<{ zones: ZoneRecue[] }>("/zones"),
  creerZone: (corps: { nature: "zone" | "annotation"; nom: string; texte?: string; geometrie: unknown; provenance: "dessin" | "import" | "coordonnees" }) => envoyer<ZoneRecue>("/zones", "POST", corps),
  archiverZone: (id: string) => envoyer<{ id: string }>(`/zones/${encodeURIComponent(id)}/archiver`, "POST", {}),
  analyses: () => appeler<{ analyses: AnalyseRecue[] }>("/analyses"),
  analyser: (zoneId: string, coucheId: string) => envoyer<AnalyseRecue>("/analyses", "POST", { zoneId, coucheId }),
  imports: () => appeler<{ imports: ImportRecu[] }>("/imports"),
  deposer: (requestId: string, nomFichier: string, contenu: string) => envoyer<ImportRecu>("/imports", "POST", { requestId, nomFichier, contenu }),
  confirmerImport: (id: string, titre: string) => envoyer<ImportRecu>(`/imports/${encodeURIComponent(id)}/confirmer`, "POST", { titre }),
  annulerImport: (id: string) => envoyer<ImportRecu>(`/imports/${encodeURIComponent(id)}/annuler`, "POST", {}),
  exporter: (carteId: string, revisionAttendue: number, analyseIds: string[]) => envoyer<ExportRecu>("/exports", "POST", { carteId, revisionAttendue, analyseIds }),
};

/** Adresse des tuiles d'une couche, absolue (le moteur cartographique les demande depuis un Worker). */
export const adresseTuiles = (coucheId: string) => `${window.location.origin}${RACINE_API}/tuiles/${encodeURIComponent(coucheId)}/{z}/{x}/{y}`;

/** Adresse des tuiles d'image d'une couche raster (D-GD-13). */
export const adresseRaster = (coucheId: string) => `${window.location.origin}${RACINE_API}/raster/${encodeURIComponent(coucheId)}/{z}/{x}/{y}.png`;
