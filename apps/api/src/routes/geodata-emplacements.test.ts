/**
 * « Emplacements Projets » de GeoData (27 novembre 2026) — intégration contre PostgreSQL : création, lecture, liste,
 * révision attendue (409 si périmée), validation (champ nommé), isolation entre espaces, suppression.
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

const API = "/geodata/api/emplacements";
async function compte(email: string) {
  const client = request.agent(app);
  const r = await inscrire(client, email, "correct-horse-battery");
  expect(r.status).toBe(201);
  return client;
}

describe("GeoData — emplacements (Emplacements Projets)", () => {
  it("crée, liste, lit, modifie avec la révision attendue et supprime ; une altitude absente reste absente", async () => {
    const a = await compte("empl-a@example.com");
    const c = await a.post(API).send({ lieu: "  Casablanca ", latitude: 33.57, longitude: -7.59, nord: -15 });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ lieu: "Casablanca", latitude: 33.57, longitude: -7.59, altitude: null, nord: 345, revision: 1 });
    const id = c.body.id as string;
    expect((await a.get(API)).body.emplacements.map((e: { id: string }) => e.id)).toEqual([id]);
    expect((await a.get(`${API}/${id}`)).body.lieu).toBe("Casablanca");
    const m = await a.put(`${API}/${id}`).send({ revisionAttendue: 1, lieu: "Casa", latitude: 33.6, longitude: -7.6, altitude: 12.5, nord: 10 });
    expect(m.status).toBe(200);
    expect(m.body).toMatchObject({ lieu: "Casa", altitude: 12.5, nord: 10, revision: 2 });
    const perimee = await a.put(`${API}/${id}`).send({ revisionAttendue: 1, lieu: "X", latitude: 0, longitude: 0 });
    expect(perimee.status).toBe(409);
    expect(perimee.body.revisionCourante).toBe(2);
    expect((await a.delete(`${API}/${id}`)).status).toBe(204);
    expect((await a.get(`${API}/${id}`)).status).toBe(404);
  });

  it("refuse une saisie invalide en nommant le champ ; exige la révision pour modifier", async () => {
    const a = await compte("empl-b@example.com");
    expect((await a.post(API).send({ lieu: "", latitude: 0, longitude: 0 })).body.champs).toEqual(["lieu"]);
    expect((await a.post(API).send({ lieu: "A", latitude: 95, longitude: 0 })).body.champs).toEqual(["latitude"]);
    expect((await a.post(API).send({ lieu: "A", latitude: 0, longitude: 200 })).body.champs).toEqual(["longitude"]);
    const c = await a.post(API).send({ lieu: "A", latitude: 0, longitude: 0 });
    expect((await a.put(`${API}/${c.body.id}`).send({ lieu: "B", latitude: 0, longitude: 0 })).status).toBe(400);
  });

  it("isolation : un autre compte ne voit, ne modifie ni ne supprime l'emplacement ; sans session : 401", async () => {
    const a = await compte("empl-c@example.com");
    const b = await compte("empl-d@example.com");
    const c = await a.post(API).send({ lieu: "Rabat", latitude: 34.02, longitude: -6.83 });
    expect((await b.get(API)).body.emplacements).toEqual([]);
    expect((await b.get(`${API}/${c.body.id}`)).status).toBe(404);
    expect((await b.put(`${API}/${c.body.id}`).send({ revisionAttendue: 1, lieu: "X", latitude: 0, longitude: 0 })).status).toBe(404);
    expect((await b.delete(`${API}/${c.body.id}`)).status).toBe(404);
    expect((await request(app).get(API)).status).toBe(401);
  });
});
