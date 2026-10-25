/**
 * Revue externe (phase 4, Issue #262 ; concept partie 4 et v2.2) — intégration contre PostgreSQL (suite DB-3). Scénario
 * d'acceptation : revue R03 restreinte pendant que R04 avance ; destinataire sans adhésion ni rôle de projet ; lien
 * transféré inopérant ; notes internes et éléments sans rapport inaccessibles (routeurs `/projects/:id/...`,
 * `GET /projects`, historique, archive, notifications) ; accès expiré ou révoqué refusé ; constat lié à la révision
 * exacte ; relecteur sans droit d'approuver ni de diffuser ; approbateur nommé qui approuve par les transitions Studio ;
 * paquet modifié = nouvelle version et nouveaux contrôles ; dossier diffusé conforme aux versions approuvées.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createHash, randomUUID } from "node:crypto";
import { createApp } from "../app.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { pool } from "../db/client.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

const PASSWORD = "correct-horse-battery";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function account(email: string) {
  const client = request.agent(app);
  const result = await client.post("/auth/register").send({ email, password: PASSWORD });
  expect(result.status).toBe(201);
  return { client, id: result.body.id as string, email };
}
const tokenOf = (link: string) => decodeURIComponent(link.split("#jeton=")[1]!);
const SECRET_NOTE = "NOTE-INTERNE-SECRETE";
const SECRET_TEAM = "FIL-EQUIPE-SECRET";

/** Projet d'Alice, étude Studio dessinée jusqu'à R03, publication soumise, paquet partagé à Rex (relecture) et Ana (approbation). */
async function setup() {
  const alice = await account("rv-alice@example.com");
  const rex = await account("rv-rex@example.com");
  const ana = await account("rv-ana@example.com");
  const fred = await account("rv-fred@example.com");
  const project = await alice.client.post("/projects").send({ code: "RV.1", name: "Revue externe" });
  expect(project.status).toBe(201);
  const pid = project.body.id as string;
  const root = `/projects/${pid}/studio`;
  const study = await alice.client.post(`${root}/studies`).send({ name: "Étude" });
  expect(study.status).toBe(201);
  const studyId = study.body.study.id as string, variantId = study.body.variant.id as string;
  const variantPath = `${root}/studies/${studyId}/variants/${variantId}`;
  const pubs = `${root}/studies/${studyId}/publications`;
  let head = study.body.revision.id as string;
  const draw = async (id: string, x: number) => {
    const r = await alice.client.post(`${variantPath}/commands`).send({ contractVersion: "studio-commands/1", requestId: `rv-${randomUUID()}`, baseRevisionId: head, commands: [{ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y: 0 }, end: { x, y: 2 } } }] });
    expect(r.status).toBe(200);
    head = r.body.revision.id;
    return head;
  };
  await draw("l1", 4); await draw("l2", 5);
  const R03 = await draw("l3", 6);
  const pub = await alice.client.post(`${variantPath}/publications`).send({ title: "Dossier R03" });
  expect(pub.status).toBe(201);
  expect((await alice.client.post(`${pubs}/${pub.body.id}/soumettre`).send({})).status).toBe(200);
  expect((await alice.client.post(`${variantPath}/comments`).send({ body: SECRET_TEAM })).status).toBe(201);
  const pkg = await alice.client.post(`/projects/${pid}/reviews`).send({ publicationId: pub.body.id, purpose: "Conformité de R03", expectedResponse: "Constats", dueOn: "2099-12-31" });
  expect(pkg.status).toBe(201);
  const p1 = pkg.body.package.id as string;
  expect((await alice.client.post(`/projects/${pid}/reviews/${p1}/notes`).send({ body: SECRET_NOTE })).status).toBe(201);
  const aRex = await alice.client.post(`/projects/${pid}/reviews/${p1}/assignments`).send({ email: rex.email, responsibility: "relecture" });
  const aAna = await alice.client.post(`/projects/${pid}/reviews/${p1}/assignments`).send({ email: ana.email, responsibility: "approbation", permissions: { download: true } });
  expect(aRex.status).toBe(201);
  expect(aAna.status).toBe(201);
  const shared = await alice.client.post(`/projects/${pid}/reviews/${p1}/share`);
  expect(shared.status).toBe(200);
  const link = (assignmentId: string) => (shared.body.invitations as { assignmentId: string; link?: string }[]).find((i) => i.assignmentId === assignmentId)!.link!;
  return { alice, rex, ana, fred, pid, root, variantPath, pubs, pubId: pub.body.id as string, pub: pub.body, R03, draw, p1, shared: shared.body, linkRex: link(aRex.body.assignmentId), linkAna: link(aAna.body.assignmentId), aRexId: aRex.body.assignmentId as string };
}

describe("revue externe : accès borné au paquet", () => {
  it("lien transféré inopérant ; destinataire sans adhésion ni rôle de projet ; aucune fuite", async () => {
    const s = await setup();
    expect(s.linkRex).toBeTruthy();
    const forwarded = await s.fred.client.post("/auth/invitations/accept").send({ token: tokenOf(s.linkRex) });
    expect(forwarded.status).toBe(403);
    expect((await s.fred.client.get(`/reviews/${s.p1}`)).status).toBe(404);
    const accepted = await s.rex.client.post("/auth/invitations/accept").send({ token: tokenOf(s.linkRex) });
    expect(accepted.status).toBe(200);
    expect(accepted.body.reviewPackageId).toBe(s.p1);
    // Aucun rôle de projet, aucun membre, aucune adhésion.
    const rows = await pool.query(
      "SELECT ra.id FROM project_role_assignments ra JOIN project_participations pp ON pp.id = ra.participation_id JOIN people pe ON pe.id = pp.person_id WHERE pp.project_id = $1 AND pe.user_id = $2",
      [s.pid, s.rex.id]);
    expect(rows.rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2", [s.pid, s.rex.id])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM organization_memberships m JOIN people pe ON pe.id = m.person_id WHERE pe.user_id = $1", [s.rex.id])).rowCount).toBe(0);
    // Non-fuite : chaque routeur du projet, la liste, l'historique, l'archive.
    for (const path of [`/projects/${s.pid}`, `${s.root}/studies`, `${s.variantPath}/comments`, `${s.pubs}/${s.pubId}`, `/projects/${s.pid}/documents`, `/projects/${s.pid}/collaboration`,
      `/projects/${s.pid}/members`, `/projects/${s.pid}/participants`, `/projects/${s.pid}/journal`, `/projects/${s.pid}/history`, `/projects/${s.pid}/archive`, `/projects/${s.pid}/reviews`, `/projects/${s.pid}/reviews/${s.p1}`]) {
      expect((await s.rex.client.get(path)).status, path).toBe(404);
    }
    expect(JSON.stringify((await s.rex.client.get("/projects")).body)).not.toContain(s.pid);
    expect(JSON.stringify((await s.rex.client.get("/projects/history")).body)).not.toContain(s.pid);
    expect((await s.rex.client.post(`${s.pubs}/${s.pubId}/diffuser`).send({})).status).toBe(404);
    const view = await s.rex.client.get(`/reviews/${s.p1}`);
    expect(view.status).toBe(200);
    expect(view.body.me.actions).toEqual(["consulter", "commenter", "repondre", "recontroler"]);
    const text = JSON.stringify(view.body);
    expect(text).not.toContain(SECRET_NOTE);
    expect(text).not.toContain(SECRET_TEAM);
    const notes = await s.rex.client.get("/notifications");
    expect(notes.status).toBe(200);
    expect((notes.body.items as { kind: string }[]).every((n) => n.kind === "revue")).toBe(true);
    expect(JSON.stringify(notes.body)).not.toContain(SECRET_TEAM);
    // Fichiers : consultation en ligne, téléchargement refusé sans droit.
    const svg = await s.rex.client.get(`/reviews/${s.p1}/files/svg`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); });
    expect(svg.status).toBe(200);
    expect(sha(svg.body as Buffer)).toBe((s.shared.files as { format: string; sha256: string }[]).find((f) => f.format === "svg")!.sha256);
    expect(svg.headers["x-content-type-options"]).toBe("nosniff");
    expect((await s.rex.client.get(`/reviews/${s.p1}/files/ifc`)).status).toBe(403);
  });

  it("accès révoqué ou expiré refusé ; échéance dépassée jamais un accord", async () => {
    const s = await setup();
    await s.rex.client.post("/auth/invitations/accept").send({ token: tokenOf(s.linkRex) });
    expect((await s.rex.client.get(`/reviews/${s.p1}`)).status).toBe(200);
    await pool.query("UPDATE review_assignments SET access_expires_at = now() - interval '1 minute' WHERE id = $1", [s.aRexId]);
    expect((await s.rex.client.get(`/reviews/${s.p1}`)).status).toBe(404);
    await pool.query("UPDATE review_assignments SET access_expires_at = now() + interval '1 day' WHERE id = $1", [s.aRexId]);
    expect((await s.rex.client.get(`/reviews/${s.p1}`)).status).toBe(200);
    expect((await s.alice.client.post(`/projects/${s.pid}/reviews/${s.p1}/assignments/${s.aRexId}/revoke`).send({ reason: "Fin" })).status).toBe(200);
    expect((await s.rex.client.get(`/reviews/${s.p1}`)).status).toBe(404);
    expect((await s.alice.client.patch(`/projects/${s.pid}/reviews/${s.p1}`).send({ dueOn: "2020-01-01" })).status).toBe(200);
    const follow = await s.alice.client.get(`/projects/${s.pid}/reviews`);
    const summary = (follow.body.packages as { id: string; followUp: { overdue: number; approved: boolean } }[]).find((p) => p.id === s.p1)!;
    expect(summary.followUp.overdue).toBe(1);
    expect(summary.followUp.approved).toBe(false);
  });

  it("une relecture déjà rendue reste révocable : accès retiré, résultat conservé (revue Codex PR #290)", async () => {
    const s = await setup();
    await s.rex.client.post("/auth/invitations/accept").send({ token: tokenOf(s.linkRex) });
    expect((await s.rex.client.post(`/reviews/${s.p1}/response`).send({ result: "satisfaisante" })).status).toBe(200);
    expect((await s.alice.client.post(`/projects/${s.pid}/reviews/${s.p1}/assignments/${s.aRexId}/revoke`).send({ reason: "Fin de mission" })).status).toBe(200);
    expect((await s.rex.client.get(`/reviews/${s.p1}`)).status).toBe(404);
    const row = (await pool.query("SELECT status, result, revoked_at FROM review_assignments WHERE id = $1", [s.aRexId])).rows[0];
    expect(row.status).toBe("annulee");
    expect(row.result).toBe("satisfaisante");
    expect(row.revoked_at).not.toBeNull();
  });
});

describe("revue externe : constats, nouvelle version, approbation nommée, diffusion conforme", () => {
  it("R03 restreinte pendant que R04 avance, puis v2 approuvée par l'approbatrice nommée", async () => {
    const s = await setup();
    await s.rex.client.post("/auth/invitations/accept").send({ token: tokenOf(s.linkRex) });
    await s.ana.client.post("/auth/invitations/accept").send({ token: tokenOf(s.linkAna) });
    const f1 = await s.rex.client.post(`/reviews/${s.p1}/findings`).send({ body: "Cote manquante", document: "svg", objectIds: ["l3"] });
    expect(f1.status).toBe(201);
    expect(f1.body.revisionId).toBe(s.R03);
    expect((await s.rex.client.post(`/reviews/${s.p1}/approve`).send({ manifestHash: s.pub.manifestHash })).status).toBe(403);
    const R04 = await s.draw("l4", 7);
    expect((await s.rex.client.get(`/reviews/${s.p1}`)).body.package.revisionId).toBe(s.R03);
    expect((await s.ana.client.post(`/reviews/${s.p1}/approve`).send({ manifestHash: s.pub.manifestHash })).status).toBe(409);
    expect((await s.alice.client.post(`${s.variantPath}/observations/${f1.body.id}/transitions`).send({ action: "corriger", revisionId: R04 })).status).toBe(200);
    expect((await s.rex.client.post(`/reviews/${s.p1}/findings/${f1.body.id}/recheck`).send({ outcome: "levee" })).body.error).toBe("correction_not_in_package");
    expect((await s.alice.client.post(`${s.pubs}/${s.pubId}/actualiser`).send({})).status).toBe(200);
    expect((await s.alice.client.post(`${s.pubs}/${s.pubId}/soumettre`).send({})).status).toBe(200);
    const v2 = await s.alice.client.post(`/projects/${s.pid}/reviews/${s.p1}/versions`).send({});
    expect(v2.status).toBe(201);
    const share2 = await s.alice.client.post(`/projects/${s.pid}/reviews/${v2.body.id}/share`);
    expect(share2.status).toBe(200);
    expect(share2.body.invitations).toEqual([]);
    expect((await s.rex.client.get(`/reviews/${s.p1}`)).body.package.status).toBe("remplace");
    const v2view = await s.rex.client.get(`/reviews/${v2.body.id}`);
    expect(v2view.body.package.revisionId).toBe(R04);
    expect((await s.rex.client.post(`/reviews/${v2.body.id}/findings/${f1.body.id}/recheck`).send({ outcome: "levee" })).body.statut).toBe("recontrolee");
    expect((await s.rex.client.post(`/reviews/${v2.body.id}/response`).send({ result: "satisfaisante" })).status).toBe(200);
    expect((await s.alice.client.get(`${s.pubs}/${s.pubId}`)).body.workStatus).toBe("en-revue");
    const approve = await s.ana.client.post(`/reviews/${v2.body.id}/approve`).send({ manifestHash: v2view.body.package.manifestHash });
    expect(approve.status).toBe(200);
    const approved = await s.alice.client.get(`${s.pubs}/${s.pubId}`);
    expect(approved.body.workStatus).toBe("approuve");
    expect(approved.body.approval.by.id).toBe(s.ana.id);
    expect(approved.body.diffusionStatus).toBe("non-diffuse");
    const diffused = await s.alice.client.post(`${s.pubs}/${s.pubId}/diffuser`).send({});
    expect(diffused.status).toBe(200);
    for (const f of diffused.body.diffusion.files as { format: string; sha256: string }[]) {
      expect((share2.body.files as { format: string; sha256: string }[]).some((g) => g.format === f.format && g.sha256 === f.sha256)).toBe(true);
    }
    const audit = await pool.query("SELECT action, metadata::text AS m FROM admin.audit_log WHERE action LIKE 'review.%' AND metadata->>'projectId' = $1", [s.pid]);
    expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["review.package.shared", "review.finding.created", "review.decision.recorded", "review.package.superseded"]));
    expect(audit.rows.every((r) => !String(r.m).includes("@"))).toBe(true);
  });
});
