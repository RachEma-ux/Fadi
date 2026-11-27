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
        // Menu « Sites » (27 novembre 2026) : le module partagé des sites de projet, seul autre client admis (`/sites/api`).
        if (c !== null && !dansSandbox(f, i)) expect(c, `${f} → ${i}`).toMatch(/^(lib\/(i18n|local-store|sites\/menu-sites)|components\/ChoixLangue)$/);
      }
    }
  });

  it("serveur : seul le client des préférences (lot 5) l'appelle, et seulement à /sandbox/preferences (préférences, extensions installées, fichiers archivés)", () => {
    const appels = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource/;
    const appelants = sources.filter((f) => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f) && appels.test(code(f))).map((f) => relative(RACINE, f).split(sep).join("/"));
    // L'isolement des Workers (scripts personnels, extensions) nomme ces fonctions pour les **retirer** : il n'en appelle aucune.
    expect(appelants).toEqual(["planche/consultations-client.ts", "planche/emplacements-geodata.ts", "planche/fonds-client.ts", "planche/isolement-worker.ts", "planche/projections-client.ts", "planche/references-client.ts", "preferences/client.ts"]);
    // Originaux des fonds calés (cas 4, lot C4 ; décision du 27 novembre 2026) : archivés tels quels sous /sandbox/fonds, seule adresse.
    const fonds = code(join(RACINE, "planche/fonds-client.ts"));
    expect(fonds).toContain('export const ADRESSE_FONDS = "/sandbox/fonds";');
    expect([...fonds.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]!.trim())).toEqual(["ADRESSE_FONDS"]);
    expect(fonds).not.toMatch(/https?:\/\//);
    // Références verrouillées (cas 4, lot C4, étape 3) : fichiers rangés et relus sous /sandbox/references, seule adresse.
    const references = code(join(RACINE, "planche/references-client.ts"));
    expect(references).toContain('export const ADRESSE_REFERENCES = "/sandbox/references";');
    expect([...references.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]!.trim())).toEqual(["ADRESSE_REFERENCES", "adresse"]);
    expect(references).not.toMatch(/https?:\/\//);
    // Projection des fichiers KML / KMZ (cas 4, lot C4, étape 7b) : coordonnées envoyées à /sandbox/projections seulement.
    const projections = code(join(RACINE, "planche/projections-client.ts"));
    expect(projections).toContain('export const ADRESSE_PROJECTIONS = "/sandbox/projections";');
    expect([...projections.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]!.trim())).toEqual(["ADRESSE_PROJECTIONS"]);
    expect(projections).not.toMatch(/https?:\/\//);
    // Liens de consultation (cas 4, étape 7d) : copie figée créée, listée, révoquée sous /sandbox/consultations, lue sans
    // compte sous /consultation/api ; ces deux adresses seules, sans adresse absolue.
    const consultations = code(join(RACINE, "planche/consultations-client.ts"));
    expect(consultations).toContain('export const ADRESSE_CONSULTATIONS = "/sandbox/consultations";');
    expect(consultations).toContain('export const ADRESSE_CONSULTATION_PUBLIQUE = "/consultation/api";');
    expect([...consultations.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]!.trim())).toEqual(["adresse"]);
    expect(consultations).not.toMatch(/https?:\/\//);
    // « Emplacements Projets » (27 novembre 2026) : lecture seule des emplacements enregistrés dans GeoData, à cette seule adresse.
    const geodata = code(join(RACINE, "planche/emplacements-geodata.ts"));
    expect(geodata).toContain('export const ADRESSE_EMPLACEMENTS_GEODATA = "/geodata/api/emplacements";');
    expect([...geodata.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]!.trim())).toEqual(["adresse"]);
    expect(geodata).not.toMatch(/https?:\/\/|method:/);
    for (const f of ["planche/scripts-planche.worker.ts", "planche/extension-planche.worker.ts"]) {
      expect(code(join(RACINE, f)), f).toMatch(/for \(const nom of RETIRES\) retirer\(nom\);/);
      expect(code(join(RACINE, f)), f).toMatch(/avantExecution: fermerLecteurs/);
      expect(code(join(RACINE, f)), f).not.toMatch(/https?:\/\/|\bimport\s*\(/);
    }
    const worker = code(join(RACINE, "planche/isolement-worker.ts"));
    const retires = /const RETIRES = \[([\s\S]*?)\] as const;/.exec(worker)?.[1] ?? "";
    for (const nom of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "Worker"]) expect(retires, nom).toContain(`"${nom}"`);
    const horsListe = worker.replace(/const RETIRES = \[[\s\S]*?\] as const;/, "").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(horsListe).not.toMatch(appels);
    expect(horsListe).not.toMatch(/https?:\/\/|\bimport\s*\(/);
    const client = code(join(RACINE, "preferences/client.ts"));
    expect(client).toContain('export const ADRESSE_PREFERENCES = "/sandbox/preferences";');
    expect(client).toContain('export const ADRESSE_EXTENSIONS = "/sandbox/preferences/extensions";');
    // Protocole des extensions 1.2 (27 novembre 2026) : archivage en base des fichiers de données ouverts par une extension.
    expect(client).toContain('export const ADRESSE_FICHIERS = "/sandbox/preferences/fichiers";');
    expect([...client.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]!.trim())).toEqual(["ADRESSE_PREFERENCES", "ADRESSE_EXTENSIONS", "ADRESSE_FICHIERS"]);
    expect(client).not.toMatch(/https?:\/\//);
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

/**
 * Chantier Axes (AX-D2, scénarios AX18 et AX19) : le contexte de travail, les repères enregistrés et l'origine de
 * composant vivent dans le Sandbox seul. Le dessin 2D du Studio reste un document 2D indépendant : il n'importe ni le
 * Sandbox ni son modèle, et ne porte aucun contexte de travail 3D caché.
 */
describe("Axes — frontières (AX18, AX19)", () => {
  const studio = fichiers(STUDIO).filter((f) => /\.tsx?$/.test(f));
  it("aucun fichier du Studio n'importe le modèle du Sandbox (repères, contexte de travail)", () => {
    for (const f of studio) for (const i of imports(f)) expect(i, f).not.toMatch(/@parcours\/sandbox-planche-model|modules\/sandbox/);
  });
  it("le dessin 2D du Studio (planche2d) ne porte ni contexte de travail ni plan de travail 3D", () => {
    const planche2d = studio.filter((f) => f.includes(`${sep}planche2d${sep}`));
    expect(planche2d.length).toBeGreaterThan(0);
    for (const f of planche2d) expect(code(f), f).not.toMatch(/ContexteTravail|repereTravail|planDeTravail|REPERE_DU_MODELE/);
  });
  it("la barre « Axes et repères » est propre au Sandbox (aucune copie dans l'Atelier ni le Studio)", () => {
    const ailleurs = [...studio, ...fichiers(resolve(RACINE, "../atelier")).filter((f) => /\.tsx?$/.test(f))];
    for (const f of ailleurs) expect(code(f), f).not.toMatch(/BarreReperes|PanneauReperes|PanneauOrigineComposant/);
  });
});
