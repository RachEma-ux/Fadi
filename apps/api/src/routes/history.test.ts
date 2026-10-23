/** Intégration contre PostgreSQL, comme les autres tests de routes : jamais une simulation des droits SQL. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { countTestOperations, resetTestDatabase } from "../testing/guarded-test-pool.js";
import { pool } from "../db/client.js";
import type { HistoryEvent } from "../lib/history.js";

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

describe("historiques accessibles par dossier et par plateforme", () => {
  it("exige une session et exclut les dossiers privés de l'agrégat comme de la route directe", async () => {
    expect((await request(app).get("/projects/history")).status).toBe(401);
    const owner = await account("history-owner@example.com");
    const reader = await account("history-reader@example.com");
    const shared = await project(owner.client, "P.SHARED");
    const hidden = await project(owner.client, "P.PRIVATE");
    expect((await owner.client.post(`/projects/${shared}/members`).send({ email: "history-reader@example.com", role: "lecteur" })).status).toBe(201);
    const feed = await reader.client.get("/projects/history");
    expect(feed.status).toBe(200);
    expect(new Set((feed.body.events as HistoryEvent[]).map((event) => event.project.id))).toEqual(new Set([shared]));
    expect(JSON.stringify(feed.body)).not.toContain(hidden);
    expect((await reader.client.get(`/projects/${hidden}/history`)).status).toBe(404);
    expect((await reader.client.get(`/projects/${shared}/history`)).status).toBe(200);
    expect((await owner.client.delete(`/projects/${shared}/members/${reader.id}`)).status).toBe(204);
    expect((await reader.client.get(`/projects/${shared}/history`)).status).toBe(404);
    expect((await reader.client.get("/projects/history")).body.events).toEqual([]);
  });

  it("attribue les commandes et commentaires à leur auteur enregistré, sans créditer le lecteur ni inventer une synchronisation globale", async () => {
    const owner = await account("history-author-owner@example.com");
    const editor = await account("history-editor@example.com");
    const id = await project(owner.client, "P.AUTHOR");
    await owner.client.post(`/projects/${id}/members`).send({ email: "history-editor@example.com", role: "editeur" });
    const body = { requestId: "history-level", contract: "atelier-commands/3", baseRevision: 0, label: "Niveau du dossier", commands: [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }] };
    expect((await editor.client.post(`/projects/${id}/atelier/commands`).send(body)).status).toBe(200);
    expect((await editor.client.post(`/projects/${id}/atelier/commands`).send(body)).status).toBe(200);
    expect((await editor.client.post(`/projects/${id}/atelier/commands`).send({ ...body, requestId: "refused-stale-history" })).status).toBe(409);
    expect((await editor.client.post(`/projects/${id}/collaboration/comments`).send({ body: "Commentaire conservé", stepNumber: 1 })).status).toBe(201);
    const journal = await owner.client.get(`/projects/${id}/history`);
    const rows = journal.body.events as HistoryEvent[];
    expect(rows.filter((event) => event.source === "ledger")).toHaveLength(1);
    expect(rows.find((event) => event.kind === "modele")).toMatchObject({ authorId: editor.id, authorLabel: "history-editor@example.com", source: "ledger", revision: 1 });
    expect(rows.find((event) => event.kind === "commentaire")).toMatchObject({ authorId: editor.id, authorLabel: "history-editor@example.com", source: "record" });
    expect(rows.find((event) => event.kind === "projet")).toMatchObject({ authorId: null, authorLabel: null });
    expect(journal.body.coverage.notice).toContain("ni un audit complet");
    const platform = (await owner.client.get("/projects/history")).body.events as HistoryEvent[];
    expect(platform.filter((event) => event.source === "ledger")).toHaveLength(1);
    expect(platform.find((event) => event.source === "ledger")).toMatchObject({ authorId: editor.id, label: "Modèle enregistré sur le serveur" });
    expect(platform.find((event) => event.source === "ledger")?.detail).toContain("pas la synchronisation de tout le dossier");
  });

  it("borne l'agrégat à 300 événements avec un nombre constant de requêtes, même pour beaucoup de dossiers", async () => {
    const owner = await account("history-many@example.com");
    await pool.query("INSERT INTO projects (id, owner_id, code, name, created_at) SELECT 'history-' || n, $1, 'P.' || n, 'Dossier ' || n, TIMESTAMPTZ '2026-01-01 00:00:00Z' + n * INTERVAL '1 minute' FROM generate_series(1, 305) n", [owner.id]);
    const avant = countTestOperations(pool);
    {
      const result = await owner.client.get("/projects/history");
      expect(result.status).toBe(200);
      expect(result.body.events).toHaveLength(300);
      expect(result.body.coverage.truncated).toBe(true);
      expect(result.body.events[0].project.id).toBe("history-305");
      // Session + deux sources ; cette borne protège contre une future boucle par projet.
      expect(countTestOperations(pool) - avant).toBeLessThanOrEqual(4);
    }
  });
});
