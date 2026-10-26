import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { affaiblissements, analyser, controlerTable, correspond, lireAssertion, lireDiff, testsPertinents, type TableRegressions } from "./regressions-pertinentes.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TABLE = JSON.parse(readFileSync(join(RACINE, "scripts/studio-regressions.json"), "utf8")) as TableRegressions;
const lire = (f: string) => { try { return readFileSync(join(RACINE, f), "utf8"); } catch { return null; } };
// Marques écrites par morceaux : ce fichier ne doit pas lui-même porter de saut.
const SKIP = ["it", "skip"].join(".");
const ONLY = ["describe", "only"].join(".");
const OU_VRAI = ["||", "true"].join(" ");

/** Diff unifié d'un fichier (lignes retirées puis ajoutées). */
const diffDe = (fichier: string, retirees: string[], ajoutees: string[], supprime = false) => [
  `diff --git a/${fichier} b/${fichier}`, ...(supprime ? ["deleted file mode 100644"] : []), `--- a/${fichier}`, `+++ ${supprime ? "/dev/null" : `b/${fichier}`}`, "@@ -1 +1 @@",
  ...retirees.map((l) => `-${l}`), ...ajoutees.map((l) => `+${l}`),
].join("\n");

describe("EX-101 — tests pertinents d'une modification de Worker ou du registre", () => {
  it("motifs de la table : dossier, chemin exact, glob des Workers", () => {
    expect(correspond("apps/web/src/modules/studio/workers/", "apps/web/src/modules/studio/workers/hote-worker.ts")).toBe(true);
    expect(correspond("apps/web/src/modules/studio/**/*.worker.ts", "apps/web/src/modules/studio/exact/noyau-exact.worker.ts")).toBe(true);
    expect(correspond("apps/web/src/modules/studio/**/*.worker.ts", "apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts")).toBe(false);
    expect(correspond("packages/atelier-model/src/studio/registry.ts", "packages/atelier-model/src/studio/registry.test.ts")).toBe(false);
  });

  it("cas positif : modifier un Worker ou le registre exige des tests d'exactitude, d'historique, de permissions, de persistance et de profils", () => {
    const w = testsPertinents(TABLE, ["apps/web/src/modules/studio/workers/hote-worker.ts"]);
    expect(w.zones).toEqual(["workers"]);
    for (const c of ["exactitude", "historique", "permissions", "persistance", "profils"]) expect(w.parCategorie[c]!.length, c).toBeGreaterThan(0);
    expect(w.tous).toContain("apps/web/src/modules/studio/workers/equivalence.test.ts");
    const r = testsPertinents(TABLE, ["packages/atelier-model/src/studio/registre/dessin.ts", "README.md"]);
    expect(r.zones).toEqual(["registre"]);
    expect(r.parCategorie.profils).toContain("packages/atelier-model/src/studio/compatibilite-outils.test.ts");
    expect(testsPertinents(TABLE, ["README.md"]).tous).toEqual([]);
    const v = analyser(TABLE, ["apps/web/src/modules/studio/exact/noyau-exact.worker.ts"], "", () => null, () => null, []);
    expect(v.aExecuter["apps/web"]).toContain("src/modules/studio/exact/booleen-session.test.ts");
    expect(v.aExecuter["apps/api"]).toContain("src/routes/studio-permissions.test.ts");
    expect(v.recettes).toEqual(["apps/web/e2e/studio-persistance.mjs"]);
  });

  it("table contre le dépôt : chaque test listé existe, n'est pas sauté et tourne en CI ; chaque Worker et chaque fichier du registre appartient à une zone", () => {
    const suivis = execFileSync("git", ["ls-files"], { cwd: RACINE, encoding: "utf8" }).split("\n").filter(Boolean);
    const ci = readFileSync(join(RACINE, ".github/workflows/ci.yml"), "utf8");
    expect(controlerTable(TABLE, lire, suivis, ci)).toEqual([]);
    expect(suivis.filter((f) => f.endsWith(".worker.ts") && f.startsWith("apps/web/src/modules/studio/")).length).toBeGreaterThanOrEqual(2);
    // Cas négatifs : un nouveau Worker hors zone, un test listé sauté ou absent, une recette absente de la CI.
    const autre: TableRegressions = JSON.parse(JSON.stringify(TABLE));
    autre.zones.workers!.motifs = ["apps/web/src/modules/studio/workers/"];
    autre.zones.workers!.tests.historique = ["apps/web/src/modules/studio/absent.test.ts", "apps/web/e2e/studio-inconnue.mjs"];
    const faux = (f: string) => (f === "apps/web/src/modules/studio/workers/equivalence.test.ts" ? `${SKIP}("x", () => {})` : lire(f));
    const p = controlerTable(autre, faux, [...suivis, "apps/web/src/modules/studio/nouveau/calcul.worker.ts"], ci);
    expect(p).toEqual(expect.arrayContaining([
      { regle: "test-saute", detail: "apps/web/src/modules/studio/workers/equivalence.test.ts" },
      { regle: "test-absent", detail: "apps/web/src/modules/studio/absent.test.ts" },
      { regle: "test-absent", detail: "apps/web/e2e/studio-inconnue.mjs" },
      { regle: "fichier-hors-zone", detail: "apps/web/src/modules/studio/exact/noyau-exact.worker.ts" },
      { regle: "fichier-hors-zone", detail: "apps/web/src/modules/studio/nouveau/calcul.worker.ts" },
    ]));
  });
});

describe("EX-101 — affaiblissement d'une assertion refusé", () => {
  const F = "apps/web/src/modules/studio/workers/equivalence.test.ts";
  const lignes = (n: number) => Array.from({ length: n }, (_, i) => `expect(a${i}).toBe(${i});`).join("\n");

  it("lecture d'une assertion : sujet, matcher, négation, arguments", () => {
    expect(lireAssertion("    expect(r.ids.join(\"|\"), nom).toEqual([\"a\", \"b\"]);")).toMatchObject({ sujet: "r.ids.join(\"|\"), nom", matcher: "toEqual", nie: false, args: "[\"a\", \"b\"]", force: 5 });
    expect(lireAssertion("expect(x).not.toBeNull()")).toMatchObject({ matcher: "toBeNull", nie: true, force: 1 });
    expect(lireAssertion("const y = 2;")).toBeNull();
  });

  it("cas négatif : matcher strict remplacé par un plus faible sur le même sujet (toEqual → toBeDefined, toBe → toBeTruthy) : refusé", () => {
    const d = lireDiff(diffDe(F, ["  expect(mesh.triangles).toEqual(reference.triangles);", "  expect(v.ok).toBe(true);"], ["  expect(mesh.triangles).toBeDefined();", "  expect(v.ok).toBeTruthy();"]));
    const a = affaiblissements(d, () => lignes(2), () => lignes(2), [F], []);
    expect(a.map((x) => x.regle)).toEqual(["matcher-affaibli", "matcher-affaibli"]);
    expect(a[0]!.detail).toBe("expect(mesh.triangles) : toEqual → toBeDefined");
  });

  it("cas négatif : skip / only ajoutés, condition rendue toujours vraie, précision abaissée, test pertinent supprimé : refusés", () => {
    const d = lireDiff([
      diffDe(F, [], [`${SKIP}("équivalence Worker", () => {`, `${ONLY}("bloc", () => {`]),
      diffDe("apps/web/e2e/studio-exact.mjs", ["check(\"volume\", Math.abs(v - 12) < 1e-9);", "check(\"empreinte\", e === attendu, e);"], [`check("volume", Math.abs(v - 12) < 1e-9 ${OU_VRAI});`, "check(\"empreinte\", true, e);"]),
      diffDe("packages/atelier-model/src/studio/mesh-3d.test.ts", ["expect(volume).toBeCloseTo(12, 9);"], ["expect(volume).toBeCloseTo(12, 2);"]),
      diffDe("apps/web/src/modules/studio/exact/client-exact.test.ts", [], [], true),
    ].join("\n"));
    const a = affaiblissements(d, () => lignes(3), () => lignes(3), ["apps/web/src/modules/studio/exact/client-exact.test.ts"], []);
    expect(a.map((x) => x.regle)).toEqual(["saut-ajoute", "saut-ajoute", "condition-toujours-vraie", "condition-toujours-vraie", "precision-abaissee", "test-pertinent-supprime"]);
    expect(a[3]!.detail).toBe("check(« empreinte ») : e === attendu, e → true");
  });

  it("assertions retirées d'un test : refusé, sauf dérogation écrite dans un commit (rapportée) ; un renforcement passe", () => {
    const d = lireDiff(diffDe(F, ["expect(a2).toBe(2);"], []));
    const refus = affaiblissements(d, () => lignes(3), () => lignes(2), [F], []);
    expect(refus).toEqual([{ regle: "assertions-retirees", fichier: F, detail: "3 → 2 assertion(s)" }]);
    const v = analyser(TABLE, [F], diffDe(F, ["expect(a2).toBe(2);"], []), () => lignes(3), () => lignes(2), [`Assertion-retiree: ${F} — cas fusionné avec le précédent (même oracle)`]);
    expect(v.refus).toEqual([]);
    expect(v.derogations.map((x) => x.deroge)).toEqual(["cas fusionné avec le précédent (même oracle)"]);
    // Dérogation trop vague : sans effet.
    expect(analyser(TABLE, [F], diffDe(F, ["expect(a2).toBe(2);"], []), () => lignes(3), () => lignes(2), [`Assertion-retiree: ${F} — ok`]).refus).toHaveLength(1);
    // Renforcement (toBeDefined → toEqual) et ajout d'assertions : aucun refus.
    const fort = lireDiff(diffDe(F, ["expect(m).toBeDefined();"], ["expect(m).toEqual(ref);", "expect(m.n).toBe(3);"]));
    expect(affaiblissements(fort, () => lignes(1), () => lignes(2), [F], [])).toEqual([]);
    // Nouveau contrôle « l'action a abouti » (check(nom, true) sans contrôle retiré du même nom) : idiome admis.
    const idiome = lireDiff(diffDe("apps/web/e2e/studio-g4.mjs", [], ["check(\"préparation : étude créée\", true);"]));
    expect(affaiblissements(idiome, () => lignes(1), () => lignes(2), [], [])).toEqual([]);
  });

  it("diff réel de la branche courante (si la base main est connue) : aucun affaiblissement d'assertion", { timeout: 180_000 }, () => {
    let base: string | null = null;
    try { base = execFileSync("git", ["merge-base", "HEAD", process.env.STUDIO_REGRESSIONS_BASE ?? "main"], { cwd: RACINE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { base = null; }
    const git = (...a: string[]) => execFileSync("git", a, { cwd: RACINE, encoding: "utf8", maxBuffer: 256 * 2 ** 20, stdio: ["ignore", "pipe", "ignore"] });
    const montrer = (rev: string, f: string) => { try { return git("show", `${rev}:${f}`); } catch { return null; } };
    const fichiers = base ? git("diff", "--name-only", "--no-renames", `${base}..HEAD`).split("\n").filter(Boolean) : [];
    const diff = base ? git("diff", "-U0", "--no-renames", `${base}..HEAD`, "--", "*.test.ts", "*.test.tsx", "*.test.mjs", "apps/web/e2e/*.mjs") : "";
    const derog = base ? git("log", "--format=%B", `${base}..HEAD`).split("\n").filter((l) => l.startsWith("Assertion-retiree:")) : [];
    const v = analyser(TABLE, fichiers, diff, (f) => (base ? montrer(base, f) : null), (f) => montrer("HEAD", f), derog);
    expect(v.refus).toEqual([]);
  });
});
