/**
 * EX-101 — contrôle des régressions sur un diff réel (lot G4) :
 *
 *   npx tsx apps/api/src/testing/regressions-pertinentes.cli.ts --base origin/main [--tete HEAD] [--executer]
 *
 * Lit les fichiers modifiés entre la base (point de divergence) et la tête, rapproche les zones touchées (Workers,
 * registre, géométrie, projections) de leurs tests pertinents (`scripts/studio-regressions.json`), refuse tout
 * affaiblissement d'assertion dans les tests modifiés (sortie 1), puis, avec `--executer`, lance les tests Vitest
 * pertinents de chaque paquet et `vitest related` sur les sources modifiées (sortie 1 si un test échoue). Les recettes
 * e2e pertinentes sont listées : le job e2e de la CI les joue.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyser, controlerTable, paquetDe, type TableRegressions } from "./regressions-pertinentes.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const base = arg("base") ?? "origin/main";
const tete = arg("tete") ?? "HEAD";
const git = (...a: string[]) => execFileSync("git", a, { cwd: RACINE, encoding: "utf8", maxBuffer: 256 * 2 ** 20, stdio: ["ignore", "pipe", "ignore"] });
const montrer = (rev: string, f: string): string | null => { try { return git("show", `${rev}:${f}`); } catch { return null; } };

const table = JSON.parse(readFileSync(join(RACINE, "scripts/studio-regressions.json"), "utf8")) as TableRegressions;
const fusion = git("merge-base", base, tete).trim();
const fichiers = git("diff", "--name-only", "--no-renames", `${fusion}..${tete}`).split("\n").filter(Boolean);
const diff = git("diff", "-U0", "--no-renames", `${fusion}..${tete}`, "--", "*.test.ts", "*.test.tsx", "*.test.mjs", "apps/web/e2e/*.mjs");
const derogations = git("log", "--format=%B", `${fusion}..${tete}`).split("\n").filter((l) => l.startsWith("Assertion-retiree:"));
const v = analyser(table, fichiers, diff, (f) => montrer(fusion, f), (f) => montrer(tete, f), derogations);
const ci = readFileSync(join(RACINE, ".github/workflows/ci.yml"), "utf8");
const lire = (f: string) => { try { return readFileSync(join(RACINE, f), "utf8"); } catch { return null; } };
const table0 = controlerTable(table, lire, git("ls-files").split("\n").filter(Boolean), ci);

console.log(`Base ${fusion.slice(0, 12)} → ${tete} : ${fichiers.length} fichier(s) modifié(s) ; zones touchées : ${v.zones.join(", ") || "aucune"}.`);
for (const [c, l] of Object.entries(v.pertinents)) if (l.length) console.log(`  ${c} : ${l.join(", ")}`);
for (const a of v.derogations) console.log(`! dérogation (${a.regle}) ${a.fichier} : ${a.detail} — ${a.deroge}`);
for (const a of v.refus) console.log(`✗ ${a.regle} — ${a.fichier} : ${a.detail}`);
for (const p of table0) console.log(`✗ table : ${p.regle} — ${p.detail}`);
let echec = v.refus.length > 0 || table0.length > 0;

if (process.argv.includes("--executer") && !echec) {
  const sources = fichiers.filter((f) => /\.(?:ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
  const paquets = new Set([...Object.keys(v.aExecuter), ...sources.map(paquetDe).filter((p): p is string => p !== null)]);
  for (const p of paquets) {
    const tests = v.aExecuter[p] ?? [];
    const src = sources.filter((f) => f.startsWith(`${p}/`)).map((f) => f.slice(p.length + 1));
    if (tests.length) {
      console.log(`→ ${p} : vitest run ${tests.join(" ")}`);
      echec = spawnSync("npx", ["vitest", "run", ...tests], { cwd: join(RACINE, p), stdio: "inherit" }).status !== 0 || echec;
    }
    if (src.length) {
      console.log(`→ ${p} : vitest related ${src.join(" ")}`);
      echec = spawnSync("npx", ["vitest", "related", "--run", "--passWithNoTests", ...src], { cwd: join(RACINE, p), stdio: "inherit" }).status !== 0 || echec;
    }
  }
  if (v.recettes.length) console.log(`Recettes e2e pertinentes (job e2e de la CI) : ${v.recettes.join(", ")}`);
}
console.log(echec ? "Régressions : refusé" : "Régressions : tests pertinents rattachés, aucune assertion affaiblie");
process.exit(echec ? 1 : 0);
