/**
 * Liens de consultation de la Planche (cas 4, étape 7d : D11-F18-018) — intégration contre PostgreSQL : création d'une
 * copie figée (dessin relu, champ fautif nommé), lecture publique sans compte, révocation, échéance, isolation.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ajouterRectangle, modeleVide, v3 } from "@parcours/sandbox-planche-model";
import { createApp } from "../app.js";
import { LIENS_ACTIFS_MAX } from "./sandbox-consultations.js";
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
    for (let i = 0; i < 800; i++) m = ajouterRectangle(m, v3(i * 5, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const grand = JSON.parse(JSON.stringify(m));
    expect(JSON.stringify(grand).length).toBeGreaterThan(256 * 1024);
    const c = await a.post("/sandbox/consultations").send({ nom: "Grand", modele: grand, mesure: true });
    expect(c.status).toBe(201);
  });
  it("tous les liens actifs restent listés (révocables) ; 200 liens actifs au plus → 409 limite", async () => {
    const a = await compte("consult-f@example.com");
    const id = (await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", ["consult-f@example.com"])).rows[0]!.id;
    // 199 liens actifs anciens, puis 250 liens révoqués plus récents (ils repousseraient les actifs d'une liste « 200 derniers »).
    await pool.query(
      `INSERT INTO sandbox_consultations (jeton, proprietaire_id, nom, modele, mesure, cree_le)
       SELECT md5('actif' || i), $1, 'Actif ' || i, '{}'::jsonb, true, now() - interval '30 days' + i * interval '1 second' FROM generate_series(1, $2::int) i`,
      [id, LIENS_ACTIFS_MAX - 1],
    );
    await pool.query(
      `INSERT INTO sandbox_consultations (jeton, proprietaire_id, nom, modele, mesure, cree_le, revoque_le)
       SELECT md5('revoque' || i), $1, 'Révoqué ' || i, '{}'::jsonb, true, now() - interval '1 day' + i * interval '1 second', now() FROM generate_series(1, 250) i`,
      [id],
    );
    expect((await a.post("/sandbox/consultations").send({ nom: "Dernier", modele: dessin(), mesure: true })).status).toBe(201);
    const trop = await a.post("/sandbox/consultations").send({ nom: "Trop", modele: dessin(), mesure: true });
    expect(trop.status).toBe(409);
    expect(trop.body.error).toBe("limite");
    const liens = (await a.get("/sandbox/consultations")).body.liens as { jeton: string; revoqueLe: string | null }[];
    expect(liens.filter((l) => l.revoqueLe === null)).toHaveLength(LIENS_ACTIFS_MAX);
    expect(liens.filter((l) => l.revoqueLe !== null)).toHaveLength(200);
    // Révoquer libère une place.
    const plusAncien = liens.filter((l) => l.revoqueLe === null).at(-1)!.jeton;
    expect((await a.post(`/sandbox/consultations/${plusAncien}/revoquer`).send({})).status).toBe(200);
    expect((await a.post("/sandbox/consultations").send({ nom: "Après", modele: dessin(), mesure: true })).status).toBe(201);
  });
});
