/**
 * Règles pures de la phase 3 (Issue #262) : invitations de projet liées à une participation — rôles proposés, accès
 * résultant (même règle que la vue), échéances indépendantes, refus à l'envoi et à l'acceptation.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  invitationExpiry, memberChangeProblem, narrowScopes, parseAccessExpiry, previewWarnings, projectRoleFor, proposedRolesFrom, proposedRolesValid, resultingAccess,
  rolesToAttribute, targetRefusal,
} from "./project-invitations.js";
import { participationRefusal, invitationRefusal, INVITATION_REFUSAL_MESSAGE } from "./security/invitation-rules.js";
import { deriveAccess } from "./participants.js";

const now = new Date("2026-10-24T10:00:00Z");

describe("rôles proposés par portée", () => {
  it("forme historique : lecteur → Lecteur, editeur → Concepteur (portée projet)", () => {
    expect(proposedRolesFrom({ legacyRole: "lecteur" }).roles).toEqual([{ role: "lecteur", scopeType: "projet", scopeId: null }]);
    expect(proposedRolesFrom({ legacyRole: "editeur" }).roles).toEqual([{ role: "concepteur", scopeType: "projet", scopeId: null }]);
  });
  it("au moins un rôle de portée projet ; rôle ou portée inconnus refusés ; doublons retirés", () => {
    expect(proposedRolesFrom({ roles: [] }).problems.length).toBe(1);
    expect(proposedRolesFrom({ roles: [{ role: "relecteur", scopeType: "etude", scopeId: "E1" }] }).problems.join()).toMatch(/portée projet/);
    expect(proposedRolesFrom({ roles: [{ role: "chef" }] }).problems.join()).toMatch(/rôle inconnu/);
    expect(proposedRolesFrom({ roles: [{ role: "lecteur", scopeType: "etude" }] }).problems.join()).toMatch(/identifiant/);
    const r = proposedRolesFrom({ roles: [{ role: "lecteur" }, { role: "lecteur", scopeType: "projet" }, { role: "approbateur" }] });
    expect(r.problems).toEqual([]);
    expect(r.roles.map((x) => x.role)).toEqual(["lecteur", "approbateur"]);
  });
  it("revalidation : une liste vide ou sans portée projet n'est plus attribuable", () => {
    expect(proposedRolesValid([])).toBe(false);
    expect(proposedRolesValid([{ role: "relecteur", scopeType: "etude", scopeId: "E" }])).toBe(false);
    expect(proposedRolesValid([{ role: "lecteur", scopeType: "projet", scopeId: null }])).toBe(true);
  });
  it("accès de base du pont et rôles complémentaires (aucun doublon avec le rôle miroir)", () => {
    const roles = proposedRolesFrom({ roles: [{ role: "concepteur" }, { role: "relecteur" }, { role: "approbateur", scopeType: "variante", scopeId: "V2" }] }).roles;
    expect(projectRoleFor(roles)).toBe("editeur");
    expect(rolesToAttribute(roles, "editeur").map((r) => r.role)).toEqual(["relecteur", "approbateur"]);
    expect(narrowScopes(roles)).toEqual([{ role: "approbateur", scopeType: "variante", scopeId: "V2" }]);
    expect(projectRoleFor(proposedRolesFrom({ roles: [{ role: "diffuseur" }] }).roles)).toBe("lecteur");
  });
});

describe("accès résultant (aperçu) = règle de la vue", () => {
  it("Lecteur + Approbateur : lire, approuver, sans export ; Concepteur : modifier et exporter", () => {
    expect(resultingAccess(proposedRolesFrom({ roles: [{ role: "lecteur" }, { role: "approbateur" }] }).roles, { now }))
      .toEqual({ role: "lecteur", canExport: false, canApprove: true, canPublish: false });
    expect(resultingAccess(proposedRolesFrom({ roles: [{ role: "concepteur" }] }).roles, { now })?.canExport).toBe(true);
    // Une portée étroite n'ajoute rien.
    expect(resultingAccess(proposedRolesFrom({ roles: [{ role: "lecteur" }, { role: "diffuseur", scopeType: "documents", scopeId: "D" }] }).roles, { now })?.canPublish).toBe(false);
  });
  it("un accès expiré n'ouvre plus rien (deriveAccess, comme la vue)", () => {
    const base = { isOwner: false, hasAccount: true, roles: [{ role: "lecteur" as const, scopeType: "projet" as const }], today: "2026-10-24", now };
    expect(deriveAccess({ ...base, participation: { status: "active", startsOn: null, canExport: false, accessExpiresAt: new Date("2026-10-25T00:00:00Z") } })?.role).toBe("lecteur");
    expect(deriveAccess({ ...base, participation: { status: "active", startsOn: null, canExport: false, accessExpiresAt: new Date("2026-10-24T09:59:59Z") } })).toBeNull();
    expect(resultingAccess([{ role: "lecteur", scopeType: "projet", scopeId: null }], { now, accessExpiresAt: new Date("2026-10-01T00:00:00Z") })).toBeNull();
  });
  it("la vue SQL applique la même échéance (init.sql)", () => {
    const sql = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");
    const view = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW project_effective_access"));
    expect(view.slice(0, 1500)).toMatch(/access_expires_at IS NULL OR pp\.access_expires_at > now\(\)/);
  });
});

describe("échéances indépendantes", () => {
  it("invitation : 1 à 30 jours, 7 par défaut", () => {
    const day = 24 * 3600 * 1000;
    expect(invitationExpiry(now).getTime() - now.getTime()).toBe(7 * day);
    expect(invitationExpiry(now, 0).getTime() - now.getTime()).toBe(day);
    expect(invitationExpiry(now, 90).getTime() - now.getTime()).toBe(30 * day);
  });
  it("accès : date seule = fin de journée UTC ; passée ou illisible refusée ; absente = sans échéance", () => {
    expect(parseAccessExpiry("2026-12-31", now).value?.toISOString()).toBe("2026-12-31T23:59:59.999Z");
    expect(parseAccessExpiry("2026-01-01", now).problem).toMatch(/passée/);
    expect(parseAccessExpiry("demain", now).problem).toMatch(/illisible/);
    expect(parseAccessExpiry(null, now)).toEqual({ value: null, problem: null });
  });
  it("aperçu : signale un accès qui expire avant l'invitation, les portées sans droit, un membre déjà présent", () => {
    const roles = proposedRolesFrom({ roles: [{ role: "lecteur" }, { role: "relecteur", scopeType: "etude", scopeId: "E" }] }).roles;
    const w = previewWarnings({ roles, invitationExpiresAt: new Date("2026-11-01"), accessExpiresAt: new Date("2026-10-28"), target: { kind: "membre", participationId: null } });
    expect(w).toHaveLength(3);
  });
});

describe("compte déjà membre : seul le rôle de partage se change par l'envoi", () => {
  it("rôle de base seul : accepté ; rôle complémentaire ou échéance d'accès : refus explicite, jamais ignorés", () => {
    expect(memberChangeProblem([{ role: "lecteur", scopeType: "projet", scopeId: null }], null)).toBeNull();
    expect(memberChangeProblem([{ role: "concepteur", scopeType: "projet", scopeId: null }], null)).toBeNull();
    expect(memberChangeProblem([{ role: "lecteur", scopeType: "projet", scopeId: null }, { role: "approbateur", scopeType: "projet", scopeId: null }], null)).toMatch(/Équipe et participants/);
    expect(memberChangeProblem([{ role: "lecteur", scopeType: "projet", scopeId: null }, { role: "concepteur", scopeType: "etude", scopeId: "etude-1" }], null)).not.toBeNull();
    expect(memberChangeProblem([{ role: "lecteur", scopeType: "projet", scopeId: null }], new Date("2026-12-31T23:59:59Z"))).toMatch(/échéance d’accès/);
  });
});

describe("refus à l'envoi (participation visée)", () => {
  it("suspendue, terminée, organisation, fiche d'un autre compte : refusées ; contact : accepté", () => {
    expect(targetRefusal({ status: "suspendue", personUserId: "u1", accountId: "u1", isOrganization: false })).toMatch(/suspendue/);
    expect(targetRefusal({ status: "terminee", personUserId: null, accountId: null, isOrganization: false })).toMatch(/terminée/);
    expect(targetRefusal({ status: "contact", personUserId: null, accountId: null, isOrganization: true })).toMatch(/organisation/);
    expect(targetRefusal({ status: "contact", personUserId: "u2", accountId: "u1", isOrganization: false })).toMatch(/autre compte/);
    expect(targetRefusal({ status: "contact", personUserId: null, accountId: "u1", isOrganization: false })).toBeNull();
  });
});

describe("refus à l'acceptation (cas v2.2)", () => {
  const ok = { personUserId: null, acceptingUserId: "u1", participationStatus: "contact" as const, accessExpiresAt: null, rolesValid: true, now };
  it("mauvais compte : la fiche est liée à un autre compte", () => {
    expect(participationRefusal({ ...ok, personUserId: "u2" })).toBe("wrong_person");
    expect(participationRefusal({ ...ok, personUserId: "u1" })).toBeNull();
    // Compte créé par l'acceptation : une fiche déjà liée à un compte n'est pas la sienne.
    expect(participationRefusal({ ...ok, personUserId: "u2", acceptingUserId: null })).toBe("wrong_person");
  });
  it("participation suspendue ou terminée depuis l'envoi, accès expiré, rôles invalides", () => {
    expect(participationRefusal({ ...ok, participationStatus: "suspendue" })).toBe("participation_unavailable");
    expect(participationRefusal({ ...ok, participationStatus: "terminee" })).toBe("participation_unavailable");
    expect(participationRefusal({ ...ok, accessExpiresAt: new Date("2026-10-01") })).toBe("access_expired");
    expect(participationRefusal({ ...ok, rolesValid: false })).toBe("roles_invalid");
    expect(participationRefusal(ok)).toBeNull();
  });
  it("lien transféré, expiré, annulé, décliné, double soumission, invitant révoqué : refus communs", () => {
    const inv = { status: "pending" as const, expiresAt: new Date("2026-10-30"), email: "a@example.test" };
    expect(invitationRefusal(inv, { email: "b@example.test", status: "active" }, true, now)).toBe("wrong_account");
    expect(invitationRefusal({ ...inv, expiresAt: new Date("2026-10-01") }, null, true, now)).toBe("expired");
    expect(invitationRefusal({ ...inv, status: "cancelled" }, null, true, now)).toBe("cancelled");
    expect(invitationRefusal({ ...inv, status: "declined" }, null, true, now)).toBe("declined");
    expect(invitationRefusal({ ...inv, status: "accepted" }, null, true, now)).toBe("already_accepted");
    expect(invitationRefusal(inv, { email: "A@example.test", status: "active" }, false, now)).toBe("inviter_not_authorized");
  });
  it("chaque refus a son message", () => {
    for (const k of ["wrong_person", "participation_unavailable", "access_expired", "roles_invalid", "email_unverified"] as const) expect(INVITATION_REFUSAL_MESSAGE[k].length).toBeGreaterThan(10);
  });
});
