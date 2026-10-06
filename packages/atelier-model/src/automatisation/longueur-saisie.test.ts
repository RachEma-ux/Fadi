import { describe, expect, it } from "vitest";
import { longueurSaisie } from "./longueur-saisie.js";

describe("longueurs saisies avec leur unité (D-130, DA-01-01)", () => {
  it("unités métriques et impériales converties en mètres ; sans unité : mètres, calcul compris", () => {
    expect(longueurSaisie("250 mm")).toBe(0.25);
    expect(longueurSaisie("25cm")).toBe(0.25);
    expect(longueurSaisie("2,5 m")).toBe(2.5);
    expect(longueurSaisie("10 ft")).toBe(3.048);
    expect(longueurSaisie("6 in")).toBe(0.1524);
    expect(longueurSaisie("3'6\"")).toBe(1.0668);
    expect(longueurSaisie("3 ft 6 in")).toBe(1.0668);
    expect(longueurSaisie("12″")).toBe(0.3048);
    expect(longueurSaisie("2,5 + 0,3")).toBe(2.8);
    expect(longueurSaisie("3")).toBe(3);
    expect(longueurSaisie("abc")).toBeNull();
    expect(longueurSaisie("3 yards")).toBeNull();
  });
});
