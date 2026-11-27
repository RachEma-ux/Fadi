/**
 * Sites de projet (base dédiée `sites_*`, 27 novembre 2026) — intégration contre PostgreSQL : création, liste, lecture,
 * révision attendue (409), champ fautif nommé (400), sauvegarder sous, import / export du fichier d'échange (archivé),
 * lien d'une Planche, isolation entre comptes, et « Enregistrer comme site de projet » depuis l'étape 01.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { inscrire } from "../test-helpers/inscription.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

const API = "/sites/api";
async function compte(email: string) {
  const client = request.agent(app);
  const r = await inscrire(client, email, "correct-horse-battery");
  expect(r.status).toBe(201);
  return client;
}

describe("Sites de projet — API /sites/api", () => {
  it("crée, liste, lit, sauvegarde avec la révision attendue ; un nord absent reste non évalué", async () => {
    const a = await compte("site-a@example.com");
    const c = await a.post(`${API}/sites`).send({ fiche: { nom: " Villa ", nature: "construction", lieu: "Anfa" }, observations: { geographic: { longitude: -7.59, latitude: 33.57, source: "Emplacement de la Planche" } }, lien: { genre: "planche", cible: "brouillon" } });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ fiche: { nom: "Villa", nature: "construction", lieu: "Anfa" }, revision: 1, liens: [{ genre: "planche", cible: "brouillon" }], position: { longitude: -7.59, latitude: 33.57 } });
    expect(c.body.observations.nord).toBeNull();
    const id = c.body.id as string;
    expect((await a.get(`${API}/sites`)).body.sites.map((s: { id: string }) => s.id)).toEqual([id]);
    expect((await a.get(`${API}/sites?genre=planche&cible=brouillon`)).body.sites).toHaveLength(1);
    const m = await a.put(`${API}/sites/${id}`).send({ revisionAttendue: 1, fiche: { nom: "Villa", lieu: "Anfa" }, observations: { nord: { valeur: 12, source: "boussole" } } });
    expect(m.status).toBe(200);
    expect(m.body).toMatchObject({ revision: 2, observations: { nord: { valeur: 12, source: "boussole" } } });
    const perimee = await a.put(`${API}/sites/${id}`).send({ revisionAttendue: 1, fiche: { nom: "X" } });
    expect(perimee.status).toBe(409);
    expect(perimee.body.revisionCourante).toBe(2);
  });

  it("nomme le champ fautif ; exige la révision pour sauvegarder", async () => {
    const a = await compte("site-b@example.com");
    expect((await a.post(`${API}/sites`).send({ fiche: { nom: "" } })).body.champs).toEqual(["nom"]);
    expect((await a.post(`${API}/sites`).send({ fiche: { nom: "A", nature: "x" } })).body.champs).toEqual(["nature"]);
    expect((await a.post(`${API}/sites`).send({ fiche: { nom: "A" }, parcelle: { vertices: [[0, 0]], crs: "EPSG:2154" } })).body.champs).toEqual(["parcelle"]);
    const c = await a.post(`${API}/sites`).send({ fiche: { nom: "A" } });
    expect((await a.put(`${API}/sites/${c.body.id}`).send({ fiche: { nom: "B" } })).status).toBe(400);
  });

  it("sauvegarder sous, exporter puis importer : même contenu, fichier archivé tel quel", async () => {
    const a = await compte("site-c@example.com");
    const parcelle = { vertices: [[400000, 300000], [400020, 300000], [400020, 300020], [400000, 300020]], crs: "EPSG:26191", parcelNumber: "T-12", commune: "Casablanca" };
    const c = await a.post(`${API}/sites`).send({ fiche: { nom: "Parcelle T-12" }, parcelle });
    expect(c.body.position).toMatchObject({ hypothese: false });
    const copie = await a.post(`${API}/sites/${c.body.id}/copie`).send({ fiche: { nom: "Variante" } });
    expect(copie.status).toBe(201);
    expect(copie.body.parcelle.parcelNumber).toBe("T-12");
    expect((await a.post(`${API}/sites/${c.body.id}/copie`).send({})).status).toBe(400);
    const ex = await a.get(`${API}/sites/${c.body.id}/export`);
    expect(ex.status).toBe(200);
    const fichier = JSON.parse(ex.text);
    expect(fichier).toMatchObject({ format: "fadi-site-de-projet", version: 1, contour: { properties: { nature: "parcelle" } } });
    const imp = await a.post(`${API}/import`).send({ nom: "t12.site.json", contenu: ex.text });
    expect(imp.status).toBe(201);
    expect(imp.body.parcelle).toEqual(c.body.parcelle);
    const [arch] = (await pool.query("SELECT nom, taille FROM sites_fichiers WHERE site_id = $1", [imp.body.id])).rows;
    expect(arch).toEqual({ nom: "t12.site.json", taille: Buffer.byteLength(ex.text) });
    expect((await a.post(`${API}/import`).send({ contenu: "{\"type\":\"FeatureCollection\"}" })).body.champs).toEqual(["format"]);
  });

  it("une Planche ne suit qu'un site à la fois", async () => {
    const a = await compte("site-d@example.com");
    const s1 = await a.post(`${API}/sites`).send({ fiche: { nom: "Un" }, lien: { genre: "planche", cible: "p1" } });
    const s2 = await a.post(`${API}/sites`).send({ fiche: { nom: "Deux" }, lien: { genre: "planche", cible: "p1" } });
    expect((await a.get(`${API}/sites?genre=planche&cible=p1`)).body.sites.map((s: { id: string }) => s.id)).toEqual([s2.body.id]);
    expect((await a.get(`${API}/sites/${s1.body.id}`)).body.liens).toEqual([]);
  });

  it("isolation : un autre compte ne voit ni ne sauvegarde le site ; sans session : 401", async () => {
    const a = await compte("site-e@example.com");
    const b = await compte("site-f@example.com");
    const c = await a.post(`${API}/sites`).send({ fiche: { nom: "Rabat" } });
    expect((await b.get(`${API}/sites`)).body.sites).toEqual([]);
    expect((await b.get(`${API}/sites/${c.body.id}`)).status).toBe(404);
    expect((await b.put(`${API}/sites/${c.body.id}`).send({ revisionAttendue: 1, fiche: { nom: "X" } })).status).toBe(404);
    expect((await b.get(`${API}/sites/${c.body.id}/export`)).status).toBe(404);
    expect((await request(app).get(`${API}/sites`)).status).toBe(401);
  });

  it("étape 01 : enregistre le site du projet, puis le met à jour sans perdre le nord déclaré", async () => {
    const a = await compte("site-g@example.com");
    const pid = (await a.post("/projects").send({ code: "P.S", name: "Projet Site" })).body.id as string;
    expect((await a.get(`/projects/${pid}/steps/1/site/site-projet`)).body).toEqual({ site: null });
    const r = await a.post(`/projects/${pid}/steps/1/site/site-projet`).send({});
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ cree: true, site: { nom: "Projet Site", revision: 1 } });
    const id = r.body.site.id as string;
    const lu = await a.get(`${API}/sites/${id}`);
    expect(lu.body.liens).toEqual([{ genre: "projet", cible: pid }]);
    await a.put(`${API}/sites/${id}`).send({ revisionAttendue: 1, fiche: { nom: "Projet Site" }, observations: { nord: { valeur: 20, source: "plan" } } });
    const r2 = await a.post(`/projects/${pid}/steps/1/site/site-projet`).send({});
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ cree: false, site: { id, revision: 3 } });
    expect((await a.get(`${API}/sites/${id}`)).body.observations.nord).toEqual({ valeur: 20, source: "plan" });
    const b = await compte("site-h@example.com");
    expect((await b.post(`/projects/${pid}/steps/1/site/site-projet`).send({})).status).toBe(404);
  });
});
