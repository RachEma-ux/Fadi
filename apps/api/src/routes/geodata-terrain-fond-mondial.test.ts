/**
 * Terrain, lot TER-09 (fond mondial à la demande, Issue #381) — contre PostgreSQL/PostGIS (suite DB-3), par l'API réelle :
 * une version **distante** suit le cycle de toute version (import de l'en-tête à la source, traitement, revue, publication)
 * puis sert point, profil, statistiques, tuiles et courbes **hors Benslimane** (dalle synthétique des environs de Lucerne),
 * avec les mêmes métadonnées ; un levé local garde la priorité sur son emprise exacte (TER-D16) ; MNT et MNS jamais
 * mélangés ; source distante indisponible → « indisponible » ; dalle absente → hors couverture ; export refusé.
 * L'origine est simulée (transport de test, dalles « test seulement ») ; le service terrain-distant tourne en vrai (HTTP).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validerDeclarationTerrain } from "@parcours/geodata-model";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { StockageTerrain } from "../lib/geodata/terrain/stockage.js";
import { importerTerrain, importerTerrainDistant } from "../lib/geodata/terrain/import.js";
import { deciderRevue, traiterVersion } from "../lib/geodata/terrain/traitement.js";
import { invaliderCaches, publierVersion } from "../lib/geodata/terrain/services.js";
import { BUDGET_DISTANT_DEFAUT, ServiceDistant, sourcesDistantes } from "../lib/geodata/terrain/distant.js";
import { ficheDistanteTest, origineTest } from "../lib/geodata/terrain/fixtures-distantes.js";
import { ecrireFixture, ficheSynthetique } from "../lib/geodata/terrain/fixtures-synthetiques.js";
import { pngTransparent } from "../lib/geodata/raster.js";
import { newId } from "../lib/ids.js";

const app = createApp();
const API = "/geodata/api/terrain";
const PASSWORD = "correct-horse-battery";
const origine = origineTest();
let racine: string;
let stockage: StockageTerrain;
let pub: string;
let service: ServiceDistant;
let serveur: Server | null = null;

async function demarrerService(): Promise<void> {
  service = new ServiceDistant({ racine, sources: sourcesDistantes([ficheDistanteTest(), ficheDistanteTest({ cle: "test-fond-mondial-mns", produit: "MNS" })]), quotaCache: 1e9, quotaVolume: 2e9, budget: BUDGET_DISTANT_DEFAUT, transport: origine.transport });
  await service.demarrer();
  serveur = service.serveur();
  await new Promise<void>((ok) => serveur!.listen(0, "127.0.0.1", ok));
  process.env["GEODATA_TERRAIN_DISTANT_URL"] = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
}
const arreterService = () => new Promise<void>((ok) => { if (!serveur) return ok(); serveur.closeAllConnections(); serveur.close(() => ok()); serveur = null; });

beforeEach(async () => {
  await resetTestDatabase(pool, ["projects", "sessions", "users"]);
  racine = mkdtempSync(join(tmpdir(), "fadi-terrain-mondial-"));
  stockage = new StockageTerrain(racine);
  await stockage.preparer();
  process.env["GEODATA_TERRAIN_DIR"] = racine;
  delete process.env["GEODATA_TERRAIN_ENABLED"];
  origine.etat.mode = "normal";
  invaliderCaches();
  await demarrerService();
  pub = newId("usr");
  await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'publication@example.test', 'x')", [pub]);
  await pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, 'responsable-publication')", [pub]);
});
afterEach(async () => { await arreterService(); invaliderCaches(); rmSync(racine, { recursive: true, force: true }); delete process.env["GEODATA_TERRAIN_DIR"]; delete process.env["GEODATA_TERRAIN_DISTANT_URL"]; });
afterAll(async () => { await pool.end(); });

async function compte(email: string) {
  const client = request.agent(app);
  const r = await client.post("/auth/register").send({ email, password: PASSWORD });
  expect(r.status).toBe(201);
  return client;
}

/** Version distante importée (en-tête lu à la source simulée), traitée, acceptée et publiée. */
async function mondial(surcharge: Record<string, unknown> = {}): Promise<string> {
  const c = await pool.connect();
  try {
    const r = await importerTerrainDistant(c, ficheDistanteTest(surcharge), { deposePar: null, transport: origine.transport });
    expect(r.etat).toBe("traitement");
    await traiterVersion(c, stockage, r.versionId);
    await deciderRevue(c, r.versionId, "accepte", "Fond mondial synthétique de test accepté", pub);
    await publierVersion(c, r.versionId, pub, "Publication du fond mondial synthétique de test");
    return r.versionId;
  } finally { c.release(); }
}

const tuileDe = (z: number, lon: number, lat: number) => {
  const r = (lat * Math.PI) / 180;
  return { z, x: Math.floor(((lon + 180) / 360) * 2 ** z), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z) };
};

describe("TER-09 : fond mondial à la demande", () => {
  it("cycle d'une version distante : en-tête lu à la source, épinglé, couverture déclarée, aucun fichier copié", async () => {
    const id = await mondial();
    const [v] = (await pool.query("SELECT etat, taille, empreinte, entete->>'crsHorizontal' AS crs FROM geodata_terrain_versions WHERE id = $1", [id])).rows;
    expect(v).toMatchObject({ etat: "publie", crs: "EPSG:4326" });
    const [pin] = (await pool.query("SELECT url, dalle, etag FROM geodata_terrain_sources_distantes WHERE terrain_version_id = $1", [id])).rows;
    expect(pin).toMatchObject({ dalle: "N47E008", etag: "\"a1\"" });
    const [couv] = (await pool.query("SELECT nature, cellules_valides FROM geodata_terrain_couvertures WHERE terrain_version_id = $1", [id])).rows;
    expect(couv).toEqual({ nature: "declaree", cellules_valides: null });
    // Surface de l'emprise déclarée (monde entier) sur la sphère authalique : 4πR² ≈ 5,101 × 10¹⁴ m².
    const [{ s: surface }] = (await pool.query("SELECT surface_m2 AS s FROM geodata_terrain_couvertures WHERE terrain_version_id = $1", [id])).rows;
    expect(surface / 5.1006e14).toBeCloseTo(1, 3);
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_fichiers WHERE terrain_version_id = $1", [id])).rows[0].n).toBe(0);
    // Relancé : rien de nouveau (même en-tête, même fiche).
    const c = await pool.connect();
    try { expect((await importerTerrainDistant(c, ficheDistanteTest(), { deposePar: null, transport: origine.transport })).deja).toBe(true); } finally { c.release(); }
  });

  it("zone hors Benslimane servie : point, profil, statistiques, tuiles, courbes ; métadonnées et attribution", async () => {
    const id = await mondial();
    const a = await compte("lecteur@example.test");
    const jeux = await a.get(`${API}/jeux?produit=MNT&ouest=8.2&sud=47.0&est=8.4&nord=47.1`);
    expect(jeux.status).toBe(200);
    const j = jeux.body.jeux.find((x: { versionId: string }) => x.versionId === id);
    expect(j).toMatchObject({ niveau: "mondial", acces: "a-la-demande", attribution: "Fixture de test Fadi", fondMondial: { zoomMinimal: 8, zoomMinimalCourbes: 12, couverture: "declaree" } });
    expect(j.courbes.equidistanceMinimale).toBe(10);
    expect(j.courbes.calculees).toEqual([10, 20, 25, 50, 100]);

    // Centre de la cellule (colonne 30, ligne 60) de N47E008 : z = 400 + 30 + 120 = 550 m.
    const p = await a.get(`${API}/point?lon=${8 + 30.5 / 120}&lat=${48 - 60.5 / 120}&produit=MNT`);
    expect(p.status).toBe(200);
    expect(p.body.disponible).toBe(true);
    expect(p.body.altitude).toBeCloseTo(550, 4);
    expect(p.body.source).toMatchObject({ versionId: id, niveau: "mondial", referenceVerticale: { statut: "declaree" }, qualite: { etat: "non-evaluee" }, pas: { declare: { valeur: 30, unite: "arcsec" } }, attribution: "Fixture de test Fadi" });
    expect(p.headers["cache-control"]).toContain("private");

    const pr = await a.post(`${API}/profil`).send({ ligne: [[8.2, 47.5], [8.8, 47.5]], pas: 500, produit: "MNT" });
    expect(pr.status).toBe(200);
    expect(pr.body.points.length).toBeGreaterThan(50);
    expect(pr.body.points.every((x: { altitude: number | null }) => x.altitude !== null)).toBe(true);

    const st = await a.post(`${API}/statistiques`).send({ zone: { type: "Polygon", coordinates: [[[8.1, 47.1], [8.3, 47.1], [8.3, 47.3], [8.1, 47.3], [8.1, 47.1]]] }, produit: "MNT", versionId: id });
    expect(st.status).toBe(200);
    expect(st.body.statistiques.cellulesValides).toBeGreaterThan(500);
    expect(st.body.couvertureValide).toBeGreaterThan(0.9);

    const t = tuileDe(12, 8.3, 47.2);
    const tu = await a.get(`${API}/tuiles/${id}/altitude/${t.z}/${t.x}/${t.y}?min=400&max=700`);
    expect(tu.status).toBe(200);
    expect(tu.headers["cache-control"]).toBe("private, max-age=3600");
    expect(Buffer.from(tu.body).equals(pngTransparent())).toBe(false);
    for (const style of ["pente", "ombrage"]) expect((await a.get(`${API}/tuiles/${id}/${style}/${t.z}/${t.x}/${t.y}`)).status).toBe(200);
    // Source en dalles : la plage de la version entière n'est jamais lue → légende adaptée exigée pour l'altitude.
    expect((await a.get(`${API}/tuiles/${id}/altitude/${t.z}/${t.x}/${t.y}`)).status).toBe(422);
    // Sous le zoom minimal : transparente, sans lecture distante.
    const avant = origine.etat.requetes;
    const t6 = tuileDe(6, 8.3, 47.2);
    const basse = await a.get(`${API}/tuiles/${id}/altitude/${t6.z}/${t6.x}/${t6.y}?min=400&max=700`);
    expect(Buffer.from(basse.body).equals(pngTransparent())).toBe(true);
    expect(origine.etat.requetes).toBe(avant);

    const k = await a.get(`${API}/courbes/${id}/${t.z}/${t.x}/${t.y}?equidistance=10`).buffer(true).parse((r, cb) => { const m: Buffer[] = []; r.on("data", (d: Buffer) => m.push(d)); r.on("end", () => cb(null, Buffer.concat(m))); });
    expect(k.status).toBe(200);
    expect((k.body as Buffer).length).toBeGreaterThan(100);
    expect((await a.get(`${API}/courbes/${id}/${t.z}/${t.x}/${t.y}?equidistance=5`)).status).toBe(422);

    // Export du fond mondial : refusé dans ce lot.
    expect((await a.post(`${API}/exports`).send({ versionId: id, format: "geotiff", emprise: [8.2, 47.2, 8.3, 47.3] })).status).toBe(409);
  });

  it("dalle absente : hors couverture (jamais 0) ; source distante indisponible : « indisponible », jamais une valeur", async () => {
    await mondial();
    const a = await compte("lecteur2@example.test");
    const ocean = await a.get(`${API}/point?lon=-30.5&lat=33.5&produit=MNT`);
    expect(ocean.body).toMatchObject({ disponible: false, altitude: null, etat: "hors-couverture" });
    origine.etat.mode = "panne";
    invaliderCaches();
    rmSync(join(racine, "cache-distant"), { recursive: true, force: true });
    await arreterService();
    await demarrerService();
    const panne = await a.get(`${API}/point?lon=8.5&lat=47.5&produit=MNT`);
    expect(panne.body).toMatchObject({ disponible: false, altitude: null, etat: "indisponible" });
    const t = tuileDe(12, 8.3, 47.2);
    const tu = await a.get(`${API}/tuiles/${(await pool.query("SELECT id FROM geodata_terrain_versions WHERE etat = 'publie'")).rows[0].id}/altitude/${t.z}/${t.x}/${t.y}?min=400&max=700`);
    expect(tu.status).toBe(503);
    expect(tu.headers["x-terrain-etat"]).toBe("indisponible");
    // Service distant arrêté : même réponse, sans valeur.
    origine.etat.mode = "normal";
    await arreterService();
    invaliderCaches();
    const arret = await a.get(`${API}/point?lon=8.5&lat=47.5&produit=MNT`);
    expect(arret.body).toMatchObject({ disponible: false, etat: "indisponible" });
  });

  it("MNT et MNS jamais mélangés ; un levé local garde la priorité sur son emprise exacte (TER-D16)", async () => {
    await mondial();
    const a = await compte("lecteur3@example.test");
    // Aucun MNS publié : le MNT mondial ne répond jamais pour le MNS.
    expect((await a.get(`${API}/point?lon=8.5&lat=47.5&produit=MNS`)).body).toMatchObject({ disponible: false, altitude: null });
    // Levé local synthétique (EPSG:2056, 0,25 m, z = 500 + 0,5 × colonne) dans la dalle N47E008.
    const nom = "local.tif";
    ecrireFixture(stockage.cheminDepot(nom), { largeur: 80, hauteur: 60, pas: 0.25, valeur: (col) => 500 + 0.5 * col });
    const d = validerDeclarationTerrain(ficheSynthetique({ cle: "test-leve-local", fichier: { nom, format: "GeoTIFF" } }));
    if (!d.ok) throw new Error(d.erreurs.join("; "));
    const c = await pool.connect();
    let local: string;
    try {
      const r = await importerTerrain(c, stockage, d.declaration, { deposePar: null, quotaOctets: 1e10 });
      await traiterVersion(c, stockage, r.versionId);
      await deciderRevue(c, r.versionId, "accepte", "Levé local synthétique de test accepté", pub);
      await publierVersion(c, r.versionId, pub, "Publication du levé local synthétique de test");
      local = r.versionId;
    } finally { c.release(); }
    const [dans] = (await pool.query<{ lon: number; lat: number }>("SELECT ST_X(p) AS lon, ST_Y(p) AS lat FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(2662510.1, 1210492.6), 2056), 4326) AS p) s")).rows;
    const p1 = await a.get(`${API}/point?lon=${dans!.lon}&lat=${dans!.lat}&produit=MNT`);
    expect(p1.body.source.versionId).toBe(local);
    const p2 = await a.get(`${API}/point?lon=8.5&lat=47.5&produit=MNT`);
    expect(p2.body.source.niveau).toBe("mondial");
  });
});
