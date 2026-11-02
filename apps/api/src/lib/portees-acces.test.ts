/**
 * Portées étroites appliquées par la garde serveur (`owned-project.ts`, `projectAccessRefusal` + `porteeAllows`) et par
 * les observations Studio (`acteurAutorise`, capacité `constater`). Règles pures : aucune base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AttributionPortee } from "@parcours/domain-model";
import { porteeAllows, projectAccessRefusal, type AccessibleProject } from "./owned-project.js";
import { acteurAutorise } from "./studio-observations.js";

vi.mock("../db/client.js", () => ({ db: {} }));

const ME = "u-me", OTHER = "u-other";
const access = (role: AccessibleProject["role"], portees: AttributionPortee[], extra: Partial<AccessibleProject> = {}) =>
  ({ id: "p1", ownerId: "u-owner", exampleMode: null, editingLock: null, role, canExport: false, canApprove: false, canPublish: false, portees, ...extra }) as unknown as AccessibleProject;
const designerX = [{ role: "concepteur", scopeType: "etude", scopeId: "X" }] as AttributionPortee[];

describe("garde serveur : une portée étroite ajoute une capacité dans son périmètre, jamais l'accès", () => {
  it("sans accès au projet (aucun rôle de portée projet) : 404, quelle que soit la portée étroite", () => {
    expect(projectAccessRefusal(null, ME, "modify", { studyId: "X", variantIds: ["V"] })).toEqual({ status: 404, body: { error: "not_found" } });
  });
  it("lecteur du projet Concepteur de l'étude X : modifie X, pas Y ; rien sans cible", () => {
    const a = access("lecteur", designerX);
    expect(projectAccessRefusal(a, ME, "modify", { studyId: "X", variantIds: ["V"] })).toBeNull();
    expect(projectAccessRefusal(a, ME, "write", { studyId: "X" })).toBeNull();
    expect(projectAccessRefusal(a, ME, "modify", { studyId: "Y", variantIds: ["W"] })?.status).toBe(403);
    expect(projectAccessRefusal(a, ME, "modify")?.status).toBe(403);
    expect(projectAccessRefusal(a, ME, "approve", { studyId: "X" })?.status).toBe(403);
    expect(projectAccessRefusal(a, ME, "owner", { studyId: "X" })?.status).toBe(403);
  });
  it("la réservation d'édition d'un autre compte et la référence protégée s'appliquent aussi à la capacité ajoutée", () => {
    const lock = { userId: OTHER, email: "autre@example.test", expiresAt: new Date(Date.now() + 60_000).toISOString() };
    expect(projectAccessRefusal(access("lecteur", designerX, { editingLock: lock } as Partial<AccessibleProject>), ME, "modify", { studyId: "X", variantIds: ["V"] })?.status).toBe(423);
    expect(projectAccessRefusal(access("lecteur", designerX, { exampleMode: "reference" } as Partial<AccessibleProject>), ME, "modify", { studyId: "X", variantIds: ["V"] })?.body).toMatchObject({ motif: "reference-protegee" });
  });
  it("l'accès support ne reçoit jamais de capacité de portée", () => {
    expect(porteeAllows(access("support", designerX), "modify", { studyId: "X" })).toBeNull();
    expect(projectAccessRefusal(access("support", designerX), ME, "modify", { studyId: "X" })?.body).toMatchObject({ error: "support_read_only" });
  });
  it("Approbateur de la variante V : approuve un dossier de V seul, pas un dossier coordonné ; export par la portée documents", () => {
    const a = access("lecteur", [{ role: "approbateur", scopeType: "variante", scopeId: "V" }, { role: "lecteur", scopeType: "documents", scopeId: "tableaux" }] as AttributionPortee[]);
    expect(projectAccessRefusal(a, ME, "approve", { studyId: "X", variantIds: ["V"], revisionId: "R" })).toBeNull();
    expect(projectAccessRefusal(a, ME, "approve", { studyId: "X", variantIds: ["V", "W"], revisionId: "R" })?.status).toBe(403);
    expect(projectAccessRefusal(a, ME, "export", { document: { famille: "tableaux", kind: "tableau-surfaces" } })).toBeNull();
    expect(projectAccessRefusal(a, ME, "export", { document: { famille: "atelier", kind: "atelier-ifc" } })?.status).toBe(403);
  });
  it("aucune régression des rôles de portée projet : propriétaire et éditeur inchangés, cible ou non", () => {
    for (const cible of [undefined, { studyId: "Y" }]) {
      expect(projectAccessRefusal(access("editeur", []), ME, "modify", cible)).toBeNull();
      expect(projectAccessRefusal(access("proprietaire", []), ME, "publish", cible)).toBeNull();
      expect(projectAccessRefusal(access("lecteur", []), ME, "modify", cible)?.status).toBe(403);
      expect(projectAccessRefusal(access("lecteur", []), ME, "comment", cible)).toBeNull();
    }
  });
  it("le chargement de l'accès lit les portées de la même participation active et commencée, jamais `project_members`", () => {
    const src = readFileSync(new URL("./owned-project.ts", import.meta.url), "utf8");
    const load = src.slice(src.indexOf("export async function loadProjectAccess"), src.indexOf("export async function activeSupportGrant"));
    expect(load).toContain("ra.scope_type <> 'projet'");
    expect(load).toContain("pp.status = 'active'");
    expect(load).toContain("pp.starts_on IS NULL OR pp.starts_on <= current_date");
    expect(load).not.toContain("project_members");
  });
});

describe("observations Studio : capacité `constater` du Relecteur de portée", () => {
  const base = { estResponsable: false, estAuteur: false, estProprietaire: false, peutEcrire: false };
  it("recontrôler et rouvrir, rien d'autre", () => {
    const r = { ...base, estRelecteur: true };
    expect(acteurAutorise("recontroler", r)).toBe(true);
    expect(acteurAutorise("rouvrir", r)).toBe(true);
    expect(acteurAutorise("cloturer", r)).toBe(false);
    expect(acteurAutorise("corriger", r)).toBe(false);
    expect(acteurAutorise("reattribuer", r)).toBe(false);
    expect(acteurAutorise("recontroler", base)).toBe(false);
  });
});
