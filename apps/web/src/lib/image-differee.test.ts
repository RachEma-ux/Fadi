import { describe, expect, it } from "vitest";
import { COULEUR_ESPACE_RESERVE, espaceReserveSvg } from "./image-differee";

const svgDe = (uri: string) => decodeURIComponent(uri.replace("data:image/svg+xml;charset=utf-8,", ""));

describe("espace réservé du chargement différé (unlazy)", () => {
  it("garde les proportions de l'image attendue", () => {
    const svg = svgDe(espaceReserveSvg(1600, 900));
    expect(svg).toContain('width="1600" height="900"');
    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect(svg).toContain(`fill="${COULEUR_ESPACE_RESERVE}"`);
  });

  it("est une URI data: SVG encodée", () => {
    const uri = espaceReserveSvg(10, 20);
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(uri).not.toMatch(/[<>"\s]/);
  });

  it("retombe sur un carré quand les dimensions manquent ou sont invalides", () => {
    for (const [l, h] of [[undefined, undefined], [0, -3], [Number.NaN, Infinity]] as const) {
      expect(svgDe(espaceReserveSvg(l, h))).toContain('viewBox="0 0 1 1"');
    }
  });

  it("arrondit les dimensions et refuse une couleur non hexadécimale", () => {
    expect(svgDe(espaceReserveSvg(12.6, 7.2))).toContain('viewBox="0 0 13 7"');
    expect(svgDe(espaceReserveSvg(4, 4, "#abc"))).toContain('fill="#abc"');
    expect(svgDe(espaceReserveSvg(4, 4, 'red" onload="x'))).toContain(`fill="${COULEUR_ESPACE_RESERVE}"`);
  });
});
