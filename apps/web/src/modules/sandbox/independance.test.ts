/**
 * Sandbox n'a AUCUNE relation avec la Planche de l'étape 10 : la copie ne lit ni l'Atelier, ni son modèle, ni un serveur,
 * et n'écrit dans aucun stockage de l'Atelier (demande du maître d'ouvrage du 20 octobre 2026).
 *
 * Lot 1 (module autonome, 8ᵉ module) : l'indépendance est BIDIRECTIONNELLE. Le Sandbox n'importe rien du Studio, de
 * l'Atelier, de `@parcours/atelier-model`, de `@parcours/planche-model` ni du client d'API ; aucun fichier du Studio
 * n'importe le module Sandbox — la carte « 00 Sandbox » n'est qu'un lien d'adresse, écrit en toutes lettres.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANCIEN_CHEMIN_SANDBOX, CHEMIN_SANDBOX } from "./routes-sandbox";

const RACINE = dirname(fileURLToPath(import.meta.url));
const STUDIO = resolve(RACINE, "../studio");
const SRC = resolve(RACINE, "../..");
function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}
const sources = fichiers(RACINE).filter((f) => /\.(ts|tsx|css)$/.test(f) && !f.endsWith("independance.test.ts"));
const code = (f: string) => readFileSync(f, "utf8");
const imports = (f: string) => [...code(f).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
/** Chemin, relatif à `src/`, visé par un import relatif ; `null` pour un paquet. */
const cible = (f: string, i: string) => (i.startsWith(".") ? relative(SRC, resolve(dirname(f), i)).split(sep).join("/") : null);
const dansSandbox = (f: string, i: string) => cible(f, i)?.startsWith("modules/sandbox") ?? false;

describe("Sandbox — Planche indépendante de l'étape 10", () => {
  it("la copie existe (outils, vue, modèle)", () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it("aucun import du Studio, de l'Atelier, de son modèle, de l'original de la Planche ni du client d'API", () => {
    for (const f of sources.filter((x) => /\.tsx?$/.test(x))) {
      for (const i of imports(f)) {
        expect(i, f).not.toMatch(/modules\/(atelier|studio)|@parcours\/atelier-model|@parcours\/planche-model|lib\/api(\/|$)|\/api"/);
        // Hors du dossier, seules les bibliothèques générales de l'application sont admises.
        const c = cible(f, i);
        if (c !== null && !dansSandbox(f, i)) expect(c, `${f} → ${i}`).toMatch(/^(lib\/(i18n|local-store)|components\/ChoixLangue)$/);
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

  it("feuilles de style isolées : la Planche sous .sandbox-planche, la page sous .sandbox-page", () => {
    for (const [nom, racine] of [["sandbox.css", "sandbox-planche"], ["page-sandbox.css", "sandbox-page"]] as const) {
      const css = code(join(RACINE, nom)).replace(/\/\*[\s\S]*?\*\//g, "");
      const selecteurs = [...css.matchAll(/(?:^|[}\n])\s*([^{}@\n][^{}]*)\{/g)].map((m) => m[1]!.trim()).filter((s) => s && !/^\d+%|^(from|to)$/.test(s));
      expect(selecteurs.length, nom).toBeGreaterThan(nom === "sandbox.css" ? 100 : 5);
      for (const s of selecteurs) for (const un of s.split(",")) expect(un.trim(), `${nom} : ${un}`).toMatch(new RegExp(`^\\.${racine}(?![\\w-])`));
    }
  });
});

describe("Sandbox — module autonome (lot 1)", () => {
  it("aucun fichier du Studio n'importe le module Sandbox", () => {
    const studio = fichiers(STUDIO).filter((f) => /\.tsx?$/.test(f));
    expect(studio.length).toBeGreaterThan(50);
    for (const f of studio) for (const i of imports(f)) {
      expect(i, f).not.toMatch(/modules\/sandbox/);
      expect(dansSandbox(f, i), `${f} → ${i}`).toBe(false);
    }
  });

  it("la carte « 00 Sandbox » n'est qu'un lien : le Studio écrit l'adresse du Sandbox en toutes lettres", () => {
    expect(CHEMIN_SANDBOX).toBe("/sandbox");
    expect(code(join(STUDIO, "routes-studio.ts"))).toContain(`cheminSandboxStudio = (): string => "${CHEMIN_SANDBOX}"`);
    expect(code(join(STUDIO, "console/cartes.ts"))).toMatch(/chemin: cheminSandboxStudio\(\)/);
  });

  it("l'ancienne adresse de la Console redirige vers le Sandbox, sans charger la Planche dans le Studio", () => {
    expect(ANCIEN_CHEMIN_SANDBOX).toBe("/studio/console/sandbox");
    const shell = code(join(STUDIO, "StudioShell.tsx"));
    expect(shell).toMatch(/route\.vue === "console-sandbox"\) return <Navigate to=\{cheminSandboxStudio\(\)\} replace \/>/);
    expect(fichiers(STUDIO).some((f) => /SandboxPlanche|PageSandbox/.test(code(f)))).toBe(false);
  });
});
