/**
 * Site de projet (27 novembre 2026, demande du maître d'ouvrage) : l'emplacement géographique où un projet immobilier
 * sera construit ou rénové. Un même site sert trois endroits — l'étape 01 du Parcours, GeoData et l'extension
 * « Emplacement » de la Planche du Sandbox — et vit dans une base dédiée (tables `sites_*`), lue par l'API `/sites/api`.
 *
 * Structure reprise de l'étape 01 (`site.ts`) : la parcelle (`SiteParcel`, repère cadastral et CRS déclarés), les
 * données du site déclarées (`SiteObservations`) et l'altimétrie collectée (`SiteElevation`). S'y ajoutent la fiche
 * (nom, nature des travaux, lieu), une zone indicative en WGS 84 (jamais une parcelle cadastrale) et deux champs de
 * l'Emplacement de la Planche absents de l'étape 01 : le nord vrai et l'altitude de référence, déclarés avec leur source.
 *
 * Rien n'est inventé : une valeur absente reste `null` (« non évaluée ») ; la position se calcule comme à l'étape 01
 * (conversion explicite du contour, sinon repère saisi), puis, à défaut, au centre de la zone indicative. Pur.
 */
import { vertexCentroid, type Point2 } from "@parcours/core-geometry";
import { DEFAULT_SITE_OBSERVATIONS, siteGeographic, type GeographicConverter, type SiteElevation, type SiteObservations, type SiteParcel } from "./site.js";

export type NatureTravaux = "construction" | "renovation";
export const NATURES_TRAVAUX: readonly NatureTravaux[] = ["construction", "renovation"];

export interface FicheSite {
  readonly nom: string;
  readonly nature: NatureTravaux | null;
  /** Nom du lieu, libre (vide = non renseigné). */
  readonly lieu: string;
}

/** Valeur déclarée avec sa source (nord vrai, altitude de référence). */
export interface ValeurDeclaree {
  readonly valeur: number;
  readonly source: string;
}

/** Données du site déclarées : celles de l'étape 01 (sans l'altimétrie, rangée à part) + nord vrai et altitude de référence. */
export type ObservationsSite = Omit<SiteObservations, "elevation"> & {
  /** Nord vrai, degrés dans le sens horaire depuis l'axe Y du dessin [0, 360) ; `null` = non évalué. */
  readonly nord: ValeurDeclaree | null;
  /** Altitude de référence déclarée (m) ; `null` = non évaluée. */
  readonly altitudeReference: ValeurDeclaree | null;
};

export const OBSERVATIONS_SITE_VIDES: ObservationsSite = (() => {
  const { elevation: _e, ...reste } = DEFAULT_SITE_OBSERVATIONS;
  return { ...reste, nord: null, altitudeReference: null };
})();

/** Zone indicative en WGS 84 (`[longitude, latitude]`, anneau fermé ou non) : jamais une parcelle cadastrale. */
export interface ZoneIndicative {
  readonly anneau: readonly Point2[];
  readonly provenance: "dessin" | "import" | "coordonnees" | "vue";
}

export type GenreLien = "projet" | "planche" | "zone-geodata";
export const GENRES_LIEN: readonly GenreLien[] = ["projet", "planche", "zone-geodata"];

export interface LienSite {
  readonly genre: GenreLien;
  readonly cible: string;
}

/** Contenu d'un site (sans identifiant ni révision) : ce qu'on crée, sauvegarde, importe ou exporte. */
export interface ContenuSite {
  readonly fiche: FicheSite;
  readonly parcelle: SiteParcel | null;
  readonly observations: ObservationsSite;
  readonly altimetrie: SiteElevation | null;
  readonly zone: ZoneIndicative | null;
}

export type ChampSite = "nom" | "nature" | "lieu" | "parcelle" | "observations" | "altimetrie" | "zone" | "nord" | "altitudeReference" | "position";

export type Validation<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly champ: ChampSite };

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const texte = (v: unknown, max: number): string | null => (v === undefined || v === null ? "" : typeof v === "string" && v.trim().length <= max ? v.trim() : null);
const NOM_MAX = 120;
const SOURCE_MAX = 300;

export function validerFiche(v: unknown): Validation<FicheSite> {
  if (!estObjet(v)) return { ok: false, champ: "nom" };
  const nom = typeof v["nom"] === "string" ? v["nom"].trim() : "";
  if (!nom || nom.length > NOM_MAX) return { ok: false, champ: "nom" };
  const nature = v["nature"] === undefined || v["nature"] === null || v["nature"] === "" ? null : v["nature"];
  if (nature !== null && !NATURES_TRAVAUX.includes(nature as NatureTravaux)) return { ok: false, champ: "nature" };
  const lieu = texte(v["lieu"], NOM_MAX);
  if (lieu === null) return { ok: false, champ: "lieu" };
  return { ok: true, valeur: { nom, nature: nature as NatureTravaux | null, lieu } };
}

/** Angle ramené dans [0, 360). */
export const normaliserAngle = (a: number): number => ((a % 360) + 360) % 360;

function valeurDeclaree(v: unknown, normaliser: (x: number) => number = (x) => x): ValeurDeclaree | null | undefined {
  if (v === undefined || v === null) return null;
  if (!estObjet(v) || !fini(v["valeur"])) return undefined;
  const source = texte(v["source"], SOURCE_MAX);
  if (source === null) return undefined;
  return { valeur: normaliser(v["valeur"]), source };
}

/** Données du site déclarées (même contrôle que le formulaire « Données du site » de l'étape 01). */
export function validerObservations(v: unknown): Validation<ObservationsSite> {
  if (v === undefined || v === null) return { ok: true, valeur: OBSERVATIONS_SITE_VIDES };
  if (!estObjet(v)) return { ok: false, champ: "observations" };
  const d = OBSERVATIONS_SITE_VIDES;
  const pris = <T extends string>(x: unknown, admis: readonly T[], defaut: T): T | null => (x === undefined ? defaut : admis.includes(x as T) ? (x as T) : null);
  const approachStatus = pris(v["approachStatus"], ["hypothesis", "documented"] as const, d.approachStatus);
  const priority = pris(v["priority"], ["balanced", "retreat", "service"] as const, d.priority);
  const frontContext = pris(v["frontContext"], ["unknown", "open", "exposed", "enclosed"] as const, d.frontContext);
  const backContext = pris(v["backContext"], ["unknown", "open", "built", "vegetation"] as const, d.backContext);
  const fe = v["frontageEdge"];
  const frontageEdge = fe === undefined || fe === null ? null : Number.isInteger(fe) && (fe as number) >= 0 ? (fe as number) : undefined;
  const source = texte(v["source"], SOURCE_MAX);
  const note = texte(v["note"], 2000);
  if (!approachStatus || !priority || !frontContext || !backContext || frontageEdge === undefined || source === null || note === null) return { ok: false, champ: "observations" };
  let geographic: SiteObservations["geographic"] = null;
  const g = v["geographic"];
  if (g !== undefined && g !== null) {
    if (!estObjet(g) || !fini(g["longitude"]) || !fini(g["latitude"]) || Math.abs(g["longitude"]) > 180 || Math.abs(g["latitude"]) > 90) return { ok: false, champ: "position" };
    const src = texte(g["source"], SOURCE_MAX);
    if (src === null) return { ok: false, champ: "position" };
    geographic = { longitude: g["longitude"], latitude: g["latitude"], source: src };
  }
  const nord = valeurDeclaree(v["nord"], normaliserAngle);
  if (nord === undefined) return { ok: false, champ: "nord" };
  const altitudeReference = valeurDeclaree(v["altitudeReference"]);
  if (altitudeReference === undefined) return { ok: false, champ: "altitudeReference" };
  const oa = v["observedAt"];
  const observedAt = typeof oa === "string" && !Number.isNaN(Date.parse(oa)) ? oa : null;
  return { ok: true, valeur: { frontageEdge, approachStatus, priority, frontContext, backContext, source, note, geographic, observedAt, nord, altitudeReference } };
}

/** Parcelle au format de l'étape 01 : au moins trois sommets finis, CRS déclaré ; `null` accepté (aucune parcelle). */
export function validerParcelle(v: unknown): Validation<SiteParcel | null> {
  if (v === undefined || v === null) return { ok: true, valeur: null };
  if (!estObjet(v) || !Array.isArray(v["vertices"])) return { ok: false, champ: "parcelle" };
  const vertices = v["vertices"] as unknown[];
  if (vertices.length < 3 || vertices.length > 2000 || !vertices.every((p) => Array.isArray(p) && p.length >= 2 && fini(p[0]) && fini(p[1]))) return { ok: false, champ: "parcelle" };
  const crs = typeof v["crs"] === "string" ? v["crs"].trim() : "";
  if (!crs || crs.length > 40) return { ok: false, champ: "parcelle" };
  const ids = Array.isArray(v["vertexIds"]) ? (v["vertexIds"] as unknown[]).map((x) => String(x).slice(0, 40)) : [];
  const officialArea = fini(v["officialArea"]) && v["officialArea"] > 0 ? v["officialArea"] : null;
  const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
  return {
    ok: true,
    valeur: {
      vertices: vertices.map((p) => [(p as number[])[0]!, (p as number[])[1]!] as Point2),
      vertexIds: ids.length === vertices.length ? ids : [],
      crs,
      units: str(v["units"], 10) || "m",
      officialArea,
      parcelNumber: str(v["parcelNumber"], 80),
      commune: str(v["commune"], NOM_MAX),
      sourceFile: str(v["sourceFile"], 200),
    },
  };
}

/** Altimétrie collectée, telle que l'étape 01 la garde (1 à 50 points `[lon, lat, alt]`). */
export function validerAltimetrie(v: unknown): Validation<SiteElevation | null> {
  if (v === undefined || v === null) return { ok: true, valeur: null };
  if (!estObjet(v) || !Array.isArray(v["points"]) || !fini(v["range"]) || typeof v["at"] !== "string") return { ok: false, champ: "altimetrie" };
  const points = v["points"] as unknown[];
  if (!points.length || points.length > 50 || !points.every((p) => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(fini))) return { ok: false, champ: "altimetrie" };
  const str = (x: unknown) => (typeof x === "string" ? x.slice(0, SOURCE_MAX) : undefined);
  const source = str(v["source"]);
  const status = str(v["status"]);
  return { ok: true, valeur: { points: points.map((p) => (p as number[]).slice(0, 3)), range: v["range"], at: v["at"], ...(source ? { source } : {}), ...(status ? { status } : {}) } };
}

export function validerZone(v: unknown): Validation<ZoneIndicative | null> {
  if (v === undefined || v === null) return { ok: true, valeur: null };
  if (!estObjet(v) || !Array.isArray(v["anneau"])) return { ok: false, champ: "zone" };
  const anneau = v["anneau"] as unknown[];
  if (anneau.length < 3 || anneau.length > 2000 || !anneau.every((p) => Array.isArray(p) && p.length >= 2 && fini(p[0]) && fini(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return { ok: false, champ: "zone" };
  const provenance = v["provenance"];
  if (provenance !== "dessin" && provenance !== "import" && provenance !== "coordonnees" && provenance !== "vue") return { ok: false, champ: "zone" };
  return { ok: true, valeur: { anneau: anneau.map((p) => [(p as number[])[0]!, (p as number[])[1]!] as Point2), provenance } };
}

/** Contenu complet d'un site (création, sauvegarde, import) ; le premier champ fautif est nommé. */
export function validerContenuSite(v: unknown): Validation<ContenuSite> {
  if (!estObjet(v)) return { ok: false, champ: "nom" };
  const fiche = validerFiche(v["fiche"] ?? v);
  if (!fiche.ok) return fiche;
  const parcelle = validerParcelle(v["parcelle"]);
  if (!parcelle.ok) return parcelle;
  const observations = validerObservations(v["observations"]);
  if (!observations.ok) return observations;
  const altimetrie = validerAltimetrie(v["altimetrie"]);
  if (!altimetrie.ok) return altimetrie;
  const zone = validerZone(v["zone"]);
  if (!zone.ok) return zone;
  return { ok: true, valeur: { fiche: fiche.valeur, parcelle: parcelle.valeur, observations: observations.valeur, altimetrie: altimetrie.valeur, zone: zone.valeur } };
}

/** Position du site en WGS 84, calculée — jamais stockée — avec sa provenance. */
export interface PositionSite {
  readonly longitude: number;
  readonly latitude: number;
  readonly source: string;
  /** Vrai quand la position n'est pas tirée du contour cadastral converti. */
  readonly hypothese: boolean;
}

/**
 * Position, comme à l'étape 01 (`siteGeographic`) : contour cadastral converti si son CRS est connu, sinon repère saisi ;
 * à défaut, centre de la zone indicative ; sinon `null` (« géoréférencement à documenter »).
 */
export function positionSite(c: Pick<ContenuSite, "parcelle" | "observations" | "zone">, convert: GeographicConverter | null): PositionSite | null {
  const parcelle: SiteParcel = c.parcelle ?? { vertices: [], vertexIds: [], crs: "", units: "m", officialArea: null, parcelNumber: "", commune: "", sourceFile: "" };
  const geo = siteGeographic(parcelle, { ...DEFAULT_SITE_OBSERVATIONS, ...c.observations, elevation: null }, convert);
  if (geo.center) return { longitude: geo.center.lon, latitude: geo.center.lat, source: geo.source, hypothese: geo.hypothesis && !geo.points };
  // Sans parcelle, `siteGeographic` s'arrête : le repère saisi reste la position déclarée (même règle, même source).
  const g = c.observations.geographic;
  if (g) return { longitude: g.longitude, latitude: g.latitude, source: g.source || "Repérage saisi, sans calage du contour", hypothese: true };
  if (c.zone) {
    const [lon, lat] = vertexCentroid(anneauOuvert(c.zone.anneau));
    return { longitude: lon, latitude: lat, source: "Centre de la zone indicative (non cadastrale)", hypothese: true };
  }
  return null;
}

const anneauOuvert = (a: readonly Point2[]): Point2[] => {
  const pts = a.map((p): Point2 => [p[0], p[1]]);
  const [p0, pn] = [pts[0], pts[pts.length - 1]];
  return pts.length > 3 && p0 && pn && p0[0] === pn[0] && p0[1] === pn[1] ? pts.slice(0, -1) : pts;
};

/** Contour du site en WGS 84 (GeoJSON) : parcelle convertie si possible, sinon zone indicative ; `null` sinon. */
export function contourGeoJson(c: Pick<ContenuSite, "parcelle" | "zone">, convert: GeographicConverter | null): { type: "Feature"; properties: { nature: "parcelle" | "zone-indicative"; source: string }; geometry: { type: "Polygon"; coordinates: number[][][] } } | null {
  const fermer = (pts: Point2[]): number[][] => [...pts.map((p) => [p[0], p[1]]), [pts[0]![0], pts[0]![1]]];
  if (c.parcelle && convert) {
    const ll = c.parcelle.vertices.map((q) => convert(c.parcelle!.crs, q));
    if (ll.length >= 3 && ll.every((q): q is Point2 => !!q && q.every(Number.isFinite))) {
      return { type: "Feature", properties: { nature: "parcelle", source: `Conversion ${c.parcelle.crs} → WGS84` }, geometry: { type: "Polygon", coordinates: [fermer(ll)] } };
    }
  }
  if (c.zone) return { type: "Feature", properties: { nature: "zone-indicative", source: `Zone indicative (${c.zone.provenance})` }, geometry: { type: "Polygon", coordinates: [fermer(anneauOuvert(c.zone.anneau))] } };
  return null;
}

/** Format du fichier d'échange d'un site (« Exporter le site », « Importer un site »). */
export const FORMAT_FICHIER_SITE = "fadi-site-de-projet";
export const VERSION_FICHIER_SITE = 1;

export interface FichierSite extends ContenuSite {
  readonly format: typeof FORMAT_FICHIER_SITE;
  readonly version: typeof VERSION_FICHIER_SITE;
  readonly exporteLe: string;
  /** Contour en WGS 84 (GeoJSON), pour un logiciel tiers ; recalculé à l'import, jamais relu. */
  readonly contour: ReturnType<typeof contourGeoJson>;
}

export function fichierSite(c: ContenuSite, convert: GeographicConverter | null, maintenant: string): FichierSite {
  return { format: FORMAT_FICHIER_SITE, version: VERSION_FICHIER_SITE, exporteLe: maintenant, ...c, contour: contourGeoJson(c, convert) };
}

/** Fichier d'échange relu : son contenu validé, ou le champ fautif (`format` quand ce n'est pas un fichier de site). */
export function lireFichierSite(v: unknown): Validation<ContenuSite> | { readonly ok: false; readonly champ: "format" } {
  if (!estObjet(v) || v["format"] !== FORMAT_FICHIER_SITE || v["version"] !== VERSION_FICHIER_SITE) return { ok: false, champ: "format" };
  return validerContenuSite(v);
}

/**
 * Emplacement de la Planche tiré d'un site : position calculée, altitude de référence déclarée, nord vrai, lieu (ou nom).
 * `nordEvalue` faux quand le site n'a pas de nord : la Planche garde alors 0° et doit le dire.
 */
export function emplacementDepuisSite(c: ContenuSite, position: PositionSite | null): { readonly latitude: number; readonly longitude: number; readonly nord: number; readonly altitude?: number; readonly lieu: string; readonly nordEvalue: boolean } | null {
  if (!position) return null;
  const nord = c.observations.nord;
  const alt = c.observations.altitudeReference;
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    nord: nord ? normaliserAngle(nord.valeur) : 0,
    ...(alt ? { altitude: alt.valeur } : {}),
    lieu: (c.fiche.lieu || c.fiche.nom).slice(0, NOM_MAX),
    nordEvalue: nord !== null,
  };
}

/** Données de l'étape 01 d'un projet rangées en contenu de site (« Enregistrer comme site de projet »). */
export function contenuDepuisEtape01(nom: string, parcelle: SiteParcel | null, observations: SiteObservations | null): ContenuSite {
  const o = observations ?? DEFAULT_SITE_OBSERVATIONS;
  const { elevation, ...reste } = o;
  return {
    fiche: { nom: nom.trim().slice(0, NOM_MAX) || "Site du projet", nature: null, lieu: parcelle?.commune ?? "" },
    parcelle: parcelle && parcelle.vertices.length >= 3 ? parcelle : null,
    observations: { ...reste, nord: null, altitudeReference: null },
    altimetrie: elevation ?? null,
    zone: null,
  };
}
