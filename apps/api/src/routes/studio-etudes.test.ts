/** Intégration contre PostgreSQL, comme les autres tests de routes : jamais une simulation des droits SQL. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { pool } from "../db/client.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

async function account(email: string) {
  const client = request.agent(app);
  const result = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(result.status).toBe(201);
  return { client, id: result.body.id as string };
}
async function project(client: ReturnType<typeof request.agent>, code: string) {
  const result = await client.post("/projects").send({ code, name: `${code} — dossier` });
  expect(result.status).toBe(201);
  return result.body.id as string;
}
const etudes = (pid: string) => `/projects/${pid}/studio/etudes`;

describe("études de Studio", () => {
  it("création, liste ordonnée et lecture par le propriétaire", async () => {
    const owner = await account("etudes-owner@example.com");
    const pid = await project(owner.client, "P.ETU");
    expect((await owner.client.get(etudes(pid))).body).toEqual([]);
    const a = await owner.client.post(etudes(pid)).send({ nom: "  Implantation  ", description: "Première hypothèse" });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ projectId: pid, nom: "Implantation", description: "Première hypothèse" });
    const b = await owner.client.post(etudes(pid)).send({ nom: "Façades" });
    expect(b.status).toBe(201);
    expect(b.body.description).toBe("");
    expect((await owner.client.get(etudes(pid))).body.map((e: { nom: string }) => e.nom)).toEqual(["Implantation", "Façades"]);
    expect((await owner.client.get(`${etudes(pid)}/${a.body.id}`)).body.nom).toBe("Implantation");
  });

  it("nom requis, borné, et unique dans le projet sans tenir compte de la casse", async () => {
    const owner = await account("etudes-noms@example.com");
    const pid = await project(owner.client, "P.NOMS");
    expect((await owner.client.post(etudes(pid)).send({ nom: "   " })).status).toBe(400);
    expect((await owner.client.post(etudes(pid)).send({ nom: "x".repeat(121) })).status).toBe(400);
    expect((await owner.client.post(etudes(pid)).send({ nom: "Variante nord" })).status).toBe(201);
    const doublon = await owner.client.post(etudes(pid)).send({ nom: "variante NORD" });
    expect(doublon.status).toBe(409);
    const autre = await project(owner.client, "P.AUTRE");
    expect((await owner.client.post(etudes(autre)).send({ nom: "Variante nord" })).status).toBe(201);
  });

  it("deux créations simultanées du même nom : une seule étude, l'autre reçoit 409", async () => {
    const owner = await account("etudes-course@example.com");
    const pid = await project(owner.client, "P.COURSE");
    const [r1, r2] = await Promise.all([owner.client.post(etudes(pid)).send({ nom: "Même nom" }), owner.client.post(etudes(pid)).send({ nom: "Même nom" })]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect((await owner.client.get(etudes(pid))).body).toHaveLength(1);
  });

  it("droits relus par le serveur : lecteur consulte sans créer, inconnu ne voit rien, étude d'un autre projet introuvable", async () => {
    expect((await request(app).get("/projects/x/studio/etudes")).status).toBe(401);
    const owner = await account("etudes-prop@example.com");
    const reader = await account("etudes-lecteur@example.com");
    const stranger = await account("etudes-inconnu@example.com");
    const pid = await project(owner.client, "P.DROITS");
    const etude = (await owner.client.post(etudes(pid)).send({ nom: "Partagée" })).body;
    expect((await owner.client.post(`/projects/${pid}/members`).send({ email: "etudes-lecteur@example.com", role: "lecteur" })).status).toBe(201);
    expect((await reader.client.get(etudes(pid))).body).toHaveLength(1);
    expect((await reader.client.post(etudes(pid)).send({ nom: "Interdite" })).status).toBe(403);
    expect((await stranger.client.get(etudes(pid))).status).toBe(404);
    expect((await stranger.client.get(`${etudes(pid)}/${etude.id}`)).status).toBe(404);
    const autre = await project(stranger.client, "P.ETRANGER");
    expect((await stranger.client.get(`${etudes(autre)}/${etude.id}`)).status).toBe(404);
  });
});
