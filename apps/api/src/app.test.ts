/**
 * Tests de routes contre une vraie base Postgres (fadi_test, PostGIS inclus)
 * — pas de mock de la couche base de données : l'objectif inclut vérifier
 * que l'autorisation par ressource (ownerId) fonctionne réellement, ce
 * qu'un mock masquerait. Nécessite DATABASE_URL pointant sur fadi_test et
 * le schéma déjà appliqué (`npm run db:migrate`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import request from "supertest";
import { createApp } from "./app.js";
import { pool } from "./db/client.js";
import { georeferenceFromParcel } from "./lib/site-context.js";

const app = createApp();

/** Enveloppe d'un lot de commandes de l'Atelier (contrat atelier-commands/1). */
let lotN = 0;
function lot(baseRevision: number, commands: unknown[], label = "test") {
  lotN += 1;
  return { requestId: `test-${Date.now()}-${lotN}`, baseRevision, contract: "atelier-commands/1", label, commands };
}
const m = (value: number) => ({ value, unit: "m" });
const pt = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" });

async function resetDb() {
  // L'ordre respecte les clés étrangères (CASCADE serait aussi suffisant,
  // mais l'ordre explicite documente les dépendances).
  await pool.query("TRUNCATE parcels, produced_documents, project_comments, project_members, programme_cases, programme_repartitions, project_steps, step_files, projects, sessions, users CASCADE");
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

describe("hébergement : l'API sert l'application construite (WEB_DIST)", () => {
  it("serves index.html for client routes (no-cache), hashed assets as immutable, keeps API prefixes JSON, and 404s unknown files", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dist = mkdtempSync(join(tmpdir(), "fadi-web-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>Fadi</title><div id=root></div>");
    writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log(1)");
    writeFileSync(join(dist, "sw.js"), "self.addEventListener('install', () => {})");
    const previous = process.env["WEB_DIST"];
    process.env["WEB_DIST"] = dist;
    try {
      const served = createApp();
      const home = await request(served).get("/accueil").set("Accept", "text/html");
      expect(home.status).toBe(200);
      expect(home.headers["content-type"]).toMatch(/text\/html/);
      expect(home.headers["cache-control"]).toBe("no-cache");
      expect(home.text).toContain('<div id=root>');
      const deep = await request(served).get("/projets/proj_x?module=parcours&etape=2").set("Accept", "text/html");
      expect(deep.status).toBe(200);
      expect(deep.text).toContain("<title>Fadi</title>");
      const asset = await request(served).get("/assets/index-abc123.js");
      expect(asset.status).toBe(200);
      expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      const sw = await request(served).get("/sw.js");
      expect(sw.status).toBe(200);
      expect(sw.headers["cache-control"]).toBe("no-cache");
      const api = await request(served).get("/projects").set("Accept", "text/html");
      expect(api.status).toBe(401);
      expect(api.headers["content-type"]).toMatch(/application\/json/);
      expect((await request(served).get("/health")).body.status).toBe("ok");
      const missing = await request(served).get("/missing.png").set("Accept", "image/png");
      expect(missing.status).toBe(404);
      // Un fichier manquant demandé avec Accept */* (balise script) reste un 404, jamais index.html.
      expect((await request(served).get("/parcelle/absent.js").set("Accept", "*/*")).status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env["WEB_DIST"];
      else process.env["WEB_DIST"] = previous;
    }
  });
});

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

  it("stores an optional display name (Paramètres → Compte), returned by /auth/me and login, cleared with an empty value, never derived from the address", async () => {
    const client = await registerAndLogin("roch.d@example.com");
    expect((await client.get("/auth/me")).body.displayName).toBeNull();
    const saved = await client.patch("/auth/me").send({ displayName: "  Roch  " });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ email: "roch.d@example.com", displayName: "Roch" });
    expect((await client.get("/auth/me")).body.displayName).toBe("Roch");
    const relogin = await agent().post("/auth/login").send({ email: "roch.d@example.com", password: "correct-horse-battery" });
    expect(relogin.body.displayName).toBe("Roch");
    expect((await client.patch("/auth/me").send({ displayName: "x".repeat(61) })).status).toBe(400);
    expect((await client.patch("/auth/me").send({})).status).toBe(400);
    expect((await client.patch("/auth/me").send({ displayName: "" })).body.displayName).toBeNull();
    expect((await agent().patch("/auth/me").send({ displayName: "Roch" })).status).toBe(401);
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

describe("modèle typé de l'Atelier (commandes)", () => {
  async function setupProjectWithLevel(email: string) {
    const client = await registerAndLogin(email);
    const project = await client.post("/projects").send({ code: "P.118", name: "Pilote" });
    const projectId = project.body.id as string;
    const r = await client.post(`/projects/${projectId}/atelier/commands`).send(lot(0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }]));
    expect(r.status).toBe(200);
    return { client, projectId };
  }

  it("crée un mur et avance la révision du projet d'une unité, atomiquement", async () => {
    const { client, projectId } = await setupProjectWithLevel("modeler@example.com");
    expect((await client.get(`/projects/${projectId}`)).body.modelRevision).toBe(1);
    const wall = await client.post(`/projects/${projectId}/atelier/commands`).send(lot(1, [{ type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } }]));
    expect(wall.status).toBe(200);
    expect(wall.body.revision).toBe(2);
    expect((await client.get(`/projects/${projectId}`)).body.modelRevision).toBe(2);
    const model = await client.get(`/projects/${projectId}/atelier/model`);
    expect(Object.values(model.body.modele.objets).filter((o) => (o as { classe: string }).classe === "mur")).toHaveLength(1);
  });

  it("une suppression avance la révision ; supprimer un objet disparu est refusé sans rien écrire", async () => {
    const { client, projectId } = await setupProjectWithLevel("deleter@example.com");
    const wall = await client.post(`/projects/${projectId}/atelier/commands`).send(lot(1, [{ type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } }]));
    const id = wall.body.effets.crees[0] as string;
    const del = await client.post(`/projects/${projectId}/atelier/commands`).send(lot(2, [{ type: "objet.supprimer", params: { id } }]));
    expect(del.status).toBe(200);
    expect((await client.get(`/projects/${projectId}`)).body.modelRevision).toBe(3);
    const again = await client.post(`/projects/${projectId}/atelier/commands`).send(lot(3, [{ type: "objet.supprimer", params: { id } }]));
    expect(again.status).toBe(409);
    expect((await client.get(`/projects/${projectId}`)).body.modelRevision).toBe(3);
  });

  it("404 sur le modèle d'un projet d'autrui ; les anciennes routes /levels n'existent plus", async () => {
    const mine = await setupProjectWithLevel("victim@example.com");
    const attacker = await registerAndLogin("attacker@example.com");
    expect((await attacker.get(`/projects/${mine.projectId}/atelier/model`)).status).toBe(404);
    expect((await attacker.post(`/projects/${mine.projectId}/atelier/commands`).send(lot(1, [{ type: "niveau.creer", params: { nom: "X", elevation: 0 } }]))).status).toBe(404);
    expect((await mine.client.get(`/projects/${mine.projectId}/levels`)).status).toBe(404);
    expect((await mine.client.get(`/projects/${mine.projectId}/atelier/store`)).status).toBe(404);
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

    // « Documents de base intégrés » (SEED888_FILES) : 118_officiel.kmz en source de l'étape 01, ZONE-I-5.pdf de l'étape 02,
    // octets conservés (tailles du prototype), téléchargeables en pièce jointe, listés sur le projet.
    const detail = (await client.get(`/projects/${imported.body.id}`)).body;
    expect(detail.baseDocuments.caption).toBe("Scénario étudié : P.118 — pôle tertiaire, services aux entreprises & formation.");
    expect(detail.baseDocuments.files.map((f: { name: string; stepNumber: number; size: number }) => [f.name, f.stepNumber, f.size])).toEqual([
      ["118_officiel.kmz", 1, 881142],
      ["ZONE-I-5.pdf", 2, 2271817],
    ]);
    const kmz = detail.baseDocuments.files[0];
    const download = await client.get(`/projects/${imported.body.id}/steps/1/files/${kmz.id}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(download.status).toBe(200);
    expect(download.headers["content-disposition"]).toMatch(/^attachment; filename="118_officiel.kmz"/);
    expect((download.body as Buffer).length).toBe(881142);
    expect((download.body as Buffer).subarray(0, 2).toString("latin1")).toBe("PK");
    expect((await client.get(`/projects/${imported.body.id}/steps/2/files`)).body.map((f: { name: string }) => f.name)).toEqual(["ZONE-I-5.pdf"]);

    const steps = await client.get(`/projects/${imported.body.id}/steps`);
    expect(steps.body).toHaveLength(21);
    expect(steps.body.every((s: { status: string }) => s.status === "termine")).toBe(true);
    expect(steps.body[0].content.decision).toContain("B.265");

    // « Réponses renseignées » : les 12 rubriques de l'étape 02, chaque valeur nommant sa nature.
    const step2 = steps.body.find((s: { number: number }) => s.number === 2);
    expect(Object.keys(step2.content.fields)).toHaveLength(12);
    expect(step2.content.fields.f1).toMatch(/^\[DONNÉE \/ CALCUL DU FICHIER SOURCE\]/);
    expect(step2.content.fields.f2).toMatch(/^\[HYPOTHÈSE RETENUE POUR L’EXEMPLE\]/);
    // Le choix Harmonie illustré (A) est « adapté » avec la décision du récit comme texte transmis, le responsable, la preuve et la
    // fiche EX-P118-02 déclarés par l'exemple ; les autres partis sont écartés avec les alternatives comme motif (`makeProject` du prototype).
    expect(step2.retainedCount).toBe(1);
    expect(step2.proposals[0].decision).toMatchObject({ status: "adapted", owner: "Maître d’ouvrage / programmiste — rôles de démonstration", link: "EX-P118-02", adaptedText: step2.content.decision });
    expect(step2.proposals[0].text).toBe(step2.content.decision);
    expect(step2.proposals[0].stateLabel).toBe("Adaptée et retenue");
    expect(step2.proposals.slice(1).map((q: { decision: { status: string; notes: string } }) => [q.decision.status, q.decision.notes.startsWith("Alternative non retenue dans ce scénario. ")])).toEqual([
      ["dismissed", true],
      ["dismissed", true],
    ]);
    // L'étape 02 reçoit l'intention du site (01) telle que l'exemple la formule ; l'étape 03 aussi (`q.targets.push(3)` de l'exemple).
    const step1 = steps.body.find((s: { number: number }) => s.number === 1);
    expect(step2.incoming.map((q: { origin: number; text: string }) => [q.origin, q.text])).toContainEqual([1, step1.content.decision]);
    const step3 = steps.body.find((s: { number: number }) => s.number === 3);
    expect(step3.incoming.map((q: { origin: number }) => q.origin)).toContain(1);
    expect(step1.proposals.find((q: { retained: boolean }) => q.retained).targets).toEqual([2, 4, 6, 9, 10, 3]);
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

    const model = await client.get(`/projects/${projectId}/atelier/model`);
    expect(model.status).toBe(200);
    const modele = model.body.modele as { niveaux: Record<string, { elevation: number }>; objets: Record<string, { classe: string; niveauId: string; params: Record<string, unknown> }> };
    // Les 6 niveaux du modèle natif (sous-sol à R+3), jamais arrondis.
    expect(Object.keys(modele.niveaux)).toHaveLength(6);
    expect(modele.niveaux["mezz"]!.elevation).toBeCloseTo(3.2, 10);
    expect(modele.niveaux["ss"]!.elevation).toBeCloseTo(-3.2, 10);
    // La mezzanine (cœur de cet exemple) porte bien ses murs, poteaux, portes, fenêtres, escaliers et pièces réels.
    const mezz = Object.values(modele.objets).filter((o) => o.niveauId === "mezz");
    const classes = new Set(mezz.map((o) => o.classe));
    for (const attendue of ["mur", "poteau", "porte", "fenetre", "escalier", "piece"]) expect(classes.has(attendue)).toBe(true);
    // Une porte référence son mur hôte, qui existe et est un mur.
    const porte = mezz.find((o) => o.classe === "porte")!;
    expect(modele.objets[porte.params["murHoteId"] as string]?.classe).toBe("mur");
    expect(Object.keys(modele.objets)).toHaveLength(1753);

    // Un deuxième import du même exemple ne doit pas entrer en collision
    // d'identifiants avec le premier (ids natifs préfixés par projet).
    const imported2 = await client.post("/examples/p118-exemple-complet/import");
    expect(imported2.status).toBe(201);
    expect(imported2.body.id).not.toBe(projectId);
  });
});

describe("Atelier — modèle typé de l'exemple", () => {
  it("sert le modèle importé à sa révision ; une commande sur une révision périmée est refusée ; un mur ajouté au RDC est persisté", async () => {
    const client = await registerAndLogin("atelier@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;

    const model = await client.get(`/projects/${pid}/atelier/model`);
    expect(model.status).toBe(200);
    expect(model.body.revision).toBe(1);
    expect(model.body.nativeId).toBe("p118-demo-v819");
    const murs = (etat: { objets: Record<string, { classe: string; niveauId: string }> }) => Object.values(etat.objets).filter((o) => o.classe === "mur" && o.niveauId === "rdc").length;
    expect(murs(model.body.modele)).toBe(39);
    // Les calques et la parcelle cadastrale sont conservés (pas une projection aplatie).
    expect(Object.keys(model.body.modele.calques)).toContain("Escaliers");
    expect(model.body.modele.site.parcelle.origineLocale.frame).toBe("cadastral");

    const stale = await client.post(`/projects/${pid}/atelier/commands`).send(lot(0, [{ type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3.2) } }]));
    expect(stale.status).toBe(409);
    expect(stale.body.motif).toBe("revision");

    const saved = await client.post(`/projects/${pid}/atelier/commands`).send(lot(1, [{ type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3.2), calqueId: "Murs" } }]));
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(2);
    expect(murs((await client.get(`/projects/${pid}/atelier/model`)).body.modele)).toBe(40);

    // Un projet vierge n'a pas de modèle ; un autre utilisateur n'accède pas à celui-ci.
    const blank = await client.post("/projects").send({ code: "P.906", name: "Vierge" });
    expect((await client.get(`/projects/${blank.body.id}/atelier/model`)).status).toBe(404);
    const intruder = await registerAndLogin("atelier-intruder@example.com");
    expect((await intruder.get(`/projects/${pid}/atelier/model`)).status).toBe(404);
  });
});

describe("Parcelle — contrat de l'outil et transmission au modèle", () => {
  const S01 = [
    { id: "B.266", x: 321946.82, y: 347183.88 },
    { id: "B.267", x: 321954.11, y: 347215.38 },
    { id: "B.268", x: 321995.84, y: 347186.25 },
    { id: "B.265", x: 321978.68, y: 347161.67 },
  ];

  it("serves the tool's /api/parcels contract per project: list, create, revision checks, delete", async () => {
    const client = await registerAndLogin("parcelle@example.com");
    const project = await client.post("/projects").send({ code: "P.907", name: "Parcelle" });
    const base = `/projects/${project.body.id}/parcels`;

    const empty = await client.get(base);
    expect(empty.body).toMatchObject({ files: [], initialized: false });

    const id = "11111111-2222-4333-8444-555555555555";
    const created = await client.put(`${base}/${id}`).send({ data: { name: "Lot 118 · El Mansouria", crs: "EPSG:26191", points: S01, source: "s01" }, revision: 0 });
    expect(created.status).toBe(201);
    expect(created.body.file).toMatchObject({ id, number: 1, name: "Lot 118 · El Mansouria", crs: "EPSG:26191", revision: 1, boundaryCount: 4 });
    expect(created.body.file.area).toBeCloseTo(1345.5476, 3);
    expect(created.body.file.perimeter).toBeCloseTo(152.0389, 3);

    const listed = await client.get(base);
    expect(listed.body.initialized).toBe(true);
    expect(listed.body.files).toHaveLength(1);

    const stale = await client.put(`${base}/${id}`).send({ data: { name: "Lot 118", crs: "EPSG:26191", points: S01 }, revision: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatch(/modifiée dans une autre fenêtre/);
    const updated = await client.put(`${base}/${id}`).send({ data: { name: "Lot 118 corrigé", crs: "EPSG:26191", points: S01 }, revision: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.file.revision).toBe(2);

    const one = await client.get(`${base}/${id}`);
    expect(one.body.file.data.name).toBe("Lot 118 corrigé");

    const badCrs = await client.put(`${base}/other-id`).send({ data: { name: "x", crs: "EPSG:4326", points: S01 }, revision: 0 });
    expect(badCrs.status).toBe(400);

    const wrongRevision = await client.delete(`${base}/${id}`).send({ revision: 1 });
    expect(wrongRevision.status).toBe(409);
    const removed = await client.delete(`${base}/${id}`).send({ revision: 2 });
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ removed: id, files: [], next: null });
    // Après suppression, l'outil sait que le projet a déjà été initialisé (pas de parcelle d'exemple réinjectée).
    expect((await client.get(base)).body.initialized).toBe(true);

    const intruder = await registerAndLogin("parcelle-intruder@example.com");
    expect((await intruder.get(base)).status).toBe(404);
  });

  it("transmits a parcel to the typed model like acceptParcel: parcel and setback envelope written by commands, then a conflict once a building exists", async () => {
    const client = await registerAndLogin("transmit@example.com");
    const project = await client.post("/projects").send({ code: "P.908", name: "Transmission" });
    const pid = project.body.id as string;
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await client.put(`/projects/${pid}/parcels/${id}`).send({
      data: { name: "Lot 118", crs: "EPSG:26191", parcelNumber: "118", points: S01, source: "s01", design: { commune: "El Mansouria", setback: { mode: "uniform", value: 5, rule: "Hypothèse de travail" } }, dossier: { parcel: { officialArea: "1346" } } },
      revision: 0,
    });
    const t1 = await client.post(`/projects/${pid}/parcels/${id}/transmit`);
    expect(t1.status).toBe(200);
    expect(t1.body.transmission.status).toBe("linked");
    expect(t1.body.transmission.parcel).toMatchObject({ name: "Lot 118", crs: "EPSG:26191", parcelNumber: "118", boundaryCount: 4 });
    expect(t1.body.transmission.parcel.area).toBeCloseTo(1345.5476, 3);
    const nativeId = t1.body.transmission.nativeId as string;
    expect(nativeId).toMatch(/^fadi-/);
    // Même signature → aucune nouvelle écriture (rechargement, clic sans saisie).
    const again = await client.post(`/projects/${pid}/parcels/${id}/transmit`);
    expect(again.body.transmission.at).toBe(t1.body.transmission.at);

    const model = (await client.get(`/projects/${pid}/atelier/model`)).body;
    expect(model.nativeId).toBe(nativeId);
    const parcelle = model.modele.site.parcelle;
    expect(parcelle.sommets.map((x: { id: string }) => x.id)).toEqual(["B.266", "B.267", "B.268", "B.265"]);
    expect(parcelle.sommets[0].cadastral).toMatchObject({ x: 321946.82, y: 347183.88, frame: "cadastral", crs: "EPSG:26191" });
    expect(parcelle.aire.value).toBeCloseTo(1345.5476, 3);
    expect(parcelle.aireOfficielle).toEqual({ value: 1346, unit: "m2" });
    expect(parcelle.champs.setback.distance).toBe(5);
    expect(parcelle.champs.setback.envelope).toHaveLength(4);
    expect(parcelle.champs.setback.area).toBeCloseTo(689.23, 1);
    expect(parcelle.champs.validation.state).toBe("DECLARED");
    expect(model.revision).toBeGreaterThanOrEqual(1);
    const journal = (await client.get(`/projects/${pid}/atelier/journal?apres=0`)).body;
    expect(journal.entrees.map((e: { label: string }) => e.label)).toContain("Parcelle transmise depuis l'étape 01");

    // Un bâtiment existe désormais (un mur) : déplacer une borne est un conflit explicite, le modèle n'est pas touché.
    const rev = model.revision as number;
    expect((await client.post(`/projects/${pid}/atelier/commands`).send(lot(rev, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } }, { type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } }]))).status).toBe(200);
    const moved = S01.map((p, i) => (i === 0 ? { ...p, x: p.x + 2 } : p));
    // La capture de l'outil est transmise telle quelle (corps `data`), avant même que l'outil n'ait enregistré son fichier.
    const t2 = await client.post(`/projects/${pid}/parcels/${id}/transmit`).send({ data: { name: "Lot 118", crs: "EPSG:26191", points: moved } });
    expect(t2.body.transmission.status).toBe("conflict");
    expect(t2.body.transmission.reason).toMatch(/un bâtiment est déjà dessiné/);
    const after = (await client.get(`/projects/${pid}/atelier/model`)).body;
    expect(after.modele.site.parcelle.sommets[0].cadastral.x).toBeCloseTo(321946.82, 2);
    const listed = await client.get(`/projects/${pid}/parcels`);
    expect(listed.body.transmission.status).toBe("conflict");
    expect(listed.body.files[0].revision).toBe(1);
    // Une capture invalide est refusée sans toucher à la transmission courante.
    const bad = await client.post(`/projects/${pid}/parcels/${id}/transmit`).send({ data: { name: "Lot 118", crs: "EPSG:9999", points: moved } });
    expect(bad.status).toBe(400);
  });

  it("gives the imported P.118 project its parcel file in the tool, already linked to the model", async () => {
    const client = await registerAndLogin("parcelle-p118@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const list = await client.get(`/projects/${imported.body.id}/parcels`);
    expect(list.body.files).toHaveLength(1);
    expect(list.body.files[0]).toMatchObject({ parcelNumber: "118", crs: "EPSG:26191", boundaryCount: 4, number: 1 });
    expect(list.body.files[0].area).toBeCloseTo(1345.5476, 3);
    expect(list.body.transmission.status).toBe("linked");
    const file = (await client.get(`/projects/${imported.body.id}/parcels/${list.body.files[0].id}`)).body.file;
    expect(file.data.points.map((p: { id: string }) => p.id)).toEqual(["B.266", "B.267", "B.268", "B.265"]);
    expect(file.data.dossier.parcel.officialArea).toBe("1346");
  });
});

describe("Étape 01 — propositions de site Harmonie calculées sur la parcelle", () => {
  const S01 = [
    { id: "B.266", x: 321946.82, y: 347183.88 },
    { id: "B.267", x: 321954.11, y: 347215.38 },
    { id: "B.268", x: 321995.84, y: 347186.25 },
    { id: "B.265", x: 321978.68, y: 347161.67 },
  ];

  it("offers A/B/C without zoning on a project without parcel, then zones the transmitted contour; site data drive the recommendation", async () => {
    const client = await registerAndLogin("site@example.com");
    const project = await client.post("/projects").send({ code: "P.910", name: "Site" });
    const pid = project.body.id as string;
    const empty = (await client.get(`/projects/${pid}/steps/1`)).body;
    expect(empty.proposals.map((q: { id: string }) => q.id)).toEqual(["H00-A", "H00-B", "H00-C"]);
    expect(empty.proposals[0].title).toBe("Accueil ouvert, jardin en retrait");
    expect(empty.proposals[0].zoning).toBeNull();
    expect(empty.proposals[0].recommended).toBe(true);
    expect(empty.site.parcel.vertexCount).toBe(0);
    expect(empty.site.geo.center).toBeNull();
    expect(empty.site.recommendation.key).toBe("A");

    // Une parcelle transmise au modèle → zonage calculé sur son contour, géolocalisation par conversion explicite.
    const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await client.put(`/projects/${pid}/parcels/${id}`).send({ data: { name: "Lot 118", crs: "EPSG:26191", parcelNumber: "118", points: S01 }, revision: 0 });
    await client.post(`/projects/${pid}/parcels/${id}/transmit`);
    const zoned = (await client.get(`/projects/${pid}/steps/1`)).body;
    expect(zoned.site.parcel.vertexIds).toEqual(["B.266", "B.267", "B.268", "B.265"]);
    expect(zoned.site.parcel.area).toBeCloseTo(1345.5476, 3);
    expect(zoned.site.geo.center.frame).toBe("geographic");
    expect(zoned.site.geo.center.lon).toBeCloseTo(-7.31968, 4);
    expect(zoned.site.geo.center.lat).toBeCloseTo(33.70822, 4);
    expect(zoned.site.geo.source).toMatch(/^Conversion EPSG:26191 → WGS84/);
    const a = zoned.proposals[0];
    expect(a.zoning.edgeAssumed).toBe(true);
    expect(a.zoning.zones.map((z: { id: string }) => z.id)).toEqual(["arrival", "study", "garden", "service"]);
    expect(a.zoning.zones[1].area / zoned.site.parcel.area).toBeCloseTo(0.5, 3);
    expect(a.why).toContain("le premier côté sert uniquement de repère graphique");

    // Données du site : approche documentée sans source → refus du prototype.
    const refused = await client.put(`/projects/${pid}/steps/1/site`).send({ frontageEdge: 3, approachStatus: "documented", priority: "service", frontContext: "unknown", backContext: "built", source: "", note: "" });
    expect(refused.status).toBe(422);
    expect(refused.body.message).toBe("Pour une approche documentée, choisissez son côté et indiquez sa source.");
    const saved = await client.put(`/projects/${pid}/steps/1/site`).send({ frontageEdge: 3, approachStatus: "documented", priority: "service", frontContext: "unknown", backContext: "built", source: "Relevé photo du 12/03/2026", note: "Accès par la piste sud." });
    expect(saved.status).toBe(200);
    expect(saved.body.site.recommendation.key).toBe("C");
    expect(saved.body.proposals[2].recommended).toBe(true);
    expect(saved.body.proposals[0].recommended).toBe(false);
    expect(saved.body.proposals[0].zoning.edge).toBe(3);
    expect(saved.body.proposals[0].zoning.edgeAssumed).toBe(false);
    expect(saved.body.proposals[0].why).toContain("Approche étudiée depuis B.265 → B.266, déclarée documentée.");
    expect(saved.body.proposals[0].why).toContain("Contexte arrière déclaré : masse bâtie");
    expect(saved.body.content.harmonie.revision).toBe(1);
    expect(saved.body.status).toBe("en-cours");

    // « Collecter centre + sommets » : les altitudes reçues du service (contrôlées par le navigateur) deviennent l'altimétrie du
    // site — modèle de terrain, non relevé —, l'empreinte change et les propositions citent l'amplitude ; forme contrôlée.
    expect((await client.put(`/projects/${pid}/steps/1/site/elevation`).send({ points: [] })).status).toBe(400);
    expect((await client.put(`/projects/${pid}/steps/1/site/elevation`).send({ points: [[-7.3, 33.7, 10], [200, 33.7, 11]] })).status).toBe(422); // hors plage du service
    const collected = await client.put(`/projects/${pid}/steps/1/site/elevation`).send({ points: [[-7.3196824, 33.7082212, 42.5], [-7.3198, 33.708, 40.1], [-7.3195, 33.7084, 44.9]] });
    expect(collected.status).toBe(200);
    expect(collected.body.site.observations.elevation).toMatchObject({ source: "MapTiler Elevation API", status: "Modèle de terrain · non relevé topographique", points: [[-7.3196824, 33.7082212, 42.5], [-7.3198, 33.708, 40.1], [-7.3195, 33.7084, 44.9]] });
    expect(collected.body.site.observations.elevation.range).toBeCloseTo(4.8, 9);
    expect(collected.body.proposals[0].why).toContain("Altimétrie de service : amplitude 4,8 m sur les points reçus");
    expect((await client.get(`/projects/${pid}/steps/1`)).body.site.observations.source).toBe("Relevé photo du 12/03/2026"); // le reste des données du site est conservé

    // Retenir B → intention reçue par l'étape 02 (cible de l'étape 01).
    const retained = await client.post(`/projects/${pid}/steps/1/harmonie/H00-B`).send({ status: "retained" });
    expect(retained.status).toBe(200);
    expect(retained.body.retainedCount).toBe(1);
    const step2 = (await client.get(`/projects/${pid}/steps/2`)).body;
    expect(step2.incoming.map((q: { id: string }) => q.id)).toContain("H00-B");
  });

  it("imports the P.118 example with its declared site data: approach edge B.265 → B.266, contexts, working geographic mark, choice A retained", async () => {
    const client = await registerAndLogin("site-p118@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const step1 = (await client.get(`/projects/${imported.body.id}/steps/1`)).body;
    expect(step1.site.observations).toMatchObject({ frontageEdge: 3, approachStatus: "hypothesis", priority: "balanced", frontContext: "open", backContext: "vegetation" });
    expect(step1.site.observations.source).toMatch(/^S01 \/ géoréférencement du dossier/);
    expect(step1.site.frontage).toBe(3);
    expect(step1.site.geo.center.lon).toBeCloseTo(-7.31968, 4);
    expect(step1.proposals[0].why).toContain("Approche étudiée depuis B.265 → B.266, hypothétique.");
    expect(step1.proposals[0].why).toContain("Contexte arrière déclaré : végétation");
    expect(step1.proposals[0].retained).toBe(true);
    expect(step1.retainedCount).toBe(1);
    expect(step1.proposals[0].zoning.zones[0].area / step1.site.parcel.area).toBeCloseTo(0.15, 3);
  });
});

describe("Sources de l'étape — pièces jointes par étape", () => {
  it("uploads, lists, downloads as attachment and deletes a file of a step, only for the project's owner", async () => {
    const client = await registerAndLogin("sources@example.com");
    const project = await client.post("/projects").send({ code: "P.911", name: "Sources" });
    const pid = project.body.id as string;
    const base = `/projects/${pid}/steps/3/files`;
    expect((await client.get(base)).body).toEqual([]);

    const content = Buffer.from("%PDF-1.4\n% Note de zone I-5 (démonstration)\n");
    const up = await client.post(base).set("Content-Type", "application/octet-stream").set("X-File-Name", encodeURIComponent("ZONE-I-5 règlement.pdf")).set("X-File-Type", "application/pdf").send(content);
    expect(up.status).toBe(201);
    expect(up.body.file).toMatchObject({ name: "ZONE-I-5 règlement.pdf", type: "application/pdf", size: content.length });
    const id = up.body.file.id as string;
    // Un fichier dont le navigateur annonce du JSON passe tel quel (octets bruts, pas d'analyse JSON côté serveur).
    const json = await client.post(base).set("Content-Type", "application/octet-stream").set("X-File-Name", "notes.json").set("X-File-Type", "application/json").send(Buffer.from('{"a":1}'));
    expect(json.status).toBe(201);
    const list = await client.get(base);
    expect(list.body.map((f: { name: string }) => f.name)).toEqual(["ZONE-I-5 règlement.pdf", "notes.json"]);
    expect((await client.get(`/projects/${pid}/steps/4/files`)).body).toEqual([]);

    const dl = await client.get(`${base}/${id}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(dl.status).toBe(200);
    expect(dl.headers["content-disposition"]).toMatch(/^attachment; filename="ZONE-I-5 r.glement.pdf"; filename\*=UTF-8''ZONE-I-5%20r%C3%A8glement\.pdf$/);
    expect(dl.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(dl.body).equals(content)).toBe(true);
    // Une pièce HTML n'est jamais servie comme page.
    const html = await client.post(base).set("Content-Type", "application/octet-stream").set("X-File-Name", "piege.html").set("X-File-Type", "text/html").send(Buffer.from("<script>alert(1)</script>"));
    const dlHtml = await client.get(`${base}/${html.body.file.id}`);
    expect(dlHtml.headers["content-type"]).toMatch(/^application\/octet-stream/);
    expect(dlHtml.headers["content-disposition"]).toMatch(/^attachment/);

    const missingName = await client.post(base).set("Content-Type", "application/octet-stream").send(Buffer.from("x"));
    expect(missingName.status).toBe(400);
    const empty = await client.post(base).set("Content-Type", "application/octet-stream").set("X-File-Name", "vide.txt").send(Buffer.alloc(0));
    expect(empty.status).toBe(400);

    const other = await registerAndLogin("sources-other@example.com");
    expect((await other.get(base)).status).toBe(404);
    expect((await other.get(`${base}/${id}`)).status).toBe(404);
    expect((await other.delete(`${base}/${id}`)).status).toBe(404);

    expect((await client.delete(`${base}/${id}`)).status).toBe(204);
    expect((await client.get(base)).body.map((f: { name: string }) => f.name)).toEqual(["notes.json", "piege.html"]);
    expect((await client.get(`${base}/${id}`)).status).toBe(404);

    // Vue d'ensemble du module Projets et sources : toutes les pièces, par étape.
    await client.post(`/projects/${pid}/steps/1/files`).set("Content-Type", "application/octet-stream").set("X-File-Name", "118_officiel.kmz").set("X-File-Type", "application/vnd.google-earth.kmz").send(Buffer.from("PK"));
    const all = await client.get(`/projects/${pid}/files`);
    expect(all.body.map((f: { stepNumber: number; name: string }) => `${f.stepNumber}:${f.name}`)).toEqual(["1:118_officiel.kmz", "3:notes.json", "3:piege.html"]);
    expect((await other.get(`/projects/${pid}/files`)).status).toBe(404);
  });
});

describe("Bibliothèque des bâtiments — cas de programme appliqué", () => {
  it("serves the library and a case, applies a variant to a project (repartition from the spaces, drafted texts, conflicts kept), adapts a line and reopens the decision", async () => {
    const client = await registerAndLogin("bibliotheque@example.com");
    const index = await client.get("/library/buildings");
    expect(index.status).toBe(200);
    expect(index.body.profiles).toHaveLength(10);
    expect(index.body.cases).toHaveLength(21);
    expect(index.body.steps).toHaveLength(21);
    expect(index.body.cases.find((c: { id: string }) => c.id === "office")).toMatchObject({ type: "tertiaire", capacity: 120, scenarioCount: 3 });
    const detail = await client.get("/library/buildings/hotel");
    expect(detail.status).toBe(200);
    expect(detail.body.case.scenarios.map((s: { id: string }) => s.id)).toHaveLength(3);
    expect(detail.body.references.length).toBeGreaterThan(0);
    expect((await client.get("/library/buildings/nope")).status).toBe(404);

    const project = await client.post("/projects").send({ code: "P.913", name: "Programme" });
    const pid = project.body.id as string;
    // Une réponse saisie à la main à l'étape 04 est conservée et signalée.
    await client.patch(`/projects/${pid}/steps/4`).send({ fields: { f1: "Mon positionnement, saisi à la main" } });
    const scenario = detail.body.case.scenarios[0];
    const applied = await client.post(`/projects/${pid}/programme/case`).send({ caseId: "hotel", scenarioId: scenario.id, jurisdiction: "Maroc", replaceText: false });
    expect(applied.status).toBe(201);
    expect(applied.body.applied).toMatchObject({ revision: 1, conflicts: 1 });
    const pc = applied.body.programmeCase;
    expect(pc).toMatchObject({ schema: "Parcours.ProgrammeCase", caseId: "hotel", scenarioId: scenario.id, revision: 1, jurisdiction: "Maroc", type: "hotelier", profileLabel: detail.body.case.profile.label });
    expect(pc.spaces).toHaveLength(scenario.spaces.length);
    expect(pc.conflicts).toEqual([{ stage: 4, field: "f1", current: "Mon positionnement, saisi à la main", proposed: expect.stringMatching(/^\[EXEMPLE \/ HYPOTHÈSE/) }]);
    // Répartition chargée depuis les fiches espaces (mode « cas »), totaux = sommes du cas.
    expect(applied.body.repartition.fromCase).toBe(true);
    expect(applied.body.repartition.type).toBe("hotelier");
    expect(applied.body.totals.baseArea).toBeCloseTo(pc.sums.total, 6);
    expect(applied.body.totals.supportPercent).toBeCloseTo((pc.sums.support / pc.sums.total) * 100, 6);
    // Textes générés dans les étapes : rubriques vides seulement, en-tête du prototype ; l'étape 19 ne reçoit aucun GO.
    const step4 = (await client.get(`/projects/${pid}/steps/4`)).body;
    expect(step4.content.fields.f1).toBe("Mon positionnement, saisi à la main");
    expect(step4.content.fields.f2).toMatch(/^\[EXEMPLE \/ HYPOTHÈSE · /);
    expect(step4.status).toBe("en-cours");
    const step19 = (await client.get(`/projects/${pid}/steps/19`)).body;
    expect(step19.content.fields.decision).toBeUndefined();
    expect(step19.content.fields.f3).toMatch(/aucune conclusion GO importée/);
    const step7 = (await client.get(`/projects/${pid}/steps/7`)).body;
    expect(step7.content.fields.f2).toContain(scenario.spaces[0].id);
    // Le profil Harmonie suit le type du cas.
    expect(step4.profile.key).toBe("hotel"); // « hotelier » → alias « hotel » du profil Harmonie

    // « Adopter cette proposition » : le champ conservé prend le texte proposé, l'ancien est archivé, l'écart disparaît ; un index périmé → 404.
    const adopted = await client.post(`/projects/${pid}/programme/conflicts/0/adopt`);
    expect(adopted.status).toBe(200);
    expect(adopted.body.adopted).toMatchObject({ stage: 4, field: "f1", current: "Mon positionnement, saisi à la main" });
    expect(adopted.body.programmeCase.conflicts).toEqual([]);
    expect((await client.get(`/projects/${pid}/steps/4`)).body.content.fields.f1).toMatch(/^\[EXEMPLE \/ HYPOTHÈSE/);
    expect((await client.post(`/projects/${pid}/programme/conflicts/0/adopt`)).status).toBe(404);
    expect((await client.post(`/projects/${pid}/programme/conflicts/x/adopt`)).status).toBe(400);
    expect(((await client.get(`/projects/${pid}/archive`)).body.project.programmeState.fieldHistory as unknown[]).length).toBe(1);

    // Décision prise, puis adaptation d'une ligne → décision « À reprendre », revues à reprendre, révision 2, conflits de variante inconnue refusés.
    await client.patch(`/projects/${pid}/steps/19`).send({ fields: { decision: "GO" }, status: "termine" });
    const spaceId = pc.spaces[0].id as string;
    const bad = await client.patch(`/projects/${pid}/programme/case/spaces/${spaceId}`).send({ quantity: "2.5" });
    expect(bad.status).toBe(422);
    expect(bad.body.message).toMatch(/Quantité entière/);
    const edited = await client.patch(`/projects/${pid}/programme/case/spaces/${spaceId}`).send({ quantity: 3 });
    expect(edited.status).toBe(200);
    expect(edited.body.programmeCase.revision).toBe(2);
    expect(edited.body.programmeCase.spaces[0]).toMatchObject({ quantity: 3, status: "hypothese" });
    expect(edited.body.programmeCase.scenarioLabel).toBe(`Adaptation projet · ${scenario.id}`);
    expect(edited.body.programmeCase.decisionReview).toMatchObject({ required: true, reason: "Quantités ou surfaces du programme modifiées : décision à réexaminer." });
    expect(edited.body.programmeCase.decisionHistoryCount).toBe(1);
    const after19 = (await client.get(`/projects/${pid}/steps/19`)).body;
    expect(after19.content.fields.decision).toBe("À reprendre");
    expect(after19.status).toBe("en-cours");
    // Appliquer une autre variante : révision 3, historique de 2 révisions archivées.
    const again = await client.post(`/projects/${pid}/programme/case`).send({ caseId: "hotel", scenarioId: detail.body.case.scenarios[1].id, jurisdiction: "France", replaceText: true });
    expect(again.body.programmeCase.revision).toBe(3);
    expect(again.body.programmeCase.history.map((h: { revision: number }) => h.revision)).toEqual([2]); // l’adaptation avance la révision en place, seule la variante appliquée est archivée
    expect(again.body.programmeCase.conflicts).toEqual([]);
    expect((await client.get(`/projects/${pid}/steps/4`)).body.content.fields.f1).toMatch(/^\[EXEMPLE \/ HYPOTHÈSE/);
    expect((await client.post(`/projects/${pid}/programme/case`).send({ caseId: "hotel", scenarioId: "nope", jurisdiction: "Maroc", replaceText: false })).status).toBe(400);
    // Un autre utilisateur ne voit rien.
    const other = await registerAndLogin("bibliotheque-other@example.com");
    expect((await other.post(`/projects/${pid}/programme/case`).send({ caseId: "hotel", scenarioId: scenario.id, jurisdiction: "Maroc", replaceText: false })).status).toBe(404);
  });

  it("gives the imported P.118 project its resolved programme case (74 fiches, revision 6) with the repartition loaded from it", async () => {
    const client = await registerAndLogin("bibliotheque-p118@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const view = (await client.get(`/projects/${imported.body.id}/programme`)).body;
    expect(view.resolvedExample).toBe(true);
    expect(view.programmeCase).toMatchObject({ caseId: "parcours_lot118", revision: 6, spaceCount: 74 });
    expect(view.repartition.fromCase).toBe(true);
    expect(view.totals.baseArea).toBeCloseTo(view.programmeCase.sums.total, 6);
    expect(view.programmeCase.sums.principal).toBeCloseTo(1366.02, 1);
    expect(view.programmeCase.sums.programme).toBeCloseTo(2932.26, 1);
  });
});

describe("Étapes 10/11 — propositions localisées sur les locaux du modèle", () => {
  it("adds one local proposal per usable room of the imported P.118 model, retained independently of the partis, received by step 11", async () => {
    const client = await registerAndLogin("locals@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const step10 = (await client.get(`/projects/${pid}/steps/10`)).body;
    const partis = step10.proposals.filter((q: { group: string }) => q.group === "parti");
    const locals = step10.proposals.filter((q: { group: string }) => q.group === "local");
    expect(partis).toHaveLength(3);
    expect(locals.length).toBeGreaterThan(10);
    expect(step10.model.roomCount).toBeGreaterThanOrEqual(locals.length);
    expect(step10.model.floors.map((f: { id: string }) => f.id)).toEqual(["ss", "rdc", "mezz", "r1", "r2", "r3"]);
    const hall = locals.find((q: { title: string }) => /R01/.test(q.title));
    expect(hall).toBeDefined();
    expect(hall.id).toBe(`H09-LOCAL-${hall.roomId}`);
    expect(hall.ref).toBe(`H10-LOCAL-${hall.roomId}`);
    expect(hall.scope).toBe("Local du modèle courant");
    expect(hall.why).toMatch(/m² calculés sur le polygone/);
    expect(hall.source).toBe(`Modèle ${step10.model.nativeHash} · objet ${hall.objectId}`);
    expect(hall.targets).toEqual([11, 13, 16]);
    expect(step10.recommendation.key).toMatch(/^[AC]$/);
    // Un projet sans modèle n'a aucune proposition localisée.
    const blank = await client.post("/projects").send({ code: "P.914", name: "Sans modèle" });
    const blank10 = (await client.get(`/projects/${blank.body.id}/steps/10`)).body;
    expect(blank10.proposals.filter((q: { group: string }) => q.group === "local")).toHaveLength(0);
    expect(blank10.model).toBeNull();

    // Retenir le local (lien = identifiant du local), puis un parti : les deux restent retenus ; l'étape 11 reçoit l'intention.
    const retainedLocal = await client.post(`/projects/${pid}/steps/10/harmonie/${encodeURIComponent(hall.id)}`).send({ status: "retained" });
    expect(retainedLocal.status).toBe(200);
    const l = retainedLocal.body.proposals.find((q: { id: string }) => q.id === hall.id);
    expect(l.retained).toBe(true);
    expect(l.decision.link).toBe(hall.roomId);
    const retainedParti = await client.post(`/projects/${pid}/steps/10/harmonie/H09-B`).send({ status: "retained" });
    expect(retainedParti.body.proposals.find((q: { id: string }) => q.id === hall.id).retained).toBe(true);
    expect(retainedParti.body.proposals.find((q: { id: string }) => q.id === "H09-C").decision.status).toBe("dismissed"); // l'exemple retenait C
    const step11 = (await client.get(`/projects/${pid}/steps/11`)).body;
    expect(step11.incoming.map((q: { id: string }) => q.id)).toContain(hall.id);
    expect(step11.proposals.filter((q: { group: string }) => q.group === "local").length).toBe(locals.length);
    // « Dessinée » est admise à l'étape 10 avec responsable et preuve.
    const drawn = await client.post(`/projects/${pid}/steps/10/harmonie/${encodeURIComponent(hall.id)}`).send({ status: "drawn", owner: "Architecte", proof: "Plan RDC indice B" });
    expect(drawn.status).toBe(200);
    expect(drawn.body.proposals.find((q: { id: string }) => q.id === hall.id).stateLabel).toBe("Dessinée · déclaration");
  });
});

describe("Péremption des propositions (« À réexaminer ») et rapports Harmonie", () => {
  const S01 = [
    { id: "B.266", x: 321946.82, y: 347183.88 },
    { id: "B.267", x: 321954.11, y: 347215.38 },
    { id: "B.268", x: 321995.84, y: 347186.25 },
    { id: "B.265", x: 321978.68, y: 347161.67 },
  ];

  it("dates each retained choice and generated step with its data fingerprint; a site change flags them, 'Actualiser' clears the step, confirming clears the choice", async () => {
    const client = await registerAndLogin("stale@example.com");
    const project = await client.post("/projects").send({ code: "P.920", name: "Péremption" });
    const pid = project.body.id as string;
    const fresh = (await client.get(`/projects/${pid}/steps/2`)).body;
    expect(fresh.stale).toBe(false);
    expect(fresh.content.harmonie.generatedHash).toBeNull();

    // Retenir B à l'étape 02 : empreinte de génération implicite et acceptedHash du choix.
    const retained = await client.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "retained" });
    expect(retained.status).toBe(200);
    const hash = retained.body.content.harmonie.generatedHash as string;
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(retained.body.content.harmonie.proposals["H01-B"].acceptedHash).toBe(hash);
    expect(retained.body.content.harmonie.proposals["H01-B"].snapshot).toMatchObject({ ref: "H02-B", group: "parti", targets: expect.any(Array) });
    expect(retained.body.stale).toBe(false);
    expect(retained.body.staleRetainedCount).toBe(0);
    // Un champ d'une autre étape (19) ne concerne pas l'étape 02.
    await client.patch(`/projects/${pid}/steps/19`).send({ fields: { decision: "GO" } });
    expect((await client.get(`/projects/${pid}/steps/2`)).body.stale).toBe(false);

    // Le site change (parcelle transmise) : l'étape 02 lit le site → à réexaminer, choix conservé.
    const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await client.put(`/projects/${pid}/parcels/${id}`).send({ data: { name: "Lot 118", crs: "EPSG:26191", parcelNumber: "118", points: S01 }, revision: 0 });
    await client.post(`/projects/${pid}/parcels/${id}/transmit`);
    const stale = (await client.get(`/projects/${pid}/steps/2`)).body;
    expect(stale.stale).toBe(true);
    expect(stale.staleRetainedCount).toBe(1);
    const b = stale.proposals.find((q: { id: string }) => q.id === "H01-B");
    expect(b).toMatchObject({ retained: true, stale: true, orphaned: false });
    expect(stale.retainedCount).toBe(1);
    // L'étape 19 n'a pas été générée : rien à réexaminer malgré le champ saisi.
    expect((await client.get(`/projects/${pid}/steps/19`)).body.stale).toBe(false);

    // Une vérification est refusée tant que l'étape n'est pas actualisée (message du prototype).
    const refused = await client.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "verified", owner: "Chef de projet", proof: "Compte rendu de revue n° 4" });
    expect(refused.status).toBe(422);
    expect(refused.body.message).toBe("Actualisez d’abord les propositions sur les données courantes.");

    // « Actualiser les propositions » : révision +1, étape à jour, choix toujours à réexaminer.
    const generated = await client.post(`/projects/${pid}/steps/2/harmonie/generate`);
    expect(generated.status).toBe(200);
    expect(generated.body.content.harmonie.revision).toBe(2); // 1 à la première génération implicite, 2 à l'actualisation
    expect(generated.body.content.harmonie.generatedHash).not.toBe(hash);
    expect(generated.body.stale).toBe(false);
    expect(generated.body.proposals.find((q: { id: string }) => q.id === "H01-B").stale).toBe(true);
    expect(generated.body.staleRetainedCount).toBe(1);

    // « Confirmer ce choix » : version 2, empreinte courante — plus rien à réexaminer ; la vérification passe.
    const confirmed = await client.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "retained" });
    expect(confirmed.body.proposals.find((q: { id: string }) => q.id === "H01-B")).toMatchObject({ stale: false, decision: { decisionVersion: 2 } });
    expect(confirmed.body.staleRetainedCount).toBe(0);
    const verified = await client.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "verified", owner: "Chef de projet", proof: "Compte rendu de revue n° 4" });
    expect(verified.status).toBe(200);

    // Une intention amont périmée se signale à la cible (« Source à réexaminer »).
    const retained1 = await client.post(`/projects/${pid}/steps/1/harmonie/H00-A`).send({ status: "retained" });
    expect(retained1.status).toBe(200);
    const step2 = (await client.get(`/projects/${pid}/steps/2`)).body;
    expect(step2.incoming.find((q: { id: string }) => q.id === "H00-A")).toMatchObject({ originStale: false, decisionVersion: 1 });
    expect(step2.stale).toBe(true); // nouvelle intention reçue depuis la génération
    await client.put(`/projects/${pid}/steps/1/site`).send({ frontageEdge: 1, approachStatus: "hypothesis", priority: "balanced", frontContext: "open", backContext: "unknown", source: "", note: "" });
    // `save-site` régénère l'étape 01 : à jour, mais son choix A reste daté de l'empreinte précédente.
    const step1 = (await client.get(`/projects/${pid}/steps/1`)).body;
    expect(step1.stale).toBe(false);
    expect(step1.proposals[0].stale).toBe(true);
    expect(step1.content.harmonie.revision).toBe(2);
    // L'origine devient périmée seulement quand ses données changent après sa génération.
    const moved = S01.map((q) => (q.id === "B.265" ? { ...q, y: q.y - 1 } : q));
    await client.put(`/projects/${pid}/parcels/${id}`).send({ data: { name: "Lot 118", crs: "EPSG:26191", parcelNumber: "118", points: moved }, revision: 1 });
    await client.post(`/projects/${pid}/parcels/${id}/transmit`);
    const after = (await client.get(`/projects/${pid}/steps/2`)).body;
    expect(after.incoming.find((q: { id: string }) => q.id === "H00-A").originStale).toBe(true);
  });

  it("keeps a retained choice whose proposal vanished with the model as an orphaned proposal to re-examine", async () => {
    const client = await registerAndLogin("orphan@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const step10 = (await client.get(`/projects/${pid}/steps/10`)).body;
    const hall = step10.proposals.find((q: { group: string; title: string }) => q.group === "local" && /R01/.test(q.title));
    await client.post(`/projects/${pid}/steps/10/harmonie/${encodeURIComponent(hall.id)}`).send({ status: "retained" });
    // Le modèle typé disparaît (aucune route ne le permet : simulé en base) : plus de locaux calculés, le choix est conservé en orphelin.
    await pool.query("DELETE FROM atelier_site WHERE project_id = $1", [pid]);
    const without = (await client.get(`/projects/${pid}/steps/10`)).body;
    expect(without.model).toBeNull();
    const orphan = without.proposals.find((q: { id: string }) => q.id === hall.id);
    expect(orphan).toMatchObject({ orphaned: true, stale: true, retained: true, group: "local", title: hall.title, ref: hall.ref, roomId: hall.roomId });
    // Le parti C de l'exemple + les locaux adaptés par l'exemple (dont le hall), tous orphelins sans modèle.
    expect(without.retainedCount).toBe(1 + step10.proposals.filter((q: { group: string }) => q.group === "local").length);
    expect(without.staleRetainedCount).toBeGreaterThanOrEqual(1);
  });

  it("imports P.118 with nothing to re-examine, and serves the step report and the project synthesis as downloadable HTML", async () => {
    const client = await registerAndLogin("report@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const steps = (await client.get(`/projects/${pid}/steps`)).body as { number: number; stale: boolean; staleRetainedCount: number; content: { harmonie: { generatedHash: string | null } } }[];
    expect(steps).toHaveLength(21);
    expect(steps.filter((s) => s.stale).map((s) => s.number)).toEqual([]);
    expect(steps.filter((s) => s.staleRetainedCount > 0).map((s) => s.number)).toEqual([]);
    expect(steps.every((s) => typeof s.content.harmonie.generatedHash === "string")).toBe(true);
    const programme = steps.find((s) => s.number === 7) as unknown as { programme: { spaceCount: number; total: number } };
    expect(programme.programme.spaceCount).toBe(74);
    expect(programme.programme.total).toBeCloseTo(2932.26, 1); // `sums(spaces).total` du prototype : les fiches du cas résolu (sans ligne « parois »)

    const one = await client.get(`/projects/${pid}/steps/1/harmonie/rapport`);
    expect(one.status).toBe(200);
    expect(one.headers["content-type"]).toMatch(/^text\/html/);
    expect(one.headers["content-disposition"]).toBe('attachment; filename="Harmonie_Etape_01_V7.html"');
    expect(one.text).toContain("<title>Harmonie · Escalier B et mezzanine · 01 · Parcelle / Site existant</title>");
    expect(one.text).toContain("PARCOURS V7 · DIMENSION HARMONIE PAR ÉTAPE");
    expect(one.text).toContain("Rapport limité à l’objet de cette étape.");
    expect(one.text).toContain("Conversion EPSG:26191 → WGS84");
    expect(one.text).toContain('<svg'); // schéma de la proposition zonée
    expect(one.text).toContain(".h7-panel{border:1px solid #c8d9ce"); // h7-css du prototype
    expect(one.text).not.toContain("<button");
    const all = await client.get(`/projects/${pid}/steps/harmonie/rapport`);
    expect(all.status).toBe(200);
    expect(all.headers["content-disposition"]).toBe('attachment; filename="Harmonie_Choix_Parcours_V7.html"');
    expect(all.text).toContain("Synthèse des étapes effectivement ouvertes");
    expect(all.text.match(/<section><h2>/g)?.length).toBe(21);
    // Jamais pour un autre utilisateur.
    const other = await registerAndLogin("report-other@example.com");
    expect((await other.get(`/projects/${pid}/steps/1/harmonie/rapport`)).status).toBe(404);
  });
});

describe("Archive de projet — « Sauvegarder projet JSON » / « Importer projet JSON »", () => {
  it("exports P.118 as one JSON (steps, programme, parcel, native model, attachments) and re-imports it as a new equivalent project", async () => {
    const client = await registerAndLogin("archive@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    // Une pièce jointe et un arbitrage propre à ce projet, pour vérifier qu'ils voyagent.
    await client.post(`/projects/${pid}/steps/3/files`).set("Content-Type", "application/octet-stream").set("X-File-Name", encodeURIComponent("ZONE-I-5 règlement.pdf")).set("X-File-Type", "application/pdf").send(Buffer.from("%PDF-1.4 test archive"));
    await client.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "adapted", notes: "Adaptation portée par l'archive" });

    const exported = await client.get(`/projects/${pid}/archive`);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-disposition"]).toBe('attachment; filename="Parcours_V7_Escalier_B_et_mezzanine.json"');
    expect(exported.headers["content-type"]).toMatch(/^application\/json/);
    const archive = JSON.parse(exported.text);
    expect(archive).toMatchObject({ kind: "fadi-project-archive", version: 2, sourceVersion: "8.19.0", project: { code: "P.118", name: "Escalier B et mezzanine", modelRevision: 1 } });
    expect(archive.stageMapping).toHaveLength(21);
    expect(archive.steps).toHaveLength(21);
    expect(archive.programmeCases).toHaveLength(1);
    expect(archive.programmeCases[0].data.spaces).toHaveLength(74);
    expect(archive.programmeRepartition.mode).toBe("cas");
    expect(archive.parcels).toHaveLength(1);
    expect(archive.modele.nativeId).toBe("p118-demo-v819");
    expect(Object.keys(archive.modele.etat.objets)).toHaveLength(1753);
    expect(archive.natif).toBeNull();
    // Les pièces : les deux documents de base de l'exemple (étapes 01 / 02, octets conservés) et la pièce ajoutée.
    expect(archive.stageAttachments.map((a: { stepNumber: number; name: string; size: number }) => [a.stepNumber, a.name, a.size])).toEqual([
      [1, "118_officiel.kmz", 881142],
      [2, "ZONE-I-5.pdf", 2271817],
      [3, "ZONE-I-5 règlement.pdf", 21],
    ]);
    expect(archive.stageAttachments[2]).toMatchObject({ type: "application/pdf", dataUrl: expect.stringMatching(/^data:application\/pdf;base64,/) });
    expect(archive.warnings).toEqual([]);
    // Jamais pour un autre utilisateur.
    const other = await registerAndLogin("archive-other@example.com");
    expect((await other.get(`/projects/${pid}/archive`)).status).toBe(404);

    // Import de l'archive : un NOUVEAU projet, l'original intact.
    const res = await client.post("/projects/import").set("Content-Type", "application/json").send(exported.text);
    expect(res.status).toBe(201);
    expect(res.body.projects).toHaveLength(1);
    const copy = res.body.projects[0];
    expect(copy).toMatchObject({ origin: "fadi", name: "Escalier B et mezzanine · import", code: "P.118", warnings: [] });
    expect(copy.id).not.toBe(pid);
    const list = (await client.get("/projects")).body as { id: string }[];
    expect(list.map((p) => p.id)).toEqual(expect.arrayContaining([pid, copy.id]));
    type StepRow = { number: number; status: string; stale: boolean; staleRetainedCount: number; retainedCount: number; proposals: { id: string; decision: { status: string; adaptedText: string | null } }[]; model: unknown };
    const original = (await client.get(`/projects/${pid}/steps`)).body as StepRow[];
    const steps = (await client.get(`/projects/${copy.id}/steps`)).body as StepRow[];
    // Mêmes statuts (l'arbitrage pris sur l'original a remis ses cibles « en cours » : la copie le reflète), mêmes choix retenus.
    expect(steps.map((s) => [s.number, s.status, s.retainedCount])).toEqual(original.map((s) => [s.number, s.status, s.retainedCount]));
    expect(original.filter((s) => s.status === "termine").length).toBeLessThan(21);
    expect(steps.find((s) => s.number === 2)!.proposals.find((q) => q.id === "H01-B")!.decision).toMatchObject({ status: "adapted", adaptedText: "Adaptation portée par l'archive" });
    expect(steps.filter((s) => s.stale || s.staleRetainedCount > 0).map((s) => s.number)).toEqual([]);
    const step10 = steps.find((s) => s.number === 10)!;
    expect(step10.model).not.toBeNull();
    expect(step10.proposals.filter((q) => q.id.includes("LOCAL")).length).toBeGreaterThan(10);
    expect(Object.keys((await client.get(`/projects/${copy.id}/atelier/model`)).body.modele.niveaux)).toHaveLength(6);
    const programme = (await client.get(`/projects/${copy.id}/programme`)).body;
    expect(programme.programmeCase.spaces).toHaveLength(74);
    const files = (await client.get(`/projects/${copy.id}/steps/3/files`)).body as { name: string; size: number; id: string }[];
    expect(files).toEqual([expect.objectContaining({ name: "ZONE-I-5 règlement.pdf", size: 21 })]);
    const dl = await client.get(`/projects/${copy.id}/steps/3/files/${encodeURIComponent(files[0]!.id)}`);
    expect(dl.text ?? dl.body.toString()).toContain("%PDF-1.4 test archive");
    const parcelsRes = (await client.get(`/projects/${copy.id}/parcels`)).body;
    expect(parcelsRes.files).toHaveLength(1);
    expect(parcelsRes.transmission.status).toBe("linked");
  }, 30_000);

  it("« Essayer une autre répartition en copie » : copies the protected P.118 reference into an editable project, reference intact", async () => {
    const client = await registerAndLogin("copie@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    expect((await client.get(`/projects/${pid}`)).body.exampleMode).toBe("reference");
    expect((await client.get(`/projects/${pid}/programme`)).body.resolvedExample).toBe(true);
    const res = await client.post(`/projects/${pid}/copies`).send({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: "P.118", name: "ma variante de l’exemple résolu", warnings: [] }); // affiché « P.118 — ma variante de l’exemple résolu »
    expect(res.body.id).not.toBe(pid);
    const copy = (await client.get(`/projects/${res.body.id}`)).body;
    // Provenance conservée, mode modifiable, modèle et programme présents.
    expect(copy).toMatchObject({ sourceExampleId: "p118-exemple-complet", exampleMode: "editable", modelRevision: 1 });
    const programme = (await client.get(`/projects/${copy.id}/programme`)).body;
    expect(programme.resolvedExample).toBe(false);
    expect(programme.programmeCase).toMatchObject({ caseId: "parcours_lot118", revision: 6, spaceCount: 74 });
    expect(Object.keys((await client.get(`/projects/${copy.id}/atelier/model`)).body.modele.niveaux)).toHaveLength(6);
    const steps = (await client.get(`/projects/${copy.id}/steps`)).body as { status: string; stale: boolean; staleRetainedCount: number }[];
    expect(steps.filter((s) => s.status === "termine")).toHaveLength(21);
    expect(steps.filter((s) => s.stale || s.staleRetainedCount > 0)).toHaveLength(0);
    // La référence n'a pas bougé ; un nom explicite est accepté ; jamais pour un autre utilisateur.
    expect((await client.get(`/projects/${pid}/programme`)).body.resolvedExample).toBe(true);
    expect((await client.post(`/projects/${pid}/copies`).send({ name: "Variante B" })).body.name).toBe("Variante B");
    const other = await registerAndLogin("copie-other@example.com");
    expect((await other.post(`/projects/${pid}/copies`).send({})).status).toBe(404);
    // Un projet ordinaire se copie aussi (« — copie »), sans mode d'exemple.
    const blank = await client.post("/projects").send({ code: "P.950", name: "Dossier" });
    const blankCopy = await client.post(`/projects/${blank.body.id}/copies`).send({});
    expect(blankCopy.body.name).toBe("Dossier — copie");
    expect((await client.get(`/projects/${blankCopy.body.id}`)).body.exampleMode).toBeNull();
  });

  it("imports an export of the existing software (parcours-v6-project: workflow + native + stageAttachments) as a new project with its answers, choices, model and attachment", async () => {
    const client = await registerAndLogin("archive-proto@example.com");
    // Le modèle natif de l'exemple sert de `native` du prototype (registry + domains).
    await client.post("/examples/p118-exemple-complet/import");
    const jeu = JSON.parse(readFileSync(new URL("./data/examples/p118-native-model.json", import.meta.url), "utf8")) as { nativeId: string; domains: Record<string, unknown> };
    const nativeId = jeu.nativeId;
    const domains: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(jeu.domains)) domains[k] = v;
    const payload = {
      kind: "parcours-v6-project",
      version: 7,
      applicationVersion: "7.0.0",
      exported: "2026-09-30T10:00:00.000Z",
      workflow: {
        id: "p-proto",
        name: "Dossier prototype",
        data: {
          business: { "2": { f1: "Zone I — secteur I5", f3: 12.5 }, "19": { decision: "GO" } },
          harmonieEtapesV7: {
            site: { frontageEdge: 3, approachStatus: "hypothesis", priority: "service", frontContext: "open", backContext: "vegetation", source: "", note: "" },
            stages: {
              "2": { revision: 2, generatedAt: "2026-09-29T08:00:00.000Z", generatedHash: "deadbeef", proposals: [{ id: "H01-C", key: "C", group: "parti", stage: 2, title: "C", text: "Texte C", source: "", targets: [4], status: "retained", decisionVersion: 1, acceptedHash: "cafebabe" }] },
            },
          },
          programmeRepartition: { type: "mixte", baseArea: 900, mode: "cible", custom: {} },
          harmony: { config: { components: ["enseignement", "tertiaire"] } },
        },
        done: { "2": true },
      },
      native: { id: nativeId, registry: { id: nativeId, name: "P.118" }, domains },
      stageAttachments: [{ id: "a1", projectId: "p-proto", stage: 3, name: "note.txt", type: "text/plain", size: 7, added: "2026-09-28T00:00:00.000Z", dataUrl: `data:text/plain;base64,${Buffer.from("bonjour").toString("base64")}` }],
      warnings: [],
    };
    const res = await client.post("/projects/import").send(payload);
    expect(res.status).toBe(201);
    const p = res.body.projects[0];
    expect(p).toMatchObject({ origin: "parcours-v7", name: "Dossier prototype · import", code: "Dossier_prototype", warnings: [] });
    const steps = (await client.get(`/projects/${p.id}/steps`)).body as { number: number; status: string; stale: boolean; content: { fields: Record<string, unknown>; harmonie: { revision: number; generatedHash: string | null } }; proposals: { id: string; retained: boolean; stale: boolean }[]; profile: { label: string }; site: { observations: { priority: string } } | null; model: unknown }[];
    const s2 = steps.find((s) => s.number === 2)!;
    expect(s2.status).toBe("termine");
    expect(s2.content.fields).toEqual({ f1: "Zone I — secteur I5", f3: 12.5 });
    expect(s2.proposals.find((q) => q.id === "H01-C")).toMatchObject({ retained: true, stale: false });
    expect(s2.content.harmonie.revision).toBe(2);
    expect(s2.content.harmonie.generatedHash).toMatch(/^[0-9a-f]{8}$/); // recalculée sur les données importées, pas « deadbeef »
    expect(s2.stale).toBe(false);
    expect(s2.profile.label).toBe("Formation & bureaux");
    expect(steps.find((s) => s.number === 1)!.site!.observations.priority).toBe("service");
    expect(steps.find((s) => s.number === 19)!.content.fields).toEqual({ decision: "GO" });
    expect(steps.find((s) => s.number === 10)!.model).not.toBeNull();
    expect(Object.keys((await client.get(`/projects/${p.id}/atelier/model`)).body.modele.niveaux)).toHaveLength(6);
    const files = (await client.get(`/projects/${p.id}/steps/3/files`)).body as { name: string; size: number }[];
    expect(files).toEqual([expect.objectContaining({ name: "note.txt", size: 7 })]);
    // Refus avec les messages du prototype ; aucun projet créé.
    const before = ((await client.get("/projects")).body as unknown[]).length;
    const bad = await client.post("/projects/import").send({ hello: "world" });
    expect(bad.status).toBe(422);
    expect(bad.body.message).toBe("Format attendu : export Parcours V6 / V7 ou base projets V5.");
    const invalid = await client.post("/projects/import").send({ kind: "parcours-v6-project", workflow: { name: 4, data: {} } });
    expect(invalid.status).toBe(422);
    expect(invalid.body.message).toBe("Structure de projet invalide.");
    const notJson = await client.post("/projects/import").set("Content-Type", "application/json").send("{not json");
    expect(notJson.status).toBe(422);
    expect(((await client.get("/projects")).body as unknown[]).length).toBe(before);
    // Une base V5 à deux projets crée deux dossiers.
    const v5 = await client.post("/projects/import").send({ projects: [{ id: "a", name: "A", data: {} }, { id: "b", name: "B", data: {} }] });
    expect(v5.status).toBe(201);
    expect(v5.body.projects.map((x: { name: string; origin: string }) => [x.origin, x.name])).toEqual([
      ["parcours-v5", "A · import"],
      ["parcours-v5", "B · import"],
    ]);
  });
});

describe("Bilan Harmonie du bâtiment conçu (flow-v62) et références directionnelles", () => {
  it("analyses the imported P.118 model like the prototype (74 zones, 6 levels, entry at 123.87°, 7 issues), audits transmissions, serves plans and the HTML report, archives the review, and records a declared site observation", async () => {
    const client = await registerAndLogin("design@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const res = await client.get(`/projects/${pid}/design-review`);
    expect(res.status).toBe(200);
    const v = res.body;
    expect(v.example).toBe(true);
    expect(v.analysis.floors).toHaveLength(6);
    expect(v.analysis.rooms).toHaveLength(74);
    // Aperçu conceptuel (accueil, Atelier) : axonométrie éclatée dessinée depuis les mêmes polygones ; vide sur un projet sans modèle.
    const preview = await client.get(`/projects/${pid}/design-review/apercu`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ levels: 6, rooms: 74, nativeHash: v.analysis.nativeHash, planLevel: "RDC" });
    expect(String(preview.body.plan)).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 320 240"/);
    expect(preview.body.walls).toBeGreaterThan(0);
    // Validation technique distincte de l'avancement : les 7 réserves calculées de l'exemple, l'audit, la revue archivée.
    expect(preview.body.validation).toMatchObject({ issues: 7, modelRevision: 1 });
    expect(preview.body.validation.priorityIssues).toBeGreaterThanOrEqual(1);
    expect(typeof preview.body.validation.auditGaps).toBe("number");
    expect(preview.body.validation.reviewedAt === null || typeof preview.body.validation.reviewedAt === "string").toBe(true);
    expect(String(preview.body.svg)).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 960 \d+"/);
    expect((String(preview.body.svg).match(/<g data-level="/g) ?? []).length).toBe(6);
    const blank = await client.post("/projects").send({ code: "P.VIDE", name: "Sans modèle" });
    const blankPreview = await client.get(`/projects/${blank.body.id}/design-review/apercu`);
    expect(blankPreview.status).toBe(200);
    expect(blankPreview.body.svg).toBeNull();
    const stranger = await registerAndLogin("stranger-apercu@example.com");
    expect((await stranger.get(`/projects/${pid}/design-review/apercu`)).status).toBe(404);
    expect(v.analysis.rooms[0].points).toBeUndefined(); // les polygones restent côté serveur (plans SVG)
    expect(v.analysis.facts.parcelArea).toBeCloseTo(1345.5476, 3);
    expect(v.analysis.facts.inside).toBe(true);
    expect(v.analysis.entry.trueBearing).toBeCloseTo(123.866, 2);
    expect(v.georeference).toMatchObject({ latitude: expect.closeTo(33.70822, 4), longitude: expect.closeTo(-7.31968, 4), projectNorth: expect.closeTo(358.946, 2), hypothesis: true });
    expect(v.analysis.issues.map((x: { id: string }) => x.id)).toEqual(["HEIGHT", "DENSITY", "MEZZ", "RAMP", "CONTEXT", "COMPASS", "FLYING"]);
    expect(v.analysis.stale).toBe(true); // la revue archivée de l'exemple porte une autre signature
    expect(v.review).toMatchObject({ version: "6.2.0", name: "P.118 — bilan du bâtiment conçu", counts: { levels: 6, rooms: 62, issues: 7 } });
    expect(v.audit.map((x: { id: string }) => x.id)).toHaveLength(14);
    const audit = Object.fromEntries(v.audit.map((x: { id: string; status: string }) => [x.id, x.status]));
    expect(audit).toMatchObject({ link: "OK", parcel: "OK", "parcel-state": "OK", program: "OK", "room-links": "OK", geometry: "OK", review: "À documenter", decision: "OK", geo: "OK", external: "À documenter", text: "OK" });
    expect(v.assumptions.map((a: { id: string }) => a.id)).toEqual(["H-GEO", "H-ENTREE", "H-CAP", "H-MEZZ", "H-TEMPS", "H-ENV-A", "H-ENV-B", "H-SOL"]);
    expect(v.profileLabel).toBe("Mixte / multi-usages");
    expect(Object.keys(v.plans)).toEqual(["ss", "rdc", "mezz", "r1", "r2", "r3"]);
    expect(v.plans.rdc).toContain("Entrée H-ENTREE");
    expect(v.compass.status.ready).toBe(false);
    expect(v.compass.values.facing).toBeCloseTo(123.866, 2);
    expect(v.natal.ready).toBe(false);

    // « Actualiser la revue de conception » : rattachée aux entrées courantes, l'ancienne archivée.
    const reviewed = await client.post(`/projects/${pid}/design-review/review`);
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.analysis.stale).toBe(false);
    expect(reviewed.body.review).toMatchObject({ name: "Escalier B et mezzanine — bilan du bâtiment conçu", automatic: false, counts: { levels: 6, rooms: 74, issues: 7 } });
    expect(reviewed.body.history).toHaveLength(1);
    expect(reviewed.body.audit.find((x: { id: string }) => x.id === "review").status).toBe("OK");
    // « Derniers événements » (transmissionV62.events du prototype) : relus du journal daté — la revue qui vient d'être rattachée, le modèle importé.
    const eventKinds = (reviewed.body.events as { kind: string; label: string }[]).map((e) => e.kind);
    expect(reviewed.body.events.length).toBeLessThanOrEqual(10);
    expect(eventKinds).toContain("revue");
    expect(eventKinds).toContain("modele");
    expect(eventKinds.every((k) => ["modele", "programme", "parcelle", "revue", "maptiler"].includes(k))).toBe(true);

    const report = await client.get(`/projects/${pid}/design-review/rapport`);
    expect(report.status).toBe(200);
    expect(report.headers["content-disposition"]).toBe('attachment; filename="Bilan_Harmonie_Batiment_V7.html"');
    expect(report.text).toContain("<title>P.118 — Bilan Harmonie du bâtiment conçu · V7</title>");
    expect(report.text).toContain("Lecture des 74 zones");
    expect(report.text).toContain("Transmission des données");
    expect(report.text).toContain("Intentions transmises et propositions de conception");
    expect(report.text).toContain("<svg");

    // « Enregistrer les références » : la référence directionnelle devient exploitable, la réserve COMPASS disparaît et l'étape 10 est à réexaminer.
    const step10Before = (await client.get(`/projects/${pid}/steps/10`)).body;
    expect(step10Before.stale).toBe(false);
    const saved = await client.put(`/projects/${pid}/design-review/compass`).send({ basis: "magnetic", facing: 124, date: "2026-10-02", uncertainty: 2, source: "Boussole de chantier", facadeReason: "Façade de la porte P00", confirmed: true });
    expect(saved.status).toBe(200);
    expect(saved.body.compass.status).toMatchObject({ ready: true, missing: [], gua: { name: "Qian", direction: "NO" } });
    expect(saved.body.analysis.issues.map((x: { id: string }) => x.id)).not.toContain("COMPASS");
    expect(saved.body.analysis.stale).toBe(true); // les références font partie des entrées de la revue
    const step10After = (await client.get(`/projects/${pid}/steps/10`)).body;
    expect(step10After.stale).toBe(true);
    // Observation déclarée du contexte extérieur (site-note) : règle des 20 caractères, statut du prototype, réserve CONTEXT levée,
    // audit « Preuves de contexte extérieur » OK, bilan produit avant elle périmé, conservée dans l'archive.
    const short = await client.put(`/projects/${pid}/design-review/observation`).send({ note: "trop court" });
    expect(short.status).toBe(422);
    expect(short.body.message).toBe("Décrivez la source, la date et ce qui a été observé (20 caractères minimum).");
    await client.get(`/projects/${pid}/design-review/rapport`);
    const declared = await client.put(`/projects/${pid}/design-review/observation`).send({ note: "Voie en T au nord-est, masse voisine R+3 à l'ouest ; relevé sur place le 12/09/2026." });
    expect(declared.status).toBe(200);
    expect(declared.body.siteContext).toMatchObject({ observation: "Voie en T au nord-est, masse voisine R+3 à l'ouest ; relevé sur place le 12/09/2026.", observationStatus: "Déclaration utilisateur, non contrôle indépendant", satelliteObserved: true });
    expect(declared.body.analysis.issues.map((x: { id: string }) => x.id)).not.toContain("CONTEXT");
    expect(declared.body.audit.find((x: { id: string }) => x.id === "external")).toMatchObject({ status: "OK" });
    expect((await client.get(`/projects/${pid}/documents`)).body.documents.find((d: { kind: string }) => d.kind === "bilan-batiment").freshness).toBe("perime");
    expect((await client.get(`/projects/${pid}/analyses`)).body.checks.find((c: { id: string }) => c.id === "design:CONTEXT")).toMatchObject({ status: "conforme" });
    // « Collecter l'altitude indicative du centre » : posée sur le contexte, l'observation conservée, valeur incohérente refusée.
    expect((await client.put(`/projects/${pid}/design-review/elevation`).send({ point: [-7.3196824, 33.7082212, "x"] })).status).toBe(400);
    const centre = await client.put(`/projects/${pid}/design-review/elevation`).send({ point: [-7.3196824, 33.7082212, 42.5] });
    expect(centre.status).toBe(200);
    expect(centre.body.siteContext).toMatchObject({ satelliteObserved: true, elevation: { value: 42.5, unit: "m", coordinates: [-7.3196824, 33.7082212], source: "MapTiler Elevation API", quality: "service numérique, non relevé topographique" } });
    expect((centre.body.events as { kind: string; label: string }[])[0]).toMatchObject({ kind: "maptiler", label: "Altitude indicative du centre collectée (service MapTiler)" });
    const archived = (await client.get(`/projects/${pid}/archive`)).body;
    expect(archived.project.siteContext).toMatchObject({ satelliteObserved: true, elevation: { value: 42.5 } });
    // La revue actualisée a aussi versé une revue documentaire au dossier Harmony (comme `review(p)` du prototype), exportée avec lui.
    const reviews = archived.project.harmony.reviews as { name: string; author: string; signature: string; sourceHash: string; html?: unknown }[];
    expect(reviews.length).toBeGreaterThanOrEqual(1);
    const lastReview = reviews[reviews.length - 1]!;
    expect(lastReview).toMatchObject({ name: "Actualisation de la lecture du modèle", author: "Analyse documentaire automatique ; validation humaine non acquise", sourceHash: reviewed.body.analysis.nativeHash });
    expect(lastReview.html).toBeUndefined();
    // Jamais pour un autre utilisateur.
    const other = await registerAndLogin("design-other@example.com");
    expect((await other.get(`/projects/${pid}/design-review`)).status).toBe(404);
    expect((await other.post(`/projects/${pid}/design-review/review`)).status).toBe(404);
    expect((await other.put(`/projects/${pid}/design-review/observation`).send({ note: "Observation d'un intrus, assez longue pour passer." })).status).toBe(404);
  }, 30000);

  it("computes a parcel georeference like the prototype's data (EPSG:26191 → WGS84, project north 358.946°)", () => {
    const g = georeferenceFromParcel({ vertices: [[321946.82, 347183.88], [321954.11, 347215.38], [321995.84, 347186.25], [321978.68, 347161.67]], crs: "EPSG:26191", centroid: [321969.1332212173, 347187.4245213032] });
    expect(g).not.toBeNull();
    expect(g!.latitude).toBeCloseTo(33.708221167915354, 5);
    expect(g!.longitude).toBeCloseTo(-7.319682410174416, 5);
    expect(g!.projectNorth).toBeCloseTo(358.94606, 3);
    expect(g!.hypothesis).toBe(true);
    expect(georeferenceFromParcel({ vertices: [[1, 2], [3, 4], [5, 6]], crs: "EPSG:9999" })).toBeNull();
  });

  it("a project without a model has no zones, no plans, and only the documentary reserves", async () => {
    const client = await registerAndLogin("design-blank@example.com");
    const project = await client.post("/projects").send({ code: "P.930", name: "Sans modèle" });
    const v = (await client.get(`/projects/${project.body.id}/design-review`)).body;
    expect(v.example).toBe(false);
    expect(v.analysis.rooms).toHaveLength(0);
    expect(v.analysis.nativeId).toBeNull();
    expect(v.analysis.issues.map((x: { id: string }) => x.id)).toEqual(["CONTEXT", "COMPASS", "FLYING"]);
    expect(v.plans).toEqual({});
    expect(v.review).toBeNull();
    expect(v.assumptions).toEqual([]);
    expect(v.georeference).toBeNull();
    const audit = Object.fromEntries(v.audit.map((x: { id: string; status: string }) => [x.id, x.status]));
    expect(audit).toMatchObject({ link: "À documenter", parcel: "À documenter", program: "À documenter", geometry: "À documenter", review: "À documenter", decision: "À documenter", geo: "À documenter" });
    const report = await client.get(`/projects/${project.body.id}/design-review/rapport`);
    expect(report.status).toBe(200);
    expect(report.text).toContain("<title>Sans modèle — Bilan Harmonie du bâtiment conçu · V7</title>");
    expect(report.text).not.toContain("Le scénario de référence réunit formation");
  });
});

describe("Programme ↔ modèle dessiné, hypothèses et transfert surfacique", () => {
  it("links programme lines to the model's rooms by id (one room, one line), updates the Harmony room record, and unlinks", async () => {
    const client = await registerAndLogin("links@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const before = (await client.get(`/projects/${pid}/programme/model-links`)).body;
    expect(before.applied).toBe(true);
    expect(before.hasModel).toBe(true);
    expect(before.roomCount).toBe(74);
    expect(before.rows.length).toBeGreaterThan(60);
    // Le cas résolu relie chaque ligne à sa zone : surfaces dessinées comparées, écarts calculés.
    const linkedRow = before.rows.find((r: { linked: unknown[] }) => r.linked.length > 0);
    expect(linkedRow).toBeDefined();
    expect(linkedRow.drawnArea).toBeGreaterThan(0);
    expect(typeof linkedRow.delta).toBe("number");
    // Délier puis relier : la zone redevient disponible pour une autre ligne ; une zone déjà affectée est refusée.
    const roomId = linkedRow.linked[0].id as string;
    const spaceId = linkedRow.space.id as string;
    const del = await client.delete(`/projects/${pid}/programme/case/links/${encodeURIComponent(spaceId)}/${encodeURIComponent(roomId)}`);
    expect(del.status).toBe(204);
    const afterUnlink = (await client.get(`/projects/${pid}/programme/model-links`)).body;
    const row = afterUnlink.rows.find((r: { space: { id: string } }) => r.space.id === spaceId);
    expect(row.linked).toEqual([]);
    expect(row.drawnArea).toBeNull();
    expect(row.options.map((o: { id: string }) => o.id)).toContain(roomId);
    const otherRow = afterUnlink.rows.find((r: { space: { id: string }; linked: { id: string }[] }) => r.space.id !== spaceId && r.linked.length > 0);
    const taken = otherRow.linked[0].id as string;
    const refused = await client.post(`/projects/${pid}/programme/case/links`).send({ spaceId, roomId: taken });
    expect(refused.status).toBe(422);
    expect(refused.body.message).toBe("Zone déjà affectée à une autre ligne");
    const absent = await client.post(`/projects/${pid}/programme/case/links`).send({ spaceId, roomId: "rdc|nope" });
    expect(absent.body.message).toBe("Zone absente du modèle");
    const relink = await client.post(`/projects/${pid}/programme/case/links`).send({ spaceId, roomId });
    expect(relink.status).toBe(201);
    const after = (await client.get(`/projects/${pid}/programme/model-links`)).body;
    expect(after.rows.find((r: { space: { id: string } }) => r.space.id === spaceId).linked.map((l: { id: string }) => l.id)).toEqual([roomId]);
    expect(after.revision).toBe(before.revision + 2);
    // La fiche Harmony du local porte la cible de la ligne ; le bilan la compare.
    const review = (await client.get(`/projects/${pid}/design-review`)).body;
    expect(review.audit.find((x: { id: string }) => x.id === "room-links").status).toBe("OK");
    // Un projet sans programme : rien à relier.
    const blank = await client.post("/projects").send({ code: "P.940", name: "Vide" });
    expect((await client.get(`/projects/${blank.body.id}/programme/model-links`)).body).toMatchObject({ applied: false, rows: [], hasModel: false });
  });

  it("edits the applied case's hypotheses with the prototype's rule, and previews / applies a surface transfer at constant total", async () => {
    const client = await registerAndLogin("transfer@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const programme = (await client.get(`/projects/${pid}/programme`)).body;
    const hyp = programme.programmeCase.hypotheses[0];
    // Le cas résolu porte déjà responsable et preuve (statut brut « hypothesis » du prototype) ; une preuve effacée bloque la confirmation.
    expect(hyp).toMatchObject({ id: "H-USAGE", status: "hypothesis", owner: "Programmiste — rôle de démonstration" });
    const cleared = await client.patch(`/projects/${pid}/programme/case/hypotheses/${encodeURIComponent(hyp.id)}`).send({ proof: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.hypotheses[0].proof).toBe("");
    const refused = await client.patch(`/projects/${pid}/programme/case/hypotheses/${encodeURIComponent(hyp.id)}`).send({ status: "Confirmée par preuve" });
    expect(refused.status).toBe(422);
    expect(refused.body.message).toBe("Renseignez d’abord responsable et preuve / motif.");
    expect((await client.get(`/projects/${pid}/programme`)).body.programmeCase.hypotheses[0].status).toBe("hypothesis");
    const badStatus = await client.patch(`/projects/${pid}/programme/case/hypotheses/${encodeURIComponent(hyp.id)}`).send({ status: "Validée" });
    expect(badStatus.status).toBe(400);
    const ok = await client.patch(`/projects/${pid}/programme/case/hypotheses/${encodeURIComponent(hyp.id)}`).send({ owner: "Chef de projet", proof: "Note de renseignements du 12/03", status: "Confirmée par preuve" });
    expect(ok.status).toBe(200);
    expect(ok.body.hypotheses[0]).toMatchObject({ owner: "Chef de projet", proof: "Note de renseignements du 12/03", status: "Confirmée par preuve" });
    expect(ok.body.revision).toBe(programme.programmeCase.revision); // révision inchangée
    const unknown = await client.patch(`/projects/${pid}/programme/case/hypotheses/H-zzz`).send({ owner: "x" });
    expect(unknown.status).toBe(422);

    const spaces = programme.programmeCase.spaces.filter((s: { quantity: number }) => s.quantity > 0);
    const [from, to] = [spaces[0], spaces[1]];
    const totalBefore = programme.programmeCase.sums.total;
    const bad = await client.post(`/projects/${pid}/programme/case/transfer/preview`).send({ from: from.id, to: to.id, amount: 5, reason: "court" });
    expect(bad.status).toBe(422);
    expect(bad.body.message).toBe("Justifiez le transfert et ses conséquences.");
    const preview = await client.post(`/projects/${pid}/programme/case/transfer/preview`).send({ from: from.id, to: to.id, amount: "5", reason: "Besoin de place pour la formation ; capacité inchangée." });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ projectId: pid, from: from.id, to: to.id, amount: 5 });
    expect(preview.body.after.total).toBeCloseTo(totalBefore, 6);
    const applied = await client.post(`/projects/${pid}/programme/case/transfer`).send(preview.body);
    expect(applied.status).toBe(200);
    expect(applied.body.transfer.total).toBeCloseTo(totalBefore, 6);
    expect(applied.body.programmeCase.revision).toBe(programme.programmeCase.revision + 2);
    const sFrom = applied.body.programmeCase.spaces.find((s: { id: string }) => s.id === from.id);
    expect(sFrom.quantity * sFrom.unitArea).toBeCloseTo(preview.body.after.from, 6);
    expect(applied.body.programmeCase.decisionReview.required).toBe(true);
    // Une comparaison périmée est refusée.
    const stale = await client.post(`/projects/${pid}/programme/case/transfer`).send(preview.body);
    expect(stale.status).toBe(422);
    expect(stale.body.message).toBe("Le programme a changé. Recalculez la comparaison.");
    const project = (await client.get(`/projects/${pid}`)).body;
    expect(project.programmeState.transfers).toHaveLength(1);
  });
});

describe("Analyses métier — quantités, contrôles traçables, scénarios", () => {
  it("serves P.118's derived quantities, the traceable checks (domain, source, version, status) tagged with the model revision, the declared structure and circulation, and the programme variants", async () => {
    const client = await registerAndLogin("analyses@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const res = await client.get(`/projects/${pid}/analyses`);
    expect(res.status).toBe(200);
    const v = res.body;
    expect(v).toMatchObject({ version: "1.0.0", modelRevision: 1, example: true, profileLabel: "Mixte / multi-usages" });
    expect(v.nativeHash).toMatch(/^[0-9a-f]{8}$/);
    // Quantités dérivées du modèle courant : 6 niveaux, 74 zones, parcelle 1 345,55 m² (1 346 m² déclarés).
    expect(v.quantities.levels).toHaveLength(6);
    expect(v.quantities.building.roomCount).toBe(74);
    expect(v.quantities.parcel.area).toBeCloseTo(1345.55, 1);
    expect(v.quantities.parcel.officialArea).toBe(1346);
    expect(v.quantities.programme.linkedRooms).toBe(74);
    // Contrôles : 10 règles de conception + 14 transmissions + chiffrage + structure = 26, chacun avec domaine / source / version.
    expect(v.checks).toHaveLength(26);
    expect(v.checks.every((c: { domain: string; source: string; version: string; status: string }) => c.domain && c.source && c.version && c.status)).toBe(true);
    const byId = Object.fromEntries(v.checks.map((c: { id: string }) => [c.id, c]));
    expect(byId["design:HEIGHT"]).toMatchObject({ status: "a-verifier", step: 8, priority: "prioritaire" });
    expect(byId["design:IMPLANTATION"]).toMatchObject({ status: "conforme" });
    expect(byId["design:CONTEXT"]).toMatchObject({ status: "non-evalue" });
    expect(byId["finance:complet"]).toMatchObject({ status: "conforme" }); // l'exemple renseigne les huit postes
    expect(byId["structure:dimensionnement"]).toMatchObject({ status: "non-evalue", detail: "Exigences enregistrées ; résistance, flèche, poinçonnement, pertes, ancrages et appuis non calculés" });
    expect(v.totals).toMatchObject({ "non-conforme": 0 });
    expect(v.totals.conforme + v.totals["non-conforme"] + v.totals["a-verifier"] + v.totals["non-evalue"] + v.totals["sans-objet"]).toBe(26);
    // Résultats calculés des étapes et dossier déclaré (structure, circulations) de l'exemple.
    expect(v.results.finance).toMatchObject({ investissement: 24000000, financement: 24000000, solde: 0 });
    expect(v.results.decision).toBe("GO sous conditions");
    expect(v.structure.statements.map((s: { kind: string }) => s.kind)).toEqual(["exigence", "exigence", "exigence", "hypothese", "representation", "representation", "etat"]);
    expect(v.circulation).toMatchObject({ revision: 3, totals: { aboveGround: 345.602, basement: 53.067 } });
    expect(v.circulation.spaces).toHaveLength(12);
    // Variantes de programme : la variante courante (révision 6), sommée depuis ses fiches.
    expect(v.scenarios).toHaveLength(1);
    expect(v.scenarios[0]).toMatchObject({ revision: 6, current: true, deltaProgramme: 0 });
    expect(v.scenarios[0].sums.programme).toBeCloseTo(2932.26, 2);
    // Un projet vierge : rien n'est estimé.
    const blank = await client.post("/projects").send({ code: "P.960", name: "Vide" });
    const empty = (await client.get(`/projects/${blank.body.id}/analyses`)).body;
    expect(empty.quantities.levels).toEqual([]);
    expect(empty.quantities.programme).toBeNull();
    expect(empty.structure).toBeNull();
    expect(empty.circulation).toBeNull();
    expect(empty.scenarios).toEqual([]);
    const emptyIds = Object.fromEntries(empty.checks.map((c: { id: string; status: string }) => [c.id, c.status]));
    expect(emptyIds["design:NO-MODEL"]).toBe("non-evalue");
    expect(emptyIds["design:HEIGHT"]).toBe("sans-objet");
    expect(emptyIds["finance:complet"]).toBe("non-evalue");
    expect(emptyIds["structure:dimensionnement"]).toBe("non-evalue");
    // Jamais pour un autre utilisateur.
    const other = await registerAndLogin("analyses-other@example.com");
    expect((await other.get(`/projects/${pid}/analyses`)).status).toBe(404);
  });
});

describe("Dessins techniques et exports de l'Atelier au catalogue des documents", () => {
  it("registers a DXF export with its level, view and model revision, lists it as up to date, flags it stale after a model write, serves and deletes it, and enforces access", async () => {
    const client = await registerAndLogin("dessins@example.com");
    const pid = (await client.post("/examples/p118-exemple-complet/import")).body.id as string;
    const dxf = "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nMurs\n10\n0\n20\n0\n30\n0\n11\n4\n21\n0\n31\n0\n0\nENDSEC\n0\nEOF\n";
    const view = { schema: 14, mode: "volume", tech: "plan", levelScope: "level", activeLevel: "rdc" };
    const created = await client
      .post(`/projects/${pid}/documents/dessins`)
      .set("Content-Type", "application/octet-stream")
      .set("X-File-Name", encodeURIComponent("Atelier_P.118.dxf"))
      .set("X-File-Type", "application/dxf")
      .set("X-Export-Kind", "dxf")
      .set("X-Export-Level", "rdc")
      .set("X-Export-Level-Name", encodeURIComponent("RDC"))
      .set("X-Export-View", encodeURIComponent(JSON.stringify(view)))
      .send(Buffer.from(dxf));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: "dxf", fileName: "Atelier_P.118.dxf", levelId: "rdc", levelName: "RDC", modelRevision: 1, size: Buffer.byteLength(dxf) });
    expect(created.body.nativeHash).toMatch(/^[0-9a-f]{8}$/);
    const id = created.body.id as string;
    // Au catalogue, groupe « dessins », à jour à la révision 1, avec niveau et vue.
    let docs = (await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; group: string; label: string; href: string; freshness: string | null; stepNumber: number | null; produced: { modelRevision: number } }[];
    let entry = docs.find((d) => d.kind === `dessin:${id}`)!;
    expect(entry).toMatchObject({ group: "dessins", label: "Dessin technique DXF · RDC · dessin plan · révision 1", href: `/projects/${pid}/documents/dessins/${id}`, freshness: "a-jour", stepNumber: 10, produced: { modelRevision: 1 } });
    expect(docs).toHaveLength(43);
    // Le fichier est servi tel quel, en pièce jointe.
    const file = await client.get(`/projects/${pid}/documents/dessins/${id}`);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toMatch(/application\/dxf/);
    expect(file.headers["content-disposition"]).toContain("Atelier_P.118.dxf");
    expect(file.text ?? file.body.toString()).toBe(dxf);
    // Un mur ajouté au modèle (révision 2) : l'export de la révision 1 est périmé, le fichier reste téléchargeable.
    expect((await client.post(`/projects/${pid}/atelier/commands`).send(lot(1, [{ type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3.2), calqueId: "Murs" } }]))).status).toBe(200);
    docs = (await client.get(`/projects/${pid}/documents`)).body.documents;
    entry = docs.find((d) => d.kind === `dessin:${id}`)!;
    expect(entry.freshness).toBe("perime");
    expect((await client.get(`/projects/${pid}/documents/dessins/${id}`)).status).toBe(200);
    // Refus : type inconnu, fichier vide, lecteur / étranger.
    expect((await client.post(`/projects/${pid}/documents/dessins`).set("Content-Type", "application/octet-stream").set("X-File-Name", "x.exe").send(Buffer.from("x"))).status).toBe(400);
    expect((await client.post(`/projects/${pid}/documents/dessins`).set("Content-Type", "application/octet-stream").set("X-File-Name", "x.svg").send(Buffer.alloc(0))).status).toBe(400);
    const stranger = await registerAndLogin("stranger-dessins@example.com");
    expect((await stranger.get(`/projects/${pid}/documents/dessins/${id}`)).status).toBe(404);
    expect((await stranger.delete(`/projects/${pid}/documents/dessins/${id}`)).status).toBe(404);
    // Retrait du catalogue.
    expect((await client.delete(`/projects/${pid}/documents/dessins/${id}`)).status).toBe(204);
    expect((await client.get(`/projects/${pid}/documents/dessins/${id}`)).status).toBe(404);
    expect(((await client.get(`/projects/${pid}/documents`)).body.documents as unknown[]).length).toBe(42);
  }, 30_000);
});

describe("Documents — catalogue, productions et actualité", () => {
  it("lists P.118's producible documents, records each production with the model revision and input hash, and flags a report as stale once its inputs change", async () => {
    const client = await registerAndLogin("documents@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const first = (await client.get(`/projects/${pid}/documents`)).body;
    // 1 synthèse + 21 rapports d'étape + bilan + 6 plans + tableau des surfaces + programme CSV + fiches de l'exemple + dossier complet de l'exemple + archive + 7 tableaux et quantités de l'Atelier + maquette IFC.
    expect(first.documents).toHaveLength(42);
    expect(first.modelRevision).toBe(1);
    expect(first.documents.every((d: { freshness: unknown; produced: unknown; current: { modelRevision: number; inputHash: string } }) => d.freshness === null && d.produced === null && d.current.modelRevision === 1 && /^([0-9a-f]{8}|[0-9a-f]{16})$/.test(d.current.inputHash))).toBe(true);
    const kinds = first.documents.map((d: { kind: string }) => d.kind);
    expect(kinds).toEqual(expect.arrayContaining(["harmonie-synthese", "harmonie-etape-02", "bilan-batiment", "plan-lecture-rdc", "tableau-surfaces", "programme-csv", "fiches-espaces-csv", "dossier-exemple", "archive-projet"]));
    // Produire le rapport de l'étape 02 : la production est enregistrée, à jour.
    expect((await client.get(`/projects/${pid}/steps/2/harmonie/rapport`)).status).toBe(200);
    const docOf = async (kind: string) => ((await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; freshness: string | null; produced: { count: number; modelRevision: number; inputHash: string } | null; fileName: string }[]).find((d) => d.kind === kind)!;
    let d02 = await docOf("harmonie-etape-02");
    expect(d02).toMatchObject({ freshness: "a-jour", fileName: "Harmonie_Etape_02_V7.html", produced: { count: 1, modelRevision: 1 } });
    expect((await client.get(`/projects/${pid}/steps/2/harmonie/rapport`)).status).toBe(200);
    expect((await docOf("harmonie-etape-02")).produced!.count).toBe(2);
    // Un arbitrage à l'étape 02 change les entrées du rapport : périmé ; l'étape 03 n'est pas concernée (jamais produite).
    await client.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "adapted", notes: "Adaptation pour le test des documents" });
    d02 = await docOf("harmonie-etape-02");
    expect(d02.freshness).toBe("perime");
    expect((await docOf("harmonie-etape-03")).freshness).toBeNull();
    // Plan de lecture SVG, tableau des surfaces, programme et fiches : pièces jointes nommées comme le prototype, productions enregistrées.
    const plan = await client.get(`/projects/${pid}/documents/plan/rdc`);
    expect(plan.status).toBe(200);
    expect(plan.headers["content-disposition"]).toBe('attachment; filename="Plan_lecture_rdc_V7.svg"');
    expect(plan.headers["content-type"]).toMatch(/^image\/svg\+xml/);
    expect(plan.text ?? plan.body.toString()).toContain("<svg");
    expect((await client.get(`/projects/${pid}/documents/plan/nope`)).status).toBe(404);
    const surfaces = await client.get(`/projects/${pid}/documents/surfaces`);
    expect(surfaces.headers["content-disposition"]).toBe('attachment; filename="Tableau_surfaces_V7.csv"');
    const lines = surfaces.text.split("\r\n");
    expect(lines[0]).toBe('﻿"Niveau";"Zone";"Identifiant";"Surface_zone_m2";"Usage";"Capacité_indiquée";"Cible_programme_m2";"Écart_m2";"Statut";"Lecture"');
    expect(lines).toHaveLength(1 + 74 + 6 + 1);
    expect(lines.filter((l) => l.includes('"TOTAL NIVEAU"'))).toHaveLength(6);
    const programme = await client.get(`/projects/${pid}/documents/programme`);
    expect(programme.headers["content-disposition"]).toBe('attachment; filename="Programme_projet_parcours_lot118.csv"');
    expect(programme.text.split("\r\n")).toHaveLength(75);
    const fiches = await client.get(`/projects/${pid}/documents/fiches`);
    expect(fiches.headers["content-disposition"]).toBe('attachment; filename="P118_Programme_Resolu_V8_19.csv"');
    expect(fiches.text.startsWith('﻿"ID";"Niveau";"Espace";"Surface m2";"Capacité cible";"Source capacité";"Statut"')).toBe(true);
    expect((await docOf("tableau-surfaces")).freshness).toBe("a-jour");
    expect((await docOf("plan-lecture-rdc")).freshness).toBe("a-jour");
    // Le bilan et l'archive s'enregistrent aussi ; une révision du modèle (écriture de l'Atelier) périme les documents du modèle.
    await client.get(`/projects/${pid}/design-review/rapport`);
    await client.get(`/projects/${pid}/archive`);
    expect((await docOf("bilan-batiment")).freshness).toBe("a-jour");
    expect((await docOf("archive-projet")).freshness).toBe("a-jour");
    const revisionAvant = (await client.get(`/projects/${pid}/atelier/model`)).body.revision as number;
    const put = await client.post(`/projects/${pid}/atelier/commands`).send(lot(revisionAvant, [{ type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3.2), calqueId: "Murs" } }]));
    expect(put.status).toBe(200);
    const after = (await client.get(`/projects/${pid}/documents`)).body;
    expect(after.modelRevision).toBe(2);
    expect(after.documents.find((d: { kind: string }) => d.kind === "archive-projet").freshness).toBe("perime");
    expect(after.documents.find((d: { kind: string }) => d.kind === "tableau-surfaces").freshness).toBe("perime");
    // Jamais pour un autre utilisateur ; un projet sans modèle n'offre ni plan ni tableau.
    const other = await registerAndLogin("documents-other@example.com");
    expect((await other.get(`/projects/${pid}/documents`)).status).toBe(404);
    expect((await other.get(`/projects/${pid}/documents/surfaces`)).status).toBe(404);
    const blank = await client.post("/projects").send({ code: "P.970", name: "Vide" });
    const blankDocs = (await client.get(`/projects/${blank.body.id}/documents`)).body.documents as { kind: string }[];
    expect(blankDocs.map((d) => d.kind).filter((k) => k.startsWith("plan-") || k === "tableau-surfaces" || k === "programme-csv" || k === "dossier-exemple")).toEqual([]);
    expect((await client.get(`/projects/${blank.body.id}/documents/surfaces`)).status).toBe(404);
    expect((await client.get(`/projects/${blank.body.id}/documents/dossier-exemple`)).status).toBe(404);
  }, 30000);

  it("« Dossier complet de l’exemple » (`fullReport` de p118-resolved-app) : un HTML autonome sur l'état courant du projet importé, aussi pour sa copie, jamais pour un projet vierge", async () => {
    const client = await registerAndLogin("dossier-exemple@example.com");
    const pid = (await client.post("/examples/p118-exemple-complet/import")).body.id as string;
    const docOf = async (id: string, kind: string) => ((await client.get(`/projects/${id}/documents`)).body.documents as { kind: string; freshness: string | null; fileName: string; group: string; stepNumber: number | null }[]).find((d) => d.kind === kind);
    expect(await docOf(pid, "dossier-exemple")).toMatchObject({ group: "exemple", fileName: "P118_Exemple_Resolu_V8_19.html", stepNumber: null, freshness: null });
    const r = await client.get(`/projects/${pid}/documents/dossier-exemple`);
    expect(r.status).toBe(200);
    expect(r.headers["content-disposition"]).toBe('attachment; filename="P118_Exemple_Resolu_V8_19.html"');
    expect(r.headers["content-type"]).toMatch(/^text\/html/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    const html = r.text as string;
    // En-tête, critères et complétude : l'exemple est entièrement renseigné (aucun champ métier manquant), 74 fiches liées, 21 étapes.
    expect(html).toContain("<title>P.118 — Exemple résolu V8.1</title>");
    expect(html).toContain("PARCOURS V8.19 · EXEMPLE ENTIÈREMENT RENSEIGNÉ");
    expect(html).toContain("<h1>P.118 — Escalier B et mezzanine</h1>");
    expect(html).toContain("<p>Préserver le contour S01 et l’emprise dessinée de 673 m².</p>");
    const completeness = /(\d+)\/(\d+) champs métier renseignés ; (\d+) fiches liées ; 21 étapes ; écart programme\/polygones ([^ ]+) m²/.exec(html)!;
    expect(completeness[1]).toBe(completeness[2]);
    expect(Number(completeness[2])).toBeGreaterThan(100);
    expect(completeness[3]).toBe("74");
    // Écart programme / polygones : les fiches portent des surfaces arrondies au centième, les polygones non (0,000002 m²).
    expect(Math.abs(Number(completeness[4]!.replace(",", ".")))).toBeLessThan(0.001);
    expect(html.match(/<td>Scénario cohérent avec ses entrées<\/td>/g)).toHaveLength(21);
    // Les 21 étapes : récit (choix, justification, compromis), réponses (schéma métier ou synthèse / transmissions), intentions reçues et choix transmis.
    expect(html.match(/<section class="ex81-report-step">/g)).toHaveLength(21);
    expect(html).toContain("<h2>02 · Réglementation &amp; constructibilité</h2>");
    expect(html).toContain("<dt>Zonage / règlement applicable</dt>");
    expect(html).toContain("<dt>Synthèse / réponse de l’exemple</dt>");
    expect(html).toContain("<dt>Transmission 2</dt>"); // étape 21 : f1 après summary, comme le prototype
    expect(html).toContain('<span class="ex81-report-link">01 · Parcelle / Site existant</span>');
    expect(html).toContain("Point de départ : le choix du site ne reçoit pas une intention d’un bâtiment déjà distribué.");
    // Budget : référence et scénario défavorable sur les réponses des étapes 14 / 15 (montants que l'exemple énonce lui-même).
    expect(html).toMatch(/<tr><td>Investissement<\/td><td>24.000.000 MAD<\/td><td>26.400.000 MAD<\/td><\/tr>/);
    expect(html).toMatch(/Décision du cas :<\/b> le stress de CAPEX crée 2.400.000 MAD de besoin additionnel/);
    // Bilan du bâtiment dessiné : KPI du modèle, blocs V8.19 / V8.18 / V8.17, réserves avec les réponses retenues, 6 niveaux lus avec leur plan et leurs fiches, registre des 15 hypothèses.
    expect(html).toContain("BILAN HARMONIE · BÂTIMENT DESSINÉ");
    expect(html).toContain("<b>673 m²</b>Emprise du modèle");
    expect(html).toContain("<b>74 zones</b>Liées au programme");
    expect(html).toContain("Escalier B, mezzanine et porte X · V8.19");
    expect(html).toContain("Escalier A autour de l’ascenseur · V8.18");
    expect(html).toContain("Sanitaires redessinés · revue V8.17");
    expect(html).toContain("<td>Reprise de coupe et étude de neutralisation/réaffectation de mezzanine si nécessaire ; jalon J2 ; aucun chantier avant solution.</td>");
    expect(html.match(/m² de zones<\/summary><div class="ex81-plan"><svg/g)).toHaveLength(6);
    expect(html.match(/<summary>Ambiance choisie<\/summary>/g)!.length).toBeGreaterThanOrEqual(74);
    expect(html).toContain("<td><b>H-CONTEXTE</b><br>Contexte cartographique de travail</td>");
    expect(html).not.toContain("<button");
    expect(html).toContain("aucun chantier ni usage autorisé.</p></main>");
    // Production enregistrée, à jour ; une réponse modifiée périme le dossier (mêmes entrées que l'archive).
    expect(await docOf(pid, "dossier-exemple")).toMatchObject({ freshness: "a-jour" });
    await client.patch(`/projects/${pid}/steps/14`).send({ fields: { f1: 3300000 } });
    expect((await docOf(pid, "dossier-exemple"))!.freshness).toBe("perime");
    // Après modification, le budget suit les réponses courantes (3,3 M au lieu de 3,2 M : investissement 24,1 M).
    const again = (await client.get(`/projects/${pid}/documents/dossier-exemple`)).text as string;
    expect(again).toMatch(/<tr><td>Investissement<\/td><td>24.100.000 MAD<\/td>/);
    // La copie de travail (« Essayer une variante en copie ») a son propre dossier, nommé comme le prototype nomme la copie.
    const copy = (await client.post(`/projects/${pid}/copies`).send({})).body as { id: string };
    const copyHtml = (await client.get(`/projects/${copy.id}/documents/dossier-exemple`)).text as string;
    expect(copyHtml).toContain("<h1>P.118 — ma variante de l’exemple résolu</h1>");
    // Jamais pour un autre compte.
    const other = await registerAndLogin("dossier-exemple-other@example.com");
    expect((await other.get(`/projects/${pid}/documents/dossier-exemple`)).status).toBe(404);
  }, 30000);
});

describe("Collaboration — accès, synchronisation, journal des révisions, commentaires", () => {
  it("states what is and is not available, rebuilds the revision journal from dated data, and keeps a per-project comment thread owned by its authors", async () => {
    const client = await registerAndLogin("collab@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    // Un arbitrage, une production et un transfert pour alimenter le journal.
    await client.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "adapted", notes: "Adaptation pour le journal des révisions", owner: "Chef de projet" });
    await client.get(`/projects/${pid}/steps/2/harmonie/rapport`);
    const v = (await client.get(`/projects/${pid}/collaboration`)).body;
    expect(v.access).toMatchObject({ ownerEmail: "collab@example.com", you: "collab@example.com", role: "proprietaire", members: [], sharing: { available: true } });
    expect(v.sync).toMatchObject({ modelRevision: 1, offline: { available: true } });
    expect(v.sync.journalEntries).toBeGreaterThanOrEqual(1);
    expect(typeof v.sync.lastModelWrite).toBe("string");
    const kinds = new Set(v.journal.map((e: { kind: string }) => e.kind));
    expect([...kinds]).toEqual(expect.arrayContaining(["projet", "harmonie", "programme", "modele", "parcelle", "document", "revue"]));
    expect(v.journal[0].at >= v.journal[v.journal.length - 1].at).toBe(true); // du plus récent au plus ancien
    // B avait été écartée par l'exemple (version 1) : l'adaptation est sa version 2.
    expect(v.journal.find((e: { label: string }) => e.label === "Étape 02 · proposition H01-B adaptée et retenue")).toMatchObject({ kind: "harmonie", stepNumber: 2, revision: 2, detail: expect.stringContaining("responsable Chef de projet") });
    // A, adaptée et retenue par l'exemple, est écartée par le remplacement : l'état antérieur reste dans le journal.
    expect(v.journal.find((e: { label: string }) => e.label === "Étape 02 · proposition H01-A · état antérieur conservé (adaptée et retenue)")).toMatchObject({ detail: expect.stringContaining("Variante remplacée par H01-B") });
    expect(v.journal.find((e: { label: string }) => e.label === "Étape 02 · proposition H01-A écartée avec motif")).toBeDefined();
    expect(v.journal.find((e: { kind: string }) => e.kind === "document")).toMatchObject({ label: "Document produit · Rapport Harmonie de l'étape 02 · Réglementation & constructibilité", stepNumber: 2, revision: 1 });
    expect(v.journal.find((e: { kind: string }) => e.kind === "projet")).toMatchObject({ label: "Projet créé depuis l'exemple p118-exemple-complet", detail: "P.118 — Escalier B et mezzanine" });
    expect(v.journal.find((e: { kind: string }) => e.kind === "programme")).toMatchObject({ label: "Programme · révision 6", stepNumber: 7 });
    expect(v.comments).toEqual([]);
    // Commentaires : création (projet, étape), lecture par étape, suppression par l'auteur seulement.
    const empty = await client.post(`/projects/${pid}/collaboration/comments`).send({ body: "   " });
    expect(empty.status).toBe(400);
    const c1 = await client.post(`/projects/${pid}/collaboration/comments`).send({ body: "Vérifier la hauteur sous plafond avec le BET.", stepNumber: 8 });
    expect(c1.status).toBe(201);
    expect(c1.body).toMatchObject({ stepNumber: 8, authorEmail: "collab@example.com", mine: true, body: "Vérifier la hauteur sous plafond avec le BET." });
    const c2 = await client.post(`/projects/${pid}/collaboration/comments`).send({ body: "Dossier à présenter en comité." });
    expect(c2.body.stepNumber).toBeNull();
    expect((await client.get(`/projects/${pid}/collaboration/comments?step=8`)).body.map((c: { id: string }) => c.id)).toEqual([c1.body.id]);
    expect((await client.get(`/projects/${pid}/collaboration/comments`)).body).toHaveLength(2);
    const journal = (await client.get(`/projects/${pid}/collaboration`)).body;
    expect(journal.comments).toHaveLength(2);
    expect(journal.journal[0]).toMatchObject({ kind: "commentaire", label: "Commentaire · collab@example.com" });
    // Réponses en fil : rattachées au commentaire d'origine (un seul niveau), même étape ; parent inconnu refusé.
    const reply = await client.post(`/projects/${pid}/collaboration/comments`).send({ body: "Vu avec le BET : 3,20 m confirmés.", parentId: c1.body.id });
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({ parentId: c1.body.id, stepNumber: 8 });
    const replyToReply = await client.post(`/projects/${pid}/collaboration/comments`).send({ body: "Merci, je note.", parentId: reply.body.id });
    expect(replyToReply.body.parentId).toBe(c1.body.id);
    expect((await client.post(`/projects/${pid}/collaboration/comments`).send({ body: "Réponse à rien", parentId: "com_inconnu" })).status).toBe(404);
    expect((await client.get(`/projects/${pid}/collaboration/comments?step=8`)).body.map((c: { parentId: string | null }) => c.parentId)).toEqual([null, c1.body.id, c1.body.id]);
    // Jamais pour un autre utilisateur ; l'auteur seul supprime ; supprimer le commentaire d'origine emporte ses réponses.
    const other = await registerAndLogin("collab-other@example.com");
    expect((await other.get(`/projects/${pid}/collaboration`)).status).toBe(404);
    expect((await other.delete(`/projects/${pid}/collaboration/comments/${c1.body.id}`)).status).toBe(404);
    expect((await client.delete(`/projects/${pid}/collaboration/comments/${c1.body.id}`)).status).toBe(204);
    expect((await client.get(`/projects/${pid}/collaboration/comments`)).body).toHaveLength(1);
    expect((await client.delete(`/projects/${pid}/collaboration/comments/${c1.body.id}`)).status).toBe(404);
  });
});

describe("Contrôle de concurrence des saisies et des arbitrages (rejeu hors-ligne)", () => {
  it("refuses a field write whose baseline no longer matches the server, and a decision whose version moved — never a silent overwrite", async () => {
    const client = await registerAndLogin("concurrency@example.com");
    const created = await client.post("/projects").send({ code: "P.980", name: "Concurrence" });
    const pid = created.body.id as string;
    // Lecture : f1 vide. Un autre appareil écrit f1 = "Zone I5" ; une saisie fondée sur la lecture vide est refusée.
    expect((await client.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone I5" } })).status).toBe(200);
    const stale = await client.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone UA" }, baseline: { f1: null } });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "conflict", current: { f1: "Zone I5" } });
    expect(stale.body.message).toBe("« Zonage / règlement applicable » : modifié depuis votre lecture ; votre saisie n'a pas été appliquée.");
    expect((await client.get(`/projects/${pid}/steps/2`)).body.content.fields.f1).toBe("Zone I5"); // rien d'écrasé
    // La même saisie avec la bonne lecture passe ; un nombre lu comme chaîne vaut le nombre.
    expect((await client.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone UA" }, baseline: { f1: "Zone I5" } })).status).toBe(200);
    expect((await client.patch(`/projects/${pid}/steps/2`).send({ fields: { f3: 12.5 } })).status).toBe(200);
    expect((await client.patch(`/projects/${pid}/steps/2`).send({ fields: { f3: 13 }, baseline: { f3: "12.5" } })).status).toBe(200);
    // Arbitrage : version attendue 0 (jamais arbitrée) → accepté ; rejouer le même arbitrage avec la version 0 → refusé (version 1 désormais).
    const first = await client.post(`/projects/${pid}/steps/2/harmonie/H01-A`).send({ status: "retained", expectedVersion: 0 });
    expect(first.status).toBe(200);
    const replay = await client.post(`/projects/${pid}/steps/2/harmonie/H01-A`).send({ status: "dismissed", notes: "Motif suffisant ici", expectedVersion: 0 });
    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({ error: "conflict", currentVersion: 1 });
    expect((await client.get(`/projects/${pid}/steps/2`)).body.retainedCount).toBe(1); // A reste retenue
    expect((await client.post(`/projects/${pid}/steps/2/harmonie/H01-A`).send({ status: "dismissed", notes: "Motif suffisant ici", expectedVersion: 1 })).status).toBe(200);
  });

  it("treats a replayed write as already applied: same value with a stale baseline, same decision one version later → 200, no conflict", async () => {
    const client = await registerAndLogin("replay@example.com");
    const pid = (await client.post("/projects").send({ code: "P.982", name: "Rejeu" })).body.id as string;
    // Saisie rejouée après un rechargement : la valeur est déjà sur le serveur, la lecture (vide) est périmée → sans effet, pas refusée.
    expect((await client.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone I5" }, baseline: { f1: null } })).status).toBe(200);
    expect((await client.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone I5" }, baseline: { f1: null } })).status).toBe(200);
    // Une autre valeur fondée sur la même lecture périmée reste refusée.
    expect((await client.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone UA" }, baseline: { f1: null } })).status).toBe(409);
    // Arbitrage rejoué : même statut, motif et responsable, une version après celle lue → sans effet ; différent → refusé.
    const input = { status: "adapted", notes: "Adaptation suffisamment motivée", owner: "Chef de projet", expectedVersion: 0 };
    expect((await client.post(`/projects/${pid}/steps/2/harmonie/H01-A`).send(input)).status).toBe(200);
    const replay = await client.post(`/projects/${pid}/steps/2/harmonie/H01-A`).send(input);
    expect(replay.status).toBe(200);
    expect(replay.body.content.harmonie.proposals["H01-A"].decisionVersion).toBe(1); // pas une seconde version
    expect((await client.post(`/projects/${pid}/steps/2/harmonie/H01-A`).send({ ...input, notes: "Un autre motif, lui aussi suffisant" })).status).toBe(409);
  });

  it("serialises simultaneous writes on the same step: two fields sent at once are both kept (no lost update)", async () => {
    const client = await registerAndLogin("concurrency-2@example.com");
    const pid = (await client.post("/projects").send({ code: "P.981", name: "Écritures simultanées" })).body.id as string;
    for (let round = 0; round < 5; round++) {
      const [a, b, c] = await Promise.all([
        client.patch(`/projects/${pid}/steps/14`).send({ fields: { f1: 3200000 + round } }),
        client.patch(`/projects/${pid}/steps/14`).send({ fields: { f9: 10000000 + round } }),
        client.post(`/projects/${pid}/steps/14/harmonie/H13-A`).send({ status: "retained" }),
      ]);
      expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
      const step = (await client.get(`/projects/${pid}/steps/14`)).body;
      expect(step.content.fields).toMatchObject({ f1: 3200000 + round, f9: 10000000 + round });
      expect(step.retainedCount).toBe(1);
    }
  });
});

describe("Partage du projet — membres, rôles vérifiés côté serveur", () => {
  it("lets the owner invite existing accounts, lists shared projects with their role, and limits a lecteur to reading and commenting", async () => {
    const owner = await registerAndLogin("share-owner@example.com");
    const reader = await registerAndLogin("share-reader@example.com");
    const editor = await registerAndLogin("share-editor@example.com");
    const stranger = await registerAndLogin("share-stranger@example.com");
    const pid = (await owner.post("/examples/p118-exemple-complet/import")).body.id as string;

    // Invitation : compte inexistant, propriétaire lui-même, adresse normalisée, rôle inconnu.
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "nobody@example.com", role: "lecteur" })).status).toBe(404);
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "share-owner@example.com", role: "lecteur" })).body).toMatchObject({ error: "sharing_rule" });
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "share-reader@example.com", role: "chef" })).status).toBe(400);
    const invited = await owner.post(`/projects/${pid}/members`).send({ email: "  Share-Reader@Example.com ", role: "lecteur" });
    expect(invited.status).toBe(201);
    expect(invited.body).toMatchObject({ email: "share-reader@example.com", role: "lecteur", invitedBy: "share-owner@example.com" });
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "share-editor@example.com", role: "editeur" })).status).toBe(201);
    // Seul le propriétaire partage ; un étranger ne voit même pas le projet.
    expect((await reader.post(`/projects/${pid}/members`).send({ email: "share-stranger@example.com", role: "lecteur" })).status).toBe(403);
    expect((await editor.post(`/projects/${pid}/members`).send({ email: "share-stranger@example.com", role: "lecteur" })).status).toBe(403);
    expect((await stranger.get(`/projects/${pid}/members`)).status).toBe(404);
    expect((await stranger.get(`/projects/${pid}/steps`)).status).toBe(404);

    // Liste des projets : le projet partagé apparaît avec le rôle et le propriétaire ; le détail porte le rôle.
    const readerList = (await reader.get("/projects")).body as { id: string; role: string; ownerEmail: string }[];
    expect(readerList).toHaveLength(1);
    expect(readerList[0]).toMatchObject({ id: pid, role: "lecteur", ownerEmail: "share-owner@example.com" });
    expect((await owner.get("/projects")).body[0]).toMatchObject({ id: pid, role: "proprietaire", ownerEmail: "share-owner@example.com" });
    expect((await reader.get(`/projects/${pid}`)).body).toMatchObject({ role: "lecteur", ownerEmail: "share-owner@example.com" });
    expect((await editor.get(`/projects/${pid}`)).body.role).toBe("editeur");
    const members = (await reader.get(`/projects/${pid}/members`)).body;
    expect(members).toMatchObject({ owner: { email: "share-owner@example.com" }, you: { role: "lecteur" } });
    expect(members.members.map((m: { email: string; role: string }) => [m.email, m.role])).toEqual([
      ["share-reader@example.com", "lecteur"],
      ["share-editor@example.com", "editeur"],
    ]);

    // Lecteur : lit tout (étapes, programme, Atelier, analyses, documents, pièces), commente, mais ne modifie rien — 403 avec le motif, jamais 404.
    expect((await reader.get(`/projects/${pid}/steps/7`)).status).toBe(200);
    expect((await reader.get(`/projects/${pid}/programme`)).status).toBe(200);
    expect((await reader.get(`/projects/${pid}/atelier/model`)).status).toBe(200);
    expect((await reader.get(`/projects/${pid}/analyses`)).status).toBe(200);
    expect((await reader.get(`/projects/${pid}/documents`)).status).toBe(200);
    expect((await reader.get(`/projects/${pid}/steps/2/files`)).status).toBe(200);
    const refused = await reader.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone UA" } });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: "forbidden", role: "lecteur", message: "Ce projet vous est partagé en lecture : les modifications sont réservées à son propriétaire et à ses éditeurs." });
    expect((await reader.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "retained" })).status).toBe(403);
    expect((await reader.post(`/projects/${pid}/atelier/commands`).send(lot(1, [{ type: "niveau.creer", params: { nom: "X", elevation: 0 } }]))).status).toBe(403);
    expect((await reader.post(`/projects/${pid}/steps/2/files`).set("X-File-Name", "note.txt").set("Content-Type", "text/plain").send("abc")).status).toBe(403);
    expect((await reader.delete(`/projects/${pid}`)).status).toBe(403);
    // Copier = exporter puis importer : un lecteur obtient sa propre copie modifiable, l'original reste intact.
    const fork = await reader.post(`/projects/${pid}/copies`).send({ name: "Ma variante" });
    expect(fork.status).toBe(201);
    expect((await reader.get(`/projects/${fork.body.id}`)).body).toMatchObject({ role: "proprietaire", name: "Ma variante", sourceExampleId: "p118-exemple-complet" });
    expect((await reader.get("/projects")).body.map((p: { role: string }) => p.role).sort()).toEqual(["lecteur", "proprietaire"]);
    expect((await owner.get(`/projects/${fork.body.id}`)).status).toBe(404);
    const comment = await reader.post(`/projects/${pid}/collaboration/comments`).send({ body: "Lecture faite : la hauteur de la mezzanine est à confirmer.", stepNumber: 8 });
    expect(comment.status).toBe(201);
    // Notifications dans l'application (aucun courriel) : le lecteur voit l'accès reçu, le propriétaire le commentaire du lecteur ; consulter marque lu ; un étranger ne voit rien.
    const readerNotifications = await reader.get("/notifications");
    expect(readerNotifications.status).toBe(200);
    expect(readerNotifications.body.seenAt).toBeNull();
    expect(readerNotifications.body.items).toEqual([expect.objectContaining({ kind: "acces", projectId: pid, projectCode: "P.118", unread: true, text: "share-owner@example.com vous a donné accès à P.118 — Escalier B et mezzanine (lecteur)." })]);
    const ownerNotifications = (await owner.get("/notifications")).body;
    expect(ownerNotifications.items[0]).toMatchObject({ kind: "commentaire", projectId: pid, stepNumber: 8, unread: true, text: "share-reader@example.com a commenté P.118 · étape 08 : « Lecture faite : la hauteur de la mezzanine est à confirmer. »" });
    expect(ownerNotifications.items.some((n: { kind: string }) => n.kind === "acces")).toBe(false); // ses propres projets ne sont pas des accès reçus
    expect((await owner.post("/notifications/seen")).status).toBe(200);
    expect((await owner.get("/notifications")).body.items[0].unread).toBe(false);
    expect((await stranger.get("/notifications")).body.items).toEqual([]);
    expect((await request(app).get("/notifications")).status).toBe(401);
    expect((await owner.delete(`/projects/${pid}/collaboration/comments/${comment.body.id}`)).status).toBe(403); // l'auteur seul
    expect((await reader.delete(`/projects/${pid}/collaboration/comments/${comment.body.id}`)).status).toBe(204);

    // Éditeur : modifie (saisie, arbitrage, programme) sur le même projet ; le propriétaire voit l'écriture, le journal la date ; pas de suppression ni de partage.
    const edited = await editor.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone UA (éditeur)" } });
    expect(edited.status).toBe(200);
    expect((await owner.get(`/projects/${pid}/steps/2`)).body.content.fields.f1).toBe("Zone UA (éditeur)");
    // B a été écartée par l'exemple à l'import (version 1) : l'éditeur arbitre sur cette version lue.
    expect((await editor.post(`/projects/${pid}/steps/2/harmonie/H01-B`).send({ status: "retained", expectedVersion: 1 })).status).toBe(200);
    expect((await editor.delete(`/projects/${pid}`)).status).toBe(403);
    expect((await editor.patch(`/projects/${pid}/members/${invited.body.userId}`).send({ role: "editeur" })).status).toBe(403);
    // Concurrence entre membres : la lecture du propriétaire est périmée par l'écriture de l'éditeur → 409, rien d'écrasé.
    const stale = await owner.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Zone UB" }, baseline: { f1: null } });
    expect(stale.status).toBe(409);
    expect((await editor.get(`/projects/${pid}/steps/2`)).body.content.fields.f1).toBe("Zone UA (éditeur)");

    // Changement de rôle, départ volontaire, retrait par le propriétaire ; l'accès cesse aussitôt.
    expect((await owner.patch(`/projects/${pid}/members/${invited.body.userId}`).send({ role: "editeur" })).body.role).toBe("editeur");
    expect((await reader.patch(`/projects/${pid}/steps/2`).send({ fields: { f2: "Devenu éditeur" } })).status).toBe(200);
    const editorId = members.members[1].userId as string;
    expect((await reader.delete(`/projects/${pid}/members/${editorId}`)).status).toBe(403); // retirer un autre membre : propriétaire seulement
    expect((await editor.delete(`/projects/${pid}/members/${editorId}`)).status).toBe(204); // se retirer soi-même
    expect((await editor.get(`/projects/${pid}`)).status).toBe(404);
    expect((await owner.delete(`/projects/${pid}/members/${invited.body.userId}`)).status).toBe(204);
    expect((await reader.get(`/projects/${pid}`)).status).toBe(404);
    expect((await reader.get("/projects")).body.map((p: { id: string }) => p.id)).toEqual([fork.body.id]);
    expect((await owner.get(`/projects/${pid}/members`)).body.members).toEqual([]);
    expect((await owner.delete(`/projects/${pid}/members/${invited.body.userId}`)).status).toBe(404);
    // Le journal garde les écritures de l'éditeur retiré.
    const journal = (await owner.get(`/projects/${pid}/collaboration`)).body;
    expect(journal.access).toMatchObject({ role: "proprietaire", members: [] });
    expect(journal.journal.find((e: { label: string }) => e.label === "Étape 02 · proposition H01-B retenue")).toBeDefined();
  }, 30000);

  it("transfers ownership to a member: the new owner shares and deletes, the former owner stays as editor, strangers and non-members are refused", async () => {
    const owner = await registerAndLogin("transfer-owner@example.com");
    const next = await registerAndLogin("transfer-next@example.com");
    const stranger = await registerAndLogin("transfer-stranger@example.com");
    const pid = (await owner.post("/projects").send({ code: "P.OWN", name: "Transfert" })).body.id as string;
    const nextId = (await next.get("/auth/me")).body.id as string;
    expect((await owner.post(`/projects/${pid}/members/${nextId}/propriete`)).status).toBe(404); // pas encore membre
    await owner.post(`/projects/${pid}/members`).send({ email: "transfer-next@example.com", role: "lecteur" });
    expect((await next.post(`/projects/${pid}/members/${nextId}/propriete`)).status).toBe(403); // propriétaire seulement
    expect((await stranger.post(`/projects/${pid}/members/${nextId}/propriete`)).status).toBe(404);
    const transferred = await owner.post(`/projects/${pid}/members/${nextId}/propriete`);
    expect(transferred.status).toBe(200);
    expect(transferred.body).toMatchObject({ owner: { email: "transfer-next@example.com" }, you: { role: "editeur" } });
    expect(transferred.body.members.map((m: { email: string; role: string }) => [m.email, m.role])).toEqual([["transfer-owner@example.com", "editeur"]]);
    expect((await next.get(`/projects/${pid}`)).body).toMatchObject({ role: "proprietaire", ownerEmail: "transfer-next@example.com" });
    expect((await owner.get(`/projects/${pid}`)).body).toMatchObject({ role: "editeur", ownerEmail: "transfer-next@example.com" });
    expect((await owner.get("/projects")).body[0]).toMatchObject({ id: pid, role: "editeur" });
    // L'ancien propriétaire modifie encore, mais ne partage ni ne supprime plus ; le nouveau fait les deux.
    expect((await owner.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Après transfert" } })).status).toBe(200);
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "transfer-stranger@example.com", role: "lecteur" })).status).toBe(403);
    expect((await owner.delete(`/projects/${pid}`)).status).toBe(403);
    expect((await next.post(`/projects/${pid}/members`).send({ email: "transfer-stranger@example.com", role: "lecteur" })).status).toBe(201);
    expect((await next.delete(`/projects/${pid}`)).status).toBe(204);
  });
});

describe("Verrou d'édition optionnel — un seul éditeur actif", () => {
  it("reserves editing for one account, refuses other writers with the reason and the deadline (423), keeps reads and comments, expires, and lets the owner release", async () => {
    const owner = await registerAndLogin("lock-owner@example.com");
    const editor = await registerAndLogin("lock-editor@example.com");
    const reader = await registerAndLogin("lock-reader@example.com");
    const pid = (await owner.post("/projects").send({ code: "P.LOCK", name: "Verrou" })).body.id as string;
    const editorId = (await owner.post(`/projects/${pid}/members`).send({ email: "lock-editor@example.com", role: "editeur" })).body.userId as string;
    await owner.post(`/projects/${pid}/members`).send({ email: "lock-reader@example.com", role: "lecteur" });
    expect((await owner.get(`/projects/${pid}/lock`)).body).toEqual({ lock: null, yours: false });
    expect((await owner.get(`/projects/${pid}`)).body.editingLock).toBeNull();
    // Sans réservation, les deux éditeurs écrivent.
    expect((await editor.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Éditeur, sans verrou" } })).status).toBe(200);
    // L'éditeur réserve ; le propriétaire ne peut plus écrire (423, motif et échéance) mais lit et commente ; le lecteur ne peut pas réserver.
    const reserved = await editor.put(`/projects/${pid}/lock`);
    expect(reserved.status).toBe(200);
    expect(reserved.body.lock).toMatchObject({ userId: editorId, email: "lock-editor@example.com" });
    expect(reserved.body.yours).toBe(true);
    expect(new Date(reserved.body.lock.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect((await reader.put(`/projects/${pid}/lock`)).status).toBe(403);
    const refused = await owner.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Propriétaire pendant la réservation" } });
    expect(refused.status).toBe(423);
    expect(refused.body).toMatchObject({ error: "locked", lock: { email: "lock-editor@example.com" } });
    expect(refused.body.message).toMatch(/^Édition réservée par lock-editor@example\.com jusqu'à \d{2}:\d{2} : lecture et commentaires seulement/);
    // La réservation en cours est une notification pour les autres (propriétaire, lecteur), pas pour son détenteur.
    expect((await owner.get("/notifications")).body.items[0]).toMatchObject({ kind: "reservation", projectId: pid, unread: true });
    expect((await owner.get("/notifications")).body.items[0].text).toMatch(/^lock-editor@example\.com a réservé l’édition de P\.LOCK — Verrou jusqu’à \d{2}:\d{2} : lecture et commentaires seulement d’ici là\.$/);
    expect((await editor.get("/notifications")).body.items.some((n: { kind: string }) => n.kind === "reservation")).toBe(false);
    expect((await owner.post(`/projects/${pid}/steps/2/harmonie/H01-A`).send({ status: "retained" })).status).toBe(423);
    expect((await owner.post(`/projects/${pid}/atelier/commands`).send(lot(0, [{ type: "niveau.creer", params: { nom: "X", elevation: 0 } }]))).status).toBe(423);
    expect((await owner.put(`/projects/${pid}/lock`)).status).toBe(423);
    expect((await owner.get(`/projects/${pid}/steps/2`)).body.content.fields.f1).toBe("Éditeur, sans verrou");
    expect((await owner.post(`/projects/${pid}/collaboration/comments`).send({ body: "Je relis pendant que tu édites." })).status).toBe(201);
    expect((await owner.get(`/projects/${pid}`)).body.editingLock).toMatchObject({ email: "lock-editor@example.com" });
    expect((await owner.get(`/projects/${pid}/collaboration`)).body.access.lock).toMatchObject({ email: "lock-editor@example.com" });
    // Le détenteur écrit et prolonge (même début, nouvelle échéance) ; le lecteur ne peut pas libérer.
    expect((await editor.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Éditeur, avec verrou" } })).status).toBe(200);
    const renewed = await editor.put(`/projects/${pid}/lock`);
    expect(renewed.status).toBe(200);
    expect(renewed.body.lock.since).toBe(reserved.body.lock.since);
    expect(renewed.body.lock.expiresAt >= reserved.body.lock.expiresAt).toBe(true);
    expect((await reader.delete(`/projects/${pid}/lock`)).status).toBe(403);
    // Un verrou expiré n'existe plus : l'écriture passe et une nouvelle réservation est possible.
    await pool.query("UPDATE projects SET editing_lock = jsonb_set(editing_lock, '{expiresAt}', to_jsonb(($1)::text)) WHERE id = $2", [new Date(Date.now() - 60_000).toISOString(), pid]);
    expect((await owner.get(`/projects/${pid}/lock`)).body.lock).toBeNull();
    expect((await owner.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Propriétaire après expiration" } })).status).toBe(200);
    expect((await owner.put(`/projects/${pid}/lock`)).body.lock).toMatchObject({ email: "lock-owner@example.com" });
    // Le propriétaire libère sa réservation ; il peut aussi libérer celle d'un autre.
    expect((await owner.delete(`/projects/${pid}/lock`)).status).toBe(204);
    expect((await editor.put(`/projects/${pid}/lock`)).status).toBe(200);
    expect((await owner.delete(`/projects/${pid}/lock`)).status).toBe(204);
    expect((await owner.get(`/projects/${pid}/lock`)).body.lock).toBeNull();
    expect((await owner.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Libre" } })).status).toBe(200);
    // Le détenteur rend la main lui-même.
    expect((await editor.put(`/projects/${pid}/lock`)).status).toBe(200);
    expect((await editor.delete(`/projects/${pid}/lock`)).status).toBe(204);
    expect((await owner.patch(`/projects/${pid}/steps/2`).send({ fields: { f1: "Libre à nouveau" } })).status).toBe(200);
  });
});

describe("ensembles d'affichage personnels synchronisés entre appareils (D-118, DA-05-03)", () => {
  it("deux appareils du même compte : version comparée, conflit 409 avec la version du serveur, rien partagé avec un autre compte", async () => {
    const a = await registerAndLogin("ensembles-sync@example.com");
    const b = agent();
    expect((await b.post("/auth/login").send({ email: "ensembles-sync@example.com", password: "correct-horse-battery" })).status).toBe(200);
    const vide = (await a.get("/preferences/atelier-ensembles")).body;
    expect(vide).toEqual({ ensembles: [], version: null });
    const ens = { nom: "Structure", niveauId: "n1", classesMasquees: ["mobilier"], calquesMasques: [] };
    const r1 = await a.put("/preferences/atelier-ensembles").send({ ensembles: [ens], base: null });
    expect(r1.status).toBe(200);
    expect((await b.get("/preferences/atelier-ensembles")).body).toEqual({ ensembles: [ens], version: r1.body.version });
    // L'appareil B écrit sur une base périmée : 409 avec l'état du serveur.
    const r2 = await b.put("/preferences/atelier-ensembles").send({ ensembles: [], base: null });
    expect(r2.status).toBe(409);
    expect(r2.body).toMatchObject({ error: "version_perimee", ensembles: [ens], version: r1.body.version });
    const r3 = await b.put("/preferences/atelier-ensembles").send({ ensembles: [ens, { ...ens, nom: "Réseaux" }], base: r1.body.version });
    expect(r3.status).toBe(200);
    expect(r3.body.version > r1.body.version).toBe(true);
    expect((await a.put("/preferences/atelier-ensembles").send({ ensembles: [ens, ens], base: r3.body.version })).status).toBe(400);
    expect((await a.put("/preferences/atelier-ensembles").send({ ensembles: [{ nom: "" }], base: null })).status).toBe(400);
    const autre = await registerAndLogin("ensembles-autre@example.com");
    expect((await autre.get("/preferences/atelier-ensembles")).body.ensembles).toEqual([]);
    expect((await agent().get("/preferences/atelier-ensembles")).status).toBe(401);
  });
});
