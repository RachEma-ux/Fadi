import { describe, expect, it } from "vitest";
import { primaryStepTool, resolveStepTools, toolHref, type StepToolContext } from "./step-tools";

const usable: StepToolContext = { programme: "applied", modele: "zones", editing: "allowed" };
const find = (number: number, key: string, context: StepToolContext = usable) =>
  resolveStepTools("proj/a", number, context).find((tool) => tool.key === key);

describe("R3 — connexions fiables aux outils du projet", () => {
  it("n'invente ni route ni étape ; tout lien conserve le dossier exact", () => {
    expect(resolveStepTools("x", 0, usable)).toEqual([]);
    expect(resolveStepTools("x", 22, usable)).toEqual([]);
    expect(toolHref("proj/a", "parcours", 21)).toBe("/projets/proj%2Fa?module=parcours&etape=21");
    expect(toolHref("proj/a", "programmation", 7, "hypotheses")).toBe("/projets/proj%2Fa?module=programmation&vue=hypotheses");
    for (let i = 1; i <= 21; i++) {
      const tools = resolveStepTools("proj/a", i, usable);
      expect(tools.some((tool) => tool.key === "parcours")).toBe(true);
      expect(tools.filter((tool) => !!tool.href).every((tool) => tool.href!.startsWith("/projets/proj%2Fa?module="))).toBe(true);
    }
  });
  it("affecte une action concrète au contexte des six phases", () => {
    const expected = [
      [1, "parcelle", "?module=projets-sources"],
      [2, "parcours", "?module=parcours&etape=2"],
      [5, "programmation", "?module=programmation"],
      [10, "atelier", "?module=atelier"],
      [14, "analyses", "?module=analyses"],
      [18, "documents", "?module=documents"],
      [21, "documents", "?module=documents"],
    ] as const;
    for (const [step, key, suffix] of expected) {
      const result = primaryStepTool("x", step, usable);
      expect(result?.key).toBe(key);
      expect(result?.href).toBe("/projets/x" + suffix);
    }
  });
  it("refuse la comparaison si le programme n'est pas appliqué et donne un recours explicite", () => {
    const context: StepToolContext = { ...usable, programme: "missing" };
    const result = find(10, "modele-programme", context);
    expect(result).toMatchObject({ href: null, status: "blocked", recovery: { label: "Préparer le programme", href: "/projets/proj%2Fa?module=programmation" } });
    expect(primaryStepTool("proj/a", 10, context)?.key).toBe("atelier");
  });
  it("refuse la comparaison sans zones dessinées même si le programme existe", () => {
    const result = find(10, "modele-programme", { ...usable, modele: "missing" });
    expect(result).toMatchObject({ href: null, status: "blocked", recovery: { label: "Ouvrir l’Atelier", href: "/projets/proj%2Fa?module=atelier" } });
    expect(find(10, "modele-programme", usable)?.href).toBe("/projets/proj%2Fa?module=programmation&vue=modele");
  });
  it("une lecture incomplète n'est jamais transformée en preuve d'absence", () => {
    const unsure = find(10, "modele-programme", { programme: "unknown", modele: "zones", editing: "unknown" });
    expect(unsure).toMatchObject({ status: "checking", href: null });
    expect(find(7, "hypotheses", { ...usable, programme: "unknown" })).toMatchObject({ status: "checking", href: null });
  });
  it("autorise la consultation sans promettre l'édition et ne lie pas les fonctions non développées", () => {
    const reader = { ...usable, editing: "read-only" } as const;
    expect(find(10, "atelier", reader)).toMatchObject({ status: "limited", href: "/projets/proj%2Fa?module=atelier" });
    expect(find(14, "analyses", reader)).toMatchObject({ status: "limited", href: "/projets/proj%2Fa?module=analyses" });
    expect(find(14, "conformite-auto", usable)).toMatchObject({ status: "planned", href: null, recovery: null });
    expect(resolveStepTools("x", 14, usable).some((tool) => tool.key === "conformite-auto" && tool.href)).toBe(false);
  });
});
