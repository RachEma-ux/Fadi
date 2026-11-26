import { describe, expect, it } from "vitest";
import { lireNombre } from "./StepForm";

describe("lireNombre (lot Design L3) : saisie numérique d'une étape", () => {
  it("accepte virgule ou point décimal et espaces de milliers", () => {
    expect(lireNombre("12,5")).toBe(12.5);
    expect(lireNombre("12.5")).toBe(12.5);
    expect(lireNombre("1 250,75")).toBe(1250.75);
    expect(lireNombre("1 250")).toBe(1250);
    expect(lireNombre(",5")).toBe(0.5);
  });
  it("garde le signe : aucune règle métier nouvelle", () => {
    expect(lireNombre("-3")).toBe(-3);
    expect(lireNombre("0")).toBe(0);
  });
  it("refuse sans deviner : notation exponentielle, lettres, séparateurs multiples", () => {
    for (const s of ["1e", "1e3", "abc", "12,5,3", "12.5.3", "-", ",", "12a"]) expect(lireNombre(s)).toBeNull();
  });
});
