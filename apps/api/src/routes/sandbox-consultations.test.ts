/**
 * Liens de consultation de la Planche (cas 4, étape 7d : D11-F18-018) — intégration contre PostgreSQL : création d'une
 * copie figée (dessin relu, champ fautif nommé), lecture publique sans compte, révocation, échéance, isolation.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ajouterRectangle, modeleVide, v3 } from "@parcours/sandbox-planche-model";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { inscrire } from "../test-helpers/inscription.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

async function compte(email: string) {
  const client = request.agent(app);
  const r = await inscrire(client, email, "correct-horse-battery");
  expect(r.status).toBe(201);
  return client;
}
const dessin = () => JSON.parse(JSON.stringify(ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele));

describe("Liens de consultation — /sandbox/consultations et /consultation/api", () => {
  it("crée une copie figée, la lit sans compte, la révoque", async () => {
    const a = await compte("consult-a@example.com");
    const m = dessin();
    const c = await a.post("/sandbox/consultations").send({ nom: " Maison Rivaz ", modele: m, echeance: null, mesure: true });
    expect(c.status).toBe(201);
    const jeton = c.body.lien.jeton as string;
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(c.body.lien).toMatchObject({ nom: "Maison Rivaz", echeance: null, mesure: true, revoqueLe: null });
    expect((await a.get("/sandbox/consultations")).body.liens.map((l: { jeton: string }) => l.jeton)).toEqual([jeton]);
    // Sans compte : le dessin figé, lecture seule.
    const p = await request(app).get(`/consultation/api/${jeton}`);
    expect(p.status).toBe(200);
    expect(p.headers["cache-control"]).toContain("no-store");
    expect(p.body).toMatchObject({ nom: "Maison Rivaz", mesure: true });
    expect(Object.keys(p.body.modele.racine.faces)).toHaveLength(1);
    // Révoqué : indisponible, sans dire pourquoi.
    const r = await a.post(`/sandbox/consultations/${jeton}/revoquer`).send({});
    expect(r.status).toBe(200);
    expect(r.body.lien.revoqueLe).not.toBeNull();
    const q = await request(app).get(`/consultation/api/${jeton}`);
    expect(q.status).toBe(404);
    expect(q.body.error).toBe("indisponible");
  });

  it("échéance passée : indisponible ; échéance future : lisible ; champ fautif nommé", async () => {
    const a = await compte("consult-b@example.com");
    expect((await a.post("/sandbox/consultations").send({ nom: "", modele: dessin(), mesure: true })).body.champs).toEqual(["nom"]);
    expect((await a.post("/sandbox/consultations").send({ nom: "A", modele: dessin(), mesure: true, echeance: "2026-02-31" })).body.champs).toEqual(["echeance"]);
    expect((await a.post("/sandbox/consultations").send({ nom: "A", modele: { racine: 3 }, mesure: true })).body.champs).toEqual(["modele"]);
    expect((await a.post("/sandbox/consultations").send({ nom: "A", modele: dessin(), mesure: "oui" })).body.champs).toEqual(["mesure"]);
    const passe = await a.post("/sandbox/consultations").send({ nom: "A", modele: dessin(), mesure: false, echeance: "2020-01-01" });
    expect((await request(app).get(`/consultation/api/${passe.body.lien.jeton}`)).status).toBe(404);
    const futur = await a.post("/sandbox/consultations").send({ nom: "A", modele: dessin(), mesure: false, echeance: "2099-12-31" });
    const lu = await request(app).get(`/consultation/api/${futur.body.lien.jeton}`);
    expect(lu.status).toBe(200);
    expect(lu.body.mesure).toBe(false);
    expect((await request(app).get("/consultation/api/inconnu")).status).toBe(404);
  });

  it("compte exigé pour créer ; un autre compte ne voit ni ne révoque", async () => {
    expect((await request(app).get("/sandbox/consultations")).status).toBe(401);
    const a = await compte("consult-c@example.com");
    const b = await compte("consult-d@example.com");
    const c = await a.post("/sandbox/consultations").send({ nom: "A", modele: dessin(), mesure: true });
    expect((await b.get("/sandbox/consultations")).body.liens).toEqual([]);
    expect((await b.post(`/sandbox/consultations/${c.body.lien.jeton}/revoquer`).send({})).status).toBe(404);
    expect((await request(app).get(`/consultation/api/${c.body.lien.jeton}`)).status).toBe(200);
  });

  it("accepte un dessin au-delà de la limite générale de 256 ko", async () => {
    const a = await compte("consult-e@example.com");
    let m = modeleVide();
    for (let i = 0; i < 400; i++) m = ajouterRectangle(m, v3(i * 5, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const grand = JSON.parse(JSON.stringify(m));
    expect(JSON.stringify(grand).length).toBeGreaterThan(256 * 1024);
    const c = await a.post("/sandbox/consultations").send({ nom: "Grand", modele: grand, mesure: true });
    expect(c.status).toBe(201);
  });
});
