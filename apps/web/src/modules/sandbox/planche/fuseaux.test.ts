import { describe, expect, it } from "vitest";
import { decalageLegal, fuseauxDuNavigateur } from "./fuseaux";

describe("Cas 2, lot 5 — fuseaux lus dans la base du navigateur", () => {
  it("Europe/Zurich : UTC+1 en hiver, UTC+2 en été ; UTC : 0 ; inconnu : null", () => {
    expect(decalageLegal("Europe/Zurich", 2026, 1, 15, 12)).toBe(60);
    expect(decalageLegal("Europe/Zurich", 2026, 6, 21, 14.5)).toBe(120);
    expect(decalageLegal("UTC", 2026, 6, 21, 12)).toBe(0);
    expect(decalageLegal("Pas/UnFuseau", 2026, 6, 21, 12)).toBeNull();
  });
  it("liste des fuseaux : celle du navigateur", () => {
    const l = fuseauxDuNavigateur();
    expect(Array.isArray(l)).toBe(true);
    if (l.length) expect(l).toContain("Europe/Zurich");
  });
});
