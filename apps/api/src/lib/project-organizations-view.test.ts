import { describe, expect, it } from "vitest";
import { shapeProjectOrganizations, type ShapeInput } from "./project-organizations-view.js";

const base: ShapeInput = { owner: null, ownerUserId: "usr_o", ownerPersonName: "Olga", parties: [], mandates: [], memberOf: [] };

describe("organisations côté projet (vue pure)", () => {
  it("sans déclaration : aucune partie propriétaire, la personne propriétaire reste nommée, aucun droit", () => {
    const v = shapeProjectOrganizations(base);
    expect(v.owner).toBeNull();
    expect(v.ownerPerson).toEqual({ userId: "usr_o", name: "Olga" });
    expect(v.ownerGrantsAccess).toBe(false);
    expect(v.parties).toEqual([]);
  });

  it("une organisation close ou suspendue est montrée avec son statut, jamais masquée", () => {
    const v = shapeProjectOrganizations({
      ...base,
      owner: { id: "org_a", name: "A", kind: null, status: "close" },
      parties: [{ participationId: "ppa_1", status: "active", businessRole: null, responsibilities: [], startsOn: null, org: { id: "org_b", name: "B", kind: "BET", status: "suspendue" } }],
    });
    expect(v.owner?.status).toBe("close");
    expect(v.owner?.isParty).toBe(false);
    expect(v.parties.map((p) => [p.id, p.status])).toEqual([["org_b", "suspendue"]]);
  });

  it("représentants : seuls ceux de la participation, nom seul (compte puis fiche), lien si membre", () => {
    const v = shapeProjectOrganizations({
      ...base,
      owner: { id: "org_b", name: "B", kind: null, status: "active" },
      parties: [
        { participationId: "ppa_1", status: "active", businessRole: "BET", responsibilities: ["produire"], startsOn: "2026-01-01", org: { id: "org_b", name: "B", kind: null, status: "active" } },
        { participationId: "ppa_2", status: "terminee", businessRole: null, responsibilities: [], startsOn: null, org: { id: "org_c", name: "C", kind: null, status: "active" } },
      ],
      mandates: [
        { id: "m1", organizationId: "org_b", participationId: "ppa_1", responsibilities: ["produire"], startsOn: null, accountName: null, personName: "Rémi" },
        { id: "m2", organizationId: "org_b", participationId: "ppa_autre", responsibilities: [], startsOn: null, accountName: "X", personName: null },
      ],
      memberOf: ["org_b"],
    });
    expect(v.owner).toMatchObject({ youAreMember: true, isParty: true });
    expect(v.parties).toHaveLength(1);
    expect(v.parties[0]!.youAreMember).toBe(true);
    expect(v.parties[0]!.representatives).toEqual([{ mandateId: "m1", name: "Rémi", responsibilities: ["produire"], startsOn: null }]);
    expect(JSON.stringify(v)).not.toMatch(/@|details/);
  });
});
