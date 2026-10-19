import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Couches du modèle Studio : `scripts/check-module-deps.mjs` contrôle les imports DIRECTS entre dossiers ; les façades
 * de la racine de `studio/` n'y sont pas contraintes. Ce test suit la fermeture transitive des imports (valeurs et types,
 * hors tests) depuis `exigences/` : la composition du document n'y est jamais atteinte, même par une façade
 * (`quantites.ts` → `document-2d.ts` → `composition/`). Le vocabulaire du métré vit pour cela dans `metre/`, et
 * `courbes.ts` (lu par `noyau/validation.ts`) prend ses types à leur définition plutôt que par `document-2d.ts`.
 */
const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.[^"']+)["']/g;

function resoudre(depuis: string, spec: string): string | null {
  const base = resolve(dirname(depuis), spec);
  for (const c of [base.replace(/\.js$/, ".ts"), `${base}.ts`, join(base, "index.ts")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

function fermeture(depart: readonly string[]): Map<string, string[]> {
  const chemins = new Map<string, string[]>();
  const pile: [string, string[]][] = depart.map((f) => [f, [relative(STUDIO, f)]]);
  while (pile.length) {
    const [f, chemin] = pile.pop()!;
    if (chemins.has(f)) continue;
    chemins.set(f, chemin);
    for (const m of readFileSync(f, "utf8").matchAll(IMPORT)) {
      const cible = resoudre(f, m[1]!);
      if (cible && !chemins.has(cible)) pile.push([cible, [...chemin, relative(STUDIO, cible)]]);
    }
  }
  return chemins;
}

describe("couches Studio : exigences sans composition, même indirectement", () => {
  const dossier = join(STUDIO, "exigences");
  const sources = readdirSync(dossier).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join(dossier, f));
  const atteints = fermeture(sources);

  it("la fermeture des imports d'exigences/ ne contient aucun fichier de composition/", () => {
    const fautifs = [...atteints].filter(([f]) => relative(STUDIO, f).startsWith("composition/")).map(([, c]) => c.join(" → "));
    expect(fautifs).toEqual([]);
  });

  it("les exigences lisent le vocabulaire du métré dans metre/, jamais par la façade quantites.ts", () => {
    const rel = new Set([...atteints.keys()].map((f) => relative(STUDIO, f)));
    expect(rel.has("metre/grandeurs.ts")).toBe(true);
    expect(rel.has("quantites.ts")).toBe(false);
    expect(rel.has("document-2d.ts")).toBe(false);
  });

  it("metre/ est une feuille : aucun import", () => {
    for (const f of readdirSync(join(STUDIO, "metre")).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      expect([...readFileSync(join(STUDIO, "metre", f), "utf8").matchAll(IMPORT)].map((m) => m[1]), f).toEqual([]);
    }
  });
});
