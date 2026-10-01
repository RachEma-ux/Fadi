/**
 * Tests de routes contre une vraie base Postgres (fadi_test, PostGIS inclus)
 * — pas de mock de la couche base de données : l'objectif inclut vérifier
 * que l'autorisation par ressource (ownerId) fonctionne réellement, ce
 * qu'un mock masquerait. Nécessite DATABASE_URL pointant sur fadi_test et
 * le schéma déjà appliqué (`npm run db:migrate`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { pool } from "./db/client.js";

const app = createApp();

async function resetDb() {
  // L'ordre respecte les clés étrangères (CASCADE serait aussi suffisant,
  // mais l'ordre explicite documente les dépendances).
  await pool.query("TRUNCATE architectural_objects, levels, project_steps, projects, sessions, users CASCADE");
}

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await pool.end();
});

function agent() {
  return request.agent(app);
}

async function registerAndLogin(email: string) {
  const client = agent();
  const res = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(res.status).toBe(201);
  return client;
}

describe("auth", () => {
  it("rejects a password shorter than 8 characters", async () => {
    const res = await agent().post("/auth/register").send({ email: "a@example.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("registers, sets a session cookie, and exposes /auth/me", async () => {
    const client = await registerAndLogin("alice@example.com");
    const me = await client.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("alice@example.com");
  });

  it("rejects a duplicate registration with a generic error", async () => {
    await registerAndLogin("bob@example.com");
    const res = await agent().post("/auth/register").send({ email: "bob@example.com", password: "whatever123" });
    expect(res.status).toBe(409);
  });

  it("rejects login with a wrong password using the same error as an unknown user", async () => {
    await registerAndLogin("carol@example.com");
    const wrongPassword = await agent().post("/auth/login").send({ email: "carol@example.com", password: "nope12345" });
    const unknownUser = await agent().post("/auth/login").send({ email: "nobody@example.com", password: "nope12345" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownUser.body.error);
  });

  it("logs in with correct credentials and logs out clearing the session", async () => {
    await registerAndLogin("dora@example.com");
    const client = agent();
    const login = await client.post("/auth/login").send({ email: "dora@example.com", password: "correct-horse-battery" });
    expect(login.status).toBe(200);
    const logout = await client.post("/auth/logout");
    expect(logout.status).toBe(204);
    const me = await client.get("/auth/me");
    expect(me.status).toBe(401);
  });
});

describe("projects", () => {
  it("requires authentication", async () => {
    const res = await agent().get("/projects");
    expect(res.status).toBe(401);
  });

  it("creates and lists a project for the authenticated owner only", async () => {
    const client = await registerAndLogin("owner@example.com");
    const created = await client.post("/projects").send({ code: "P.118", name: "Pilote P.118" });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe("P.118");
    expect(created.body.modelRevision).toBe(0);

    const listed = await client.get("/projects");
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
  });

  it("rejects an invalid project code", async () => {
    const client = await registerAndLogin("codecheck@example.com");
    const res = await client.post("/projects").send({ code: "has a space", name: "x" });
    expect(res.status).toBe(400);
  });

  it("never lets one user read, list, or delete another user's project", async () => {
    const owner = await registerAndLogin("owner2@example.com");
    const created = await owner.post("/projects").send({ code: "P.001", name: "Projet privé" });
    const projectId = created.body.id as string;

    const intruder = await registerAndLogin("intruder@example.com");
    const getAttempt = await intruder.get(`/projects/${projectId}`);
    const deleteAttempt = await intruder.delete(`/projects/${projectId}`);
    const list = await intruder.get("/projects");

    expect(getAttempt.status).toBe(404);
    expect(deleteAttempt.status).toBe(404);
    expect(list.body).toHaveLength(0);

    // Confirms the delete attempt truly did nothing (not a 404-but-still-deleted bug).
    const ownerStillSeesIt = await owner.get(`/projects/${projectId}`);
    expect(ownerStillSeesIt.status).toBe(200);
  });
});

describe("levels and architectural objects", () => {
  async function setupProjectWithLevel(email: string) {
    const client = await registerAndLogin(email);
    const project = await client.post("/projects").send({ code: "P.118", name: "Pilote" });
    const level = await client.post(`/projects/${project.body.id}/levels`).send({ label: "RDC", elevation: 0, position: 0 });
    return { client, projectId: project.body.id as string, levelId: level.body.id as string };
  }

  it("creates an architectural object and advances the project's modelRevision atomically", async () => {
    const { client, projectId, levelId } = await setupProjectWithLevel("modeler@example.com");

    const before = await client.get(`/projects/${projectId}`);
    expect(before.body.modelRevision).toBe(0);

    const wall = await client
      .post(`/projects/${projectId}/levels/${levelId}/objects`)
      .send({ kind: "wall", properties: { a: [0, 0], b: [4, 0], thickness: 0.2 }, relations: [] });
    expect(wall.status).toBe(201);
    expect(wall.body.modelRevision).toBe(1);

    const after = await client.get(`/projects/${projectId}`);
    expect(after.body.modelRevision).toBe(1);

    const listed = await client.get(`/projects/${projectId}/levels/${levelId}/objects`);
    expect(listed.body).toHaveLength(1);
  });

  it("advances modelRevision again on delete, and only while something was actually deleted", async () => {
    const { client, projectId, levelId } = await setupProjectWithLevel("deleter@example.com");
    const wall = await client
      .post(`/projects/${projectId}/levels/${levelId}/objects`)
      .send({ kind: "wall", properties: {}, relations: [] });

    const del = await client.delete(`/projects/${projectId}/levels/${levelId}/objects/${wall.body.id}`);
    expect(del.status).toBe(204);
    const afterDelete = await client.get(`/projects/${projectId}`);
    expect(afterDelete.body.modelRevision).toBe(2);

    // Deleting an object that no longer exists must not bump the revision again.
    const delAgain = await client.delete(`/projects/${projectId}/levels/${levelId}/objects/${wall.body.id}`);
    expect(delAgain.status).toBe(204);
    const stillTwo = await client.get(`/projects/${projectId}`);
    expect(stillTwo.body.modelRevision).toBe(2);
  });

  it("404s on a level or object that belongs to someone else's project", async () => {
    const mine = await setupProjectWithLevel("victim@example.com");
    const attacker = await registerAndLogin("attacker@example.com");

    const res = await attacker.get(`/projects/${mine.projectId}/levels/${mine.levelId}/objects`);
    expect(res.status).toBe(404);
  });
});

describe("Parcours steps", () => {
  it("seeds the 21 real steps — numbered 01 to 21, all 'a-faire' — on every new project", async () => {
    const client = await registerAndLogin("fresh-project@example.com");
    const project = await client.post("/projects").send({ code: "P.900", name: "Nouveau" });

    const steps = await client.get(`/projects/${project.body.id}/steps`);
    expect(steps.status).toBe(200);
    expect(steps.body).toHaveLength(21);
    expect(steps.body.map((s: { number: number }) => s.number)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(steps.body.every((s: { status: string }) => s.status === "a-faire")).toBe(true);
    // Chaque étape porte son vrai titre (pas de placeholder générique).
    expect(steps.body[0].title).toBe("Parcelle / Site existant");
  });

  it("never lets one user read another user's steps", async () => {
    const owner = await registerAndLogin("steps-owner@example.com");
    const project = await owner.post("/projects").send({ code: "P.901", name: "Privé" });
    const intruder = await registerAndLogin("steps-intruder@example.com");

    const res = await intruder.get(`/projects/${project.body.id}/steps`);
    expect(res.status).toBe(404);
  });
});

describe("examples", () => {
  it("lists the importable examples with real, non-zero counts", async () => {
    const client = await registerAndLogin("browser@example.com");
    const res = await client.get("/examples");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const complet = res.body.find((e: { id: string }) => e.id === "p118-exemple-complet");
    expect(complet.stepsWithContent).toBe(21);
  });

  it("imports an example into a new project the importing user owns, with real step content", async () => {
    const client = await registerAndLogin("importer@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    expect(imported.status).toBe(201);
    expect(imported.body.sourceExampleId).toBe("p118-exemple-complet");

    // Le projet importé appartient bien à l'utilisateur (pas une référence partagée).
    const listed = await client.get("/projects");
    expect(listed.body.map((p: { id: string }) => p.id)).toContain(imported.body.id);

    const steps = await client.get(`/projects/${imported.body.id}/steps`);
    expect(steps.body).toHaveLength(21);
    expect(steps.body.every((s: { status: string }) => s.status === "termine")).toBe(true);
    expect(steps.body[0].content.decision).toContain("B.265");
  });

  it("404s on an unknown example id instead of silently creating an empty project", async () => {
    const client = await registerAndLogin("badimport@example.com");
    const res = await client.post("/examples/does-not-exist/import");
    expect(res.status).toBe(404);
    const listed = await client.get("/projects");
    expect(listed.body).toHaveLength(0);
  });
});
