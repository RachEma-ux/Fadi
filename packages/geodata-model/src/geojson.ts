/**
 * Validation d'un GeoJSON importé dans un espace GeoData (D-GD-07, GEO 07). Le contrat V1 est celui de RFC 7946 :
 * WGS 84, longitude puis latitude. Un fichier qui déclare un autre système, ou dont les coordonnées sortent des plages
 * géographiques (fichier projeté ou d'origine inconnue), est **refusé** : aucune transformation n'est devinée. Les
 * attributs sont gardés comme données inertes (valeurs primitives seulement). Aucune réparation silencieuse : chaque
 * écart est un diagnostic du rapport.
 */

export interface LimitesImport {
  readonly octets: number;
  readonly objets: number;
  readonly sommets: number;
  readonly proprietes: number;
  readonly longueurTexte: number;
}

/**
 * Nombre maximal d'objets d'une couche (référence ou import) : les valeurs d'un indicateur sont servies d'un bloc au
 * navigateur pour la classification ; aucune couche plus grande n'est acceptée, aucune réponse n'est tronquée.
 */
export const OBJETS_PAR_COUCHE = 5000;

export const LIMITES_IMPORT: LimitesImport = Object.freeze({ octets: 5 * 1024 * 1024, objets: OBJETS_PAR_COUCHE, sommets: 200_000, proprietes: 50, longueurTexte: 500 });

export type TypeGeometrie = "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
const TYPES = new Set<TypeGeometrie>(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"]);

/** Noms de CRS acceptés : CRS84 (lon/lat) explicite ; EPSG:4326 accepté avec l'ordre lon/lat imposé par RFC 7946, signalé. */
const CRS84 = new Set(["urn:ogc:def:crs:OGC:1.3:CRS84", "urn:ogc:def:crs:OGC::CRS84", "CRS84", "OGC:CRS84"]);
const EPSG4326 = new Set(["urn:ogc:def:crs:EPSG::4326", "EPSG:4326", "epsg:4326"]);

export type Primitive = string | number | boolean | null;

export interface ObjetImporte {
  readonly geometrie: { readonly type: TypeGeometrie; readonly coordinates: unknown };
  readonly proprietes: Readonly<Record<string, Primitive>>;
}

export interface Diagnostic {
  readonly niveau: "erreur" | "avertissement";
  readonly code: string;
  readonly message: string;
  /** Indice de l'objet concerné (0 = premier), absent pour le fichier entier. */
  readonly objet?: number;
}

export interface RapportImport {
  readonly objets: number;
  readonly sommets: number;
  readonly types: Readonly<Partial<Record<TypeGeometrie, number>>>;
  /** [lonMin, latMin, lonMax, latMax] */
  readonly emprise: readonly [number, number, number, number] | null;
  readonly proprietes: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

export type ValidationGeoJSON =
  | { readonly ok: true; readonly objets: readonly ObjetImporte[]; readonly rapport: RapportImport }
  | { readonly ok: false; readonly rapport: RapportImport };

const objet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export function validerGeoJSON(entree: unknown, limites: LimitesImport = LIMITES_IMPORT): ValidationGeoJSON {
  const diagnostics: Diagnostic[] = [];
  const erreur = (code: string, message: string, i?: number) => diagnostics.push({ niveau: "erreur", code, message, ...(i === undefined ? {} : { objet: i }) });
  const avert = (code: string, message: string, i?: number) => diagnostics.push({ niveau: "avertissement", code, message, ...(i === undefined ? {} : { objet: i }) });
  const types: Partial<Record<TypeGeometrie, number>> = {};
  const nomsProprietes = new Set<string>();
  let sommets = 0;
  let emprise: [number, number, number, number] | null = null;
  let horsPlage = 0;
  let altitudes = 0;
  const vide = (): ValidationGeoJSON => ({ ok: false, rapport: { objets: 0, sommets, types, emprise, proprietes: [], diagnostics } });

  if (!objet(entree)) return erreur("structure", "Le fichier n'est pas un objet GeoJSON."), vide();
  const crs = entree["crs"];
  if (crs !== undefined) {
    const nom = objet(crs) && objet(crs["properties"]) ? crs["properties"]["name"] : undefined;
    if (typeof nom === "string" && CRS84.has(nom)) { /* contrat V1 */ }
    else if (typeof nom === "string" && EPSG4326.has(nom)) avert("crs-epsg4326", "Système EPSG:4326 déclaré : lu en longitude puis latitude, comme l'impose RFC 7946.");
    else return erreur("crs-non-pris-en-charge", `Système de coordonnées « ${typeof nom === "string" ? nom : "illisible"} » non pris en charge : seul WGS 84 (CRS84) est accepté, aucune transformation n'est devinée.`), vide();
  }
  let features: unknown[];
  if (entree["type"] === "FeatureCollection" && Array.isArray(entree["features"])) features = entree["features"];
  else if (entree["type"] === "Feature") features = [entree];
  else return erreur("structure", "Type GeoJSON attendu : FeatureCollection ou Feature."), vide();
  if (features.length === 0) return erreur("vide", "Le fichier ne contient aucun objet."), vide();
  if (features.length > limites.objets) return erreur("limite-objets", `${features.length} objets : ${limites.objets} au plus.`), vide();

  const position = (p: unknown): [number, number] | null => {
    if (!Array.isArray(p) || p.length < 2 || p.length > 3 || !p.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    sommets++;
    if (p.length === 3) altitudes++;
    const [lon, lat] = p as number[];
    if (lon! < -180 || lon! > 180 || lat! < -90 || lat! > 90) { horsPlage++; return null; }
    emprise = emprise ? [Math.min(emprise[0], lon!), Math.min(emprise[1], lat!), Math.max(emprise[2], lon!), Math.max(emprise[3], lat!)] : [lon!, lat!, lon!, lat!];
    return [lon!, lat!];
  };
  const liste = (x: unknown, min: number, i: number, quoi: string): [number, number][] | null => {
    if (!Array.isArray(x) || x.length < min) return erreur("structure", `${quoi} : ${min} positions au moins.`, i), null;
    const ps = x.map(position);
    return ps.every((p) => p !== null) ? (ps as [number, number][]) : null;
  };
  const anneau = (x: unknown, i: number): [number, number][] | null => {
    const ps = liste(x, 4, i, "Anneau de polygone");
    if (!ps) return null;
    const [a, b] = [ps[0]!, ps[ps.length - 1]!];
    if (a[0] !== b[0] || a[1] !== b[1]) return erreur("anneau-ouvert", "Anneau de polygone non fermé (première et dernière positions différentes).", i), null;
    return ps;
  };
  const polygone = (x: unknown, i: number) => (Array.isArray(x) && x.length > 0 ? (() => { const r = x.map((a) => anneau(a, i)); return r.every(Boolean) ? r : null; })() : (erreur("structure", "Polygone sans anneau.", i), null));

  const objets: ObjetImporte[] = [];
  features.forEach((f, i) => {
    if (!objet(f) || f["type"] !== "Feature") return void erreur("structure", "Objet : Feature attendu.", i);
    const g = f["geometry"];
    if (!objet(g)) return void erreur("geometrie-absente", "Objet sans géométrie.", i);
    const type = g["type"] as TypeGeometrie;
    if (!TYPES.has(type)) return void erreur("type-non-pris-en-charge", `Géométrie « ${String(g["type"])} » non prise en charge.`, i);
    const c = g["coordinates"];
    const avantHors = horsPlage;
    let coordonnees: unknown = null;
    switch (type) {
      case "Point": coordonnees = position(c); break;
      case "MultiPoint": coordonnees = liste(c, 1, i, "MultiPoint"); break;
      case "LineString": coordonnees = liste(c, 2, i, "Ligne"); break;
      case "MultiLineString": coordonnees = Array.isArray(c) && c.length ? (() => { const r = c.map((l) => liste(l, 2, i, "Ligne")); return r.every(Boolean) ? r : null; })() : null; break;
      case "Polygon": coordonnees = polygone(c, i); break;
      case "MultiPolygon": coordonnees = Array.isArray(c) && c.length ? (() => { const r = c.map((p) => polygone(p, i)); return r.every(Boolean) ? r : null; })() : null; break;
    }
    if (horsPlage > avantHors) return void erreur("hors-plage", "Coordonnées hors des plages géographiques : fichier projeté ou d'origine inconnue, non interprété.", i);
    if (coordonnees === null) {
      if (!diagnostics.some((d) => d.objet === i)) erreur("structure", "Coordonnées illisibles.", i);
      return;
    }
    const props: Record<string, Primitive> = {};
    const brutes = objet(f["properties"]) ? f["properties"] : {};
    let ignorees = 0;
    for (const [k, v] of Object.entries(brutes)) {
      if (Object.keys(props).length >= limites.proprietes || k.length > 64) { ignorees++; continue; }
      if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) props[k] = v as Primitive;
      else if (typeof v === "string") props[k] = v.slice(0, limites.longueurTexte);
      else { ignorees++; continue; }
      nomsProprietes.add(k);
    }
    if (ignorees) avert("proprietes-ignorees", `${ignorees} attribut(s) non primitif(s) ou en surnombre ignoré(s).`, i);
    types[type] = (types[type] ?? 0) + 1;
    objets.push({ geometrie: { type, coordinates: coordonnees }, proprietes: props });
  });
  if (sommets > limites.sommets) erreur("limite-sommets", `${sommets} sommets : ${limites.sommets} au plus.`);
  if (altitudes) avert("altitudes-ignorees", "Altitudes présentes sans référence verticale déclarée : non conservées (GeoData V1 est en deux dimensions).");
  const rapport: RapportImport = { objets: objets.length, sommets, types, emprise, proprietes: [...nomsProprietes].sort(), diagnostics };
  return diagnostics.some((d) => d.niveau === "erreur") ? { ok: false, rapport } : { ok: true, objets, rapport };
}
