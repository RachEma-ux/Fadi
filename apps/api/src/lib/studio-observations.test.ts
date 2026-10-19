import { describe, expect, it } from "vitest";
import { acteurAutorise, echeanceValide, estAncetreOuEgale, OBSERVATION_TRANSITIONS, statutApres } from "./studio-observations.js";

const personne = { estResponsable: false, estAuteur: false, estProprietaire: false };

describe("Observations Studio — règles pures", () => {
  it("suit le cycle ouverte → corrigée → recontrôlée → clôturée, et rouvre", () => {
    expect(statutApres("ouverte", "corriger")).toBe("corrigee");
    expect(statutApres("corrigee", "recontroler")).toBe("recontrolee");
    expect(statutApres("recontrolee", "cloturer")).toBe("cloturee");
    expect(statutApres("cloturee", "rouvrir")).toBe("rouverte");
    expect(statutApres("rouverte", "corriger")).toBe("corrigee");
  });

  it("refuse les sauts et les retours non prévus", () => {
    expect(statutApres("ouverte", "recontroler")).toBeNull();
    expect(statutApres("ouverte", "cloturer")).toBeNull();
    expect(statutApres("corrigee", "cloturer")).toBeNull();
    expect(statutApres("ouverte", "rouvrir")).toBeNull();
    expect(statutApres("cloturee", "corriger")).toBeNull();
    expect(statutApres("recontrolee", "recontroler")).toBeNull();
  });

  it("réserve chaque passage à son rôle ; personne d'autre", () => {
    for (const action of OBSERVATION_TRANSITIONS) expect(acteurAutorise(action, personne)).toBe(false);
    expect(acteurAutorise("corriger", { ...personne, estResponsable: true })).toBe(true);
    expect(acteurAutorise("corriger", { ...personne, estProprietaire: true })).toBe(false);
    expect(acteurAutorise("recontroler", { ...personne, estAuteur: true })).toBe(true);
    expect(acteurAutorise("recontroler", { ...personne, estResponsable: true })).toBe(false);
    expect(acteurAutorise("cloturer", { ...personne, estAuteur: true, estResponsable: true })).toBe(false);
    expect(acteurAutorise("cloturer", { ...personne, estProprietaire: true })).toBe(true);
    expect(acteurAutorise("rouvrir", { ...personne, estAuteur: true })).toBe(true);
  });

  it("compare les révisions par la chaîne des parents", () => {
    const parents = new Map<string, string | null>([["r1", null], ["r2", "r1"], ["r3", "r2"], ["x", "x"]]);
    expect(estAncetreOuEgale(parents, "r2", "r3")).toBe(true);
    expect(estAncetreOuEgale(parents, "r2", "r2")).toBe(true);
    expect(estAncetreOuEgale(parents, "r3", "r2")).toBe(false);
    expect(estAncetreOuEgale(parents, "r1", "x")).toBe(false);
  });

  it("valide une échéance réelle AAAA-MM-JJ", () => {
    expect(echeanceValide("2026-11-30")).toBe(true);
    expect(echeanceValide("2026-02-30")).toBe(false);
    expect(echeanceValide("30/11/2026")).toBe(false);
  });
});
