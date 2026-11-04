/**
 * Services numériques du terrain (plan v1.0, lot TER-04, Issue #381) : sources publiées, valeurs au point, profils,
 * statistiques dans le polygone réel, tuiles d'altitude / pente / ombrage, courbes en tuiles vectorielles, publication et
 * retour arrière. Toujours sur les grilles **numériques** (COG d'altitude, sans rééchantillonnage pour l'analyse ;
 * aperçus seulement pour l'affichage), jamais sur des tuiles colorées.
 *
 * Repères : les points reçus sont en WGS 84 (lon, lat) ; ils sont transformés dans le repère natif de chaque version par
 * PostGIS / PROJ (la même opération que pour les emprises, consignée) ; le chaînage d'un profil est mesuré dans une
 * projection transverse de Mercator locale centrée sur la ligne (déformation négligeable à l'échelle d'un profil).
 * Aucune valeur n'est inventée : hors couverture ou NoData → « indisponible ».
 * Ce module n'ouvre aucun pool : l'appelant fournit la connexion.
 */
import type { PoolClient } from "pg";
import { fromFile, type GeoTIFF } from "geotiff";
import {
  couleurContinue, dateDeDonnees, LIMITES_FOND_MONDIAL, zoomMinimalTuiles, espacementMetrique, lonLatTuile, ordonnerSources, PALETTE_ALTITUDE, PALETTE_PENTE, pasPixelTuile, pointsLigne,
  profil, sansValeur, statistiquesZone, valeurBilineaire, valeurCellule,
  type AcquisitionDistante, type DeclarationTerrain, type DroitsVersion, type EnTeteRaster, type EtatQualite, type ProduitTerrain, type Profil, type RapportQualite,
  type ReferenceVerticale, type SourceAltitude, type StatistiquesZone,
} from "@parcours/geodata-model";
import { encoderPng, pngTransparent } from "../raster.js";
import type { StockageTerrain } from "./stockage.js";
import {
  avecDelai, courbesDistantes, ErreurDistante, oublierDistants, plageDistante, plageDistanteEmprise, statistiquesDistantes, tuileDistante, valeursDistantes,
} from "./fond-mondial.js";

export type Executeur = Pick<PoolClient, "query">;
export class ServiceRefuse extends Error {
  constructor(readonly statut: number, readonly code: string, message: string) { super(message); }
}

/** Dérogation TER-D26 (archivage d'une version distante) accordée par le maître d'ouvrage et portée par l'exploitation. */
export const derogationDistanteAccordee = (env: NodeJS.ProcessEnv = process.env) => env["GEODATA_TERRAIN_DEROGATION_TER_D26"] === "accordee";

/** Fonction terrain activée (drapeau de retour arrière du plan) : `GEODATA_TERRAIN_ENABLED=false` la ferme. */
export const terrainActive = (env: NodeJS.ProcessEnv = process.env) => env["GEODATA_TERRAIN_ENABLED"] !== "false";

/** Limites d'exploitation (TER-D14). */
export const LIMITES_SERVICES = Object.freeze({ cellulesStatistiques: 50_000_000, pointsProfil: 10_000, pixelsExport: 25_000_000, cellulesFenetre: 50_000_000 });

export interface SourceTerrain {
  readonly id: string;
  readonly cle: string;
  readonly titre: string;
  readonly produit: ProduitTerrain;
  readonly niveau: DeclarationTerrain["niveau"];
  readonly etat: string;
  readonly etiquette: string | null;
  readonly attribution: string;
  readonly licence: DeclarationTerrain["licence"];
  readonly droits: DroitsVersion;
  readonly srid: number;
  readonly geographique: boolean;
  /** Pas natif en mètres (pour une grille géographique : au centre de la couverture) et tel que déclaré. */
  readonly pas: number;
  readonly pasDeclare: DeclarationTerrain["pasNatif"];
  readonly referenceVerticale: ReferenceVerticale;
  readonly precisionDeclaree: DeclarationTerrain["precisionDeclaree"];
  readonly precisionMesuree: number | null;
  readonly qualite: { readonly etat: EtatQualite; readonly rmsez: number | null; readonly p95: number | null; readonly n: number };
  readonly date: string | null;
  readonly publieeLe: string;
  readonly doi: string | null;
  /** COG d'altitude du volume (null pour une version distante, lue à la demande). */
  readonly altitude: string | null;
  readonly pente: string | null;
  readonly ombrage: string | null;
  readonly nodata: number | null;
  readonly emprise: readonly [number, number, number, number];
  /** Source distante lue à la demande (fond mondial, TER-09), ou null (version locale du volume). */
  readonly distant: AcquisitionDistante | null;
}

interface LigneSource {
  id: string; cle: string; produit: ProduitTerrain; niveau: DeclarationTerrain["niveau"]; etat: string; declaration: DeclarationTerrain; entete: EnTeteRaster;
  reference_verticale: ReferenceVerticale; nodata: number | null; etiquette: string | null; etat_le: string; srid_natif: number;
  altitude: string | null; pente: string | null; ombrage: string | null; rapport: RapportQualite | null; etat_qualite: EtatQualite | null;
  ouest: number; sud: number; est: number; nord: number; lat: number;
}

const SELECT_SOURCES = `
  SELECT v.id, v.cle, v.produit, v.niveau, v.etat, v.declaration, v.entete, v.reference_verticale, v.nodata, v.etiquette, v.etat_le,
         c.srid_natif, fa.cle_stockage AS altitude, fp.cle_stockage AS pente, fo.cle_stockage AS ombrage,
         q.rapport, q.etat_qualite,
         ST_XMin(c.geom) AS ouest, ST_YMin(c.geom) AS sud, ST_XMax(c.geom) AS est, ST_YMax(c.geom) AS nord, ST_Y(ST_Centroid(c.geom)) AS lat
    FROM geodata_terrain_versions v
    JOIN geodata_terrain_couvertures c ON c.terrain_version_id = v.id
    LEFT JOIN geodata_terrain_fichiers fa ON fa.terrain_version_id = v.id AND fa.role = 'derive' AND fa.nature = 'altitude'
    LEFT JOIN geodata_terrain_fichiers fp ON fp.terrain_version_id = v.id AND fp.role = 'derive' AND fp.nature = 'pente'
    LEFT JOIN geodata_terrain_fichiers fo ON fo.terrain_version_id = v.id AND fo.role = 'derive' AND fo.nature = 'ombrage'
    LEFT JOIN LATERAL (SELECT rapport, etat_qualite FROM geodata_terrain_rapports_qualite r WHERE r.terrain_version_id = v.id ORDER BY r.cree_le DESC, r.id DESC LIMIT 1) q ON true`;
/** Une version servie a son COG d'altitude dans le volume, ou est une source distante lue à la demande (TER-09). */
const SERVIE = `(fa.cle_stockage IS NOT NULL OR v.declaration->'acquisition'->>'methode' = 'distant')`;

function versSource(l: LigneSource): SourceTerrain {
  const d = l.declaration;
  const pasM = l.entete.geographique ? (() => { const e = espacementMetrique(l.lat, l.entete.pas[0], l.entete.pas[1]); return Math.max(e.pasX, e.pasY); })() : l.entete.pas[0];
  const g = l.rapport?.global ?? null;
  return {
    id: l.id, cle: l.cle, titre: d.titre, produit: l.produit, niveau: l.niveau, etat: l.etat, etiquette: l.etiquette, attribution: d.attribution, licence: d.licence,
    droits: d.droits, srid: l.srid_natif, geographique: l.entete.geographique, pas: pasM, pasDeclare: d.pasNatif, referenceVerticale: l.reference_verticale,
    precisionDeclaree: d.precisionDeclaree, precisionMesuree: g?.rmsez ?? null,
    qualite: { etat: l.etat_qualite ?? "non-evaluee", rmsez: g?.rmsez ?? null, p95: g?.p95 ?? null, n: g?.n ?? 0 },
    date: d.version.date, publieeLe: new Date(l.etat_le).toISOString(), doi: d.version.doi, altitude: l.altitude, pente: l.pente, ombrage: l.ombrage, nodata: l.nodata,
    emprise: [l.ouest, l.sud, l.est, l.nord], distant: d.acquisition.methode === "distant" ? d.acquisition : null,
  };
}

/** Versions publiées dont la consultation est autorisée (catalogue commun du terrain), éventuellement d'un produit. */
export async function sourcesPubliees(ex: Executeur, produit?: ProduitTerrain): Promise<SourceTerrain[]> {
  const r = await ex.query<LigneSource>(`${SELECT_SOURCES} WHERE v.etat = 'publie' AND ${SERVIE} AND v.declaration->'droits'->>'consultation' = 'autorise'${produit ? " AND v.produit = $1" : ""}`, produit ? [produit] : []);
  return r.rows.map(versSource);
}

/** Une version publiée et consultable, ou 404 (une version non publiée n'est jamais révélée). */
export async function sourcePubliee(ex: Executeur, id: string): Promise<SourceTerrain> {
  const [l] = (await ex.query<LigneSource>(`${SELECT_SOURCES} WHERE v.id = $1 AND v.etat = 'publie' AND ${SERVIE} AND v.declaration->'droits'->>'consultation' = 'autorise'`, [id])).rows;
  if (!l) throw new ServiceRefuse(404, "not_found", "Version de terrain introuvable.");
  return versSource(l);
}

/** Usage autorisé par les droits de la version, sinon 403 motivé (un droit inconnu bloque). */
export function exigerUsage(s: SourceTerrain, usage: keyof DroitsVersion): void {
  const e = s.droits[usage];
  if (e !== "autorise") throw new ServiceRefuse(403, "usage_refuse", `Usage « ${usage} » ${e === "inconnu" ? "non qualifié" : "refusé"} pour ${s.titre}.`);
}

/** Métadonnées obligatoires de tout résultat numérique (plan : source, version, pas, datum, état de qualité). */
export function metadonnees(s: SourceTerrain) {
  return {
    versionId: s.id, cle: s.cle, titre: s.titre, produit: s.produit, niveau: s.niveau, etiquette: s.etiquette,
    pas: { metres: s.pas, declare: s.pasDeclare }, referenceVerticale: s.referenceVerticale, unite: "m",
    qualite: s.qualite, precisionDeclaree: s.precisionDeclaree, date: s.date, publieeLe: s.publieeLe, attribution: s.attribution, licence: s.licence,
    doi: s.doi, acces: s.distant ? ("a-la-demande" as const) : ("local" as const),
  };
}

// ——— Transformations (PostGIS / PROJ) ———

/**
 * Transforme des points entre deux repères (SRID entier ou chaîne PROJ) par PostGIS `ST_Transform` ; l'ordre est
 * conservé. Les chaînes PROJ ne viennent que de ce module (projection locale), jamais du client.
 */
export async function transformer(ex: Executeur, points: readonly (readonly [number, number])[], de: number | string, vers: number | string): Promise<[number, number][]> {
  if (!points.length) return [];
  const srid = (v: number) => { if (!Number.isInteger(v) || v <= 0) throw new Error("SRID invalide."); return v; };
  const params: unknown[] = [points.map((p) => p[0]), points.map((p) => p[1])];
  const texte = (v: string) => { params.push(v); return `$${params.length}::text`; };
  // Un seul ST_Transform sur un multipoint : l'opération PROJ est construite une fois, pas à chaque point.
  const multi = "ST_Collect(ST_MakePoint(x, y) ORDER BY n)";
  const source = typeof de === "number" ? `ST_SetSRID(${multi}, ${srid(de)})` : multi;
  const expr = typeof de === "number"
    ? (typeof vers === "number" ? `ST_Transform(${source}, ${srid(vers)})` : `ST_Transform(${source}, ${texte(vers)})`)
    : (typeof vers === "number" ? `ST_Transform(${source}, ${texte(de)}, ${srid(vers)})` : `ST_Transform(${source}, ${texte(de)}, ${texte(vers)})`);
  const r = await ex.query<{ x: number; y: number }>(
    `SELECT ST_X(d.geom) AS x, ST_Y(d.geom) AS y FROM (SELECT ${expr} AS m FROM unnest($1::float8[], $2::float8[]) WITH ORDINALITY AS u(x, y, n)) s, ST_Dump(s.m) d ORDER BY d.path[1]`, params);
  if (r.rows.length !== points.length) throw new Error("Transformation : nombre de points inattendu.");
  return r.rows.map((p) => [p.x, p.y]);
}

/** Projection transverse de Mercator locale (WGS 84) centrée sur un point : repère métrique d'un profil. */
export const projectionLocale = (lon: number, lat: number) => `+proj=tmerc +lat_0=${lat} +lon_0=${lon} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`;

// ——— Lecture des COG ———

const ouverts = new Map<string, Promise<GeoTIFF>>();
async function ouvrir(chemin: string): Promise<GeoTIFF> {
  let t = ouverts.get(chemin);
  if (!t) {
    if (ouverts.size >= 16) {
      const [premier, p] = ouverts.entries().next().value as [string, Promise<GeoTIFF>];
      ouverts.delete(premier);
      void p.then(async (x) => { await x.close?.(); }).catch(() => undefined);
    }
    t = fromFile(chemin);
    t.catch(() => ouverts.delete(chemin));
    ouverts.set(chemin, t);
  }
  return t;
}

export interface Georef { readonly ox: number; readonly oy: number; readonly rx: number; readonly ry: number; readonly largeur: number; readonly hauteur: number }

/** Géoréférence de l'image `i` (0 = pleine résolution), origine au coin nord-ouest (« PixelIsPoint » corrigé). */
export async function georef(t: GeoTIFF, i = 0): Promise<Georef & { image: Awaited<ReturnType<GeoTIFF["getImage"]>> }> {
  const base = await t.getImage(0);
  const image = await t.getImage(i);
  const [rx0, ry0] = base.getResolution() as [number, number];
  const [ox0, oy0] = base.getOrigin() as [number, number];
  const pointe = (base.getGeoKeys() ?? {})["GTRasterTypeGeoKey"] === 2;
  const f = base.getWidth() / image.getWidth();
  const fy = base.getHeight() / image.getHeight();
  return { image, ox: ox0 - (pointe ? rx0 / 2 : 0), oy: oy0 - (pointe ? ry0 / 2 : 0), rx: rx0 * f, ry: ry0 * fy, largeur: image.getWidth(), hauteur: image.getHeight() };
}

export interface Fenetre { readonly c0: number; readonly l0: number; readonly largeur: number; readonly hauteur: number; readonly valeurs: ArrayLike<number> }

export async function lireFenetre(t: GeoTIFF, i: number, c0: number, l0: number, c1: number, l1: number, budget: number = LIMITES_SERVICES.cellulesFenetre): Promise<Fenetre | null> {
  const g = await georef(t, i);
  const a = Math.max(0, Math.floor(c0)), b = Math.max(0, Math.floor(l0));
  const c = Math.min(g.largeur, Math.ceil(c1)), d = Math.min(g.hauteur, Math.ceil(l1));
  if (c <= a || d <= b) return null;
  if ((c - a) * (d - b) > budget) throw new ServiceRefuse(413, "trop_grand", `Zone de ${(c - a) * (d - b)} cellules : au-delà de la limite de ${budget} (traitement de fond requis).`);
  const [valeurs] = (await g.image.readRasters({ window: [a, b, c, d], samples: [0] })) as unknown as [ArrayLike<number>];
  return { c0: a, l0: b, largeur: c - a, hauteur: d - b, valeurs };
}

/**
 * Fenêtre lue par tuiles internes décodées et gardées en mémoire (fond mondial, TER-09) : un COG distant a des tuiles
 * internes de 1 024 à 2 048 cellules de côté, décodées en entier à chaque lecture ; les garder (au plus ~256 Mo, éviction
 * du moins récent) évite de redécoder la même tuile pour chaque tuile de carte, chaque point et chaque courbe. Mêmes
 * valeurs que `lireFenetre`, rien n'est rééchantillonné.
 */
const tuilesDecodees = new Map<string, { valeurs: Float32Array | ArrayLike<number>; largeur: number; hauteur: number; octets: number }>();
let octetsDecodes = 0;
const OCTETS_DECODES_MAX = 256 * 1024 * 1024;
export function oublierTuilesDecodees(): void { tuilesDecodees.clear(); octetsDecodes = 0; }
export async function lireFenetreTuilee(t: GeoTIFF, cle: string, i: number, c0: number, l0: number, c1: number, l1: number, budget: number = LIMITES_SERVICES.cellulesFenetre): Promise<Fenetre | null> {
  const g = await georef(t, i);
  const a = Math.max(0, Math.floor(c0)), b = Math.max(0, Math.floor(l0));
  const c = Math.min(g.largeur, Math.ceil(c1)), d = Math.min(g.hauteur, Math.ceil(l1));
  if (c <= a || d <= b) return null;
  if ((c - a) * (d - b) > budget) throw new ServiceRefuse(413, "trop_grand", `Zone de ${(c - a) * (d - b)} cellules : au-delà de la limite de ${budget} (traitement de fond requis).`);
  const tw = g.image.getTileWidth(), th = g.image.getTileHeight();
  if (!(tw > 0 && th > 0) || tw * th > 4_194_304) return lireFenetre(t, i, c0, l0, c1, l1, budget);
  const sortie = new Float32Array((c - a) * (d - b));
  for (let ty = Math.floor(b / th); ty <= Math.floor((d - 1) / th); ty++) {
    for (let tx = Math.floor(a / tw); tx <= Math.floor((c - 1) / tw); tx++) {
      const k = `${cle}|${i}|${tx}|${ty}`;
      let tuile = tuilesDecodees.get(k);
      if (tuile) { tuilesDecodees.delete(k); tuilesDecodees.set(k, tuile); }
      else {
        const x0 = tx * tw, y0 = ty * th, x1 = Math.min(g.largeur, x0 + tw), y1 = Math.min(g.hauteur, y0 + th);
        const [v] = (await g.image.readRasters({ window: [x0, y0, x1, y1], samples: [0] })) as unknown as [ArrayLike<number>];
        tuile = { valeurs: v, largeur: x1 - x0, hauteur: y1 - y0, octets: (x1 - x0) * (y1 - y0) * 4 };
        tuilesDecodees.set(k, tuile);
        octetsDecodes += tuile.octets;
        while (octetsDecodes > OCTETS_DECODES_MAX && tuilesDecodees.size > 1) {
          const [premiere, p] = tuilesDecodees.entries().next().value as [string, { octets: number }];
          tuilesDecodees.delete(premiere);
          octetsDecodes -= p.octets;
        }
      }
      const x0 = tx * tw, y0 = ty * th;
      for (let l = Math.max(b, y0); l < Math.min(d, y0 + tuile.hauteur); l++) {
        for (let col = Math.max(a, x0); col < Math.min(c, x0 + tuile.largeur); col++) sortie[(l - b) * (c - a) + (col - a)] = tuile.valeurs[(l - y0) * tuile.largeur + (col - x0)]!;
      }
    }
  }
  return { c0: a, l0: b, largeur: c - a, hauteur: d - b, valeurs: sortie };
}

/**
 * Valeurs d'altitude aux points (repère natif) : bilinéaire si possible, sinon la cellule ; null hors couverture. Les
 * points sont lus par paquets dont la fenêtre reste petite (≤ 1 M cellules) : un profil ne lit jamais tout le rectangle
 * englobant de la ligne.
 */
export async function valeursNatives(stockage: StockageTerrain | null, s: SourceTerrain, pts: readonly (readonly [number, number])[], ex?: Executeur): Promise<({ valeur: number; methode: "bilineaire" | "cellule" } | null)[]> {
  if (!pts.length) return [];
  if (s.distant) {
    if (!ex) throw new Error("Connexion requise pour une source distante.");
    return valeursDistantes(ex, s, pts);
  }
  if (!stockage || !s.altitude) throw new ServiceRefuse(503, "terrain_indisponible", "Aucun volume terrain configuré sur ce serveur.");
  return valeursDansTiff(await ouvrir(stockage.chemin(s.altitude)), s.nodata, pts);
}

/** Valeurs aux points (repère du COG) d'un GeoTIFF ouvert, par paquets de fenêtres ≤ 1 M cellules. */
export async function valeursDansTiff(t: GeoTIFF, nodata: number | null, pts: readonly (readonly [number, number])[], cleTuilee?: string): Promise<({ valeur: number; methode: "bilineaire" | "cellule" } | null)[]> {
  const g = await georef(t, 0);
  const pix = pts.map(([x, y]) => [(x - g.ox) / g.rx, (y - g.oy) / g.ry] as const);
  const sortie: ({ valeur: number; methode: "bilineaire" | "cellule" } | null)[] = pts.map(() => null);
  const MAX = 1_000_000;
  let debut = 0;
  while (debut < pix.length) {
    let fin = debut, c0 = Infinity, l0 = Infinity, c1 = -Infinity, l1 = -Infinity;
    while (fin < pix.length) {
      const [c, l] = pix[fin]!;
      const n0 = Math.min(c0, c - 1), m0 = Math.min(l0, l - 1), n1 = Math.max(c1, c + 2), m1 = Math.max(l1, l + 2);
      if (fin > debut && (n1 - n0) * (m1 - m0) > MAX) break;
      [c0, l0, c1, l1] = [n0, m0, n1, m1];
      fin++;
    }
    const f = cleTuilee ? await lireFenetreTuilee(t, cleTuilee, 0, c0, l0, c1, l1) : await lireFenetre(t, 0, c0, l0, c1, l1);
    if (f) {
      const grille = { largeur: f.largeur, hauteur: f.hauteur, valeurs: f.valeurs, nodata, pasX: 1, pasY: 1 };
      for (let i = debut; i < fin; i++) {
        const [c, l] = pix[i]!;
        if (c < 0 || l < 0 || c >= g.largeur || l >= g.hauteur) continue;
        const b = valeurBilineaire(grille, c - f.c0, l - f.l0);
        if (b !== null) { sortie[i] = { valeur: b, methode: "bilineaire" }; continue; }
        const v = valeurCellule(grille, c - f.c0, l - f.l0);
        if (v !== null) sortie[i] = { valeur: v, methode: "cellule" };
      }
    }
    debut = fin;
  }
  return sortie;
}

// ——— Point, profil, statistiques ———

export async function altitudePoint(ex: Executeur, stockage: StockageTerrain | null, lon: number, lat: number, produit: ProduitTerrain) {
  // Un point n'a qu'une source : la référence verticale est celle de la première source qui a une valeur au point (aucun
  // mélange possible), jamais celle d'une source qui ne fait que recouvrir le point par son rectangle englobant.
  const sources = ordonnerSourcesTerrain((await sourcesPubliees(ex, produit)).filter((s) => s.droits.calcul === "autorise" && lon >= s.emprise[0] && lon <= s.emprise[2] && lat >= s.emprise[1] && lat <= s.emprise[3]), produit, false);
  // Fond mondial (TER-09) : une source distante injoignable n'écarte pas une source plus grossière ; si aucune autre n'a
  // de valeur, l'altitude est « indisponible » (ou « chargement » si la lecture dépasse le délai), jamais estimée.
  let distante: { etat: "indisponible" | "chargement"; motif: string } | null = null;
  for (const s of sources) {
    const [p] = s.srid === 4326 ? [[lon, lat] as [number, number]] : await transformer(ex, [[lon, lat]], 4326, s.srid);
    let v: { valeur: number; methode: "bilineaire" | "cellule" } | null | undefined;
    try {
      [v] = s.distant ? await avecDelai(valeursNatives(stockage, s, [p!], ex), LIMITES_FOND_MONDIAL.delaiPointMs) : await valeursNatives(stockage, s, [p!], ex);
    } catch (e) {
      if (e instanceof ErreurDistante) { distante ??= { etat: "indisponible", motif: `${s.titre} : ${e.message}` }; continue; }
      if (e instanceof ServiceRefuse && e.code === "chargement") { distante = { etat: "chargement", motif: `${s.titre} : ${e.message}` }; continue; }
      throw e;
    }
    if (v) return { disponible: true as const, lon, lat, altitude: v.valeur, echantillonnage: v.methode, source: metadonnees(s) };
  }
  if (distante) return { disponible: false as const, lon, lat, altitude: null, etat: distante.etat, motif: `Altitude indisponible (jamais estimée) — ${distante.motif}` };
  return { disponible: false as const, lon, lat, altitude: null, etat: "hors-couverture" as const, motif: "Aucune version publiée ne couvre ce point : altitude indisponible (jamais estimée)." };
}

/**
 * Ordre TER-D16 sur les sources du terrain (plus fin, qualité, date des **données**). Avec `uneReference` (profils,
 * plusieurs sources combinées), seules les sources de la référence verticale de la meilleure sont gardées : aucun
 * mélange de références.
 */
function ordonnerSourcesTerrain(sources: readonly SourceTerrain[], produit: ProduitTerrain, uneReference = true): SourceTerrain[] {
  const adapt = (s: SourceTerrain): SourceAltitude => ({
    id: s.id, produit: s.produit, publiee: true, pas: s.pas, precisionMesuree: s.precisionMesuree, precisionDeclaree: s.precisionDeclaree?.verticaleM ?? null,
    date: dateDeDonnees(s.date), referenceVerticale: refCode(s), valeur: () => null,
  });
  const ordre = ordonnerSources(sources.map(adapt), produit, null).map((a) => sources.find((s) => s.id === a.id)!);
  if (!uneReference) return ordre;
  const ref = ordre[0] ? refCode(ordre[0]) : null;
  return ordre.filter((s) => refCode(s) === ref);
}
const refCode = (s: SourceTerrain) => (s.referenceVerticale.statut === "declaree" ? s.referenceVerticale.code ?? s.referenceVerticale.libelle : "non-declaree");

export async function profilTerrain(ex: Executeur, stockage: StockageTerrain | null, ligne: readonly (readonly [number, number])[], pas: number, produit: ProduitTerrain): Promise<{ profil: Profil; lonLat: [number, number][]; sources: ReturnType<typeof metadonnees>[]; referencesEcartees: string[] }> {
  if (ligne.length < 2 || ligne.length > 500) throw new ServiceRefuse(400, "invalid_input", "Ligne de 2 à 500 sommets attendue.");
  if (!(pas >= 0.05 && pas <= 10_000)) throw new ServiceRefuse(400, "invalid_input", "Pas d'échantillonnage entre 0,05 m et 10 km.");
  const [lon0, lat0] = ligne[0]!;
  const proj = projectionLocale(lon0, lat0);
  const locale = await transformer(ex, ligne, 4326, proj);
  let pts;
  try { pts = pointsLigne(locale, pas, LIMITES_SERVICES.pointsProfil); } catch (e) { throw new ServiceRefuse(413, "trop_grand", (e as Error).message); }
  const lonLat = await transformer(ex, pts.map((p) => [p.x, p.y] as const), proj, 4326);
  const [o, s0, e, n] = [Math.min(...lonLat.map((p) => p[0])), Math.min(...lonLat.map((p) => p[1])), Math.max(...lonLat.map((p) => p[0])), Math.max(...lonLat.map((p) => p[1]))];
  const toutes = (await sourcesPubliees(ex, produit)).filter((s) => s.droits.calcul === "autorise" && s.emprise[0] <= e && s.emprise[2] >= o && s.emprise[1] <= n && s.emprise[3] >= s0);
  const ordre = ordonnerSourcesTerrain(toutes, produit);
  const ecartees = toutes.filter((s) => !ordre.includes(s)).map((s) => s.id);
  const valeurs = new Map<string, Map<string, { valeur: number; interpolee: boolean }>>();
  for (const s of ordre) {
    const natifs = await transformer(ex, pts.map((p) => [p.x, p.y] as const), proj, s.srid);
    const v = s.distant ? await avecDelai(valeursNatives(stockage, s, natifs, ex), LIMITES_FOND_MONDIAL.delaiCalculMs).catch(versRefus) : await valeursNatives(stockage, s, natifs, ex);
    const m = new Map<string, { valeur: number; interpolee: boolean }>();
    pts.forEach((p, i) => { const x = v[i]; if (x) m.set(`${p.x},${p.y}`, { valeur: x.valeur, interpolee: x.methode === "bilineaire" }); });
    valeurs.set(s.id, m);
  }
  const sourcesAlt: SourceAltitude[] = ordre.map((s) => ({
    id: s.id, produit: s.produit, publiee: true, pas: s.pas, precisionMesuree: s.precisionMesuree, precisionDeclaree: s.precisionDeclaree?.verticaleM ?? null, date: dateDeDonnees(s.date), referenceVerticale: refCode(s),
    valeur: (x, y) => valeurs.get(s.id)!.get(`${x},${y}`) ?? null,
  }));
  return { profil: profil(locale, pas, sourcesAlt, LIMITES_SERVICES.pointsProfil), lonLat, sources: ordre.map(metadonnees), referencesEcartees: ecartees };
}

/** Statistiques d'altitude dans un polygone WGS 84 (anneaux : extérieur puis trous), sur la version choisie ou la meilleure. */
export async function statistiquesTerrain(ex: Executeur, stockage: StockageTerrain | null, anneaux: readonly (readonly (readonly [number, number])[])[], produit: ProduitTerrain, versionId: string | null): Promise<{ statistiques: StatistiquesZone; surfaceZoneM2: number; surfaceValideM2: number; couvertureValide: number; source: ReturnType<typeof metadonnees> } | { indisponible: true; motif: string }> {
  const geo = JSON.stringify({ type: "Polygon", coordinates: anneaux });
  let s: SourceTerrain | undefined;
  if (versionId) { s = await sourcePubliee(ex, versionId); exigerUsage(s, "calcul"); }
  else {
    const ids = (await ex.query<{ id: string }>(`SELECT terrain_version_id AS id FROM geodata_terrain_couvertures WHERE ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`, [geo])).rows.map((r) => r.id);
    s = ordonnerSourcesTerrain((await sourcesPubliees(ex, produit)).filter((x) => ids.includes(x.id) && x.droits.calcul === "autorise"), produit)[0];
  }
  if (!s) return { indisponible: true, motif: "Aucune version publiée ne recoupe la zone : statistiques indisponibles." };
  const [natif] = (await ex.query<{ g: string; aire: number }>(
    // Surface en m² : géodésique (WGS 84) pour tout repère géographique, plane dans un repère projeté métrique.
    `SELECT ST_AsGeoJSON(t) AS g, CASE WHEN $3 THEN ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) ELSE ST_Area(t) END AS aire
       FROM (SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), $2::int) AS t) x`, [geo, s.srid, s.geographique])).rows;
  const anneauxNatifs = (JSON.parse(natif!.g) as { coordinates: [number, number][][] }).coordinates;
  if (s.distant) {
    // Fond mondial (TER-09) : grille native de chaque dalle, dans le polygone réel, budget de cellules lues à la demande.
    const r = await avecDelai(statistiquesDistantes(ex, s, anneauxNatifs), LIMITES_FOND_MONDIAL.delaiCalculMs).catch(versRefus);
    const surfaceValide = r.statistiques.cellulesValides * r.aireCellule;
    return { statistiques: r.statistiques, surfaceZoneM2: natif!.aire, surfaceValideM2: surfaceValide, couvertureValide: natif!.aire > 0 ? Math.min(1, surfaceValide / natif!.aire) : 0, source: metadonnees(s) };
  }
  if (!stockage || !s.altitude) throw new ServiceRefuse(503, "terrain_indisponible", "Aucun volume terrain configuré sur ce serveur.");
  const t = await ouvrir(stockage.chemin(s.altitude));
  const g = await georef(t, 0);
  const pix = anneauxNatifs.map((a) => a.map(([x, y]) => [(x - g.ox) / g.rx, (y - g.oy) / g.ry] as [number, number]));
  const tous = pix.flat();
  const f = await lireFenetre(t, 0, Math.min(...tous.map((p) => p[0])), Math.min(...tous.map((p) => p[1])), Math.max(...tous.map((p) => p[0])), Math.max(...tous.map((p) => p[1])), LIMITES_SERVICES.cellulesStatistiques);
  const vide: StatistiquesZone = { cellulesZone: 0, cellulesValides: 0, min: null, max: null, moyenne: null, ecartType: null };
  const statistiques = f ? statistiquesZone({ largeur: f.largeur, hauteur: f.hauteur, valeurs: f.valeurs, nodata: s.nodata }, pix.map((a) => a.map(([c, l]) => [c - f.c0, l - f.l0] as [number, number]))) : vide;
  const aireCellule = s.geographique ? (() => { const e = espacementMetrique((s.emprise[1] + s.emprise[3]) / 2, Math.abs(g.rx), Math.abs(g.ry)); return e.pasX * e.pasY; })() : Math.abs(g.rx * g.ry);
  const surfaceValideM2 = statistiques.cellulesValides * aireCellule;
  return { statistiques, surfaceZoneM2: natif!.aire, surfaceValideM2, couvertureValide: natif!.aire > 0 ? Math.min(1, surfaceValideM2 / natif!.aire) : 0, source: metadonnees(s) };
}

// ——— Tuiles ———

export type StyleTuile = "altitude" | "pente" | "ombrage";
const plages = new Map<string, [number, number]>();
const cacheTuiles = new Map<string, Buffer>();

/** Plage verrouillée de la légende d'altitude : min et max du plus petit aperçu (portée : la version entière). */
export async function plageVersion(stockage: StockageTerrain | null, s: SourceTerrain, ex?: Executeur): Promise<[number, number] | null> {
  const deja = plages.get(s.id);
  if (deja) return deja;
  if (s.distant) {
    if (!ex) return null;
    const p = await plageDistante(ex, s);
    if (p) plages.set(s.id, p);
    return p;
  }
  if (!stockage || !s.altitude) return null;
  const t = await ouvrir(stockage.chemin(s.altitude));
  const n = await t.getImageCount();
  const image = await t.getImage(n - 1);
  const [v] = (await image.readRasters({ samples: [0] })) as unknown as [ArrayLike<number>];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < v.length; i++) { const x = v[i]!; if (sansValeur(x, s.nodata)) continue; if (x < min) min = x; if (x > max) max = x; }
  const p: [number, number] = Number.isFinite(min) ? [min, max] : [0, 1];
  plages.set(s.id, p);
  return p;
}

/**
 * Plage d'altitude d'une emprise WGS 84 pour la légende adaptée à la vue (TER-09) : lue sur l'aperçu le plus proche d'un
 * écran (≈ 512 cellules de large), couleur seulement, portée « vue courante ». null si aucune valeur dans la vue.
 */
export async function plageEmprise(ex: Executeur, stockage: StockageTerrain | null, s: SourceTerrain, e: readonly [number, number, number, number]): Promise<[number, number] | null> {
  const [o, sd, es, n] = [Math.max(e[0], s.emprise[0]), Math.max(e[1], s.emprise[1]), Math.min(e[2], s.emprise[2]), Math.min(e[3], s.emprise[3])];
  if (!(es > o && n > sd)) return null;
  if (s.distant) return avecDelai(plageDistanteEmprise(ex, s, [o, sd, es, n]), LIMITES_FOND_MONDIAL.delaiTuileMs).catch(versRefus);
  if (!stockage || !s.altitude) throw new ServiceRefuse(503, "terrain_indisponible", "Aucun volume terrain configuré sur ce serveur.");
  const coins = s.srid === 4326 ? [[o, sd], [es, sd], [es, n], [o, n]] as [number, number][] : await transformer(ex, [[o, sd], [es, sd], [es, n], [o, n]], 4326, s.srid);
  const xs = coins.map((p) => p[0]);
  const t = await ouvrir(stockage.chemin(s.altitude));
  const cible = (Math.max(...xs) - Math.min(...xs)) / 512;
  const nb = await t.getImageCount();
  let niveau = 0;
  for (let i = 1; i < nb; i++) { const gi = await georef(t, i); if (Math.abs(gi.rx) <= cible) niveau = i; }
  const g = await georef(t, niveau);
  const px = coins.map(([x, y]) => [(x - g.ox) / g.rx, (y - g.oy) / g.ry] as const);
  const f = await lireFenetre(t, niveau, Math.min(...px.map((p) => p[0])), Math.min(...px.map((p) => p[1])), Math.max(...px.map((p) => p[0])), Math.max(...px.map((p) => p[1])), 4_000_000);
  if (!f) return null;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < f.valeurs.length; i++) { const v = f.valeurs[i]!; if (sansValeur(v, s.nodata)) continue; if (v < min) min = v; if (v > max) max = v; }
  return Number.isFinite(min) ? [min, max] : null;
}

/** Tuile PNG 256 × 256 (Web Mercator) d'une version : altitude (palette sans bleu), pente ou ombrage ; transparente hors couverture. */
export async function tuileTerrain(ex: Executeur, stockage: StockageTerrain | null, s: SourceTerrain, style: StyleTuile, z: number, x: number, y: number, plage: [number, number] | null): Promise<Buffer> {
  const [o, n] = lonLatTuile(z, x, y, 0, 0);
  const [e, sud] = lonLatTuile(z, x, y, 256, 256);
  if (e < s.emprise[0] || o > s.emprise[2] || n < s.emprise[1] || sud > s.emprise[3]) return pngTransparent();
  if (s.distant && z < zoomMinimalTuiles(s.distant)) return pngTransparent();
  const lue = style === "altitude" && !plage ? await plageVersion(stockage, s, ex) : null;
  if (style === "altitude" && !plage && !lue) throw new ServiceRefuse(422, "plage_requise", "Plage d'altitude de la version non évaluée (source mondiale en dalles) : légende adaptée à la vue ou à une zone requise.");
  const plageEff = style === "altitude" ? (plage ?? lue)! : style === "pente" ? ([0, 45] as [number, number]) : ([1, 255] as [number, number]);
  const cle = `${s.id}|${style}|${plageEff.join(",")}|${z}/${x}/${y}`;
  const deja = cacheTuiles.get(cle);
  if (deja) return deja;
  if (s.distant) {
    const rgba = await avecDelai(tuileDistante(ex, s, style, z, x, y, (px, py) => lonLatTuile(z, x, y, px, py), plageEff), LIMITES_FOND_MONDIAL.delaiTuileMs).catch(versRefus);
    const png = rgba ? encoderPng(rgba, 256, 256) : pngTransparent();
    if (cacheTuiles.size >= 512) cacheTuiles.delete(cacheTuiles.keys().next().value!);
    cacheTuiles.set(cle, png);
    return png;
  }
  if (!stockage) throw new ServiceRefuse(503, "terrain_indisponible", "Aucun volume terrain configuré sur ce serveur.");
  const fichier = style === "altitude" ? s.altitude : style === "pente" ? s.pente : s.ombrage;
  if (!fichier) throw new ServiceRefuse(404, "not_found", "Dérivé absent pour cette version.");
  // Grille de contrôle 9 × 9 transformée par PostGIS, interpolée bilinéairement dans la tuile.
  const N = 9;
  const controle: [number, number][] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) controle.push(lonLatTuile(z, x, y, (i * 256) / (N - 1), (j * 256) / (N - 1)));
  const natifs = await transformer(ex, controle, 4326, s.srid);
  const t = await ouvrir(stockage.chemin(fichier));
  // Aperçu : le plus grossier dont le pas reste au plus celui d'un pixel de tuile.
  const cible = pasPixelTuile(z, (n + sud) / 2) / (s.geographique ? 111_320 : 1);
  const nb = await t.getImageCount();
  let niveau = 0;
  for (let i = 1; i < nb; i++) { const g = await georef(t, i); if (Math.abs(g.rx) <= cible) niveau = i; }
  const g = await georef(t, niveau);
  const px = natifs.map(([a, b]) => [(a - g.ox) / g.rx, (b - g.oy) / g.ry] as const);
  const f = await lireFenetre(t, niveau, Math.min(...px.map((p) => p[0])) - 1, Math.min(...px.map((p) => p[1])) - 1, Math.max(...px.map((p) => p[0])) + 2, Math.max(...px.map((p) => p[1])) + 2, 16_000_000);
  if (!f) return pngTransparent();
  const nodata = style === "altitude" ? s.nodata : style === "pente" ? -9999 : 0;
  const rgba = new Uint8Array(256 * 256 * 4);
  for (let py = 0; py < 256; py++) {
    const v = ((py + 0.5) / 256) * (N - 1);
    const j0 = Math.min(N - 2, Math.floor(v)), tv = v - j0;
    for (let qx = 0; qx < 256; qx++) {
      const u = ((qx + 0.5) / 256) * (N - 1);
      const i0 = Math.min(N - 2, Math.floor(u)), tu = u - i0;
      const p = (jj: number, ii: number) => px[jj * N + ii]!;
      const c = (1 - tu) * (1 - tv) * p(j0, i0)[0] + tu * (1 - tv) * p(j0, i0 + 1)[0] + (1 - tu) * tv * p(j0 + 1, i0)[0] + tu * tv * p(j0 + 1, i0 + 1)[0];
      const l = (1 - tu) * (1 - tv) * p(j0, i0)[1] + tu * (1 - tv) * p(j0, i0 + 1)[1] + (1 - tu) * tv * p(j0 + 1, i0)[1] + tu * tv * p(j0 + 1, i0 + 1)[1];
      const cc = Math.floor(c) - f.c0, ll = Math.floor(l) - f.l0;
      if (cc < 0 || ll < 0 || cc >= f.largeur || ll >= f.hauteur || c < 0 || l < 0 || c >= g.largeur || l >= g.hauteur) continue;
      const val = f.valeurs[ll * f.largeur + cc]!;
      if (sansValeur(val, nodata)) continue;
      const k = (py * 256 + qx) * 4;
      if (style === "ombrage") { rgba[k] = rgba[k + 1] = rgba[k + 2] = val; rgba[k + 3] = 255; }
      else rgba.set(couleurContinue(val, plageEff[0], plageEff[1], style === "altitude" ? PALETTE_ALTITUDE : PALETTE_PENTE), k);
    }
  }
  const png = encoderPng(rgba, 256, 256);
  if (cacheTuiles.size >= 512) cacheTuiles.delete(cacheTuiles.keys().next().value!);
  cacheTuiles.set(cle, png);
  return png;
}

/** Oublie les caches d'une version (publication, retour arrière, retrait) : l'invalidation suit les versions. */
export function invaliderCaches(): void {
  plages.clear();
  cacheTuiles.clear();
  courbesMondiales.clear();
  oublierTuilesDecodees();
  oublierDistants();
}

/** Une `ErreurDistante` devient une réponse motivée (503 « indisponible », 404 hors couverture jamais : null). */
export function versRefus(e: unknown): never {
  if (e instanceof ErreurDistante) throw new ServiceRefuse(e.etat === "budget" ? 429 : 503, e.etat === "budget" ? "budget_distant" : "source_distante_indisponible", e.message);
  throw e;
}

// ——— Courbes du fond mondial (calculées à la demande, TER-09) ———

const courbesMondiales = new Map<string, Buffer>();

/** Tuile vectorielle (MVT, couche « courbes ») d'une version distante, calculée sur la grille native, encodée par PostGIS. */
export async function tuileCourbesDistante(ex: Executeur, s: SourceTerrain, z: number, x: number, y: number, equidistance: number, reference: string): Promise<Buffer> {
  const cle = `${s.id}|${equidistance}|${z}/${x}/${y}`;
  const deja = courbesMondiales.get(cle);
  if (deja) return deja;
  const [o, n] = lonLatTuile(z, x, y, -16, -16);
  const [e, sud] = lonLatTuile(z, x, y, 272, 272);
  const courbes = await avecDelai(courbesDistantes(ex, s, z, [o, sud, e, n], equidistance), LIMITES_FOND_MONDIAL.delaiTuileMs).catch(versRefus);
  let mvt: Buffer = Buffer.alloc(0);
  if (courbes.length) {
    const [r] = (await ex.query<{ mvt: Buffer }>(
      `WITH b AS (SELECT ST_TileEnvelope($1, $2, $3) AS e),
            m AS (SELECT ST_AsMVTGeom(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(f->>'g'), 4326), 3857), b.e, 4096, 64, true) AS geom,
                         (f->>'a')::float8 AS altitude, (f->>'m')::boolean AS maitresse, $5::float8 AS equidistance, $6::text AS reference
                    FROM jsonb_array_elements($4::jsonb) f, b)
       SELECT ST_AsMVT(m.*, 'courbes', 4096, 'geom') AS mvt FROM m WHERE m.geom IS NOT NULL`,
      [z, x, y, JSON.stringify(courbes.map((k) => ({ a: k.altitude, m: k.maitresse, g: { type: "MultiLineString", coordinates: k.lignes } }))), equidistance, reference])).rows;
    mvt = r?.mvt ?? Buffer.alloc(0);
  }
  if (courbesMondiales.size >= 512) courbesMondiales.delete(courbesMondiales.keys().next().value!);
  courbesMondiales.set(cle, mvt);
  return mvt;
}

// ——— Publication et retour arrière ———

/**
 * Publie une version acceptée, ou republie une version remplacée (retour arrière du plan) ; la version publiée du même
 * jeu devient « remplacée ». Rien n'est effacé ; caches invalidés.
 */
export async function publierVersion(c: PoolClient, id: string, par: string, motif: string): Promise<{ remplacee: string | null }> {
  if (!motif || motif.trim().length < 10) throw new ServiceRefuse(400, "invalid_input", "Motif écrit requis (10 caractères au moins).");
  await c.query("BEGIN");
  try {
    const [v] = (await c.query<{ cle: string; etat: string; methode: string | null }>("SELECT cle, etat, declaration->'acquisition'->>'methode' AS methode FROM geodata_terrain_versions WHERE id = $1 FOR UPDATE", [id])).rows;
    if (!v) throw new ServiceRefuse(404, "not_found", "Version de terrain introuvable.");
    // Version distante (TER-09) : aucun fichier n'est archivé tel quel (D-GD-29) ; sa publication attend la dérogation
    // TER-D26 accordée par écrit par le maître d'ouvrage, portée par l'exploitation (GEODATA_TERRAIN_DEROGATION_TER_D26).
    if (v.methode === "distant" && !derogationDistanteAccordee()) {
      throw new ServiceRefuse(409, "derogation_requise", "Version distante (fond mondial) : la source n'est pas archivée telle quelle (D-GD-29). Publication refusée tant que la dérogation TER-D26 n'est pas accordée (GEODATA_TERRAIN_DEROGATION_TER_D26=accordee après la décision écrite du maître d'ouvrage).");
    }
    if (v.etat !== "accepte" && v.etat !== "remplace") throw new ServiceRefuse(409, "etat_incompatible", `Version en état « ${v.etat} » : seule une version acceptée (ou remplacée, pour un retour arrière) se publie.`);
    const [{ n }] = (await c.query<{ n: number }>("SELECT count(*)::int AS n FROM geodata_terrain_couvertures WHERE terrain_version_id = $1", [id])).rows as [{ n: number }];
    if (!n) throw new ServiceRefuse(409, "etat_incompatible", "Version sans dérivés ni couverture : la traiter avant de la publier.");
    const [actuelle] = (await c.query<{ id: string }>("SELECT id FROM geodata_terrain_versions WHERE cle = $1 AND etat = 'publie' FOR UPDATE", [v.cle])).rows;
    if (actuelle) {
      await c.query("UPDATE geodata_terrain_versions SET etat = 'remplace', etat_le = now() WHERE id = $1", [actuelle.id]);
      await c.query("INSERT INTO geodata_terrain_evenements (terrain_version_id, de, vers, motif, acteur_id) VALUES ($1, 'publie', 'remplace', $2, $3)", [actuelle.id, `Remplacée par ${id}`, par]);
    }
    await c.query("UPDATE geodata_terrain_versions SET etat = 'publie', etat_le = now() WHERE id = $1", [id]);
    await c.query("INSERT INTO geodata_terrain_evenements (terrain_version_id, de, vers, motif, acteur_id) VALUES ($1, $2, 'publie', $3, $4)", [id, v.etat, motif, par]);
    await c.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, $2, $3, 'succes', $4)",
      [par, v.etat === "remplace" ? "terrain.retour-arriere" : "terrain.publication", id, JSON.stringify({ remplacee: actuelle?.id ?? null })]);
    await c.query("COMMIT");
    invaliderCaches();
    return { remplacee: actuelle?.id ?? null };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}
