/**
 * Terrain haute résolution, lot TER-04 (Issue #381) — services numériques contre PostgreSQL/PostGIS (suite DB-3), par
 * l'API réelle : catalogue, altitude au point, profil avec couture entre deux jeux, statistiques dans une zone trouée,
 * accès non autorisés, tuiles, courbes, exports (CRS, datum, valeurs conservés), publication et retour arrière.
 * Jeux synthétiques « test seulement » ; GDAL exigé (travailleur, exports).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromFile } from "geotiff";
import { validerDeclarationTerrain } from "@parcours/geodata-model";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { StockageTerrain } from "../lib/geodata/terrain/stockage.js";
import { importerTerrain } from "../lib/geodata/terrain/import.js";
import { deciderRevue, traiterVersion } from "../lib/geodata/terrain/traitement.js";
import { invaliderCaches, publierVersion } from "../lib/geodata/terrain/services.js";
import { traiterUnExport } from "../lib/geodata/terrain/exports.js";
import { ecrireFixture, ficheSynthetique, type OptionsFixture } from "../lib/geodata/terrain/fixtures-synthetiques.js";
import { newId } from "../lib/ids.js";

const app = createApp();
const API = "/geodata/api/terrain";
const PASSWORD = "correct-horse-battery";
let racine: string;
let stockage: StockageTerrain;
let pub: string;

beforeEach(async () => {
  await resetTestDatabase(pool, ["projects", "sessions", "users"]);
  racine = mkdtempSync(join(tmpdir(), "fadi-terrain-api-"));
  stockage = new StockageTerrain(racine);
  await stockage.preparer();
  process.env["GEODATA_TERRAIN_DIR"] = racine;
  delete process.env["GEODATA_TERRAIN_ENABLED"];
  invaliderCaches();
  pub = newId("usr");
  await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'publication@example.test', 'x')", [pub]);
  await pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, 'responsable-publication')", [pub]);
});
afterEach(() => { rmSync(racine, { recursive: true, force: true }); delete process.env["GEODATA_TERRAIN_DIR"]; });
afterAll(async () => { await pool.end(); });

async function compte(email: string, role?: string) {
  const client = request.agent(app);
  const r = await client.post("/auth/register").send({ email, password: PASSWORD });
  expect(r.status).toBe(201);
  if (role) await pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, $2)", [r.body.id, role]);
  return client;
}

/** Version synthétique importée, traitée, acceptée et (par défaut) publiée. */
async function jeu(cle: string, f: OptionsFixture, o: { publier?: boolean; fiche?: Record<string, unknown> } = {}): Promise<string> {
  const nom = `${cle}.tif`;
  ecrireFixture(stockage.cheminDepot(nom), f);
  const d = validerDeclarationTerrain(ficheSynthetique({ cle, fichier: { nom, format: "GeoTIFF" }, pasNatif: { valeur: f.pas ?? 0.25, unite: "m" }, ...o.fiche }));
  if (!d.ok) throw new Error(d.erreurs.join("; "));
  const c = await pool.connect();
  try {
    const r = await importerTerrain(c, stockage, d.declaration, { deposePar: null, quotaOctets: 1e10 });
    expect(r.etat).toBe("traitement");
    await traiterVersion(c, stockage, r.versionId);
    await deciderRevue(c, r.versionId, "accepte", "Jeu synthétique de test accepté", pub);
    if (o.publier !== false) await publierVersion(c, r.versionId, pub, "Publication du jeu synthétique de test");
    return r.versionId;
  } finally { c.release(); }
}

/** (x, y) EPSG:2056 → (lon, lat) par PostGIS (même opération que le service). */
async function lonLat(x: number, y: number): Promise<[number, number]> {
  const [r] = (await pool.query<{ lon: number; lat: number }>("SELECT ST_X(p) AS lon, ST_Y(p) AS lat FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 2056), 4326) AS p) s", [x, y])).rows;
  return [r!.lon, r!.lat];
}

// A : plan z = 500 + 0,5 × colonne, pas 0,25 m, 80 × 60 cellules, de x = 2 662 500 à 2 662 520 (y 1 210 485 → 1 210 500).
const A: OptionsFixture = { largeur: 80, hauteur: 60, pas: 0.25, valeur: (c) => 500 + 0.5 * c };
// B : plan plus grossier (1 m) qui recouvre A sur 10 m et se prolonge à l'est jusqu'à x = 2 662 560.
const B: OptionsFixture = { largeur: 50, hauteur: 15, pas: 1, origine: [2662510, 1210500], valeur: (c) => 600 + c };
const zA = (x: number) => 500 + 0.5 * ((x - 2662500) / 0.25 - 0.5);
/** Lecture binaire d'une réponse (MVT, GeoTIFF) par supertest. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const binaire = (res: any, cb: (e: Error | null, b: unknown) => void) => { const b: Buffer[] = []; res.on("data", (x: Buffer) => b.push(x)); res.on("end", () => cb(null, Buffer.concat(b))); };

describe("services numériques du terrain (TER-04)", () => {
  it("accès : sans session 401 ; drapeau de retour arrière ; version non publiée jamais révélée", async () => {
    expect((await request(app).get(`${API}/jeux`)).status).toBe(401);
    const u = await compte("lecteur@example.test");
    const nonPubliee = await jeu("test-non-publie", A, { publier: false });
    expect((await u.get(`${API}/tuiles/${nonPubliee}/altitude/18/0/0`)).status).toBe(404);
    expect((await u.get(`${API}/jeux`)).body.jeux).toEqual([]);
    process.env["GEODATA_TERRAIN_ENABLED"] = "false";
    expect((await u.get(`${API}/jeux`)).status).toBe(404);
  });

  it("catalogue et altitude au point : valeur exacte sur le plan, source complète ; hors couverture « indisponible »", async () => {
    const u = await compte("lecteur@example.test");
    const a = await jeu("test-a", A);
    const jeux = (await u.get(`${API}/jeux`)).body.jeux;
    expect(jeux).toHaveLength(1);
    expect(jeux[0]).toMatchObject({ versionId: a, produit: "MNT", etiquette: "Données synthétiques — test seulement", unite: "m", qualite: { etat: "non-evaluee" } });
    expect(jeux[0].referenceVerticale).toMatchObject({ statut: "declaree", code: "EPSG:5728" });
    expect(jeux[0].couverture.type).toBe("MultiPolygon");
    // Interface (TER-05) : plage de la légende verrouillée (celle des tuiles sans portée), équidistances minimale et calculées.
    const [pmin, pmax] = jeux[0].plageAltitude as [number, number];
    expect(pmin).toBeGreaterThanOrEqual(499.9);
    expect(pmax).toBeLessThanOrEqual(539.6);
    expect(pmin).toBeLessThan(pmax);
    expect(jeux[0].courbes.equidistanceMinimale).toBeGreaterThan(0);
    expect(jeux[0].courbes.calculees.length).toBeGreaterThan(0);
    expect(jeux[0].courbes.calculees.every((e: number) => e >= jeux[0].courbes.equidistanceMinimale - 1e-9 || e > 0)).toBe(true);
    const [lon, lat] = await lonLat(2662507.3, 1210492.1);
    const p = (await u.get(`${API}/point`).query({ lon, lat })).body;
    expect(p.disponible).toBe(true);
    // Aller-retour EPSG:2056 → WGS 84 → EPSG:2056 par PROJ : écart de l'ordre du millimètre (pente 2 m/m ici).
    expect(Math.abs(p.altitude - zA(2662507.3))).toBeLessThan(0.005);
    expect(p.echantillonnage).toBe("bilineaire");
    expect(p.source).toMatchObject({ versionId: a, pas: { metres: 0.25 }, attribution: "Fixture de test Fadi" });
    const [lon2, lat2] = await lonLat(2662800, 1210492);
    expect((await u.get(`${API}/point`).query({ lon: lon2, lat: lat2 })).body).toMatchObject({ disponible: false, altitude: null });
    expect((await u.get(`${API}/point`).query({ lon, lat, produit: "MNS" })).body.disponible).toBe(false);
    expect((await u.get(`${API}/point`).query({ lon: 500, lat })).status).toBe(400);
  });

  it("point : une source plus fine sans valeur au point n'écarte pas une source plus grossière d'une autre référence qui le couvre", async () => {
    const u = await compte("lecteur@example.test");
    const fine = await jeu("test-fine-trouee", { ...A, valeur: (c) => (c < 40 ? -9999 : 500 + 0.5 * c) });
    const grossiere = await jeu("test-grossiere", { largeur: 30, hauteur: 20, pas: 1, origine: [2662495, 1210502], valeur: () => 321 }, {
      fiche: { referenceVerticale: { statut: "declaree", code: "EPSG:3855", libelle: "Autre référence fictive de test", origine: "documentation", source: "fixture de test" } },
    });
    const [lon, lat] = await lonLat(2662503.1, 1210492.1);
    const p = (await u.get(`${API}/point`).query({ lon, lat })).body;
    expect(p.disponible).toBe(true);
    expect(p.source.versionId).toBe(grossiere);
    expect(p.altitude).toBe(321);
    expect(p.source.referenceVerticale.code).toBe("EPSG:3855");
    const [lon2, lat2] = await lonLat(2662515.1, 1210492.1);
    expect((await u.get(`${API}/point`).query({ lon: lon2, lat: lat2 })).body.source.versionId).toBe(fine);
  });

  it("profil : couture entre deux jeux marquée, le plus fin d'abord, lacune hors couverture, points interpolés signalés", async () => {
    const u = await compte("lecteur@example.test");
    const a = await jeu("test-a", A);
    const b = await jeu("test-b", B);
    const debut = await lonLat(2662505, 1210492.5);
    const fin = await lonLat(2662580, 1210492.5);
    const r = await u.post(`${API}/profil`).send({ ligne: [debut, fin], pas: 1 });
    expect(r.status).toBe(200);
    const p = r.body;
    expect(p.transitions.map((t: { de: string | null; vers: string | null }) => [t.de, t.vers])).toEqual([[a, b], [b, null]]);
    expect(p.transitions[0].chainage).toBeGreaterThan(14);
    expect(p.transitions[0].chainage).toBeLessThan(16);
    expect(p.lacunes).toHaveLength(1);
    expect(p.lacunes[0].fin).toBeCloseTo(75, 2);
    const pa = p.points.find((x: { chainage: number }) => x.chainage === 2);
    expect(pa.source).toBe(a);
    expect(pa.altitude).toBeCloseTo(zA(2662507), 2);
    expect(p.sources.map((s: { versionId: string }) => s.versionId)).toEqual([a, b]);
    expect((await u.post(`${API}/profil`).send({ ligne: [debut, fin], pas: 0.0001 })).status).toBe(400);
  });

  it("statistiques dans le polygone réel : le trou est exclu ; couverture partielle mesurée", async () => {
    const u = await compte("lecteur@example.test");
    await jeu("test-a", A);
    const anneau = async (pts: [number, number][]) => Promise.all(pts.map(([x, y]) => lonLat(x, y)));
    const ext = await anneau([[2662502, 1210487], [2662518, 1210487], [2662518, 1210498], [2662502, 1210498], [2662502, 1210487]]);
    const trou = await anneau([[2662506, 1210490], [2662510, 1210490], [2662510, 1210494], [2662506, 1210494], [2662506, 1210490]]);
    const plein = (await u.post(`${API}/statistiques`).send({ zone: { type: "Polygon", coordinates: [ext] } })).body;
    const troue = (await u.post(`${API}/statistiques`).send({ zone: { type: "Polygon", coordinates: [ext, trou] } })).body;
    expect(plein.statistiques.cellulesValides).toBeGreaterThan(troue.statistiques.cellulesValides);
    expect(plein.statistiques.cellulesValides - troue.statistiques.cellulesValides).toBeGreaterThan(240);
    expect(plein.statistiques.cellulesValides - troue.statistiques.cellulesValides).toBeLessThan(272);
    expect(plein.couvertureValide).toBeGreaterThan(0.98);
    expect(plein.statistiques.min).toBeGreaterThanOrEqual(zA(2662502) - 0.25);
    const deborde = await anneau([[2662510, 1210487], [2662530, 1210487], [2662530, 1210498], [2662510, 1210498], [2662510, 1210487]]);
    const partielle = (await u.post(`${API}/statistiques`).send({ zone: { type: "Polygon", coordinates: [deborde] } })).body;
    expect(partielle.couvertureValide).toBeGreaterThan(0.45);
    expect(partielle.couvertureValide).toBeLessThan(0.55);
    const loin = await anneau([[2663000, 1211000], [2663010, 1211000], [2663010, 1211010], [2663000, 1211000]]);
    expect((await u.post(`${API}/statistiques`).send({ zone: { type: "Polygon", coordinates: [loin] } })).body.indisponible).toBe(true);
  });

  it("tuiles et courbes : PNG privé, transparent hors couverture ; droit « tuiles » refusé → 403 ; équidistance sous le seuil → 422", async () => {
    const u = await compte("lecteur@example.test");
    const a = await jeu("test-a", A);
    const [lon, lat] = await lonLat(2662510, 1210492);
    const z = 20, n = 2 ** z;
    const x = Math.floor(((lon + 180) / 360) * n), y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
    for (const style of ["altitude", "pente", "ombrage"]) {
      const t = await u.get(`${API}/tuiles/${a}/${style}/${z}/${x}/${y}.png`).buffer(true);
      expect(t.status).toBe(200);
      expect(t.headers["content-type"]).toBe("image/png");
      expect(t.headers["cache-control"]).toMatch(/^private/);
      expect(t.body.length).toBeGreaterThan(400);
    }
    expect((await u.get(`${API}/tuiles/${a}/eau/${z}/${x}/${y}`)).status).toBe(400);
    const courbes = await u.get(`${API}/courbes/${a}/${z - 4}/${x >> 4}/${y >> 4}.pbf`).buffer(true).parse(binaire);
    expect(courbes.status).toBe(200);
    expect(courbes.body.length).toBeGreaterThan(0);
    const refuse = await u.get(`${API}/courbes/${a}/${z}/${x}/${y}`).query({ equidistance: 1 });
    expect(refuse.status).toBe(422);
    expect(refuse.body.message).toMatch(/ne permet pas moins de 10 m/);
    const b = await jeu("test-sans-tuiles", { ...A, origine: [2663000, 1210500] }, { fiche: { droits: { ...ficheSynthetique()["droits"] as object, tuiles: "refuse" } } });
    expect((await u.get(`${API}/tuiles/${b}/altitude/${z}/${x}/${y}`)).status).toBe(403);
  });

  it("exports : GeoTIFF de l'original (repère composé, datum, valeurs conservés), courbes GeoJSON et DXF ; autre compte 404 ; droit inconnu 403", async () => {
    const u = await compte("lecteur@example.test");
    const autre = await compte("autre@example.test");
    const a = await jeu("test-a", { ...A, valeur: (c) => 500 + 5 * c });
    const sw = await lonLat(2662503, 1210488), ne = await lonLat(2662517, 1210497);
    const emprise = [sw[0], sw[1], ne[0], ne[1]];
    const demande = await u.post(`${API}/exports`).send({ versionId: a, format: "geotiff", emprise });
    expect(demande.status).toBe(202);
    const geojson = await u.post(`${API}/exports`).send({ versionId: a, format: "courbes-geojson", emprise, equidistance: 20 });
    const dxf = await u.post(`${API}/exports`).send({ versionId: a, format: "courbes-dxf", emprise });
    expect([geojson.status, dxf.status]).toEqual([202, 202]);
    expect((await u.post(`${API}/exports`).send({ versionId: a, format: "courbes-dxf", emprise, equidistance: 2 })).status).toBe(422);
    expect((await u.get(`${API}/exports/${demande.body.id}/fichier`)).status).toBe(409);
    const c = await pool.connect();
    try { while (await traiterUnExport(c, stockage)); } finally { c.release(); }
    expect((await autre.get(`${API}/exports/${demande.body.id}`)).status).toBe(404);
    const etat = (await u.get(`${API}/exports/${demande.body.id}`)).body;
    expect(etat.etat).toBe("pret");
    const fichier = await u.get(`${API}/exports/${demande.body.id}/fichier`).buffer(true).parse(binaire);
    expect(fichier.status).toBe(200);
    const chemin = join(racine, "export.tif");
    writeFileSync(chemin, fichier.body as Buffer);
    const info = JSON.parse(execFileSync("gdalinfo", ["-json", chemin]).toString());
    expect(info.coordinateSystem.wkt).toMatch(/CH1903\+ \/ LV95/);
    expect(info.coordinateSystem.wkt).toMatch(/VERT_CS|VERTCRS/);
    expect(info.metadata[""]["FADI_REFERENCE_VERTICALE"]).toMatch(/EPSG:5728/);
    expect(info.metadata[""]["FADI_ATTRIBUTION"]).toBe("Fixture de test Fadi");
    expect(info.bands[0].noDataValue).toBe(-9999);
    // Valeurs identiques à l'original sur la fenêtre : colonne c → 500 + 5 c.
    const t = await fromFile(chemin);
    const im = await t.getImage();
    const [ox] = im.getOrigin() as [number, number];
    const [vals] = (await im.readRasters({ samples: [0] })) as unknown as [Float32Array];
    const c0 = Math.round((ox - 2662500) / 0.25);
    for (let col = 0; col < im.getWidth(); col++) expect(vals[col]).toBe(500 + 5 * (c0 + col));
    await t.close?.();
    const g = JSON.parse((await u.get(`${API}/exports/${geojson.body.id}/fichier`).buffer(true)).text);
    expect(g.fadi).toMatchObject({ equidistance: 20, unite: "m", attribution: "Fixture de test Fadi" });
    expect(g.features.every((f: { properties: { altitude: number } }) => f.properties.altitude % 20 === 0)).toBe(true);
    const d = ((await u.get(`${API}/exports/${dxf.body.id}/fichier`).buffer(true).parse(binaire)).body as Buffer).toString("utf8");
    expect(d).toMatch(/Repere horizontal : EPSG:2056/);
    expect(d).toMatch(/Equidistance : 10 m/);
    const b = await jeu("test-export-inconnu", { ...A, origine: [2663000, 1210500] }, { fiche: { droits: { ...ficheSynthetique()["droits"] as object, export: "inconnu" } } });
    expect((await u.post(`${API}/exports`).send({ versionId: b, format: "geotiff", emprise })).status).toBe(403);
  });

  it("publication et retour arrière : la nouvelle version remplace l'ancienne, l'ancienne se republie ; rôle exigé", async () => {
    const u = await compte("lecteur@example.test");
    const resp = await compte("resp@example.test", "responsable-publication");
    const v1 = await jeu("test-a", A);
    const v2 = await jeu("test-a", { ...A, valeur: (c) => 700 + 0.5 * c }, { publier: false });
    expect((await u.post(`${API}/versions/${v2}/publier`).send({ motif: "Tentative sans le rôle requis" })).status).toBe(403);
    const p2 = await resp.post(`${API}/versions/${v2}/publier`).send({ motif: "Nouvelle version du jeu de test" });
    expect(p2.body).toEqual({ publiee: v2, remplacee: v1 });
    const [lon, lat] = await lonLat(2662507.3, 1210492.1);
    expect((await u.get(`${API}/point`).query({ lon, lat })).body.source.versionId).toBe(v2);
    const retour = await resp.post(`${API}/versions/${v1}/publier`).send({ motif: "Retour arrière vers la version précédente" });
    expect(retour.body).toEqual({ publiee: v1, remplacee: v2 });
    const pt = (await u.get(`${API}/point`).query({ lon, lat })).body;
    expect(pt.source.versionId).toBe(v1);
    expect(Math.abs(pt.altitude - zA(2662507.3))).toBeLessThan(0.005);
    const etats = (await pool.query("SELECT id, etat FROM geodata_terrain_versions WHERE cle = 'test-a' ORDER BY depose_le")).rows;
    expect(etats).toEqual([{ id: v1, etat: "publie" }, { id: v2, etat: "remplace" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_fichiers WHERE role = 'original'")).rows[0].n).toBe(2);
  });
});
