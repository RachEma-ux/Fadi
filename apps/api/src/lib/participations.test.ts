import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCESS_ROLE_MIRROR, BUSINESS_ROLES, canTransition, participationProblems, PARTICIPATION_STATUSES, personProblems,
  ROLE_SCOPES, roleAssignmentProblems, TEAM_RESPONSIBILITIES,
} from "./participations.js";

const initSql = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");
/** Les valeurs d'une contrainte `CHECK (col IN (...))` ou `<@ ARRAY[...]` de init.sql. */
function sqlList(constraint: string): string[] {
  const at = initSql.search(new RegExp(`CONSTRAINT ${constraint}\\s`));
  expect(at, constraint).toBeGreaterThan(0);
  const rest = initSql.slice(at + 1);
  const end = Math.min(...[rest.indexOf("CONSTRAINT "), rest.indexOf(");")].filter((i) => i >= 0));
  return [...rest.slice(0, end).matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
}

describe("participations — règles pures et accord avec init.sql", () => {
  it("garde les listes du code identiques aux contraintes SQL", () => {
    expect(sqlList("project_role_assignments_role_check")).toEqual([...BUSINESS_ROLES]);
    expect(sqlList("project_role_assignments_scope_check")).toEqual([...ROLE_SCOPES]);
    expect(sqlList("project_participations_status_check")).toEqual([...PARTICIPATION_STATUSES]);
    expect(sqlList("project_participations_responsibilities_check")).toEqual([...TEAM_RESPONSIBILITIES]);
  });

  it("décrit le miroir de l'accès comme le déclencheur SQL (lecteur → lecteur, editeur → concepteur)", () => {
    expect(ACCESS_ROLE_MIRROR).toEqual({ proprietaire: null, editeur: "concepteur", lecteur: "lecteur" });
    expect(initSql).toContain("v_role := CASE v_access WHEN 'lecteur' THEN 'lecteur' WHEN 'editeur' THEN 'concepteur' END;");
  });

  it("n'autorise que les transitions du cycle de participation ; une participation terminée ne revit pas", () => {
    expect(canTransition("contact", "active")).toBe(true);
    expect(canTransition("active", "suspendue")).toBe(true);
    expect(canTransition("suspendue", "active")).toBe(true);
    expect(canTransition("active", "terminee")).toBe(true);
    expect(canTransition("terminee", "active")).toBe(false);
    expect(canTransition("suspendue", "contact")).toBe(false);
    expect(canTransition("active", "contact")).toBe(false);
  });

  it("exige une personne ou une organisation, exactement une, et une date de fin pour une participation terminée seulement", () => {
    expect(participationProblems({ personId: "per_1", status: "active" })).toEqual([]);
    expect(participationProblems({ organizationId: "org_1", status: "contact" })).toEqual([]);
    expect(participationProblems({ status: "active" })).toHaveLength(1);
    expect(participationProblems({ personId: "per_1", organizationId: "org_1", status: "active" })).toHaveLength(1);
    expect(participationProblems({ personId: "per_1", status: "terminee" })).toHaveLength(1);
    expect(participationProblems({ personId: "per_1", status: "terminee", startsOn: "2026-10-01", endsOn: "2026-10-23" })).toEqual([]);
    expect(participationProblems({ personId: "per_1", status: "terminee", startsOn: "2026-10-23", endsOn: "2026-10-01" })).toHaveLength(1);
    expect(participationProblems({ personId: "per_1", status: "active", responsibilities: ["diriger", "chef"] })).toEqual(["responsabilité inconnue : chef"]);
  });

  it("exige un identifiant de portée hors du projet, et aucun pour le projet", () => {
    expect(roleAssignmentProblems({ role: "approbateur", scopeType: "projet" })).toEqual([]);
    expect(roleAssignmentProblems({ role: "relecteur", scopeType: "revision", scopeId: "rev_3" })).toEqual([]);
    expect(roleAssignmentProblems({ role: "relecteur", scopeType: "revision" })).toHaveLength(1);
    expect(roleAssignmentProblems({ role: "relecteur", scopeType: "documents", scopeId: "  " })).toHaveLength(1);
    expect(roleAssignmentProblems({ role: "lecteur", scopeType: "projet", scopeId: "x" })).toHaveLength(1);
    expect(roleAssignmentProblems({ role: "editeur", scopeType: "projet" })).toEqual(["rôle inconnu : editeur"]);
  });

  it("exige un nom pour un contact sans compte", () => {
    expect(personProblems({ userId: "u_1" })).toEqual([]);
    expect(personProblems({ displayName: "  " })).toHaveLength(1);
    expect(personProblems({ displayName: "Claire Martin" })).toEqual([]);
  });
});
