import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

describe("indicateur de robustesse (D-6)", () => {
  it("moins de 12 caractères : trop court", () => { expect(passwordStrength("abcdefghijk")).toBe("trop-court"); });
  it("répétitions et suites : faibles", () => {
    expect(passwordStrength("aaaaaaaaaaaaaaaa")).toBe("faible");
    expect(passwordStrength("123456789012")).toBe("faible");
  });
  it("aucune règle de composition : une phrase en minuscules est forte", () => {
    expect(passwordStrength("la tortue verte traverse la rue")).toBe("fort");
  });
  it("longueur moyenne : correcte", () => { expect(passwordStrength("maison-bleue-42x")).toBe("correct"); });
});
