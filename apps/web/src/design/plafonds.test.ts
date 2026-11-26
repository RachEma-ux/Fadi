/**
 * Garde N5 du chantier Design (docs/workstreams/design, lot L0) : dispersion des feuilles CSS de `apps/web/src`.
 * Cliquet : la mesure doit être ÉGALE au plafond de `design-plafonds.json`. Au-dessus, la PR ajoute de la dispersion ;
 * en dessous, elle en retire et doit abaisser le plafond dans la même PR (il ne remonte jamais).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const SRC = join(WEB, "src");
const plafonds = JSON.parse(readFileSync(join(WEB, "design-plafonds.json"), "utf8")) as Record<string, number | string>;
const exceptions = JSON.parse(readFileSync(join(WEB, "design-exceptions.json"), "utf8")) as { exceptions: { date: string; ecran: string; regle: string; lot: string }[] };

function feuilles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? feuilles(p) : p.endsWith(".css") ? [p] : [];
  });
}

export function mesurer(textes: string[]) {
  const opaques = new Set<string>(), alpha = new Set<string>(), ruptures = new Set<string>();
  for (const s of textes) {
    for (const [, h] of s.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
      const b = h!.toLowerCase();
      if (b.length === 3 || b.length === 6) opaques.add(b.length === 3 ? [...b].map((c) => c + c).join("") : b);
      if ([3, 4, 6, 8].includes(b.length)) alpha.add(b);
    }
    for (const [, px] of s.matchAll(/@media[^{]*?\((?:max|min)-width\s*:\s*([\d.]+)px/g)) ruptures.add(px!);
  }
  return { couleursHexOpaques: opaques.size, couleursHexAvecAlpha: alpha.size, pointsDeRupturePx: ruptures.size };
}

describe("Design — plafonds de dispersion (cliquet)", () => {
  const mesure = mesurer(feuilles(SRC).map((f) => readFileSync(f, "utf8")));
  for (const cle of ["couleursHexOpaques", "couleursHexAvecAlpha", "pointsDeRupturePx"] as const) {
    it(`${cle} : mesure égale au plafond (${plafonds[cle]})`, () => {
      const p = plafonds[cle] as number;
      if (mesure[cle] > p) throw new Error(`${cle} = ${mesure[cle]} dépasse le plafond ${p} : la PR ajoute de la dispersion.`);
      if (mesure[cle] < p) throw new Error(`${cle} = ${mesure[cle]} sous le plafond ${p} : abaisser le plafond dans design-plafonds.json (cliquet).`);
      expect(mesure[cle]).toBe(p);
    });
  }
  it("mesure : couleurs courtes normalisées, alpha comptées à part, points de rupture uniques", () => {
    expect(mesurer(["a{color:#FFF;border:#ffffff;background:#ffffff80}", "@media (max-width:700px){} @media(min-width: 701px){} @media (max-width:700px){}"]))
      .toEqual({ couleursHexOpaques: 1, couleursHexAvecAlpha: 3, pointsDeRupturePx: 2 });
  });
  it("viewport : le zoom n'est jamais bloqué (WCAG 1.4.4, M42)", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    const meta = html.match(/<meta name="viewport" content="([^"]*)"/)?.[1] ?? "";
    expect(meta).toContain("width=device-width");
    expect(meta).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
  });
  it("exceptions axe : chacune est datée, située et rattachée à un lot", () => {
    for (const e of exceptions.exceptions) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.ecran && e.regle && e.lot).toBeTruthy();
    }
  });
});
