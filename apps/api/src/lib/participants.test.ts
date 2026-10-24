/**
 * Règles pures de la phase 2 (Issue #262) : accès dérivé des rôles par portée, contacts et coordonnées par audience,
 * effacement à 2 ans, impact d'une suspension ou d'une fin, refus. Aucune base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  contactDetailsFor, contactProblems, contactRetentionDue, deriveAccess, normalizeName, participationImpact, roleAssignmentRefusal, statusChangeRefusal,
  type AccessInput,
} from "./participants.js";
import { accessAllows } from "./owned-project.js";

// Pur : la base n'est jamais ouverte (garde DB-3) ; seules les règles d'`owned-project.ts` sont exercées.
vi.mock("../db/client.js", () => ({ db: {} }));

const base: AccessInput = { isOwner: false, hasAccount: true, participation: { status: "active", startsOn: "2026-01-01", canExport: false }, roles: [], today: "2026-10-24" };
const withRoles = (...roles: AccessInput["roles"]) => ({ ...base, roles });

describe("Accès dérivé des participations et des rôles par portée (OP-D3 c)", () => {
  it("le propriétaire a tous les droits, sans participation ni rôle", () => {
    expect(deriveAccess({ ...base, isOwner: true, participation: null })).toEqual({ role: "proprietaire", canExport: true, canApprove: true, canPublish: true });
  });
  it("une participation active SANS rôle de projet ne donne aucun accès (revue seule, phase 4)", () => {
    expect(deriveAccess(base)).toBeNull();
    expect(deriveAccess(withRoles({ role: "approbateur", scopeType: "etude" }))).toBeNull();
  });
  it("Lecteur → lire et commenter ; Concepteur → modifier et exporter", () => {
    expect(deriveAccess(withRoles({ role: "lecteur", scopeType: "projet" }))).toEqual({ role: "lecteur", canExport: false, canApprove: false, canPublish: false });
    expect(deriveAccess(withRoles({ role: "concepteur", scopeType: "projet" }))).toEqual({ role: "editeur", canExport: true, canApprove: false, canPublish: false });
  });
  it("Relecteur et Coordinateur lisent et commentent ; Approbateur et Diffuseur reçoivent approbation et diffusion", () => {
    for (const role of ["relecteur", "coordinateur"] as const) expect(deriveAccess(withRoles({ role, scopeType: "projet" }))?.role).toBe("lecteur");
    const a = deriveAccess(withRoles({ role: "approbateur", scopeType: "projet" }), )!;
    expect(a.role).toBe("lecteur");
    expect(a.canApprove && !a.canPublish).toBe(true);
    const d = deriveAccess(withRoles({ role: "diffuseur", scopeType: "projet" }))!;
    expect(d.canPublish && !d.canApprove).toBe(true);
  });
  it("l'export accordé à un lecteur (écart E2) survit dans la participation", () => {
    expect(deriveAccess({ ...withRoles({ role: "lecteur", scopeType: "projet" }), participation: { status: "active", startsOn: null, canExport: true } })?.canExport).toBe(true);
  });
  it("suspendue, terminée, contact, sans compte ou pas encore commencée : aucun accès", () => {
    const r = [{ role: "concepteur" as const, scopeType: "projet" as const }];
    for (const status of ["suspendue", "terminee", "contact"] as const) expect(deriveAccess({ ...base, roles: r, participation: { status, startsOn: null, canExport: true } })).toBeNull();
    expect(deriveAccess({ ...base, roles: r, hasAccount: false })).toBeNull();
    expect(deriveAccess({ ...base, roles: r, participation: { status: "active", startsOn: "2026-11-01", canExport: false } })).toBeNull();
  });
  it("`accessAllows` : approbation et diffusion par capacité, jamais pour l'accès support", () => {
    const lecteur = { role: "lecteur" as const, canExport: false, canApprove: true, canPublish: false };
    expect(accessAllows(lecteur, "approve")).toBe(true);
    expect(accessAllows(lecteur, "publish")).toBe(false);
    expect(accessAllows(lecteur, "write")).toBe(false);
    expect(accessAllows({ role: "support", canExport: false, canApprove: true, canPublish: true }, "approve")).toBe(false);
    expect(accessAllows({ role: "proprietaire", canExport: true }, "publish")).toBe(true);
    expect(accessAllows({ role: "editeur", canExport: true, canApprove: false, canPublish: false }, "approve")).toBe(false);
  });
  it("la vue SQL `project_effective_access` porte les mêmes règles (une seule source)", () => {
    const sql = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");
    const view = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW project_effective_access"), sql.indexOf("-- Clôture déclarative"));
    expect(view).toContain("pp.status = 'active'");
    expect(view).toContain("ra.scope_type = 'projet'");
    expect(view).toContain("pe.user_id IS NOT NULL");
    expect(view).toContain("pp.starts_on <= current_date");
    expect(view).toContain("bool_or(ra.role = 'concepteur') THEN 'editeur' ELSE 'lecteur'");
    expect(view).toContain("bool_or(ra.role = 'approbateur')");
    expect(view).toContain("bool_or(ra.role = 'diffuseur')");
    // Plus aucune lecture de `project_members` dans la décision d'accès.
    const owned = readFileSync(new URL("./owned-project.ts", import.meta.url), "utf8");
    const load = owned.slice(owned.indexOf("export async function loadProjectAccess"), owned.indexOf("export async function lockAccessRows"));
    expect(load).not.toContain("projectMembers");
    expect(load).toContain("projectEffectiveAccess");
  });
});

describe("Contacts sans compte (OP-D9)", () => {
  it("nom requis, adresse et téléphone bien formés", () => {
    expect(contactProblems({ displayName: " " })).toHaveLength(1);
    expect(contactProblems({ displayName: "Ingénieure", workEmail: "pas-une-adresse" })[0]).toMatch(/e-mail/);
    expect(contactProblems({ displayName: "Ingénieure", workPhone: "06<script>" })[0]).toMatch(/téléphone/);
    expect(contactProblems({ displayName: "Ingénieure", workEmail: "a@b.example", workPhone: "+33 (0)1 23 45 67 89" })).toEqual([]);
  });
  it("coordonnées visibles des seuls responsables", () => {
    const p = { id: "x", workEmail: "a@b.example", workPhone: "01" };
    expect(contactDetailsFor(p, true)).toEqual(p);
    expect(contactDetailsFor(p, false)).toEqual({ id: "x", workEmail: null, workPhone: null });
  });
  it("recherche d'existant : casse, accents et espaces ignorés (jamais une fusion)", () => {
    expect(normalizeName("  Éloïse   MARTIN ")).toBe(normalizeName("eloise martin"));
  });
  it("effacement automatique : 2 ans après la clôture de TOUS les projets ; un projet ouvert le conserve", () => {
    const now = new Date("2028-10-25T00:00:00Z");
    const closed = new Date("2026-10-24T00:00:00Z");
    expect(contactRetentionDue({ hasAccount: false, erasedAt: null, projectsClosedAt: [closed] }, now)).toBe(true);
    expect(contactRetentionDue({ hasAccount: false, erasedAt: null, projectsClosedAt: [closed] }, new Date("2028-10-23T00:00:00Z"))).toBe(false);
    expect(contactRetentionDue({ hasAccount: false, erasedAt: null, projectsClosedAt: [closed, null] }, now)).toBe(false);
    expect(contactRetentionDue({ hasAccount: false, erasedAt: null, projectsClosedAt: [closed, new Date("2027-06-01T00:00:00Z")] }, now)).toBe(false);
    expect(contactRetentionDue({ hasAccount: false, erasedAt: null, projectsClosedAt: [] }, now)).toBe(true);
    expect(contactRetentionDue({ hasAccount: true, erasedAt: null, projectsClosedAt: [closed] }, now)).toBe(false);
    expect(contactRetentionDue({ hasAccount: false, erasedAt: now, projectsClosedAt: [closed] }, now)).toBe(false);
  });
});

describe("Statuts, impact et refus", () => {
  it("le propriétaire ne se suspend ni ne se termine ; un contact ne se « réactive » pas", () => {
    expect(statusChangeRefusal("terminer", { status: "active", isOwner: true })).toMatch(/transférez/);
    expect(statusChangeRefusal("reactiver", { status: "contact", isOwner: false })).toMatch(/partage/);
    expect(statusChangeRefusal("suspendre", { status: "suspendue", isOwner: false })).not.toBeNull();
    expect(statusChangeRefusal("terminer", { status: "contact", isOwner: false })).toBeNull();
    expect(statusChangeRefusal("reactiver", { status: "suspendue", isOwner: false })).toBeNull();
  });
  it("impact : accès retiré, invitations annulées à la fin, réservation libérée, rôles gardés en historique", () => {
    const i = { access: { role: "editeur" as const, canExport: true, canApprove: false, canPublish: false }, roles: [{ role: "relecteur" as const, scopeType: "projet" as const, scopeId: null, origin: "attribution" as const }], pendingInvitations: 2, openObservations: 1, openTasks: 3, holdsEditingLock: true, responsibilities: ["produire" as const] };
    const end = participationImpact({ ...i, change: "terminer" });
    expect(end).toMatchObject({ accessWithdrawn: true, invitationsCancelled: 2, editingLockReleased: true, rolesKeptAsHistory: true, openTasks: 3 });
    const pause = participationImpact({ ...i, change: "suspendre" });
    expect(pause).toMatchObject({ accessWithdrawn: true, invitationsCancelled: 0, rolesKeptAsHistory: false });
    expect(participationImpact({ ...i, access: null, change: "reactiver" })).toMatchObject({ accessWithdrawn: false, accessRestored: true, editingLockReleased: false });
  });
  it("rôle par portée : jamais au propriétaire, à une organisation, à un contact sans compte ni à une participation terminée", () => {
    const p = { isOwner: false, hasAccount: true, isOrganization: false, status: "active" as const };
    expect(roleAssignmentRefusal(p)).toBeNull();
    expect(roleAssignmentRefusal({ ...p, isOwner: true })).not.toBeNull();
    expect(roleAssignmentRefusal({ ...p, isOrganization: true })).not.toBeNull();
    expect(roleAssignmentRefusal({ ...p, hasAccount: false })).toMatch(/invitation/);
    expect(roleAssignmentRefusal({ ...p, status: "terminee" })).not.toBeNull();
  });
});
