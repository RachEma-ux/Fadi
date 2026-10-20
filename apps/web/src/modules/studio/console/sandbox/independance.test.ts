/**
 * Sandbox n'a AUCUNE relation avec la Planche de l'étape 10 : la copie ne lit ni l'Atelier, ni son modèle, ni un serveur,
 * et n'écrit dans aucun stockage de l'Atelier (demande du maître d'ouvrage du 20 octobre 2026).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RACINE = dirname(fileURLToPath(import.meta.url));
function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}
const sources = fichiers(RACINE).filter((f) => /\.(ts|tsx|css)$/.test(f) && !f.endsWith("independance.test.ts"));
const code = (f: string) => readFileSync(f, "utf8");
const imports = (f: string) => [...code(f).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);

describe("Sandbox — Planche indépendante de l'étape 10", () => {
  it("la copie existe (outils, vue, modèle)", () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it("aucun import de l'Atelier, de son modèle, de l'original de la Planche ni du client d'API", () => {
    for (const f of sources.filter((x) => /\.tsx?$/.test(x))) {
      for (const i of imports(f)) {
        expect(i, f).not.toMatch(/modules\/atelier|@parcours\/atelier-model|@parcours\/planche-model|lib\/api(\/|$)|\/api"/);
        // Seuls chemins relatifs admis hors du dossier : les bibliothèques générales de l'application.
        if (i.startsWith("../") && !i.startsWith("../.")) continue;
        if (i.startsWith("../../") ) expect(i, f).toMatch(/\/lib\/(i18n|local-store)$|\/components\/ChoixLangue$/);
      }
    }
  });

  it("le modèle de la Planche vient du paquet copié, jamais de l'original", () => {
    const uses = sources.filter((f) => /\.tsx?$/.test(f)).flatMap((f) => imports(f)).filter((i) => i.startsWith("@parcours/"));
    expect(new Set(uses)).toEqual(new Set(["@parcours/sandbox-planche-model"]));
  });

  it("stockage propre : préférences, précision et brouillon sous des clés « sandbox »", () => {
    const toutes = sources.filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map(code).join("\n");
    const cles = [...toutes.matchAll(/\bCLE\w*(?::\s*\w+)?\s*=\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]!);
    expect(cles.length).toBeGreaterThan(0);
    for (const c of cles) expect(c, c).toMatch(/sandbox/);
  });

  it("feuille de style isolée : toute règle est limitée à la racine .sandbox-planche", () => {
    const css = code(join(RACINE, "sandbox.css")).replace(/\/\*[\s\S]*?\*\//g, "");
    const selecteurs = [...css.matchAll(/(?:^|[}\n])\s*([^{}@\n][^{}]*)\{/g)].map((m) => m[1]!.trim()).filter((s) => s && !/^\d+%|^(from|to)$/.test(s));
    expect(selecteurs.length).toBeGreaterThan(100);
    for (const s of selecteurs) for (const un of s.split(",")) expect(un.trim(), un).toMatch(/^\.sandbox-planche(?![\w-])/);
  });
});
