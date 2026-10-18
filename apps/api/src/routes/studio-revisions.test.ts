/** Intégration contre PostgreSQL : révisions immuables d'une variante de Studio. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { studio2d } from "@parcours/domain-model";
import { createApp } from "../app.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { pool } from "../db/client.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

async function account(email: string) {
  const client = request.agent(app);
  const r = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(r.status).toBe(201);
  return client;
}
async function variante(client: ReturnType<typeof request.agent>, code: string) {
  const pid = (await client.post("/projects").send({ code, name: `${code} — dossier` })).body.id as string;
  const eid = (await client.post(`/projects/${pid}/studio/etudes`).send({ nom: "Étude" })).body.id as string;
  const vid = (await client.post(`/projects/${pid}/studio/etudes/${eid}/variantes`).send({ nom: "A" })).body.id as string;
  return { pid, eid, vid, url: `/projects/${pid}/studio/etudes/${eid}/variantes/${vid}/revisions` };
}
const avecLigne = (bx = 4) => {
  const r = studio2d.ajouterLigne(studio2d.documentVide(), { id: "l1", calqueId: "calque-1", a: { x: 0, y: 0 }, b: { x: bx, y: 0 } });
  if (!r.ok) throw new Error(r.erreur);
  return r.contenu;
};
let n = 0;
const rid = () => `req-test-${++n}-${Date.now()}`;

describe("révisions de Studio", () => {
  it("première révision, puis suivante sur la tête : numéros, parent, même document, empreinte, relecture exacte", async () => {
    const owner = await account("rev-owner@example.com");
    const { url } = await variante(owner, "P.REV");
    expect((await owner.get(url)).body).toEqual([]);
    const r1 = await owner.post(url).send({ requestId: rid(), baseRevisionId: null, contenu: avecLigne() });
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ numero: 1, parentId: null, schemaVersion: studio2d.SCHEMA_DOCUMENT2D });
    expect(r1.body.documentId).toMatch(/^doc/);
    expect(r1.body.empreinte).toMatch(/^sha256:[0-9a-f]{64}$/);
    const r2 = await owner.post(url).send({ requestId: rid(), baseRevisionId: r1.body.id, contenu: avecLigne(6.25) });
    expect(r2.status).toBe(201);
    expect(r2.body).toMatchObject({ numero: 2, parentId: r1.body.id, documentId: r1.body.documentId });
    const liste = (await owner.get(url)).body;
    expect(liste.map((r: { numero: number }) => r.numero)).toEqual([1, 2]);
    expect(liste[0].contenu).toBeUndefined();
    // L'ancienne révision reste lisible telle quelle.
    expect((await owner.get(`${url}/${r1.body.id}`)).body.contenu.primitives[0].b).toEqual({ x: 4, y: 0 });
    expect((await owner.get(`${url}/${r2.body.id}`)).body.contenu.primitives[0].b).toEqual({ x: 6.25, y: 0 });
  });

  it("base dépassée → conflit, rien d'écrit ; même requête rejouée → même révision ; requête réutilisée autrement → 409", async () => {
    const owner = await account("rev-conflit@example.com");
    const { url } = await variante(owner, "P.RCONF");
    const req1 = rid();
    const r1 = await owner.post(url).send({ requestId: req1, baseRevisionId: null, contenu: avecLigne() });
    const rejeu = await owner.post(url).send({ requestId: req1, baseRevisionId: null, contenu: avecLigne() });
    expect(rejeu.status).toBe(200);
    expect(rejeu.body).toMatchObject({ id: r1.body.id, rejoue: true });
    expect((await owner.post(url).send({ requestId: req1, baseRevisionId: null, contenu: avecLigne(9) })).status).toBe(409);
    const perimee = await owner.post(url).send({ requestId: rid(), baseRevisionId: null, contenu: avecLigne(7) });
    expect(perimee.status).toBe(409);
    expect(perimee.body).toMatchObject({ error: "conflit_revision", teteRevisionId: r1.body.id, teteNumero: 1 });
    expect((await owner.post(url).send({ requestId: rid(), baseRevisionId: "rev_inconnue", contenu: avecLigne(7) })).status).toBe(409);
    expect((await owner.get(url)).body).toHaveLength(1);
  });

  it("deux enregistrements simultanés sur la même base : un seul passe, l'autre reçoit un conflit", async () => {
    const owner = await account("rev-course@example.com");
    const { url } = await variante(owner, "P.RCOURSE");
    const [a, b] = await Promise.all([owner.post(url).send({ requestId: rid(), baseRevisionId: null, contenu: avecLigne(2) }), owner.post(url).send({ requestId: rid(), baseRevisionId: null, contenu: avecLigne(3) })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((await owner.get(url)).body).toHaveLength(1);
  });

  it("contenu invalide refusé en entier : unité absente, longueur nulle, champ étranger", async () => {
    const owner = await account("rev-invalide@example.com");
    const { url } = await variante(owner, "P.RINV");
    const { unite: _u, ...sansUnite } = avecLigne();
    for (const contenu of [sansUnite, { ...avecLigne(), primitives: [{ id: "l1", type: "ligne", calqueId: "calque-1", a: { x: 1, y: 1 }, b: { x: 1, y: 1 } }] }]) {
      const r = await owner.post(url).send({ requestId: rid(), baseRevisionId: null, contenu });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("document_invalide");
    }
    expect((await owner.post(url).send({ requestId: "x", baseRevisionId: null, contenu: avecLigne() })).status).toBe(400);
    expect((await owner.get(url)).body).toEqual([]);
  });

  it("une révision est immuable en base", async () => {
    const owner = await account("rev-immuable@example.com");
    const { url } = await variante(owner, "P.RIMM");
    const r1 = await owner.post(url).send({ requestId: rid(), baseRevisionId: null, contenu: avecLigne() });
    await expect(pool.query("UPDATE studio_revisions SET empreinte = 'x' WHERE id = $1", [r1.body.id])).rejects.toThrow(/immuable/);
  });

  it("droits relus par le serveur : lecteur lit sans enregistrer ; inconnu et parenté croisée → 404", async () => {
    const owner = await account("rev-prop@example.com");
    const reader = await account("rev-lecteur@example.com");
    const stranger = await account("rev-inconnu@example.com");
    const v = await variante(owner, "P.RDROITS");
    const r1 = await owner.post(v.url).send({ requestId: rid(), baseRevisionId: null, contenu: avecLigne() });
    expect((await owner.post(`/projects/${v.pid}/members`).send({ email: "rev-lecteur@example.com", role: "lecteur" })).status).toBe(201);
    expect((await reader.get(v.url)).body).toHaveLength(1);
    expect((await reader.get(`${v.url}/${r1.body.id}`)).status).toBe(200);
    expect((await reader.post(v.url).send({ requestId: rid(), baseRevisionId: r1.body.id, contenu: avecLigne(5) })).status).toBe(403);
    expect((await stranger.get(v.url)).status).toBe(404);
    expect((await stranger.get(`${v.url}/${r1.body.id}`)).status).toBe(404);
    // Variante d'une autre étude du même projet : la révision n'y est pas lisible.
    const e2 = (await owner.post(`/projects/${v.pid}/studio/etudes`).send({ nom: "Autre" })).body.id as string;
    const v2 = (await owner.post(`/projects/${v.pid}/studio/etudes/${e2}/variantes`).send({ nom: "B" })).body.id as string;
    expect((await owner.get(`/projects/${v.pid}/studio/etudes/${e2}/variantes/${v2}/revisions/${r1.body.id}`)).status).toBe(404);
    expect((await owner.get(`/projects/${v.pid}/studio/etudes/${e2}/variantes/${v.vid}/revisions`)).status).toBe(404);
  });
});
