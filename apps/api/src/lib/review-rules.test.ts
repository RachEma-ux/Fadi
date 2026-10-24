/** Revue externe (phase 4) — règles pures : machines d'états, permissions par défaut, actions, refus, suivi. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_TRANSITIONS, DEFAULT_REVIEW_PERMISSIONS, PACKAGE_TRANSITIONS, REVIEW_ACTIONS, accessExpiryProblem, assignmentTransitionAllowed, attachmentProblem,
  decisionBlock, fileDelivery, followUp, isOverdue, packageTransitionAllowed, permissionsOf, previewAccess, responseRefusal, reviewAccessRefusal, reviewActions,
  reviewMailGate, safeFileName, type AssignmentState, type DecisionContext,
} from "./review-rules.js";

const now = new Date("2026-10-24T10:00:00Z");
const later = new Date("2026-11-24T10:00:00Z");
const ok: DecisionContext = { publicationWorkStatus: "en-revue", publicationDiffusionStatus: "non-diffuse", publicationMatchesPackage: true };
const relecture = (over: Partial<AssignmentState> = {}): AssignmentState => ({ responsibility: "relecture", status: "en-attente", revokedAt: null, accessExpiresAt: later, permissions: permissionsOf(undefined), ...over });

describe("paquet de revue — machine d'états", () => {
  it("brouillon → partagé → clos | remplacé ; clos → remplacé ; jamais en arrière", () => {
    expect(packageTransitionAllowed("brouillon", "partage")).toBe(true);
    expect(packageTransitionAllowed("partage", "clos")).toBe(true);
    expect(packageTransitionAllowed("partage", "remplace")).toBe(true);
    expect(packageTransitionAllowed("clos", "remplace")).toBe(true);
    expect(packageTransitionAllowed("partage", "brouillon")).toBe(false);
    expect(packageTransitionAllowed("remplace", "partage")).toBe(false);
    expect(packageTransitionAllowed("brouillon", "clos")).toBe(false);
    expect(PACKAGE_TRANSITIONS.remplace).toEqual([]);
  });

  it("le déclencheur SQL admet exactement les mêmes transitions", () => {
    const sql = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");
    const guard = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION review_package_guard"), sql.indexOf("CREATE OR REPLACE TRIGGER review_packages_guard"));
    expect(guard).toContain("(OLD.status = 'brouillon' AND NEW.status = 'partage')");
    expect(guard).toContain("(OLD.status = 'partage' AND NEW.status IN ('clos', 'remplace'))");
    expect(guard).toContain("(OLD.status = 'clos' AND NEW.status = 'remplace')");
  });
});

describe("affectation — machine d'états", () => {
  it("rien ne revient en arrière ; annulée et remplacée sont définitives", () => {
    expect(assignmentTransitionAllowed("en-attente", "en-cours")).toBe(true);
    expect(assignmentTransitionAllowed("en-cours", "terminee")).toBe(true);
    expect(assignmentTransitionAllowed("terminee", "remplacee")).toBe(true);
    expect(assignmentTransitionAllowed("terminee", "en-cours")).toBe(false);
    expect(ASSIGNMENT_TRANSITIONS.annulee).toEqual([]);
    expect(ASSIGNMENT_TRANSITIONS.remplacee).toEqual([]);
  });
});

describe("permissions (OP-D8 a)", () => {
  it("défauts : consulter et commenter ; joindre, télécharger, exporter seulement si accordés", () => {
    expect(DEFAULT_REVIEW_PERMISSIONS).toEqual({ view: true, comment: true, attach: false, download: false, export: false });
    expect(permissionsOf({ download: true })).toEqual({ view: true, comment: true, attach: false, download: true, export: false });
    // Joindre suppose de commenter.
    expect(permissionsOf({ comment: false, attach: true }).attach).toBe(false);
  });

  it("aperçu de l'accès : le paquet seul, aucun accès au projet ni adhésion", () => {
    const p = previewAccess({ responsibility: "relecture", permissions: permissionsOf(undefined), accessExpiresAt: later, invitationExpiresAt: later, dueOn: "2026-11-01" });
    expect(p.projectAccess).toBe("aucun");
    expect(p.organizationMembership).toBe("aucune");
    expect(p.permitted).toEqual(["consulter", "commenter", "repondre", "recontroler"]);
    expect(p.notPermitted).toEqual(expect.arrayContaining(["telecharger", "exporter", "joindre", "approuver", "refuser"]));
    const a = previewAccess({ responsibility: "approbation", permissions: permissionsOf(undefined), accessExpiresAt: later, invitationExpiresAt: later, dueOn: null });
    expect(a.permitted).toContain("approuver");
    expect(a.permitted).not.toContain("repondre");
  });

  it("expiration d'accès : future et bornée", () => {
    expect(accessExpiryProblem(later, now)).toBeNull();
    expect(accessExpiryProblem(new Date("2026-10-23T00:00:00Z"), now)).toMatch(/futur/);
    expect(accessExpiryProblem(new Date("2028-01-01T00:00:00Z"), now)).toMatch(/365/);
  });
});

describe("accès borné au paquet — refus", () => {
  const ctx = { packageStatus: "partage" as const, participationStatus: "active", accountStatus: "active", now };
  it("valide : aucun refus", () => expect(reviewAccessRefusal({ ...relecture(), accepted: true }, ctx)).toBeNull());
  it("révoqué, annulé, expiré, non accepté, paquet en brouillon", () => {
    expect(reviewAccessRefusal({ ...relecture({ revokedAt: now, status: "annulee" }), accepted: true }, ctx)).toBe("revoked");
    expect(reviewAccessRefusal({ ...relecture({ status: "annulee" }), accepted: true }, ctx)).toBe("cancelled");
    expect(reviewAccessRefusal({ ...relecture({ accessExpiresAt: now }), accepted: true }, ctx)).toBe("expired");
    expect(reviewAccessRefusal({ ...relecture(), accepted: false }, ctx)).toBe("not_accepted");
    expect(reviewAccessRefusal({ ...relecture(), accepted: true }, { ...ctx, packageStatus: "brouillon" })).toBe("not_shared");
  });
  it("participation suspendue ou terminée, compte inactif : tout accès de revue cesse", () => {
    expect(reviewAccessRefusal({ ...relecture(), accepted: true }, { ...ctx, participationStatus: "suspendue" })).toBe("participation_inactive");
    expect(reviewAccessRefusal({ ...relecture(), accepted: true }, { ...ctx, accountStatus: "suspended" })).toBe("account_inactive");
  });
  it("une affectation remplacée garde la consultation (historique), sans action nouvelle", () => {
    expect(reviewAccessRefusal({ ...relecture({ status: "remplacee" }), accepted: true }, { ...ctx, packageStatus: "remplace" })).toBeNull();
    expect(reviewActions([relecture({ status: "remplacee" })], "remplace", ok)).toEqual(["consulter"]);
  });
});

describe("actions permises", () => {
  it("relecteur : jamais approuver ni refuser, aucune diffusion", () => {
    const actions = reviewActions([relecture({ permissions: permissionsOf({ download: true, export: true, attach: true }) })], "partage", ok);
    expect(actions).toEqual(["consulter", "commenter", "joindre", "telecharger", "exporter", "repondre", "recontroler"]);
    expect(REVIEW_ACTIONS).not.toContain("diffuser");
  });
  it("approbateur nommé : approuve si la publication est en revue et identique au paquet", () => {
    const approver = relecture({ responsibility: "approbation" });
    expect(reviewActions([approver], "partage", ok)).toContain("approuver");
    expect(reviewActions([approver], "partage", { ...ok, publicationMatchesPackage: false })).not.toContain("approuver");
    expect(reviewActions([approver], "partage", { ...ok, publicationWorkStatus: "brouillon" })).not.toContain("approuver");
    expect(reviewActions([approver], "clos", ok)).not.toContain("approuver");
    expect(reviewActions([{ ...approver, status: "terminee" }], "partage", ok)).not.toContain("approuver");
  });
  it("décision bloquée : motif explicite", () => {
    expect(decisionBlock("partage", ok)).toBeNull();
    expect(decisionBlock("partage", { ...ok, publicationMatchesPackage: false })).toBe("publication_changee");
    expect(decisionBlock("partage", { ...ok, publicationDiffusionStatus: "diffuse" })).toBe("publication_diffusee");
    expect(decisionBlock("remplace", ok)).toBe("paquet_non_partage");
  });
  it("réponse « satisfaisante » refusée tant que des constats restent ouverts", () => {
    expect(responseRefusal("satisfaisante", 2)?.body["error"]).toBe("findings_open");
    expect(responseRefusal("constats", 2)).toBeNull();
    expect(responseRefusal("satisfaisante", 0)).toBeNull();
  });
});

describe("suivi de l'équipe : une échéance dépassée n'est jamais un accord", () => {
  it("retard compté, approbation jamais déduite", () => {
    const f = followUp({
      packageStatus: "partage", dueOn: "2026-10-01", now,
      assignments: [{ responsibility: "relecture", status: "en-attente", result: null }, { responsibility: "approbation", status: "en-attente", result: null }, { responsibility: "relecture", status: "annulee", result: null }],
      findings: [{ statut: "ouverte" }, { statut: "cloturee" }], decision: ok,
    });
    expect(f).toEqual({ recipients: 2, awaiting: 2, responses: { constats: 0, satisfaisante: 0 }, openFindings: 1, overdue: 2, blockedDecision: "constats_ouverts", approved: false });
    expect(isOverdue("2026-10-24", "en-attente", now)).toBe(false);
    expect(isOverdue("2026-10-23", "terminee", now)).toBe(false);
  });
  it("décision bloquée par une publication changée", () => {
    const f = followUp({ packageStatus: "partage", dueOn: null, now, assignments: [{ responsibility: "approbation", status: "en-cours", result: null }], findings: [], decision: { ...ok, publicationMatchesPackage: false } });
    expect(f.blockedDecision).toBe("publication_changee");
  });
});

describe("fichiers et pièces jointes", () => {
  it("consulter : SVG et PDF en ligne ; télécharger seulement si accordé", () => {
    expect(fileDelivery("svg", false, ["consulter"])).toEqual({ ok: true, disposition: "inline" });
    expect(fileDelivery("pdf", true, ["consulter"])).toEqual({ ok: false, status: 403, reason: "download_not_granted" });
    expect(fileDelivery("ifc", false, ["consulter"]).ok).toBe(false);
    expect(fileDelivery("ifc", false, ["consulter", "telecharger"])).toEqual({ ok: true, disposition: "attachment" });
  });
  it("pièce jointe : type, taille et signature vérifiés ; nom assaini", () => {
    expect(attachmentProblem("application/pdf", Buffer.from("%PDF-1.4"))).toBeNull();
    expect(attachmentProblem("image/png", Buffer.from("%PDF-1.4"))).toMatch(/ne correspond pas/);
    expect(attachmentProblem("text/html", Buffer.from("<html>"))).toMatch(/non admis/);
    expect(attachmentProblem("application/pdf", new Uint8Array(0))).toMatch(/vide/);
    expect(safeFileName("../é\"vil;.pdf")).toBe(".._e_vil_.pdf");
  });
});

describe("courriels (OP-D12)", () => {
  it("production sans SMTP : invitation externe refusée ; hors production : lien affiché si besoin", () => {
    expect(reviewMailGate({ production: true, transport: "disabled" })).toBe("mail_required");
    expect(reviewMailGate({ production: true, transport: "smtp" })).toBeNull();
    expect(reviewMailGate({ production: false, transport: "disabled" })).toBeNull();
  });
});
