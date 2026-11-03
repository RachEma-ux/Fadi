/**
 * Lecture à la demande des versions de terrain « distantes » (fond mondial, TER-09, Issue #381) par l'API : chaque COG
 * distant (adresse unique ou dalle 1° × 1°) est ouvert par geotiff à travers le service `terrain-distant` (cache local,
 * liste fermée, budget), **dans l'emprise demandée seulement**. Mêmes calculs et mêmes métadonnées que pour une version
 * locale : altitude au point (bilinéaire, sinon la cellule), profil, statistiques dans le polygone réel, tuiles
 * d'altitude / pente / ombrage (aperçus pour l'affichage seulement), courbes calculées sur la grille numérique.
 *
 * Toute source distante est en EPSG:4326 (contrôlé par la fiche) : les coordonnées natives sont la longitude et la
 * latitude WGS 84 ; aucune reprojection à la demande. Hors couverture → null (« indisponible ») ; service ou origine
 * injoignable, budget atteint, source modifiée → `ErreurDistante` ; délai dépassé → `ServiceRefuse` 503 « chargement ».
 */
import { fromCustomClient, type GeoTIFF } from "geotiff";
import {
  couleurContinue, courbesDeNiveau, dallesEmprise, empriseDalle, EQUIDISTANCES, espacementMetrique, LIMITES_FOND_MONDIAL, latitudeMercator, memeSource, nomDalle, ombrage,
  PALETTE_ALTITUDE, PALETTE_PENTE, pente, sansValeur, statistiquesZone, verifierEquidistance, type AcquisitionDistante, type EpinglageDistant, type StatistiquesZone,
} from "@parcours/geodata-model";
import { adresseServiceDistant, ClientServiceDistant, ErreurDistante, TAILLE_BLOC } from "./distant.js";
import { georef, lireFenetreTuilee, ServiceRefuse, valeursDansTiff, type Executeur, type SourceTerrain } from "./services.js";
import { equidistanceExigeeVersion } from "./traitement.js";

export { ErreurDistante };

/** Attend `p` au plus `ms` ; au-delà, « chargement » (503) — la lecture continue et remplit le cache. */
export async function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  let minuterie: NodeJS.Timeout | undefined;
  const delai = new Promise<never>((_, rejeter) => {
    minuterie = setTimeout(() => rejeter(new ServiceRefuse(503, "chargement", "Lecture de la source distante en cours : réessayer dans un instant.")), ms);
  });
  try { return await Promise.race([p, delai]); } finally { clearTimeout(minuterie); }
}

const acq = (s: SourceTerrain): AcquisitionDistante => {
  if (!s.distant) throw new Error("Version locale : aucune lecture distante.");
  return s.distant;
};

// ——— Épinglage par version (traçabilité : une version publiée ne change jamais de contenu en silence) ———

const epingles = new Map<string, EpinglageDistant>();
async function epingler(ex: Executeur, versionId: string, url: string, dalle: string | null, e: EpinglageDistant): Promise<void> {
  const k = `${versionId}|${url}`;
  const vu = epingles.get(k);
  const refus = () => new ErreurDistante("source-modifiee", "La source distante a changé depuis sa première lecture pour cette version (ETag, date ou taille) : valeurs refusées, aucune substitution. Une nouvelle version de catalogue est requise.");
  if (vu) { if (!memeSource(vu, e)) throw refus(); return; }
  await ex.query(
    `INSERT INTO geodata_terrain_sources_distantes (terrain_version_id, url, dalle, etag, last_modified, taille) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (terrain_version_id, url) DO NOTHING`, [versionId, url, dalle, e.etag, e.lastModified, e.taille]);
  const [r] = (await ex.query<{ etag: string | null; last_modified: string | null; taille: string }>(
    "SELECT etag, last_modified, taille FROM geodata_terrain_sources_distantes WHERE terrain_version_id = $1 AND url = $2", [versionId, url])).rows;
  const pin: EpinglageDistant = { etag: r?.etag ?? null, lastModified: r?.last_modified ?? null, taille: Number(r?.taille ?? -1) };
  if (!memeSource(pin, e)) throw refus();
  epingles.set(k, pin);
}

// ——— Ouverture des COG distants ———

interface Ouvert { readonly tiff: GeoTIFF | null; readonly client: ClientServiceDistant | null; readonly le: number }
const ouverts = new Map<string, Promise<Ouvert>>();
const HORS_COUVERTURE_MS = 3_600_000;

/** Oublie les COG distants ouverts (publication, retour arrière, tests). */
export function oublierDistants(): void {
  ouverts.clear();
  epingles.clear();
}

async function ouvrir(ex: Executeur, s: SourceTerrain, dalle: string | null): Promise<Ouvert> {
  const k = `${s.id}|${dalle ?? "-"}`;
  const deja = ouverts.get(k);
  if (deja) {
    const o = await deja.catch(() => null);
    if (o && (o.tiff || Date.now() - o.le < HORS_COUVERTURE_MS)) return o;
    ouverts.delete(k);
  }
  const base = adresseServiceDistant();
  if (!base) throw new ErreurDistante("indisponible", "Lecture distante non configurée sur ce serveur (service terrain-distant absent) : fond mondial indisponible.");
  if (ouverts.size >= 48) ouverts.delete(ouverts.keys().next().value!);
  const client = new ClientServiceDistant(base, s.cle, dalle, (url, e) => epingler(ex, s.id, url, dalle, e));
  const p = (async (): Promise<Ouvert> => {
    try {
      return { tiff: await fromCustomClient(client, { blockSize: TAILLE_BLOC, cacheSize: 64 } as Parameters<typeof fromCustomClient>[1]), client, le: Date.now() };
    } catch (e) {
      const err = client.derniereErreur ?? (e instanceof ErreurDistante ? e : null);
      if (err?.etat === "hors-couverture") return { tiff: null, client: null, le: Date.now() };
      throw err ?? new ErreurDistante("indisponible", `En-tête distant illisible (${(e as Error).message}).`);
    }
  })();
  ouverts.set(k, p);
  p.catch(() => ouverts.delete(k));
  return p;
}

/** Exécute une lecture geotiff sur un COG distant ; null hors couverture ; l'état réel du refus est relu sur le client. */
async function surDalle<T>(ex: Executeur, s: SourceTerrain, dalle: string | null, f: (t: GeoTIFF) => Promise<T>): Promise<T | null> {
  const o = await ouvrir(ex, s, dalle);
  if (!o.tiff || !o.client) return null;
  o.client.derniereErreur = null;
  try {
    return await f(o.tiff);
  } catch (e) {
    if (e instanceof ServiceRefuse) throw e;
    const err = o.client.derniereErreur as ErreurDistante | null;
    if (err?.etat === "hors-couverture") return null;
    throw err ?? (e instanceof ErreurDistante ? e : new ErreurDistante("indisponible", `Lecture distante en échec (${(e as Error).message}).`));
  }
}

/** Dalles (ou `[null]`) d'une source pour une emprise ; refus motivé au-delà du budget d'une requête. */
function dalles(s: SourceTerrain, emprise: readonly [number, number, number, number], max: number = LIMITES_FOND_MONDIAL.dallesParRequete): (string | null)[] {
  try { return dallesEmprise(acq(s), emprise, max); } catch (e) { throw new ServiceRefuse(413, "trop_grand", (e as Error).message); }
}

const empriseDe = (s: SourceTerrain, dalle: string | null): [number, number, number, number] =>
  dalle === null ? [acq(s).emprise.ouest, acq(s).emprise.sud, acq(s).emprise.est, acq(s).emprise.nord] : empriseDalle(dalle);

// ——— Point et profil ———

/** Valeurs aux points (lon, lat) : bilinéaire si possible, sinon la cellule ; null hors couverture ou NoData. */
export async function valeursDistantes(ex: Executeur, s: SourceTerrain, pts: readonly (readonly [number, number])[]): Promise<({ valeur: number; methode: "bilineaire" | "cellule" } | null)[]> {
  const a = acq(s);
  const groupes = new Map<string, number[]>();
  pts.forEach(([x, y], i) => {
    if (x < a.emprise.ouest || x > a.emprise.est || y < a.emprise.sud || y > a.emprise.nord) return;
    const d = a.dalles === null ? "-" : nomDalle(Math.min(x, 179.999999), Math.min(y, 89.999999));
    groupes.set(d, [...(groupes.get(d) ?? []), i]);
  });
  if (groupes.size > LIMITES_FOND_MONDIAL.dallesParRequete * 4) throw new ServiceRefuse(413, "trop_grand", `Ligne sur ${groupes.size} dalles distantes : au-delà de ${LIMITES_FOND_MONDIAL.dallesParRequete * 4}.`);
  const sortie: ({ valeur: number; methode: "bilineaire" | "cellule" } | null)[] = pts.map(() => null);
  for (const [d, indices] of groupes) {
    const r = await surDalle(ex, s, d === "-" ? null : d, (t) => valeursDansTiff(t, s.nodata, indices.map((i) => pts[i]!), `${s.id}|${d}`));
    if (r) indices.forEach((i, k) => { sortie[i] = r[k] ?? null; });
  }
  return sortie;
}

// ——— Statistiques dans le polygone réel ———

export async function statistiquesDistantes(ex: Executeur, s: SourceTerrain, anneaux: readonly (readonly (readonly [number, number])[])[]): Promise<{ statistiques: StatistiquesZone; aireCellule: number }> {
  const tous = anneaux.flat();
  const e: [number, number, number, number] = [Math.min(...tous.map((p) => p[0])), Math.min(...tous.map((p) => p[1])), Math.max(...tous.map((p) => p[0])), Math.max(...tous.map((p) => p[1]))];
  let zone = 0, n = 0, somme = 0, somme2 = 0, min = Infinity, max = -Infinity, cellules = 0, aireCellule = 0;
  for (const d of dalles(s, e)) {
    const r = await surDalle(ex, s, d, async (t) => {
      const g = await georef(t, 0);
      const [o, sd, es, nd] = empriseDe(s, d);
      const [x0, y0, x1, y1] = [Math.max(e[0], o), Math.max(e[1], sd), Math.min(e[2], es), Math.min(e[3], nd)];
      if (!(x1 > x0 && y1 > y0)) return null;
      const c0 = Math.floor((x0 - g.ox) / g.rx), c1 = Math.ceil((x1 - g.ox) / g.rx), l0 = Math.floor((y1 - g.oy) / g.ry), l1 = Math.ceil((y0 - g.oy) / g.ry);
      cellules += Math.max(0, c1 - c0) * Math.max(0, l1 - l0);
      if (cellules > LIMITES_FOND_MONDIAL.cellulesStatistiques) throw new ServiceRefuse(413, "trop_grand", `Zone de plus de ${LIMITES_FOND_MONDIAL.cellulesStatistiques} cellules lues à la demande : réduire la zone.`);
      const f = await lireFenetreTuilee(t, `${s.id}|${d ?? "-"}`, 0, c0, l0, c1, l1, LIMITES_FOND_MONDIAL.cellulesStatistiques);
      if (!f) return null;
      const ea = espacementMetrique((y0 + y1) / 2, Math.abs(g.rx), Math.abs(g.ry));
      aireCellule = ea.pasX * ea.pasY;
      const pix = anneaux.map((a) => a.map(([x, y]) => [(x - g.ox) / g.rx - f.c0, (y - g.oy) / g.ry - f.l0] as [number, number]));
      // Une cellule appartient à la dalle qui la contient : la fenêtre ne dépasse jamais l'emprise de la dalle.
      return statistiquesZone({ largeur: f.largeur, hauteur: f.hauteur, valeurs: f.valeurs, nodata: s.nodata }, pix);
    });
    if (!r) continue;
    zone += r.cellulesZone;
    if (!r.cellulesValides || r.moyenne === null) continue;
    n += r.cellulesValides;
    somme += r.moyenne * r.cellulesValides;
    somme2 += r.cellulesValides * ((r.ecartType ?? 0) ** 2 + r.moyenne ** 2);
    min = Math.min(min, r.min!);
    max = Math.max(max, r.max!);
  }
  if (!n) return { statistiques: { cellulesZone: zone, cellulesValides: 0, min: null, max: null, moyenne: null, ecartType: null }, aireCellule };
  const moyenne = somme / n;
  return { statistiques: { cellulesZone: zone, cellulesValides: n, min, max, moyenne, ecartType: Math.sqrt(Math.max(0, somme2 / n - moyenne * moyenne)) }, aireCellule };
}

// ——— Plage de la légende verrouillée ———

/** Plage de la version : plus petit aperçu de l'adresse unique ; null pour une source en dalles (jamais lue en entier). */
export async function plageDistante(ex: Executeur, s: SourceTerrain): Promise<[number, number] | null> {
  if (acq(s).dalles !== null) return null;
  return surDalle(ex, s, null, async (t) => {
    const nb = await t.getImageCount();
    const image = await t.getImage(nb - 1);
    if (image.getWidth() * image.getHeight() > 4_000_000) return null;
    const [v] = (await image.readRasters({ samples: [0] })) as unknown as [ArrayLike<number>];
    let min = Infinity, mx = -Infinity;
    for (let i = 0; i < v.length; i++) { const x = v[i]!; if (sansValeur(x, s.nodata)) continue; if (x < min) min = x; if (x > mx) mx = x; }
    return Number.isFinite(min) ? ([min, mx] as [number, number]) : null;
  });
}

// ——— Tuiles d'image ———

interface FenetreDalle { readonly ox: number; readonly oy: number; readonly rx: number; readonly ry: number; readonly c0: number; readonly l0: number; readonly largeur: number; readonly hauteur: number; readonly valeurs: ArrayLike<number>; readonly borne: readonly [number, number, number, number] }

/** Fenêtres des dalles qui recoupent une emprise, au niveau d'aperçu le plus grossier dont le pas reste ≤ `pasDeg`. */
async function fenetres(ex: Executeur, s: SourceTerrain, e: readonly [number, number, number, number], pasDeg: number | null, marge: number, max: number): Promise<FenetreDalle[]> {
  const sortie: FenetreDalle[] = [];
  for (const d of dalles(s, e, max)) {
    const r = await surDalle(ex, s, d, async (t) => {
      const nb = await t.getImageCount();
      let niveau = 0;
      if (pasDeg !== null) for (let i = 1; i < nb; i++) { const gi = await georef(t, i); if (Math.abs(gi.rx) <= pasDeg) niveau = i; }
      const g = await georef(t, niveau);
      const borne = empriseDe(s, d);
      const [x0, y0, x1, y1] = [Math.max(e[0], borne[0]), Math.max(e[1], borne[1]), Math.min(e[2], borne[2]), Math.min(e[3], borne[3])];
      if (!(x1 > x0 && y1 > y0)) return null;
      const f = await lireFenetreTuilee(t, `${s.id}|${d ?? "-"}`, niveau, Math.floor((x0 - g.ox) / g.rx) - marge, Math.floor((y1 - g.oy) / g.ry) - marge, Math.ceil((x1 - g.ox) / g.rx) + marge, Math.ceil((y0 - g.oy) / g.ry) + marge, 16_000_000);
      return f ? { ox: g.ox, oy: g.oy, rx: g.rx, ry: g.ry, c0: f.c0, l0: f.l0, largeur: f.largeur, hauteur: f.hauteur, valeurs: f.valeurs, borne } : null;
    });
    if (r) sortie.push(r);
  }
  return sortie;
}

/**
 * Tuile 256 × 256 (Web Mercator) d'une version distante, en RGBA : null sous le zoom minimal (rien n'est lu). Les valeurs
 * viennent de la grille numérique (ou de ses aperçus pour l'affichage) ; pente et ombrage calculés sur la fenêtre lue.
 */
export async function tuileDistante(ex: Executeur, s: SourceTerrain, style: "altitude" | "pente" | "ombrage", z: number, _x: number, y: number, lonLat: (px: number, py: number) => [number, number], plage: [number, number]): Promise<Uint8Array | null> {
  if (z < LIMITES_FOND_MONDIAL.zoomMinTuiles) return null;
  const [o, n] = lonLat(0, 0);
  const [e, sud] = lonLat(256, 256);
  const pasDeg = (e - o) / 256;
  const liste = await fenetres(ex, s, [o, sud, e, n], pasDeg, 2, 9);
  const valeurs = liste.map((f) => {
    if (style === "altitude") return f.valeurs;
    const m = espacementMetrique((f.borne[1] + f.borne[3]) / 2, Math.abs(f.rx), Math.abs(f.ry));
    const g = { largeur: f.largeur, hauteur: f.hauteur, valeurs: f.valeurs, nodata: s.nodata, pasX: m.pasX, pasY: m.pasY };
    return style === "pente" ? pente(g) : ombrage(g);
  });
  const rgba = new Uint8Array(256 * 256 * 4);
  const ty = (py: number) => latitudeMercator((y + (py + 0.5) / 256) / 2 ** z);
  for (let py = 0; py < 256; py++) {
    const lat = ty(py);
    for (let qx = 0; qx < 256; qx++) {
      const lon = o + ((qx + 0.5) / 256) * (e - o);
      const i = liste.findIndex((f) => lon >= f.borne[0] && lon < f.borne[2] && lat >= f.borne[1] && lat < f.borne[3]);
      if (i < 0) continue;
      const f = liste[i]!;
      const cc = Math.floor((lon - f.ox) / f.rx) - f.c0, ll = Math.floor((lat - f.oy) / f.ry) - f.l0;
      if (cc < 0 || ll < 0 || cc >= f.largeur || ll >= f.hauteur) continue;
      const val = valeurs[i]![ll * f.largeur + cc]!;
      if (sansValeur(val, style === "altitude" ? s.nodata : null)) continue;
      const k = (py * 256 + qx) * 4;
      if (style === "ombrage") { const gris = 1 + Math.round(val * 254); rgba[k] = rgba[k + 1] = rgba[k + 2] = gris; rgba[k + 3] = 255; }
      else rgba.set(couleurContinue(val, plage[0], plage[1], style === "altitude" ? PALETTE_ALTITUDE : PALETTE_PENTE), k);
    }
  }
  return rgba;
}

// ——— Courbes de niveau à la demande ———

/** Équidistance admise pour une version distante : jamais sous le seuil (TER-D17), parmi les équidistances usuelles. */
export async function equidistanceDistante(ex: Executeur, s: SourceTerrain, demandee: number | null): Promise<number> {
  const exigee = await equidistanceExigeeVersion(ex as import("pg").PoolClient, s.id);
  const e = demandee ?? exigee;
  const v = verifierEquidistance(e, exigee);
  if (!v.ok) throw new ServiceRefuse(422, "equidistance_refusee", v.message);
  if (!(EQUIDISTANCES as readonly number[]).includes(e)) throw new ServiceRefuse(422, "equidistance_indisponible", `Équidistance ${e} m non proposée (${EQUIDISTANCES.filter((x) => x >= exigee).join(", ")} m).`);
  return e;
}

/** Équidistances proposées pour une version distante (calculées à la demande), à partir du seuil exigé. */
export const equidistancesDistantes = (exigee: number) => EQUIDISTANCES.filter((e) => e >= exigee);

/**
 * Courbes d'une tuile (lon, lat), calculées sur la grille numérique **native** de chaque dalle ; aucune sous le zoom
 * minimal des courbes. Une courbe s'interrompt aux limites de dalle et aux NoData (jamais raccordée sans marque).
 */
export async function courbesDistantes(ex: Executeur, s: SourceTerrain, z: number, emprise: readonly [number, number, number, number], equidistance: number): Promise<{ altitude: number; maitresse: boolean; lignes: [number, number][][] }[]> {
  if (z < LIMITES_FOND_MONDIAL.zoomMinCourbes) return [];
  const sortie: { altitude: number; maitresse: boolean; lignes: [number, number][][] }[] = [];
  for (const f of await fenetres(ex, s, emprise, null, 2, LIMITES_FOND_MONDIAL.dallesParRequete)) {
    for (const k of courbesDeNiveau({ largeur: f.largeur, hauteur: f.hauteur, valeurs: f.valeurs, nodata: s.nodata, pasX: 1, pasY: 1 }, equidistance, 5)) {
      sortie.push({ altitude: k.altitude, maitresse: k.maitresse, lignes: k.lignes.map((l) => l.map(([c, li]) => [f.ox + (f.c0 + c) * f.rx, f.oy + (f.l0 + li) * f.ry] as [number, number])) });
    }
  }
  return sortie;
}
