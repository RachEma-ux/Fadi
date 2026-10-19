import { describe, expect, it } from "vitest";
import { varianteCorrespondante } from "./CopieDeTravail";

describe("varianteCorrespondante (copie de travail de l'exemple protégé)", () => {
  const variantes = [{ id: "v1", name: "RDC", archived: false }, { id: "v2", name: "R+1", archived: false }, { id: "v3", name: "Toiture", archived: true }];
  it("retrouve la variante de même nom (même niveau)", () => expect(varianteCorrespondante(variantes, "R+1", "v1")).toBe("v2"));
  it("ignore une variante archivée et revient à l'initiale", () => expect(varianteCorrespondante(variantes, "Toiture", "v1")).toBe("v1"));
  it("nom inconnu : variante initiale, rien de deviné", () => expect(varianteCorrespondante(variantes, "Sous-sol", "v1")).toBe("v1"));
});
