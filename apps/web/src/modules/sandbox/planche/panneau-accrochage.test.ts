import { describe, expect, it } from "vitest";
import { lireLongueurUnite } from "./panneau-accrochage";
import { convertirLongueursAffichees } from "./Planche";

describe("longueur saisie dans l'unité du projet (retour de revue #493)", () => {
  it("lit la valeur affichée par le champ, quelle que soit l'unité", () => {
    expect(lireLongueurUnite("1,200 m", undefined, ",")).toBeCloseTo(1.2, 9);
    expect(lireLongueurUnite("250 cm", "cm", ",")).toBeCloseTo(2.5, 9);
    expect(lireLongueurUnite("250", "cm", ",")).toBeCloseTo(2.5, 9);
    expect(lireLongueurUnite("2400", "mm", ",")).toBeCloseTo(2.4, 9);
    expect(lireLongueurUnite("7' 10 1/2\"", "pieds-pouces", ",")).toBeCloseTo(7 * 0.3048 + 10.5 * 0.0254, 9);
    expect(lireLongueurUnite("abc", "cm", ",")).toBeNull();
  });
  it("Mesures : les longueurs de l'outil passent dans l'unité du projet, les mètres restent inchangés", () => {
    expect(convertirLongueursAffichees("2.40 m", "m", ",")).toBe("2.40 m");
    expect(convertirLongueursAffichees("2,40 m", "cm", ",")).toBe("240,0 cm");
    expect(convertirLongueursAffichees("Aire · 10,8 m²", "cm", ",")).toBe("Aire · 10,8 m²");
  });
});
