/**
 * Organisations (phase 5, Issue #262) — intégration contre PostgreSQL (suite DB-3) : une adhésion, un groupe, un mandat
 * ou un gabarit n'ouvre aucun projet ; l'administrateur de la plateforme n'administre aucune organisation par son rôle.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { partager, partagerEnBase } from "../test-helpers/partage.js";
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
    // Écriture directe : la voie de partage d'un compte existant change avec la phase 3 (OP-D2), pas la règle testée ici
    // (lot OP-PONT : le partage s'écrit sur la participation, `project_members` n'étant plus qu'une vue).
    await partagerEnBase(projectId, bob.id, "lecteur");
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

describe("représentant mandaté → invitation de projet (reliquat de la phase 5)", () => {
  it("le propriétaire invite le représentant d'un mandat actif ; l'accès naît de l'acceptation seule, la partie représentée est posée ; fin de mandat signalée, participation conservée", async () => {
    const { alice, bob, orgId, projectId, bobMember } = await setup();
    const carol = await account("org-carol-mdt@example.com");
    const stranger = await account("org-stranger-mdt@example.com");
    expect((await partager(alice.client, projectId, carol.email, "lecteur")).status).toBe(201);
    expect((await alice.client.put(`/organizations/${orgId}/projects/${projectId}/participation`).send({})).status).toBe(201);
    const proposed = await alice.client.post(`/organizations/${orgId}/mandates`).send({ projectId, membershipId: bobMember.membershipId, responsibilities: ["produire"] });
    expect(proposed.status).toBe(201);
    const mandateId = proposed.body.mandate.id as string;
    const route = `/projects/${projectId}/members/mandates/${mandateId}`;
    const body = { roles: [{ role: "lecteur" }], invitationDays: 7 };

    // Mandat seulement proposé : 409 avec motif ; non propriétaire : 403 ; sans accès : 404 ; mandat d'un autre projet : 404.
    const notActive = await alice.client.post(route).send(body);
    expect(notActive.status).toBe(409);
    expect(notActive.body.error).toBe("mandate_inactive");
    expect(notActive.body.message).toBeTruthy();
    expect((await bob.client.post(`/organizations/mandates/${mandateId}/accept`)).body.status).toBe("actif");
    const forbidden = await carol.client.post(route).send(body);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.message).toBeTruthy();
    expect((await stranger.client.post(route).send(body)).status).toBe(404);
    const other = await alice.client.post("/projects").send({ code: "ORG.2", name: "Autre projet" });
    expect((await alice.client.post(`/projects/${other.body.id}/members/mandates/${mandateId}`).send(body)).status).toBe(404);

    // L'annuaire du propriétaire montre l'état côté projet ; le lecteur, non. Aucune adresse.
    const ownerView = await alice.client.get(`/projects/${projectId}/participants`);
    expect(ownerView.body.organizations.parties[0].representatives[0]).toMatchObject({ mandateId, projectSide: "non_invite", invitable: true });
    expect((await carol.client.get(`/projects/${projectId}/participants`)).body.organizations.parties[0].representatives[0]).toMatchObject({ projectSide: null, invitable: false });
    expect(JSON.stringify(ownerView.body.organizations)).not.toContain(bob.email);

    // Aperçu : rien n'est écrit, l'adresse n'est pas montrée, la partie représentée l'est.
    const preview = await alice.client.post(`${route}/preview`).send(body);
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toMatchObject({ email: null, accountExists: true, blocking: null, representative: { mandateId, organization: { id: orgId, name: "Atelier Nord" } } });
    expect((await pool.query("SELECT 1 FROM auth.invitations WHERE mandate_id = $1", [mandateId])).rowCount).toBe(0);

    const sent = await alice.client.post(route).send(body);
    expect(sent.status).toBe(202);
    expect(sent.body.invitation).toMatchObject({ mandateId, representedOrganizationName: "Atelier Nord" });
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(404);
    expect(await projectRowsOf(bob.id, projectId)).toEqual({ members: 0, activeParticipations: 0 });
    expect((await alice.client.get(`/projects/${projectId}/participants`)).body.organizations.parties[0].representatives[0].projectSide).toBe("invitation_en_attente");
    const orgSide = await alice.client.get(`/organizations/${orgId}/projects`);
    expect(orgSide.body.projects.find((p: { projectId: string }) => p.projectId === projectId).mandates[0].projectSide).toBe("invitation_en_attente");
    // Un membre non administrateur ne voit pas l'état côté projet.
    expect((await bob.client.get(`/organizations/${orgId}/projects`)).body.projects.find((p: { projectId: string }) => p.projectId === projectId).mandates[0].projectSide).toBeNull();
    const received = await bob.client.get("/notifications/invitations");
    expect(received.body.invitations[0]).toMatchObject({ projectId, representedOrganizationName: "Atelier Nord" });

    const accepted = await bob.client.post("/auth/invitations/accept").send({ token: tokenOf(sent.body.mail.link) });
    expect(accepted.status).toBe(200);
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(200);
    const part = await pool.query(
      "SELECT pp.id, pp.status, pp.represented_organization_id FROM project_participations pp JOIN people pe ON pe.id = pp.person_id WHERE pp.project_id = $1 AND pe.user_id = $2 AND pp.status <> 'terminee'",
      [projectId, bob.id],
    );
    expect(part.rows).toEqual([{ id: expect.any(String), status: "active", represented_organization_id: orgId }]);
    const recorded = await pool.query("SELECT metadata FROM admin.audit_log WHERE action = 'participation.representation_recorded' AND target_id = $1", [projectId]);
    expect(recorded.rows[0].metadata).toMatchObject({ mandateId, representedOrganizationId: orgId });
    const created = await pool.query("SELECT metadata::text AS m FROM admin.audit_log WHERE action = 'invitation.created' AND metadata->>'mandateId' = $1", [mandateId]);
    expect(created.rowCount).toBe(1);
    expect(created.rows[0].m).not.toContain("@");
    const again = await alice.client.post(route).send(body);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("already_participant");
    expect((await alice.client.get(`/projects/${projectId}/participants`)).body.organizations.parties[0].representatives[0]).toMatchObject({ projectSide: "participation_active", invitable: false });

    // Fin du mandat : la participation n'est pas terminée d'office ; l'annuaire la marque, le propriétaire est notifié.
    expect((await alice.client.post(`/organizations/${orgId}/mandates/${mandateId}/end`)).status).toBe(200);
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(200);
    expect(await projectRowsOf(bob.id, projectId)).toEqual({ members: 1, activeParticipations: 1 });
    const marked = await carol.client.get(`/projects/${projectId}/participants`);
    expect(marked.body.organizations.parties[0].endedRepresentatives).toHaveLength(1);
    expect(marked.body.organizations.parties[0].endedRepresentatives[0]).toMatchObject({ participationId: part.rows[0].id, mandateId, endsOn: expect.any(String), endReason: "retrait" });
    expect(JSON.stringify(marked.body.organizations)).not.toContain(bob.email);
    const notices = await alice.client.get("/notifications");
    const notice = notices.body.items.find((n: { mandate?: { mandateId: string } }) => n.mandate?.mandateId === mandateId);
    expect(notice).toMatchObject({ kind: "acces", projectId, mandate: { participationId: part.rows[0].id } });
    expect(notice.text).toContain("Atelier Nord");
    expect((await bob.client.get("/notifications")).body.items.some((n: { mandate?: unknown }) => n.mandate)).toBe(false);
    // Mandat terminé : plus aucune invitation depuis ce mandat.
    expect((await alice.client.post(route).send(body)).body.error).toBe("mandate_inactive");
  });

  it("acceptation refusée si le mandat a pris fin depuis l'envoi ; organisation qui n'est plus partie refusée à l'envoi", async () => {
    const { alice, bob, orgId, projectId, bobMember } = await setup();
    expect((await alice.client.put(`/organizations/${orgId}/projects/${projectId}/participation`).send({})).status).toBe(201);
    const proposed = await alice.client.post(`/organizations/${orgId}/mandates`).send({ projectId, membershipId: bobMember.membershipId });
    const mandateId = proposed.body.mandate.id as string;
    expect((await bob.client.post(`/organizations/mandates/${mandateId}/accept`)).body.status).toBe("actif");
    const sent = await alice.client.post(`/projects/${projectId}/members/mandates/${mandateId}`).send({ roles: [{ role: "concepteur" }] });
    expect(sent.status).toBe(202);
    // Le représentant renonce avant d'accepter : l'invitation ne donne plus rien.
    expect((await bob.client.post(`/organizations/mandates/${mandateId}/resign`)).status).toBe(200);
    const refused = await bob.client.post("/auth/invitations/accept").send({ token: tokenOf(sent.body.mail.link) });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("mandate_ended");
    expect((await bob.client.get(`/projects/${projectId}`)).status).toBe(404);
    expect(await projectRowsOf(bob.id, projectId)).toEqual({ members: 0, activeParticipations: 0 });

    // Nouveau mandat, puis l'organisation cesse d'être partie : l'envoi est refusé avec motif.
    const second = await alice.client.post(`/organizations/${orgId}/mandates`).send({ projectId, membershipId: bobMember.membershipId });
    expect((await bob.client.post(`/organizations/mandates/${second.body.mandate.id}/accept`)).body.status).toBe("actif");
    await pool.query("UPDATE project_participations SET status = 'terminee', ends_on = greatest(current_date, coalesce(starts_on, current_date)) WHERE project_id = $1 AND organization_id = $2", [projectId, orgId]);
    const notParty = await alice.client.post(`/projects/${projectId}/members/mandates/${second.body.mandate.id}`).send({ roles: [{ role: "lecteur" }] });
    expect(notParty.status).toBe(409);
    expect(notParty.body.error).toBe("organization_not_party");
  });
});
