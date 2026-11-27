import { describe, expect, it } from "vitest";
import { modeleVide } from "./geometrie-libre.js";
import { ajouterPointCalage, importerFond, pointDuFond, type VerticalFond } from "./fonds.js";
import { appliquerHomographie, cadreRedresse, homographie, inverserHomographie, rectangleReference, redresserPixels, residusRedressement, type Homographie } from "./redressement.js";

// Façade 4 × 3 m photographiée de biais : homographie connue, pixels obtenus par son inverse.
const VRAIE: Homographie = [0.01, 0.002, -1, 0.0005, -0.012, 9, 0.00004, 0.00001, 1];
const versPixel = (x: number, y: number) => {
  const p = appliquerHomographie(inverserHomographie(VRAIE)!, x, y)!;
  return { u: p.x, v: p.y };
};
const COINS = rectangleReference(4, 3).map((q) => versPixel(q.x, q.y));

describe("Redressement sur quatre points (étape 7c)", () => {
  it("retrouve l'homographie : les quatre coins vont sur le rectangle, un cinquième point aussi", () => {
    const h = homographie(COINS, rectangleReference(4, 3))!;
    expect(h).not.toBeNull();
    for (const [i, q] of rectangleReference(4, 3).entries()) {
      const r = appliquerHomographie(h, COINS[i]!.u, COINS[i]!.v)!;
      expect(r.x).toBeCloseTo(q.x, 6);
      expect(r.y).toBeCloseTo(q.y, 6);
    }
    const p = versPixel(1.2, 2.1);
    const r = appliquerHomographie(h, p.u, p.v)!;
    expect(r.x).toBeCloseTo(1.2, 6);
    expect(r.y).toBeCloseTo(2.1, 6);
  });

  it("refuse trois points alignés et un quadrilatère croisé", () => {
    expect(homographie([{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 20, v: 0 }, { u: 0, v: 10 }], rectangleReference(4, 3))).toBeNull();
    expect(homographie([COINS[0]!, COINS[2]!, COINS[1]!, COINS[3]!], rectangleReference(4, 3))).toBeNull();
  });

  it("résidus : non évalués sans contrôle ; nuls sur une façade plane ; alerte au-delà de 1/500 de la diagonale", () => {
    const h = homographie(COINS, rectangleReference(4, 3))!;
    expect(residusRedressement(h, [], 4, 3)).toMatchObject({ moyen: null, nonPlane: false, seuil: 0.01 });
    const plan = residusRedressement(h, [{ pixel: versPixel(2, 1.5), cible: { x: 2, y: 1.5 } }], 4, 3);
    expect(plan.moyen!).toBeLessThan(1e-6);
    expect(plan.nonPlane).toBe(false);
    // Un balcon en saillie : le point vu ne tombe pas où la façade plane le placerait (4 cm d'écart).
    const saillie = residusRedressement(h, [{ pixel: versPixel(2.04, 1.5), cible: { x: 2, y: 1.5 } }], 4, 3);
    expect(saillie.points[0]!).toBeCloseTo(0.04, 6);
    expect(saillie.nonPlane).toBe(true);
  });

  it("rééchantillonne la photo dans le cadre redressé : le coin bas gauche du rectangle garde sa couleur", () => {
    const l = 400, hpx = 300;
    const src = new Uint8ClampedArray(l * hpx * 4);
    for (let j = 0; j < hpx; j++)
      for (let i = 0; i < l; i++) {
        const o = (j * l + i) * 4;
        src[o] = i < l / 2 ? 200 : 20;
        src[o + 3] = 255;
      }
    const coins = [{ u: 50, v: 250 }, { u: 350, v: 260 }, { u: 330, v: 40 }, { u: 70, v: 60 }];
    const h = homographie(coins, rectangleReference(4, 3))!;
    const cadre = cadreRedresse(h, l, hpx, 4, 3, 256);
    expect(cadre.largeurPx).toBeLessThanOrEqual(256);
    expect(cadre.sMin).toBeGreaterThanOrEqual(-2);
    const out = redresserPixels(src, l, hpx, h, cadre)!;
    const lire = (s: number, t: number) => {
      const i = Math.floor((s - cadre.sMin) / cadre.echelle), j = Math.floor((cadre.tMax - t) / cadre.echelle);
      return out[(j * cadre.largeurPx + i) * 4]!;
    };
    expect(lire(0.3, 0.3)).toBe(200);
    expect(lire(3.7, 0.3)).toBe(20);
  });

  it("fond vertical : posé par son origine et son azimut, t en hauteur ; le calage à la main lui est refusé", () => {
    const vertical: VerticalFond = { x: 10, y: 5, azimut: Math.PI / 2, redressement: { points: COINS, largeur: 4, hauteur: 3, controles: 0, residu: null } };
    const image = "data:image/png;base64,iVBORw0KGgo=";
    const r = importerFond(modeleVide(), { nom: "facade.jpg", image, largeurPx: 400, hauteurPx: 300, altitude: 2, pose: { echelle: 0.01, rotation: 0, x: 0, y: 3 }, vertical });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.modele.annotations!.fonds![r.id]!;
    expect(f.cale).toBe(true);
    const p = pointDuFond(f, { x: 4, y: 3 });
    expect(p.x).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(9, 9);
    expect(p.z).toBeCloseTo(5, 9);
    expect(ajouterPointCalage(r.modele, r.id, { u: 1, v: 1 })).toEqual({ ok: false, erreur: "vertical" });
    expect(importerFond(modeleVide(), { nom: "x", image, largeurPx: 4, hauteurPx: 3, altitude: 0, vertical })).toEqual({ ok: false, erreur: "vertical" });
  });
});
