import { describe, expect, it } from "vitest";
import { endedMandateMarks, mandateInvitationRefusal, mandateProjectSide, mandateStillValid } from "./mandate-invitations.js";
import { participationRefusal } from "./security/invitation-rules.js";

const ok = {
  projectId: "prj_1", ownerId: "usr_o",
  mandate: { projectId: "prj_1", status: "actif" as const, organizationId: "org_b" },
  partyStatus: "active" as const, organizationStatus: "active" as const, membershipStatus: "active" as const,
  representative: { userId: "usr_r", accountStatus: "active" },
  current: null,
};

describe("représentant mandaté → invitation de projet (règles pures)", () => {
  it("un représentant d'un mandat actif d'une organisation partie et active peut être invité", () => {
    expect(mandateInvitationRefusal(ok)).toBeNull();
    // Un simple contact de l'annuaire, ou une participation active sans rôle de projet : l'invitation la visera.
    expect(mandateInvitationRefusal({ ...ok, current: { status: "contact", hasProjectAccess: false, representedOrganizationId: null } })).toBeNull();
    expect(mandateInvitationRefusal({ ...ok, current: { status: "active", hasProjectAccess: false, representedOrganizationId: "org_b" } })).toBeNull();
  });

  it("refus : mandat hors projet (404), non actif, organisation non partie ou inactive, adhésion, compte (409), propriétaire (422)", () => {
    expect(mandateInvitationRefusal({ ...ok, mandate: null })).toMatchObject({ status: 404, error: "not_found" });
    expect(mandateInvitationRefusal({ ...ok, mandate: { ...ok.mandate, projectId: "prj_2" } })).toMatchObject({ status: 404 });
    for (const status of ["propose", "refuse", "annule", "termine"] as const) {
      expect(mandateInvitationRefusal({ ...ok, mandate: { ...ok.mandate, status } })).toMatchObject({ status: 409, error: "mandate_inactive" });
    }
    expect(mandateInvitationRefusal({ ...ok, partyStatus: null })).toMatchObject({ status: 409, error: "organization_not_party" });
    expect(mandateInvitationRefusal({ ...ok, partyStatus: "terminee" })).toMatchObject({ error: "organization_not_party" });
    expect(mandateInvitationRefusal({ ...ok, organizationStatus: "suspendue" })).toMatchObject({ error: "organization_inactive" });
    expect(mandateInvitationRefusal({ ...ok, membershipStatus: "suspendue" })).toMatchObject({ error: "membership_inactive" });
    expect(mandateInvitationRefusal({ ...ok, representative: { userId: null, accountStatus: null } })).toMatchObject({ error: "representative_without_account" });
    expect(mandateInvitationRefusal({ ...ok, representative: { userId: "usr_r", accountStatus: "suspended" } })).toMatchObject({ error: "representative_without_account" });
    expect(mandateInvitationRefusal({ ...ok, representative: { userId: "usr_o", accountStatus: "active" } })).toMatchObject({ status: 422, error: "representative_is_owner" });
  });

  it("refus selon la participation actuelle : déjà participant, suspendue, autre partie représentée", () => {
    expect(mandateInvitationRefusal({ ...ok, current: { status: "active", hasProjectAccess: true, representedOrganizationId: null } })).toMatchObject({ error: "already_participant" });
    expect(mandateInvitationRefusal({ ...ok, current: { status: "suspendue", hasProjectAccess: false, representedOrganizationId: null } })).toMatchObject({ error: "participation_suspended" });
    expect(mandateInvitationRefusal({ ...ok, current: { status: "contact", hasProjectAccess: false, representedOrganizationId: "org_x" } })).toMatchObject({ error: "represents_other_organization" });
    // Chaque refus porte un motif lisible.
    expect(mandateInvitationRefusal({ ...ok, mandate: null })!.message.length).toBeGreaterThan(10);
  });

  it("état côté projet : participation active avec accès > invitation en attente > terminée > non invité", () => {
    expect(mandateProjectSide({ participations: [], pendingInvitation: false })).toBe("non_invite");
    expect(mandateProjectSide({ participations: [{ status: "contact", hasProjectAccess: false }], pendingInvitation: false })).toBe("non_invite");
    expect(mandateProjectSide({ participations: [{ status: "contact", hasProjectAccess: false }], pendingInvitation: true })).toBe("invitation_en_attente");
    expect(mandateProjectSide({ participations: [{ status: "terminee", hasProjectAccess: false }], pendingInvitation: false })).toBe("terminee");
    expect(mandateProjectSide({ participations: [{ status: "terminee", hasProjectAccess: false }], pendingInvitation: true })).toBe("invitation_en_attente");
    expect(mandateProjectSide({ participations: [{ status: "active", hasProjectAccess: true }], pendingInvitation: true })).toBe("participation_active");
    // Participation active sans rôle de projet (revue externe) : aucun accès, donc pas « active » côté projet.
    expect(mandateProjectSide({ participations: [{ status: "active", hasProjectAccess: false }], pendingInvitation: false })).toBe("non_invite");
  });

  it("acceptation : le mandat doit rester actif et son organisation partie et active ; sinon `mandate_ended`", () => {
    expect(mandateStillValid({ mandateStatus: "actif", partyStatus: "active", organizationStatus: "active" })).toBe(true);
    expect(mandateStillValid({ mandateStatus: "termine", partyStatus: "active", organizationStatus: "active" })).toBe(false);
    expect(mandateStillValid({ mandateStatus: "actif", partyStatus: "terminee", organizationStatus: "active" })).toBe(false);
    expect(mandateStillValid({ mandateStatus: "actif", partyStatus: "active", organizationStatus: "close" })).toBe(false);
    const base = { personUserId: null, acceptingUserId: "usr_r", participationStatus: "contact" as const, accessExpiresAt: null, rolesValid: true, now: new Date() };
    expect(participationRefusal({ ...base, mandateActive: false })).toBe("mandate_ended");
    expect(participationRefusal({ ...base, mandateActive: true })).toBeNull();
    expect(participationRefusal({ ...base, mandateActive: null })).toBeNull();
    // Une mauvaise identité reste refusée d'abord (403).
    expect(participationRefusal({ ...base, personUserId: "usr_x", mandateActive: false })).toBe("wrong_person");
  });

  it("« mandat terminé » : participation conservée qui représente l'organisation, sans mandat actif de la personne", () => {
    const at = (d: string) => new Date(d);
    const marks = endedMandateMarks({
      organizationId: "org_b",
      participations: [
        { id: "ppa_r", personId: "per_r", status: "active", representedOrganizationId: "org_b" },
        { id: "ppa_s", personId: "per_s", status: "active", representedOrganizationId: "org_b" },
        { id: "ppa_t", personId: "per_t", status: "terminee", representedOrganizationId: "org_b" },
        { id: "ppa_u", personId: "per_u", status: "active", representedOrganizationId: "org_x" },
        { id: "ppa_v", personId: "per_v", status: "active", representedOrganizationId: "org_b" },
      ],
      mandates: [
        { id: "m_r1", organizationId: "org_b", personId: "per_r", status: "termine", endsOn: "2026-09-01", endReason: "retrait", endedAt: at("2026-09-01") },
        { id: "m_r2", organizationId: "org_b", personId: "per_r", status: "termine", endsOn: "2026-10-01", endReason: "remplace", endedAt: at("2026-10-01") },
        { id: "m_s", organizationId: "org_b", personId: "per_s", status: "termine", endsOn: null, endReason: "depart", endedAt: at("2026-10-02") },
        { id: "m_s2", organizationId: "org_b", personId: "per_s", status: "actif", endsOn: null, endReason: null, endedAt: null },
        { id: "m_t", organizationId: "org_b", personId: "per_t", status: "termine", endsOn: null, endReason: "retrait", endedAt: at("2026-10-03") },
        { id: "m_u", organizationId: "org_b", personId: "per_u", status: "termine", endsOn: null, endReason: "retrait", endedAt: at("2026-10-03") },
        { id: "m_v", organizationId: "org_b", personId: "per_v", status: "refuse", endsOn: null, endReason: null, endedAt: null },
      ],
    });
    // r : le plus récent de ses mandats terminés ; s : de nouveau mandaté ; t : terminée ; u : autre partie ; v : jamais actif.
    expect(marks).toEqual([{ participationId: "ppa_r", mandateId: "m_r2", endsOn: "2026-10-01", endReason: "remplace" }]);
  });
});
