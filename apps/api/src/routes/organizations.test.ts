/**
 * Organisations (phase 5, Issue #262) — intégration contre PostgreSQL (suite DB-3) : une adhésion, un groupe, un mandat
 * ou un gabarit n'ouvre aucun projet ; l'administrateur de la plateforme n'administre aucune organisation par son rôle.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { partager } from "../test-helpers/partage.js";
import { createApp } from "../app.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { pool } from "../db/client.js";

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
const tokenOf = (link: string) => decodeURIComponent(link.split("#jeton=")[1]!);

/** Organisation d'Alice, Bob membre par invitation acceptée, projet d'Alice où l'organisation est partie. */
async function setup() {
  const alice = await account("org-alice@example.com");
  const bob = await account("org-bob@example.com");
  const created = await alice.client.post("/organizations").send({ name: "Atelier Nord", creationKey: "cle-atelier-nord" });
  expect(created.status).toBe(201);
  const orgId = created.body.organization.id as string;
  const inv = await alice.client.post(`/organizations/${orgId}/invitations`).send({ email: bob.email, role: "membre", jobTitle: "Architecte" });
  expect(inv.status).toBe(202);
  expect(inv.body.mail.link).toBeTruthy();
  const accepted = await bob.client.post("/auth/invitations/accept").send({ token: tokenOf(inv.body.mail.link) });
  expect(accepted.status).toBe(200);
  expect(accepted.body.organizationId).toBe(orgId);
  const project = await alice.client.post("/projects").send({ code: "ORG.1", name: "Projet de l'agence" });
  expect(project.status).toBe(201);
  const directory = await alice.client.get(`/organizations/${orgId}/directory`);
  const bobMember = (directory.body.members as { email: string; membershipId: string; personId: string }[]).find((m) => m.email === bob.email)!;
  return { alice, bob, orgId, projectId: project.body.id as string, bobMember };
}

async function projectRowsOf(userId: string, projectId: string) {
  const members = await pool.query("SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
  const active = await pool.query(
    "SELECT pp.status FROM project_participations pp JOIN people pe ON pe.id = pp.person_id WHERE pp.project_id = $1 AND pe.user_id = $2 AND pp.status = 'active'",
    [projectId, userId],
  );
  return { members: members.rowCount, activeParticipations: active.rowCount };
}

describe("organisations : une adhésion n'est pas une participation", () => {
  it("adhésion, mandat et gabarit appliqué : le projet reste inaccessible, aucun membre ni participation active", async () => {
    const { alice, bob, orgId, projectId, bobMember } = await setup();
    expect((await bob.client.get(`/organizations/${orgId}`)).status).toBe(200);
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(404);
    expect((await alice.client.put(`/organizations/${orgId}/projects/${projectId}/participation`).send({})).status).toBe(201);
    const mandate = await alice.client.post(`/organizations/${orgId}/mandates`).send({ projectId, membershipId: bobMember.membershipId });
    expect(mandate.status).toBe(201);
    expect((await bob.client.post(`/organizations/mandates/${mandate.body.mandate.id}/accept`)).body.status).toBe("actif");
    const tpl = await alice.client.post(`/organizations/${orgId}/templates`).send({ name: "Équipe", entries: [{ label: "BET", responsibilities: ["produire"], proposedRoles: ["concepteur"] }] });
    expect(tpl.status).toBe(201);
    const applied = await alice.client.post(`/organizations/${orgId}/templates/${tpl.body.template.id}/versions/1/apply`).send({ projectId, assignments: { "0": bobMember.personId } });
    expect(applied.status).toBe(201);
    expect(applied.body.application.plan[0].outcome).toBe("creer");
    expect((await alice.client.put(`/organizations/${orgId}/projects/${projectId}/owner`)).body.accessChanged).toBe(false);
    // Le membre mandaté, inscrit au projet par le gabarit (fiche contact) et déclaré partie propriétaire : toujours rien.
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(404);
    expect(await projectRowsOf(bob.id, projectId)).toEqual({ members: 0, activeParticipations: 0 });
    const contact = await pool.query(
      "SELECT pp.status, pp.represented_organization_id FROM project_participations pp JOIN people pe ON pe.id = pp.person_id WHERE pp.project_id = $1 AND pe.user_id = $2",
      [projectId, bob.id],
    );
    expect(contact.rows).toEqual([{ status: "contact", represented_organization_id: orgId }]);
  });

  it("groupe : ajout et retrait sans aucun droit de projet ; départ sans toucher aux participations", async () => {
    const { alice, bob, orgId, projectId, bobMember } = await setup();
    const group = await alice.client.post(`/organizations/${orgId}/groups`).send({ name: "Structure" });
    expect(group.status).toBe(201);
    const add = await alice.client.put(`/organizations/${orgId}/groups/${group.body.group.id}/members/${bobMember.membershipId}`);
    expect(add.status).toBe(201);
    expect(add.body.projectAccess).toBe("aucun");
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(404);
    // Bob invité au projet par son propriétaire (droit indépendant), puis il quitte l'organisation : l'accès au projet reste.
    // Écriture directe : la voie de partage d'un compte existant change avec la phase 3 (OP-D2), pas la règle testée ici.
    await pool.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ($1, $2, 'lecteur', 'test')", [projectId, bob.id]);
    const end = await bob.client.post(`/organizations/${orgId}/memberships/${bobMember.membershipId}/end`).send({});
    expect(end.status).toBe(200);
    expect(end.body.impact.projectAccessChanged).toBe(false);
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(200);
    const groups = await alice.client.get(`/organizations/${orgId}/groups`);
    expect(groups.body.groups[0].members).toEqual([]);
    expect((await bob.client.get(`/organizations/${orgId}/directory`)).status).toBe(403);
  });
});

describe("organisations : administration déléguée, échec fermé", () => {
  it("l'administrateur de la plateforme n'administre aucune organisation par son seul rôle (404)", async () => {
    const { orgId } = await setup();
    const admin = await account("org-platform-admin@example.com");
    await pool.query("UPDATE users SET platform_role = 'admin' WHERE id = $1", [admin.id]);
    expect((await admin.client.get(`/organizations/${orgId}`)).status).toBe(404);
    expect((await admin.client.get(`/organizations/${orgId}/directory`)).status).toBe(404);
    expect((await admin.client.patch(`/organizations/${orgId}`).send({ name: "Reprise" })).status).toBe(404);
    expect((await admin.client.post(`/organizations/${orgId}/invitations`).send({ email: "x@example.com", role: "administrateur" })).status).toBe(404);
  });

  it("membre : 403 avec motif ; non-membre : 404 ; dernier administrateur protégé", async () => {
    const { alice, bob, orgId } = await setup();
    const stranger = await account("org-stranger@example.com");
    expect((await stranger.client.get(`/organizations/${orgId}`)).status).toBe(404);
    const patch = await bob.client.patch(`/organizations/${orgId}`).send({ name: "Piratage" });
    expect(patch.status).toBe(403);
    expect(patch.body.error).toBe("not_admin");
    const self = (await alice.client.get(`/organizations/${orgId}`)).body.you.membershipId as string;
    expect((await alice.client.post(`/organizations/${orgId}/memberships/${self}/end`).send({})).body.error).toBe("last_admin");
    expect((await alice.client.patch(`/organizations/${orgId}/memberships/${self}`).send({ status: "suspendue" })).body.error).toBe("last_admin");
  });

  it("invitation : mauvais compte refusé, invitant revalidé, double création rejouée sans doublon", async () => {
    const alice = await account("org-a2@example.com");
    const carol = await account("org-c2@example.com");
    const intruder = await account("org-i2@example.com");
    const first = await alice.client.post("/organizations").send({ name: "Bureau Sud", creationKey: "cle-bureau-sud" });
    const again = await alice.client.post("/organizations").send({ name: "Bureau Sud", creationKey: "cle-bureau-sud" });
    expect(again.status).toBe(200);
    expect(again.body.organization.id).toBe(first.body.organization.id);
    expect((await pool.query("SELECT count(*)::int AS n FROM organization_memberships WHERE organization_id = $1", [first.body.organization.id])).rows[0].n).toBe(1);
    const orgId = first.body.organization.id as string;
    const inv = await alice.client.post(`/organizations/${orgId}/invitations`).send({ email: carol.email, role: "membre" });
    const token = tokenOf(inv.body.mail.link);
    expect((await intruder.client.post("/auth/invitations/accept").send({ token })).status).toBe(403);
    // L'organisation suspendue : l'invitant n'a plus l'autorité, l'acceptation est refusée.
    expect((await alice.client.post(`/organizations/${orgId}/status`).send({ status: "suspendue" })).status).toBe(200);
    const refused = await carol.client.post("/auth/invitations/accept").send({ token });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("inviter_not_authorized");
    expect((await carol.client.get(`/organizations/${orgId}`)).status).toBe(404);
  });
});

describe("organisations côté projet : partie propriétaire et parties affichées, aucun droit changé", () => {
  it("déclarer la partie propriétaire ne change ni l'accès ni les rôles ; un lecteur voit l'identité seule ; une organisation close reste affichée", async () => {
    const { alice, bob, orgId, projectId, bobMember } = await setup();
    const carol = await account("org-carol@example.com");
    expect((await partager(alice.client, projectId, carol.email, "lecteur")).status).toBe(201);
    const snapshot = async () => ({
      access: (await pool.query("SELECT user_id, role, can_export, can_approve, can_publish FROM project_effective_access WHERE project_id = $1 ORDER BY user_id", [projectId])).rows,
      roles: (await pool.query("SELECT ra.role, ra.scope_type, ra.origin, pe.user_id FROM project_role_assignments ra JOIN project_participations pp ON pp.id = ra.participation_id LEFT JOIN people pe ON pe.id = pp.person_id WHERE pp.project_id = $1 ORDER BY pe.user_id, ra.role", [projectId])).rows,
      members: (await pool.query("SELECT user_id, role FROM project_members WHERE project_id = $1 ORDER BY user_id", [projectId])).rows,
    });
    const before = await snapshot();
    const empty = await carol.client.get(`/projects/${projectId}/participants`);
    expect(empty.status).toBe(200);
    expect(empty.body.organizations).toMatchObject({ owner: null, parties: [], ownerGrantsAccess: false, ownerPerson: { userId: alice.id } });

    expect((await alice.client.patch(`/organizations/${orgId}`).send({ details: "12 rue des Lilas" })).status).toBe(200);
    expect((await alice.client.put(`/organizations/${orgId}/projects/${projectId}/participation`).send({ businessRole: "Maîtrise d'œuvre" })).status).toBe(201);
    const mandate = await alice.client.post(`/organizations/${orgId}/mandates`).send({ projectId, membershipId: bobMember.membershipId, responsibilities: ["produire"] });
    expect((await bob.client.post(`/organizations/mandates/${mandate.body.mandate.id}/accept`)).body.status).toBe("actif");
    expect((await alice.client.put(`/organizations/${orgId}/projects/${projectId}/owner`)).body.accessChanged).toBe(false);
    expect(await snapshot()).toEqual(before);
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(404);
    expect((await bob.client.get(`/projects/${projectId}/participants`)).status).toBe(404);

    const seen = await carol.client.get(`/projects/${projectId}/participants`);
    expect(seen.body.organizations.owner).toEqual({ id: orgId, name: "Atelier Nord", kind: null, status: "active", youAreMember: false, isParty: true });
    expect(seen.body.organizations.parties).toHaveLength(1);
    expect(seen.body.organizations.parties[0]).toMatchObject({ id: orgId, businessRole: "Maîtrise d'œuvre", youAreMember: false });
    expect(seen.body.organizations.parties[0].representatives).toHaveLength(1);
    expect(seen.body.organizations.parties[0].representatives[0]).toMatchObject({ responsibilities: ["produire"] });
    const text = JSON.stringify(seen.body.organizations);
    expect(text).not.toContain("rue des Lilas");
    expect(text).not.toContain(bob.email);
    const head = await carol.client.get(`/projects/${projectId}`);
    expect(head.body.owningOrganization).toEqual({ id: orgId, name: "Atelier Nord", kind: null, status: "active", youAreMember: false });
    expect((await alice.client.get(`/projects/${projectId}/participants`)).body.organizations.owner.youAreMember).toBe(true);

    expect((await alice.client.post(`/organizations/${orgId}/status`).send({ status: "close", confirmName: "Atelier Nord" })).status).toBe(200);
    const closed = await carol.client.get(`/projects/${projectId}/participants`);
    expect(closed.body.organizations.owner.status).toBe("close");
    expect(closed.body.organizations.parties.map((p: { status: string }) => p.status)).toEqual(["close"]);
    expect(closed.body.organizations.parties[0].representatives).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });
});
