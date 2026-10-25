/**
 * Portées étroites (Issue #262, reliquat de la phase 2 ; `docs/workstreams/organisations-participation/portees-etroites.md`)
 * — intégration contre PostgreSQL (suite DB-3). Règle directrice : une portée `etude` / `variante` / `revision` /
 * `documents` seule n'ouvre rien (404 partout) ; pour un participant qui lit déjà le projet, elle ajoute la capacité de son
 * rôle dans son seul périmètre ; hors périmètre, refus ; aucune régression des rôles de portée projet.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../app.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { pool } from "../db/client.js";
import { partager } from "../test-helpers/partage.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

const PASSWORD = "correct-horse-battery";
async function account(email: string) {
  const client = request.agent(app);
  const result = await client.post("/auth/register").send({ email, password: PASSWORD });
  expect(result.status).toBe(201);
  return { client, id: result.body.id as string, email };
}

async function setup() {
  const owner = await account("pe-owner@example.com");
  const lea = await account("pe-lea@example.com");
  const nora = await account("pe-nora@example.com");
  const editor = await account("pe-editor@example.com");
  const pid = (await owner.client.post("/projects").send({ code: "PE.1", name: "Portées étroites" })).body.id as string;
  for (const [a, role] of [[lea, "lecteur"], [nora, "lecteur"], [editor, "editeur"]] as const) {
    // Phase 3 (OP-D2) : plus d'ajout direct — invitation envoyée par la route, acceptée avec la logique du serveur.
    expect((await partager(owner.client, pid, a.email, role)).status).toBe(201);
  }
  const root = `/projects/${pid}/studio`;
  const sx = (await owner.client.post(`${root}/studies`).send({ name: "Étude X" })).body;
  const sy = (await owner.client.post(`${root}/studies`).send({ name: "Étude Y" })).body;
  const heads: Record<string, string> = { [sx.variant.id]: sx.revision.id, [sy.variant.id]: sy.revision.id };
  const part = async (userId: string) => (await pool.query(
    "SELECT pp.id FROM project_participations pp JOIN people pe ON pe.id = pp.person_id WHERE pp.project_id = $1 AND pe.user_id = $2 AND pp.status = 'active'", [pid, userId])).rows[0].id as string;
  const assign = (participationId: string, role: string, scopeType: string, scopeId: string) =>
    owner.client.post(`/projects/${pid}/participants/${participationId}/roles`).send({ role, scopeType, scopeId });
  const vpath = (s: string, v: string) => `${root}/studies/${s}/variants/${v}`;
  const draw = async (c: ReturnType<typeof request.agent>, s: string, v: string) => {
    const r = await c.post(`${vpath(s, v)}/commands`).send({ contractVersion: "studio-commands/1", requestId: `pe-${randomUUID()}`, baseRevisionId: heads[v], commands: [{ toolId: "studio.dessin.ligne", params: { id: `l-${randomUUID().slice(0, 8)}`, type: "line", start: { x: 0, y: 0 }, end: { x: 3, y: 2 } } }] });
    if (r.status === 200) heads[v] = r.body.revision.id;
    return r;
  };
  return { owner, lea, nora, editor, pid, root, X: sx.study.id as string, VX: sx.variant.id as string, Y: sy.study.id as string, VY: sy.variant.id as string, part, assign, vpath, draw, heads };
}

describe("portées étroites : jamais l'accès seules, une capacité dans leur périmètre", () => {
  it("portée étroite seule (aucun rôle de portée projet) : 404 partout", async () => {
    const s = await setup();
    const pNora = await s.part(s.nora.id);
    await pool.query("DELETE FROM project_role_assignments WHERE participation_id = $1 AND scope_type = 'projet'", [pNora]);
    expect((await s.assign(pNora, "concepteur", "etude", s.X)).status).toBe(201);
    expect((await s.assign(pNora, "approbateur", "variante", s.VX)).status).toBe(201);
    expect((await s.assign(pNora, "lecteur", "documents", "dessins")).status).toBe(201);
    expect((await pool.query("SELECT count(*)::int AS n FROM project_effective_access WHERE project_id = $1 AND user_id = $2", [s.pid, s.nora.id])).rows[0].n).toBe(0);
    for (const url of [`/projects/${s.pid}`, `${s.root}/studies`, `${s.root}/studies/${s.X}`, s.vpath(s.X, s.VX), `/projects/${s.pid}/documents`, `/projects/${s.pid}/participants`]) {
      expect((await s.nora.client.get(url)).status, url).toBe(404);
    }
    expect((await s.draw(s.nora.client, s.X, s.VX)).status).toBe(404);
    expect((await s.nora.client.get("/projects")).body.some((p: { id: string }) => p.id === s.pid)).toBe(false);
  });

  it("Concepteur de l'étude X (lecteur du projet) : écrit X, pas Y ; n'administre pas X", async () => {
    const s = await setup();
    const pLea = await s.part(s.lea.id);
    expect((await s.assign(pLea, "concepteur", "etude", "inconnue")).status).toBe(422);
    const a = await s.assign(pLea, "concepteur", "etude", s.X);
    expect(a.status).toBe(201);
    expect(a.body.capacites).toEqual(["modifier"]);
    expect((await s.draw(s.lea.client, s.X, s.VX)).status).toBe(200);
    expect((await s.draw(s.lea.client, s.Y, s.VY)).status).toBe(403);
    expect((await s.lea.client.get(`${s.root}/studies/${s.X}`)).body).toMatchObject({ canWrite: true, canManage: false });
    expect((await s.lea.client.get(`${s.root}/studies/${s.Y}`)).body).toMatchObject({ canWrite: false });
    expect((await s.lea.client.post(`${s.root}/studies/${s.X}/archive`)).status).toBe(403);
    expect((await s.lea.client.post(`${s.root}/studies`).send({ name: "Non" })).status).toBe(403);
    // Retrait : la capacité cesse à la requête suivante.
    expect((await s.owner.client.delete(`/projects/${s.pid}/participants/${pLea}/roles/${a.body.id}`)).status).toBe(200);
    expect((await s.draw(s.lea.client, s.X, s.VX)).status).toBe(403);
  });

  it("Approbateur de la variante, Diffuseur de l'étude, Approbateur de la révision : publications du périmètre seulement", async () => {
    const s = await setup();
    const pLea = await s.part(s.lea.id);
    const pubs = (st: string) => `${s.root}/studies/${st}/publications`;
    const submit = async (st: string, v: string) => {
      const p = await s.owner.client.post(`${s.vpath(st, v)}/publications`).send({ title: `Dossier ${v}` });
      return (await s.owner.client.post(`${pubs(st)}/${p.body.id}/soumettre`).send({})).body;
    };
    const examined = (p: { manifestHash: string; revisionId: string; documentHash: string }) => ({ manifestHash: p.manifestHash, revisionId: p.revisionId, documentHash: p.documentHash });
    const pX = await submit(s.X, s.VX), pY = await submit(s.Y, s.VY);
    expect((await s.lea.client.post(`${pubs(s.X)}/${pX.id}/approuver`).send(examined(pX))).status).toBe(403);
    expect((await s.assign(pLea, "approbateur", "variante", s.VX)).status).toBe(201);
    expect((await s.lea.client.post(`${pubs(s.Y)}/${pY.id}/approuver`).send(examined(pY))).status).toBe(403);
    expect((await s.lea.client.post(`${pubs(s.X)}/${pX.id}/approuver`).send(examined(pX))).status).toBe(200);
    expect((await s.lea.client.post(`${pubs(s.X)}/${pX.id}/diffuser`).send({})).status).toBe(403);
    expect((await s.assign(pLea, "diffuseur", "etude", s.X)).status).toBe(201);
    expect((await s.lea.client.post(`${pubs(s.X)}/${pX.id}/diffuser`).send({})).status).toBe(200);
    expect((await s.assign(pLea, "approbateur", "revision", pY.revisionId)).status).toBe(201);
    expect((await s.lea.client.post(`${pubs(s.Y)}/${pY.id}/approuver`).send(examined(pY))).status).toBe(200);
    expect((await s.lea.client.post(`${pubs(s.Y)}/${pY.id}/diffuser`).send({})).status).toBe(403);
    // Toujours sans écriture (aucun rôle Concepteur).
    expect((await s.draw(s.lea.client, s.X, s.VX)).status).toBe(403);
  });

  it("Relecteur de la variante : recontrôle dans son périmètre ; portée documents : ce dessin seulement", async () => {
    const s = await setup();
    const pLea = await s.part(s.lea.id);
    const obs = async (st: string, v: string) => {
      const c = await s.owner.client.post(`${s.vpath(st, v)}/comments`).send({ body: "Constat", audience: "projet" });
      expect((await s.owner.client.post(`${s.vpath(st, v)}/comments/${c.body.id}/observation`).send({ responsableId: s.owner.id })).status).toBe(201);
      expect((await s.owner.client.post(`${s.vpath(st, v)}/comments/${c.body.id}/observation/transitions`).send({ action: "corriger", revisionId: s.heads[v] })).status).toBe(200);
      return c.body.id as string;
    };
    const oX = await obs(s.X, s.VX), oY = await obs(s.Y, s.VY);
    const recheck = (st: string, v: string, id: string) => s.lea.client.post(`${s.vpath(st, v)}/comments/${id}/observation/transitions`).send({ action: "recontroler", revisionId: s.heads[v] });
    expect((await recheck(s.X, s.VX, oX)).status).toBe(403);
    expect((await s.assign(pLea, "relecteur", "variante", s.VX)).status).toBe(201);
    expect((await recheck(s.Y, s.VY, oY)).status).toBe(403);
    expect((await recheck(s.X, s.VX, oX)).status).toBe(200);
    const upload = (name: string) => s.owner.client.post(`/projects/${s.pid}/documents/dessins`).set("x-file-name", `${name}.svg`).set("x-export-kind", "svg").set("content-type", "image/svg+xml")
      .send(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><title>${name}</title></svg>`));
    const d1 = (await upload("a")).body.id as string, d2 = (await upload("b")).body.id as string;
    expect((await s.lea.client.get(`/projects/${s.pid}/documents/dessins/${d1}`)).status).toBe(403);
    expect((await s.assign(pLea, "lecteur", "documents", "archive-projet")).status).toBe(422);
    expect((await s.assign(pLea, "lecteur", "documents", `dessin:${d1}`)).status).toBe(201);
    expect((await s.lea.client.get(`/projects/${s.pid}/documents/dessins/${d1}`)).status).toBe(200);
    expect((await s.lea.client.get(`/projects/${s.pid}/documents/dessins/${d2}`)).status).toBe(403);
    expect((await s.lea.client.get(`/projects/${s.pid}/archive`)).status).toBe(403);
  });

  it("aucune régression des rôles de portée projet", async () => {
    const s = await setup();
    expect((await s.draw(s.editor.client, s.X, s.VX)).status).toBe(200);
    expect((await s.draw(s.editor.client, s.Y, s.VY)).status).toBe(200);
    expect((await s.draw(s.lea.client, s.X, s.VX)).status).toBe(403);
    expect((await s.lea.client.get(`${s.root}/studies/${s.X}`)).status).toBe(200);
    expect((await s.owner.client.post(`${s.root}/studies/${s.X}/archive`)).status).toBe(200);
  });
});
