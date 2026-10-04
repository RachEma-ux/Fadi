import { describe, expect, it } from "vitest";
import { nombreSaisi } from "./scripts.js";
describe("nombre saisi dans un champ (D-049)", () => {
  it("nombres et calculs, virgule décimale ; illisible → null", () => {
    expect(nombreSaisi("2,5")).toBe(2.5);
    expect(nombreSaisi(" 2,5 + 0,3 ")).toBe(2.8);
    expect(nombreSaisi("(4 - 0,2) / 2")).toBe(1.9);
    expect(nombreSaisi("3*0.9")).toBe(2.7);
    expect(nombreSaisi("abc")).toBeNull();
    expect(nombreSaisi("2 +")).toBeNull();
    expect(nombreSaisi("")).toBeNull();
  });
});
