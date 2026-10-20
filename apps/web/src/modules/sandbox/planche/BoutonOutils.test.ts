import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { placementListeOutils } from "./BoutonOutils";

describe("placement de la liste « Outils »", () => {
  it("au téléphone, la liste tient entre le bas du bouton et le bas de la Planche (cas de la recette 390 × 844)", () => {
    // Bouton à y = 431,7 (hauteur 44) : la liste commence 4 px dessous et s'arrête 8 px au-dessus du bas de la Planche.
    const p = placementListeOutils(475.7, 818, 844, true);
    expect(p.haut).toBe(480);
    expect(p.haut! + p.hauteurMax).toBeLessThanOrEqual(818);
    expect(p.hauteurMax).toBeLessThan(732);
  });
  it("sans zone connue, la fenêtre borne la liste ; au bureau, aucun haut imposé", () => {
    const p = placementListeOutils(410, null, 864, false);
    expect(p.haut).toBeNull();
    expect(410 + 4 + p.hauteurMax).toBeLessThanOrEqual(864);
  });
  it("garde au moins 88 px quand le bouton est tout en bas", () => {
    expect(placementListeOutils(830, 844, 844, true).hauteurMax).toBe(88);
  });
  it("mesure avant la peinture et suit le défilement des conteneurs internes (écoute en capture)", () => {
    const src = readFileSync(new URL("./BoutonOutils.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/useLayoutEffect\(\(\) => \{\s*if \(!ouvert\) return;/);
    expect(src).toMatch(/addEventListener\("scroll", positionner, \{ capture: true/);
    // La mesure de l'ouverture fixe haut et hauteur dans le même rendu que `setOuvert(true)`.
    expect(src).toMatch(/positionner\(\);\s*setOuvert\(true\);/);
  });
});
