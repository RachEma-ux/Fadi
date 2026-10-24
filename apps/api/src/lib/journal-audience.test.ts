import { describe, expect, it } from "vitest";
import {
  accountIdsOf, familyOf, isProjectAction, JOURNAL_FAMILIES, paginate, projectEntry, visible, visibleToProject, visibleToUser,
  type AccountLabel, type AudienceContext, type JournalRow,
} from "./journal-audience.js";

let n = 0;
function row(p: Partial<JournalRow> & Pick<JournalRow, "action">): JournalRow {
  n += 1;
  return { id: n, actorId: null, targetType: null, targetId: null, metadata: {}, ip: "203.0.113.7", createdAt: new Date("2026-10-24T10:00:00Z"), ...p };
}

const ME = "usr_me", OWNER = "usr_owner", ADMIN = "usr_admin", OTHER = "usr_other";
const accounts = new Map<string, AccountLabel>([
  [ME, { email: "me@example.test", displayName: "Moi", platformRole: "user" }],
  [OWNER, { email: "owner@example.test", displayName: null, platformRole: "user" }],
  [ADMIN, { email: "admin@example.test", displayName: "Support", platformRole: "admin" }],
  [OTHER, { email: "other@example.test", displayName: null, platformRole: "user" }],
]);
const user: AudienceContext = { audience: "utilisateur", userId: ME, ownedProjectIds: new Set(["prj_mine"]) };
const projet: AudienceContext = { audience: "projet", projectId: "prj_a", invitationIds: new Set(["inv_a"]) };

describe("journal d'activité — règle d'audience (OP-D13 a)", () => {
  it("familles : premier segment de l'action ; actions de projet par préfixe, futures familles comprises", () => {
    expect(familyOf("project.member.added")).toBe("project");
    expect(JOURNAL_FAMILIES).toContain("participation");
    for (const a of ["project.member.added", "project.member.left", "project.ownership.transferred", "invitation.declined", "comment.audience_changed", "support.accessed", "participation.started", "person.updated", "review.package.shared"]) {
      expect(isProjectAction(a), a).toBe(true);
    }
    for (const a of ["auth.login.succeeded", "admin.user.suspended", "comment.created", "account.export", "mail.quota_exceeded", "projects.x"]) expect(isProjectAction(a), a).toBe(false);
  });

  it("utilisateur : ses actions, ce qui vise son compte, les accès support sur ses projets ; rien d'autre", () => {
    expect(visibleToUser(row({ action: "auth.login.succeeded", actorId: ME, targetType: "user", targetId: ME }), user)).toBe(true);
    expect(visibleToUser(row({ action: "invitation.created", actorId: ME, targetType: "invitation", targetId: "inv_x" }), user)).toBe(true);
    expect(visibleToUser(row({ action: "admin.user.suspended", actorId: ADMIN, targetType: "user", targetId: ME }), user)).toBe(true);
    expect(visibleToUser(row({ action: "auth.password.reset_requested", actorId: null, targetType: "user", targetId: ME }), user)).toBe(true);
    expect(visibleToUser(row({ action: "support.accessed", actorId: ADMIN, targetType: "project", targetId: "prj_mine" }), user)).toBe(true);
    // Accès support sur le projet d'un autre, connexion d'un autre, action visant un autre projet : refusés.
    expect(visibleToUser(row({ action: "support.accessed", actorId: ADMIN, targetType: "project", targetId: "prj_other" }), user)).toBe(false);
    expect(visibleToUser(row({ action: "auth.login.succeeded", actorId: OTHER, targetType: "user", targetId: OTHER }), user)).toBe(false);
    expect(visibleToUser(row({ action: "project.member.added", actorId: OWNER, targetType: "project", targetId: "prj_mine" }), user)).toBe(false);
    expect(visibleToUser(row({ action: "auth.login.failed", actorId: null, metadata: { reason: "unknown_account", emailHash: "abc" } }), user)).toBe(false);
    expect(visibleToUser(row({ action: "mail.quota_exceeded", actorId: null, targetType: "mail", targetId: "m1" }), user)).toBe(false);
  });

  it("projet : familles de la participation rattachées par la cible, metadata.projectId ou une invitation du projet", () => {
    expect(visibleToProject(row({ action: "project.member.added", targetType: "project", targetId: "prj_a" }), projet as never)).toBe(true);
    expect(visibleToProject(row({ action: "invitation.created", targetType: "invitation", targetId: "inv_z", metadata: { projectId: "prj_a" } }), projet as never)).toBe(true);
    expect(visibleToProject(row({ action: "invitation.declined", targetType: "invitation", targetId: "inv_a" }), projet as never)).toBe(true);
    expect(visibleToProject(row({ action: "participation.ended", targetType: "participation", targetId: "ppa_1", metadata: { projectId: "prj_a" } }), projet as never)).toBe(true);
    expect(visibleToProject(row({ action: "review.assignment.created", targetType: "project", targetId: "prj_a" }), projet as never)).toBe(true);
    // Autre projet, action hors familles (connexion, administration) même rattachée : refusées.
    expect(visibleToProject(row({ action: "project.member.added", targetType: "project", targetId: "prj_b" }), projet as never)).toBe(false);
    expect(visibleToProject(row({ action: "invitation.declined", targetType: "invitation", targetId: "inv_b" }), projet as never)).toBe(false);
    expect(visibleToProject(row({ action: "auth.login.succeeded", targetType: "project", targetId: "prj_a" }), projet as never)).toBe(false);
    expect(visibleToProject(row({ action: "admin.user.suspended", metadata: { projectId: "prj_a" } }), projet as never)).toBe(false);
  });

  it("administration : tout est visible, métadonnées et adresse IP comprises", () => {
    const r = row({ action: "auth.login.failed", actorId: null, metadata: { reason: "unknown_account", emailHash: "abc" } });
    expect(visible(r, { audience: "admin" })).toBe(true);
    const v = projectEntry(r, { audience: "admin" }, accounts)!;
    expect(v.ip).toBe("203.0.113.7");
    expect(v.details).toEqual({ reason: "unknown_account", emailHash: "abc" });
    expect(v.actor).toEqual({ kind: "systeme" });
    const s = projectEntry(row({ action: "admin.user.suspended", actorId: ADMIN, targetType: "user", targetId: OTHER }), { audience: "admin" }, accounts)!;
    expect(s.actor).toEqual({ kind: "compte", id: ADMIN, email: "admin@example.test", displayName: "Support" });
    expect(s.target).toEqual({ type: "user", id: OTHER });
  });

  it("utilisateur : ni IP, ni identifiant opaque, ni identité d'un autre compte (sauf l'administrateur du support sur son projet)", () => {
    const suspended = projectEntry(row({ action: "admin.user.suspended", actorId: ADMIN, targetType: "user", targetId: ME, metadata: { revokedSessions: 2, releasedLocks: 1 } }), user, accounts)!;
    expect(suspended.ip).toBeUndefined();
    expect(suspended.actor).toEqual({ kind: "administrateur" });
    expect(suspended.details).toEqual({ revokedSessions: 2 });
    const accessed = projectEntry(row({ action: "support.accessed", actorId: ADMIN, targetType: "project", targetId: "prj_mine", metadata: { grantId: "spg_1", path: "/prj_mine/x" } }), user, accounts)!;
    expect(accessed.actor).toMatchObject({ kind: "compte", email: "admin@example.test" });
    expect(accessed.details).toEqual({});
    expect(accessed.projectId).toBe("prj_mine");
    const mine = projectEntry(row({ action: "project.member.added", actorId: ME, targetType: "project", targetId: "prj_mine", metadata: { memberId: OTHER, role: "lecteur" } }), user, accounts)!;
    expect(mine.actor).toEqual({ kind: "vous" });
    expect(mine.subjects["memberId"]).toMatchObject({ kind: "compte", email: "other@example.test" });
    // Une entrée hors périmètre n'est jamais projetée.
    expect(projectEntry(row({ action: "auth.login.succeeded", actorId: OTHER }), user, accounts)).toBeNull();
  });

  it("projet : identité des comptes cités (responsables, OP-D9), chemin du support, jamais d'IP ni d'identifiant de fil", () => {
    const e = projectEntry(row({ action: "project.member.role_changed", actorId: OWNER, targetType: "project", targetId: "prj_a", metadata: { memberId: ME, roleBefore: "lecteur", roleAfter: "editeur" } }), projet, accounts, OWNER)!;
    expect(e.ip).toBeUndefined();
    expect(e.actor).toEqual({ kind: "vous" });
    expect(e.subjects["memberId"]).toMatchObject({ kind: "compte", email: "me@example.test", displayName: "Moi" });
    expect(e.details).toEqual({ roleBefore: "lecteur", roleAfter: "editeur" });
    const c = projectEntry(row({ action: "comment.audience_changed", actorId: OTHER, targetType: "project", targetId: "prj_a", metadata: { commentId: "cmt_1", audienceBefore: "equipe", audienceAfter: "projet" } }), projet, accounts, OWNER)!;
    expect(c.details).toEqual({ audienceBefore: "equipe", audienceAfter: "projet" });
    const s = projectEntry(row({ action: "support.accessed", actorId: ADMIN, targetType: "project", targetId: "prj_a", metadata: { grantId: "spg_1", path: "/prj_a/steps" } }), projet, accounts, OWNER)!;
    expect(s.details).toEqual({ path: "/prj_a/steps" });
  });

  it("comptes à relire et pagination par curseur (récent d'abord)", () => {
    expect(accountIdsOf([row({ action: "x", actorId: ME, metadata: { memberId: OTHER, adminId: ADMIN } }), row({ action: "y" })]).sort()).toEqual([ADMIN, ME, OTHER].sort());
    const rows = [{ id: 9 }, { id: 7 }, { id: 4 }];
    expect(paginate(rows, 2)).toEqual({ page: [{ id: 9 }, { id: 7 }], nextCursor: 7 });
    expect(paginate(rows, 3)).toEqual({ page: rows, nextCursor: null });
    expect(paginate([], 3)).toEqual({ page: [], nextCursor: null });
  });
});
