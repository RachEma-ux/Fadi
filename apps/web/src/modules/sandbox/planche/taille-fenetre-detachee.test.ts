import { describe, expect, it } from "vitest";
import { tailleFenetreDetachee } from "./taille-fenetre-detachee";

describe("taille de la fenêtre détachée", () => {
  it("prend la surface utile de l'écran", () => {
    expect(tailleFenetreDetachee({ availWidth: 1920, availHeight: 1040 })).toEqual({ width: 1920, height: 1040 });
  });
  it("ne descend jamais sous l'ancienne taille 1040 × 700", () => {
    expect(tailleFenetreDetachee({ availWidth: 800, availHeight: 600 })).toEqual({ width: 1040, height: 700 });
    expect(tailleFenetreDetachee(undefined)).toEqual({ width: 1040, height: 700 });
  });
});
