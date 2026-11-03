/**
 * Origine distante simulée — TEST SEULEMENT (TER-09) : dalles 1° × 1° synthétiques servies par plages HTTP à travers un
 * transport de test (aucun réseau). Ne représentent aucun site ; jamais livrées ni lues hors des tests.
 *
 *  - N47E008 (environs de Lucerne, hors Benslimane) : 120 × 120 cellules de 30″, plan z = 400 + colonne + 2 × ligne (m) ;
 *  - N47E009 : z = 900 partout ; toute autre dalle : absente (404, comme l'océan chez Copernicus).
 */
import { validerDeclarationTerrain, type AcquisitionDistante, type DeclarationTerrain } from "@parcours/geodata-model";
import type { Transport } from "./distant.js";
import { ficheSynthetique, octetsFixture } from "./fixtures-synthetiques.js";

export const HOTE_TEST = "dalles.exemple.test";
export const MODELE_TEST = `https://${HOTE_TEST}/DEM_{lat}_{lon}/DEM_{lat}_{lon}.tif`;
export const ACQ_TEST: AcquisitionDistante = {
  methode: "distant", hote: HOTE_TEST, modele: MODELE_TEST, dalles: "1deg", dalleReference: "N47E008",
  emprise: { ouest: -180, sud: -90, est: 180, nord: 90 }, conditions: { texte: "Fixture de test, aucune condition réelle", source: "fixture de test" },
};

/** Fiche synthétique d'un fond mondial en dalles (MNT par défaut). */
export function ficheDistanteTest(surcharge: Record<string, unknown> = {}): DeclarationTerrain {
  const r = validerDeclarationTerrain(ficheSynthetique({
    cle: "test-fond-mondial", niveau: "mondial", acquisition: ACQ_TEST, crsHorizontal: "EPSG:4326", pasNatif: { valeur: 30, unite: "arcsec" }, nodata: -9999,
    fichier: { nom: "DEM.tif", format: "GeoTIFF" }, ...surcharge,
  }));
  if (!r.ok) throw new Error(r.erreurs.join("; "));
  return r.declaration;
}

export const PAS_TEST = 1 / 120;
const dalle = (lon: number, lat: number, valeur: (c: number, l: number) => number) =>
  octetsFixture({ geographique: true, largeur: 120, hauteur: 120, pas: PAS_TEST, origine: [lon, lat + 1], valeur, nodata: -9999 });
export const urlTest = (d: string) => MODELE_TEST.replaceAll("{lat}", d.slice(0, 3)).replaceAll("{lon}", d.slice(3));

export type ModeOrigine = "normal" | "panne" | "redirection" | "ignore-plage" | "lent";

/** Origine simulée : dalles, mode de panne, compteur de requêtes. */
export function origineTest() {
  const fichiers = new Map<string, { octets: Buffer; etag: string }>([
    [urlTest("N47E008"), { octets: dalle(8, 47, (c, l) => 400 + c + 2 * l), etag: "\"a1\"" }],
    [urlTest("N47E009"), { octets: dalle(9, 47, () => 900), etag: "\"b1\"" }],
  ]);
  const etat = { mode: "normal" as ModeOrigine, requetes: 0 };
  const transport: Transport = async (url, init) => {
    etat.requetes++;
    if (etat.mode === "panne") return new Response("erreur", { status: 500 });
    if (etat.mode === "lent") await new Promise((res, rej) => { const t = setTimeout(res, 5000); init.signal.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("délai"), { name: "TimeoutError" })); }); });
    if (etat.mode === "redirection") return new Response(null, { status: 302, headers: { location: "https://ailleurs.exemple.test/x.tif" } });
    const f = fichiers.get(url);
    if (!f) return new Response("NoSuchKey", { status: 404 });
    if (etat.mode === "ignore-plage") return new Response(f.octets, { status: 200, headers: { "content-length": String(f.octets.length), etag: f.etag } });
    const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(init.headers["Range"]!)!.map(Number) as [number, number, number];
    const fin = Math.min(b, f.octets.length - 1);
    return new Response(f.octets.subarray(a, fin + 1), { status: 206, headers: { "content-range": `bytes ${a}-${fin}/${f.octets.length}`, etag: f.etag, "last-modified": "Mon, 09 May 2022 14:26:37 GMT" } });
  };
  return { fichiers, etat, transport };
}
