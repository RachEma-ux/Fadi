/** Règles pures de la phase 5 des organisations (aucune base) : adhésion, administration déléguée, gabarits, mandats. */
import { describe, expect, it } from "vitest";
import {
  canMandateTransition, canMembershipTransition, canOrganizationTransition, mandateAcceptRefusal, mandateResponsibilities, MEMBERSHIP_STATUSES,
  normalizeTemplateEntry, organizationCapabilities, organizationInviterAuthorized, planTemplateApplication, removesLastOrganizationAdmin,
  templateEntriesProblems, type TemplateEntry,
} from "./organizations-rules.js";

describe("machine d'états de l'adhésion", () => {
  it("active ↔ suspendue, vers terminée ; une adhésion terminée ne revit pas", () => {
    expect(canMembershipTransition("active", "suspendue")).toBe(true);
    expect(canMembershipTransition("suspendue", "active")).toBe(true);
    expect(canMembershipTransition("active", "terminee")).toBe(true);
    expect(canMembershipTransition("suspendue", "terminee")).toBe(true);
    for (const to of MEMBERSHIP_STATUSES) expect(canMembershipTransition("terminee", to)).toBe(false);
  });
  it("organisation : la clôture est définitive", () => {
    expect(canOrganizationTransition("active", "suspendue")).toBe(true);
    expect(canOrganizationTransition("suspendue", "active")).toBe(true);
    expect(canOrganizationTransition("active", "close")).toBe(true);
    expect(canOrganizationTransition("close", "active")).toBe(false);
    expect(canOrganizationTransition("close", "suspendue")).toBe(false);
  });
});

describe("administration déléguée : la seule adhésion décide", () => {
  const active = { status: "active" as const };
  it("sans adhésion : rien (le rôle plateforme n'entre pas dans le calcul)", () => {
    const c = organizationCapabilities(active, null);
    expect(c).toMatchObject({ summary: false, read: false, manage: false, changeStatus: false, refusal: "not_member" });
  });
  it("membre : lit, ne gère pas ; administrateur actif : gère", () => {
    expect(organizationCapabilities(active, { role: "membre", status: "active" })).toMatchObject({ read: true, manage: false, refusal: "not_admin" });
    expect(organizationCapabilities(active, { role: "administrateur", status: "active" })).toMatchObject({ read: true, manage: true, changeStatus: true, refusal: null });
  });
  it("adhésion suspendue ou terminée : résumé seulement, aucun droit d'administrateur", () => {
    expect(organizationCapabilities(active, { role: "administrateur", status: "suspendue" })).toMatchObject({ summary: true, read: false, manage: false, refusal: "membership_suspended" });
    expect(organizationCapabilities(active, { role: "administrateur", status: "terminee" })).toMatchObject({ summary: true, read: false, manage: false, refusal: "membership_ended" });
  });
  it("organisation suspendue : lecture, et seul le changement de statut reste à l'administrateur ; close : plus rien", () => {
    expect(organizationCapabilities({ status: "suspendue" }, { role: "administrateur", status: "active" })).toMatchObject({ read: true, manage: false, changeStatus: true, refusal: "organization_suspended" });
    expect(organizationCapabilities({ status: "suspendue" }, { role: "membre", status: "active" })).toMatchObject({ read: true, manage: false, changeStatus: false });
    expect(organizationCapabilities({ status: "close" }, { role: "administrateur", status: "terminee" })).toMatchObject({ summary: true, read: false, manage: false, changeStatus: false, refusal: "organization_closed" });
  });
  it("garde du dernier administrateur", () => {
    expect(removesLastOrganizationAdmin(["a"], "a")).toBe(true);
    expect(removesLastOrganizationAdmin(["a", "b"], "a")).toBe(false);
    expect(removesLastOrganizationAdmin(["a"], "m")).toBe(false);
  });
  it("invitant revalidé : administrateur actif d'une organisation active, compte actif et non en suppression", () => {
    const admin = { role: "administrateur" as const, status: "active" as const };
    const account = { status: "active", deletionRequested: false };
    expect(organizationInviterAuthorized(active, admin, account)).toBe(true);
    expect(organizationInviterAuthorized(active, { ...admin, role: "membre" }, account)).toBe(false);
    expect(organizationInviterAuthorized(active, { ...admin, status: "terminee" }, account)).toBe(false);
    expect(organizationInviterAuthorized({ status: "suspendue" }, admin, account)).toBe(false);
    expect(organizationInviterAuthorized(active, admin, { status: "suspended", deletionRequested: false })).toBe(false);
    expect(organizationInviterAuthorized(active, admin, { status: "active", deletionRequested: true })).toBe(false);
    expect(organizationInviterAuthorized(null, admin, account)).toBe(false);
  });
});

describe("gabarits versionnés", () => {
  const entry = (over: Partial<TemplateEntry> = {}): TemplateEntry => ({ label: "Ingénieur structure", businessRole: "ingénieur structure", responsibilities: ["produire"], proposedRoles: ["concepteur"], ...over });
  it("lignes validées : intitulé, responsabilités et rôles connus, sans doublon", () => {
    expect(templateEntriesProblems([entry()])).toEqual([]);
    expect(templateEntriesProblems([])).toContain("lignes : au moins une ligne d’équipe");
    expect(templateEntriesProblems("x")).toEqual(["lignes : une liste est attendue"]);
    expect(templateEntriesProblems([entry({ label: " " })])[0]).toMatch(/intitulé requis/);
    expect(templateEntriesProblems([entry({ responsibilities: ["piloter" as never] })])[0]).toMatch(/responsabilités inconnues/);
    expect(templateEntriesProblems([entry({ responsibilities: ["produire", "produire"] })])[0]).toMatch(/en double/);
    expect(templateEntriesProblems([entry({ proposedRoles: ["chef" as never] })])[0]).toMatch(/rôles proposés inconnus/);
    expect(templateEntriesProblems(Array.from({ length: 51 }, () => entry()))).toContain("lignes : 50 au plus");
  });
  it("normalisation : intitulés rognés, champs absents à null", () => {
    expect(normalizeTemplateEntry(entry({ label: "  BET  ", businessRole: " ", groupId: "" }))).toEqual({ label: "BET", businessRole: null, responsibilities: ["produire"], proposedRoles: ["concepteur"], groupId: null });
  });
  it("plan d'application : contact créé, présent laissé tel quel, non attribué ignoré, non membre refusé, doublon une fois", () => {
    const entries = [entry({ label: "A" }), entry({ label: "B" }), entry({ label: "C" }), entry({ label: "D" }), entry({ label: "E" })];
    const plan = planTemplateApplication(entries, { "0": "p1", "1": "p2", "3": "intrus", "4": "p1" }, new Set(["p1", "p2"]), new Set(["p2"]));
    expect(plan.map((l) => l.outcome)).toEqual(["creer", "deja-present", "non-attribue", "non-eligible", "deja-present"]);
    // Les rôles proposés restent une proposition : la ligne les montre, l'application ne les accorde pas.
    expect(plan[0]).toMatchObject({ personId: "p1", proposedRoles: ["concepteur"] });
  });
});

describe("mandats de représentation", () => {
  it("transitions : proposé → actif / refusé / annulé ; actif → terminé ; le reste est définitif", () => {
    expect(canMandateTransition("propose", "actif")).toBe(true);
    expect(canMandateTransition("propose", "refuse")).toBe(true);
    expect(canMandateTransition("propose", "annule")).toBe(true);
    expect(canMandateTransition("actif", "termine")).toBe(true);
    expect(canMandateTransition("actif", "annule")).toBe(false);
    expect(canMandateTransition("termine", "actif")).toBe(false);
    expect(canMandateTransition("refuse", "actif")).toBe(false);
  });
  const ok = { mandate: { status: "propose" as const, personId: "p1" }, viewerPersonId: "p1", membershipStatus: "active" as const, organizationStatus: "active" as const, participationStatus: "active", replaced: undefined };
  it("acceptation revalidée : seul le représentant, adhésion, organisation et participation toujours valides", () => {
    expect(mandateAcceptRefusal(ok)).toBeNull();
    expect(mandateAcceptRefusal({ ...ok, mandate: null })).toBe("not_found");
    expect(mandateAcceptRefusal({ ...ok, viewerPersonId: "p2" })).toBe("not_representative");
    expect(mandateAcceptRefusal({ ...ok, viewerPersonId: null })).toBe("not_representative");
    expect(mandateAcceptRefusal({ ...ok, mandate: { status: "annule", personId: "p1" } })).toBe("not_pending");
    expect(mandateAcceptRefusal({ ...ok, membershipStatus: "suspendue" })).toBe("membership_inactive");
    expect(mandateAcceptRefusal({ ...ok, organizationStatus: "suspendue" })).toBe("organization_inactive");
    expect(mandateAcceptRefusal({ ...ok, participationStatus: "terminee" })).toBe("participation_ended");
    expect(mandateAcceptRefusal({ ...ok, participationStatus: null })).toBe("participation_ended");
  });
  it("remplacement : le mandat remplacé doit être encore actif ; jamais de substitution d'office", () => {
    expect(mandateAcceptRefusal({ ...ok, replaced: { status: "actif" } })).toBeNull();
    expect(mandateAcceptRefusal({ ...ok, replaced: { status: "termine" } })).toBe("replaced_changed");
  });
  it("le remplaçant reprend les responsabilités du mandat remplacé, sauf choix explicite", () => {
    expect(mandateResponsibilities(undefined, { responsibilities: ["coordonner", "verifier"] })).toEqual(["coordonner", "verifier"]);
    expect(mandateResponsibilities(["diriger"], { responsibilities: ["coordonner"] })).toEqual(["diriger"]);
    expect(mandateResponsibilities(undefined, null)).toEqual([]);
  });
});
