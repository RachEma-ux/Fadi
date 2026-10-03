import { describe, expect, it } from "vitest";
import { aire, angle, controlerGrandeur, ErreurUnite, estGrandeur, longueur } from "./unites.js";
import {
  cleRepere,
  controlerRepereUnique,
  ErreurRepere,
  exigerRepereUnique,
  pointCadastral,
  pointLocal,
  polygoneAvecTrous,
  REPERE_LOCAL_PROJET,
  type PointTague,
} from "./reperes.js";
import type { Coordinate } from "@parcours/domain-model";

describe("unités typées", () => {
  it("construit des grandeurs sans arrondi", () => {
    expect(longueur(-3.2)).toEqual({ value: -3.2, unit: "m" });
    expect(aire(1345.5475500009647).value).toBe(1345.5475500009647);
    expect(angle(55.080006596041926)).toEqual({ value: 55.080006596041926, unit: "°" });
  });

  it("refuse une valeur non finie", () => {
    expect(() => longueur(Number.NaN)).toThrow(ErreurUnite);
    expect(() => aire(Number.POSITIVE_INFINITY)).toThrow(ErreurUnite);
  });

  it("contrôle l'unité attendue", () => {
    expect(controlerGrandeur({ value: 0.2, unit: "m" }, "m")).toBeNull();
    expect(controlerGrandeur({ value: 0.2, unit: "m²" }, "m")).toMatch(/incompatible/);
    expect(controlerGrandeur({ value: 0.2, unit: "cm" }, "m")).toMatch(/incompatible/);
    expect(controlerGrandeur(0.2, "m")).toMatch(/grandeur attendue/);
    expect(controlerGrandeur({ value: "0.2", unit: "m" }, "m")).toMatch(/numérique/);
    expect(estGrandeur({ value: 1, unit: "°" }, "°")).toBe(true);
    expect(estGrandeur({ value: 1, unit: "°" }, "m")).toBe(false);
    expect(estGrandeur({ value: 1, unit: "pieds" })).toBe(false);
  });
});

describe("repères tagués (R5)", () => {
  it("les points sont des coordonnées de domain-model", () => {
    const c: Coordinate = pointLocal(1, 2);
    expect(c.frame).toBe("local");
    const k: Coordinate = pointCadastral(321946.82, 347183.88, "EPSG:26191");
    expect(k.frame).toBe("cadastral");
  });

  it("distingue repère local du projet et repère local nommé", () => {
    expect(cleRepere(pointLocal(0, 0))).toBe(`local:${REPERE_LOCAL_PROJET}`);
    expect(cleRepere(pointLocal(0, 0, "p118-registration-8.19"))).toBe("local:p118-registration-8.19");
    expect(cleRepere(pointCadastral(0, 0, "EPSG:26191"))).toBe("cadastral:EPSG:26191");
  });

  it("accepte une liste homogène", () => {
    const r = controlerRepereUnique([pointLocal(0, 0), pointLocal(1, 0), pointLocal(1, 1)]);
    expect(r).toEqual({ ok: true, cle: "local:projet" });
    expect(controlerRepereUnique([])).toEqual({ ok: true, cle: null });
  });

  it("refuse le mélange local / cadastral", () => {
    const pts: PointTague[] = [pointLocal(0, 0), pointCadastral(321946.82, 347183.88, "EPSG:26191")];
    const r = controlerRepereUnique(pts);
    expect(r.ok).toBe(false);
    expect(() => exigerRepereUnique(pts)).toThrow(ErreurRepere);
  });

  it("refuse le mélange de deux repères locaux (D-021 : polygones de pièce de la registration 8.19)", () => {
    expect(controlerRepereUnique([pointLocal(0, 0), pointLocal(1, 1, "p118-registration-8.19")]).ok).toBe(false);
  });

  it("refuse le mélange de deux CRS cadastraux et le mélange avec le géographique", () => {
    expect(controlerRepereUnique([pointCadastral(0, 0, "EPSG:26191"), pointCadastral(0, 0, "EPSG:2056")]).ok).toBe(false);
    expect(controlerRepereUnique([pointLocal(0, 0), { frame: "geographic", lat: 33.6, lon: -7.3, unit: "°" }]).ok).toBe(false);
  });

  it("refuse un point non tagué", () => {
    expect(controlerRepereUnique([pointLocal(0, 0), { x: 1, y: 1 }]).ok).toBe(false);
    expect(controlerRepereUnique([{ x: 1, y: 1, frame: "local" }]).ok).toBe(false);
  });

  it("refuse un trou dans un autre repère que son contour", () => {
    const contour = [pointLocal(0, 0), pointLocal(4, 0), pointLocal(4, 4)];
    expect(() => polygoneAvecTrous(contour, [{ polygone: [pointLocal(1, 1, "autre"), pointLocal(2, 1, "autre"), pointLocal(2, 2, "autre")] }])).toThrow(ErreurRepere);
    expect(polygoneAvecTrous(contour, [{ id: "H0", polygone: [pointLocal(1, 1), pointLocal(2, 1), pointLocal(2, 2)] }]).trous).toHaveLength(1);
  });
});
