/**
 * Terrain haute résolution — logique pure des services numériques (plan v1.0, lot TER-04, Issue #381) : points le long
 * d'une ligne de profil, statistiques dans le polygone réel (trous compris, jamais le rectangle englobant), couleurs des
 * tuiles (aucun bleu pour l'altitude : l'eau est une autre couche), tuiles Web Mercator, exports des courbes (GeoJSON,
 * DXF R12 — TER-D18) avec leurs métadonnées.
 */
import { sansValeur } from "./analyse.js";

/** Points tous les `pas` mètres et à chaque sommet d'une polyligne (repère métrique), avec leur chaînage. */
export function pointsLigne(ligne: readonly (readonly [number, number])[], pas: number, maxPoints = 10_000): { chainage: number; x: number; y: number }[] {
  if (ligne.length < 2) throw new Error("Une ligne de profil a au moins deux sommets.");
  if (!(pas > 0)) throw new Error("Pas d'échantillonnage strictement positif requis.");
  const points: { chainage: number; x: number; y: number }[] = [];
  let chainage = 0;
  const ajouter = (x: number, y: number, ch: number) => {
    if (points.length >= maxPoints) throw new Error(`Profil limité à ${maxPoints} points : traitement de fond requis.`);
    points.push({ chainage: ch, x, y });
  };
  for (let i = 0; i < ligne.length - 1; i++) {
    const [x0, y0] = ligne[i]!;
    const [x1, y1] = ligne[i + 1]!;
    const long = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(long / pas - 1e-9));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      if (k === n) ajouter(x1, y1, chainage + long);
      else ajouter(x0 + ((k * pas) / long) * (x1 - x0), y0 + ((k * pas) / long) * (y1 - y0), chainage + k * pas);
    }
    chainage += long;
  }
  return points;
}

/** Point dans un polygone à trous (règle pair-impair sur tous les anneaux : extérieur puis trous). */
export function dansPolygone(x: number, y: number, anneaux: readonly (readonly (readonly [number, number])[])[]): boolean {
  let dedans = false;
  for (const a of anneaux) {
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i]!;
      const [xj, yj] = a[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  return dedans;
}

export interface StatistiquesZone {
  /** Cellules de la grille dont le centre est dans le polygone. */
  readonly cellulesZone: number;
  /** Parmi elles, cellules avec une valeur (NoData exclu). */
  readonly cellulesValides: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly moyenne: number | null;
  readonly ecartType: number | null;
}

/**
 * Statistiques d'une fenêtre de grille dans un polygone exprimé en coordonnées de grille (colonne, ligne ; coin
 * nord-ouest de la fenêtre) : une cellule compte si son centre est dans le polygone (trous exclus). NoData exclu, jamais
 * compté comme zéro ; aucune valeur → statistiques nulles (« non évaluées »).
 */
export function statistiquesZone(
  g: { readonly largeur: number; readonly hauteur: number; readonly valeurs: ArrayLike<number>; readonly nodata: number | null },
  anneaux: readonly (readonly (readonly [number, number])[])[],
): StatistiquesZone {
  let zone = 0, n = 0, somme = 0, somme2 = 0, min = Infinity, max = -Infinity;
  for (let l = 0; l < g.hauteur; l++) {
    for (let c = 0; c < g.largeur; c++) {
      if (!dansPolygone(c + 0.5, l + 0.5, anneaux)) continue;
      zone++;
      const v = g.valeurs[l * g.largeur + c]!;
      if (sansValeur(v, g.nodata)) continue;
      n++;
      somme += v;
      somme2 += v * v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!n) return { cellulesZone: zone, cellulesValides: 0, min: null, max: null, moyenne: null, ecartType: null };
  const moyenne = somme / n;
  return { cellulesZone: zone, cellulesValides: n, min, max, moyenne, ecartType: Math.sqrt(Math.max(0, somme2 / n - moyenne * moyenne)) };
}

/** Palette d'altitude du vert au blanc par le brun : aucun bleu (une teinte bleue ferait croire à de l'eau). */
export const PALETTE_ALTITUDE = ["#1b5e20", "#4f8f3a", "#a5b85a", "#e9d98b", "#c7a26b", "#8d6744", "#f5f1ea"] as const;
/** Pente en degrés : du clair (plat) au rouge sombre (raide). */
export const PALETTE_PENTE = ["#fff5eb", "#fdd0a2", "#fd8d3c", "#d94801", "#7f2704"] as const;

function hexa(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** Couleur RVBA d'une valeur sur une palette continue entre deux bornes ; sans valeur → transparent. */
export function couleurContinue(v: number | null, min: number, max: number, palette: readonly string[]): [number, number, number, number] {
  if (v === null || !Number.isFinite(v)) return [0, 0, 0, 0];
  const t = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0.5;
  const pos = t * (palette.length - 1);
  const i = Math.min(palette.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexa(palette[i]!), b = hexa(palette[i + 1]!);
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), 255];
}

/** Coin nord-ouest du pixel (px, py) d'une tuile z/x/y Web Mercator (256 px), en degrés WGS 84. */
export function lonLatTuile(z: number, x: number, y: number, px: number, py: number, taille = 256): [number, number] {
  const n = 2 ** z * taille;
  const lon = ((x * taille + px) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y * taille + py)) / n))) * 180) / Math.PI;
  return [lon, lat];
}

/** Taille au sol (m) d'un pixel de tuile Web Mercator à la latitude donnée (sphère de 6 378 137 m). */
export const pasPixelTuile = (z: number, latitudeDeg: number, taille = 256) => (Math.cos((latitudeDeg * Math.PI) / 180) * 2 * Math.PI * 6378137) / (2 ** z * taille);

export interface MetadonneesCourbes {
  readonly source: string;
  readonly version: string;
  readonly produit: string;
  readonly equidistance: number;
  readonly crs: string;
  readonly referenceVerticale: string;
  readonly licence: string;
  readonly attribution: string;
  readonly etiquette: string | null;
  readonly qualite: string;
}

export interface CourbeExport { readonly altitude: number; readonly maitresse: boolean; readonly lignes: readonly (readonly (readonly [number, number])[])[] }

/** GeoJSON (RFC 7946, WGS 84) des courbes, métadonnées en membre étranger `fadi` et dans les propriétés. */
export function geojsonCourbes(courbes: readonly CourbeExport[], m: MetadonneesCourbes): string {
  return JSON.stringify({
    type: "FeatureCollection",
    fadi: { ...m, unite: "m", avertissement: "Altitudes rapportées à la référence verticale indiquée ; aucune conversion faite." },
    features: courbes.map((k) => ({
      type: "Feature",
      properties: { altitude: k.altitude, unite: "m", maitresse: k.maitresse, equidistance: m.equidistance, referenceVerticale: m.referenceVerticale, source: m.source, version: m.version },
      geometry: { type: "MultiLineString", coordinates: k.lignes },
    })),
  });
}

/**
 * DXF R12 ASCII des courbes (TER-D18), coordonnées dans le repère natif de la version : une polyligne 3D par ligne
 * (z = altitude), calques « COURBES_MAITRESSES » et « COURBES_INTERMEDIAIRES » ; repère, référence verticale, source,
 * version, équidistance, licence et attribution écrits en commentaires (groupe 999) — jamais de conversion.
 */
export function dxfCourbes(courbes: readonly CourbeExport[], m: MetadonneesCourbes): string {
  const l: string[] = [];
  const p = (code: number, valeur: string | number) => l.push(String(code), typeof valeur === "number" ? String(valeur) : valeur);
  const commentaires = [
    "Fadi GeoData — courbes de niveau", `Source : ${m.source}`, `Version : ${m.version}`, `Produit : ${m.produit}`, `Repere horizontal : ${m.crs}`,
    `Reference verticale : ${m.referenceVerticale}`, `Equidistance : ${m.equidistance} m`, `Qualite : ${m.qualite}`, `Licence : ${m.licence}`,
    `Attribution : ${m.attribution}`, ...(m.etiquette ? [`Etiquette : ${m.etiquette}`] : []),
  ];
  for (const c of commentaires) p(999, c.replace(/[\r\n]+/g, " "));
  p(0, "SECTION"); p(2, "TABLES"); p(0, "TABLE"); p(2, "LAYER"); p(70, 2);
  for (const [nom, couleur] of [["COURBES_MAITRESSES", 1], ["COURBES_INTERMEDIAIRES", 8]] as const) { p(0, "LAYER"); p(2, nom); p(70, 0); p(62, couleur); p(6, "CONTINUOUS"); }
  p(0, "ENDTAB"); p(0, "ENDSEC");
  p(0, "SECTION"); p(2, "ENTITIES");
  for (const k of courbes) {
    for (const ligne of k.lignes) {
      p(0, "POLYLINE"); p(8, k.maitresse ? "COURBES_MAITRESSES" : "COURBES_INTERMEDIAIRES"); p(66, 1); p(10, 0); p(20, 0); p(30, k.altitude); p(70, 8);
      for (const [x, y] of ligne) { p(0, "VERTEX"); p(8, k.maitresse ? "COURBES_MAITRESSES" : "COURBES_INTERMEDIAIRES"); p(10, x); p(20, y); p(30, k.altitude); p(70, 32); }
      p(0, "SEQEND");
    }
  }
  p(0, "ENDSEC"); p(0, "EOF");
  return l.join("\r\n") + "\r\n";
}
