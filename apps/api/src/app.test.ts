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
  await pool.query("TRUNCATE architectural_objects, levels, programme_repartitions, project_steps, projects, sessions, users CASCADE");
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
    const patch = await intruder.patch(`/projects/${project.body.id}/steps/2`).send({ fields: { f1: "x" } });
    expect(patch.status).toBe(404);
    const decide = await intruder.post(`/projects/${project.body.id}/steps/2/harmonie/H01-A`).send({ status: "retained" });
    expect(decide.status).toBe(404);
    const programme = await intruder.put(`/projects/${project.body.id}/programme`).send({ type: "tertiaire", baseArea: 1, mode: "cible", custom: {} });
    expect(programme.status).toBe(404);
  });

  it("serves each step with the prototype's real form, transmission targets and three Harmonie proposals", async () => {
    const client = await registerAndLogin("forms@example.com");
    const project = await client.post("/projects").send({ code: "P.902", name: "Formulaires" });
    const steps = (await client.get(`/projects/${project.body.id}/steps`)).body as Array<Record<string, any>>;
    const byNumber = (n: number) => steps.find((s) => s.number === n)!;

    // 17 étapes à formulaire métier, 1 synthèse (21), 3 étapes outillées sans formulaire (01, 10, 11).
    expect(byNumber(2).form.fields.map((f: { key: string }) => f.key)).toEqual(["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12"]);
    expect(byNumber(2).form.fields[0]).toEqual({ key: "f1", label: "Zonage / règlement applicable", type: "text" });
    expect(byNumber(2).form.intro).toBe("Appliquer les règles à la parcelle réelle et produire une enveloppe constructible traçable.");
    expect(byNumber(14).form.fields.filter((f: { type: string }) => f.type === "number")).toHaveLength(10);
    expect(byNumber(19).form.fields.find((f: { key: string }) => f.key === "f8")).toEqual({ key: "f8", label: "Date de décision", type: "date" });
    expect(byNumber(21).form.fields).toEqual([{ key: "summary", label: "Synthèse / livrable", type: "textarea" }]);
    expect(byNumber(1).form).toBeNull();
    expect(byNumber(10).form).toBeNull();
    expect(byNumber(11).form).toBeNull();

    expect(byNumber(2).transmitsTo).toEqual([6, 9, 10, 16]);
    expect(byNumber(2).proposals.map((q: { id: string; ref: string }) => [q.id, q.ref])).toEqual([["H01-A", "H02-A"], ["H01-B", "H02-B"], ["H01-C", "H02-C"]]);
    expect(byNumber(2).proposals[0].title).toBe("Préserver l’intention, déplacer le dispositif");
    expect(byNumber(2).proposals[0].stateLabel).toBe("Proposée");
    expect(byNumber(2).retainedCount).toBe(0);
    // Sans type de bâtiment déclaré, le profil est « Type à préciser », comme dans le prototype.
    expect(byNumber(2).profile.label).toBe("Type à préciser");
    expect(byNumber(2).proposals[0].why).toBe("Comparer accueil extérieur, espace ouvert et desserte sans supposer un usage intérieur.");
  });

  it("stores form answers with the field's type, rejects unknown keys and bad numbers, and only marks 'termine' on request", async () => {
    const client = await registerAndLogin("answers@example.com");
    const project = await client.post("/projects").send({ code: "P.903", name: "Réponses" });
    const url = `/projects/${project.body.id}/steps/14`;

    const unknown = await client.patch(url).send({ fields: { zz: "x" } });
    expect(unknown.status).toBe(400);
    const notNumber = await client.patch(url).send({ fields: { f1: "mille" } });
    expect(notNumber.status).toBe(400);

    // Scénario rejoué du prototype : f1=1000, f9=400 saisis comme texte d'un <input type=number>.
    const saved = await client.patch(url).send({ fields: { f1: "1000", f9: "400" } });
    expect(saved.status).toBe(200);
    expect(saved.body.content.fields).toEqual({ f1: 1000, f9: 400 });
    // Une saisie fait passer l'étape « en cours », jamais « terminée » toute seule.
    expect(saved.body.status).toBe("en-cours");

    const reread = (await client.get(url)).body;
    expect(reread.content.fields).toEqual({ f1: 1000, f9: 400 });

    const cleared = await client.patch(url).send({ fields: { f9: null } });
    expect(cleared.body.content.fields).toEqual({ f1: 1000 });

    const done = await client.patch(url).send({ status: "termine" });
    expect(done.body.status).toBe("termine");

    // Étape 19 : seules les quatre issues du prototype sont acceptées.
    const badDecision = await client.patch(`/projects/${project.body.id}/steps/19`).send({ fields: { decision: "Peut-être" } });
    expect(badDecision.status).toBe(400);
    const goodDecision = await client.patch(`/projects/${project.body.id}/steps/19`).send({ fields: { decision: "GO sous conditions", f8: "2026-10-01" } });
    expect(goodDecision.body.content.fields).toEqual({ decision: "GO sous conditions", f8: "2026-10-01" });
    const badDate = await client.patch(`/projects/${project.body.id}/steps/19`).send({ fields: { f8: "demain" } });
    expect(badDate.status).toBe(400);
  });

  it("applies the Harmonie rules server-side: retain, replace the retained variant, refuse an unmotivated dismissal, reset downstream steps and a premature GO", async () => {
    const client = await registerAndLogin("harmonie@example.com");
    const project = await client.post("/projects").send({ code: "P.904", name: "Harmonie" });
    const pid = project.body.id as string;

    // Étape 6 (cible de l'étape 2) marquée terminée, et un GO déjà pris à l'étape 19.
    await client.patch(`/projects/${pid}/steps/6`).send({ status: "termine" });
    await client.patch(`/projects/${pid}/steps/19`).send({ fields: { decision: "GO" }, status: "termine" });

    const retained = await client.post(`/projects/${pid}/steps/2/harmonie/H01-A`).send({ status: "retained" });
    expect(retained.status).toBe(200);
    expect(retained.body.retainedCount).toBe(1);
    expect(retained.body.proposals[0].stateLabel).toBe("Retenue");
    expect(retained.body.status).toBe("en-cours");

    const replaced = await client.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "retained" });
    expect(replaced.body.retainedCount).toBe(1);
    expect(replaced.body.proposals[0].decision.status).toBe("dismissed");
    expect(replaced.body.proposals[0].decision.notes).toBe("Remplacée par H01-B");

    const unmotivated = await client.post(`/projects/${pid}/steps/2/harmonie/H01-C`).send({ status: "dismissed", notes: "non" });
    expect(unmotivated.status).toBe(422);
    expect(unmotivated.body.message).toBe("Décrivez votre adaptation ou votre motif (8 caractères minimum).");

    const drawnTooEarly = await client.post(`/projects/${pid}/steps/2/harmonie/H01-C`).send({ status: "drawn", owner: "X", proof: "plan de principe" });
    expect(drawnTooEarly.status).toBe(422);

    const steps = (await client.get(`/projects/${pid}/steps`)).body as Array<Record<string, any>>;
    // L'étape 6 recevait l'intention : elle n'est plus « terminée ».
    expect(steps.find((s) => s.number === 6)!.status).toBe("en-cours");
    expect(steps.find((s) => s.number === 6)!.incoming.map((q: { ref: string }) => q.ref)).toEqual(["H02-B"]);
    // Le GO pris avant une intention modifiée en amont est rétrogradé.
    expect(steps.find((s) => s.number === 19)!.content.fields.decision).toBe("À reprendre");
    expect(steps.find((s) => s.number === 19)!.status).toBe("en-cours");
    // Une étape qui n'était pas ciblée reste intacte.
    expect(steps.find((s) => s.number === 3)!.status).toBe("a-faire");
  });

  it("exposes the programme repartition with the prototype's defaults, recomputes on update and validates the type", async () => {
    const client = await registerAndLogin("programme@example.com");
    const project = await client.post("/projects").send({ code: "P.905", name: "Programme" });
    const url = `/projects/${project.body.id}/programme`;

    const defaults = (await client.get(url)).body;
    expect(defaults.repartition).toMatchObject({ type: "tertiaire", baseArea: 673, mode: "cible", custom: {}, stored: false });
    expect(defaults.totals.supportPercent).toBe(28);
    expect(defaults.totals.supportArea).toBeCloseTo(188.44, 2);
    expect(defaults.rows.map((r: { key: string; ratio: number }) => [r.key, r.ratio])).toEqual([["circulation", 15], ["technique", 6], ["sanitaires", 2], ["convivialite", 5]]);
    expect(defaults.programmeCase).toBeNull();

    const bad = await client.put(url).send({ type: "chalet", baseArea: 500, mode: "cible", custom: {} });
    expect(bad.status).toBe(400);

    const updated = await client.put(url).send({ type: "residentiel", baseArea: 500, mode: "max", custom: { circulation: 20 } });
    expect(updated.status).toBe(200);
    expect(updated.body.repartition.stored).toBe(true);
    expect(updated.body.rows.find((r: { key: string }) => r.key === "circulation").ratio).toBe(20);
    expect(updated.body.rows.find((r: { key: string }) => r.key === "sanitaires").ratio).toBe(0);
    // Le type choisi ici pilote le profil Harmonie des étapes.
    const step4 = (await client.get(`/projects/${project.body.id}/steps/4`)).body;
    expect(step4.profile.label).toBe("Habitation");
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

    // « Réponses renseignées » : les 12 rubriques de l'étape 02, chaque valeur nommant sa nature.
    const step2 = steps.body.find((s: { number: number }) => s.number === 2);
    expect(Object.keys(step2.content.fields)).toHaveLength(12);
    expect(step2.content.fields.f1).toMatch(/^\[DONNÉE \/ CALCUL DU FICHIER SOURCE\]/);
    expect(step2.content.fields.f2).toMatch(/^\[HYPOTHÈSE RETENUE POUR L’EXEMPLE\]/);
    // Le choix Harmonie illustré (A) est retenu, avec le responsable déclaré par l'exemple.
    expect(step2.retainedCount).toBe(1);
    expect(step2.proposals[0].decision).toMatchObject({ status: "retained", owner: "Maître d’ouvrage / programmiste — rôles de démonstration" });
    expect(step2.profile.label).toBe("Formation & bureaux");
    // Étape 14 : les montants sont des nombres, le KPI finance est donc calculable (24 M = 24 M, solde 0).
    const step14 = steps.body.find((s: { number: number }) => s.number === 14);
    expect(step14.content.fields.f1).toBe(3200000);
    expect(step14.content.fields.f10).toBe(14000000);

    // Répartition liée au modèle : sommes calculées depuis les 74 fiches d'espaces, pas recopiées.
    const programme = (await client.get(`/projects/${imported.body.id}/programme`)).body;
    expect(programme.repartition.type).toBe("mixte");
    expect(programme.programmeCase.spaceCount).toBe(74);
    expect(programme.programmeCase.sums.principal).toBeCloseTo(1366.02, 1);
    expect(programme.programmeCase.sums.circulation).toBeCloseTo(567.49, 1);
    expect(programme.programmeCase.sums.programme).toBeCloseTo(2932.26, 1);
  });

  it("404s on an unknown example id instead of silently creating an empty project", async () => {
    const client = await registerAndLogin("badimport@example.com");
    const res = await client.post("/examples/does-not-exist/import");
    expect(res.status).toBe(404);
    const listed = await client.get("/projects");
    expect(listed.body).toHaveLength(0);
  });

  it("imports P.118's complete native architecture (levels, objects, elevation precision, relations) — not just the step text", async () => {
    const client = await registerAndLogin("architecture@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    expect(imported.status).toBe(201);
    const projectId = imported.body.id as string;

    const levelsRes = await client.get(`/projects/${projectId}/levels`);
    expect(levelsRes.status).toBe(200);
    // Les 6 niveaux du modèle natif (sous-sol à R+3), jamais arrondis.
    expect(levelsRes.body).toHaveLength(6);
    const mezz = levelsRes.body.find((l: { id: string }) => l.id.endsWith("_mezz"));
    expect(mezz.elevation).toBeCloseTo(3.2, 10);
    const ss = levelsRes.body.find((l: { id: string }) => l.id.endsWith("_ss"));
    expect(ss.elevation).toBeCloseTo(-3.2, 10);

    const objectsRes = await client.get(`/projects/${projectId}/levels/${mezz.id}/objects`);
    expect(objectsRes.status).toBe(200);
    // La mezzanine (cœur de cet exemple) porte bien ses murs, poteaux, portes,
    // fenêtres et escaliers réels — pas un sous-ensemble choisi pour la démo.
    const kinds = new Set(objectsRes.body.map((o: { kind: string }) => o.kind));
    for (const expected of ["wall", "column", "door", "window", "stairs", "room"]) {
      expect(kinds.has(expected)).toBe(true);
    }
    // Les portes/fenêtres référencent leur mur hôte via une relation remappée
    // vers l'id (préfixé projet) réellement inséré, pas l'id natif brut.
    const door = objectsRes.body.find((o: { kind: string }) => o.kind === "door");
    expect(door.relations).toEqual([{ kind: "hosted-by", targetId: expect.stringContaining(`${projectId}_`) }]);
    const hostedWall = objectsRes.body.find((o: { id: string }) => o.id === door.relations[0].targetId);
    expect(hostedWall).toBeDefined();
    expect(hostedWall.kind).toBe("wall");

    // Un deuxième import du même exemple ne doit pas entrer en collision
    // d'identifiants avec le premier (ids natifs préfixés par projet).
    const imported2 = await client.post("/examples/p118-exemple-complet/import");
    expect(imported2.status).toBe(201);
    expect(imported2.body.id).not.toBe(projectId);
  });
});
