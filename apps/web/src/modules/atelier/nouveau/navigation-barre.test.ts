import { describe, expect, it } from "vitest";
import { indexSuivant } from "./navigation-barre";

describe("Navigation au clavier d'une barre (lot 9, EX-CMD-06, W3C APG Toolbar)", () => {
  it("flèches selon l'orientation, retour au début, Origine / Fin ; les autres touches ne naviguent pas", () => {
    expect(indexSuivant("ArrowRight", 0, 3, "horizontal")).toBe(1);
    expect(indexSuivant("ArrowRight", 2, 3, "horizontal")).toBe(0);
    expect(indexSuivant("ArrowLeft", 0, 3, "horizontal")).toBe(2);
    expect(indexSuivant("ArrowDown", 0, 3, "horizontal")).toBeNull();
    expect(indexSuivant("ArrowDown", 1, 3, "vertical")).toBe(2);
    expect(indexSuivant("ArrowUp", 0, 3, "vertical")).toBe(2);
    expect(indexSuivant("Home", 2, 3, "vertical")).toBe(0);
    expect(indexSuivant("End", 0, 3, "horizontal")).toBe(2);
    expect(indexSuivant("Enter", 0, 3, "horizontal")).toBeNull();
    expect(indexSuivant("ArrowRight", 0, 0, "horizontal")).toBeNull();
  });
});
