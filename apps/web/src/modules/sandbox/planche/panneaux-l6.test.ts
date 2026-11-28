import { describe, expect, it } from "vitest";
import { COTE_MAX_IMAGE, DEFINITIONS_IMAGE, lireDefinition } from "./panneaux-l6";

describe("cas 2, lot 6 — définition de l'image (n° 53)", () => {
  it("« L × H » lu, bornes du tampon de rendu respectées", () => {
    expect(lireDefinition("3840 × 2160")).toEqual({ largeur: 3840, hauteur: 2160 });
    expect(lireDefinition(" 1200x800 ")).toEqual({ largeur: 1200, hauteur: 800 });
    expect(lireDefinition(`${COTE_MAX_IMAGE + 1} × 100`)).toBeNull();
    expect(lireDefinition("abc")).toBeNull();
    expect(DEFINITIONS_IMAGE.map((d) => `${d.largeur}×${d.hauteur}`)).toEqual(["1920×1080", "2560×1440", "3840×2160"]);
  });
});
