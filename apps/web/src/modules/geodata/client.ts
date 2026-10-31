/**
 * Client minimal de GeoData : le SEUL fichier du module qui appelle le serveur, et seulement sous `/geodata/api` (test
 * d'indépendance). Le client d'API général de Fadi n'est jamais importé : aucune notion de projet, aucun contexte de projet.
 */
import type { CarteDeCollection, Composition, DescriptionRaster, DroitsVersion, Milieu, MotifAbsence, PaysTerritorial, RapportImport, Sexe, StyleCouche, UniteTerritoriale } from "@parcours/geodata-model";

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

export interface IndicateurRecu {
  id: string; titre: string; unite: string; periode: string | null; nature: "source" | "calcule"; methode: string; denominateur: string | null; description: string; absentes: number; total: number;
  /** Dimensions (D-GD-17, lot A2) : null pour un indicateur sans famille. */
  theme: string | null; famille: string | null; modalite: string | null; milieu: Milieu | null; sexe: Sexe | null;
}
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
  /** Niveau administratif de la couche (D-GD-42), lu dans la table des niveaux en base ; null hors découpage. */
  niveauAdministratif?: NiveauCoucheRecu | null;
}
/** Niveau d'une couche de limites : rang (1 = le plus global) et noms, lus en base. */
export interface NiveauCoucheRecu { readonly pays: string; readonly code: string; readonly rang: number; readonly singulier: string; readonly pluriel: string }
/** Découpage administratif d'un pays (D-GD-42) : niveaux et liens parent → enfant, lus en base. */
export interface DecoupageRecu {
  readonly pays: string;
  readonly niveaux: readonly { code: string; rang: number; singulier: string; pluriel: string; fiche: string | null; coucheId: string | null }[];
  readonly entites: readonly { code: string; parent: string | null; niveau: string }[];
}
export type ResultatRecherche =
  | { type: "coordonnees"; libelle: string; point: { lon: number; lat: number }; provenance: string }
  | { type: "unite"; code: string; libelle: string; niveau: string | null; coucheId: string; coucheTitre: string; emprise: { coordinates: number[][][] }; centre: { coordinates: [number, number] }; provenance: string };
export type ProximiteCouche =
  | { coucheId: string; accessible: false }
  | { coucheId: string; accessible: true; titre: string; nombre: number; plusProche: { code: string; nom: string; distanceM: number } | null };
export interface ValeurRasterRecue { lon: number; lat: number; valeur: number | null; classe: string | null; unite: string | null; grandeur: string }
export interface ValeurRecue { valeur: number | null; motifAbsence: MotifAbsence | null }
export interface LigneTable { code: string; nom: string | null; niveau: string | null; geometrieReparee: boolean; proprietes: Record<string, unknown>; valeurs: Record<string, ValeurRecue> }
export interface FicheRecue {
  code: string; nom: string | null; niveau: string | null; geometrieReparee: boolean; emprise: { coordinates: number[][][] }; centre: { coordinates: [number, number] };
  proprietes: Record<string, unknown>; indicateurs: (IndicateurRecu & ValeurRecue)[]; couche: CoucheRecue;
  /** Douars d'une commune rurale (lot E) ; vide ailleurs. */
  douars?: DouarRecu[];
  /** Prix immobiliers publiés par un tiers et rattachés à l'objet (lot P7) ; null ou absent ailleurs. */
  prixPublies?: PrixPubliesRecus | null;
}

// ——— Prix immobiliers (Concept Prix v1.1, lot P7) : tout est lu en base par l'API, rien n'est embarqué (D-GD-29). ———

/** Édition d'un agrégat publié par un tiers (ex. baromètre d'un agrégateur) : éditeur, période, attribution, licence. */
export interface EditionPrixRecue {
  versionId: string; coucheId: string | null; editeur: string; libelle: string;
  /** Période déclarée : texte, ou bornes AAAA-MM-JJ. */
  periode: string | { debut: string; fin: string } | null;
  attribution: string; licence: string; sourceUrl: string | null; publieeLe: string | null;
}
/** Montant tel que publié : valeur numérique, abréviation de l'éditeur (≈) et texte d'origine. */
export interface MontantPublieRecu { valeur: number | null; approximatif?: boolean; texte?: string | null }
export interface LignePrixRecue {
  versionId: string; niveauGeo: "ville" | "quartier-commercial"; libelleGeo: string; codeRattache: string | null; etatRattachement: string | null;
  typeBien: string; transaction: "vente" | "location"; nombreAnnonces: number | null;
  prixMedian: MontantPublieRecu | null; prixM2: MontantPublieRecu | null; unite: string; uniteM2: string;
  /** Tendance sur 90 jours en pour cent, telle que publiée ; null = non publiée (jamais 0). */
  tendance90j: number | null;
}
export interface PrixPubliesRecus { editions: EditionPrixRecue[]; lignes: LignePrixRecue[]; nonRattaches: LignePrixRecue[] }
/** Source du registre des prix (dossier de qualification) : statut, motif de blocage et prochaine action. */
export interface SourcePrixRecue {
  cle: string; titre: string; couche: "officielle" | "annonces"; produit: string; statut: string; editeur: string | null; url: string | null; licence: string | null;
  motif: string | null; prochaineAction: string | null; derivee: boolean; ficheGeodata: string | null; revueLe: string | null; revueAvant: string | null;
}
export interface ProduitPrixRecu { produit: string; etat: string; motif: string | null; versionIds?: string[]; instantaneId?: string | null }
export interface CouchePrixRecue { couche: "officielle" | "annonces"; etat: string; motifs: string[]; produits: ProduitPrixRecu[] }
export interface CellulePrixRecue {
  cohorte: string | Record<string, unknown>; etat: string; mediane: number | null; q1: number | null; q3: number | null;
  nombres: { brutes: number | null; eligibles: number | null; distinctes: number | null };
  exclusions: number | Record<string, number> | null; contributionSources: Record<string, number> | string | null;
  premiereObservation: string | null; derniereObservation: string | null;
}
export interface CellulesPrixRecues { instantane: { id: string; empreinte: string; methode: string; publieLe: string } | null; etat: string; motif?: string | null; cellules: CellulePrixRecue[] }
export interface ComparaisonPrixRecue {
  comparable: boolean; dimensionsIncompatibles?: string[]; ecartPourcent?: number | null; position?: "en-dessous" | "dans" | "au-dessus" | null; libelle?: string | null;
}
/** Douar du RGPH 2024 : nom et fraction tels que publiés (en arabe) ; secret = pourcentages supprimés par le HCP. */
export interface DouarRecu {
  code: string; fraction: string; nom: string; type: "groupé" | "éclaté" | "dispersé" | null; menages: number | null; population: number | null; secret: boolean;
  pourcentages: { masculin: number | null; feminin: number | null; moins15: number | null; de15a59: number | null; plus60: number | null };
  /** Compléments (D-GD-43) : colonne → valeur publiée ; null = version importée sans compléments. */
  complements?: Record<string, number | null> | null;
}
export type Disponibilite = { etat: "disponible"; versionPlusRecente: string | null } | { etat: "retiree" | "inaccessible"; motif: string };
/** Collection qui référence une carte (une carte peut être dans plusieurs collections, D-GD-36). */
export interface CollectionDeCarte { id: string; nom: string }
export interface CarteRecue { id: string; nom: string; revision: number; etat: "active" | "archivee"; collections: CollectionDeCarte[]; creeLe: string; modifieLe: string; composition: Composition; disponibilite: Record<string, Disponibilite> }
export interface ResumeCarte { id: string; nom: string; revision: number; etat: string; modifieLe: string; couches: number }
export interface CollectionRecue { id: string; nom: string; description: string; etat: string; modifieLe: string; cartes: number }
/** Collection ouverte (D-GD-36) : titre (`nom`), description et cartes référencées dans leur ordre. */
export interface CollectionDetail { id: string; nom: string; description: string; etat: string; revision: number; creeLe: string; modifieLe: string; cartes: CarteDeCollection[] }
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

/** Unité du découpage contenant un point cliqué (D-GD-34). */
export interface UniteAuPoint { readonly pays: string; readonly code: string; readonly nom: string; readonly rang: number; readonly versionId: string; readonly coucheId: string }

/** Unité du découpage territorial (lot H) : ancêtres, emprise, contour tel qu'en base, attribution. */
export interface UniteTerritorialeRecue extends UniteTerritoriale {
  readonly pays: string;
  /** Version de référence et couche qui portent l'unité (fiche d'objet, D-GD-34). */
  readonly versionId: string;
  readonly coucheId: string;
  readonly ancetres: readonly { code: string; nom: string; rang: number }[];
  readonly enfants: number;
  readonly contour: unknown;
  readonly attribution: string;
}

/** Tableau de bord RGPH 2024 (D-GD-37) : définition des blocs en base et zone nationale. */
export interface TableauDeBordRecu { pays: string; versionId: string; attribution: string; zone: { code: string; nom: string; coucheId: string }; definition: unknown; concepts: Record<string, number> }
export interface ConceptsRecus { langue: "fr" | "ar"; source: string | null; concepts: { titre: string; texte: string }[] }

export const api = {
  /** Découpage territorial en base (lot H, D-GD-28) : pays chargés, unités d'un niveau, une unité. */
  territoires: () => appeler<{ pays: PaysTerritorial[] }>("/territoires"),
  /** Niveaux et liens parent → enfant du découpage en base (D-GD-42) : aucune hiérarchie n'est écrite dans l'interface. */
  decoupage: (pays: string) => appeler<DecoupageRecu>(`/territoires/${encodeURIComponent(pays)}/decoupage`),
  unitesTerritoriales: (pays: string, parent: string | null) => appeler<{ unites: UniteTerritoriale[] }>(`/territoires/${encodeURIComponent(pays)}/unites${parent ? `?parent=${encodeURIComponent(parent)}` : ""}`),
  uniteTerritoriale: (pays: string, code: string, rang?: number) => appeler<UniteTerritorialeRecue>(`/territoires/${encodeURIComponent(pays)}/unites/${encodeURIComponent(code)}${rang ? `?rang=${rang}` : ""}`),
  /** Unité retrouvée par la version de la couche d'une entité : le pays est celui de cette version, jamais le pays affiché. */
  /** Unités du pays courant contenant un point, de la plus élémentaire à la plus globale (clics sur carte vierge, D-GD-34). */
  unitesAuPoint: (pays: string, lon: number, lat: number) => appeler<{ unites: UniteAuPoint[] }>(`/territoires/${encodeURIComponent(pays)}/point?lon=${encodeURIComponent(lon.toFixed(6))}&lat=${encodeURIComponent(lat.toFixed(6))}`),
  uniteTerritorialeDeVersion: (versionId: string, code: string, rang?: number) => appeler<UniteTerritorialeRecue>(`/territoires/version/${encodeURIComponent(versionId)}/unites/${encodeURIComponent(code)}${rang ? `?rang=${rang}` : ""}`),
  espace: () => appeler<EspaceRecu>("/espace"),
  tableauDeBord: (pays: string | null) => appeler<TableauDeBordRecu>(`/tableau-de-bord${pays ? `?pays=${encodeURIComponent(pays)}` : ""}`),
  concepts: (pays: string | null, langue: "fr" | "ar") => appeler<ConceptsRecus>(`/tableau-de-bord/concepts?langue=${langue}${pays ? `&pays=${encodeURIComponent(pays)}` : ""}`),
  catalogue: (q = "") => appeler<{ couches: CoucheRecue[] }>(`/catalogue${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  couche: (id: string) => appeler<CoucheRecue>(`/couches/${encodeURIComponent(id)}`),
  rechercher: (q: string) => appeler<{ resultats: ResultatRecherche[]; avertissement?: { code: string; message: string } }>(`/recherche?q=${encodeURIComponent(q)}`),
  table: (id: string, p: { page: number; taille: number; tri: "nom" | "code"; ordre: "asc" | "desc"; propriete?: string; operateur?: "egal" | "contient"; valeur?: string; zone?: string | null }) => {
    const q = new URLSearchParams({ page: String(p.page), taille: String(p.taille), tri: p.tri, ordre: p.ordre, ...(p.propriete && p.valeur ? { propriete: p.propriete, operateur: p.operateur ?? "contient", valeur: p.valeur } : {}), ...(p.zone ? { zone: p.zone } : {}) });
    return appeler<{ page: number; taille: number; total: number; lignes: LigneTable[] }>(`/couches/${encodeURIComponent(id)}/table?${q}`);
  },
  codesFiltres: (id: string, f: { propriete: string; operateur: "egal" | "contient"; valeur: string }) => appeler<{ codes: string[] }>(`/couches/${encodeURIComponent(id)}/codes?${new URLSearchParams(f)}`),
  /** Lecture de l'emprise (D-GD-40) : codes des objets qui recoupent la vue et nombre total d'objets de la couche. */
  vue: (id: string, emprise: readonly [number, number, number, number], signal?: AbortSignal) =>
    appeler<{ total: number; codes: string[]; tronque: boolean }>(`/couches/${encodeURIComponent(id)}/vue?bbox=${emprise.map((v) => v.toFixed(6)).join(",")}`, signal ? { signal } : {}),
  /** Codes des objets qui recoupent une zone d'étude de l'espace (D-GD-41). */
  codesZone: (id: string, zoneId: string) => appeler<{ total: number; codes: string[]; tronque: boolean }>(`/couches/${encodeURIComponent(id)}/vue?zone=${encodeURIComponent(zoneId)}`),
  /** Proximité des équipements (D-GD-49) : objets des couches demandées à moins de `rayon` m de l'objet. */
  proximite: (coucheId: string, code: string, rayon: number, couches: readonly string[]) =>
    appeler<{ rayon: number; couches: ProximiteCouche[] }>(`/couches/${encodeURIComponent(coucheId)}/objets/${encodeURIComponent(code)}/proximite?rayon=${rayon}&couches=${couches.map(encodeURIComponent).join(",")}`),
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
  reviserCarte: (id: string, corps: { revisionAttendue: number; nom?: string; composition?: Composition }) => envoyer<CarteRecue>(`/cartes/${encodeURIComponent(id)}`, "PUT", corps),
  dupliquerCarte: (id: string, corps: { nom?: string; composition?: Composition } = {}) => envoyer<CarteRecue>(`/cartes/${encodeURIComponent(id)}/dupliquer`, "POST", corps),
  archiverCarte: (id: string, restaurer = false) => envoyer<CarteRecue>(`/cartes/${encodeURIComponent(id)}/${restaurer ? "restaurer" : "archiver"}`, "POST", {}),
  collections: () => appeler<{ collections: CollectionRecue[] }>("/collections"),
  collection: (id: string) => appeler<CollectionDetail>(`/collections/${encodeURIComponent(id)}`),
  creerCollection: (corps: { nom: string; description?: string; cartes?: string[] }) => envoyer<CollectionDetail>("/collections", "POST", corps),
  enregistrerCollection: (id: string, corps: { revisionAttendue: number; nom?: string; description?: string; cartes?: string[] }) => envoyer<CollectionDetail>(`/collections/${encodeURIComponent(id)}`, "PUT", corps),
  supprimerCollection: (id: string) => envoyer<void>(`/collections/${encodeURIComponent(id)}`, "DELETE"),
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
  // Prix immobiliers (lot P7) : registre des sources, état des deux couches, agrégats publiés, instantané, comparaison.
  prixSources: () => appeler<{ sources: SourcePrixRecue[]; dossier: string | null }>("/prix/sources"),
  prixCouches: () => appeler<{ couches: CouchePrixRecue[] }>("/prix/couches"),
  prixAgregats: (code: string) => appeler<{ editions: EditionPrixRecue[]; lignes: LignePrixRecue[] }>(`/prix/agregats-publies?code=${encodeURIComponent(code)}`),
  prixCellules: () => appeler<CellulesPrixRecues>("/prix/cellules"),
  prixComparaison: (code: string, type: string, transaction: string) =>
    appeler<ComparaisonPrixRecue>(`/prix/comparaison?${new URLSearchParams({ code, type, transaction })}`),
};

/** Adresse du téléchargement CSV d'une édition d'agrégat publié (attribution incluse par le serveur). */
export const adresseExportPrix = (versionId: string) => `${RACINE_API}/prix/export?format=csv&versionId=${encodeURIComponent(versionId)}`;

/** Adresse des tuiles d'une couche, absolue (le moteur cartographique les demande depuis un Worker) ; points regroupés en grappes (D-GD-40). */
export const adresseTuiles = (coucheId: string, regrouper = false) => `${window.location.origin}${RACINE_API}/tuiles/${encodeURIComponent(coucheId)}/{z}/{x}/{y}${regrouper ? "?regrouper=1" : ""}`;

/** Adresse des points d'étiquette d'une couche (lot C, D-GD-24), lus seulement quand ses libellés sont affichés. */
export const adresseEtiquettes = (coucheId: string) => `${window.location.origin}${RACINE_API}/etiquettes/${encodeURIComponent(coucheId)}/{z}/{x}/{y}`;

/** Glyphes des libellés, hébergés avec l'application (écriture latine, Noto Sans, OFL) : aucune police tierce. */
export const adresseGlyphes = () => `${window.location.origin}/geodata/glyphes/{fontstack}/{range}.pbf`;

/** Adresse des tuiles d'image d'une couche raster (D-GD-13). */
export const adresseRaster = (coucheId: string) => `${window.location.origin}${RACINE_API}/raster/${encodeURIComponent(coucheId)}/{z}/{x}/{y}.png`;
